import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export interface FavoriteListItem {
  albumId: string;
  band: string;
  album: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  genre: string[];
  // Most recent attached review's published_at (ISO), or null when the album has
  // zero reviews (manually added, not yet reviewed by any source). Used only as a
  // year fallback in FavoritesPage when releaseDate is null — never written back to the DB.
  publishedAt: string | null;
}

// Mirrors one `reviews` row nested under its parent album, as embedded via the
// favorites -> albums -> reviews chain below. Only published_at is needed here —
// this view shows no score/source/summary (see docs/decisions/favorites-view.md).
type NestedReviewRow = {
  published_at: string | null;
};

type NestedAlbumRow = {
  id: string;
  band: string;
  album: string;
  artwork_url: string | null;
  release_date: string | null;
  genre: string[] | null;
  created_at: string | null;
  reviews: NestedReviewRow[];
};

type FavoriteRow = {
  album_id: string;
  albums: NestedAlbumRow;
};

// favorites -> albums (many-to-one, embeds as a single object) -> reviews (one-to-many,
// embeds as an array). One query replaces the old three-step favorites/manual_albums/reviews
// load now that both reviewed and manually-added albums live in the same `albums` table.
const FAVORITES_SELECT =
  'album_id, albums(id, band, album, artwork_url, release_date, genre, created_at, reviews(published_at))';

// Most recent attached review's date, mirroring AlbumCard.publishedAt's precedent
// (src/dbMapping.ts) for albums with more than one review — recency is the most useful
// signal for a fallback used only to bucket an item into a year.
function latestPublishedAt(reviews: NestedReviewRow[]): string | null {
  const dated = reviews.map((r) => r.published_at).filter((d): d is string => d != null);
  if (dated.length === 0) return null;
  return dated.reduce((latest, d) => (new Date(d) > new Date(latest) ? d : latest));
}

function toFavoriteListItem(row: FavoriteRow): FavoriteListItem {
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
        const { data, error: favError } = await supabase.from('favorites').select(FAVORITES_SELECT);

        if (cancelled) return;
        if (favError) {
          setError('Failed to load favorites');
          setLoading(false);
          return;
        }

        const mapped = ((data ?? []) as unknown as FavoriteRow[])
          .map(toFavoriteListItem)
          .sort(sortByReleaseDateDesc);
        setItems(mapped);
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
