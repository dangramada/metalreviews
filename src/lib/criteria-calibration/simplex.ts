// Generic dense two-phase simplex LP solver: minimize c^T x subject to Ax {<=,=,>=} b, x >= 0.
//
// Purpose-built for the small LPs the Criteria Calibration value solver constructs
// (dozens of variables/constraints) — not a general-purpose numerical library. No
// external LP dependency exists in package.json, and none is warranted at this problem
// size; a straightforward dense tableau is simpler to reason about and fast enough.
//
// Two-phase rather than Big-M (was Big-M with BIG_M = 1e7 prior to 2026-08-09, see
// docs/decisions/criteria-calibration/two-phase-simplex-rewrite.md): Big-M mixes an artificial O(1e7) penalty
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
// docs/decisions/criteria-calibration/criteria-calibration-dantzig-fix.md and the stress test it builds on,
// docs/decisions/criteria-calibration/criteria-calibration-dantzig-stress-test.md.
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
// The leaving-row rule is a Harris two-pass ratio test (2026-08-16), replacing the strict
// min-ratio + smallest-basis-index test that survived from the Bland era. This is the CURE
// for what Dantzig only mitigated: the root cause was the EPS = 1e-9 eligibility floor
// admitting near-singular pivots into the ratio test at all, and Dantzig's column choice
// merely made selecting one rare rather than impossible. See
// docs/decisions/criteria-calibration/criteria-calibration-harris-ratio-test.md and the
// diagnostic it implements, criteria-calibration-eps-ratio-test-diagnostic.md. Measured:
// near-singular-pivot incidence across the adversarial sweep went 66/240 -> 0/240, the
// committed real fixtures went 1 failure -> 0 across 181 prefixes, and 4 of 10 closed-loop
// synthetic oracles stopped crashing. See chooseLeavingRow for how it works.
//
// Anti-cycling, stated explicitly because it looks like a loss and is not: the old
// smallest-basis-index tie-break was the last Bland-flavoured component in this file, and
// Harris replaces it. No guarantee is forfeited — Bland's rule needs BOTH halves, and the
// entering half became Dantzig on 2026-08-12, so there has been no anti-cycling guarantee
// here since then. Empirically the new rule cycles less: max pivots per solve across the 181
// committed regions dropped 844 -> 200 (median 108 -> 91) with zero iteration-cap hits.
//
// Two guards back the solver up regardless of pivot rule, because a corrupt solve must never
// be returned as a good one:
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
// Entry points (2026-08-15): `solveLP` is the single-shot solve and is unchanged in
// signature and behaviour, but it is now a composition of `prepareLP` (tableau + Phase 1,
// objective-independent) and `solveFromPrepared` (Phase 2 for one objective). Callers that
// solve MANY objectives over ONE constraint set — scoreSpreadAccuracy.ts and solveValues's
// pass 2 — call those two directly so Phase 1 runs once instead of per objective. See
// `PreparedLP` below and docs/decisions/criteria-calibration/criteria-calibration-lp-warm-start.md.
//
// The former known limitation here — majority-'equal' logs at n >= 100 and heavily
// self-contradictory ones at n >= 300 degrading the same way under Dantzig — is CLOSED by
// the Harris rule above: zero near-singular pivots across 240 adversarial solves including
// the 100%-'equal' and 100%-contradiction cells. What remains at n = 300 is a different
// limit, MAX_ITERATIONS below (deferred-work.md item 4), which is now the sole cause of
// adversarial failure there and is well beyond any real session length.

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
// --- Harris ratio test parameters. Both were fixed by direct measurement, not chosen by
// feel; see criteria-calibration-eps-ratio-test-diagnostic.md Q1/Q2 before changing either.
//
// Rows whose |pivot| falls below this are not eligible to leave the basis at all — this is
// the actual fix, since those are exactly the near-singular divisions that destroy the
// tableau. Numerically equal to NEAR_SINGULAR_PIVOT_THRESHOLD but a DIFFERENT concept (that
// one is a post-hoc diagnostic flag, this one changes which pivot is taken), so the two are
// kept as separate constants and should not be collapsed into one.
const HARRIS_PIVOT_TOLERANCE = 1e-7;
// How far a basic variable is allowed to go negative in exchange for a numerically safer
// pivot. This is Harris's whole trade, and delta is the bound that makes it legitimate.
// MUST stay <= 1e-8: measured over 181 committed-fixture solves, delta = 1e-8 introduces a
// worst-case violation of 4.7e-9 — 21x under FEASIBILITY_TOLERANCE — while delta = 1e-7
// already trips the post-solve guard on a clean prefix and delta = 1e-6 has it reject 156 of
// 181 good solves, mistaking Harris's own deliberate slack for corruption. Do NOT raise
// FEASIBILITY_TOLERANCE to accommodate a larger delta: that guard is the only check that
// catches a genuinely corrupt solve.
const HARRIS_DELTA = 1e-8;
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
 * Entering column: Dantzig. Leaving row: Harris two-pass (see `chooseLeavingRow`).
 */
/**
 * Chooses the leaving row for entering column `enter`, by a Harris two-pass ratio test.
 * Returns -1 when no row is eligible, which the caller reports as unbounded.
 *
 * Pass 1 computes `thetaMax`, the longest step that keeps every basic variable at or above
 * `-HARRIS_DELTA` — i.e. the strict min ratio, loosened by exactly delta. Pass 2 then takes
 * the row with the LARGEST |pivot| among those whose strict ratio still fits inside that
 * bound. That is the entire mechanism: where the old strict min-ratio rule was forced onto
 * whichever row won the ratio race even when its pivot sat at the 1e-9 floor, this one gets
 * to decline that row in favour of a numerically safe pivot, paying a violation of at most
 * delta for the privilege.
 *
 * `HARRIS_PIVOT_TOLERANCE` (rather than EPS) is the eligibility floor for both passes, with
 * an EPS-floored retry if nothing clears it. The retry is not optional: without it a column
 * whose only eligible rows sit between EPS and the tolerance would be misreported as
 * unbounded, which changes the solver's verdict rather than just its arithmetic.
 *
 * Exported only so simplexHarris.test.ts can pin the rule's decisions directly — nothing
 * outside this file calls it in production.
 *
 * Ties on |pivot| in pass 2 resolve to the LOWEST ROW INDEX, via the strict `>` comparison
 * below. Note this is the lowest row index, NOT the lowest basis index the pre-2026-08-16
 * rule used — those coincide only before the first pivot. Nothing depends on which tie-break
 * applies (any of these rows is an equally valid pivot); it matters only that it is
 * deterministic and identical to the harness the rule was validated in.
 */
export function chooseLeavingRow(tableau: number[][], numRows: number, enter: number): number {
  const rhsCol = tableau[0].length - 1;

  for (const floor of [HARRIS_PIVOT_TOLERANCE, EPS]) {
    // Pass 1: the relaxed step bound.
    let thetaMax = Infinity;
    let any = false;
    for (let i = 0; i < numRows; i++) {
      const coeff = tableau[i][enter];
      if (coeff > floor) {
        any = true;
        const relaxed = (tableau[i][rhsCol] + HARRIS_DELTA) / coeff;
        if (relaxed < thetaMax) thetaMax = relaxed;
      }
    }
    if (!any) continue; // nothing clears this floor — retry at EPS, then report unbounded

    // Pass 2: largest |pivot| among rows within the relaxed bound.
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
    return leave;
  }
  return -1;
}

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

    const leave = chooseLeavingRow(tableau, numRows, enter);
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

/**
 * A constraint set with Phase 1 already solved — everything `solveFromPrepared` needs to
 * optimize ANY objective over that set without redoing feasibility work.
 *
 * Why this exists: the calibration path solves the same constraint set many times over with
 * only the objective differing — 2 solves per sampled profile pair in
 * `computeScoreSpreadAccuracy` (210 at the default 105-pair sample) and 2 per free value
 * variable in `solveValues` (48 at the 6x5 production shape). Every one of those calls used
 * to rebuild the tableau and re-run all of Phase 1 from scratch, which is objective-
 * INDEPENDENT work: `lp.objective` is first read only when Phase 2 prices the objective row
 * below, and Phase 2 zeroes that whole row (RHS column included) before repricing, so it
 * inherits nothing from Phase 1. Measured at n=59 answers, that duplicated prefix was 79% of
 * each solve's time and 80% of its pivots. See
 * docs/decisions/criteria-calibration/criteria-calibration-lp-warm-start.md.
 *
 * This is a *structural* warm start — share the Phase 1 basis — not a dual-simplex
 * re-optimization from a previous objective's optimum. That distinction is deliberate: from
 * an identical starting tableau and basis, Phase 2 takes an identical pivot path, so results
 * are bit-for-bit identical to solving cold. Re-optimizing from a previous optimum would cut
 * Phase 2 pivots too, but changes the pivot path and forfeits that guarantee — not a trade
 * worth making in a solver with this file's history of silent numerical corruption.
 */
export interface PreparedLP {
  numOriginal: number;
  numVars: number;
  numRows: number;
  /** Structural + slack/surplus columns, i.e. everything except artificials. */
  numRealVars: number;
  /** Rows 0..numRows-1 are the post-Phase-1 tableau. Row numRows (the objective row) is
   *  scratch — `solveFromPrepared` rebuilds it per objective and never reads it. */
  tableau: number[][];
  basis: number[];
  minPivotMagnitude: number;
  totalPivots: number;
  /** Non-null if Phase 1 itself failed. Feasibility is a property of the constraints alone,
   *  so every objective over this set fails identically — recorded once, replayed per solve. */
  failure: LPFailureReason | null;
  /** The ORIGINAL constraints as passed in, kept for the post-solve feasibility guard —
   *  which must check against these, not the internally rhs-normalized rows. */
  constraints: Constraint[];
}

/**
 * Builds the tableau and runs Phase 1 (plus the degenerate-artificial cleanup) for a
 * constraint set. Depends on `constraints` only — never on any objective.
 */
export function prepareLP(numOriginal: number, constraints: Constraint[]): PreparedLP {
  // Accumulated across both phases so the diagnostics describe the whole solve, not just
  // whichever phase happened to fail. Phase 1's contribution is computed here and handed to
  // `solveFromPrepared`, which continues accumulating into it.
  let minPivotMagnitude = Infinity;
  let totalPivots = 0;

  // Normalize so every constraint has rhs >= 0 (required for the initial basic
  // feasible solution built below).
  const rows = constraints.map((c) => {
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

  const base = {
    numOriginal,
    numVars,
    numRows,
    numRealVars: numOriginal + numSlackSurplus,
    tableau,
    basis,
    constraints,
  };

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
      return {
        ...base,
        minPivotMagnitude,
        totalPivots,
        failure: phase1.unbounded ? 'phase1-unbounded' : 'phase1-iteration-cap',
      };
    }

    const phase1Objective = -tableau[numRows][numVars]; // objective row's RHS is -objectiveValue
    if (phase1Objective > PHASE1_FEASIBILITY_TOLERANCE) {
      // genuinely infeasible
      return { ...base, minPivotMagnitude, totalPivots, failure: 'phase1-genuinely-infeasible' };
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
      // from consideration entirely (see numRealVars), so it stays pinned at 0.
    }
  }

  return { ...base, minPivotMagnitude, totalPivots, failure: null };
}

/**
 * Runs Phase 2 for one objective against an already-prepared constraint set. Safe to call
 * repeatedly with the same `prep`: the tableau rows it pivots on are private copies, so
 * `prep` is never mutated and every call starts from the identical Phase 1 basis.
 */
export function solveFromPrepared(prep: PreparedLP, objective: number[]): LPSolution {
  const { numOriginal, numVars, numRows, numRealVars } = prep;
  let minPivotMagnitude = prep.minPivotMagnitude;
  let totalPivots = prep.totalPivots;
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

  // Phase 1 already failed for this constraint set — the objective cannot rescue it.
  if (prep.failure) return infeasible(prep.failure);

  // Private working copy: the pivots below mutate rows in place, and `prep` has to survive
  // intact for the next objective. Only the constraint rows are copied — the objective row
  // is fully rebuilt just below, so copying it would be wasted work.
  const tableau: number[][] = new Array(numRows + 1);
  for (let i = 0; i < numRows; i++) tableau[i] = prep.tableau[i].slice();
  tableau[numRows] = new Array(numVars + 1).fill(0);
  const basis = prep.basis.slice();

  // --- Phase 2: real objective, artificial columns excluded from consideration (both from
  // the entering-column search and by construction never re-priced below). The objective row
  // starts at all-zero (allocated above) rather than being cleared, which is why nothing from
  // Phase 1's objective row can leak into this solve.
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
  // the only check that cannot be fooled by the tableau's own state. Stays per-objective —
  // it validates the extracted x, which is objective-specific, so it cannot be hoisted into
  // prepareLP alongside the rest of the shared work.
  const maxViolation = maxConstraintViolation(prep.constraints, x);
  if (!(maxViolation <= FEASIBILITY_TOLERANCE)) {
    // `!(a <= b)` rather than `a > b` so a NaN violation also fails closed.
    return infeasible('post-solve-infeasible', maxViolation);
  }

  let objectiveValue = 0;
  for (let j = 0; j < numOriginal; j++) objectiveValue += (objective[j] ?? 0) * x[j];

  return { feasible: true, x, objectiveValue, diagnostics: diagnose(undefined, maxViolation) };
}

/**
 * Single-shot solve. Unchanged in signature and behaviour — it is now literally
 * `prepareLP` + `solveFromPrepared`, which is what makes the two paths equivalent by
 * construction rather than by matching two parallel implementations.
 */
export function solveLP(lp: LinearProgram): LPSolution {
  return solveFromPrepared(prepareLP(lp.numVars, lp.constraints), lp.objective);
}
