// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFavoritesList } from '../hooks/useFavoritesList';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../supabaseClient';

// Helper: builds a supabase.from mock for the single-query pattern:
//   .from('favorites').select('album_id, albums(...)').then(cb)
function makeFromImpl(
  options: {
    data?: Record<string, unknown>[];
    error?: { message: string } | null;
  } = {}
) {
  const { data = [], error = null } = options;

  return (table: string) => {
    if (table === 'favorites') {
      return {
        select: vi.fn().mockReturnValue({
          then: (cb: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(cb),
          catch: (cb: (e: unknown) => unknown) => Promise.resolve().catch(cb),
        }),
      };
    }
    return { select: vi.fn() };
  };
}

function makeFavoriteRow(overrides: {
  albumId?: string;
  band?: string;
  album?: string;
  artworkUrl?: string | null;
  releaseDate?: string | null;
  genre?: string[] | null;
  createdAt?: string | null;
  reviews?: { published_at: string | null }[];
}) {
  const {
    albumId = 'album1',
    band = 'Opeth',
    album = 'Blackwater Park',
    artworkUrl = 'https://example.com/art.jpg',
    releaseDate = '2001-03-16',
    genre = ['progressive metal', 'death metal'],
    createdAt = '2001-01-01T00:00:00Z',
    reviews = [{ published_at: '2006-01-01T00:00:00Z' }],
  } = overrides;

  return {
    album_id: albumId,
    albums: {
      id: albumId,
      band,
      album,
      artwork_url: artworkUrl,
      release_date: releaseDate,
      genre,
      created_at: createdAt,
      reviews,
    },
  };
}

describe('useFavoritesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with loading: true', () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl());
    const { result } = renderHook(() => useFavoritesList());
    expect(result.current.loading).toBe(true);
  });

  it('returns an empty list when the user has no favorites', async () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl({ data: [] }));
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('maps a favorited, reviewed album to FavoriteListItem shape', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ data: [makeFavoriteRow({})] })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      albumId: 'album1',
      band: 'Opeth',
      album: 'Blackwater Park',
      artworkUrl: 'https://example.com/art.jpg',
      releaseDate: '2001-03-16',
      genre: ['progressive metal', 'death metal'],
      publishedAt: '2006-01-01T00:00:00Z',
    });
  });

  it('maps a favorited, zero-review (manually-added) album with publishedAt null', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        data: [
          makeFavoriteRow({
            albumId: 'album2',
            band: 'Tool',
            album: 'Lateralus',
            artworkUrl: null,
            releaseDate: '2001-05-15',
            genre: ['progressive metal'],
            reviews: [],
          }),
        ],
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      albumId: 'album2',
      band: 'Tool',
      album: 'Lateralus',
      artworkUrl: null,
      releaseDate: '2001-05-15',
      genre: ['progressive metal'],
      publishedAt: null,
    });
  });

  it('uses the most recent review publishedAt as the fallback for multi-review albums', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        data: [
          makeFavoriteRow({
            albumId: 'album3',
            releaseDate: null,
            reviews: [
              { published_at: '2020-01-01T00:00:00Z' },
              { published_at: '2022-06-15T00:00:00Z' },
              { published_at: '2021-03-01T00:00:00Z' },
            ],
          }),
        ],
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0].publishedAt).toBe('2022-06-15T00:00:00Z');
  });

  it('sorts items by releaseDate descending, sorted by year', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        data: [
          makeFavoriteRow({ albumId: 'a', releaseDate: '2020-01-01' }),
          makeFavoriteRow({ albumId: 'b', releaseDate: '2024-06-15' }),
        ],
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const ids = result.current.items.map((i) => i.albumId);
    expect(ids).toEqual(['b', 'a']);
  });

  it('sorts items by releaseDate descending, nulls last', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        data: [
          makeFavoriteRow({ albumId: 'a', releaseDate: '2020-01-01' }),
          makeFavoriteRow({ albumId: 'b', releaseDate: null }),
          makeFavoriteRow({ albumId: 'c', releaseDate: '2024-06-15' }),
        ],
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const ids = result.current.items.map((i) => i.albumId);
    expect(ids).toEqual(['c', 'a', 'b']);
  });

  it('sets error state when the favorites query fails', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ error: { message: 'DB error' } })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load favorites');
    expect(result.current.items).toEqual([]);
  });

  // Regression guard for the missing-favorite bug investigated in
  // docs/decisions/album-identity-visibility-and-duplicate-fix.md's July 2026 follow-up:
  // useFavoritesList's query must stay a plain (non-inner) reviews embed. The home page's
  // ALBUMS_WITH_REVIEWS_SELECT (src/App.tsx) deliberately uses reviews!inner(...) to exclude
  // zero-review albums — that must never leak into this query, which is supposed to show
  // every favorited album regardless of review count.
  it('queries favorites with a plain (non-inner) reviews embed, not excluding zero-review albums', async () => {
    const selectSpy = vi.fn().mockReturnValue({
      then: (cb: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(cb),
      catch: (cb: (e: unknown) => unknown) => Promise.resolve().catch(cb),
    });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'favorites') return { select: selectSpy };
      return { select: vi.fn() };
    });
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(selectSpy).toHaveBeenCalledWith(expect.stringContaining('reviews('));
    expect(selectSpy).toHaveBeenCalledWith(expect.not.stringContaining('reviews!inner('));
  });

  it('exposes refetch that triggers a re-load', async () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl({ data: [] }));
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ data: [makeFavoriteRow({ band: 'Tool', album: 'Lateralus' })] })
    );
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].band).toBe('Tool');
  });
});
