// Part A — question-ordering heuristic: closest-estimate ambiguity.
//
// Chosen over "highest transitive impact" because the solver (solver.ts) already produces
// a live point-estimate and feasible range for every profile; ranking candidate pairs by
// how close their current estimated totals are directly targets the most under-determined
// part of the model — standard uncertainty-sampling logic for active preference
// elicitation. The transitive-impact alternative is cheaper (pure graph reachability, no
// solver call) but optimizes only for question *count*, which part 1's closure already
// gets for free via `isImplied`-based skipping — it doesn't use the solver's output at all
// and is blind to how wrong an estimate might still be. Neither is established as
// objectively superior for this domain; this is the one that composes with what's already
// built.

import type { Profile } from './preferenceGraph.js';
import { scoreProfile, type LevelValue } from './solver.js';

export interface CandidatePair {
  profileA: Profile;
  profileB: Profile;
}

function profileRangeWidth(profile: Profile, values: LevelValue[][]): number {
  let total = 0;
  for (const key of Object.keys(profile)) {
    const c = Number(key);
    const level = profile[c];
    const v = values[c][level];
    total += v.max - v.min;
  }
  return total;
}

/**
 * Ranks candidate pairs ascending by ambiguity: pairs whose current solver estimates are
 * closest together come first (most useful to ask next). Ties are broken by preferring
 * the pair whose combined feasible-range width is larger (less pinned down overall).
 */
export function rankCandidatesByAmbiguity(
  candidates: readonly CandidatePair[],
  values: LevelValue[][]
): CandidatePair[] {
  const scored = candidates.map((pair) => {
    const estimateA = scoreProfile(pair.profileA, values);
    const estimateB = scoreProfile(pair.profileB, values);
    const estimateGap = Math.abs(estimateA - estimateB);
    const combinedRangeWidth =
      profileRangeWidth(pair.profileA, values) + profileRangeWidth(pair.profileB, values);
    return { pair, estimateGap, combinedRangeWidth };
  });

  scored.sort((a, b) => {
    if (Math.abs(a.estimateGap - b.estimateGap) > 1e-9) return a.estimateGap - b.estimateGap;
    return b.combinedRangeWidth - a.combinedRangeWidth;
  });

  return scored.map((s) => s.pair);
}
