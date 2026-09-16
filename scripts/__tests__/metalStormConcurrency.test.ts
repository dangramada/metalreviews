import { describe, it, expect, afterEach } from 'vitest';
import {
  mapWithConcurrency,
  withTimeout,
  TIMED_OUT,
  METAL_STORM_PAGE_CONCURRENCY,
} from '../ingest';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mapWithConcurrency', () => {
  it('never runs more than `limit` tasks at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapWithConcurrency(items, METAL_STORM_PAGE_CONCURRENCY, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight--;
    });
    expect(peak).toBe(METAL_STORM_PAGE_CONCURRENCY);
  });

  it('preserves input order in results even when tasks finish out of order', async () => {
    const items = [30, 5, 20, 1, 10];
    const results = await mapWithConcurrency(items, 2, async (ms) => {
      await delay(ms);
      return ms * 2;
    });
    expect(results).toEqual([60, 10, 40, 2, 20]);
  });

  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4, 5], 3, async (n) => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await mapWithConcurrency([], 2, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1], 5, async (n) => n)).toEqual([1]);
  });
});

describe('withTimeout', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
    unhandled.length = 0;
  });

  it('resolves with the value when the promise wins', async () => {
    expect(await withTimeout(Promise.resolve('closed'), 50)).toBe('closed');
  });

  it('resolves with TIMED_OUT when the timer wins', async () => {
    expect(
      await withTimeout(
        delay(50).then(() => 'late'),
        5
      )
    ).toBe(TIMED_OUT);
  });

  it('propagates a rejection that happens before the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });

  // Regression guard on observable behaviour. Note it also passes without withTimeout's
  // explicit promise.catch, because Promise.race's own subscription marks the promise
  // handled — the explicit catch is there so this holds even if the race is refactored.
  it('does not produce an unhandled rejection when the promise rejects after timing out', async () => {
    process.on('unhandledRejection', onUnhandled);
    const late = delay(20).then(() => {
      throw new Error('Target closed after SIGKILL');
    });
    expect(await withTimeout(late, 5)).toBe(TIMED_OUT);
    // Let the late rejection fire and the unhandledRejection check run.
    await delay(40);
    expect(unhandled).toEqual([]);
  });
});
