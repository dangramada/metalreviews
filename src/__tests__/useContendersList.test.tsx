// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

type Row = { album_id: string; albums: Record<string, unknown> };
const row = (id: string, release_date: string | null): Row => ({
  album_id: id,
  albums: { id, band: 'B', album: id, artwork_url: null, release_date, genre: [], reviews: [] },
});

let pending: Array<(v: { data: Row[]; error: null }) => void> = [];
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => new Promise((r) => pending.push(r)),
      }),
    }),
  },
}));

import { useContendersList } from '../hooks/useContendersList';

beforeEach(() => {
  pending = [];
});

describe('useContendersList release date and refetch', () => {
  it('setReleaseDateLocal updates that item only', async () => {
    const { result } = renderHook(() => useContendersList());
    await act(async () => pending[0]({ data: [row('a', null), row('b', null)], error: null }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setReleaseDateLocal('a', '2024-03'));
    expect(result.current.items.map((i) => [i.albumId, i.releaseDate])).toEqual([
      ['a', '2024-03'],
      ['b', null],
    ]);
  });

  it('drops a refetch that started before a local mutation, and keeps the later one', async () => {
    const { result } = renderHook(() => useContendersList());
    await act(async () => pending[0]({ data: [row('a', null)], error: null }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.refetch()); // started before the mutation: carries the old date
    await waitFor(() => expect(pending.length).toBe(2));
    act(() => result.current.setReleaseDateLocal('a', '2024'));
    await act(async () => pending[1]({ data: [row('a', null)], error: null }));
    expect(result.current.items[0].releaseDate).toBe('2024');

    act(() => result.current.refetch()); // the reconcile that follows the write
    await waitFor(() => expect(pending.length).toBe(3));
    await act(async () => pending[2]({ data: [row('a', '2024')], error: null }));
    expect(result.current.items[0].releaseDate).toBe('2024');
  });

  it('a background refetch does not show the loading state', async () => {
    const { result } = renderHook(() => useContendersList());
    await act(async () => pending[0]({ data: [row('a', null)], error: null }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.refetch());
    expect(result.current.loading).toBe(false);
    expect(result.current.items).toHaveLength(1);
  });
});
