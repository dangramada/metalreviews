// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useYearScope } from '../hooks/useYearScope';
import type { FavoriteListItem } from '../hooks/useFavoritesList';

let mockUid = 'u1';
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: { id: mockUid }, loading: false }),
}));

const album = (albumId: string, releaseDate: string | null): FavoriteListItem => ({
  albumId,
  band: albumId,
  album: albumId,
  artworkUrl: null,
  releaseDate,
  genre: [],
  publishedAt: null,
});

type Props = { pool: FavoriteListItem[]; aoty?: string[]; ready?: boolean };
function setup(initial: Props, entry = '/x') {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
  );
  return renderHook(
    (p: Props) => {
      const scope = useYearScope({
        pool: p.pool,
        aotyIds: new Set(p.aoty ?? []),
        ready: p.ready ?? true,
      });
      return { ...scope, search: useLocation().search };
    },
    { wrapper, initialProps: initial }
  );
}

describe('useYearScope', () => {
  it('prefers the year with most AOTY members, then most contenders, ties to the latest', () => {
    const pool = [album('a', '2025'), album('b', '2025-02'), album('c', '2024-03-01')];
    expect(setup({ pool }).result.current.scope).toBe(2025);
    expect(setup({ pool, aoty: ['c'] }).result.current.scope).toBe(2024);
    const tied = [album('a', '2025'), album('b', '2024')];
    expect(setup({ pool: tied }).result.current.scope).toBe(2025);
    expect(setup({ pool: tied, aoty: ['a', 'b'] }).result.current.scope).toBe(2025);
  });

  it('uses the no-year bucket as default only when it is all there is', () => {
    expect(setup({ pool: [album('a', null)] }).result.current.scope).toBe('none');
    expect(setup({ pool: [album('a', null), album('b', '2024')] }).result.current.scope).toBe(2024);
    expect(setup({ pool: [] }).result.current.scope).toBeNull();
  });

  it('treats NULL, YYYY and YYYY-MM dates correctly and lists implausible years as-is', () => {
    const { result } = setup({
      pool: [album('a', '2025'), album('b', '2025-06'), album('c', null), album('d', '3036-01-01')],
    });
    expect(result.current.options).toEqual([3036, 2025, 'none']);
    expect(result.current.spansMany).toBe(true);
  });

  it('accepts a valid ?year, and falls back to the default for invalid or unavailable ones', () => {
    const pool = [album('a', '2025'), album('b', '2024')];
    expect(setup({ pool }, '/x?year=2024').result.current.scope).toBe(2024);
    for (const bad of ['abc', '', '2024x', '12345', '1999', 'none']) {
      expect(setup({ pool }, `/x?year=${bad}`).result.current.scope).toBe(2025);
    }
  });

  it('resolves nothing until ready', () => {
    const { result, rerender } = setup({ pool: [album('a', '2025')], ready: false });
    expect(result.current.scope).toBeNull();
    rerender({ pool: [album('a', '2025')], ready: true });
    expect(result.current.scope).toBe(2025);
  });

  it('keeps the pinned scope when addLocal/removeLocal change the counts', () => {
    const pool = [album('a', '2025'), album('b', '2025'), album('c', '2024')];
    const { result, rerender } = setup({ pool });
    expect(result.current.scope).toBe(2025);
    rerender({ pool, aoty: ['c'] });
    expect(result.current.scope).toBe(2025);
    rerender({ pool, aoty: [] });
    expect(result.current.scope).toBe(2025);
  });

  it('widens options when the pool gains a year, without moving the scope', () => {
    const { result, rerender } = setup({ pool: [album('a', '2025')] });
    expect(result.current.spansMany).toBe(false);
    rerender({ pool: [album('a', '2025'), album('z', '2030')] });
    expect(result.current.options).toEqual([2030, 2025]);
    expect(result.current.scope).toBe(2025);
  });

  it('keeps an emptied scope selectable instead of jumping', () => {
    const { result, rerender } = setup(
      { pool: [album('a', '2025'), album('b', '2024')] },
      '/x?year=2024'
    );
    rerender({ pool: [album('a', '2025')] });
    expect(result.current.scope).toBe(2024);
    expect(result.current.options).toEqual([2025, 2024]);
  });

  it('writes the scope to the URL and setYear replaces it', () => {
    const { result } = setup({ pool: [album('a', '2025'), album('b', '2024')] });
    expect(result.current.search).toBe('?year=2025');
    expect(result.current.scopeSearch).toBe('?year=2025');
    act(() => result.current.setYear(2024));
    expect(result.current.scope).toBe(2024);
    expect(result.current.search).toBe('?year=2024');
    act(() => result.current.setYear('none'));
    expect(result.current.search).toBe('?year=none');
  });

  it('writes nothing to the URL when there is a single scope value', () => {
    const { result } = setup({ pool: [album('a', '2025')] });
    expect(result.current.search).toBe('');
    expect(result.current.scopeSearch).toBe('');
  });

  it('inScope follows the pinned scope', () => {
    const { result } = setup(
      { pool: [album('a', '2025'), album('b', '2024'), album('c', null)] },
      '/x?year=2024'
    );
    expect(result.current.inScope(album('b', '2024-05'))).toBe(true);
    expect(result.current.inScope(album('a', '2025'))).toBe(false);
    act(() => result.current.setYear('none'));
    expect(result.current.inScope(album('c', null))).toBe(true);
  });

  it('re-resolves on an account change', () => {
    mockUid = 'u1';
    const pool = [album('a', '2025'), album('b', '2024')];
    const { result, rerender } = setup({ pool }, '/x?year=2024');
    act(() => result.current.setYear(2025));
    mockUid = 'u2';
    rerender({ pool });
    // The pinned 2025 is dropped; the URL (now 2025) is re-read for the new account.
    expect(result.current.scope).toBe(2025);
    mockUid = 'u1';
  });
});
