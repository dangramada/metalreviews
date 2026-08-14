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
  fetchStabilityWindowState,
  upsertWeightsAndStatus,
} from '../lib/criteria-calibration/persistence';
import { INITIAL_STABILITY_WINDOW_STATE } from '../lib/criteria-calibration/rankingStabilitySignal';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';
import type { CommitComputation } from '../lib/criteria-calibration/commitComputation';

describe('fetchStabilityWindowState', () => {
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

  it('returns INITIAL_STABILITY_WINDOW_STATE when no row exists yet', async () => {
    vi.mocked(supabase.from).mockImplementation(makeStatusFromImpl(null));
    const state = await fetchStabilityWindowState('user-1');
    expect(state).toEqual(INITIAL_STABILITY_WINDOW_STATE);
  });

  it('parses a real row back into StabilityWindowState, converting the jsonb array to a Set', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeStatusFromImpl({
        last_eligible_top10: ['album-a', 'album-b'],
        consecutive_match_run: 1,
        fired: false,
      })
    );
    const state = await fetchStabilityWindowState('user-1');
    expect(state).toEqual({
      lastEligibleTop10: new Set(['album-a', 'album-b']),
      consecutiveMatchRun: 1,
      fired: false,
    });
  });

  it('treats a null last_eligible_top10 (pre-first-eligible-checkpoint) as null, not an empty set', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeStatusFromImpl({ last_eligible_top10: null, consecutive_match_run: 0, fired: false })
    );
    const state = await fetchStabilityWindowState('user-1');
    expect(state.lastEligibleTop10).toBeNull();
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

    const stabilityWindow = {
      lastEligibleTop10: new Set(['album-a', 'album-b']),
      consecutiveMatchRun: 2,
      fired: true,
    };

    await upsertWeightsAndStatus('user-1', catalog, computation, stabilityWindow);

    expect(supabase.rpc).toHaveBeenCalledWith('upsert_calibration_status', {
      p_user_id: 'user-1',
      p_tier: 'very_high', // accuracy 0.9 >= SCORE_SPREAD_VERY_HIGH_THRESHOLD (0.85)
      p_accuracy_value: 0.9,
      p_last_eligible_top10: ['album-a', 'album-b'],
      p_consecutive_match_run: 2,
      p_fired: true,
    });
  });

  it('passes null for p_last_eligible_top10 when no eligible checkpoint has been seen yet', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_criterion_weights') return mockWeightsUpsert() as never;
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);

    await upsertWeightsAndStatus('user-1', catalog, computation, INITIAL_STABILITY_WINDOW_STATE);

    expect(supabase.rpc).toHaveBeenCalledWith(
      'upsert_calibration_status',
      expect.objectContaining({
        p_last_eligible_top10: null,
        p_consecutive_match_run: 0,
        p_fired: false,
      })
    );
  });

  it('defaults to the empty stability window when the caller omits it (pre-wiring call site)', async () => {
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
        p_consecutive_match_run: 0,
        p_fired: false,
      })
    );
  });
});
