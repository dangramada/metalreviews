import { useEffect, useState } from 'react';
import { fetchPersistedAnswers } from '../lib/criteria-calibration/persistence';
import type { ComparisonResult, Profile } from '../lib/criteria-calibration/preferenceGraph';

// Degree always starts at 2 (Medium tier's prerequisite) when there's no prior session to
// resume — mirrors CriteriaCalibrationPage.tsx's STARTING_DEGREE from part 5a.
const STARTING_DEGREE = 2;

export interface ResumedAnswer {
  // Stable, client-side id — NOT the DB row id — used to correlate an in-flight insert (or
  // a resumed row) with the entry currently in React state, so an undo that races an
  // in-flight insert can be detected and the orphaned row cleaned up. See
  // CriteriaCalibrationPage.tsx's persistNewAnswer.
  localId: string;
  dbId: string;
  profileA: Profile;
  profileB: Profile;
  result: ComparisonResult;
}

export function useCalibrationResume(userId: string | undefined) {
  const [answers, setAnswers] = useState<ResumedAnswer[]>([]);
  const [degree, setDegree] = useState(STARTING_DEGREE);
  // Nothing beyond the answer log needs fetching to resume. Brief 3's stability window used
  // to be fetched alongside it here because it was path-dependent — it needed the trajectory
  // of past checkpoints, not just the current state. The tiered-checkpoint flow that replaced
  // it (2026-08-17) derives everything from the answer log alone: accuracy, tier and degree
  // are all pure functions of `answers`, so a resume needs no second source of truth.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchPersistedAnswers(userId!);
        if (cancelled) return;

        const resumed: ResumedAnswer[] = rows.map((row) => ({
          localId: crypto.randomUUID(),
          dbId: row.id,
          profileA: row.profileA,
          profileB: row.profileB,
          result: row.result,
        }));

        const maxDegree = resumed.reduce(
          (max, a) => Math.max(max, Object.keys(a.profileA).length),
          STARTING_DEGREE
        );

        setAnswers(resumed);
        setDegree(maxDegree);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.warn('Failed to resume calibration progress', e);
        setError('Failed to load your saved progress');
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { answers, degree, loading, error };
}
