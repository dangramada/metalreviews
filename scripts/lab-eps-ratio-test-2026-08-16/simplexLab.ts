// EPS = 1e-9 near-singular-pivot diagnostic (2026-08-16) — instrumented, pluggable copy of
// src/lib/criteria-calibration/simplex.ts.
//
// READ-ONLY DIAGNOSTIC. This file is a scratchpad copy; production simplex.ts is untouched.
// Everything below is byte-equivalent to production EXCEPT:
//   1. the leaving-row (ratio test) selection is pluggable via `setRatioRule` — production's
//      behaviour is reproduced exactly by rule 'baseline';
//   2. added instrumentation: max |tableau entry| reached, per-rule counters.
//
// Same convention as lp-lab.mjs in the 2026-08-12 Dantzig stress test: verify line-by-line
// against production before trusting any number that comes out of it.

export type ConstraintType = 'le' | 'ge' | 'eq';

export interface Constraint {
  coeffs: number[];
  type: ConstraintType;
  rhs: number;
}

export interface LinearProgram {
  numVars: number;
  objective: number[];
  constraints: Constraint[];
}

export type LPFailureReason =
  | 'phase1-iteration-cap'
  | 'phase1-unbounded'
  | 'phase1-genuinely-infeasible'
  | 'phase2-iteration-cap'
  | 'phase2-unbounded'
  | 'post-solve-infeasible';

export interface LPDiagnostics {
  reason?: LPFailureReason;
  maxViolation: number;
  minPivotMagnitude: number;
  nearSingularPivot: boolean;
  totalPivots: number;
  /** LAB ONLY: largest |entry| seen anywhere in the tableau after any pivot. */
  maxTableauEntry: number;
}

export interface LPSolution {
  feasible: boolean;
  x: number[];
  objectiveValue: number;
  diagnostics: LPDiagnostics;
}

const EPS = 1e-9;
const MAX_ITERATIONS = 2000;
const FEASIBILITY_TOLERANCE = 1e-7;
const NEAR_SINGULAR_PIVOT_THRESHOLD = 1e-7;
const PHASE1_FEASIBILITY_TOLERANCE = 1e-6;

// ---------------------------------------------------------------------------------------
// Pluggable ratio test
// ---------------------------------------------------------------------------------------

export type RatioRuleName =
  /** Production today: min ratio, `coeff > EPS` eligibility, smallest-basis-index tie-break. */
  | 'baseline'
  /** Candidate 1a: identical eligibility + min ratio, but ties broken on LARGEST |pivot|. */
  | 'magnitude-tiebreak'
  /** Candidate 1b: eligibility floor raised to `pivotFloor` (with EPS fallback if no row
   *  qualifies, so boundedness detection is unchanged), plus largest-|pivot| tie-break. */
  | 'magnitude-floor'
  /** Candidate 2: Harris two-pass — relaxed step bound from `delta`, then largest |pivot|
   *  among rows within that bound. `pivotFloor` acts as Harris's own pivot tolerance. */
  | 'harris';

export interface RatioRuleConfig {
  name: RatioRuleName;
  /** Magnitude floor for pivot eligibility ('magnitude-floor', 'harris'). */
  pivotFloor: number;
  /** Harris feasibility relaxation delta. */
  delta: number;
}

let RULE: RatioRuleConfig = { name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 };

export function setRatioRule(cfg: Partial<RatioRuleConfig> & { name: RatioRuleName }): void {
  RULE = { pivotFloor: 1e-7, delta: 1e-9, ...cfg };
}
export function getRatioRule(): RatioRuleConfig {
  return RULE;
}

// ---------------------------------------------------------------------------------------
// LAB ONLY: per-pivot drift trace, for the "is periodic refactorization applicable?" question.
//
// Classical refactorization purges round-off ACCUMULATED in an explicit B^-1 / eta file. The
// dense-tableau equivalent would be re-deriving the basic rows from the original A, b instead
// of compounding row-reduction history. Whether that could help at all depends on whether the
// tableau's drift from the exact basic solution builds up gradually (refactorization helps) or
// arrives in one catastrophic pivot (it cannot). This measures exactly that: after every
// pivot, x_B is recomputed from scratch from the ORIGINAL rows by Gaussian elimination with
// partial pivoting, and compared against the tableau's own RHS column.
// ---------------------------------------------------------------------------------------
interface DriftTrace {
  on: boolean;
  origRows: number[][]; // the rhs-normalized constraint rows, pre-Phase-1 (A | slack | artificial)
  origRhs: number[];
  entries: { phase: string; pivot: number; pivotMag: number; maxTableau: number; drift: number }[];
  phase: string;
}
export const TRACE: DriftTrace = { on: false, origRows: [], origRhs: [], entries: [], phase: '' };
export function startTrace(phase: string): void {
  TRACE.on = true;
  TRACE.phase = phase;
}
export function stopTrace(): void {
  TRACE.on = false;
}
export function resetTrace(): void {
  TRACE.entries = [];
}

/** Exact basic solution for `basis` from the original rows, by Gaussian elimination with
 *  partial pivoting. Returns null if B is numerically singular. */
function exactBasicSolution(basis: number[]): number[] | null {
  const m = TRACE.origRows.length;
  const M: number[][] = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(m + 1);
    for (let k = 0; k < m; k++) row[k] = TRACE.origRows[i][basis[k]];
    row[m] = TRACE.origRhs[i];
    M.push(row);
  }
  for (let col = 0; col < m; col++) {
    let best = col;
    for (let i = col + 1; i < m; i++) if (Math.abs(M[i][col]) > Math.abs(M[best][col])) best = i;
    if (Math.abs(M[best][col]) < 1e-14) return null;
    [M[col], M[best]] = [M[best], M[col]];
    for (let i = 0; i < m; i++) {
      if (i === col) continue;
      const f = M[i][col] / M[col][col];
      if (f === 0) continue;
      for (let j = col; j <= m; j++) M[i][j] -= f * M[col][j];
    }
  }
  return M.map((row, i) => row[m] / row[i]);
}

/** LAB ONLY counters, reset per solve batch by the runner. */
export const LAB_COUNTERS = {
  /** Times 'magnitude-floor' had to fall back to the EPS floor because nothing cleared it. */
  floorFallbacks: 0,
  /** Times Harris's second pass picked a row that was NOT the strict min-ratio row. */
  harrisDeviations: 0,
  /** Largest (b_i/coeff_i - strictMinRatio) actually accepted by Harris. */
  harrisWorstStepExcess: 0,
};
export function resetLabCounters(): void {
  LAB_COUNTERS.floorFallbacks = 0;
  LAB_COUNTERS.harrisDeviations = 0;
  LAB_COUNTERS.harrisWorstStepExcess = 0;
}

/**
 * Chooses the leaving row for `enter`. Returns -1 when no row is eligible (unbounded).
 * Every rule below must agree with baseline on that -1 verdict, or it changes what the
 * solver reports as unbounded — hence the EPS fallback in 'magnitude-floor'.
 */
function chooseLeavingRow(
  tableau: number[][],
  basis: number[],
  numRows: number,
  enter: number
): number {
  const rhsCol = tableau[0].length - 1;

  if (RULE.name === 'baseline' || RULE.name === 'magnitude-tiebreak') {
    let leave = -1;
    let bestRatio = Infinity;
    for (let i = 0; i < numRows; i++) {
      const coeff = tableau[i][enter];
      if (coeff > EPS) {
        const ratio = tableau[i][rhsCol] / coeff;
        const strictlyBetter = ratio < bestRatio - EPS;
        const tied = Math.abs(ratio - bestRatio) <= EPS;
        const tieWins =
          RULE.name === 'baseline'
            ? leave === -1 || basis[i] < basis[leave]
            : leave === -1 || coeff > tableau[leave][enter];
        if (strictlyBetter || (tied && tieWins)) {
          bestRatio = ratio;
          leave = i;
        }
      }
    }
    return leave;
  }

  if (RULE.name === 'magnitude-floor') {
    // Pass over rows clearing the floor first; only if none does, fall back to the original
    // EPS eligibility so an unbounded column is still detected as unbounded.
    for (const floor of [RULE.pivotFloor, EPS]) {
      let leave = -1;
      let bestRatio = Infinity;
      for (let i = 0; i < numRows; i++) {
        const coeff = tableau[i][enter];
        if (coeff > floor) {
          const ratio = tableau[i][rhsCol] / coeff;
          const strictlyBetter = ratio < bestRatio - EPS;
          const tied = Math.abs(ratio - bestRatio) <= EPS;
          if (strictlyBetter || (tied && (leave === -1 || coeff > tableau[leave][enter]))) {
            bestRatio = ratio;
            leave = i;
          }
        }
      }
      if (leave !== -1) return leave;
      if (floor === RULE.pivotFloor) LAB_COUNTERS.floorFallbacks++;
    }
    return -1;
  }

  // --- Harris two-pass ---
  // Pass 1: the largest step that keeps every basic variable above -delta. Rows below the
  // pivot tolerance are ignored entirely (they are the near-singular ones this exists to
  // avoid), with the same EPS fallback as above so unboundedness is still detected.
  for (const floor of [RULE.pivotFloor, EPS]) {
    let thetaMax = Infinity;
    let strictMin = Infinity;
    let any = false;
    for (let i = 0; i < numRows; i++) {
      const coeff = tableau[i][enter];
      if (coeff > floor) {
        any = true;
        const b = tableau[i][rhsCol];
        const relaxed = (b + RULE.delta) / coeff;
        if (relaxed < thetaMax) thetaMax = relaxed;
        const strict = b / coeff;
        if (strict < strictMin) strictMin = strict;
      }
    }
    if (!any) {
      if (floor === RULE.pivotFloor) LAB_COUNTERS.floorFallbacks++;
      continue;
    }
    // Pass 2: among rows whose strict ratio is within the relaxed bound, take the largest
    // pivot element. This is the whole point of Harris — trade a bounded, deliberate
    // infeasibility (<= delta) for a numerically much safer pivot.
    let leave = -1;
    let bestCoeff = -Infinity;
    for (let i = 0; i < numRows; i++) {
      const coeff = tableau[i][enter];
      if (coeff > floor && tableau[i][rhsCol] / coeff <= thetaMax) {
        if (coeff > bestCoeff) {
          bestCoeff = coeff;
          leave = i;
        }
      }
    }
    if (leave === -1) continue;
    const chosen = tableau[leave][rhsCol] / tableau[leave][enter];
    if (chosen > strictMin + EPS) {
      LAB_COUNTERS.harrisDeviations++;
      const excess = chosen - strictMin;
      if (excess > LAB_COUNTERS.harrisWorstStepExcess) {
        LAB_COUNTERS.harrisWorstStepExcess = excess;
      }
    }
    return leave;
  }
  return -1;
}

interface SimplexRunResult {
  converged: boolean;
  unbounded: boolean;
  minPivotMagnitude: number;
  pivots: number;
  maxTableauEntry: number;
}

function runSimplex(
  tableau: number[][],
  basis: number[],
  numRows: number,
  numVars: number
): SimplexRunResult {
  let minPivotMagnitude = Infinity;
  let pivots = 0;
  let maxTableauEntry = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let enter = -1;
    let bestReducedCost = -EPS;
    for (let j = 0; j < numVars; j++) {
      if (tableau[numRows][j] < bestReducedCost) {
        bestReducedCost = tableau[numRows][j];
        enter = j;
      }
    }
    if (enter === -1) {
      return { converged: true, unbounded: false, minPivotMagnitude, pivots, maxTableauEntry };
    }

    const leave = chooseLeavingRow(tableau, basis, numRows, enter);
    if (leave === -1) {
      return { converged: false, unbounded: true, minPivotMagnitude, pivots, maxTableauEntry };
    }

    const pivotMagnitude = Math.abs(tableau[leave][enter]);
    if (pivotMagnitude < minPivotMagnitude) minPivotMagnitude = pivotMagnitude;

    pivot(tableau, basis, numRows, leave, enter);
    pivots++;

    // LAB ONLY — tableau blow-up is the mechanism under study, so measure it directly.
    for (let i = 0; i <= numRows; i++) {
      const row = tableau[i];
      for (let j = 0; j < row.length; j++) {
        const a = Math.abs(row[j]);
        if (a > maxTableauEntry) maxTableauEntry = a;
      }
    }

    if (TRACE.on) {
      const exact = exactBasicSolution(basis);
      let drift = NaN;
      if (exact) {
        drift = 0;
        const rhsCol = tableau[0].length - 1;
        for (let i = 0; i < numRows; i++) {
          drift = Math.max(drift, Math.abs(tableau[i][rhsCol] - exact[i]));
        }
      }
      TRACE.entries.push({
        phase: TRACE.phase,
        pivot: pivots,
        pivotMag: pivotMagnitude,
        maxTableau: maxTableauEntry,
        drift,
      });
    }
  }
  return { converged: false, unbounded: false, minPivotMagnitude, pivots, maxTableauEntry };
}

export function maxConstraintViolation(constraints: Constraint[], x: number[]): number {
  let worst = 0;
  for (const c of constraints) {
    let lhs = 0;
    for (let j = 0; j < c.coeffs.length; j++) lhs += c.coeffs[j] * (x[j] ?? 0);
    let violation: number;
    if (c.type === 'le') violation = lhs - c.rhs;
    else if (c.type === 'ge') violation = c.rhs - lhs;
    else violation = Math.abs(lhs - c.rhs);
    if (violation > worst) worst = violation;
  }
  for (const xi of x) {
    if (!Number.isFinite(xi)) return Infinity;
    if (-xi > worst) worst = -xi;
  }
  return worst;
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

export interface PreparedLP {
  numOriginal: number;
  numVars: number;
  numRows: number;
  numRealVars: number;
  tableau: number[][];
  basis: number[];
  minPivotMagnitude: number;
  totalPivots: number;
  maxTableauEntry: number;
  failure: LPFailureReason | null;
  constraints: Constraint[];
}

export function prepareLP(numOriginal: number, constraints: Constraint[]): PreparedLP {
  let minPivotMagnitude = Infinity;
  let totalPivots = 0;
  let maxTableauEntry = 0;

  const rows = constraints.map((c) => {
    if (c.rhs < 0) {
      const flippedType: ConstraintType = c.type === 'le' ? 'ge' : c.type === 'ge' ? 'le' : 'eq';
      return { coeffs: c.coeffs.map((v) => -v), type: flippedType, rhs: -c.rhs };
    }
    return { coeffs: c.coeffs.slice(), type: c.type, rhs: c.rhs };
  });

  const numRows = rows.length;

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

  // LAB ONLY: snapshot the untouched rows so the drift trace has an exact reference. Taken
  // here because from this point on `tableau` is mutated in place by every pivot.
  TRACE.origRows = tableau.slice(0, numRows).map((r) => r.slice());
  TRACE.origRhs = tableau.slice(0, numRows).map((r) => r[numVars]);

  const base = {
    numOriginal,
    numVars,
    numRows,
    numRealVars: numOriginal + numSlackSurplus,
    tableau,
    basis,
    constraints,
  };

  if (artificialCols.length > 0) {
    for (const col of artificialCols) tableau[numRows][col] = 1;
    for (let i = 0; i < numRows; i++) {
      const b = basis[i];
      const coeff = tableau[numRows][b];
      if (Math.abs(coeff) > EPS) {
        for (let j = 0; j <= numVars; j++) tableau[numRows][j] -= coeff * tableau[i][j];
      }
    }

    const phase1 = runSimplex(tableau, basis, numRows, numVars);
    minPivotMagnitude = Math.min(minPivotMagnitude, phase1.minPivotMagnitude);
    totalPivots += phase1.pivots;
    maxTableauEntry = Math.max(maxTableauEntry, phase1.maxTableauEntry);
    if (!phase1.converged) {
      return {
        ...base,
        minPivotMagnitude,
        totalPivots,
        maxTableauEntry,
        failure: phase1.unbounded ? 'phase1-unbounded' : 'phase1-iteration-cap',
      };
    }

    const phase1Objective = -tableau[numRows][numVars];
    if (phase1Objective > PHASE1_FEASIBILITY_TOLERANCE) {
      return {
        ...base,
        minPivotMagnitude,
        totalPivots,
        maxTableauEntry,
        failure: 'phase1-genuinely-infeasible',
      };
    }

    for (let i = 0; i < numRows; i++) {
      if (basis[i] < numOriginal + numSlackSurplus) continue;
      let enter = -1;
      let bestMagnitude = EPS;
      for (let j = 0; j < numOriginal + numSlackSurplus; j++) {
        const magnitude = Math.abs(tableau[i][j]);
        if (magnitude > bestMagnitude) {
          bestMagnitude = magnitude;
          enter = j;
        }
      }
      if (enter !== -1) {
        minPivotMagnitude = Math.min(minPivotMagnitude, bestMagnitude);
        totalPivots++;
        pivot(tableau, basis, numRows, i, enter);
      }
    }
  }

  return { ...base, minPivotMagnitude, totalPivots, maxTableauEntry, failure: null };
}

export function solveFromPrepared(prep: PreparedLP, objective: number[]): LPSolution {
  const { numOriginal, numVars, numRows, numRealVars } = prep;
  let minPivotMagnitude = prep.minPivotMagnitude;
  let totalPivots = prep.totalPivots;
  let maxTableauEntry = prep.maxTableauEntry;
  const diagnose = (reason: LPFailureReason | undefined, maxViolation: number): LPDiagnostics => ({
    reason,
    maxViolation,
    minPivotMagnitude,
    nearSingularPivot: minPivotMagnitude < NEAR_SINGULAR_PIVOT_THRESHOLD,
    totalPivots,
    maxTableauEntry,
  });
  const infeasible = (reason: LPFailureReason, maxViolation = NaN): LPSolution => ({
    feasible: false,
    x: new Array(numOriginal).fill(0),
    objectiveValue: NaN,
    diagnostics: diagnose(reason, maxViolation),
  });

  if (prep.failure) return infeasible(prep.failure);

  const tableau: number[][] = new Array(numRows + 1);
  for (let i = 0; i < numRows; i++) tableau[i] = prep.tableau[i].slice();
  tableau[numRows] = new Array(numVars + 1).fill(0);
  const basis = prep.basis.slice();

  for (let j = 0; j < numOriginal; j++) tableau[numRows][j] = objective[j] ?? 0;
  for (let i = 0; i < numRows; i++) {
    const b = basis[i];
    const coeff = tableau[numRows][b];
    if (Math.abs(coeff) > EPS) {
      for (let j = 0; j <= numVars; j++) tableau[numRows][j] -= coeff * tableau[i][j];
    }
  }

  const phase2 = runSimplex(tableau, basis, numRows, numRealVars);
  minPivotMagnitude = Math.min(minPivotMagnitude, phase2.minPivotMagnitude);
  totalPivots += phase2.pivots;
  maxTableauEntry = Math.max(maxTableauEntry, phase2.maxTableauEntry);
  if (phase2.unbounded) return infeasible('phase2-unbounded');
  if (!phase2.converged) return infeasible('phase2-iteration-cap');

  const x = new Array(numOriginal).fill(0);
  for (let i = 0; i < numRows; i++) {
    if (basis[i] < numOriginal) x[basis[i]] = tableau[i][numVars];
  }

  const maxViolation = maxConstraintViolation(prep.constraints, x);
  if (!(maxViolation <= FEASIBILITY_TOLERANCE)) {
    return infeasible('post-solve-infeasible', maxViolation);
  }

  let objectiveValue = 0;
  for (let j = 0; j < numOriginal; j++) objectiveValue += (objective[j] ?? 0) * x[j];

  return { feasible: true, x, objectiveValue, diagnostics: diagnose(undefined, maxViolation) };
}

export function solveLP(lp: LinearProgram): LPSolution {
  return solveFromPrepared(prepareLP(lp.numVars, lp.constraints), lp.objective);
}
