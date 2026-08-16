# Criteria Calibration — Harris ratio test: the `EPS = 1e-9` near-singular-pivot cure

**Date:** 2026-08-16
**Status:** Implemented. Closes `deferred-work.md` item 3 **and** the separate
"All-'equal'-heavy answer logs at high n" entry.
**Change:** one production file — `src/lib/criteria-calibration/simplex.ts`. The leaving-row
ratio test is now a Harris two-pass rule at `pivotTolerance = 1e-7`, `δ = 1e-8`.

Implements the verdict of `criteria-calibration-eps-ratio-test-diagnostic.md`, which measured
the candidate rules and chose this one. That doc is the *why*; this one is the *what shipped*,
what was re-confirmed against the real solver rather than the lab copy, and what changed
downstream. Direct ancestors: `criteria-calibration-dantzig-fix.md` (2026-08-12, the
mitigation), `criteria-calibration-solver-crash-safety-net.md` (2026-08-16, the containment).

---

## What the rule does

For entering column `j`:

1. **Pass 1** — over rows whose coefficient exceeds `HARRIS_PIVOT_TOLERANCE` (1e-7), compute
   `thetaMax = min_i (b_i + δ) / a_ij`: the longest step that keeps every basic variable at or
   above `-δ`.
2. **Pass 2** — among rows whose *strict* ratio `b_i / a_ij` is still within `thetaMax`, take
   the one with the **largest** `|a_ij|`.
3. If no row clears the tolerance, both passes retry at the old `EPS` (1e-9) floor.

The old rule took the strict minimum ratio and broke ties by smallest basis index. Its problem
was never the tie-break: it was that a row winning the ratio race had to be pivoted on *even
when its pivot element sat at the 1e-9 floor*. Harris can decline that row, paying at most δ of
deliberate constraint violation for a numerically safe pivot.

### Tie-break, stated precisely

Pass 2's comparison is strict `>`, so **ties on `|pivot|` resolve to the lowest row index**.
This is *not* the same as the old rule's lowest-basis-index tie-break — row index and basis
index coincide only before the first pivot. Nothing depends on which of a set of tied rows is
chosen (each is an equally valid pivot); what matters is that the choice is deterministic and
identical to the harness the rule was validated in. That identity is **verified by measurement,
not by inspection** — see "Parity with the validated harness" below.

### The EPS fallback is not optional

If nothing clears 1e-7, the passes retry at 1e-9 rather than returning "no eligible row". A
bare tolerance floor with no fallback would report such a column as **unbounded**, changing the
solver's verdict rather than just its arithmetic. Pinned by a test.

### Parameters, and what must not be done to them

| constant | value | why |
|---|---|---|
| `HARRIS_PIVOT_TOLERANCE` | 1e-7 | eligibility floor; the actual fix |
| `HARRIS_DELTA` | 1e-8 | violation budget; **must stay ≤ 1e-8** |
| `FEASIBILITY_TOLERANCE` | 1e-7 | **unchanged** |
| `PHASE1_FEASIBILITY_TOLERANCE` | 1e-6 | **unchanged** |
| `MAX_ITERATIONS` | 2000 | **unchanged** (`deferred-work.md` item 4) |

**Do not raise `FEASIBILITY_TOLERANCE` to accommodate a larger δ.** At δ = 1e-7 the post-solve
guard already rejects a clean prefix; at δ = 1e-6 it rejects 156 of 181 good solves, reading
Harris's own deliberate slack as corruption. δ = 1e-8 leaves 21× headroom. That guard is the
only check that catches a genuinely corrupt solve.

`HARRIS_PIVOT_TOLERANCE` is numerically equal to `NEAR_SINGULAR_PIVOT_THRESHOLD` but is a
different concept — one changes which pivot is taken, the other is a post-hoc diagnostic flag.
They are deliberately separate constants and should not be collapsed.

## Anti-cycling: nothing was lost

The smallest-basis-index tie-break was the last Bland-flavoured component in the file, and this
change removes it. No guarantee is forfeited: Bland's rule needs *both* halves, and the
entering half became Dantzig on 2026-08-12. Empirically the new rule cycles **less** — max
pivots per solve across the 181 committed regions dropped 844 → 200, median 108 → 91, zero
iteration-cap hits.

---

## Re-confirmation against the shipped solver

The diagnostic's numbers all came from `simplexLab.ts`, a copy driven through a Vite alias.
That is the right tool for comparing candidate rules and the wrong one for verifying what
shipped. Two harness additions close the gap (both lab-only; the frozen 2026-08-16 outputs stay
reproducible by default):

- `LAB_PARITY_RULE=harris` in `levelA.labtest.ts` — points the parity assertion at
  `harris(1e-7, 1e-8)` instead of `baseline`.
- `lab.prod.vitest.config.ts` — same config with **no alias**, so `solver.ts` imports the real
  `./simplex.js`. `adversarial.labtest.ts` additionally needs `LAB_PROD_SIMPLEX=1` (it builds
  and solves its Chebyshev LP directly, which the alias never covered).

### Parity with the validated harness

`npx tsx scripts/.../sweepProd.ts` (unaliased, real `simplex.ts`) vs. the lab's
`harris(floor=1e-7,delta=1e-8)`:

```
harris(floor=1e-7,delta=1e-8)  solves=181 failures=0 digestDiffVsProd=0 worstPointDelta=0.00e+0
                               harrisDeviations=41 harrisWorstStepExcess=2.00e-6
```

**`digestDiffVsProd=0` across all 181 solves** — the shipped rule is bit-identical to the one
the diagnostic validated, on every committed real fixture prefix, to 9 decimal places on every
solved value. This is the answer to "was it ported correctly", and it is measured rather than
eyeballed. Every other rule in that table shows `digestDiffVsProd` ≥ 9.

One harness wrinkle surfaced and was fixed in `levelA.labtest.ts`: the production sweep is
compared after a JSON round-trip, and `JSON.stringify(-0)` is `"0"`, so a genuine `-0`
`totalSlack` read back as `+0` and `toEqual` (Object.is semantics) called it a mismatch on one
row. Signed zero is now normalized before comparison. Serialization artifact, not a solver
difference — everything carrying information (`ok`, `digest`, failure message) is compared
untouched.

### Regression results against production code

| track | before (baseline) | after (shipped Harris) |
|---|---|---|
| committed real fixtures, all 181 prefixes | 1 failure | **0 failures** |
| adversarial n=150 (120 solves) | 61 failures, 41 near-singular | **0 failures, 0 near-singular** |
| adversarial n=300 (120 solves) | 103 failures, 25 near-singular | 47 failures, **0 near-singular** |
| closed-loop oracles | 4/10 crash | **0/10 crash** |

The n=300 residual is **not this mechanism**: every failure has `nearSingular=0/10` with healthy
pivots (minPivot 3.9e-2, 1.0e-1, 1.6e-1) and reason `phase1-iteration-cap` or a `buildValueLP`
throw of the same origin. That is `MAX_ITERATIONS = 2000`, `deferred-work.md` item 4, now the
sole remaining cause of adversarial failure and well beyond any real session (Dan's longest is
71). These figures reproduce the diagnostic's lab numbers exactly, including the 47/120 count.

---

## Dan's real 71-answer log, re-solved read-only

`scripts/verify-harris-repricing-2026-08-16.ts` (committed; `.select()` only, no writes) replays
the live `user_calibration_answers` log through the shipped solver and diffs the result against
the stored `user_criterion_weights`.

- **Solves cleanly at n=71, and at all 71 prefixes — 0 failures.** `totalSlack = 0.064137008`.
- **Repricing magnitude over the 30 stored variables: max 0.0239, median 0.0065, mean 0.0088**
  (on values that sum to 1). The largest single move is criterion 0 / level 3, 0.0713 → 0.0475.
- **Normalization sum is exactly 1.000000000 before and after.** The model property holds; only
  the pick among tied optima moved.

This matters because the diagnostic's synthetic figure — 154/181 prefixes moving, median 0.167 —
reads as alarming and is not representative of the one real account. On Dan's actual data the
movement is **roughly 25× smaller at the median**. Individual level values still move by up to
2.4 percentage points, which is real but far from a re-randomization.

One item worth a human eye: **criterion 1 / level 2 goes 0.0233 → exactly 0**, i.e. that level
becomes indistinguishable from level 1 under the new point estimate. This is a legitimate
vertex of the same optimal region (the region itself is unchanged — `totalSlack` is invariant
under every rule tested), not a solver error, but it is the kind of change a user could notice
in their results page.

### The deeper issue this exposes, not introduced

Every candidate rule attains the *identical* optimal Chebyshev radius on all 180 solvable
regions. The optimum is so degenerate (mean optimal radius ≈ 1.5e-7) that many points attain it,
and the pivoting rule silently decides which one is reported. **Production's stored weights were
already one arbitrary pick among ties before this change.** A real fix is a deterministic
secondary objective (lexicographic tie-breaking, or maximising a strictly convex proxy) —
named here, tracked in `deferred-work.md`, not scoped into this pass.

Corollary for future tests: **do not pin specific solved values.** That pins an arbitrary
tie-break, not a property of the model. The new tests pin decisions and invariants instead.

---

## Test changes

### `solverCrashFixture.test.ts` — assertion inverted, not deleted

It asserted that `SOLVER_CRASH_ANSWERS` still throws at n=44, deliberately, so the safety-net
tests could not silently start passing against an inert input. `deferred-work.md` item 3
predicted it would fail when this landed. It did.

Before inverting it, a replacement was searched for: **1000 generated adversarial logs at
n ∈ {44, 60, 71, 80, 100} across 8 equal-share/contradiction cells, run through the shipped
`solveValues` — 0 failures.** No realistic-n log that still breaks Harris could be constructed.
Per the brief, that outcome is recorded as evidence the fix works rather than papered over.

The file now pins the inverse — the log solves cleanly at n=44 and n=43 — which is a real
property worth protecting, since a ratio-test regression would surface there first on a
known-hard real input.

### `CriteriaCalibrationPage.solverCrash.test.tsx` — breakdown is now injected

The safety net is tested against a stubbed `solveValues` that throws at one chosen answer
count, rather than against a log that happens to be numerically hostile. Both consumers on that
page (`computeCommitState` and the driver's `nextAction`) import from the same module, so one
stub covers the commit path *and* the render path — the one that actually unmounted the root.

This is better decoupling on its own merits: the safety net's claim is "a solver throw must not
blank the page", which was never really a claim about numerics. It also means a future solver
change cannot turn these tests into no-ops.

### `simplexHarris.test.ts` — new permanent regression test

Same convention as `simplexDantzig.test.ts` and the two-phase rewrite. Pins the rule's
decisions directly (`chooseLeavingRow` is exported for this): declining a near-singular pivot,
*not* deviating when the strict min-ratio row is healthy, accepting a longer step within δ and
refusing one 10× past it, lowest-row-index tie-break, the EPS fallback, and genuine
unboundedness. Plus the invariant that makes it a cure — `minPivotMagnitude ≥ 1e-7` and
`nearSingularPivot === false` on the Chebyshev solve of every committed real fixture.

### `elicitationDriver.test.ts` — one window re-pinned

The oracle-convergence test moved from n=63 to **n=82** and its window was re-pinned to 77–87.
This is a genuine behavioural change, not float noise — see below.

Full suite after: **318 passed / 318**, `tsc --noEmit` clean.

---

## `MAX_VALUE_RANGE_FOR_COVERAGE = 0.2` — re-checked, left unchanged

The coverage gate reads solved value *ranges*. Harris solves the same region to a different
point among ties, so ranges close at a different rate, so degree escalation and the
"you've resolved everything at this level of detail" message move.

**The direction is data-dependent, which is the main finding here.** The `elicitationDriver`
oracle now reaches coverage-complete 19 rounds *later* (63 → 82); the diagnostic's synthetic
oracle #9 reached it 19 rounds *earlier* (49 → 30, with worse recovery: maxAbsErr 0.125 vs
0.042). So this is not a uniform "sessions got longer" or "the threshold drifted one way" — it
is a re-shuffle, and no single value of `MAX_VALUE_RANGE_FOR_COVERAGE` corrects both.

**Left at 0.2, deliberately.** It is not miscalibrated in any measurable direction; changing it
would be trading one oracle's timing for another's with no evidence about which shape real
sessions resemble. Dan's own 71-answer session is the only real data, and it does not exercise
the gate at the boundary. **This is flagged as a product call, not absorbed**: if session length
or escalation timing is judged wrong in practice, this constant is the dial, and the evidence
above is the starting point.

Caveat on the production oracle re-run: oracle #10's ground truth is derived from the real
production session via `solveValues`, so under the no-alias config it is built under Harris
rather than baseline. Its recovery figures are therefore self-consistent but not directly
comparable to the published 2026-08-16 run.

---

## What NOT to change

- **Do not loosen `FEASIBILITY_TOLERANCE` or `PHASE1_FEASIBILITY_TOLERANCE`.** See the table
  above. δ was chosen to fit under them, not the reverse.
- **Do not implement the `magnitude-floor` variant** sketched in
  `criteria-calibration-dantzig-stress-test.md` Result 4. Taking the min ratio among rows above
  a floor lets the step overshoot by an *unbounded* amount when the floor excludes the true
  min-ratio row; nothing caps it. Harris's δ is exactly the bound that makes the trade
  legitimate. `simplexHarris.test.ts` pins the difference.
- **Do not add periodic refactorization.** Ruled out by measurement (diagnostic Q3): drift stays
  at ~1e-15 for 626 consecutive pivots and then one bad division destroys the tableau in a
  single step. There is no accumulated round-off to purge.
- **Do not pin solved point estimates in tests.** They are an arbitrary pick among tied optima.

## Reproducing

```bash
npx tsx scripts/lab-eps-ratio-test-2026-08-16/sweepProd.ts
LAB_PARITY_RULE=harris npx vitest run --config scripts/lab-eps-ratio-test-2026-08-16/lab.vitest.config.ts levelA
LAB_RULES=harris npx vitest run --config scripts/lab-eps-ratio-test-2026-08-16/lab.prod.vitest.config.ts oracles
LAB_PROD_SIMPLEX=1 LAB_RULES=harris LAB_TRIALS=10 LAB_TAG=prod-harris npx vitest run --config scripts/lab-eps-ratio-test-2026-08-16/lab.prod.vitest.config.ts adversarial
npx tsx scripts/verify-harris-repricing-2026-08-16.ts
```

The frozen pre-change production sweep is kept at
`out/prod-committed-sweep-2026-08-16-baseline.json`; `out/prod-committed-sweep.json` now holds
the post-change one.
