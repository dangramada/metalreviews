// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFavoritesList } from '../hooks/useFavoritesList';

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../supabaseClient';

// Helper: builds a supabase.from mock for the two-table query pattern:
//   .from('favorites').select('review_id').then(cb)
//   .from('reviews').select('*').in('id', ids).then(cb)
function makeFromImpl(options: {
  favoritesData?: { review_id: string }[];
  favoritesError?: { message: string } | null;
  reviewsData?: Record<string, unknown>[];
  reviewsError?: { message: string } | null;
} = {}) {
  const {
    favoritesData = [],
    favoritesError = null,
    reviewsData = [],
    reviewsError = null,
  } = options;

  return (table: string) => {
    if (table === 'favorites') {
      return {
        select: vi.fn().mockReturnValue({
          then: (cb: (v: unknown) => unknown) =>
            Promise.resolve({ data: favoritesData, error: favoritesError }).then(cb),
          catch: (cb: (e: unknown) => unknown) => Promise.resolve().catch(cb),
        }),
      };
    }
    if (table === 'reviews') {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            then: (cb: (v: unknown) => unknown) =>
              Promise.resolve({ data: reviewsData, error: reviewsError }).then(cb),
            catch: (cb: (e: unknown) => unknown) => Promise.resolve().catch(cb),
          }),
        }),
      };
    }
    return { select: vi.fn() };
  };
}

const mockReviewRow = {
  id: 'rev1',
  band: 'Opeth',
  album: 'Blackwater Park',
  artwork_url: 'https://example.com/art.jpg',
  release_date: '2001-03-16',
  genre: ['progressive metal', 'death metal'],
  score: '9/10',
  normalized_score: 90,
  source: 'Angry Metal Guy',
  summary: 'A classic.',
  url: 'https://example.com',
  published_at: '2006-01-01T00:00:00Z',
  published_date: '1 Jan 2006',
};

describe('useFavoritesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with loading: true', () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl());
    const { result } = renderHook(() => useFavoritesList());
    expect(result.current.loading).toBe(true);
  });

  it('returns an empty list when user has no favorites', async () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl({ favoritesData: [] }));
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('maps a favorited review to FavoriteListItem shape with type: "review"', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        favoritesData: [{ review_id: 'rev1' }],
        reviewsData: [mockReviewRow],
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    const item = result.current.items[0];
    expect(item).toMatchObject({
      id: 'rev1',
      type: 'review',
      band: 'Opeth',
      album: 'Blackwater Park',
      artworkUrl: 'https://example.com/art.jpg',
      releaseDate: '2001-03-16',
      genre: ['progressive metal', 'death metal'],
    });
  });

  it('sets error state when favorites query fails', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ favoritesError: { message: 'DB error' } })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load favorites');
    expect(result.current.items).toEqual([]);
  });

  it('sets error state when reviews query fails', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        favoritesData: [{ review_id: 'rev1' }],
        reviewsError: { message: 'reviews error' },
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load review data');
  });

  it('sorts items by releaseDate descending, nulls last', async () => {
    const rows = [
      { ...mockReviewRow, id: 'a', release_date: '2020-01-01' },
      { ...mockReviewRow, id: 'b', release_date: null },
      { ...mockReviewRow, id: 'c', release_date: '2024-06-15' },
    ];
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        favoritesData: [{ review_id: 'a' }, { review_id: 'b' }, { review_id: 'c' }],
        reviewsData: rows,
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const ids = result.current.items.map((i) => i.id);
    expect(ids).toEqual(['c', 'a', 'b']);
  });
});
