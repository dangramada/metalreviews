// Unit coverage for degree-tied tiers and the segmented progress bar (2026-08-18) — see
// docs/decisions/criteria-calibration/criteria-calibration-degree-tiers-and-progress.md.
import { describe, it, expect } from 'vitest';
import {
  STARTING_DEGREE,
  clampFillMonotone,
  completedDegrees,
  computeDegreeCoverageFill,
  computeProgressPercent,
  isLabelChangingDegree,
  tierForCompletedDegrees,
  tierForPosition,
} from '../lib/criteria-calibration/degreeTiers';
import { MAX_VALUE_RANGE_FOR_COVERAGE } from '../lib/criteria-calibration/elicitationDriver';
import { ACCURACY_TIER_LABELS } from '../lib/criteria-calibration/accuracyTierLabels';
import type { LevelValue } from '../lib/criteria-calibration/solver';
import type { Profile } from '../lib/criteria-calibration/preferenceGraph';

const LEVELS = [5, 5, 5, 5, 5, 5];
const FREE_VARIABLES = 24; // 6 criteria x levels 2..5

/** Solved values where every free variable has the given feasible width. */
function valuesWithWidth(width: number): LevelValue[][] {
  return LEVELS.map((max) => {
    const perLevel: LevelValue[] = [];
    for (let level = 0; level <= max; level++) {
      perLevel.push({ point: 0, min: 0, max: level >= 2 ? width : 0 });
    }
    return perLevel;
  });
}

/** Answers touching every one of the 24 free (criterion, level) variables at `degree`, so the
 *  touch half of the gate is satisfied and a test can isolate the width half. Built from
 *  disjoint criterion groups of size `degree` — a single answer can only touch `degree`
 *  criteria, which is exactly the property that makes the touch half degree-scoped. */
function answersTouchingEverything(degree: number) {
  const answers: { profileA: Profile; profileB: Profile }[] = [];
  for (let level = 2; level <= 5; level++) {
    for (let start = 0; start < LEVELS.length; start += degree) {
      const profileA: Record<number, number> = {};
      const profileB: Record<number, number> = {};
      for (let c = start; c < Math.min(start + degree, LEVELS.length); c++) {
        profileA[c] = level;
        profileB[c] = level;
      }
      answers.push({ profileA, profileB });
    }
  }
  return answers;
}

describe('degree -> tier mapping', () => {
  it('maps completed degrees to tiers per the approved 2026-08-18 mapping', () => {
    expect(tierForCompletedDegrees(0)).toBe('none');
    expect(tierForCompletedDegrees(1)).toBe('none');
    expect(tierForCompletedDegrees(2)).toBe('medium');
    expect(tierForCompletedDegrees(3)).toBe('high');
    expect(tierForCompletedDegrees(4)).toBe('veryHigh');
  });

  // Degrees 5 and 6 change tau by <= 0.04 non-monotonically and accuracy by <= 0.001 on every
  // trace that reached them, so promoting past Sharp there would be naming a difference that
  // does not exist. Asserted rather than left to the reader.
  it('does not promote past Sharp for degrees 5 and 6', () => {
    expect(tierForCompletedDegrees(5)).toBe('veryHigh');
    expect(tierForCompletedDegrees(6)).toBe('veryHigh');
  });

  it('reads the four rungs as Unfocused / Blurry / Clear / Sharp', () => {
    expect(ACCURACY_TIER_LABELS[tierForCompletedDegrees(1)]).toBe('Unfocused');
    expect(ACCURACY_TIER_LABELS[tierForCompletedDegrees(2)]).toBe('Blurry');
    expect(ACCURACY_TIER_LABELS[tierForCompletedDegrees(3)]).toBe('Clear');
    expect(ACCURACY_TIER_LABELS[tierForCompletedDegrees(4)]).toBe('Sharp');
  });

  // Being AT degree d proves degrees 2..d-1 were exhausted; sitting ON the boundary adds d.
  it('derives completed degrees from the position, counting the boundary itself', () => {
    expect(completedDegrees(STARTING_DEGREE, false)).toBe(1);
    expect(completedDegrees(STARTING_DEGREE, true)).toBe(2);
    expect(completedDegrees(3, false)).toBe(2);
    expect(completedDegrees(3, true)).toBe(3);
    expect(tierForPosition(2, false)).toBe('none');
    expect(tierForPosition(2, true)).toBe('medium');
    expect(tierForPosition(4, false)).toBe('high');
    expect(tierForPosition(4, true)).toBe('veryHigh');
  });

  // Degree 5 was silent before the 2026-08-26 checkpoint copy rewrite (the tier doesn't change
  // there, same as degree 4's own tier). It now gets a screen too, since a permanently-visible
  // badge that's honestly still Sharp is not noise — see
  // docs/decisions/criteria-calibration/criteria-calibration-checkpoint-copy-rewrite.md. Degree
  // 6 stays outside this function: it is always terminal for this catalog and routed to a
  // separate screen by the page, regardless of this function's answer.
  it('shows a checkpoint at every degree boundary except the terminal one', () => {
    expect(isLabelChangingDegree(2)).toBe(true);
    expect(isLabelChangingDegree(3)).toBe(true);
    expect(isLabelChangingDegree(4)).toBe(true);
    expect(isLabelChangingDegree(5)).toBe(true);
    expect(isLabelChangingDegree(6)).toBe(false);
  });
});

describe('within-degree coverage fill', () => {
  it('is 0 when nothing at this degree has been touched, whatever the widths are', () => {
    expect(computeDegreeCoverageFill(LEVELS, valuesWithWidth(0), [], 2)).toBe(0);
  });

  // The load-bearing property: the continuous read reaches exactly 1.0 at the same moment
  // isDegreeCoverageComplete would return true, so the bar's segment fills precisely when the
  // driver ends the degree — no drift between the bar and the gate.
  it("reaches exactly 1 at the coverage gate's own width", () => {
    const answers = answersTouchingEverything(2);
    expect(computeDegreeCoverageFill(LEVELS, valuesWithWidth(0), answers, 2)).toBe(1);
    expect(
      computeDegreeCoverageFill(LEVELS, valuesWithWidth(MAX_VALUE_RANGE_FOR_COVERAGE), answers, 2)
    ).toBe(1);
  });

  it('is 0 for fully undetermined variables and interpolates in between', () => {
    const answers = answersTouchingEverything(2);
    expect(computeDegreeCoverageFill(LEVELS, valuesWithWidth(1), answers, 2)).toBe(0);
    // Halfway between the gate (0.2) and fully undetermined (1.0).
    expect(computeDegreeCoverageFill(LEVELS, valuesWithWidth(0.6), answers, 2)).toBeCloseTo(0.5, 6);
  });

  // Degree-scoped touch counting, matching the 2026-08-11 coverage fix: answers given at a
  // different degree do not count toward this degree's fill.
  it('counts only answers logged at the degree being measured', () => {
    const answers = answersTouchingEverything(2);
    expect(computeDegreeCoverageFill(LEVELS, valuesWithWidth(0), answers, 3)).toBe(0);
  });

  it('counts partial coverage proportionally over all free variables', () => {
    // One answer at degree 2 touches criteria 0 and 1 at level 5 only: 2 of 24 variables.
    const answers = [{ profileA: { 0: 5, 1: 5 } as Profile, profileB: { 0: 5, 1: 5 } as Profile }];
    expect(computeDegreeCoverageFill(LEVELS, valuesWithWidth(0), answers, 2)).toBeCloseTo(
      2 / FREE_VARIABLES,
      6
    );
  });
});

describe('segmented progress', () => {
  it('gives each visitable degree an equal segment', () => {
    expect(computeProgressPercent(2, 0, 6)).toBe(0);
    expect(computeProgressPercent(2, 0.5, 6)).toBeCloseTo(10, 6);
    expect(computeProgressPercent(3, 0, 6)).toBeCloseTo(20, 6);
    expect(computeProgressPercent(6, 1, 6)).toBeCloseTo(100, 6);
  });

  // The seam is exact by construction: a degree only ends when its gate is satisfied, at which
  // point fill is 1.0, so the last frame of degree d equals the first frame of degree d+1.
  it('joins the segments exactly at every boundary', () => {
    for (let degree = 2; degree < 6; degree++) {
      expect(computeProgressPercent(degree, 1, 6)).toBeCloseTo(
        computeProgressPercent(degree + 1, 0, 6),
        9
      );
    }
  });

  it('derives the segment count from the catalog rather than hardcoding five', () => {
    // A 5-criterion catalog visits degrees 2..5 — four segments of 25%.
    expect(computeProgressPercent(3, 0, 5)).toBeCloseTo(25, 6);
    expect(computeProgressPercent(5, 1, 5)).toBeCloseTo(100, 6);
  });

  it('clamps out-of-range inputs rather than reporting impossible progress', () => {
    expect(computeProgressPercent(2, -1, 6)).toBe(0);
    expect(computeProgressPercent(6, 5, 6)).toBe(100);
    expect(computeProgressPercent(1, 0, 6)).toBe(0);
  });
});

describe('monotone clamp', () => {
  it('passes the first value through', () => {
    expect(clampFillMonotone(null, { degree: 2, answerCount: 1, fill: 0.3 })).toBe(0.3);
  });

  // The dip this guards against was NOT observed in 945 replayed rounds — the clamp is
  // defensive, against the slack-tolerant solver reporting a wider range for the same evidence.
  it('holds the bar when the fill dips within a degree', () => {
    const previous = { degree: 2, answerCount: 10, fill: 0.62 };
    expect(clampFillMonotone(previous, { degree: 2, answerCount: 11, fill: 0.55 })).toBe(0.62);
  });

  it('still rises when the fill genuinely improves', () => {
    const previous = { degree: 2, answerCount: 10, fill: 0.62 };
    expect(clampFillMonotone(previous, { degree: 2, answerCount: 11, fill: 0.8 })).toBe(0.8);
  });

  it('resets at a degree change, since each degree has its own segment', () => {
    const previous = { degree: 2, answerCount: 30, fill: 1 };
    expect(clampFillMonotone(previous, { degree: 3, answerCount: 30, fill: 0 })).toBe(0);
  });

  // An Undo is a real retreat, not solver noise: holding the bar up would claim coverage the
  // shorter answer log no longer supports.
  it('does not hold the bar across an Undo', () => {
    const previous = { degree: 2, answerCount: 11, fill: 0.62 };
    expect(clampFillMonotone(previous, { degree: 2, answerCount: 10, fill: 0.55 })).toBe(0.55);
  });
});
