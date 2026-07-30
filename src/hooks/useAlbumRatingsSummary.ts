import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import { getReleaseYear } from '../App';
import { computeScore, rankAlbum } from '../lib/album-rating/scoreAndRank';

const CRITERIA_COUNT = 6;

export interface AlbumRatingSummary {
  score: number;
  rank: number;
}

type RatingRow = { album_id: string; criterion_id: number; level: number };
type WeightRow = { criterion_id: number; level: number; value: number };
type AlbumRow = { id: string; release_date: string | null };

// Fetches every fully-rated album for the current user and computes each one's score and its
// rank within its release year (part 6, Part C). Called once in FavoritesPage — not per card
// — and shared across all FavoriteListItemRow instances via a prop, so that editing one
// album's rating recomputes every other album's displayed rank in the same render pass
// rather than leaving other cards stale until a reload. See
// docs/decisions/album-rating-drawer.md, "Rank recalculation scope".
export function useAlbumRatingsSummary() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Map<string, AlbumRatingSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user) {
        setSummary(new Map());
        setLoading(false);
        return;
      }
      setLoading(true);

      const [{ data: ratingRows }, { data: weightRows }] = await Promise.all([
        supabase.from('album_criteria_ratings').select('album_id, criterion_id, level'),
        supabase.from('user_criterion_weights').select('criterion_id, level, value'),
      ]);
      if (cancelled) return;

      const ratingsByAlbum = new Map<string, RatingRow[]>();
      for (const row of (ratingRows ?? []) as RatingRow[]) {
        const list = ratingsByAlbum.get(row.album_id) ?? [];
        list.push(row);
        ratingsByAlbum.set(row.album_id, list);
      }

      // Only fully-rated albums (all 6 criteria set) count as evaluated.
      const fullyRatedAlbumIds = Array.from(ratingsByAlbum.entries())
        .filter(([, rows]) => rows.length === CRITERIA_COUNT)
        .map(([albumId]) => albumId);

      if (fullyRatedAlbumIds.length === 0) {
        setSummary(new Map());
        setLoading(false);
        return;
      }

      const { data: albumRows } = await supabase
        .from('albums')
        .select('id, release_date')
        .in('id', fullyRatedAlbumIds);
      if (cancelled) return;

      const weights = ((weightRows ?? []) as WeightRow[]).map((w) => ({
        criterionId: w.criterion_id,
        level: w.level,
        value: w.value,
      }));

      const yearByAlbum = new Map<string, number | null>();
      for (const a of (albumRows ?? []) as AlbumRow[]) {
        yearByAlbum.set(a.id, getReleaseYear(a.release_date));
      }

      // Score every fully-rated album; skip any whose score can't be computed (missing
      // weight — defensive, not expected under Medium tier).
      const scoredByYear = new Map<number | null, { albumId: string; score: number }[]>();
      const scoreByAlbum = new Map<string, number>();
      for (const albumId of fullyRatedAlbumIds) {
        const ratings = ratingsByAlbum.get(albumId)!.map((r) => ({
          criterionId: r.criterion_id,
          level: r.level,
        }));
        const score = computeScore(ratings, weights);
        if (score === null) continue;
        scoreByAlbum.set(albumId, score);
        const year = yearByAlbum.get(albumId) ?? null;
        const list = scoredByYear.get(year) ?? [];
        list.push({ albumId, score });
        scoredByYear.set(year, list);
      }

      const next = new Map<string, AlbumRatingSummary>();
      for (const [albumId, score] of scoreByAlbum) {
        const year = yearByAlbum.get(albumId) ?? null;
        const yearGroup = scoredByYear.get(year) ?? [];
        next.set(albumId, { score, rank: rankAlbum(albumId, yearGroup) });
      }

      setSummary(next);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [user, refreshKey]);

  const refetch = () => setRefreshKey((k) => k + 1);

  return { summary, loading, refetch };
}
