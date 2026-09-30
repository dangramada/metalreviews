import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { latestPublishedAt } from './useFavoritesList';
import type { AotyMember } from '../lib/aoty/aotyView';

// aoty -> albums -> reviews, same embed shape as useContendersList. Membership rows only: no
// rank/score/year is stored (docs/decisions/aoty/aoty-list-implementation.md), so this returns
// members and lets buildAotyView derive the rest.
const AOTY_SELECT =
  'album_id, created_at, albums(id, band, album, artwork_url, release_date, genre, reviews(published_at))';

type AotyRow = {
  created_at: string | null;
  albums: {
    id: string;
    band: string;
    album: string;
    artwork_url: string | null;
    release_date: string | null;
    genre: string[] | null;
    reviews: { published_at: string | null }[];
  };
};

export function useAotyList() {
  const [items, setItems] = useState<AotyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('aoty')
          .select(AOTY_SELECT)
          .order('created_at', { ascending: false });
        if (cancelled) return;
        if (fetchError) {
          setError('Failed to load AOTY');
          setLoading(false);
          return;
        }
        setItems(
          ((data ?? []) as unknown as AotyRow[]).map((row) => ({
            albumId: row.albums.id,
            band: row.albums.band,
            album: row.albums.album,
            artworkUrl: row.albums.artwork_url,
            releaseDate: row.albums.release_date ?? null,
            genre: row.albums.genre ?? [],
            publishedAt: latestPublishedAt(row.albums.reviews ?? []),
            createdAt: row.created_at ?? '',
          }))
        );
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.warn('Failed to load AOTY', e);
        setError('Failed to load AOTY');
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { items, loading, error, refetch: () => setRefreshKey((k) => k + 1) };
}
