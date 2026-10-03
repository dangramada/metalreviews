// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn() } }));
import { supabase } from '../supabaseClient';
import { useAotyList } from '../hooks/useAotyList';
import { CONTENDERS_SELECT } from '../hooks/useContendersList';

// Only these embeds exist in the schema: aoty -> contenders (composite FK) and contenders ->
// albums. aoty has no FK to albums, so selecting `albums(...)` from aoty fails with PGRST200 in
// the real database, which a mock alone would not notice; this asserts the query shape instead.
const calls: { table: string; select: string; inArgs?: unknown[] }[] = [];

function mockTables(aotyRows: unknown[], contenderRows: unknown[]) {
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const entry: { table: string; select: string; inArgs?: unknown[] } = { table, select: '' };
    calls.push(entry);
    const rows = table === 'aoty' ? aotyRows : contenderRows;
    const chain: Record<string, unknown> = {
      select: (sel: string) => {
        entry.select = sel;
        return chain;
      },
      order: () => Promise.resolve({ data: rows, error: null }),
      in: (...args: unknown[]) => {
        entry.inArgs = args;
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return chain;
  }) as unknown as typeof supabase.from);
}

const contenderRow = (id: string) => ({
  album_id: id,
  albums: {
    id,
    band: `Band ${id}`,
    album: `Album ${id}`,
    artwork_url: null,
    release_date: '2026-01-01',
    genre: null,
    reviews: [],
  },
});

describe('useAotyList', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
  });

  it('builds its queries only from relationships that exist', async () => {
    mockTables([{ album_id: 'a1', created_at: '2026-02-01' }], [contenderRow('a1')]);
    const { result } = renderHook(() => useAotyList());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(calls.map((c) => c.table)).toEqual(['aoty', 'contenders']);
    // aoty is read for membership only: no embed at all, so no albums(...) off aoty.
    expect(calls[0].select).not.toMatch(/\(/);
    // albums come through contenders, using the exact embed ContendersPage uses.
    expect(calls[1].select).toBe(CONTENDERS_SELECT);
    expect(calls[1].inArgs).toEqual(['album_id', ['a1']]);
  });

  it('maps members to items with created_at and skips the contenders query when empty', async () => {
    mockTables([{ album_id: 'a1', created_at: '2026-02-01' }], [contenderRow('a1')]);
    const { result } = renderHook(() => useAotyList());
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]).toMatchObject({
      albumId: 'a1',
      band: 'Band a1',
      createdAt: '2026-02-01',
      genre: [],
    });

    calls.length = 0;
    mockTables([], []);
    const empty = renderHook(() => useAotyList());
    await waitFor(() => expect(empty.result.current.loading).toBe(false));
    expect(empty.result.current.items).toEqual([]);
    expect(calls.map((c) => c.table)).toEqual(['aoty']);
  });

  describe('ids ready before the album fetch', () => {
    it('exposes the AOTY ids while the contenders fetch is still pending, then the full list', async () => {
      let releaseContenders!: () => void;
      vi.mocked(supabase.from).mockImplementation(((table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          order: () =>
            Promise.resolve({ data: [{ album_id: 'a1', created_at: '2026-02-01' }], error: null }),
          in: () =>
            table === 'contenders'
              ? new Promise((resolve) => {
                  releaseContenders = () => resolve({ data: [contenderRow('a1')], error: null });
                })
              : Promise.resolve({ data: [], error: null }),
        };
        return chain;
      }) as unknown as typeof supabase.from);

      const { result } = renderHook(() => useAotyList());
      await waitFor(() => expect(result.current.idsLoading).toBe(false));
      expect([...result.current.aotyIds]).toEqual(['a1']);
      expect(result.current.loading).toBe(true);
      expect(result.current.items).toEqual([]);

      await act(async () => releaseContenders());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.items.map((i) => i.albumId)).toEqual(['a1']);
      expect([...result.current.aotyIds]).toEqual(['a1']);
    });

    it('ids are ready and empty when there are no members', async () => {
      mockTables([], []);
      const { result } = renderHook(() => useAotyList());
      await waitFor(() => expect(result.current.idsLoading).toBe(false));
      expect(result.current.aotyIds.size).toBe(0);
    });

    it('a failed ids fetch leaves idsLoading false and the set empty', async () => {
      vi.mocked(supabase.from).mockImplementation((() => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          order: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        };
        return chain;
      }) as unknown as typeof supabase.from);
      const { result } = renderHook(() => useAotyList());
      await waitFor(() => expect(result.current.idsLoading).toBe(false));
      expect(result.current.aotyIds.size).toBe(0);
      expect(result.current.error).toBe('Failed to load AOTY');
    });

    it('addLocal and removeLocal keep the id set in step', async () => {
      mockTables([], []);
      const { result } = renderHook(() => useAotyList());
      await waitFor(() => expect(result.current.idsLoading).toBe(false));
      const item = {
        albumId: 'x',
        band: 'x',
        album: 'x',
        artworkUrl: null,
        releaseDate: null,
        genre: [] as string[],
        publishedAt: null,
        createdAt: 'n',
      };
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
      vi.mocked(supabase.from).mockImplementation(((table: string) => {
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
          in: (_col: string, ids: string[]) =>
            Promise.resolve({ data: ids.map(contenderRow), error: null }),
        };
        void table;
        return chain;
      }) as unknown as typeof supabase.from);
      return pending;
    }
    const asItem = (id: string) => ({
      albumId: id,
      band: id,
      album: id,
      artworkUrl: null,
      releaseDate: null,
      genre: [] as string[],
      publishedAt: null,
    });

    it('a refetch older than a local mutation cannot undo it (two parallel writes)', async () => {
      const pending = mockControlled([]);
      const { result } = renderHook(() => useAotyList());
      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => result.current.addLocal([{ ...asItem('a'), createdAt: 'n' }]));
      act(() => result.current.refetch()); // refetch #1, started after A only
      await waitFor(() => expect(pending).toHaveLength(1));
      act(() => result.current.addLocal([{ ...asItem('b'), createdAt: 'n' }]));

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
      const { result } = renderHook(() => useAotyList());
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.addLocal([{ ...asItem('a'), createdAt: 'n' }]));
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
      const { result } = renderHook(() => useAotyList());
      await waitFor(() => expect(result.current.items).toHaveLength(1));
      act(() => result.current.removeLocal(['a']));
      expect(result.current.items).toEqual([]);
    });

    it('does not set state after unmount', async () => {
      const pending = mockControlled([]);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result, unmount } = renderHook(() => useAotyList());
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.refetch());
      await waitFor(() => expect(pending).toHaveLength(1));
      const { addLocal } = result.current;
      unmount();
      await act(async () => pending[0].resolve([{ album_id: 'a', created_at: 's' }]));
      addLocal([{ ...asItem('z'), createdAt: 'n' }]);
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});
