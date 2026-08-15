// Kept verification script for the LP warm start (simplex.ts's prepareLP/solveFromPrepared).
// Run with: npx tsx scripts/verify-lp-warm-start.ts
//
// Why this exists as a kept script rather than only a unit test: this solver has a documented
// history of silent numerical corruption — Big-M reporting ~1e14 garbage as `feasible: true`
// (two-phase-simplex-rewrite.md), and computeChebyshevCenter degrading to an all-zero point
// estimate that got persisted to real users' rows (criteria-calibration-dantzig-fix.md). In
// both cases the test suite was green. So "the suite passes" is not the bar for a change to
// this file; a direct value-by-value comparison against the pre-change behaviour is.
//
// What it checks: solving each objective with its OWN fresh Phase 1 (`solveLP`) versus
// sharing ONE prepared Phase 1 across every objective (`prepareLP` + `solveFromPrepared`)
// must agree BIT-FOR-BIT — not "within tolerance". That is the claim the warm start rests on:
// from an identical starting tableau and basis, Phase 2 takes an identical pivot path.
// Object.is comparison, so a NaN/-0 discrepancy also registers rather than comparing equal.
//
// Corpus is every constraint-set shape the calibration path actually builds: Dan's real
// 1000minds/PAPRIKA session, both real 6-criterion production sessions kept in fixtures.ts,
// and a synthetic degree-ramp at the answer counts where the cost problem showed up.

import {
  buildHistoricalFixture,
  buildRealSessionAnswers,
  REAL_SESSION_LEVELS_PER_CRITERION,
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
  DEGREE_ANOMALY_SESSION_ANSWERS,
  DEGREE_ANOMALY_SESSION_LEVELS_PER_CRITERION,
  type FixtureConfig,
} from '../src/lib/criteria-calibration/fixtures.js';
import { defaultSamplePairs } from '../src/lib/criteria-calibration/scoreSpreadAccuracy.js';
import {
  buildValueLP,
  profileCoeffs,
  type SolverAnswer,
} from '../src/lib/criteria-calibration/solver.js';
import { prepareLP, solveFromPrepared, solveLP } from '../src/lib/criteria-calibration/simplex.js';

const SYNTHETIC_CONFIG: FixtureConfig = {
  numCriteria: 6,
  levelsPerCriterion: 5,
  roundsByDegree: { 2: 40, 3: 12, 4: 4, 5: 4 },
  poolSizeByDegree: { 2: 10, 3: 8, 4: 6, 5: 5 },
  seed: 42,
};

interface Case {
  label: string;
  levelsPerCriterion: number[];
  answers: SolverAnswer[];
}

function syntheticCase(n: number): Case {
  const rounds = buildHistoricalFixture(SYNTHETIC_CONFIG).slice(0, n);
  return {
    label: `synthetic 6x5, n=${n}`,
    levelsPerCriterion: [5, 5, 5, 5, 5, 5],
    answers: rounds.map((r) => ({ profileA: r.profileA, profileB: r.profileB, result: r.result })),
  };
}

const CASES: Case[] = [
  {
    label: 'PAPRIKA / 1000minds real session (31 answers, 5 criteria)',
    levelsPerCriterion: REAL_SESSION_LEVELS_PER_CRITERION,
    answers: buildRealSessionAnswers(),
  },
  {
    label: `real production session (${REAL_PRODUCTION_SESSION_ANSWERS.length} answers, 6 criteria)`,
    levelsPerCriterion: REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
    answers: REAL_PRODUCTION_SESSION_ANSWERS,
  },
  {
    label: `degree-anomaly session (${DEGREE_ANOMALY_SESSION_ANSWERS.length} answers, 6 criteria)`,
    levelsPerCriterion: DEGREE_ANOMALY_SESSION_LEVELS_PER_CRITERION,
    answers: DEGREE_ANOMALY_SESSION_ANSWERS,
  },
  ...[10, 20, 30, 40, 50, 59].map(syntheticCase),
];

/**
 * Every objective the calibration path solves against a given answer log's slack-capped
 * region: the score-spread max/min pair per sampled profile pair, plus the min/max pair per
 * free value variable that solveValues's pass 2 uses.
 */
function objectivesFor(lp: ReturnType<typeof buildValueLP>, levelsPerCriterion: number[]) {
  const objs: number[][] = [];

  for (const [a, b] of defaultSamplePairs(levelsPerCriterion)) {
    const ca = profileCoeffs(a, lp.varIndex, lp.totalVars);
    const cb = profileCoeffs(b, lp.varIndex, lp.totalVars);
    const diff = ca.map((v, i) => v - cb[i]);
    objs.push(
      diff.map((v) => -v),
      diff
    );
  }

  for (let idx = 0; idx < lp.numValueVars; idx++) {
    const objMin = new Array(lp.totalVars).fill(0);
    objMin[idx] = 1;
    const objMax = new Array(lp.totalVars).fill(0);
    objMax[idx] = -1;
    objs.push(objMin, objMax);
  }

  return objs;
}

let totalSolves = 0;
let totalMismatches = 0;

console.log('\nLP warm-start bit-identity verification');
console.log('cold = fresh Phase 1 per objective (solveLP), warm = one shared prepared Phase 1\n');

for (const testCase of CASES) {
  const lp = buildValueLP({
    levelsPerCriterion: testCase.levelsPerCriterion,
    answers: testCase.answers,
  });
  const objs = objectivesFor(lp, testCase.levelsPerCriterion);

  const prep = prepareLP(lp.totalVars, lp.constraintsWithSlackCap);

  let mismatches = 0;
  let worstDelta = 0;
  const noteDelta = (a: number, b: number) => {
    if (Object.is(a, b)) return;
    mismatches++;
    const d = Math.abs(a - b);
    if (d > worstDelta || Number.isNaN(d)) worstDelta = Number.isNaN(d) ? Infinity : d;
  };

  for (const objective of objs) {
    const cold = solveLP({
      numVars: lp.totalVars,
      objective,
      constraints: lp.constraintsWithSlackCap,
    });
    const warm = solveFromPrepared(prep, objective);
    totalSolves++;

    if (cold.feasible !== warm.feasible) mismatches++;
    noteDelta(cold.objectiveValue, warm.objectiveValue);
    for (let j = 0; j < cold.x.length; j++) noteDelta(cold.x[j], warm.x[j]);

    // Diagnostics parity matters as much as the values: they are what the Dantzig-era guards
    // report on, and a warm start that silently reset them would blind those guards.
    if (cold.diagnostics.reason !== warm.diagnostics.reason) mismatches++;
    if (cold.diagnostics.nearSingularPivot !== warm.diagnostics.nearSingularPivot) mismatches++;
    if (cold.diagnostics.totalPivots !== warm.diagnostics.totalPivots) mismatches++;
    noteDelta(cold.diagnostics.maxViolation, warm.diagnostics.maxViolation);
    noteDelta(cold.diagnostics.minPivotMagnitude, warm.diagnostics.minPivotMagnitude);
  }

  totalMismatches += mismatches;
  const status = mismatches === 0 ? 'OK  ' : 'FAIL';
  console.log(
    `${status} ${testCase.label.padEnd(52)} ${String(objs.length).padStart(4)} solves, ` +
      `${mismatches} mismatches` +
      (mismatches ? `, worst delta ${worstDelta}` : '')
  );
}

console.log(`\n${totalSolves} solves compared across ${CASES.length} constraint sets.`);
if (totalMismatches === 0) {
  console.log('PASS — every value bit-for-bit identical between cold and warm solves.\n');
} else {
  console.error(`FAIL — ${totalMismatches} mismatched values. Do not ship.\n`);
  process.exitCode = 1;
}
