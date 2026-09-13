// Derives the "Your Taste" tab's display data from the same solved model the rest of
// CriteriaCalibrationPage.tsx already computes — no new fetch, no new LP solve. See
// docs/decisions/criteria-calibration/criteria-calibration-results-tab-design-brief.md for the
// full design history (spike findings, corrections) this implements.
import type { LevelValue } from './solver.js';
import type { CriteriaCatalog } from './criteriaCatalog.js';

// Below this, a value displays as "<0.5%" instead of a literal number — the same false-precision
// concern as the rest of this model's display (the LP solver's own stability at this granularity
// is not confirmed; see deferred-work.md). Exactly 0 is handled separately below: it's a
// structural fact (the lowest level of every criterion is always floored to exactly 0 by the
// solver's own normalization), not a small-but-uncertain value.
export const PRECISION_THRESHOLD_PERCENT = 0.5;

// Used by both a criterion's own top-line weight and every one of its level increments — the
// SAME function, deliberately. Because both figures are formatted identically and derived from
// the same unrounded solved values, "the level percentages sum to the displayed criterion
// weight" is a real, verifiable property of the page (e.g. 9.7 + 7.6 + 3.8 + 1.7 = 22.8), not an
// approximation. Rounding the criterion weight to a whole number (the accuracyPercent/badge
// convention elsewhere on this page) would silently break that.
export function formatLevelPercent(value: number): string {
  if (value === 0) return '0%';
  return value < PRECISION_THRESHOLD_PERCENT
    ? `<${PRECISION_THRESHOLD_PERCENT}%`
    : `${value.toFixed(1)}%`;
}

export interface CriterionLevelBreakdown {
  label: string;
  /** Absolute percent of the whole model — same basis as the criterion's own weightPercent, an
   *  increment over the previous level, not a within-criterion fraction. Level 1 is always 0. */
  percent: number;
}

export interface CriterionBreakdown {
  index: number;
  name: string;
  /** Raw, unrounded percent (0-100) — sum of every level's own percent below. */
  weightPercent: number;
  levels: CriterionLevelBreakdown[];
}

/**
 * Builds one entry per catalog criterion, sorted descending by weight (Sections 2 and 3 share
 * this order). Returns null while there's nothing solved yet — callers gate on the tab's own
 * degree-2-exhausted check before ever reaching this, so null in practice only covers the
 * render before that first solve lands.
 */
export function buildCriterionBreakdowns(
  solvedValues: LevelValue[][] | null,
  catalog: CriteriaCatalog | null
): CriterionBreakdown[] | null {
  if (!solvedValues || !catalog) return null;

  const breakdowns: CriterionBreakdown[] = catalog.entries.map((entry) => {
    const top = catalog.levelsPerCriterion[entry.index];
    const values = solvedValues[entry.index];
    const levels: CriterionLevelBreakdown[] = [];
    let previousPoint = 0;
    for (let level = 1; level <= top; level++) {
      const point = values[level]?.point ?? 0;
      levels.push({
        label: entry.levels[level]?.label ?? `Level ${level}`,
        percent: (point - previousPoint) * 100,
      });
      previousPoint = point;
    }
    return {
      index: entry.index,
      name: entry.name,
      weightPercent: previousPoint * 100, // previousPoint is now the top level's cumulative point
      levels,
    };
  });

  return breakdowns.sort((a, b) => b.weightPercent - a.weightPercent);
}

// A "leader" is any criterion within this many percentage points of the top weight — the
// brief's own definition, not a statistical test. Compared on the raw unrounded percent, not the
// formatted display string.
export const TIE_THRESHOLD_POINTS = 2;

export function buildNarrativeLeaders(breakdowns: CriterionBreakdown[]): CriterionBreakdown[] {
  if (breakdowns.length === 0) return [];
  const topWeight = breakdowns[0].weightPercent;
  return breakdowns.filter((b) => topWeight - b.weightPercent <= TIE_THRESHOLD_POINTS);
}
