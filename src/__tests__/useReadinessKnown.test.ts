// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadinessKnown } from '../hooks/useReadinessKnown';

type P = { loading: boolean; key: string | null };

describe('useReadinessKnown', () => {
  afterEach(() => vi.useRealTimers());

  it('is unknown while loading and known once loading ends', () => {
    const { result, rerender } = renderHook((p: P) => useReadinessKnown(p.loading, p.key), {
      initialProps: { loading: true, key: 'u1' },
    });
    expect(result.current.known).toBe(false);
    rerender({ loading: false, key: 'u1' });
    expect(result.current.known).toBe(true);
  });

  it('is known from the start when nothing was ever loading', () => {
    const { result } = renderHook(() => useReadinessKnown(false, 'u1'));
    expect(result.current.known).toBe(true);
  });

  it('stays known through a later refetch', () => {
    const { result, rerender } = renderHook((p: P) => useReadinessKnown(p.loading, p.key), {
      initialProps: { loading: true, key: 'u1' },
    });
    rerender({ loading: false, key: 'u1' });
    rerender({ loading: true, key: 'u1' });
    expect(result.current.known).toBe(true);
    rerender({ loading: false, key: 'u1' });
    expect(result.current.known).toBe(true);
  });

  it('resets on an account change and is known again only after the new data has loaded', () => {
    const { result, rerender } = renderHook((p: P) => useReadinessKnown(p.loading, p.key), {
      initialProps: { loading: false, key: 'u1' },
    });
    expect(result.current.known).toBe(true);
    // New user: the data hooks still report their old (settled) state for one render.
    rerender({ loading: false, key: 'u2' });
    expect(result.current.known).toBe(false);
    rerender({ loading: true, key: 'u2' });
    expect(result.current.known).toBe(false);
    rerender({ loading: false, key: 'u2' });
    expect(result.current.known).toBe(true);
  });

  it('shows busy only after the delay, or at once after a press', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook((p: P) => useReadinessKnown(p.loading, p.key), {
      initialProps: { loading: true, key: 'u1' },
    });
    expect(result.current.busyVisible).toBe(false);
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(result.current.busyVisible).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(result.current.busyVisible).toBe(true);
    rerender({ loading: false, key: 'u1' });
    expect(result.current.busyVisible).toBe(false);

    const second = renderHook(() => useReadinessKnown(true, 'u1'));
    expect(second.result.current.busyVisible).toBe(false);
    act(() => second.result.current.notePress());
    expect(second.result.current.busyVisible).toBe(true);
  });

  it('never shows busy when loading ends before the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook((p: P) => useReadinessKnown(p.loading, p.key), {
      initialProps: { loading: true, key: 'u1' },
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender({ loading: false, key: 'u1' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.busyVisible).toBe(false);
    expect(result.current.known).toBe(true);
  });
});
