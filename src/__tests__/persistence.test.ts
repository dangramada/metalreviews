// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '../supabaseClient';
import {
  fetchPersistedStabilityWindow,
  upsertWeightsAndStatus,
} from '../lib/criteria-calibration/persistence';
import {
  INITIAL_STABILITY_WINDOW_STATE,
  INITIAL_PERSISTED_STABILITY_WINDOW,
} from '../lib/criteria-calibration/rankingStabilitySignal';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';
import type { CommitComputation } from '../lib/criteria-calibration/commitComputation';

describe('fetchPersistedStabilityWindow', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeStatusFromImpl(row: Record<string, unknown> | null) {
    return (table: string) => {
      if (table !== 'user_calibration_status') throw new Error(`unexpected table ${table}`);
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
      };
    };
  }

  it('returns INITIAL_PERSISTED_STABILITY_WINDOW when no row exists yet', async () => {
    vi.mocked(supabase.from).mockImplementation(makeStatusFromImpl(null));
    const state = await fetchPersistedStabilityWindow('user-1');
    expect(state).toEqual(INITIAL_PERSISTED_STABILITY_WINDOW);
  });

  it('parses a real row back into current/previous/lastCommitChangedWindow, converting jsonb arrays to Sets', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeStatusFromImpl({
        last_eligible_top10: ['album-a', 'album-b'],
        consecutive_match_run: 2,
        fired: true,
        previous_last_eligible_top10: ['album-a'],
        previous_consecutive_match_run: 1,
        previous_fired: false,
        last_commit_changed_window: true,
      })
    );
    const state = await fetchPersistedStabilityWindow('user-1');
    expect(state).toEqual({
      current: {
        lastEligibleTop10: new Set(['album-a', 'album-b']),
        consecutiveMatchRun: 2,
        fired: true,
      },
      previous: {
        lastEligibleTop10: new Set(['album-a']),
        consecutiveMatchRun: 1,
        fired: false,
      },
      lastCommitChangedWindow: true,
    });
  });

  it('treats a null last_eligible_top10/previous_last_eligible_top10 as null, not an empty set', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeStatusFromImpl({
        last_eligible_top10: null,
        consecutive_match_run: 0,
        fired: false,
        previous_last_eligible_top10: null,
        previous_consecutive_match_run: 0,
        previous_fired: false,
        last_commit_changed_window: false,
      })
    );
    const state = await fetchPersistedStabilityWindow('user-1');
    expect(state.current.lastEligibleTop10).toBeNull();
    expect(state.previous.lastEligibleTop10).toBeNull();
  });
});

describe('upsertWeightsAndStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  const catalog: CriteriaCatalog = {
    entries: [{ index: 0, name: 'Test criterion', levels: { 1: 'a', 2: 'b' } }],
    levelsPerCriterion: [2],
  } as unknown as CriteriaCatalog;

  const computation: CommitComputation = {
    solved: {
      levelsPerCriterion: [2],
      values: [
        [
          { point: 0, min: 0, max: 0 },
          { point: 0, min: 0, max: 0 },
          { point: 1, min: 1, max: 1 },
        ],
      ],
      totalSlack: 0,
      perAnswerSlack: [],
    },
    accuracy: 0.9,
    mediumReached: true,
  } as unknown as CommitComputation;

  function mockWeightsUpsert() {
    return {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
  }

  it('writes weights via .from(...).upsert() and status via the upsert_calibration_status RPC, not a plain table upsert', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_criterion_weights') return mockWeightsUpsert() as never;
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);

    const windowUpdate = {
      current: {
        lastEligibleTop10: new Set(['album-a', 'album-b']),
        consecutiveMatchRun: 2,
        fired: true,
      },
      previous: { lastEligibleTop10: new Set(['album-a']), consecutiveMatchRun: 1, fired: false },
      lastCommitChangedWindow: true,
    };

    await upsertWeightsAndStatus('user-1', catalog, computation, windowUpdate);

    expect(supabase.rpc).toHaveBeenCalledWith('upsert_calibration_status', {
      p_user_id: 'user-1',
      p_tier: 'very_high', // accuracy 0.9 >= SCORE_SPREAD_VERY_HIGH_THRESHOLD (0.85)
      p_accuracy_value: 0.9,
      p_last_eligible_top10: ['album-a', 'album-b'],
      p_consecutive_match_run: 2,
      p_fired: true,
      p_previous_last_eligible_top10: ['album-a'],
      p_previous_consecutive_match_run: 1,
      p_previous_fired: false,
      p_last_commit_changed_window: true,
    });
  });

  it('passes null for both top10 fields when no eligible checkpoint has been seen yet', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_criterion_weights') return mockWeightsUpsert() as never;
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);

    await upsertWeightsAndStatus(
      'user-1',
      catalog,
      computation,
      INITIAL_PERSISTED_STABILITY_WINDOW
    );

    expect(supabase.rpc).toHaveBeenCalledWith(
      'upsert_calibration_status',
      expect.objectContaining({
        p_last_eligible_top10: null,
        p_consecutive_match_run: 0,
        p_fired: false,
        p_previous_last_eligible_top10: null,
        p_previous_consecutive_match_run: 0,
        p_previous_fired: false,
        p_last_commit_changed_window: false,
      })
    );
  });

  it('defaults to the empty persisted window when the caller omits it (pre-wiring call site)', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_criterion_weights') return mockWeightsUpsert() as never;
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);

    await upsertWeightsAndStatus('user-1', catalog, computation);

    expect(supabase.rpc).toHaveBeenCalledWith(
      'upsert_calibration_status',
      expect.objectContaining({
        p_last_eligible_top10: null,
        p_fired: false,
        p_previous_fired: false,
        p_last_commit_changed_window: false,
      })
    );
  });
});

// Sanity: INITIAL_STABILITY_WINDOW_STATE is still exported and used to build
// INITIAL_PERSISTED_STABILITY_WINDOW's current/previous fields.
describe('INITIAL_PERSISTED_STABILITY_WINDOW', () => {
  it('is built from INITIAL_STABILITY_WINDOW_STATE for both current and previous', () => {
    expect(INITIAL_PERSISTED_STABILITY_WINDOW.current).toEqual(INITIAL_STABILITY_WINDOW_STATE);
    expect(INITIAL_PERSISTED_STABILITY_WINDOW.previous).toEqual(INITIAL_STABILITY_WINDOW_STATE);
    expect(INITIAL_PERSISTED_STABILITY_WINDOW.lastCommitChangedWindow).toBe(false);
  });
});
