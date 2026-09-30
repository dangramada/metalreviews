import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import { ACCURACY_TIER_LABELS } from '../lib/criteria-calibration/accuracyTierLabels';

export type CalibrationTier = 'none' | 'medium' | 'high' | 'very_high';

// Display labels for the rating page's score-confidence indicator (album-rating-soft-gate).
// Reads accuracyTierLabels.ts rather than keeping its own copy — as of 2026-08-18 that module
// is the single source for these four strings, so the album pages and the calibration page can
// never disagree about what a tier is called. The only translation here is the database's
// snake_case spelling of the top tier.
const DB_TIER_TO_APP_TIER = {
  none: 'none',
  medium: 'medium',
  high: 'high',
  very_high: 'veryHigh',
} as const;

export function confidenceLabel(tier: CalibrationTier): string {
  return ACCURACY_TIER_LABELS[DB_TIER_TO_APP_TIER[tier]];
}

// Fetches the current user's user_calibration_status row (mirrors useFavoritesList.ts's fetch
// convention). No row yet (never started calibration) is treated the same as tier === 'none'
// — both surface the same low-confidence badge/nudge (album-rating-soft-gate).
export function useCalibrationGate() {
  const { user } = useAuth();
  const [tier, setTier] = useState<CalibrationTier>('none');
  // Separate from `tier` deliberately, and as of 2026-08-18 the ONLY thing the soft gate reads.
  // The gate used to fire on `tier === 'none'`, which was a workable proxy while tiers were
  // accuracy thresholds — essentially every session left 'none' within a handful of answers.
  // Degree-tied tiers broke that proxy: 'none' now means "has not finished degree 2", which for
  // some preference shapes never happens at all (deferred-work.md), so the nudge would follow a
  // user who has answered ninety questions. What the gate actually wants to know is whether
  // there is a calibrated model to score with, and weight rows exist from the first commit.
  const [hasWeights, setHasWeights] = useState(false);
  // Insufficient data: either the persisted tier/accuracy describes a session that no longer
  // exists, OR the account is sitting at a live answer count of exactly 0 while weight rows
  // exist at all — which can only mean the weights are the flat, zero-answer solve a Restart
  // (or the account's very first commit, but that path never leaves weights sitting at 0
  // answers with nothing following) unconditionally writes, never a real personalized model.
  //
  // THE `=== 0` HALF IS LOAD-BEARING, NOT A NICETY: right after a Restart that worked
  // correctly (persisted answer_count reset to 0 alongside live count 0), `live < persisted`
  // alone reads `0 < 0` = false — the persisted tier ('none') genuinely isn't lying at that
  // instant, so the STALENESS check has nothing to catch. But the weights are still the
  // information-free uniform ramp (see resetCalibrationStatus's own comment on why
  // user_criterion_weights and user_calibration_status both land at "zero answers" together
  // on Restart), and any album with existing per-album criteria ratings will still produce a
  // real-looking percentage from it — this is Dan's live-caught bug, initially missed because
  // "tier is honest, so it isn't insufficient" was the wrong question: the question is whether
  // there is any real comparison behind the number on screen, and at live count 0 there never
  // is, tier label notwithstanding. `hasWeights` gates this half so a genuinely brand-new
  // account (no weight rows at all, hard-gated separately) doesn't trip the Restart-specific
  // banner copy it never earned.
  //
  // Restart deletes every user_calibration_answers row and touches nothing else, while
  // upsert_calibration_status only adopts an incoming tier when its answer_count is >= the
  // stored one. So after a Restart whose own status write is rejected (see
  // resetCalibrationStatus for why that no longer happens, but the guard itself is unchanged)
  // the tier stays frozen at the old session's value for as many answers as the old session
  // had, while user_criterion_weights (unguarded, overwritten unconditionally on the very
  // first post-Restart render) already holds the same zero-answer solve. That window is
  // `live count < stored answer_count`, confirmed live in
  // docs/decisions/criteria-calibration/criteria-calibration-restart-stale-state-diagnostic.md
  // (Scenarios 2-4, including Undo and a boundary promotion, all of which lose the guard race
  // identically) — this is the second half of the condition below, still needed for the
  // in-progress catch-up window and for Undo dropping the live count without a matching status
  // write (same diagnostic, Scenario 3).
  //
  // WHY NOT recompute degree-2 coverage live from the answer log, as the brief first proposed:
  // isDegreeCoverageComplete takes the LP's solved values, not just touch counts, so an honest
  // live read costs a full answer fetch plus a solveValues() on every Album Evaluation and
  // Favorites mount — the same solve that caused the round-50 UI blocking (commitComputation.ts)
  // and carries the near-singular crash history. It would also be equivalent to `tier === 'none'`
  // in normal operation, which would strip the score from every pre-degree-2 user and
  // permanently trap the four preference shapes that never exhaust degree 2 (degreeTiers.ts),
  // reversing album-rating-soft-gate. This narrower signal fixes the contradiction the tier is
  // actually lying about and leaves the soft gate alone.
  const [hasInsufficientData, setHasInsufficientData] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) {
        setTier('none');
        setHasWeights(false);
        setHasInsufficientData(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const [status, weights, answers] = await Promise.all([
        supabase
          .from('user_calibration_status')
          .select('tier, answer_count')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_criterion_weights')
          .select('criterion_id')
          .eq('user_id', user.id)
          .limit(1),
        // The live length of the answer log. Restart (deleteAllAnswers) empties this table and
        // touches nothing else, so this is the one number that always reflects reality — the
        // raw log is never guarded or delayed.
        supabase
          .from('user_calibration_answers')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ]);
      if (cancelled) return;
      const weightsPresent = (weights.data ?? []).length > 0;
      const liveAnswerCount = answers.count ?? 0;
      const persistedAnswerCount = (status.data?.answer_count as number | undefined) ?? 0;
      setTier((status.data?.tier as CalibrationTier | undefined) ?? 'none');
      setHasWeights(weightsPresent);
      setHasInsufficientData(
        weightsPresent && (liveAnswerCount === 0 || liveAnswerCount < persistedAnswerCount)
      );
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { tier, hasWeights, hasInsufficientData, loading };
}
