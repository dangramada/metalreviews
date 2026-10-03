import { useEffect, useRef, useState } from 'react';

// Per-album "write in flight" tracking. The ref is the synchronous guard (a double click lands in
// the same tick, before state would update); the state mirrors it so rows can render as busy.
// Different albums run in parallel, the same album never has two writes in flight.
export function usePendingIds() {
  const inFlight = useRef(new Set<string>());
  const mounted = useRef(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Resolves undefined without running `fn` when any id is already pending.
  async function run<T>(ids: string[], fn: () => Promise<T>): Promise<T | undefined> {
    if (ids.length === 0 || ids.some((id) => inFlight.current.has(id))) return undefined;
    ids.forEach((id) => inFlight.current.add(id));
    setPending(new Set(inFlight.current));
    try {
      return await fn();
    } finally {
      ids.forEach((id) => inFlight.current.delete(id));
      if (mounted.current) setPending(new Set(inFlight.current));
    }
  }

  return { pending, run };
}
