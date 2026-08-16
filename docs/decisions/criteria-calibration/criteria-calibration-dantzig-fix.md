# Criteria Calibration — Dantzig pivoting + post-solve feasibility guard (implementation)

**Date:** 2026-08-12
**Branch:** `criteria-calibration-dantzig-fix`
**Rollback tag:** `pre-dantzig-fix`
**Files changed:** `simplex.ts`, `solver.ts`, plus their tests. Nothing else.
**Verification:** `tsc --noEmit` clean; 256/256 tests passing (242 baseline + 14 new).

Builds directly on the read-only diagnostic pass in
[`criteria-calibration-dantzig-stress-test.md`](./criteria-calibration-dantzig-stress-test.md),
which established the root cause and the GO verdict. Related:
[`two-phase-simplex-rewrite.md`](./two-phase-simplex-rewrite.md) (the prior solver rewrite
whose integrity bar this pass finishes),
[`criteria-calibration-degree-scoped-coverage-fix.md`](./criteria-calibration-degree-scoped-coverage-fix.md)
and [`criteria-calibration-partial-tie-fix.md`](./criteria-calibration-partial-tie-fix.md)
(the elicitation-side fixes that preceded it).

---

## Motivation: the incumbent rule was already silently wrong in production

This is the part that matters most, and it was not the thing the pass set out to fix.

Bland's rule was not merely crashing at n=59. **Confirmed read-only against the live
database on 2026-08-12: Dan's `user_criterion_weights` contained 30 rows, every one of them
zero** — top-level values `[0, 0, 0, 0, 0, 0]`, summing to 0 instead of the required 1. Every
album therefore scored 0 and the ranking those weights drive was meaningless.

The mechanism, isolated directly:

1. Phase 1 (slack minimization) succeeded — `totalSlack` solved cleanly at 6.0e-4.
2. The **Chebyshev-center solve failed** (`feasible: false`) on the numerically degenerate
   region at n=58.
3. `computeChebyshevCenter` swallowed that failure and returned an all-zero vector
   (`result.feasible ? … : new Array(totalVars).fill(0)`).
4. `solveValues` reported those zeros as the point estimate, `upsertWeightsAndStatus`
   persisted them, and nothing downstream checked that the values summed to 1.

Separately, the stress test found Bland returning `feasible: true` alongside a
constraint-violating `x` — including a *negative* value variable — on ~2/120 of Dan's real
answer orderings at n=59, while reporting an objective identical to the correct answer.

Both are the same class of defect: a solve that failed numerically being consumed as if it
had succeeded. That class is what this pass closes.

## What changed

### 1. Bland's rule → Dantzig's rule (`simplex.ts`)

`runSimplex` is the single pivot loop both phases call, so the entering-column change covers
Phase 1 and Phase 2 together. **Chosen for numerical robustness, not speed.** Bland takes the
first eligible column, which on this constraint shape repeatedly lands on a pivot element at
the `EPS = 1e-9` floor; dividing a row by ~1e-9 amplifies rounding error catastrophically
(measured tableau magnitudes to 1e46). Bland's anti-cycling guarantee was never the binding
concern — cycling was directly ruled out as the mechanism.

Evidence (300 trials/cell, real + validated synthetic, n=20…300): Bland failed 44/120 answer
orderings at n=59 and 30/30 at n=150; Dantzig failed 0 anywhere in that range. Across 1760
paired solves there is no case where Bland succeeded and Dantzig did not.

The **leaving-row ratio test is unchanged**, including its `coeff > EPS` eligibility floor.
Fixing that floor (Harris ratio test, refactorization) is the real cure and is deliberately
out of scope — see the deferred limitation below.

### 2. Phase-1→Phase-2 artificial cleanup now picks the largest-magnitude coefficient

The handoff loop that drives still-basic artificials out of the basis took the *first*
coefficient above `EPS`, so it could select a ~1e-9 element and blow the tableau up in an
unguarded division — the identical hazard, in an adjacent place. It now takes the
largest-magnitude eligible coefficient. Same logic applied consistently, not a scope
extension: it does not touch the EPS admission rule, it just avoids leaving an obvious hole
next to the thing being fixed.

### 3. Post-solve feasibility guard (`simplex.ts`)

Inside `solveLP`, before `feasible: true` is returned, the extracted `x` is verified against
the **original** constraint set (`maxConstraintViolation`, exported so tests can drive it
directly). Placed in `solveLP` rather than `solveValues` so it covers all ~50 solves per
commit plus `scoreSpreadAccuracy.ts`'s, not only the phase-1 result.

Why it is needed at all: `converged` only means "no negative reduced cost was found", a
condition a corrupted tableau can satisfy. Verifying the returned point is the only check the
tableau's own state cannot fool.

**Tolerance: `FEASIBILITY_TOLERANCE = 1e-7`**, with ~2 orders of clearance either side. Clean
Dantzig solves violated by at most 6.6e-13 across every realistic case (9.8e-12 worst
anywhere, on adversarial all-equal at n=59); the smallest violation from a numerically
corrupt solve was 1.4e-5, most being 1e-2…1e+5. Also far below `DEFAULT_MARGIN` (1e-4), so a
violation this size can never be mistaken for a legitimately slack answer. The comparison is
written `!(v <= tol)` so a NaN violation fails closed.

### 4. Pivot-magnitude safety check (`simplex.ts`)

`minPivotMagnitude` is tracked across both phases and surfaced on every `LPSolution` via a
new `diagnostics` field (`{ reason, maxViolation, minPivotMagnitude, nearSingularPivot,
totalPivots }`, additive and non-breaking).

**Mechanism: detect and report, never abort on its own.** Threshold
`NEAR_SINGULAR_PIVOT_THRESHOLD = 1e-7` — two orders above `EPS`, four below the ~1e-3
smallest pivot seen in clean solves. It is a warning signal that annotates errors ("this is
numerical breakdown on a degenerate answer log, not a genuine contradiction in the answers");
the authoritative decision belongs to the post-solve guard, because a small pivot does not
by itself imply a bad result and aborting on one would reject solves that verify clean.

In the diagnostic, min pivot magnitude was a *perfect* predictor of failure — clean solves
stay ≥ ~1e-3, corrupt ones sit at the 1e-9 floor, with no counterexample either way.

### 5. Chebyshev failure now throws (`solver.ts`)

`computeChebyshevCenter` throws instead of returning zeros. This solve produces the reported
point estimate — the weights the rest of the app consumes — so substituting a zero vector was
a second silent-wrong path of exactly the kind the guard closes. `buildValueLP`'s existing
phase-1 throw now carries the diagnostics too, via `describeLPFailure`.

## Consequence to be aware of: point estimates changed materially

`totalSlack` and every min/max value range are **identical** between the two rules (parity
verified to ≤2.9e-13 on all four historical fixtures, well inside the 7e-13 bar). But the
reported `point` estimate changed substantially, and that is expected rather than a defect:

The Chebyshev-center LP is under-determined here. Both rules reach the *same* optimal
inscribed radius (measured: 1.7407765595569777e-7 vs 1.7407765595569788e-7), but the
max-radius set is a large face and each rule lands on a different part of it. Concretely, on
`REAL_PRODUCTION_SESSION_ANSWERS` the old rule returned criterion 0 at 0.998 with all five
others at ~0.0005 — a pathological corner claiming the user cares about one criterion and
nothing else, from 33 answers touching all six. Dantzig returns a balanced 0.09–0.18 spread.

On Dan's own 58 answers the comparison is starker still: old = all zeros (sum 0), new =
`[0.174, 0.174, 0.174, 0.130, 0.174, 0.174]` (sum exactly 1).

Anyone who has already calibrated will see different weights after this ships. Given the old
values were a zero vector or a degenerate corner, that is a correction, not a regression —
but it is a real change in stored data, so it is recorded here rather than left to be
discovered.

The under-determination itself is pre-existing and already noted in
`criteria-calibration-engine.md`; a lexicographic secondary objective to make the center
unique would be the principled fix and is not attempted here.

## Rejected alternative: Dantzig primary with Bland fallback

Investigated and rejected in the stress-test pass —
[see that doc's section](./criteria-calibration-dantzig-stress-test.md#rejected-alternative-dantzig-primary-with-bland-fallback)
rather than a duplicate of the reasoning here. Summary of why it is not revisited: the
proposed trigger (consecutive degenerate pivots) is the wrong signal, and Bland fails on
exactly the adversarial sets where Dantzig degrades, so the "safety net" would activate
precisely where it is most dangerous. **Do not reintroduce it without a new brief and new
evidence.**

## MAX_ITERATIONS left at 2000

Checked in exactly one place: `runSimplex`'s loop bound. Deliberately **not** raised.

Confirmed on the real implementation rather than the harness — the worst pivot count across
all 48 per-value range solves on the real 59-answer constraint set is under 600, and the
larger Chebyshev LP at n=58 took 409 pivots. That is >3x headroom, and it is pinned by a
test. Growth is ~4n, first threatening 2000 around n≈300.

## Known limitation, NOT fixed here

On pathologically degenerate inputs — answer logs that are majority `'equal'` at n ≥ 100, or
heavily self-contradictory at n ≥ 300 — Dantzig degrades too. The post-solve guard makes
those failures **loud** (a thrown error naming the numerical cause) instead of silently wrong
weights, which is the bar this pass targets. Making them not fail at all requires fixing the
`EPS = 1e-9` near-singular-pivot admission itself and is substantially larger work. Tracked
as its own item in `deferred-work.md`.

Dan's real session sits far from that regime (12% `'equal'`, low contradiction rate), with
the breakdown boundary at roughly a 70% equal share at n=150.

## Tests added (`src/__tests__/simplexDantzig.test.ts`, 14 cases)

- **Dan's stuck session**: the 58-answer log, plus the full 59-answer log for all three
  possible answers to question #59 (the crash was answer-independent), plus a stride of
  prefixes and 10 deterministic random orderings — the crash was order-dependent, so a single
  ordering passing would not be evidence.
- **Parity**: `totalSlack` and every min/max range reproduce the pre-switch Bland values
  within 7e-13 on all four historical fixtures. References captured from the tagged
  pre-change solver and frozen into `src/__tests__/fixtures/danSession.ts`.
- **Guard**: proven to reject a perturbed optimum, a negative variable, and a NaN-corrupted
  point; proven not to fire on a clean solve; and driven end-to-end through `solveLP` on a
  contradictory LP.
- **Iteration headroom**: worst pivot count on the real constraint set asserted under 600.

Fixture `src/__tests__/fixtures/danSession.ts` holds Dan's 58 real answers, pulled read-only.
Kept out of `lib/criteria-calibration/fixtures.ts` on purpose: it is solver/simplex regression
data, not a shared elicitation fixture.

### One pre-existing test was repaired

`elicitationDriver.test.ts`'s degree-scoping regression assumed the driver reaches
degree-2 coverage-complete at exactly 32 answers. Which candidate the driver offers depends on
`rankCandidatesByAmbiguity`, which reads solver point estimates — so that count shifted (to 34)
when the point estimates changed. The test now drives to the coverage-complete state instead of
asserting a specific answer count. **The degree-scoping behaviour under test is unchanged**;
only an incidental assumption about question order was removed.

## Resuming a stalled session

Dan can resume safely. Question #59 now solves for any answer. His stored zero weights are
overwritten with real ones on the next committed answer, since `upsertWeightsAndStatus` runs
on every commit.

If he answers `'equal'` very frequently from here, the relevant boundary is roughly a 70%
equal share at n=150 — far beyond his current 12%. And should it ever be crossed, the
failure now surfaces as a visible error naming the numerical cause, not as silently wrong
weights.
