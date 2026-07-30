import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

export type CalibrationTier = 'none' | 'medium' | 'high' | 'very_high';

// Fetches the current user's user_calibration_status row (mirrors useFavoritesList.ts's fetch
// convention). No row yet (never started calibration) is treated the same as tier === 'none'
// — both fail the gate for the rating drawer (part 6, Part A).
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

  const passed = tier !== 'none';

  return { tier, passed, loading };
}
