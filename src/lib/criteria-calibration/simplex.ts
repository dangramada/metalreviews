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
// Dantzig's rule (most-negative reduced cost enters) is used in both phases, including the
// Phase-1-to-Phase-2 handoff's degenerate-artificial cleanup. This replaced Bland's rule on
// 2026-08-12 for NUMERICAL robustness, not for speed — see
// docs/decisions/criteria-calibration-dantzig-fix.md and the stress test it builds on,
// docs/decisions/criteria-calibration-dantzig-stress-test.md.
//
// Why the swap: Bland's rule takes the *first* eligible column, which on this problem's
// constraint shape repeatedly lands on a pivot element sitting right at the EPS floor.
// Dividing a row by a ~1e-9 pivot amplifies rounding error catastrophically — measured
// tableau magnitudes reached 1e46 — and the solve is numerical noise long before Bland's
// anti-cycling guarantee has anything to contribute. The guarantee was never the binding
// concern here: cycling was ruled out as the failure mechanism by direct instrumentation.
// Measured, 300 trials per cell over real + validated synthetic sessions: Bland failed
// 44/120 answer orderings at n=59 and 30/30 at n=150, while Dantzig failed 0 anywhere from
// n=20 to n=300. Across 1760 paired solves there is no case where Bland succeeded and
// Dantzig did not.
//
// Dantzig is a mitigation, not a cure. The root cause is EPS below admitting near-singular
// pivots at all; Dantzig's column choice merely makes them rare. Two guards therefore back
// it up, because a corrupt solve must never be returned as a good one:
//   1. `minPivotMagnitude` tracking — the smallest pivot element used was a *perfect*
//      predictor of failure in the diagnostic (clean solves stay >= ~1e-3; corrupt ones sit
//      at the 1e-9 floor). Recorded and reported, but NOT used to abort on its own: it is a
//      warning signal, and the authoritative check is (2).
//   2. A post-solve feasibility verification — the returned x is checked against every
//      original constraint before `feasible: true` is reported. This closes a silent-wrong
//      mode that survived the Big-M -> two-phase rewrite: `converged` only means "no
//      negative reduced cost was found", which a corrupted tableau can satisfy while the
//      extracted solution violates its own constraints. Under Bland that was happening on
//      ~2/120 of Dan's real answer orderings, reporting a plausible objective alongside a
//      weight vector containing a negative value variable.
//
// Known limitation, deliberately NOT addressed here (see deferred-work.md): on
// pathologically degenerate inputs — answer logs that are majority 'equal' at n >= 100, or
// heavily self-contradictory at n >= 300 — Dantzig degrades too. Guard (2) makes those
// failures loud instead of silent, which is the bar this pass targets; making them not fail
// at all needs the near-singular-pivot admission itself fixed (Harris ratio test or
// refactorization), which is a substantially larger change.

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

/** Why a solve ended the way it did — attached to every LPSolution, success or failure. */
export type LPFailureReason =
  | 'phase1-iteration-cap'
  | 'phase1-unbounded'
  | 'phase1-genuinely-infeasible'
  | 'phase2-iteration-cap'
  | 'phase2-unbounded'
  | 'post-solve-infeasible';

export interface LPDiagnostics {
  /** Set only when `feasible` is false. */
  reason?: LPFailureReason;
  /** Largest constraint violation of the returned `x` (including x >= 0). */
  maxViolation: number;
  /** Smallest |pivot element| divided by across both phases; Infinity if no pivot ran. */
  minPivotMagnitude: number;
  /** True if any pivot element fell below NEAR_SINGULAR_PIVOT_THRESHOLD. */
  nearSingularPivot: boolean;
  /** Total pivots across both phases — for headroom checks against MAX_ITERATIONS. */
  totalPivots: number;
}

export interface LPSolution {
  feasible: boolean;
  x: number[]; // length === numVars
  objectiveValue: number;
  /** Always populated. See LPDiagnostics — callers may ignore it; the guards do not. */
  diagnostics: LPDiagnostics;
}

const EPS = 1e-9;
const MAX_ITERATIONS = 2000;
// Post-solve feasibility bar for the returned x. Chosen from the stress-test distribution,
// which leaves ~2 orders of clearance on both sides: clean Dantzig solves violated by at
// most 6.6e-13 across every realistic case (worst anywhere, including adversarial all-equal
// at n=59: 9.8e-12), while the *smallest* violation seen from a numerically corrupt solve
// was 1.4e-5 (most were 1e-2 .. 1e+5). Deliberately far below DEFAULT_MARGIN (1e-4) in
// solver.ts, so a violation this size can never be confused with a legitimately slack answer.
const FEASIBILITY_TOLERANCE = 1e-7;
// Pivot elements below this are near-singular: dividing a row by one amplifies rounding
// error by ~1/threshold. Two orders above EPS (the eligibility floor the ratio test actually
// uses, left untouched here) and four below the ~1e-3 smallest pivot observed in clean
// solves — so it flags the pathological case without firing on healthy ones.
const NEAR_SINGULAR_PIVOT_THRESHOLD = 1e-7;
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
  /** Smallest |pivot element| this run divided by; Infinity if it never pivoted. */
  minPivotMagnitude: number;
  /** Pivots performed by this run. */
  pivots: number;
}

/**
 * Runs the simplex pivot loop (Dantzig's rule) on `tableau`/`basis` in place until optimal,
 * unbounded, or MAX_ITERATIONS is exhausted. `numVars` is the number of structural+slack
 * (non-RHS) columns actually eligible to enter — callers restrict this per phase (Phase 1
 * considers artificial columns as candidates to enter or leave; Phase 2 has already
 * dropped them from consideration entirely).
 *
 * The leaving-row ratio test is unchanged from the Bland-era code, including its
 * smallest-basis-index tie-break and its `coeff > EPS` eligibility floor. Only the entering
 * column choice changed — see this file's header for why that is the numerically decisive
 * one, and why the EPS floor is deliberately left alone in this pass.
 */
function runSimplex(
  tableau: number[][],
  basis: number[],
  numRows: number,
  numVars: number
): SimplexRunResult {
  let minPivotMagnitude = Infinity;
  let pivots = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Dantzig's rule: the most negative reduced cost enters. Scanning all columns rather
    // than stopping at the first negative one is what steers the ratio test away from the
    // near-singular pivots Bland's first-index choice kept selecting.
    let enter = -1;
    let bestReducedCost = -EPS;
    for (let j = 0; j < numVars; j++) {
      if (tableau[numRows][j] < bestReducedCost) {
        bestReducedCost = tableau[numRows][j];
        enter = j;
      }
    }
    if (enter === -1) return { converged: true, unbounded: false, minPivotMagnitude, pivots }; // optimal

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
    if (leave === -1) return { converged: false, unbounded: true, minPivotMagnitude, pivots };

    // Record the element we are about to divide by. Observation only — a small pivot is not
    // treated as fatal here (the tableau can still recover, and aborting on it would reject
    // solves that verify clean); the post-solve check in solveLP is what decides.
    const pivotMagnitude = Math.abs(tableau[leave][enter]);
    if (pivotMagnitude < minPivotMagnitude) minPivotMagnitude = pivotMagnitude;

    pivot(tableau, basis, numRows, leave, enter);
    pivots++;
  }
  // iteration cap hit without reaching optimality
  return { converged: false, unbounded: false, minPivotMagnitude, pivots };
}

/**
 * Largest amount by which `x` violates any constraint in `constraints`, including the
 * implicit x >= 0. Returns 0 for an exactly feasible point. Used by solveLP's post-solve
 * guard; kept separate so tests can exercise the check directly against a known-bad point.
 */
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
    if (!Number.isFinite(xi)) return Infinity; // NaN/Inf from a blown-up tableau
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

export function solveLP(lp: LinearProgram): LPSolution {
  const numOriginal = lp.numVars;
  // Accumulated across both phases so the diagnostics describe the whole solve, not just
  // whichever phase happened to fail.
  let minPivotMagnitude = Infinity;
  let totalPivots = 0;
  const diagnose = (reason: LPFailureReason | undefined, maxViolation: number): LPDiagnostics => ({
    reason,
    maxViolation,
    minPivotMagnitude,
    nearSingularPivot: minPivotMagnitude < NEAR_SINGULAR_PIVOT_THRESHOLD,
    totalPivots,
  });
  const infeasible = (reason: LPFailureReason, maxViolation = NaN): LPSolution => ({
    feasible: false,
    x: new Array(numOriginal).fill(0),
    objectiveValue: NaN,
    diagnostics: diagnose(reason, maxViolation),
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
    minPivotMagnitude = Math.min(minPivotMagnitude, phase1.minPivotMagnitude);
    totalPivots += phase1.pivots;
    if (!phase1.converged) {
      // Note: phase1-unbounded is mathematically impossible in exact arithmetic — Phase 1
      // minimizes a sum of non-negative artificials and is bounded below by 0. If it is ever
      // reported, the tableau has been numerically corrupted, which is exactly what the
      // diagnostics are here to make visible.
      return infeasible(phase1.unbounded ? 'phase1-unbounded' : 'phase1-iteration-cap');
    }

    const phase1Objective = -tableau[numRows][numVars]; // objective row's RHS is -objectiveValue
    if (phase1Objective > PHASE1_FEASIBILITY_TOLERANCE) {
      return infeasible('phase1-genuinely-infeasible'); // genuinely infeasible
    }

    // Drive any artificial still basic (necessarily at ~0, since Phase 1 objective ~0) out
    // of the basis, so Phase 2 never has to consider an artificial column. Picks the
    // LARGEST-magnitude eligible coefficient rather than the first one above EPS: this is an
    // unguarded division like any other pivot, and taking the first eligible column could
    // select a ~1e-9 element and blow the tableau up in the handoff — the same hazard the
    // entering rule was changed to avoid, so the same treatment applies here (2026-08-12).
    for (let i = 0; i < numRows; i++) {
      if (basis[i] < numOriginal + numSlackSurplus) continue; // not an artificial
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
  minPivotMagnitude = Math.min(minPivotMagnitude, phase2.minPivotMagnitude);
  totalPivots += phase2.pivots;
  if (phase2.unbounded) return infeasible('phase2-unbounded');
  if (!phase2.converged) return infeasible('phase2-iteration-cap'); // hit iteration cap without reaching optimality

  const x = new Array(numOriginal).fill(0);
  for (let i = 0; i < numRows; i++) {
    if (basis[i] < numOriginal) x[basis[i]] = tableau[i][numVars];
  }

  // Post-solve feasibility guard. `converged` only means the pivot loop found no negative
  // reduced cost — on a tableau corrupted by near-singular pivots that condition can hold
  // while the extracted x violates the very constraints it was solved against. Verifying x
  // directly against the ORIGINAL constraints (not the internally rhs-normalized rows) is
  // the only check that cannot be fooled by the tableau's own state.
  const maxViolation = maxConstraintViolation(lp.constraints, x);
  if (!(maxViolation <= FEASIBILITY_TOLERANCE)) {
    // `!(a <= b)` rather than `a > b` so a NaN violation also fails closed.
    return infeasible('post-solve-infeasible', maxViolation);
  }

  let objectiveValue = 0;
  for (let j = 0; j < numOriginal; j++) objectiveValue += (lp.objective[j] ?? 0) * x[j];

  return { feasible: true, x, objectiveValue, diagnostics: diagnose(undefined, maxViolation) };
}
