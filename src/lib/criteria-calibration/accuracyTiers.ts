// Accuracy tier helpers for Criteria Calibration.
//
// All three tiers (Medium, High, Very High) are now solver-accuracy thresholds — a
// product judgment call, NOT settled math — see the threshold constants below,
// explicitly flagged as provisional.
//
// Medium's definition changed 2026-08-08 (see docs/decisions/criteria-calibration-medium-gate-redesign.md):
// it used to require every canonical degree-2 pair (cold-start's extremes-only
// comparisons) resolved via the strict graph's closure. That definition was replaced
// because it measured pair-coverage bookkeeping, not actual model determinacy — a real
// production account reached the old Medium at 0.60 solver accuracy with levels 2-4
// completely unconstrained for every criterion, while a real reference session (see
// fixtures.ts's REAL_SESSION_* export) reached 0.88+ accuracy while never once touching
// one of its 10 possible degree-2 pairs. `ComparisonPair`/ `PreferenceGraph.isImplied`
// are no longer involved in the Medium decision; they're still used by
// sessionProgress.ts's `degree2CoveragePercent` for the UI's progress display, which is
// unchanged.

import type { Profile } from './preferenceGraph.js';
import type { ValueSolverResult } from './solver.js';

export interface ComparisonPair {
  profileA: Profile;
  profileB: Profile;
}

// PROVISIONAL — same unvalidated-constant status as HIGH/VERY_HIGH_ACCURACY_THRESHOLD
// below. Chosen so Medium sits meaningfully below the real reference session's ~0.88
// accuracy at its 20-answer degree-2 milestone, without being so low it's trivially
// satisfied by a handful of cold-start-only answers. Final calibration deferred to the
// planned real calibration session on the current 6-criteria model — do not tighten or
// loosen this without that session's data.
export const MEDIUM_ACCURACY_THRESHOLD = 0.85;

/** Medium tier: solver accuracy (see computeSolverAccuracy) has crossed the provisional threshold. */
export function isMediumTierReached(accuracy: number): boolean {
  return accuracy >= MEDIUM_ACCURACY_THRESHOLD;
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
