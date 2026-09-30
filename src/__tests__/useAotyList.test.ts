// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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
});
