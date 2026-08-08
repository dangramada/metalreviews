// Degree-2 coverage progress toward Medium tier, expressed as a 0-100 number the UI can
// show directly (e.g. in the existing ProgressCircle). Derived purely from the same public
// `PreferenceGraph.isImplied` API that accuracyTiers.ts's `isMediumTierReached` itself uses
// — no engine file is modified to support this. Kept separate from accuracyTiers.ts since
// this isn't a tier decision, just a continuous progress number; isMediumTierReached remains
// the sole source of truth for the actual Medium/not-Medium boolean (see
// sessionProgress.test.ts's explicit cross-check between the two).

import type { PreferenceGraph } from './preferenceGraph.js';
import type { ComparisonPair } from './accuracyTiers.js';

export function degree2CoveragePercent(
  graph: PreferenceGraph,
  canonicalPairs: readonly ComparisonPair[]
): number {
  if (canonicalPairs.length === 0) return 100;
  const covered = canonicalPairs.filter(
    ({ profileA, profileB }) => graph.isImplied(profileA, profileB).implied
  ).length;
  return Math.round((covered / canonicalPairs.length) * 100);
}
