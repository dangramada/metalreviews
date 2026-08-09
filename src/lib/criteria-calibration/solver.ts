// Slack-tolerant value solver: derives a per-(criterion, level) preference value from a
// full answer log, generic over N criteria / M levels per criterion (levelsPerCriterion
// can even vary per criterion — nothing here hardcodes a uniform M).
//
// Model (matches the additive value-model convention used by pairwise-ranking preference
// tools like 1000minds/PAPRIKA): the worst level of every criterion is fixed at value 0;
// the best-level values across all criteria sum to exactly 1 (so a profile with every
// criterion at its best level scores 1, and the model is just a plain sum per profile).
// Values are solved via linear programming against every answer in the log as a
// constraint. Answers get a per-answer slack variable rather than being hard constraints
// — this is the "slack-tolerant" part: a genuinely contradictory or noisy answer relaxes
// its own constraint (absorbed as inconsistency) instead of making the whole model
// infeasible. See preferenceGraph.ts's `wouldContradict`/CalibrationSession for the
// separate, stricter same-degree closure that this solver does NOT need to agree with —
// the strict graph and this solver serve different purposes (question-skipping vs.
// deriving values) and are allowed to disagree on a given answer.
//
// Three solve passes:
//   1. Minimize total slack across all answers — the best-fit solution given the data.
//   2. For every free (criterion, level) value, solve for its min and max while holding
//      total slack near that phase-1 optimum — this is the "feasible range" per value,
//      the raw signal accuracy tiers are computed from (see accuracyTiers.ts).
//   3. Solve a single joint Chebyshev center (see computeChebyshevCenter below) over the
//      same slack-capped feasible region — this is the reported point estimate. A jointly
//      solved point (as opposed to per-variable independent midpoints) is required for the
//      normalization constraint to hold on the reported values themselves: pass 2's ranges
//      are each optimized on a different axis, so their midpoints don't generally land on
//      the same feasible point, let alone the normalization hyperplane (confirmed live,
//      2026-07-30: real production data produced level-5 values summing to 1.308, not 1 —
//      see docs/decisions/deferred-work.md and the joint-point-estimate decision doc this
//      fix shipped under). The Chebyshev center is an actual feasible point of the LP, so
//      by construction it satisfies normalization exactly (up to LP solver float epsilon).

import type { ComparisonResult, Profile } from './preferenceGraph.js';
import { solveLP, type Constraint } from './simplex.js';

export interface SolverAnswer {
  profileA: Profile;
  profileB: Profile;
  result: ComparisonResult;
}

export interface ValueSolverInput {
  levelsPerCriterion: number[]; // length N; each entry >= 2 (a criterion needs at least a worst and a best level)
  answers: readonly SolverAnswer[];
  /** Minimum enforced gap for a strict preference; defaults to a small value. */
  margin?: number;
}

export interface LevelValue {
  point: number;
  min: number;
  max: number;
}

export interface ValueSolverResult {
  levelsPerCriterion: number[];
  /** values[c][level] valid for level in [1, levelsPerCriterion[c]]; values[c][1] is always {0,0,0}. */
  values: LevelValue[][];
  /** Phase-1 objective value: total slack absorbed across all answers (0 = fully consistent). */
  totalSlack: number;
  /** Slack used by each answer, in the same order as the input `answers` array. */
  perAnswerSlack: number[];
}

const DEFAULT_MARGIN = 1e-4;
const SLACK_CAP_TOLERANCE = 1e-6;

function buildVariableIndex(levelsPerCriterion: number[]): {
  index: Map<string, number>;
  count: number;
} {
  const index = new Map<string, number>();
  let cursor = 0;
  for (let c = 0; c < levelsPerCriterion.length; c++) {
    for (let level = 2; level <= levelsPerCriterion[c]; level++) {
      index.set(`${c}:${level}`, cursor++);
    }
  }
  return { index, count: cursor };
}

function profileCoeffs(
  profile: Profile,
  varIndex: Map<string, number>,
  totalVars: number
): number[] {
  const coeffs = new Array(totalVars).fill(0);
  for (const key of Object.keys(profile)) {
    const c = Number(key);
    const level = profile[c];
    if (level === 1) continue; // fixed at 0, contributes nothing to the sum
    const idx = varIndex.get(`${c}:${level}`);
    if (idx === undefined) {
      throw new Error(
        `Profile references (criterion ${c}, level ${level}) outside the configured levelsPerCriterion.`
      );
    }
    coeffs[idx] += 1;
  }
  return coeffs;
}

/**
 * Chebyshev center: the point maximally interior to a polytope, found via one extra LP
 * variable `r` (the inscribed radius) and widening every inequality row by
 * `r * ||row.coeffs||` so `r` gets squeezed by whichever constraint face is closest.
 * Equality rows (here, just normalization) are copied through unchanged — no `r` term —
 * since they must hold exactly, not just "with room to spare"; this is what makes the
 * result satisfy normalization exactly rather than approximately. `boundedVarCount` value
 * variables (indices [0, boundedVarCount)) additionally get an explicit `x_j - r >= 0` row
 * so the center also sits away from the x >= 0 boundary on those variables — slack
 * variables are deliberately excluded from this (sitting at slack = 0 is desirable, not
 * something to widen away from).
 */
function computeChebyshevCenter(
  constraints: Constraint[],
  totalVars: number,
  boundedVarCount: number
): number[] {
  const rIndex = totalVars;
  const widened: Constraint[] = constraints.map((c) => {
    const norm = Math.sqrt(c.coeffs.reduce((sum, v) => sum + v * v, 0));
    const coeffs = [...c.coeffs, 0];
    if (c.type === 'le') coeffs[rIndex] = norm;
    else if (c.type === 'ge') coeffs[rIndex] = -norm;
    // 'eq' rows: leave the r coefficient at 0 — must hold exactly.
    return { coeffs, type: c.type, rhs: c.rhs };
  });

  for (let j = 0; j < boundedVarCount; j++) {
    const coeffs = new Array(totalVars + 1).fill(0);
    coeffs[j] = 1;
    coeffs[rIndex] = -1;
    widened.push({ coeffs, type: 'ge', rhs: 0 });
  }

  const objective = new Array(totalVars + 1).fill(0);
  objective[rIndex] = -1; // maximize r == minimize -r

  const result = solveLP({ numVars: totalVars + 1, objective, constraints: widened });
  return result.feasible ? result.x.slice(0, totalVars) : new Array(totalVars).fill(0);
}

export function solveValues(input: ValueSolverInput): ValueSolverResult {
  const { levelsPerCriterion, answers } = input;
  const margin = input.margin ?? DEFAULT_MARGIN;

  const { index: varIndex, count: numValueVars } = buildVariableIndex(levelsPerCriterion);
  const numAnswers = answers.length;
  const totalVars = numValueVars + numAnswers;
  const slackIndex = (k: number) => numValueVars + k;

  const constraints: Constraint[] = [];

  // Monotonicity: v[c][level] >= v[c][level-1]. level=2 vs the fixed level-1 value (0) is
  // automatic from x >= 0, so only level >= 3 needs an explicit row.
  for (let c = 0; c < levelsPerCriterion.length; c++) {
    for (let level = 3; level <= levelsPerCriterion[c]; level++) {
      const coeffs = new Array(totalVars).fill(0);
      coeffs[varIndex.get(`${c}:${level}`)!] = 1;
      coeffs[varIndex.get(`${c}:${level - 1}`)!] = -1;
      constraints.push({ coeffs, type: 'ge', rhs: 0 });
    }
  }

  answers.forEach((answer, k) => {
    const coeffsA = profileCoeffs(answer.profileA, varIndex, totalVars);
    const coeffsB = profileCoeffs(answer.profileB, varIndex, totalVars);
    const diff = coeffsA.map((v, i) => v - coeffsB[i]); // exprA - exprB

    if (answer.result === 'equal') {
      const upper = diff.slice();
      upper[slackIndex(k)] = -1; // exprA - exprB - e_k <= 0
      constraints.push({ coeffs: upper, type: 'le', rhs: 0 });

      const lower = diff.map((v) => -v);
      lower[slackIndex(k)] = -1; // exprB - exprA - e_k <= 0
      constraints.push({ coeffs: lower, type: 'le', rhs: 0 });
    } else {
      const preferenceDiff = answer.result === 'A' ? diff : diff.map((v) => -v);
      const row = preferenceDiff.slice();
      row[slackIndex(k)] = 1; // preferenceDiff + s_k >= margin
      constraints.push({ coeffs: row, type: 'ge', rhs: margin });
    }
  });

  // Normalization: sum of each criterion's best-level value = 1.
  const normCoeffs = new Array(totalVars).fill(0);
  for (let c = 0; c < levelsPerCriterion.length; c++) {
    normCoeffs[varIndex.get(`${c}:${levelsPerCriterion[c]}`)!] = 1;
  }
  constraints.push({ coeffs: normCoeffs, type: 'eq', rhs: 1 });

  const phase1Objective = new Array(totalVars).fill(0);
  for (let k = 0; k < numAnswers; k++) phase1Objective[slackIndex(k)] = 1;

  const phase1 = solveLP({ numVars: totalVars, objective: phase1Objective, constraints });
  if (!phase1.feasible) {
    throw new Error(
      'Preference value LP was infeasible even with slack — this should not happen given monotonicity + normalization are always satisfiable; check the solver construction.'
    );
  }
  const totalSlack = phase1.objectiveValue;

  const slackCapCoeffs = new Array(totalVars).fill(0);
  for (let k = 0; k < numAnswers; k++) slackCapCoeffs[slackIndex(k)] = 1;
  const constraintsWithSlackCap: Constraint[] = [
    ...constraints,
    { coeffs: slackCapCoeffs, type: 'le', rhs: totalSlack + SLACK_CAP_TOLERANCE },
  ];

  const centerPoint = computeChebyshevCenter(constraintsWithSlackCap, totalVars, numValueVars);

  const values: LevelValue[][] = levelsPerCriterion.map((m) => new Array(m + 1).fill(undefined));
  for (let c = 0; c < levelsPerCriterion.length; c++) {
    values[c][1] = { point: 0, min: 0, max: 0 };
    for (let level = 2; level <= levelsPerCriterion[c]; level++) {
      const idx = varIndex.get(`${c}:${level}`)!;

      const objMin = new Array(totalVars).fill(0);
      objMin[idx] = 1;
      const minResult = solveLP({
        numVars: totalVars,
        objective: objMin,
        constraints: constraintsWithSlackCap,
      });

      const objMax = new Array(totalVars).fill(0);
      objMax[idx] = -1;
      const maxResult = solveLP({
        numVars: totalVars,
        objective: objMax,
        constraints: constraintsWithSlackCap,
      });

      const minVal = minResult.feasible ? minResult.x[idx] : 0;
      const maxVal = maxResult.feasible ? maxResult.x[idx] : minVal;
      values[c][level] = { point: centerPoint[idx], min: minVal, max: maxVal };
    }
  }

  const perAnswerSlack = answers.map((_, k) => phase1.x[slackIndex(k)]);

  return { levelsPerCriterion, values, totalSlack, perAnswerSlack };
}

export function scoreProfile(profile: Profile, values: LevelValue[][]): number {
  let total = 0;
  for (const key of Object.keys(profile)) {
    const c = Number(key);
    const level = profile[c];
    total += values[c][level].point;
  }
  return total;
}
