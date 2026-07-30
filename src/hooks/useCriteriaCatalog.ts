import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  buildCriteriaCatalog,
  type CriteriaCatalog,
  type RawCriterionRow,
} from '../lib/criteria-calibration/criteriaCatalog';

// Public reference data only (criteria/criteria_levels — see supabase/criteria.sql: "Anyone
// can read", no per-user state). Mirrors useFavoritesList.ts's fetch convention: plain
// useEffect + useState, one embedded select, no caching layer beyond this component's
// lifetime — consistent with this pass having no persistence beyond a page refresh.
const CRITERIA_SELECT = 'id, name, display_order, criteria_levels(level, label, description)';

export function useCriteriaCatalog() {
  const [catalog, setCatalog] = useState<CriteriaCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('criteria')
          .select(CRITERIA_SELECT)
          .order('display_order');

        if (cancelled) return;
        if (fetchError) {
          setError('Failed to load criteria');
          setLoading(false);
          return;
        }

        setCatalog(buildCriteriaCatalog((data ?? []) as unknown as RawCriterionRow[]));
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.warn('Failed to load criteria catalog', e);
        setError('Failed to load criteria');
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { catalog, loading, error };
}
