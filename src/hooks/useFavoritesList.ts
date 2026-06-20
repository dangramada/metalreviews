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
}

// Placeholder for the future manual_albums table (not yet built).
// When the manual_albums brief lands, replace this stub with a real Supabase query.
function fetchManualAlbums(): Promise<FavoriteListItem[]> {
  return Promise.resolve([]);
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

  useEffect(() => {
    let cancelled = false;

    supabase
      .from('favorites')
      .select('review_id')
      .then(({ data, error: favError }: { data: { review_id: string }[] | null; error: unknown }) => {
        if (cancelled) return;
        if (favError) {
          setError('Failed to load favorites');
          setLoading(false);
          return;
        }

        const ids = (data ?? []).map((r) => r.review_id);

        if (ids.length === 0) {
          fetchManualAlbums().then((manual) => {
            if (cancelled) return;
            setItems(manual);
            setLoading(false);
          });
          return;
        }

        supabase
          .from('reviews')
          .select('*')
          .in('id', ids)
          .then(({ data: reviewData, error: reviewError }: { data: DbRow[] | null; error: unknown }) => {
            if (cancelled) return;
            if (reviewError) {
              setError('Failed to load review data');
              setLoading(false);
              return;
            }

            const reviewItems: FavoriteListItem[] = (reviewData ?? []).map((row) => ({
              id: row.id,
              type: 'review' as const,
              band: row.band,
              album: row.album,
              artworkUrl: row.artwork_url,
              releaseDate: row.release_date ?? null,
              genre: row.genre ?? [],
            }));

            fetchManualAlbums().then((manual) => {
              if (cancelled) return;
              const merged = [...reviewItems, ...manual].sort(sortByReleaseDateDesc);
              setItems(merged);
              setLoading(false);
            });
          })
          .catch((e: unknown) => {
            if (cancelled) return;
            console.warn('Failed to load review data for favorites', e);
            setError('Failed to load review data');
            setLoading(false);
          });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.warn('Failed to load favorites', e);
        setError('Failed to load favorites');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, error };
}
