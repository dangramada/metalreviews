import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { usePendingWritesGuard } from '../hooks/usePendingWritesGuard';

// Regression test for the data-loss fix: a commit's answer insert is fired async and not
// awaited before the next interaction (see usePendingWritesGuard.ts's header for why), so
// the only thing standing between an in-flight insert and a silently dropped answer is this
// guard's beforeunload handler. This simulates "commit, then navigate away before the write
// settles" and confirms the browser is actually told to warn the user in that window, and
// stops being told to once the write resolves — the concrete mechanism the fix relies on,
// not just that the hook's counters move.
function dispatchBeforeUnload(): Event {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

afterEach(cleanup);

describe('usePendingWritesGuard', () => {
  it('does not warn on unload when nothing is pending', () => {
    renderHook(() => usePendingWritesGuard());
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });

  it('warns on unload while a write is in flight — simulated commit-then-navigate-away', () => {
    const { result } = renderHook(() => usePendingWritesGuard());

    act(() => {
      result.current.beginWrite();
    });
    expect(result.current.hasPendingWrites).toBe(true);

    // Navigation-equivalent event landing before the insert's promise has settled.
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(true);
  });

  it('stops warning once the write resolves, so a later refresh is silent again', () => {
    const { result } = renderHook(() => usePendingWritesGuard());

    act(() => {
      result.current.beginWrite();
    });
    act(() => {
      result.current.endWrite();
    });
    expect(result.current.hasPendingWrites).toBe(false);

    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });

  it('only clears the warning once every concurrent write has resolved', () => {
    const { result } = renderHook(() => usePendingWritesGuard());

    // Two commits in flight at once (e.g. a fast undo immediately after a commit).
    act(() => {
      result.current.beginWrite();
      result.current.beginWrite();
    });
    act(() => {
      result.current.endWrite();
    });
    // One of the two writes is still in flight — still unsafe to navigate away silently.
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true);

    act(() => {
      result.current.endWrite();
    });
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false);
  });

  it('removes its beforeunload listener on unmount', () => {
    const { result, unmount } = renderHook(() => usePendingWritesGuard());
    act(() => {
      result.current.beginWrite();
    });
    unmount();
    // No listener left registered — dispatching after unmount must not throw and must not
    // be able to block navigation on behalf of an unmounted page.
    const event = dispatchBeforeUnload();
    expect(event.defaultPrevented).toBe(false);
  });
});
