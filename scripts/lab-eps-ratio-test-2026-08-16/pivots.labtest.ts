// Pivot-count effect of each rule.
//
// Two reasons this matters beyond performance:
//  1. deferred-work.md item 4 tracks MAX_ITERATIONS = 2000 headroom.
//  2. baseline's leaving-row tie-break is smallest-basis-index — a Bland-flavoured
//     anti-cycling device. Every candidate here replaces it with largest-|pivot|, removing
//     that. (No anti-cycling guarantee actually survives in production anyway: the ENTERING
//     rule became Dantzig in 2026-08-12, and Bland's guarantee needs both halves.) Cycling
//     would show up as iteration-cap failures and runaway pivot counts, so this is the check.
import * as fs from 'node:fs';
import { describe, it } from 'vitest';
import { COMMITTED_FIXTURES } from './sweepCore.js';
import { setRatioRule, solveLP, type Constraint, type RatioRuleConfig } from './simplexLab.js';
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

const RULES: RatioRuleConfig[] = [
  { name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-tiebreak', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-floor', pivotFloor: 1e-3, delta: 1e-9 },
  { name: 'harris', pivotFloor: 1e-7, delta: 1e-8 },
];

describe('pivot counts', () => {
  it('per rule, across every committed prefix', () => {
    setRatioRule({ name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 });
    const regions: { widened: Constraint[]; objective: number[]; tv: number }[] = [];
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
          regions.push({ widened, objective, tv: b.totalVars + 1 });
        } catch {
          /* phase 1 failed */
        }
      }
    }
    const out: string[] = [`regions=${regions.length}`];
    for (const rule of RULES) {
      setRatioRule(rule);
      const pivots: number[] = [];
      let capHits = 0;
      let minPivotOverall = Infinity;
      for (const rg of regions) {
        const r = solveLP({ numVars: rg.tv, objective: rg.objective, constraints: rg.widened });
        pivots.push(r.diagnostics.totalPivots);
        minPivotOverall = Math.min(minPivotOverall, r.diagnostics.minPivotMagnitude);
        if (r.diagnostics.reason?.includes('iteration-cap')) capHits++;
      }
      pivots.sort((a, b) => a - b);
      const key =
        rule.name === 'harris'
          ? `harris(d=${rule.delta})`
          : rule.name === 'magnitude-floor'
            ? `mag-floor(${rule.pivotFloor})`
            : rule.name;
      out.push(
        `${key.padEnd(24)} medianPivots=${pivots[Math.floor(pivots.length / 2)]} ` +
          `p95=${pivots[Math.floor(pivots.length * 0.95)]} max=${pivots[pivots.length - 1]} ` +
          `iterationCapHits=${capHits} minPivotAcrossAll=${minPivotOverall.toExponential(2)}`
      );
    }
    fs.writeFileSync(`${OUT}out-pivots.txt`, out.join('\n') + '\n');
  });
});
