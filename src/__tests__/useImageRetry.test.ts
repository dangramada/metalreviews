import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageRetry } from '../hooks/useImageRetry';

describe('useImageRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('retries after 3s then 8s, then fails', () => {
    const { result } = renderHook(() => useImageRetry('a.jpg'));
    act(() => result.current.onError());
    expect(result.current.attempt).toBe(0);
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current.attempt).toBe(1);
    act(() => result.current.onError());
    act(() => void vi.advanceTimersByTime(7999));
    expect(result.current.attempt).toBe(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current.attempt).toBe(2);
    expect(result.current.failed).toBe(false);
    act(() => result.current.onError());
    expect(result.current.failed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('onLoad marks loaded', () => {
    const { result } = renderHook(() => useImageRetry('a.jpg'));
    act(() => result.current.onLoad());
    expect(result.current.loaded).toBe(true);
  });

  it('resets and cancels the pending retry when url changes', () => {
    const { result, rerender } = renderHook(({ u }) => useImageRetry(u), {
      initialProps: { u: 'a.jpg' },
    });
    act(() => result.current.onError());
    act(() => void vi.advanceTimersByTime(3000));
    act(() => result.current.onError());
    rerender({ u: 'b.jpg' });
    expect(result.current.attempt).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer on unmount', () => {
    const { result, unmount } = renderHook(() => useImageRetry('a.jpg'));
    act(() => result.current.onError());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
