// Adversarial sweep — the regime criteria-calibration-dantzig-stress-test.md Result 5 named
// as where Dantzig still breaks down: high 'equal' share and high self-contradiction rate at
// n >= 150. That pass's harness was scratchpad-only and not committed, so the generator is
// rebuilt here to the same SEPARATED design (equal-share varied WITHOUT changing consistency;
// contradiction rate varied separately) rather than reusing numbers from the old doc.
//
// Crucially, 'equal' answers here are genuinely TRUE under the hidden oracle: a tied pair is
// constructed by permuting one profile's level assignment across criteria that share a
// weight, so the oracle really is indifferent. That is what keeps track A consistent — the
// old pass explicitly flagged that overwriting answers with 'equal' coin-flips conflates the
// two variables.
//
// Solve path: buildValueLP (phase 1) + the Chebyshev centre solve. That is where every
// observed crash actually originates (the committed n=44 fixture throws from
// computeChebyshevCenter); the 48 per-variable range solves are skipped purely for runtime.
import * as fs from 'node:fs';
import { describe, it } from 'vitest';
import {
  setRatioRule,
  solveLP as labSolveLP,
  type Constraint,
  type RatioRuleConfig,
} from './simplexLab.js';
import { solveLP as prodSolveLP } from '../../src/lib/criteria-calibration/simplex.js';

import { buildValueLP } from '../../src/lib/criteria-calibration/solver.js';
import type { SolverAnswer } from '../../src/lib/criteria-calibration/solver.js';
import type {
  Profile,
  ComparisonResult,
} from '../../src/lib/criteria-calibration/preferenceGraph.js';

// This file builds its Chebyshev LP and solves it DIRECTLY, so unlike oracles.labtest.ts it
// is not switched by dropping the vitest alias — that alias only redirects solver.ts's own
// import. LAB_PROD_SIMPLEX=1 therefore exists to point this file's solve at the shipped
// simplex.ts, which is how the sweep gets re-confirmed against production rather than
// against the lab copy (added 2026-08-16 alongside lab.prod.vitest.config.ts). Default is
// unchanged, so the frozen diagnostic numbers stay reproducible.
const USE_PROD_SIMPLEX = process.env.LAB_PROD_SIMPLEX === '1';
const solveLP = USE_PROD_SIMPLEX ? prodSolveLP : labSolveLP;

const OUT = new URL('./out/', import.meta.url).pathname;

const LEVELS = [5, 5, 5, 5, 5, 5];
const NUM_CRITERIA = 6;
// Uniform weights + linear level spacing: the "most benign" shape, and the one oracle #1 used
// when it crashed at n=79. Uniform weights are also what makes genuinely-tied pairs
// constructible, which track A needs.
const WEIGHT = 1 / NUM_CRITERIA;
const LEVEL_FRACTION = [0, 0, 0.25, 0.5, 0.75, 1.0]; // index by level 1..5

function gtScore(p: Profile): number {
  let t = 0;
  for (const k of Object.keys(p)) t += WEIGHT * LEVEL_FRACTION[p[Number(k)]];
  return t;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** A pair over `degree` criteria. If `tied`, B is A's level multiset re-assigned to a
 *  different criterion subset — identical score under uniform weights, so 'equal' is the
 *  oracle's TRUE answer, not an injected inconsistency. */
function makePair(rng: () => number, degree: number, tied: boolean): [Profile, Profile] {
  const crits: number[] = [];
  while (crits.length < degree) {
    const c = Math.floor(rng() * NUM_CRITERIA);
    if (!crits.includes(c)) crits.push(c);
  }
  const levelsA = crits.map(() => 1 + Math.floor(rng() * LEVELS[0]));
  const A: Profile = {};
  crits.forEach((c, i) => (A[c] = levelsA[i]));
  const B: Profile = {};
  if (tied) {
    const rotated = [...levelsA.slice(1), levelsA[0]];
    crits.forEach((c, i) => (B[c] = rotated[i]));
  } else {
    crits.forEach((c) => (B[c] = 1 + Math.floor(rng() * LEVELS[0])));
  }
  return [A, B];
}

function generate(
  n: number,
  equalShare: number,
  contradictionRate: number,
  seed: number
): SolverAnswer[] {
  const rng = createRng(seed);
  const answers: SolverAnswer[] = [];
  let guard = 0;
  while (answers.length < n && guard++ < n * 40) {
    const wantTie = rng() < equalShare;
    const degree = 2 + Math.floor(rng() * 3); // degrees 2..4, matching escalation range
    const [A, B] = makePair(rng, degree, wantTie);
    const a = gtScore(A);
    const b = gtScore(B);
    const isTie = Math.abs(a - b) < 1e-12;
    if (wantTie !== isTie) continue; // keep the realised share honest
    let result: ComparisonResult = isTie ? 'equal' : a > b ? 'A' : 'B';
    if (!isTie && rng() < contradictionRate) result = result === 'A' ? 'B' : 'A';
    answers.push({ profileA: A, profileB: B, result });
  }
  return answers;
}

function chebyshev(constraints: Constraint[], totalVars: number, boundedVarCount: number) {
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
  return solveLP({ numVars: totalVars + 1, objective, constraints: widened });
}

interface CellResult {
  failures: number;
  trials: number;
  minPivot: number;
  maxTableau: number;
  realisedEqualShare: number;
  /** Failure reasons, counted. `buildValueLP-throw` means phase 1 itself failed, before the
   *  Chebyshev solve was reached. */
  reasons: Record<string, number>;
  /** Solves whose smallest pivot fell below NEAR_SINGULAR_PIVOT_THRESHOLD — the mechanism
   *  incidence rate, which is the thing a floor is supposed to drive to zero. Distinct from
   *  the failure count: a solve can survive a near-singular pivot. */
  nearSingular: number;
}

function runCell(answers: SolverAnswer[][]): CellResult {
  let failures = 0;
  let minPivot = Infinity;
  let maxTableau = 0;
  let equals = 0;
  let total = 0;
  let nearSingular = 0;
  const reasons: Record<string, number> = {};
  for (const ans of answers) {
    equals += ans.filter((a) => a.result === 'equal').length;
    total += ans.length;
    try {
      const built = buildValueLP({ levelsPerCriterion: LEVELS, answers: ans });
      const r = chebyshev(
        built.constraintsWithSlackCap as Constraint[],
        built.totalVars,
        built.numValueVars
      );
      minPivot = Math.min(minPivot, r.diagnostics.minPivotMagnitude);
      maxTableau = Math.max(maxTableau, r.diagnostics.maxTableauEntry);
      if (r.diagnostics.nearSingularPivot) nearSingular++;
      if (!r.feasible) {
        failures++;
        const k = r.diagnostics.reason ?? 'unknown';
        reasons[k] = (reasons[k] ?? 0) + 1;
      }
    } catch {
      failures++;
      reasons['buildValueLP-throw'] = (reasons['buildValueLP-throw'] ?? 0) + 1;
    }
  }
  return {
    failures,
    trials: answers.length,
    minPivot,
    maxTableau,
    realisedEqualShare: equals / total,
    reasons,
    nearSingular,
  };
}

const ALL_RULES: RatioRuleConfig[] = [
  { name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-tiebreak', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-floor', pivotFloor: 1e-3, delta: 1e-9 },
  { name: 'harris', pivotFloor: 1e-7, delta: 1e-8 },
];
// Baseline is by far the slowest rule here (failing cells burn MAX_ITERATIONS on every
// solve), so it is run separately and its results kept — LAB_RULES filters by name.
const RULE_FILTER = process.env.LAB_RULES ? process.env.LAB_RULES.split(',') : null;
const RULES = RULE_FILTER ? ALL_RULES.filter((r) => RULE_FILTER.includes(r.name)) : ALL_RULES;
const label = (r: RatioRuleConfig) =>
  r.name === 'harris'
    ? `harris(d=${r.delta})`
    : r.name === 'magnitude-floor'
      ? `mag-floor(${r.pivotFloor})`
      : r.name;

const TRIALS = Number(process.env.LAB_TRIALS ?? 20);
const NS = (process.env.LAB_NS ?? '150,300').split(',').map(Number);

describe('adversarial sweep', () => {
  it('equal-share and contradiction-rate tracks', () => {
    const out: string[] = [`trials/cell=${TRIALS} ns=${NS.join(',')}`];

    // Answer logs are generated ONCE and reused across rules, so every rule is scored on
    // literally the same inputs.
    const cells: { track: string; param: number; n: number; logs: SolverAnswer[][] }[] = [];
    for (const n of NS) {
      for (const share of [0, 0.2, 0.45, 0.7, 0.9, 1.0]) {
        cells.push({
          track: 'equal-share',
          param: share,
          n,
          logs: Array.from({ length: TRIALS }, (_, t) => generate(n, share, 0, 7000 + t * 97 + n)),
        });
      }
      for (const contra of [0, 0.15, 0.3, 0.5, 0.75, 1.0]) {
        cells.push({
          track: 'contradiction',
          param: contra,
          n,
          logs: Array.from({ length: TRIALS }, (_, t) =>
            generate(n, 0.25, contra, 31000 + t * 89 + n)
          ),
        });
      }
    }

    for (const rule of RULES) {
      setRatioRule(rule);
      out.push(`\n--- ${label(rule)} ---`);
      for (const cell of cells) {
        const r = runCell(cell.logs);
        out.push(
          `  ${cell.track.padEnd(14)} param=${String(cell.param).padEnd(5)} n=${String(cell.n).padEnd(4)} ` +
            `failures=${r.failures}/${r.trials} nearSingular=${r.nearSingular}/${r.trials} ` +
            `realisedEqual=${(r.realisedEqualShare * 100).toFixed(0)}% ` +
            `minPivot=${r.minPivot.toExponential(2)} maxTableau=${r.maxTableau.toExponential(2)} ` +
            `reasons={${Object.entries(r.reasons)
              .map(([k, v]) => `${k}:${v}`)
              .join(' ')}}`
        );
        fs.writeFileSync(
          `${OUT}out-adversarial-${process.env.LAB_TAG ?? 'all'}.txt`,
          out.join('\n') + '\n'
        );
      }
    }
    fs.writeFileSync(
      `${OUT}out-adversarial-${process.env.LAB_TAG ?? 'all'}.txt`,
      out.join('\n') + '\n'
    );
  });
});
