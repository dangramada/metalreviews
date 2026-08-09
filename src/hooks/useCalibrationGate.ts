import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

export type CalibrationTier = 'none' | 'medium' | 'high' | 'very_high';

// Display labels for the rating page's score-confidence indicator (album-rating-soft-gate).
// Reuses the same tier already computed and stored server-side by
// persistence.ts's computeTier — no separate accuracy scale, just a label for the existing
// one. 'none' reads as "Low" here rather than "None": the user has a score on screen, so
// "no confidence" would read as broken rather than as "not yet calibrated".
const CONFIDENCE_LABELS: Record<CalibrationTier, string> = {
  none: 'Low',
  medium: 'Medium',
  high: 'High',
  very_high: 'Very High',
};

export function confidenceLabel(tier: CalibrationTier): string {
  return CONFIDENCE_LABELS[tier];
}

// Fetches the current user's user_calibration_status row (mirrors useFavoritesList.ts's fetch
// convention). No row yet (never started calibration) is treated the same as tier === 'none'
// — both surface the same low-confidence badge/nudge (album-rating-soft-gate).
export function useCalibrationGate() {
  const { user } = useAuth();
  const [tier, setTier] = useState<CalibrationTier>('none');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) {
        setTier('none');
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from('user_calibration_status')
        .select('tier')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setTier((data?.tier as CalibrationTier | undefined) ?? 'none');
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { tier, loading };
}
