import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { DbRow } from '../dbMapping';

export interface FavoriteListItem {
  id: string;
  type: 'review' | 'manual';
  band: string;
  album: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  genre: string[];
  // ISO date string from published_at; null for manual items.
  // Used as a year fallback when releaseDate is null for review-sourced items.
  publishedAt: string | null;
}

type ManualAlbumRow = {
  id: string;
  user_id: string;
  band: string;
  album: string;
  artwork_url: string | null;
  genre: string[] | null;
  release_date: string | null;
};

async function fetchManualAlbums(): Promise<FavoriteListItem[]> {
  const { data, error } = await supabase.from('manual_albums').select('*');
  if (error) throw error;
  return (data ?? []).map((row: ManualAlbumRow) => ({
    id: row.id,
    type: 'manual' as const,
    band: row.band,
    album: row.album,
    artworkUrl: row.artwork_url ?? null,
    releaseDate: row.release_date ?? null,
    genre: row.genre ?? [],
    publishedAt: null,
  }));
}

function sortByReleaseDateDesc(a: FavoriteListItem, b: FavoriteListItem): number {
  if (!a.releaseDate && !b.releaseDate) return 0;
  if (!a.releaseDate) return 1;
  if (!b.releaseDate) return -1;
  return b.releaseDate.localeCompare(a.releaseDate);
}

export function useFavoritesList() {
  const [items, setItems] = useState<FavoriteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: favData, error: favError } = await supabase
          .from('favorites')
          .select('review_id');

        if (cancelled) return;
        if (favError) {
          setError('Failed to load favorites');
          setLoading(false);
          return;
        }

        const manualItems = await fetchManualAlbums();
        if (cancelled) return;

        const ids = (favData ?? []).map((r: { review_id: string }) => r.review_id);

        if (ids.length === 0) {
          setItems(manualItems.sort(sortByReleaseDateDesc));
          setLoading(false);
          return;
        }

        const { data: reviewData, error: reviewError } = await supabase
          .from('reviews')
          .select('*')
          .in('id', ids);

        if (cancelled) return;
        if (reviewError) {
          setError('Failed to load review data');
          setLoading(false);
          return;
        }

        const reviewItems: FavoriteListItem[] = (reviewData ?? []).map((row: DbRow) => ({
          id: row.id,
          type: 'review' as const,
          band: row.band,
          album: row.album,
          artworkUrl: row.artwork_url,
          releaseDate: row.release_date ?? null,
          genre: row.genre ?? [],
          publishedAt: row.published_at ?? null,
        }));

        const merged = [...reviewItems, ...manualItems].sort(sortByReleaseDateDesc);
        setItems(merged);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.warn('Failed to load favorites', e);
        setError('Failed to load favorites');
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refetch = () => setRefreshKey((k) => k + 1);

  return { items, loading, error, refetch };
}
