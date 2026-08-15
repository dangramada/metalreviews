// Parity tests for the LP warm start: prepareLP + solveFromPrepared must agree with a plain
// solveLP on every path, and a single PreparedLP must stay reusable across many objectives.
//
// scripts/verify-lp-warm-start.ts covers the bit-identity claim broadly (2314 solves over
// every real and synthetic constraint set the calibration path builds). What lives HERE is
// the part that script cannot reach: the failure paths. Those matter disproportionately
// because the split moved the Phase 1 diagnostics accumulators (minPivotMagnitude,
// totalPivots) and the Phase 1 failure reason across a function boundary — if the hand-off
// were wrong, every feasible solve would still be perfect while the guards that exist to
// catch numerical corruption (see simplex.ts's header) would silently report wrong values.
// A happy-path-only suite would never notice.

import { describe, it, expect } from 'vitest';
import {
  prepareLP,
  solveFromPrepared,
  solveLP,
  type Constraint,
  type LinearProgram,
  type LPSolution,
} from '../lib/criteria-calibration/simplex';
import { buildValueLP, profileCoeffs } from '../lib/criteria-calibration/solver';
import { defaultSamplePairs } from '../lib/criteria-calibration/scoreSpreadAccuracy';
import {
  buildRealSessionAnswers,
  REAL_SESSION_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';

/** Every field that could drift if the prepare/solve split were wrong. */
function fingerprint(s: LPSolution) {
  return {
    feasible: s.feasible,
    objectiveValue: s.objectiveValue,
    x: s.x,
    reason: s.diagnostics.reason,
    maxViolation: s.diagnostics.maxViolation,
    minPivotMagnitude: s.diagnostics.minPivotMagnitude,
    nearSingularPivot: s.diagnostics.nearSingularPivot,
    totalPivots: s.diagnostics.totalPivots,
  };
}

function expectParity(lp: LinearProgram) {
  const cold = solveLP(lp);
  const warm = solveFromPrepared(prepareLP(lp.numVars, lp.constraints), lp.objective);
  expect(fingerprint(warm)).toEqual(fingerprint(cold));
  return cold;
}

describe('prepareLP/solveFromPrepared parity with solveLP', () => {
  it('matches on a feasible LP, diagnostics included', () => {
    const result = expectParity({
      numVars: 2,
      objective: [-1, -1], // maximize x + y
      constraints: [
        { coeffs: [1, 0], type: 'le', rhs: 2 },
        { coeffs: [0, 1], type: 'le', rhs: 3 },
        { coeffs: [1, 1], type: 'le', rhs: 4 },
      ],
    });
    expect(result.feasible).toBe(true);
    expect(result.diagnostics.totalPivots).toBeGreaterThan(0);
  });

  it('matches on an all-le LP, where Phase 1 is skipped entirely', () => {
    // No artificials needed, so prepareLP returns the untouched all-slack basis and its
    // accumulators stay at their initial values (minPivotMagnitude = Infinity, 0 pivots).
    // That hand-off is a distinct code path from the post-Phase-1 one above.
    const result = expectParity({
      numVars: 2,
      objective: [-2, -1],
      constraints: [
        { coeffs: [1, 1], type: 'le', rhs: 5 },
        { coeffs: [3, 1], type: 'le', rhs: 9 },
      ],
    });
    expect(result.feasible).toBe(true);
  });

  it('matches when Phase 1 proves the constraints genuinely infeasible', () => {
    // x >= 1 and x <= 0 cannot both hold. The failure is a property of the constraints, so
    // prepareLP records it once and solveFromPrepared has to replay it faithfully.
    const result = expectParity({
      numVars: 1,
      objective: [1],
      constraints: [
        { coeffs: [1], type: 'ge', rhs: 1 },
        { coeffs: [1], type: 'le', rhs: 0 },
      ],
    });
    expect(result.feasible).toBe(false);
    expect(result.diagnostics.reason).toBeDefined();
    expect(result.x.every((v) => v === 0)).toBe(true);
    expect(Number.isNaN(result.objectiveValue)).toBe(true);
  });

  it('matches when Phase 2 is unbounded', () => {
    // Feasible region is non-empty but the objective decreases forever, so this fails in
    // Phase 2 — after the prepared hand-off rather than before it.
    const result = expectParity({
      numVars: 1,
      objective: [-1], // maximize x, unbounded above
      constraints: [{ coeffs: [1], type: 'ge', rhs: 1 }],
    });
    expect(result.feasible).toBe(false);
    expect(result.diagnostics.reason).toBe('phase2-unbounded');
  });

  it('replays an infeasible constraint set identically for every objective', () => {
    const constraints: Constraint[] = [
      { coeffs: [1, 0], type: 'ge', rhs: 1 },
      { coeffs: [1, 0], type: 'le', rhs: 0 },
    ];
    const prep = prepareLP(2, constraints);
    for (const objective of [
      [1, 0],
      [0, 1],
      [-1, -1],
    ]) {
      const warm = solveFromPrepared(prep, objective);
      const cold = solveLP({ numVars: 2, objective, constraints });
      expect(fingerprint(warm)).toEqual(fingerprint(cold));
      expect(warm.feasible).toBe(false);
    }
  });
});

describe('PreparedLP reuse', () => {
  // The whole point of the warm start is reusing one prep across many objectives, so the
  // thing that must not happen is a solve leaving state behind that changes the next one.
  const answers = buildRealSessionAnswers();
  const lp = buildValueLP({
    levelsPerCriterion: REAL_SESSION_LEVELS_PER_CRITERION,
    answers,
  });

  const objectives = defaultSamplePairs(REAL_SESSION_LEVELS_PER_CRITERION)
    .slice(0, 12)
    .flatMap(([a, b]) => {
      const ca = profileCoeffs(a, lp.varIndex, lp.totalVars);
      const cb = profileCoeffs(b, lp.varIndex, lp.totalVars);
      const diff = ca.map((v, i) => v - cb[i]);
      return [diff.map((v) => -v), diff];
    });

  it('gives every objective the same answer a fresh solve would, across a long reuse run', () => {
    const prep = prepareLP(lp.totalVars, lp.constraintsWithSlackCap);
    for (const objective of objectives) {
      const warm = solveFromPrepared(prep, objective);
      const cold = solveLP({
        numVars: lp.totalVars,
        objective,
        constraints: lp.constraintsWithSlackCap,
      });
      expect(fingerprint(warm)).toEqual(fingerprint(cold));
    }
  });

  it('is order-independent — solving the same objectives in reverse changes nothing', () => {
    // A prep mutated by a solve would make results depend on what ran before them. Comparing
    // forward and reverse traversals of the same prep is a direct test of that.
    const prep = prepareLP(lp.totalVars, lp.constraintsWithSlackCap);
    const forward = objectives.map((o) => fingerprint(solveFromPrepared(prep, o)));

    const reversePrep = prepareLP(lp.totalVars, lp.constraintsWithSlackCap);
    const reversed = [...objectives]
      .reverse()
      .map((o) => fingerprint(solveFromPrepared(reversePrep, o)));
    reversed.reverse();

    expect(reversed).toEqual(forward);
  });

  it('leaves the prepared tableau and basis untouched', () => {
    const prep = prepareLP(lp.totalVars, lp.constraintsWithSlackCap);
    const tableauBefore = prep.tableau.map((row) => [...row]);
    const basisBefore = [...prep.basis];

    for (const objective of objectives) solveFromPrepared(prep, objective);

    expect(prep.tableau).toEqual(tableauBefore);
    expect(prep.basis).toEqual(basisBefore);
  });
});
