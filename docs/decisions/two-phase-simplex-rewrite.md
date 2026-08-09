# Two-phase simplex rewrite (replacing Big-M in `simplex.ts`)

**Status: DONE, merged to `master` 2026-08-09. Branch:
`criteria-calibration-two-phase-simplex`.**

## Problem

A diagnostic (driving `nextAction` for 42 rounds against the 5-criterion
`REAL_SESSION_*` fixture as a complete-ground-truth oracle — same method as
`elicitationDriver.test.ts`'s "oracle-based simulation" describe block) found that
`computeChebyshevCenter`/`solveLP`'s Big-M dense simplex (`simplex.ts`, `BIG_M = 1e7`)
numerically blows up on this problem's degenerate-tie constraint shape: at n=42
answers, `values[c][level].point` reached ~1.16e14 while `solveLP` still returned
`feasible: true` and `totalSlack === 0` (the data was fully consistent — this was a
purely numerical failure, not a real infeasibility).

Two contributing causes, both structural:

1. **Numerical conditioning.** Big-M injects a `1e7` penalty coefficient into the same
   objective row as the real objective's O(1) coefficients. On a tableau with many
   near-identical monotonicity/answer rows (lots of zero-ratio pivot ties), that
   O(1e7)-vs-O(1) mixing degrades conditioning badly enough to produce garbage.
2. **Missing convergence check.** The old feasibility determination only checked that
   artificial variables were out of the basis at the end of the loop — it never
   distinguished "loop exited via optimality" (`enter === -1`) from "loop exhausted
   `MAX_ITERATIONS` without converging." A non-converged run could still pass the
   artificial-value check and be reported as a valid feasible solution.

Not fixture-size-dependent in a predictable way: a 6-criteria production-shaped
fixture extended to n=60 converged cleanly, so this was a latent risk for any real
session, not a guaranteed failure past some threshold.

## Fix

Rewrote `solveLP` in `simplex.ts` as two-phase simplex:

- **Phase 1** minimizes only the sum of artificial variables (objective row
  coefficients are exactly `{0, 1}` — no Big-M, no mixing with the real objective at
  all). Runs to optimality via the same Bland's-rule pivot loop as before.
- **Feasibility check** subsumes the missing convergence check: a shared
  `runSimplex` helper returns a `converged` flag (`true` only if the loop exited via
  `enter === -1`, `false` if it hit `MAX_ITERATIONS`). Phase 1 is feasible only if it
  converged **and** its objective value is ~0 (`PHASE1_FEASIBILITY_TOLERANCE = 1e-6`).
  Any degenerate artificial still basic at that point (value ~0) is pivoted out via a
  Bland's-rule cleanup pass before Phase 2, so Phase 2 never has to consider
  artificial columns.
- **Phase 2** reloads the real objective, prices it out against the Phase-1-feasible
  basis, and runs the same pivot loop restricted to real+slack columns (artificials
  excluded from consideration entirely, not just penalized). Its `converged` flag is
  checked the same way — a Phase-2 run that hits the iteration cap is also reported
  `feasible: false`, not silently returned.
- **Degeneracy handling** (Bland's rule) is unchanged in substance — it was already
  correctly implemented — but now lives in one shared pivot/loop helper used by both
  phases (and by the Phase-1-cleanup pivot), rather than duplicated logic, so the
  anti-cycling rule only needed to be written once.

No rescaling was added on top of two-phase. Removing Big-M's O(1e7)-vs-O(1) mixing
was judged (and confirmed, see Verification below) to be the dominant fix for the
conditioning problem; scaling was flagged in the approved plan as a fallback if the
n=42 case still misbehaved under plain two-phase, but it converged cleanly without it.

## Scope / callers

`solveLP`'s public signature and `LPSolution` return shape (`{feasible, x,
objectiveValue}`) are unchanged. `solveLP` has exactly one importer — `solver.ts` —
called 4 times (`computeChebyshevCenter`'s Chebyshev-center solve, `solveValues`'s
Phase-1 slack minimization, and its per-value min/max range solves). All four only
touch `.feasible`, `.x`, `.objectiveValue`; none needed changes.

## Verification

- All 226 pre-existing tests pass unchanged (`npx vitest run` → 227/227 including the
  new regression test below). `tsc --noEmit` clean. `eslint` clean on the touched
  files (repo-wide lint has pre-existing, unrelated failures elsewhere).
- Old-Big-M-vs-new-two-phase compared on the `REAL_SESSION_*` (5-criterion, 31
  answers) and `REAL_PRODUCTION_SESSION_*` (6-criterion, 33 answers) fixtures via
  `solver.test.ts`'s existing acceptance tests, which passed unchanged — both
  fixtures already converged cleanly under Big-M per the original diagnostic, and
  two-phase reproduces the same feasible point to the existing tests' float
  tolerance. No divergence expected or found on these two cases.
- **New permanent regression test:** `solver.test.ts`'s "n=42 numerical-blowup
  regression" describe block, using fixture `N42_REPRO_LEVELS_PER_CRITERION` /
  `N42_REPRO_ANSWERS` in `fixtures.ts`. The 42-answer sequence was regenerated
  deterministically (not hand-authored, not reused from the original diagnostic
  session, which lived on an uncommitted branch) by driving `nextAction` against the
  `REAL_SESSION_*` oracle for exactly 42 rounds — identical method to
  `elicitationDriver.test.ts`'s existing "oracle-based simulation" block. Confirmed,
  before implementing the fix, that this regenerated sequence reproduced the same
  failure under the then-current Big-M `solveLP` (`totalSlack: 0`, max `|point|` ≈
  1.16e14) — i.e. the repro was verified as a match to the original diagnostic before
  being used as a "must now pass" regression fixture. The test asserts: total slack
  near zero, every point value finite and in `[0, 1]`, monotonic within each
  criterion, and normalization summing to 1 within float tolerance. Under the
  two-phase fix, the same 42 answers now produce point values in the sane `[0, 0.5]`
  range with exact monotonicity and normalization.

## Risk notes carried from the approved plan (now resolved)

- Whether removing Big-M alone (no rescaling) would resolve the n=42 blowup was
  flagged as the least-certain part of the plan — confirmed resolved without
  rescaling.
- The `PHASE1_FEASIBILITY_TOLERANCE = 1e-6` epsilon was flagged as needing a second
  look once real numbers were in hand — kept at `1e-6` (matches the old code's own
  artificial-value tolerance); no case encountered during verification needed a
  different value.
- Redundant/dependent constraint rows (an artificial stuck at 0 with no eligible
  cleanup pivot) were flagged as unconfirmed to trigger on real fixtures — the
  cleanup path handles this case (leaves the artificial pinned at 0, inert since
  Phase 2 excludes artificial columns from consideration), but it was not observed
  to trigger on any of the fixtures used in verification.
