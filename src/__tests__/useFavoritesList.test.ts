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

// Helper: builds a supabase.from mock for the three-table query pattern:
//   .from('favorites').select('review_id').then(cb)
//   .from('manual_albums').select('*').then(cb)
//   .from('reviews').select('*').in('id', ids).then(cb)
function makeFromImpl(options: {
  favoritesData?: { review_id: string }[];
  favoritesError?: { message: string } | null;
  reviewsData?: Record<string, unknown>[];
  reviewsError?: { message: string } | null;
  manualData?: Record<string, unknown>[];
  manualError?: { message: string } | null;
} = {}) {
  const {
    favoritesData = [],
    favoritesError = null,
    reviewsData = [],
    reviewsError = null,
    manualData = [],
    manualError = null,
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
    if (table === 'manual_albums') {
      return {
        select: vi.fn().mockReturnValue({
          then: (cb: (v: unknown) => unknown) =>
            Promise.resolve({ data: manualData, error: manualError }).then(cb),
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

const mockManualRow = {
  id: 'man1',
  user_id: 'user-abc',
  band: 'Tool',
  album: 'Lateralus',
  artwork_url: null,
  release_date: '2001-05-15',
  genre: ['progressive metal'],
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

  it('returns an empty list when user has no favorites and no manual albums', async () => {
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
      publishedAt: '2006-01-01T00:00:00Z',
    });
  });

  it('maps a manual album to FavoriteListItem shape with type: "manual"', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ favoritesData: [], manualData: [mockManualRow] })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({
      id: 'man1',
      type: 'manual',
      band: 'Tool',
      album: 'Lateralus',
      artworkUrl: null,
      releaseDate: '2001-05-15',
      genre: ['progressive metal'],
      publishedAt: null,
    });
  });

  it('merges review and manual items, sorted by releaseDate descending', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        favoritesData: [{ review_id: 'rev1' }],
        reviewsData: [mockReviewRow], // 2001-03-16
        manualData: [{ ...mockManualRow, release_date: '2024-01-01' }],
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(2);
    // 2024 should come before 2001
    expect(result.current.items[0].releaseDate).toBe('2024-01-01');
    expect(result.current.items[1].releaseDate).toBe('2001-03-16');
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

  it('sets error state when manual_albums query fails', async () => {
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({
        favoritesData: [],
        manualError: { message: 'manual error' },
      })
    );
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load favorites');
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

  it('exposes refetch that triggers a re-load', async () => {
    vi.mocked(supabase.from).mockImplementation(makeFromImpl({ favoritesData: [] }));
    const { result } = renderHook(() => useFavoritesList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Update mock to return a manual album on next load
    vi.mocked(supabase.from).mockImplementation(
      makeFromImpl({ favoritesData: [], manualData: [mockManualRow] })
    );
    act(() => { result.current.refetch(); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].band).toBe('Tool');
  });
});
