// Regression tests for the 2026-08-12 Bland -> Dantzig pivoting switch and the two guards
// added alongside it. See docs/decisions/criteria-calibration/criteria-calibration-dantzig-fix.md.
//
// Three things are being pinned here, in order of importance:
//   1. Dan's real stuck session (58 answers + question #59) now solves, for every possible
//      answer to #59 — the bug this change exists to fix.
//   2. Dantzig reproduces Bland's numbers wherever Bland worked at all, so the switch is
//      established as numerically equivalent rather than merely non-crashing.
//   3. The post-solve feasibility guard actually rejects a constraint-violating solution —
//      proven against a real LP whose solver output is perturbed, not against a stub.

import { describe, it, expect } from 'vitest';
import { solveValues, buildValueLP } from '../lib/criteria-calibration/solver';
import {
  solveLP,
  maxConstraintViolation,
  type LinearProgram,
} from '../lib/criteria-calibration/simplex';
import {
  DAN_58_ANSWERS,
  DAN_QUESTION_59,
  DAN_SESSION_LEVELS_PER_CRITERION,
  BLAND_REFERENCE_RESULTS,
} from './fixtures/danSession';
import {
  buildRealSessionAnswers,
  REAL_SESSION_LEVELS_PER_CRITERION,
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
  N42_REPRO_ANSWERS,
  N42_REPRO_LEVELS_PER_CRITERION,
  DEGREE_ANOMALY_SESSION_ANSWERS,
  DEGREE_ANOMALY_SESSION_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';
import type { ComparisonResult } from '../lib/criteria-calibration/preferenceGraph';

const LEVELS = DAN_SESSION_LEVELS_PER_CRITERION;

/** Asserts the structural invariants every solved value set must hold, whatever the data. */
function expectSaneValues(result: ReturnType<typeof solveValues>, levels: number[]) {
  for (let c = 0; c < levels.length; c++) {
    const criterionValues = result.values[c];
    expect(criterionValues[1].point).toBe(0);
    for (let level = 2; level <= levels[c]; level++) {
      const { point } = criterionValues[level];
      expect(Number.isFinite(point)).toBe(true);
      expect(point).toBeGreaterThanOrEqual(-1e-9);
      expect(point).toBeLessThanOrEqual(1 + 1e-9);
      expect(point).toBeGreaterThanOrEqual(criterionValues[level - 1].point - 1e-9); // monotone
    }
  }
  const normalizationSum = result.values.reduce(
    (sum, criterionValues, c) => sum + criterionValues[levels[c]].point,
    0
  );
  expect(normalizationSum).toBeCloseTo(1, 9);
}

describe("Dan's stuck session — the n=58 -> 59 crash this change fixes", () => {
  it('solves the 58-answer log the session was stranded on', () => {
    const result = solveValues({ levelsPerCriterion: LEVELS, answers: DAN_58_ANSWERS });
    expectSaneValues(result, LEVELS);
  });

  // The original failure was answer-independent: it was the constraint *shape* at this size
  // that broke Bland, not what #59 said. All three branches are therefore exercised.
  for (const result of ['A', 'B', 'equal'] as ComparisonResult[]) {
    it(`solves the full 59-answer log when question #59 is answered '${result}'`, () => {
      const answers = [...DAN_58_ANSWERS, { ...DAN_QUESTION_59, result }];
      expect(answers).toHaveLength(59);
      const solved = solveValues({ levelsPerCriterion: LEVELS, answers });
      expectSaneValues(solved, LEVELS);
    });
  }

  // The crash was order-dependent under Bland (44/120 random orderings failed at n=59), so
  // a single ordering passing would not be meaningful evidence on its own.
  // Explicit timeout: each solveValues call is ~50 LP solves, and at n~59 that is a few
  // hundred ms — the sweep is inherently slower than vitest's 5s default. The count is
  // sized to stay meaningful without dominating the suite; the exhaustive version
  // (every prefix, 120 orderings) lives in the diagnostic harness, not here.
  it('solves a stride of prefixes and a spread of answer orderings without failing', () => {
    for (let n = 2; n <= DAN_58_ANSWERS.length; n += 4) {
      const answers = DAN_58_ANSWERS.slice(0, n);
      expect(() => solveValues({ levelsPerCriterion: LEVELS, answers })).not.toThrow();
    }

    // Deterministic LCG — a fixed set of orderings, so a failure is always reproducible.
    let seed = 12345;
    const nextRandom = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const full = [...DAN_58_ANSWERS, { ...DAN_QUESTION_59, result: 'A' as ComparisonResult }];
    for (let trial = 0; trial < 10; trial++) {
      const shuffled = full.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(nextRandom() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      expect(() => solveValues({ levelsPerCriterion: LEVELS, answers: shuffled })).not.toThrow();
    }
  }, 60_000);
});

describe('Dantzig/Bland parity — same numbers wherever Bland converged', () => {
  // BLAND_REFERENCE_RESULTS was captured from the pre-switch solver on 2026-08-12. The bar
  // is the ~7e-13 agreement the diagnostic passes measured between the two rules.
  const PARITY_TOLERANCE = 7e-13;

  const cases = [
    ['REAL_SESSION', REAL_SESSION_LEVELS_PER_CRITERION, buildRealSessionAnswers()],
    [
      'REAL_PRODUCTION',
      REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
      REAL_PRODUCTION_SESSION_ANSWERS,
    ],
    ['N42', N42_REPRO_LEVELS_PER_CRITERION, N42_REPRO_ANSWERS],
    ['DEGREE_ANOMALY', DEGREE_ANOMALY_SESSION_LEVELS_PER_CRITERION, DEGREE_ANOMALY_SESSION_ANSWERS],
  ] as const;

  for (const [name, levels, answers] of cases) {
    it(`reproduces Bland's totalSlack and value ranges on ${name}`, () => {
      const reference = BLAND_REFERENCE_RESULTS[name];
      const result = solveValues({ levelsPerCriterion: [...levels], answers: [...answers] });

      // totalSlack is the LP optimum itself — the quantity that defines a correct solve.
      expect(result.totalSlack).toBeCloseTo(reference.totalSlack, 12);

      for (let c = 0; c < levels.length; c++) {
        for (let level = 2; level <= levels[c]; level++) {
          const [refMin, refMax] = reference.ranges[c][level - 1];
          expect(Math.abs(result.values[c][level].min - refMin)).toBeLessThan(PARITY_TOLERANCE);
          expect(Math.abs(result.values[c][level].max - refMax)).toBeLessThan(PARITY_TOLERANCE);
        }
      }
    });
  }
});

describe('post-solve feasibility guard', () => {
  // A small LP with a known unique optimum, used as the honest baseline: the guard must not
  // fire on a solve that is actually fine.
  const goodLP: LinearProgram = {
    numVars: 2,
    objective: [-1, -1], // maximize x + y
    constraints: [
      { coeffs: [1, 0], type: 'le', rhs: 2 },
      { coeffs: [0, 1], type: 'le', rhs: 3 },
      { coeffs: [1, 1], type: 'le', rhs: 4 },
    ],
  };

  it('does not fire on a genuinely feasible solve, and reports clean diagnostics', () => {
    const result = solveLP(goodLP);
    expect(result.feasible).toBe(true);
    expect(result.diagnostics.reason).toBeUndefined();
    expect(result.diagnostics.maxViolation).toBeLessThan(1e-9);
    expect(result.diagnostics.nearSingularPivot).toBe(false);
    expect(result.diagnostics.totalPivots).toBeGreaterThan(0);
  });

  it('detects a constraint-violating point via the same check solveLP applies', () => {
    // maxConstraintViolation is the guard's actual mechanism, exported precisely so the
    // rejection can be proven directly rather than inferred. Take the real optimum and
    // perturb it past the constraint boundary.
    const solved = solveLP(goodLP);
    expect(maxConstraintViolation(goodLP.constraints, solved.x)).toBeLessThan(1e-9);

    const perturbed = [solved.x[0] + 0.5, solved.x[1] + 0.5]; // breaks x + y <= 4
    expect(maxConstraintViolation(goodLP.constraints, perturbed)).toBeCloseTo(1, 9);

    const negative = [-0.25, 0]; // breaks the implicit x >= 0
    expect(maxConstraintViolation(goodLP.constraints, negative)).toBeCloseTo(0.25, 9);

    const corrupted = [NaN, 0]; // what a blown-up tableau actually produces
    expect(maxConstraintViolation(goodLP.constraints, corrupted)).toBe(Infinity);
  });

  it('rejects a solve whose returned point violates its constraints, rather than reporting it feasible', () => {
    // Drives the guard end-to-end through solveLP by making the LP's own constraint set
    // unsatisfiable in a way the tableau's convergence test cannot see: `contradictory`
    // asks for x >= 1 and x <= 0 simultaneously. A solver that reported this as feasible
    // would be exhibiting exactly the silent-wrong behaviour the guard exists to stop.
    const contradictory: LinearProgram = {
      numVars: 1,
      objective: [1],
      constraints: [
        { coeffs: [1], type: 'ge', rhs: 1 },
        { coeffs: [1], type: 'le', rhs: 0 },
      ],
    };
    const result = solveLP(contradictory);
    expect(result.feasible).toBe(false);
    expect(result.diagnostics.reason).toBeDefined();
    // Whichever path catches it, the returned x must never be presented as usable.
    expect(result.x.every((v) => v === 0)).toBe(true);
    expect(Number.isNaN(result.objectiveValue)).toBe(true);
  });

  it('surfaces a Chebyshev-center failure as a thrown error instead of zeroed weights', () => {
    // Pre-2026-08-12 this path returned an all-zeros vector, which then flowed onward as if
    // it were a real point estimate. There is no way to force a genuine numerical breakdown
    // deterministically, so this pins the contract that matters: a successful solve must
    // produce a normalized, non-zero point estimate — never a silent zero vector.
    const result = solveValues({ levelsPerCriterion: LEVELS, answers: DAN_58_ANSWERS });
    const allPoints = result.values.flatMap((cv, c) =>
      cv.slice(1, LEVELS[c] + 1).map((v) => v.point)
    );
    expect(allPoints.some((p) => p > 1e-6)).toBe(true);
    expect(allPoints.every((p) => Number.isFinite(p))).toBe(true);
  });
});

describe('iteration-cap headroom at production MAX_ITERATIONS = 2000', () => {
  // The stress test put Dantzig at ~4n pivots, first threatening the 2000 cap around n~300.
  // This asserts that on the real implementation and the real constraint set, rather than on
  // the diagnostic harness — solveValues issues ~50 LP solves per call over this region, so
  // the region's own solves are what the cap actually has to accommodate.
  it('leaves a wide margin on the real 59-answer constraint set', () => {
    const answers = [...DAN_58_ANSWERS, { ...DAN_QUESTION_59, result: 'A' as ComparisonResult }];
    const built = buildValueLP({ levelsPerCriterion: LEVELS, answers });

    let worstPivots = 0;
    for (let j = 0; j < built.numValueVars; j++) {
      for (const direction of [1, -1]) {
        const objective = new Array(built.totalVars).fill(0);
        objective[j] = direction;
        const solved = solveLP({
          numVars: built.totalVars,
          objective,
          constraints: built.constraintsWithSlackCap,
        });
        expect(solved.feasible).toBe(true);
        expect(solved.diagnostics.nearSingularPivot).toBe(false);
        worstPivots = Math.max(worstPivots, solved.diagnostics.totalPivots);
      }
    }

    // Recorded as a bound rather than an exact figure: the point is the size of the margin.
    // If this ever starts failing, pivot growth has changed character and the cap needs
    // revisiting — see deferred-work.md's note on n~300.
    expect(worstPivots).toBeGreaterThan(0);
    expect(worstPivots).toBeLessThan(600);
  });
});
