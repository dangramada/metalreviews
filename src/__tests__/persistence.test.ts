// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from '../supabaseClient';
import { upsertWeightsAndStatus } from '../lib/criteria-calibration/persistence';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';
import type { CommitComputation } from '../lib/criteria-calibration/commitComputation';

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
    answerCount: 42,
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

    await upsertWeightsAndStatus('user-1', catalog, computation, 'medium');

    expect(supabase.rpc).toHaveBeenCalledWith('upsert_calibration_status', {
      p_user_id: 'user-1',
      // The tier comes from the CALLER now (degree-tied, 2026-08-18), not from the accuracy
      // value in `computation` — which is 0.9 here, i.e. what the retired thresholds would
      // have called very_high. Passing 'medium' and expecting 'medium' is the assertion that
      // this module no longer derives the tier itself.
      p_tier: 'medium',
      p_accuracy_value: 0.9,
      p_answer_count: 42,
    });
  });

  // Guards the 2026-08-17 migration's contract from the client side: the RPC's stability-window
  // parameters were dropped along with their columns, and Postgres resolves an overload by the
  // argument names PostgREST sends — so a client that still passed p_fired et al. would fail to
  // find a matching function at runtime, not fail loudly at compile time. An exact-payload
  // assertion (above) plus this explicit absence check is what keeps the two ends in step.
  it('sends no stability-window parameters — those columns no longer exist', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'user_criterion_weights') return mockWeightsUpsert() as never;
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never);

    await upsertWeightsAndStatus('user-1', catalog, computation, 'medium');

    const payload = vi.mocked(supabase.rpc).mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      'p_accuracy_value',
      'p_answer_count',
      'p_tier',
      'p_user_id',
    ]);
  });
});
