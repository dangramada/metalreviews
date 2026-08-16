// Is the moved point estimate WORSE, BETTER, or just a different pick among equally-optimal
// ties?
//
// totalSlack is identical under every rule (out-deltas.txt), so the fitted region is
// unchanged; only the Chebyshev-center point inside it moves. The Chebyshev solve maximizes
// one number — the inscribed radius r. If every rule attains the SAME optimal r, then all the
// reported points are equally-valid optima of the same LP and the movement is arbitrary
// tie-selection, not one rule being more accurate than another.
//
// computeChebyshevCenter is not exported from solver.ts, so it is reproduced verbatim below
// (checked line-by-line against solver.ts:258-296) with the objective value also returned.
import * as fs from 'node:fs';
import { describe, it } from 'vitest';
import { COMMITTED_FIXTURES } from './sweepCore.js';
import { setRatioRule, solveLP, type Constraint } from './simplexLab.js';
import { buildValueLP } from '../../src/lib/criteria-calibration/solver.js';

const OUT = new URL('./out/', import.meta.url).pathname;

function chebyshev(constraints: Constraint[], totalVars: number, boundedVarCount: number) {
  const rIndex = totalVars;
  const widened: Constraint[] = constraints.map((c) => {
    const norm = Math.sqrt(c.coeffs.reduce((sum, v) => sum + v * v, 0));
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
  const result = solveLP({ numVars: totalVars + 1, objective, constraints: widened });
  return { feasible: result.feasible, radius: result.feasible ? result.x[rIndex] : NaN, result };
}

const RULES = [
  { name: 'baseline' as const, pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-tiebreak' as const, pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-floor' as const, pivotFloor: 1e-3, delta: 1e-9 },
  { name: 'harris' as const, pivotFloor: 1e-7, delta: 1e-8 },
];

describe('center quality', () => {
  it('optimal radius attained per rule', () => {
    const out: string[] = [];
    // Regions are built once, under baseline, so every rule's center is scored against an
    // identical constraint set.
    setRatioRule({ name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 });
    const regions: { key: string; c: Constraint[]; nv: number; tv: number }[] = [];
    for (const fx of COMMITTED_FIXTURES) {
      for (let n = 1; n <= fx.answers.length; n++) {
        try {
          const b = buildValueLP({
            levelsPerCriterion: fx.levelsPerCriterion,
            answers: fx.answers.slice(0, n),
          });
          regions.push({
            key: `${fx.name}#${n}`,
            c: b.constraintsWithSlackCap as Constraint[],
            nv: b.numValueVars,
            tv: b.totalVars,
          });
        } catch {
          /* phase 1 itself failed for this prefix */
        }
      }
    }
    out.push(`regions built: ${regions.length}`);

    const byRule = new Map<string, { radius: number; feasible: boolean }[]>();
    for (const rule of RULES) {
      setRatioRule(rule);
      const key =
        rule.name === 'harris'
          ? `harris(d=${rule.delta})`
          : rule.name === 'magnitude-floor'
            ? `magnitude-floor(${rule.pivotFloor})`
            : rule.name;
      const rows = regions.map((rg) => {
        const { feasible, radius } = chebyshev(rg.c, rg.tv, rg.nv);
        return { radius, feasible };
      });
      byRule.set(key, rows);
      const ok = rows.filter((r) => r.feasible);
      out.push(
        `${key.padEnd(26)} chebyshevSolves=${rows.length} failures=${rows.length - ok.length} ` +
          `meanRadius=${(ok.reduce((s, r) => s + r.radius, 0) / ok.length).toExponential(4)}`
      );
    }

    const base = byRule.get('baseline')!;
    for (const [key, rows] of byRule) {
      if (key === 'baseline') continue;
      let better = 0,
        worse = 0,
        tied = 0,
        rescued = 0;
      let worstRadiusLoss = 0;
      for (let i = 0; i < rows.length; i++) {
        const a = base[i],
          b = rows[i];
        if (!a.feasible && b.feasible) {
          rescued++;
          continue;
        }
        if (!a.feasible || !b.feasible) continue;
        const d = b.radius - a.radius;
        if (d > 1e-9) better++;
        else if (d < -1e-9) {
          worse++;
          worstRadiusLoss = Math.max(worstRadiusLoss, -d);
        } else tied++;
      }
      out.push(
        `  ${key} vs baseline: rescued=${rescued} largerRadius=${better} smallerRadius=${worse} ` +
          `tiedRadius=${tied} worstRadiusLoss=${worstRadiusLoss.toExponential(2)}`
      );
    }
    fs.writeFileSync(`${OUT}out-centers.txt`, out.join('\n') + '\n');
  });
});
