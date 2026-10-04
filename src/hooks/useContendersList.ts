import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Bumped by every local mutation (same scheme as useAotyList). A refetch that started before
  // the latest mutation carries pre-mutation data, so its response is dropped rather than undoing
  // the local change; the refetch each write triggers after its own mutation is the one that lands.
  const mutationGen = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // Only the first load shows the spinner/error; a background refetch is silent so rows (and
    // the focus on them) are not torn down, and if it fails it keeps what the page shows.
    const silent = refreshKey > 0;
    const startedAtGen = mutationGen.current;
    const stale = () => cancelled || mutationGen.current !== startedAtGen;

    async function load() {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const { data, error: contendersError } = await supabase
          .from('contenders')
          .select(CONTENDERS_SELECT)
          .order('created_at', { ascending: false });

        if (stale()) return;
        if (contendersError) {
          if (!silent) {
            setError('Failed to load Contenders');
            setLoading(false);
          }
          return;
        }

        const mapped = ((data ?? []) as unknown as ContenderRow[]).map(toFavoriteListItem);
        setItems(mapped);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.warn('Failed to load Contenders', e);
        if (!silent) {
          setError('Failed to load Contenders');
          setLoading(false);
        }
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
    mutationGen.current += 1;
    setItems((prev) => {
      const ids = new Set(added.map((a) => a.albumId));
      return [...added, ...prev.filter((i) => !ids.has(i.albumId))];
    });
  }, []);

  // Applies a release date a write just stored, so the row changes year scope before the
  // reconciling refetch lands.
  const setReleaseDateLocal = useCallback((albumId: string, releaseDate: string) => {
    mutationGen.current += 1;
    setItems((prev) => prev.map((i) => (i.albumId === albumId ? { ...i, releaseDate } : i)));
  }, []);

  return { items, loading, error, refetch, addLocal, setReleaseDateLocal };
}
