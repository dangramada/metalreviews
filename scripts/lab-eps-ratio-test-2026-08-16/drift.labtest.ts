// Q3 — is periodic refactorization applicable to this dense-tableau solver?
//
// The question is empirical before it is architectural: refactorization exists to purge
// round-off that ACCUMULATES. If the tableau tracks the exact basic solution closely right up
// until one near-singular pivot, and then diverges by orders of magnitude in a single step,
// then no periodic re-derivation schedule can prevent the damage — it can only clean up after
// it, by which point the solve is already wrong. If instead drift grows steadily over many
// pivots, refactorization is a genuine candidate.
//
// Measured on the committed n=44 crash fixture, whose Chebyshev solve is the exact solve that
// throws in production today.
import * as fs from 'node:fs';
import { describe, it } from 'vitest';
import {
  setRatioRule,
  solveLP,
  startTrace,
  stopTrace,
  resetTrace,
  TRACE,
  type Constraint,
} from './simplexLab.js';
import { buildValueLP } from '../../src/lib/criteria-calibration/solver.js';
import {
  SOLVER_CRASH_ANSWERS,
  SOLVER_CRASH_LEVELS_PER_CRITERION,
} from '../../src/lib/criteria-calibration/fixtures.js';

const OUT = new URL('./out/', import.meta.url).pathname;

function widen(constraints: Constraint[], totalVars: number, boundedVarCount: number) {
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
  objective[rIndex] = -1;
  return { widened, objective };
}

describe('drift trace', () => {
  it('accumulated vs. single-pivot blow-up on the n=44 crash fixture', () => {
    const out: string[] = [];
    setRatioRule({ name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 });
    const built = buildValueLP({
      levelsPerCriterion: SOLVER_CRASH_LEVELS_PER_CRITERION,
      answers: SOLVER_CRASH_ANSWERS,
    });
    const { widened, objective } = widen(
      built.constraintsWithSlackCap as Constraint[],
      built.totalVars,
      built.numValueVars
    );

    for (const rule of [
      { name: 'baseline' as const, pivotFloor: 1e-7, delta: 1e-9 },
      { name: 'magnitude-tiebreak' as const, pivotFloor: 1e-7, delta: 1e-9 },
    ]) {
      setRatioRule(rule);
      resetTrace();
      startTrace(rule.name);
      const res = solveLP({ numVars: built.totalVars + 1, objective, constraints: widened });
      stopTrace();
      const e = TRACE.entries;
      out.push(
        `\n--- ${rule.name} --- feasible=${res.feasible} reason=${res.diagnostics.reason ?? '-'} ` +
          `pivots=${e.length} minPivot=${res.diagnostics.minPivotMagnitude.toExponential(3)} ` +
          `maxTableau=${res.diagnostics.maxTableauEntry.toExponential(3)} ` +
          `maxViolation=${res.diagnostics.maxViolation.toExponential(3)}`
      );
      const finiteDrift = e.filter((x) => Number.isFinite(x.drift));
      out.push(
        `  drift samples=${finiteDrift.length}/${e.length} (non-finite = singular basis matrix)`
      );
      // The pivot where max|tableau| makes its single largest jump — the candidate
      // "catastrophic" step.
      let biggestJump = { at: -1, from: 0, to: 0, pivotMag: 0, driftBefore: 0, driftAfter: 0 };
      for (let i = 1; i < e.length; i++) {
        if (
          e[i].maxTableau / Math.max(e[i - 1].maxTableau, 1e-300) >
          biggestJump.to / Math.max(biggestJump.from, 1e-300)
        ) {
          biggestJump = {
            at: i,
            from: e[i - 1].maxTableau,
            to: e[i].maxTableau,
            pivotMag: e[i].pivotMag,
            driftBefore: e[i - 1].drift,
            driftAfter: e[i].drift,
          };
        }
      }
      out.push(
        `  largest single-pivot |tableau| jump: pivot #${biggestJump.at} ` +
          `${biggestJump.from.toExponential(2)} -> ${biggestJump.to.toExponential(2)} ` +
          `(x${(biggestJump.to / biggestJump.from).toExponential(2)}) at pivotMag=${biggestJump.pivotMag.toExponential(2)}; ` +
          `drift ${Number(biggestJump.driftBefore).toExponential(2)} -> ${Number(biggestJump.driftAfter).toExponential(2)}`
      );
      // Drift trajectory in deciles, so gradual growth would be visible as a ramp.
      const step = Math.max(1, Math.floor(e.length / 10));
      const samples = [];
      for (let i = 0; i < e.length; i += step) {
        samples.push(
          `p${e[i].pivot}:d=${Number(e[i].drift).toExponential(1)},t=${e[i].maxTableau.toExponential(1)}`
        );
      }
      const last = e[e.length - 1];
      samples.push(
        `p${last.pivot}:d=${Number(last.drift).toExponential(1)},t=${last.maxTableau.toExponential(1)}`
      );
      out.push(`  trajectory: ${samples.join(' ')}`);
      // How many pivots elapse between the first near-singular pivot and the end?
      const firstBad = e.findIndex((x) => x.pivotMag < 1e-7);
      out.push(
        `  first pivot below 1e-7: ${firstBad === -1 ? 'never' : `#${firstBad} of ${e.length} (${e.length - firstBad} pivots remain)`}`
      );
    }
    fs.writeFileSync(`${OUT}out-drift.txt`, out.join('\n') + '\n');
  });
});
