import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { RANKING_TEST_SET } from '../lib/criteria-calibration/rankingTestSet';
import type { CriterionLevelRating } from '../lib/album-rating/scoreAndRank';

const CRITERIA_COUNT = 6;
const RANKING_TEST_SET_IDS = RANKING_TEST_SET.map((a) => a.albumId);

type RatingRow = { album_id: string; criterion_id: number; level: number };

/**
 * One-time fetch (Brief 3) of RANKING_TEST_SET's 13 albums' criteria ratings, feeding
 * rankingStabilitySignal.ts's computeTop10Set. Fetched once on page load, not per commit —
 * these 13 albums' ratings don't change mid-session (they're Dan's own already-rated
 * albums, frozen as a reference set — see rankingTestSet.ts's header). Scoped to the fixed
 * RANKING_TEST_SET ids via `.in(...)`, unlike useAlbumRatingsSummary.ts's unscoped
 * "every album the current user has rated" query.
 *
 * Only fully-rated albums (all 6 criteria) are included — same convention as
 * useAlbumRatingsSummary.ts's `fullyRatedAlbumIds` filter: a partially-rated album would
 * otherwise silently under-score in computeTop10Set (computeScore only sums the ratings it's
 * given, so a missing criterion isn't "unknown", it's treated as contributing nothing).
 * RANKING_TEST_SET's header already documents these as fully-rated at the time the set was
 * frozen, so this filter is defensive, not expected to exclude anything in practice.
 */
export function useRankingTestSetRatings() {
  const [ratingsByAlbum, setRatingsByAlbum] = useState<Map<string, CriterionLevelRating[]> | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('album_criteria_ratings')
        .select('album_id, criterion_id, level')
        .in('album_id', RANKING_TEST_SET_IDS);
      if (cancelled) return;

      if (error) {
        console.warn('Failed to load ranking-test-set ratings', error);
        setLoading(false);
        return;
      }

      const byAlbum = new Map<string, RatingRow[]>();
      for (const row of (data ?? []) as RatingRow[]) {
        const list = byAlbum.get(row.album_id) ?? [];
        list.push(row);
        byAlbum.set(row.album_id, list);
      }

      const result = new Map<string, CriterionLevelRating[]>();
      for (const [albumId, rows] of byAlbum) {
        if (rows.length !== CRITERIA_COUNT) continue; // partially-rated — exclude, see header
        result.set(
          albumId,
          rows.map((r) => ({ criterionId: r.criterion_id, level: r.level }))
        );
      }

      setRatingsByAlbum(result);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { ratingsByAlbum, loading };
}
