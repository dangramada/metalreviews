// @vitest-environment jsdom
//
// Callers (Contenders' Select for AOTY) wait on these hooks' `loading`; a failed or thrown fetch
// must still end it, or every control waiting on it stays busy forever.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCalibrationGate } from '../hooks/useCalibrationGate';
import { useAlbumRatingsSummary } from '../hooks/useAlbumRatingsSummary';

vi.mock('../supabaseClient', () => ({ supabase: { from: vi.fn() } }));
// A stable user object: both hooks re-run their load whenever `user` changes identity.
const authValue = { user: { id: 'u1' }, loading: false };
vi.mock('../AuthContext', () => ({
  useAuth: () => authValue,
}));

import { supabase } from '../supabaseClient';

// A chainable query whose awaited result is `result`, or a rejection.
function chain(result: unknown, reject = false): never {
  const p: unknown = new Proxy(function () {}, {
    get: (_t, prop) =>
      prop === 'then'
        ? (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            reject ? rej(new Error('network down')) : res(result)
        : () => p,
    apply: () => p,
  });
  return p as never;
}

describe('loading settles on failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it.each([
    ['an error result', () => chain({ data: null, error: { message: 'boom' }, count: null })],
    ['a thrown rejection', () => chain(null, true)],
    [
      'a synchronous throw',
      () => {
        throw new Error('boom');
      },
    ],
  ])('useCalibrationGate: %s', async (_n, make) => {
    vi.mocked(supabase.from).mockImplementation(make as never);
    const { result } = renderHook(() => useCalibrationGate());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe('none');
  });

  it.each([
    ['an error result', () => chain({ data: null, error: { message: 'boom' } })],
    ['a thrown rejection', () => chain(null, true)],
    [
      'a synchronous throw',
      () => {
        throw new Error('boom');
      },
    ],
  ])('useAlbumRatingsSummary: %s', async (_n, make) => {
    vi.mocked(supabase.from).mockImplementation(make as never);
    const { result } = renderHook(() => useAlbumRatingsSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary.size).toBe(0);
  });
});
