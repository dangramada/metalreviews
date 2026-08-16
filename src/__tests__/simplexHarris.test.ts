// Regression tests for the 2026-08-16 Harris two-pass ratio test — the cure for the
// EPS = 1e-9 near-singular-pivot root cause that Dantzig (2026-08-12) only mitigated.
// See docs/decisions/criteria-calibration/criteria-calibration-harris-ratio-test.md and the
// diagnostic it implements, criteria-calibration-eps-ratio-test-diagnostic.md.
//
// What is pinned here, and what deliberately is NOT:
//   - PINNED: the rule's decisions (which row leaves, and why), and the invariant that makes
//     the fix a fix — no pivot below the tolerance is ever taken on real data.
//   - NOT pinned: specific solved values. The diagnostic established that this LP's optimal
//     region is degenerate enough that many points attain the identical optimal Chebyshev
//     radius, and the pivoting rule silently picks among them. Pinning a point estimate here
//     would pin an arbitrary tie-break, not a property of the model — see that doc's
//     "the reported weights are not uniquely determined today".
import { describe, it, expect } from 'vitest';
import {
  chooseLeavingRow,
  solveLP,
  type Constraint,
  type LinearProgram,
} from '../lib/criteria-calibration/simplex';
import { buildValueLP } from '../lib/criteria-calibration/solver';
import {
  SOLVER_CRASH_ANSWERS,
  SOLVER_CRASH_LEVELS_PER_CRITERION,
  N42_REPRO_ANSWERS,
  N42_REPRO_LEVELS_PER_CRITERION,
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
  DEGREE_ANOMALY_SESSION_ANSWERS,
  DEGREE_ANOMALY_SESSION_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';

// Mirrors the private constants in simplex.ts. Duplicated rather than exported: if someone
// changes them there, these tests should fail loudly rather than silently re-target.
const HARRIS_PIVOT_TOLERANCE = 1e-7;
const HARRIS_DELTA = 1e-8;
const FEASIBILITY_TOLERANCE = 1e-7;

/**
 * Builds a tableau for `chooseLeavingRow` from (coefficient, rhs) pairs on the entering
 * column. Column 0 is the entering column; the last column is the RHS.
 */
function tableauOf(rows: [coeff: number, rhs: number][]): number[][] {
  return rows.map(([coeff, rhs]) => [coeff, rhs]);
}

describe('chooseLeavingRow — Harris two-pass ratio test', () => {
  it('declines a near-singular pivot that the strict min-ratio rule would have been forced onto', () => {
    // Row 0 wins the strict ratio race (0 / 1e-9 = 0 vs 1 / 0.5 = 2) but its pivot is exactly
    // the 1e-9 element this whole change exists to avoid dividing by. Row 1 is the safe pick.
    const t = tableauOf([
      [1e-9, 0],
      [0.5, 1],
    ]);
    expect(chooseLeavingRow(t, 2, 0)).toBe(1);
  });

  it('still takes the strict min-ratio row when that row has a healthy pivot', () => {
    // Nothing to trade here: row 0's ratio (1) is far below row 1's (10), and the relaxed
    // bound (1 + delta) does not reach row 1, so the larger pivot must NOT win.
    const t = tableauOf([
      [1, 1],
      [0.1, 1],
    ]);
    expect(chooseLeavingRow(t, 2, 0)).toBe(0);
  });

  it('accepts a longer step only within delta, never beyond it', () => {
    // Row 1's ratio exceeds row 0's by 1e-9, which is inside delta (1e-8) — so its bigger
    // pivot wins. The excess IS the deliberate infeasibility Harris trades for; bounding it
    // is what makes the trade legitimate (and keeps it under FEASIBILITY_TOLERANCE).
    const inside = tableauOf([
      [1, 1],
      [2, 2 * (1 + 1e-9)],
    ]);
    expect(chooseLeavingRow(inside, 2, 0)).toBe(1);

    // Same shape, but row 1 now overshoots by 1e-7 — an order of magnitude past delta. The
    // rule must refuse it and stay on the strict min-ratio row, even though row 1's pivot is
    // twice as large. This is the guardrail the rejected `magnitude-floor` variant lacked:
    // it would have taken row 1 here, with nothing capping the overshoot.
    const outside = tableauOf([
      [1, 1],
      [2, 2 * (1 + 1e-7)],
    ]);
    expect(chooseLeavingRow(outside, 2, 0)).toBe(0);
  });

  it('resolves |pivot| ties to the LOWEST ROW INDEX', () => {
    // Not the lowest basis index, which is what the pre-2026-08-16 rule used — the two
    // coincide only before the first pivot. Nothing depends on which of these rows is chosen
    // (both are equally valid pivots); this pins that the choice is deterministic.
    const t = tableauOf([
      [0.5, 1],
      [0.5, 1],
      [0.5, 1],
    ]);
    expect(chooseLeavingRow(t, 3, 0)).toBe(0);
  });

  it('falls back to the EPS floor rather than misreporting a column as unbounded', () => {
    // The only positive coefficient sits between EPS (1e-9) and the tolerance (1e-7). Pass 1
    // finds nothing at the tolerance and retries at EPS. Skipping the retry would return -1,
    // which the caller reports as UNBOUNDED — changing the solver's verdict, not just its
    // arithmetic. That is why the fallback is not optional.
    const t = tableauOf([
      [1e-8, 1],
      [-1, 1],
    ]);
    expect(chooseLeavingRow(t, 2, 0)).toBe(0);
  });

  it('returns -1 when no row has a positive coefficient (genuinely unbounded)', () => {
    const t = tableauOf([
      [-1, 1],
      [0, 1],
    ]);
    expect(chooseLeavingRow(t, 2, 0)).toBe(-1);
  });

  it('ignores rows outside numRows (the objective row is not a candidate)', () => {
    const t = tableauOf([
      [0.5, 1],
      [10, 0],
    ]);
    expect(chooseLeavingRow(t, 1, 0)).toBe(0);
  });
});

// The invariant that makes this a cure rather than a mitigation: on real answer logs the
// solver never divides by anything near-singular at all. Under the old rule the n=44 fixture
// below took a pivot of 1.91e-9 and blew the tableau from 1.6e+4 to 8.3e+12 in one step.
/**
 * The Chebyshev-center LP for a built region — the solve that actually threw in production
 * (`computeChebyshevCenter`), and the one every recorded crash originated from. Rebuilt here
 * rather than reached through solveValues so the LP's own diagnostics are visible.
 */
function chebyshevLP(
  constraints: Constraint[],
  totalVars: number,
  boundedVarCount: number
): LinearProgram {
  const rIndex = totalVars;
  const widened: Constraint[] = constraints.map((c) => {
    const norm = Math.sqrt(c.coeffs.reduce((s, v) => s + v * v, 0));
    const coeffs = [...c.coeffs, 0];
    if (c.type === 'le') coeffs[rIndex] = norm;
    else if (c.type === 'ge') coeffs[rIndex] = -norm;
    return { coeffs, type: c.type, rhs: c.rhs };
  });
  for (let j = 0; j < boundedVarCount; j++) {
    const coeffs = new Array(totalVars + 1).fill(0);
    coeffs[j] = 1;
    coeffs[rIndex] = -1;
    widened.push({ coeffs, type: 'ge', rhs: 0 });
  }
  const objective = new Array(totalVars + 1).fill(0);
  objective[rIndex] = -1; // maximize the inscribed radius
  return { numVars: totalVars + 1, objective, constraints: widened };
}

describe('no near-singular pivot is taken on any committed real fixture', () => {
  const FIXTURES = [
    ['solver-crash-n44', SOLVER_CRASH_ANSWERS, SOLVER_CRASH_LEVELS_PER_CRITERION],
    ['n42-repro', N42_REPRO_ANSWERS, N42_REPRO_LEVELS_PER_CRITERION],
    [
      'real-production-n33',
      REAL_PRODUCTION_SESSION_ANSWERS,
      REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
    ],
    [
      'degree-anomaly-n31',
      DEGREE_ANOMALY_SESSION_ANSWERS,
      DEGREE_ANOMALY_SESSION_LEVELS_PER_CRITERION,
    ],
  ] as const;

  for (const [name, answers, levelsPerCriterion] of FIXTURES) {
    it(`${name}: minPivotMagnitude stays above the Harris tolerance`, () => {
      const built = buildValueLP({ levelsPerCriterion, answers: [...answers] });
      const solution = solveLP(
        chebyshevLP(built.constraintsWithSlackCap, built.totalVars, built.numValueVars)
      );

      expect(solution.feasible).toBe(true);
      expect(solution.diagnostics.nearSingularPivot).toBe(false);
      expect(solution.diagnostics.minPivotMagnitude).toBeGreaterThanOrEqual(HARRIS_PIVOT_TOLERANCE);
      // Harris's own deliberate slack must stay far under the guard that would flag it as
      // corruption — measured worst case across 181 prefixes is 4.7e-9, 21x under.
      expect(solution.diagnostics.maxViolation).toBeLessThanOrEqual(FEASIBILITY_TOLERANCE);
      expect(solution.diagnostics.maxViolation).toBeLessThanOrEqual(HARRIS_DELTA * 10);
    });
  }
});
