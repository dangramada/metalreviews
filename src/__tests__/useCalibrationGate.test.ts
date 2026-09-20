// @vitest-environment jsdom
//
// Boundary coverage for hasInsufficientData, raised as a direct question after the Restart
// status-reset fix shipped: once resetCalibrationStatus zeroes user_calibration_status.answer_
// count on Restart, the very next read (before any new answer) sees live count 0 and persisted
// count 0 — `0 < 0` is false, so hasInsufficientData reads false at that exact instant. Is that
// the bug reappearing, or the fix working as designed?
//
// It's the latter, and this file is the empirical check, not just the argument: at persisted
// count 0 right after a real reset, the stored tier ('none', also written by the reset) is NOT
// stale — it correctly describes the current, real zero-answer state. There is no lie left for
// the signal to catch. Showing a score under tier 'none' is the pre-existing, already-shipped
// soft-gate behavior (album-rating-soft-gate.md, 2026-08-09) — not something this feature was
// ever meant to suppress. The signal exists to catch PERSISTED > LIVE (a stale answer_count
// left over from before a reset that never happened, or never fully caught up), which is a
// strictly different condition than "both are freshly zero".
//
// This also demonstrates why `<=` would be a regression, not a tightening: a genuine brand-new
// account (never calibrated, never restarted) has no status row at all, which the hook defaults
// to answer_count 0, and 0 live answers — the same (0, 0) pair a just-reset account has. `<=`
// would flag every brand-new user as "insufficient data" and show them a banner claiming their
// calibration was restarted, which for them is false. `<` is what keeps those two states apart.
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

  it('reads false immediately after a real Restart reset (persisted 0, live 0) — the tier is not stale, it is honest', async () => {
    mockTables({ statusAnswerCount: 0, statusTier: 'none', liveAnswerCount: 0 });
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasInsufficientData).toBe(false);
    expect(result.current.tier).toBe('none');
  });

  it('reads false for a genuine brand-new account (no status row at all, 0 live answers)', async () => {
    mockTables({ hasStatusRow: false, liveAnswerCount: 0, hasWeights: false });
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasInsufficientData).toBe(false);
  });

  it('reads true when the reset did NOT happen — the original bug this fix closed', async () => {
    // Restart cleared the answer log (live 0) but the status row is still the pre-restart
    // session's value — exactly the pre-fix failure mode.
    mockTables({ statusAnswerCount: 33, statusTier: 'very_high', liveAnswerCount: 0 });
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasInsufficientData).toBe(true);
  });

  it('reads false the instant a post-restart session catches up answer-for-answer (no lag once reset)', async () => {
    // Once the reset lands, every subsequent guarded write starts from 0 and increments in
    // lockstep with the live log — persisted never gets a chance to fall behind again in
    // normal (non-Undo) play.
    mockTables({ statusAnswerCount: 5, statusTier: 'none', liveAnswerCount: 5 });
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasInsufficientData).toBe(false);
  });
});
