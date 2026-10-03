import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { latestPublishedAt } from './useFavoritesList';
import type { FavoriteListItem } from './useFavoritesList';

// Returns FavoriteListItem — not a separate type — so FavoriteListItemRow can render a
// Contenders row exactly as it renders a Favorites row (Favorites already has the Score
// treatment Contenders needs — see docs/decisions/aoty/aoty-contenders-implementation.md's
// Favorites-Score correction).

type NestedReviewRow = { published_at: string | null };

type NestedAlbumRow = {
  id: string;
  band: string;
  album: string;
  artwork_url: string | null;
  release_date: string | null;
  genre: string[] | null;
  reviews: NestedReviewRow[];
};

export type ContenderRow = {
  album_id: string;
  albums: NestedAlbumRow;
};

// contenders -> albums (many-to-one) -> reviews (one-to-many), same embed shape as
// useFavoritesList's FAVORITES_SELECT. Ordered by the contenders row's own created_at (newest
// added first) — "unordered pool" (docs/decisions/aoty/aoty-hub-population.md) means no
// algorithmic ranking, not no display order at all.
export const CONTENDERS_SELECT =
  'album_id, albums(id, band, album, artwork_url, release_date, genre, reviews(published_at))';

export function toFavoriteListItem(row: ContenderRow): FavoriteListItem {
  const a = row.albums;
  return {
    albumId: a.id,
    band: a.band,
    album: a.album,
    artworkUrl: a.artwork_url,
    releaseDate: a.release_date ?? null,
    genre: a.genre ?? [],
    publishedAt: latestPublishedAt(a.reviews ?? []),
  };
}

export function useContendersList() {
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
        const { data, error: contendersError } = await supabase
          .from('contenders')
          .select(CONTENDERS_SELECT)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        if (contendersError) {
          setError('Failed to load Contenders');
          setLoading(false);
          return;
        }

        const mapped = ((data ?? []) as unknown as ContenderRow[]).map(toFavoriteListItem);
        setItems(mapped);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.warn('Failed to load Contenders', e);
        setError('Failed to load Contenders');
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refetch = () => setRefreshKey((k) => k + 1);

  // Lets a successful add show up before the reconciling refetch lands.
  const addLocal = useCallback((added: FavoriteListItem[]) => {
    setItems((prev) => {
      const ids = new Set(added.map((a) => a.albumId));
      return [...added, ...prev.filter((i) => !ids.has(i.albumId))];
    });
  }, []);

  return { items, loading, error, refetch, addLocal };
}
