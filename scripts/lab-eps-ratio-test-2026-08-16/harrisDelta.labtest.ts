// Q2 — does Harris's deliberate, tolerance-bounded infeasibility collide with the two guards
// that exist to catch numerical corruption?
//
//   FEASIBILITY_TOLERANCE        = 1e-7  (post-solve check on the returned x)
//   PHASE1_FEASIBILITY_TOLERANCE = 1e-6  (sum-of-artificials -> "genuinely infeasible")
//
// Harris relaxes the ratio test by delta, so the basic solution it accepts may sit up to
// ~delta outside a constraint, per pivot. The question is whether that leaks into either
// guard. Measured directly: for each delta, the worst post-solve violation actually seen on
// SUCCESSFUL solves, plus how many solves each guard rejects.
import * as fs from 'node:fs';
import { describe, it } from 'vitest';
import { COMMITTED_FIXTURES } from './sweepCore.js';
import { setRatioRule, solveLP, prepareLP, type Constraint } from './simplexLab.js';
import { buildValueLP } from '../../src/lib/criteria-calibration/solver.js';

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

describe('harris delta vs the guards', () => {
  it('sweeps delta', () => {
    setRatioRule({ name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 });
    const regions: { key: string; widened: Constraint[]; objective: number[]; tv: number }[] = [];
    for (const fx of COMMITTED_FIXTURES) {
      for (let n = 1; n <= fx.answers.length; n++) {
        try {
          const b = buildValueLP({
            levelsPerCriterion: fx.levelsPerCriterion,
            answers: fx.answers.slice(0, n),
          });
          const { widened, objective } = widen(
            b.constraintsWithSlackCap as Constraint[],
            b.totalVars,
            b.numValueVars
          );
          regions.push({ key: `${fx.name}#${n}`, widened, objective, tv: b.totalVars + 1 });
        } catch {
          /* phase 1 failed for this prefix */
        }
      }
    }

    const out: string[] = [
      `regions=${regions.length} (Chebyshev solves — the solve that throws in production)`,
      'delta        feasible  postSolveInfeas  phase1Infeas  otherFail  worstViolationOnSuccess  headroomVs1e-7',
    ];
    for (const delta of [1e-10, 1e-9, 1e-8, 5e-8, 1e-7, 1e-6]) {
      setRatioRule({ name: 'harris', pivotFloor: 1e-7, delta });
      let feasible = 0,
        postSolve = 0,
        phase1 = 0,
        other = 0;
      let worst = 0;
      for (const rg of regions) {
        const r = solveLP({ numVars: rg.tv, objective: rg.objective, constraints: rg.widened });
        if (r.feasible) {
          feasible++;
          worst = Math.max(worst, r.diagnostics.maxViolation);
        } else if (r.diagnostics.reason === 'post-solve-infeasible') postSolve++;
        else if (r.diagnostics.reason === 'phase1-genuinely-infeasible') phase1++;
        else other++;
      }
      out.push(
        `${delta.toExponential(0).padEnd(12)} ${String(feasible).padEnd(9)} ${String(postSolve).padEnd(16)} ` +
          `${String(phase1).padEnd(13)} ${String(other).padEnd(10)} ${worst.toExponential(2).padEnd(23)} ` +
          `${(1e-7 / Math.max(worst, 1e-300)).toExponential(1)}x`
      );
    }

    // Does Harris's slack also inflate the PHASE 1 objective (sum of artificials) toward the
    // 1e-6 gate? Measured on the same regions via prepareLP's own phase-1 result.
    out.push('\nphase-1 artificial-sum gate (PHASE1_FEASIBILITY_TOLERANCE = 1e-6):');
    for (const delta of [1e-9, 1e-8, 1e-7, 1e-6]) {
      setRatioRule({ name: 'harris', pivotFloor: 1e-7, delta });
      let rejected = 0;
      for (const rg of regions) {
        const prep = prepareLP(rg.tv, rg.widened);
        if (prep.failure === 'phase1-genuinely-infeasible') rejected++;
      }
      out.push(`  delta=${delta.toExponential(0)}: phase1 rejected ${rejected}/${regions.length}`);
    }
    fs.writeFileSync(`${OUT}out-harris-delta.txt`, out.join('\n') + '\n');
  });
});
