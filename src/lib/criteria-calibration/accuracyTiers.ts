// Accuracy tier helpers for Criteria Calibration.
//
// Medium is concretely defined and checkable directly against the strict graph — no
// solver output needed. High/Very High are a proposed UX/product judgment call based on
// how narrow the solver's feasible ranges have gotten, NOT settled math — see the
// threshold constants below, explicitly flagged pending Dan's confirmation.

import type { PreferenceGraph, Profile } from './preferenceGraph.js';
import type { ValueSolverResult } from './solver.js';

export interface ComparisonPair {
  profileA: Profile;
  profileB: Profile;
}

/** Medium tier: every degree-2 pair is resolved, either directly answered or implied by the strict graph's closure. */
export function isMediumTierReached(
  graph: PreferenceGraph,
  allDegree2Pairs: readonly ComparisonPair[]
): boolean {
  return allDegree2Pairs.every(
    ({ profileA, profileB }) => graph.isImplied(profileA, profileB).implied
  );
}

/**
 * Solver-based accuracy: 1 minus the average feasible-range width across every free
 * (criterion, level) value. Values live on the same normalized 0..1 scale (best-level
 * values across all criteria sum to 1), so this is comparable across problem sizes. A
 * width of 0 for every value (perfectly pinned) gives accuracy 1; totally undetermined
 * values (full-scale ranges) drag it toward 0.
 */
export function computeSolverAccuracy(result: ValueSolverResult): number {
  const widths: number[] = [];
  for (let c = 0; c < result.levelsPerCriterion.length; c++) {
    for (let level = 2; level <= result.levelsPerCriterion[c]; level++) {
      const v = result.values[c][level];
      widths.push(v.max - v.min);
    }
  }
  if (widths.length === 0) return 1;
  const average = widths.reduce((sum, w) => sum + w, 0) / widths.length;
  return Math.max(0, 1 - average);
}

export type SolverAccuracyTier = 'insufficient' | 'high' | 'veryHigh';

// PENDING DAN'S CONFIRMATION (see "Criteria Calibration engine, part 2" brief, Part C).
// These are a proposed UX/product judgment call, not settled math. Calibrated so
// "Very High" roughly lines up with the ~97% figure reported for the real 31-answer
// historical session (20 rounds @ degree 2, 7 @ degree 3, 2 @ degree 4, 2 @ degree 5).
export const HIGH_ACCURACY_THRESHOLD = 0.92;
export const VERY_HIGH_ACCURACY_THRESHOLD = 0.97;

export function solverAccuracyTier(accuracy: number): SolverAccuracyTier {
  if (accuracy >= VERY_HIGH_ACCURACY_THRESHOLD) return 'veryHigh';
  if (accuracy >= HIGH_ACCURACY_THRESHOLD) return 'high';
  return 'insufficient';
}
