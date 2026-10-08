import { AotyHub } from './AotyHub';

// The AOTY screen of the hub (docs/decisions/aoty/aoty-list-implementation.md). Routes render
// AotyHub directly; this names the screen for callers and tests that want it fixed.
export function AotyPage() {
  return <AotyHub screen="aoty" />;
}
