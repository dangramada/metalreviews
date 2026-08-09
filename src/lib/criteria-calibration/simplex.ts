// Generic dense two-phase simplex LP solver: minimize c^T x subject to Ax {<=,=,>=} b, x >= 0.
//
// Purpose-built for the small LPs the Criteria Calibration value solver constructs
// (dozens of variables/constraints) — not a general-purpose numerical library. No
// external LP dependency exists in package.json, and none is warranted at this problem
// size; a straightforward dense tableau is simpler to reason about and fast enough.
//
// Two-phase rather than Big-M (was Big-M with BIG_M = 1e7 prior to 2026-08-09, see
// docs/decisions/two-phase-simplex-rewrite.md): Big-M mixes an artificial O(1e7) penalty
// coefficient into the same objective row as the real O(1) costs, which on this problem's
// highly degenerate constraint shape (many monotonicity/answer rows sharing structure,
// lots of zero-ratio ties) was confirmed to blow the tableau's conditioning up to ~1e14
// while `feasible: true` was still (wrongly) reported — the old code's only feasibility
// check verified artificials were out of the basis, never that the simplex loop actually
// reached optimality rather than exhausting the iteration cap. Two-phase avoids injecting
// any penalty into the real objective at all: Phase 1 minimizes only the sum of
// artificials (coefficients are exactly {0,1}) to find a feasible basis, Phase 2 then
// optimizes the real objective from there. Both phases share one pivot loop and both now
// report whether they actually converged (see `runSimplex`'s `converged` flag) — a loop
// that hits MAX_ITERATIONS without reaching optimality is treated as infeasible instead of
// silently returned as a solution.
//
// Bland's rule (first, i.e. smallest-index, negative-reduced-cost column enters; smallest-
// index basic variable wins leaving-row ties) is used in both phases, including the
// Phase-1-to-Phase-2 handoff's degenerate-artificial cleanup, to avoid cycling on this
// problem's degenerate tableaus.

export type ConstraintType = 'le' | 'ge' | 'eq';

export interface Constraint {
  coeffs: number[]; // length === numVars
  type: ConstraintType;
  rhs: number;
}

export interface LinearProgram {
  numVars: number;
  /** Minimize objective^T x. */
  objective: number[];
  constraints: Constraint[];
}

export interface LPSolution {
  feasible: boolean;
  x: number[]; // length === numVars
  objectiveValue: number;
}

const EPS = 1e-9;
const MAX_ITERATIONS = 2000;
// Phase 1 is "feasible" only if the sum of artificials converges to (near) zero. Looser
// than EPS because Phase 1 objective values are accumulated over many pivots on a
// degenerate tableau — matches the tolerance the old Big-M code used for its own
// artificial-value feasibility check.
const PHASE1_FEASIBILITY_TOLERANCE = 1e-6;

interface SimplexRunResult {
  /** True only if the loop exited via optimality (no negative reduced cost); false if it
   *  exhausted MAX_ITERATIONS without converging. */
  converged: boolean;
  /** True if an entering column had no valid leaving row (unbounded objective). */
  unbounded: boolean;
}

/**
 * Runs the simplex pivot loop (Bland's rule) on `tableau`/`basis` in place until optimal,
 * unbounded, or MAX_ITERATIONS is exhausted. `numVars` is the number of structural+slack
 * (non-RHS) columns actually eligible to enter — callers restrict this per phase (Phase 1
 * considers artificial columns as candidates to enter or leave; Phase 2 has already
 * dropped them from consideration entirely).
 */
function runSimplex(
  tableau: number[][],
  basis: number[],
  numRows: number,
  numVars: number
): SimplexRunResult {
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let enter = -1;
    for (let j = 0; j < numVars; j++) {
      if (tableau[numRows][j] < -EPS) {
        enter = j; // Bland's rule: first (smallest-index) negative reduced cost
        break;
      }
    }
    if (enter === -1) return { converged: true, unbounded: false }; // optimal

    let leave = -1;
    let bestRatio = Infinity;
    for (let i = 0; i < numRows; i++) {
      const coeff = tableau[i][enter];
      if (coeff > EPS) {
        const ratio = tableau[i][tableau[i].length - 1] / coeff;
        if (
          ratio < bestRatio - EPS ||
          (Math.abs(ratio - bestRatio) <= EPS && (leave === -1 || basis[i] < basis[leave]))
        ) {
          bestRatio = ratio;
          leave = i;
        }
      }
    }
    if (leave === -1) return { converged: false, unbounded: true };

    pivot(tableau, basis, numRows, leave, enter);
  }
  return { converged: false, unbounded: false }; // iteration cap hit without reaching optimality
}

function pivot(
  tableau: number[][],
  basis: number[],
  numRows: number,
  leave: number,
  enter: number
): void {
  const numCols = tableau[leave].length;
  const p = tableau[leave][enter];
  for (let j = 0; j < numCols; j++) tableau[leave][j] /= p;
  for (let i = 0; i <= numRows; i++) {
    if (i === leave) continue;
    const factor = tableau[i][enter];
    if (Math.abs(factor) > EPS) {
      for (let j = 0; j < numCols; j++) tableau[i][j] -= factor * tableau[leave][j];
    }
  }
  basis[leave] = enter;
}

export function solveLP(lp: LinearProgram): LPSolution {
  const numOriginal = lp.numVars;
  const infeasible = (): LPSolution => ({
    feasible: false,
    x: new Array(numOriginal).fill(0),
    objectiveValue: NaN,
  });

  // Normalize so every constraint has rhs >= 0 (required for the initial basic
  // feasible solution built below).
  const rows = lp.constraints.map((c) => {
    if (c.rhs < 0) {
      const flippedType: ConstraintType = c.type === 'le' ? 'ge' : c.type === 'ge' ? 'le' : 'eq';
      return { coeffs: c.coeffs.map((v) => -v), type: flippedType, rhs: -c.rhs };
    }
    return { coeffs: c.coeffs.slice(), type: c.type, rhs: c.rhs };
  });

  const numRows = rows.length;

  // Each 'le' row gets a slack column; each 'ge' row gets a surplus column AND an
  // artificial column; each 'eq' row gets only an artificial column.
  const rowMeta = rows.map((r) => {
    if (r.type === 'le') return { slackSign: 1, needsArtificial: false };
    if (r.type === 'ge') return { slackSign: -1, needsArtificial: true };
    return { slackSign: 0, needsArtificial: true };
  });

  const numSlackSurplus = rowMeta.filter((m) => m.slackSign !== 0).length;
  const numArtificial = rowMeta.filter((m) => m.needsArtificial).length;
  const numVars = numOriginal + numSlackSurplus + numArtificial;

  let slackCursor = numOriginal;
  let artCursor = numOriginal + numSlackSurplus;
  const slackColOfRow: (number | null)[] = [];
  const artColOfRow: (number | null)[] = [];
  for (const meta of rowMeta) {
    slackColOfRow.push(meta.slackSign !== 0 ? slackCursor++ : null);
    artColOfRow.push(meta.needsArtificial ? artCursor++ : null);
  }
  const artificialCols = artColOfRow.filter((c): c is number => c !== null);

  // numVars + 1 columns: structural/slack/artificial, plus RHS.
  const tableau: number[][] = Array.from({ length: numRows + 1 }, () =>
    new Array(numVars + 1).fill(0)
  );
  const basis: number[] = new Array(numRows).fill(-1);

  for (let i = 0; i < numRows; i++) {
    const row = rows[i];
    for (let j = 0; j < numOriginal; j++) tableau[i][j] = row.coeffs[j] ?? 0;
    const meta = rowMeta[i];
    if (meta.slackSign !== 0) tableau[i][slackColOfRow[i]!] = meta.slackSign;
    if (meta.needsArtificial) {
      tableau[i][artColOfRow[i]!] = 1;
      basis[i] = artColOfRow[i]!;
    } else {
      basis[i] = slackColOfRow[i]!;
    }
    tableau[i][numVars] = row.rhs;
  }

  // If nothing needs an artificial variable, the all-slack basis built above is already
  // feasible — skip Phase 1 entirely and go straight to Phase 2 on it.
  if (artificialCols.length > 0) {
    // --- Phase 1: minimize sum of artificial variables only. No real objective, no Big-M —
    // the objective row's only nonzero entries are 1 on each artificial column.
    for (const col of artificialCols) tableau[numRows][col] = 1;
    // Artificials start basic, so their reduced cost must be driven to zero by eliminating
    // them via their (already-identity) constraint rows.
    for (let i = 0; i < numRows; i++) {
      const b = basis[i];
      const coeff = tableau[numRows][b];
      if (Math.abs(coeff) > EPS) {
        for (let j = 0; j <= numVars; j++) tableau[numRows][j] -= coeff * tableau[i][j];
      }
    }

    const phase1 = runSimplex(tableau, basis, numRows, numVars);
    if (!phase1.converged) return infeasible(); // hit iteration cap or unbounded (shouldn't happen: cost >= 0)

    const phase1Objective = -tableau[numRows][numVars]; // objective row's RHS is -objectiveValue
    if (phase1Objective > PHASE1_FEASIBILITY_TOLERANCE) return infeasible(); // genuinely infeasible

    // Drive any artificial still basic (necessarily at ~0, since Phase 1 objective ~0) out
    // of the basis, so Phase 2 never has to consider an artificial column. Bland's rule
    // (smallest eligible column) picks the replacement to stay consistent with the main
    // loop's anti-cycling rule.
    for (let i = 0; i < numRows; i++) {
      if (basis[i] < numOriginal + numSlackSurplus) continue; // not an artificial
      let enter = -1;
      for (let j = 0; j < numOriginal + numSlackSurplus; j++) {
        if (Math.abs(tableau[i][j]) > EPS) {
          enter = j;
          break;
        }
      }
      if (enter !== -1) pivot(tableau, basis, numRows, i, enter);
      // else: row is redundant (all real/slack coefficients are 0) — leave the artificial
      // basic at 0; it can never re-enter Phase 2 since Phase 2 excludes artificial columns
      // from consideration entirely (see numRealVars below), so it stays pinned at 0.
    }
  }

  // --- Phase 2: real objective, artificial columns excluded from consideration (both from
  // the entering-column search and by construction never re-priced below).
  const numRealVars = numOriginal + numSlackSurplus;
  for (let j = 0; j < numVars + 1; j++) tableau[numRows][j] = 0;
  for (let j = 0; j < numOriginal; j++) tableau[numRows][j] = lp.objective[j] ?? 0;
  for (let i = 0; i < numRows; i++) {
    const b = basis[i];
    const coeff = tableau[numRows][b];
    if (Math.abs(coeff) > EPS) {
      for (let j = 0; j <= numVars; j++) tableau[numRows][j] -= coeff * tableau[i][j];
    }
  }

  const phase2 = runSimplex(tableau, basis, numRows, numRealVars);
  if (phase2.unbounded) return infeasible();
  if (!phase2.converged) return infeasible(); // hit iteration cap without reaching optimality

  const x = new Array(numOriginal).fill(0);
  for (let i = 0; i < numRows; i++) {
    if (basis[i] < numOriginal) x[basis[i]] = tableau[i][numVars];
  }
  let objectiveValue = 0;
  for (let j = 0; j < numOriginal; j++) objectiveValue += (lp.objective[j] ?? 0) * x[j];

  return { feasible: true, x, objectiveValue };
}
