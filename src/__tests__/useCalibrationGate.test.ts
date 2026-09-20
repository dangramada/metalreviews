// @vitest-environment jsdom
//
// Boundary coverage for hasInsufficientData at (persisted 0, live 0) — the exact state right
// after a Restart that reset correctly.
//
// FIRST PASS AT THIS GOT IT BACKWARDS. `live < persisted` alone reads `0 < 0 = false` at this
// boundary, and it's tempting to conclude that's correct because the persisted tier ('none',
// also written by the reset) genuinely isn't lying at that instant. But live-testing on the QA
// account (dgramada07@gmail.com) showed real percentages (87%, 64%) rendering under that
// "honest none" label immediately post-Restart, computed live off the flat zero-answer ramp
// weights against each album's already-recorded criteria ratings — not stale, but not
// meaningful either. The staleness check alone can't see that: it only knows about the TIER's
// honesty, not about whether the WEIGHTS behind the displayed number represent any real
// comparison at all.
//
// The fix adds a second, independent condition: `weightsPresent && liveAnswerCount === 0`.
// Whenever live count is exactly 0 and weight rows exist at all, those rows are GUARANTEED to
// be the flat, information-free ramp — the only write path that can leave weights sitting at 0
// answers is Restart's own unconditional overwrite (see persistence.ts's
// upsertWeightsAndStatus / resetCalibrationStatus). `weightsPresent` is what keeps a genuine
// brand-new account (no weight rows at all, separately hard-gated) from tripping the
// Restart-specific banner it never earned — see the second test below.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCalibrationGate } from '../hooks/useCalibrationGate';

vi.mock('../supabaseClient', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('../AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

function mockTables(opts: {
  statusAnswerCount?: number;
  statusTier?: string;
  hasStatusRow?: boolean;
  liveAnswerCount: number;
  hasWeights?: boolean;
}) {
  const {
    statusAnswerCount = 0,
    statusTier = 'none',
    hasStatusRow = true,
    liveAnswerCount,
    hasWeights = true,
  } = opts;

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'user_calibration_status') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: hasStatusRow ? { tier: statusTier, answer_count: statusAnswerCount } : null,
              error: null,
            }),
          }),
        }),
      } as never;
    }
    if (table === 'user_criterion_weights') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: hasWeights ? [{ criterion_id: 0 }] : [],
              error: null,
            }),
          }),
        }),
      } as never;
    }
    if (table === 'user_calibration_answers') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ count: liveAnswerCount, error: null }),
        }),
      } as never;
    }
    throw new Error(`unexpected table ${table}`);
  });
}

describe('useCalibrationGate — hasInsufficientData boundary', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      loading: false,
    } as ReturnType<typeof useAuth>);
  });

  it('reads TRUE immediately after a real Restart reset (persisted 0, live 0, weights present) — the weights are still the flat zero-answer ramp', async () => {
    mockTables({ statusAnswerCount: 0, statusTier: 'none', liveAnswerCount: 0, hasWeights: true });
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasInsufficientData).toBe(true);
    expect(result.current.tier).toBe('none');
  });

  it('reads false for a genuine brand-new account (no status row, no weight rows, 0 live answers)', async () => {
    // Distinguishes "never calibrated" from "just reset": both hit live count 0, but only a
    // just-reset account has weight rows at all (a brand-new one is hard-gated on hasWeights
    // before ever reaching a surface this hook feeds).
    mockTables({ hasStatusRow: false, liveAnswerCount: 0, hasWeights: false });
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasInsufficientData).toBe(false);
  });

  it('reads true when the reset did NOT happen — the original bug this fix closed', async () => {
    // Restart cleared the answer log (live 0) but the status row is still the pre-restart
    // session's value — exactly the pre-fix failure mode. Caught by the `live === 0` half
    // regardless of what persisted says here, but also by `live < persisted`.
    mockTables({ statusAnswerCount: 33, statusTier: 'very_high', liveAnswerCount: 0 });
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasInsufficientData).toBe(true);
  });

  it('reads false once a post-restart session has answered at least once and stays caught up', async () => {
    // Once live count is above 0 and matches persisted, both conditions are false — the
    // ordinary healthy mid-session state.
    mockTables({ statusAnswerCount: 5, statusTier: 'none', liveAnswerCount: 5 });
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasInsufficientData).toBe(false);
  });

  it('reads true when Undo drops the live count behind the still-guarded persisted count', async () => {
    mockTables({ statusAnswerCount: 5, statusTier: 'medium', liveAnswerCount: 4 });
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasInsufficientData).toBe(true);
  });
});
