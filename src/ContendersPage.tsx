import { AotyHub } from './AotyHub';

// The Contenders screen of the hub (docs/decisions/aoty/aoty-contenders-implementation.md).
// Routes render AotyHub directly; this names the screen for callers and tests that want it fixed.
export function ContendersPage() {
  return <AotyHub screen="contenders" />;
}
