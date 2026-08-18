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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) {
        setTier('none');
        setHasWeights(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      const [status, weights] = await Promise.all([
        supabase
          .from('user_calibration_status')
          .select('tier')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_criterion_weights')
          .select('criterion_id')
          .eq('user_id', user.id)
          .limit(1),
      ]);
      if (cancelled) return;
      setTier((status.data?.tier as CalibrationTier | undefined) ?? 'none');
      setHasWeights((weights.data ?? []).length > 0);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { tier, hasWeights, loading };
}
