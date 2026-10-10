// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn() } }));
import { supabase } from '../supabaseClient';
import { useAotyList } from '../hooks/useAotyList';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

const poolItem = (id: string): FavoriteListItem => ({
  albumId: id,
  band: `Band ${id}`,
  album: `Album ${id}`,
  artworkUrl: null,
  releaseDate: '2026-01-01',
  genre: [],
  publishedAt: null,
});

type Opts = { pool: FavoriteListItem[]; poolLoading: boolean; poolError: string | null };
const ready = (ids: string[]): Opts => ({
  pool: ids.map(poolItem),
  poolLoading: false,
  poolError: null,
});
// A stable reference: the hook's memo depends on `pool`, so a fresh array per render would loop.
const POOL_A = ready(['a1', 'a2']);
const EMPTY = ready([]);

const calls: { table: string; select: string }[] = [];

function mockAoty(rows: unknown[]) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const entry = { table, select: '' };
    calls.push(entry);
    const chain: Record<string, unknown> = {
      select: (sel: string) => {
        entry.select = sel;
        return chain;
      },
      order: () => Promise.resolve({ data: rows, error: null }),
    };
    return chain;
  }) as unknown as typeof supabase.from);
}

describe('useAotyList', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
  });

  it('reads membership only: one query, no embed, no second contenders read', async () => {
    mockAoty([{ album_id: 'a1', created_at: '2026-02-01' }]);
    const { result } = renderHook(() => useAotyList(POOL_A));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(calls).toEqual([{ table: 'aoty', select: 'album_id, created_at' }]);
  });

  it('derives members from the pool, with created_at, in membership order', async () => {
    mockAoty([
      { album_id: 'a2', created_at: '2026-03-01' },
      { album_id: 'a1', created_at: '2026-02-01' },
    ]);
    const { result } = renderHook(() => useAotyList(POOL_A));
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map((i) => i.albumId)).toEqual(['a2', 'a1']);
    expect(result.current.items[1]).toMatchObject({
      albumId: 'a1',
      band: 'Band a1',
      createdAt: '2026-02-01',
    });
  });

  it('skips a member that is not in the pool', async () => {
    mockAoty([{ album_id: 'ghost', created_at: 'x' }]);
    const { result } = renderHook(() => useAotyList(POOL_A));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect([...result.current.aotyIds]).toEqual(['ghost']);
  });

  it('is loading until both the membership read and the pool have settled', async () => {
    mockAoty([]);
    const { result, rerender } = renderHook((o: Opts) => useAotyList(o), {
      initialProps: { ...EMPTY, poolLoading: true },
    });
    await waitFor(() => expect(result.current.idsLoading).toBe(false));
    expect(result.current.loading).toBe(true);
    rerender(EMPTY);
    expect(result.current.loading).toBe(false);
  });

  it('reports a pool failure as the error, with no fallback list', async () => {
    mockAoty([{ album_id: 'a1', created_at: 's' }]);
    const { result } = renderHook(() =>
      useAotyList({ pool: [], poolLoading: false, poolError: 'Failed to load Contenders' })
    );
    await waitFor(() => expect(result.current.idsLoading).toBe(false));
    expect(result.current.error).toBe('Failed to load Contenders');
    expect(result.current.items).toEqual([]);
  });

  describe('ids', () => {
    it('are ready and empty when there are no members', async () => {
      mockAoty([]);
      const { result } = renderHook(() => useAotyList(EMPTY));
      await waitFor(() => expect(result.current.idsLoading).toBe(false));
      expect(result.current.aotyIds.size).toBe(0);
    });

    it('a failed read leaves idsLoading false, the set empty, and sets the error', async () => {
      vi.mocked(supabase.from).mockImplementation((() => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          order: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        };
        return chain;
      }) as unknown as typeof supabase.from);
      const { result } = renderHook(() => useAotyList(EMPTY));
      await waitFor(() => expect(result.current.idsLoading).toBe(false));
      expect(result.current.aotyIds.size).toBe(0);
      expect(result.current.error).toBe('Failed to load AOTY');
    });

    it('a retry after a failed first read clears the error', async () => {
      let fail = true;
      vi.mocked(supabase.from).mockImplementation((() => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          order: () =>
            Promise.resolve(
              fail
                ? { data: null, error: { message: 'boom' } }
                : { data: [{ album_id: 'a1', created_at: 's' }], error: null }
            ),
        };
        return chain;
      }) as unknown as typeof supabase.from);
      const { result } = renderHook(() => useAotyList(POOL_A));
      await waitFor(() => expect(result.current.error).toBe('Failed to load AOTY'));
      fail = false;
      act(() => result.current.refetch());
      await waitFor(() => expect(result.current.error).toBeNull());
      expect(result.current.items.map((i) => i.albumId)).toEqual(['a1']);
    });

    it('addLocal and removeLocal keep the id set in step', async () => {
      mockAoty([]);
      const { result } = renderHook(() => useAotyList(EMPTY));
      await waitFor(() => expect(result.current.idsLoading).toBe(false));
      const item = { ...poolItem('x'), createdAt: 'n' };
      act(() => result.current.addLocal([item]));
      expect(result.current.aotyIds.has('x')).toBe(true);
      act(() => result.current.removeLocal(['x']));
      expect(result.current.aotyIds.has('x')).toBe(false);
    });
  });

  describe('local mutations and silent refetch', () => {
    type Deferred = { resolve: (rows: unknown[]) => void; reject: () => void };
    // Each aoty read after the first is held open so a test decides when its response lands.
    function mockControlled(initial: unknown[]) {
      const pending: Deferred[] = [];
      let first = true;
      vi.mocked(supabase.from).mockImplementation((() => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          order: () => {
            if (first) {
              first = false;
              return Promise.resolve({ data: initial, error: null });
            }
            return new Promise((resolve) => {
              pending.push({
                resolve: (rows) => resolve({ data: rows, error: null }),
                reject: () => resolve({ data: null, error: { message: 'boom' } }),
              });
            });
          },
        };
        return chain;
      }) as unknown as typeof supabase.from);
      return pending;
    }
    const POOL = ready(['a', 'b', 'z']);
    const add = (id: string) => ({ ...poolItem(id), createdAt: 'n' });

    it('a refetch older than a local mutation cannot undo it (two parallel writes)', async () => {
      const pending = mockControlled([]);
      const { result } = renderHook(() => useAotyList(POOL));
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addLocal([add('a')]));
      act(() => result.current.refetch()); // refetch #1, started after A only
      await waitFor(() => expect(pending).toHaveLength(1));
      act(() => result.current.addLocal([add('b')]));

      // #1's response predates B (and, being slow, even A): it must be dropped.
      await act(async () => pending[0].resolve([]));
      expect(result.current.items.map((i) => i.albumId).sort()).toEqual(['a', 'b']);

      act(() => result.current.refetch()); // refetch #2 started after both mutations
      await waitFor(() => expect(pending).toHaveLength(2));
      await act(async () =>
        pending[1].resolve([
          { album_id: 'a', created_at: 's' },
          { album_id: 'b', created_at: 's' },
        ])
      );
      expect(result.current.items.map((i) => i.albumId).sort()).toEqual(['a', 'b']);
    });

    it('a failing silent refetch keeps local state and sets no error or spinner', async () => {
      const pending = mockControlled([]);
      const { result } = renderHook(() => useAotyList(POOL));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.addLocal([add('a')]));
      act(() => result.current.refetch());
      await waitFor(() => expect(pending).toHaveLength(1));
      expect(result.current.loading).toBe(false);
      await act(async () => pending[0].reject());
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.items.map((i) => i.albumId)).toEqual(['a']);
    });

    it('removeLocal drops the row immediately', async () => {
      mockControlled([{ album_id: 'a', created_at: 's' }]);
      const { result } = renderHook(() => useAotyList(POOL));
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      act(() => result.current.removeLocal(['a']));
      expect(result.current.items).toEqual([]);
    });

    it('does not set state after unmount', async () => {
      const pending = mockControlled([]);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result, unmount } = renderHook(() => useAotyList(POOL));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.refetch());
      await waitFor(() => expect(pending).toHaveLength(1));
      const { addLocal } = result.current;
      unmount();
      await act(async () => pending[0].resolve([{ album_id: 'a', created_at: 's' }]));
      addLocal([add('z')]);
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
