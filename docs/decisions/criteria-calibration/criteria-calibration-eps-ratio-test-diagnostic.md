# Criteria Calibration — `EPS = 1e-9` near-singular-pivot root cause: candidate-fix diagnostic

**Date:** 2026-08-16
**Status:** Diagnostic only. **No production file was modified** — `git status` was clean before
and after every measurement; `simplex.ts` and `solver.ts` are byte-identical to their pre-session
state. The only files added are the read-only harness under
`scripts/lab-eps-ratio-test-2026-08-16/` and this doc.
**Verdict:** **GO for Harris (δ = 1e-8, pivot tolerance 1e-7)**, with `magnitude-tiebreak` as a
smaller-diff fallback. Two things must be decided by Dan before an implementation brief is
written — see "What the implementation brief must carry", items 1 and 2. **Periodic
refactorization is out of scope and should be dropped from `deferred-work.md` item 3's candidate
list** (Q3, answered with direct measurement).

Direct continuation of `criteria-calibration-dantzig-stress-test.md` (2026-08-12) and
`criteria-calibration-synthetic-oracles.md` (2026-08-16). Closes the diagnostic half of
`deferred-work.md` item 3; the implementation brief is the follow-up.

---

## Method — and why it is stronger than the previous two passes

The 2026-08-12 stress test used `lp-lab.mjs`, a hand-copied re-implementation of the solver
that had to be verified line-by-line against production before its numbers meant anything.
That is a real weakness: a copy can drift.

This pass avoids it. `scripts/lab-eps-ratio-test-2026-08-16/lab.vitest.config.ts` sets one Vite
alias — `/^\.\/simplex\.js$/` → `simplexLab.ts` — which redirects production's only two importers
of the solver (`solver.ts` and `scoreSpreadAccuracy.ts`). **Everything above the simplex is the
real production code**: `nextAction`, `CalibrationSession`, `computeCommitState`, `solveValues`,
`buildValueLP`. Only the leaving-row choice is swapped, at runtime, via `setRatioRule`.

`simplexLab.ts` is still a copy of `simplex.ts`, so it still needs a parity check — but that
check is now a *diff of two runs of identical calling code* rather than an eyeball comparison:

- `sweepProd.ts` runs under plain `tsx` (no alias) against the **real** `simplex.ts`.
- `levelA.labtest.ts` runs the identical sweep under the alias with rule = `baseline`.

**Result: bit-identical on all 181 solves** — same pass/fail, same failure message, and same
solved point estimates to 1e-9 (`digestDiffVsProd=0`). The closed-loop check is stronger still:
under `baseline` the lab reproduces the published 2026-08-16 oracle run *exactly* — oracle #1
crashes at round 79 (`phase1-iteration-cap`, minPivot 1.3238e-9), #2 at 87 (1.0319e-9), #3 at 56,
#8 at 44, and the non-crashing oracles land on the same rmse figures (#4 0.0143, #5 0.0547,
#6 0.0189, #7 0.0161, #10 0.0373). Every number below rests on that parity.

### The candidate rules as implemented

| rule | eligibility | step length | tie / choice |
|---|---|---|---|
| `baseline` (production today) | `coeff > EPS` (1e-9) | strict min ratio | smallest basis index |
| `magnitude-tiebreak` | `coeff > EPS` | strict min ratio | **largest \|pivot\|** |
| `magnitude-floor(f)` | `coeff > f`, EPS fallback if empty | min ratio *among eligible* | largest \|pivot\| |
| `harris(f, δ)` | `coeff > f`, EPS fallback if empty | **relaxed**: any row within `(b_i + δ)/coeff_i` | largest \|pivot\| |

`magnitude-tiebreak` is the minimal change: it only reorders *exact ties*, so the step length is
provably unchanged from production. The other two change which row leaves, and therefore the step.

### Regression set

1. **Committed real fixtures, every prefix** — `real-session-n31`, `n42-repro`,
   `real-production-n33`, `degree-anomaly-n31`, `solver-crash-n44`; 181 solves per rule. Note the
   brief asked for n=54/57/59/71: **those logs are not in the repo.** The n=54/57 discards live
   only in `criteria-calibration-ranking-stability-analysis.md` as prose, and Dan's 71-answer
   session was re-solved read-only from Supabase by the safety-net pass without being committed.
   No live DB was touched here, so the largest committed real fixture is n=44.
2. **Closed-loop oracles** — all 10 from `scripts/synthetic-calibration-oracles-2026-08-16.ts`,
   re-run through the real elicitation loop per rule. Necessary because a different ratio test
   produces different solved values, which changes which question the driver offers next, which
   changes the whole answer log — a captured-log replay cannot answer "does oracle #1 still crash".
3. **Adversarial sweep** — the equal-share and contradiction-rate tracks from the Dantzig stress
   test's Result 5, at n=150 and n=300, 10 trials per cell, 240 solves per rule. That pass's
   generator was scratchpad-only and never committed, so it was rebuilt to the same *separated*
   design. One improvement: `'equal'` answers here are **genuinely true** under the hidden oracle
   (a tied pair is built by permuting one profile's level multiset across equally-weighted
   criteria), so the equal-share track really does hold consistency fixed — the old pass flagged
   that overwriting answers with coin-flips conflated the two variables.

---

## Q1 — does the pivot-magnitude guard remove the mechanism, or just lower the floor?

**It depends which guard, and the distinction is the main finding of this pass.**

The cleanest metric is not the failure count but `nearSingularPivot` **incidence** — how often a
solve divides by anything under 1e-7 at all. A failure count can improve by luck; incidence going
to zero means the mechanism is gone.

Adversarial sweep, 240 solves per rule (120 at n=150, 120 at n=300):

| rule | n=150 failures | n=150 near-singular | n=300 failures | n=300 near-singular |
|---|---|---|---|---|
| `baseline` | 61/120 | 41/120 | 103/120 | 25/120 |
| `magnitude-tiebreak` | 4/120 | **5/120** | 53/120 | **10/120** |
| `magnitude-floor(1e-3)` | **0/120** | **0/120** | 51/120 | **0/120** |
| `harris(1e-7, 1e-8)` | **0/120** | **0/120** | 47/120 | **0/120** |

- **`magnitude-tiebreak` lowers the floor; it does not remove the mechanism.** It still admits
  1e-9 pivots (5 + 10 solves out of 240) and still fails 4 times at n=150. It is a large
  improvement — and on everything at realistic session length it is a *complete* one — but it is
  a better mitigation, not a cure. This matters because it is the smallest possible diff and would
  otherwise look like the obvious choice.
- **`magnitude-floor` and `harris` remove it outright**: zero near-singular pivots in 240 solves
  each, across every adversarial cell including 100%-`'equal'` at n=300 and 100%-contradiction at
  n=150 — the exact regimes `deferred-work.md`'s "All-'equal'-heavy answer logs" entry describes as
  unfixable without this work. That entry can be closed by either of these two rules.

**The n=300 residual failures are a different bug, and the fix cannot touch it.** For both curing
rules every n=300 failure has `nearSingular=0/10` with healthy pivots (minPivot 3.9e-2, 1.0e-1,
1.6e-1) and reason `phase1-iteration-cap` or a `buildValueLP` throw of the same origin. That is
**`MAX_ITERATIONS = 2000`** — already tracked as `deferred-work.md` item 4, first exceeded at
n≈300 per the stress test's own pivot-growth table. Under `baseline` the same cells fail *with*
near-singular pivots, so the two causes are genuinely separable only once the ratio test is fixed.
Note this is well beyond any real session (Dan's longest is 71).

On the committed real fixtures, **every** candidate rule — including bare `magnitude-tiebreak` —
takes all 181 prefixes to 0 failures, clearing the `solver-crash-n44` fixture that production
throws on today.

## Q4 — closed-loop oracles

| oracle | `baseline` | `magnitude-tiebreak` | `harris(δ=1e-8)` |
|---|---|---|---|
| #1 uniform | **crash @79** | exhaustion @80, degrees 2→6, maxAbsErr **0.0000** | exhaustion @80, degrees 2→6 |
| #2 single-dominant | **crash @87** | round-cap @90 | round-cap @90 |
| #3 zero-weight | **crash @56** | exhaustion @78, degrees 2→6, maxAbsErr **0.0000** | exhaustion @71, degrees 2→6 |
| #8 noisy | **crash @44** | round-cap @90, degrees 2→6 | exhaustion @83, degrees 2→6 |
| all 10 | **4/10 crash** | **0/10** | **0/10** |

This is more than "no crash". Under `baseline`, oracles #1 and #3 were killed mid-session while
still climbing; under `magnitude-tiebreak` they run to genuine `coverage-complete` having escalated
all the way to degree 6, and **recover their ground truth exactly** (maxAbsErr 0.0000, where the
published run recorded 0.0416 and 0.1665 at the crash). The
`criteria-calibration-synthetic-oracles.md` finding that "oracle #3 cannot settle the zero-weight
question because the solver crashed first" is now answerable: it settles correctly.

**Not everything improved, and this needs flagging.** Oracle #9 (barred from escalating) reaches
degree-2 `coverage-complete` at round **30** instead of 49, with *worse* recovery (maxAbsErr 0.125
vs 0.042). The escalation gate reads solved value *ranges*, and a different ratio test narrows them
differently — so this fix changes how long sessions run and when "you've resolved everything at this
level of detail" appears. That is user-visible and is not a solver-correctness question.

## Q2 — does Harris's deliberate infeasibility collide with the existing guards?

**Yes, and the threshold is sharp.** Harris's introduced violation tracks δ almost exactly
(181 Chebyshev solves per δ, committed fixtures):

| δ | feasible | rejected `post-solve-infeasible` | worst violation on success | headroom vs `FEASIBILITY_TOLERANCE` |
|---|---|---|---|---|
| 1e-10 | 181 | 0 | 3.8e-14 | 2.6e+6× |
| 1e-9 | 181 | 0 | 8.1e-15 | 1.2e+7× |
| **1e-8** | **181** | **0** | **4.7e-9** | **21×** |
| 5e-8 | 181 | 0 | 9.5e-8 | 1.1× |
| 1e-7 | 180 | **1** | 9.9e-8 | 1.0× |
| 1e-6 | 25 | **156** | 9.9e-8 | 1.0× |

At δ = 1e-6 the post-solve guard rejects **156 of 181 otherwise-good solves** — Harris's own
intentional slack being flagged as corruption, exactly the failure mode the brief hypothesised.
It is already biting at δ = 1e-7 (one clean prefix, `degree-anomaly-n31#27`, rejected at
maxViolation 1.4e-7 with a perfectly healthy minPivot).

- **δ must stay ≤ 1e-8**, which leaves 21× headroom. δ = 1e-9 is safer still but nearly inert
  (1 deviation from the strict min-ratio row across 181 solves, vs 41 at δ = 1e-8) — at that
  setting Harris degenerates into `magnitude-tiebreak`.
- **`PHASE1_FEASIBILITY_TOLERANCE = 1e-6` is not affected at any δ tested** — 0/181 rejections at
  δ = 1e-9, 1e-8, 1e-7 and 1e-6. Only the post-solve guard interacts.
- Neither guard needs loosening at δ = 1e-8. **Do not raise `FEASIBILITY_TOLERANCE` to accommodate
  a larger δ** — it is the only check that catches a corrupt solve, and the stress test picked
  1e-7 with two orders of clearance on each side.

### Why Harris is preferred over the plain magnitude floor, despite identical scores

`magnitude-floor` and `harris` are empirically indistinguishable in the tables above. They are not
equally safe in principle. `magnitude-floor` takes the minimum ratio **among rows clearing the
floor** — so when the floor excludes the true min-ratio row, the step overshoots and a basic
variable goes negative **by an unbounded amount**. Nothing in the rule caps it. Harris's δ is
precisely the bound that makes the same trade legitimate: it accepts a longer step only within an
explicitly chosen tolerance, which is why δ can then be checked against the guards (above).

The overshoot never bit here — `magnitude-floor(1e-3)` produced zero `post-solve-infeasible`
results anywhere — but that is a property of this constraint structure, not a guarantee, and it
would fail silently-shaped rather than loudly if the post-solve guard were ever weakened. The
"pivot-magnitude guard" sketched in `criteria-calibration-dantzig-stress-test.md` Result 4 is this
unbounded variant; **it should not be implemented as sketched.**

## Q3 — is periodic refactorization worth prototyping?

**No. Drop it.** This was answered by measurement rather than by architecture argument.

`drift.labtest.ts` recomputes the exact basic solution `x_B` from the *original* rows (Gaussian
elimination with partial pivoting) after every pivot and compares it against the tableau's own RHS
column, on the committed n=44 crash fixture — the solve that throws in production today:

| | `baseline` | `magnitude-tiebreak` |
|---|---|---|
| pivots | 818 | 160 |
| drift, pivots 1–626 | **~1e-15 (float noise, no trend)** | ~1e-15 throughout |
| pivot #627 | divides by **1.91e-9** | — |
| max\|tableau\| across that one pivot | **1.58e+4 → 8.26e+12 (×5.2e+8)** | largest jump ×2.5 |
| basis after it | numerically **singular** | never singular |
| outcome | `post-solve-infeasible`, maxViolation 3.1e-4 | feasible, maxViolation **1.8e-15** |

Drift sits at machine epsilon for 626 consecutive pivots and then the tableau is destroyed in a
single step. **There is no accumulated round-off for refactorization to purge.** A periodic
re-derivation schedule could only run *after* the damage, and re-deriving from a basis matrix that
is already singular recovers nothing. The premise the technique depends on is absent here — and
that is independent of the dense-vs-revised-simplex architecture question the brief flagged, so
that question does not need answering either.

---

## Finding not in the brief: the reported weights are not uniquely determined today

Every candidate rule changes the reported point estimates on **154 of 181** committed-fixture
prefixes, median absolute movement **0.167** on values that sum to 1. That looks alarming. It is
not a regression, and it is worth stating precisely because an implementation brief will trip over
it.

- `totalSlack` is **identical** under every rule on every prefix (max delta 0.00e+0) — the fitted
  feasible region does not move at all.
- The Chebyshev solve maximises exactly one number, the inscribed radius `r`. Measured per rule
  over the same 181 regions: **every rule attains the identical optimal radius on all 180 solvable
  regions** (`largerRadius=0 smallerRadius=0 tiedRadius=180`), and each rescues the one region
  baseline fails.

So all these point estimates are *equally optimal* solutions of the same LP. The region is so
degenerate (mean optimal radius ≈ 1.5e-7) that many points attain the maximum, and the pivoting
rule silently decides which one is reported. **Production's current weights are already one
arbitrary pick among ties** — this pass did not introduce that, it exposed it.

Consequences: existing users' solved weights will change when this ships, by amounts far larger
than any numerical tolerance, without anything being more or less "correct". And any future test
that pins specific solved values is pinning an arbitrary tie-break, not a property of the model.
A genuine fix would be a deterministic secondary objective (e.g. lexicographic tie-breaking, or
maximising a strictly convex proxy) — separate work, named here, not scoped.

## What the implementation brief must carry

1. **Decide whether re-pricing existing users' weights is acceptable** (the section above). This is
   Dan's call, not a solver question. Dan's own 71-answer log is the only real data affected.
2. **Decide the rule.** Recommendation: **`harris(pivotTolerance = 1e-7, δ = 1e-8)`** — removes the
   mechanism entirely (0/240 near-singular), never fails at n=150 on any adversarial cell, bounded
   and measured feasibility cost (4.7e-9, 21× under the guard), and principled where the plain
   magnitude floor is not. If a minimal diff is preferred over a cure, `magnitude-tiebreak` is
   provably step-length-neutral and clears every real fixture and all 10 oracles — but leaves the
   mechanism alive at n ≥ 150, so `deferred-work.md`'s all-'equal' entry would stay open.
3. **`solverCrashFixture.test.ts` will fail by design** — it asserts `SOLVER_CRASH_ANSWERS` still
   throws, precisely so the safety-net tests cannot silently pass against an inert input. Under
   every candidate rule that log now solves cleanly. Replace the fixture with a log that still
   breaks the *new* rule if one can be constructed, or restructure the safety-net tests to inject a
   throwing solver; do not just delete the assertion. (Constructing a new one may not be possible
   at realistic n — that is itself the point of the fix.)
4. **Anti-cycling: nothing is lost, but say so explicitly.** Baseline's smallest-basis-index
   tie-break is the last Bland-flavoured component; every candidate replaces it. No guarantee
   survives either way — Bland's rule needs *both* halves and the entering half became Dantzig in
   2026-08-12. Empirically the candidates cycle less, not more: max pivots per solve across the 181
   committed regions drops 844 → 200, median 108 → 91, with zero iteration-cap hits.
5. **`MAX_ITERATIONS = 2000` becomes the binding limit once this lands** (`deferred-work.md` item
   4). It is the sole remaining cause of adversarial failure at n=300. Not in scope here; the
   pivot-count reduction above buys real headroom against it.
6. **Escalation timing changes** (oracle #9: coverage-complete at round 30 vs 49, worse recovery).
   Re-check `MAX_VALUE_RANGE_FOR_COVERAGE = 0.2` against the new solver before shipping — it was
   calibrated on the 2026-08-09 oracle trace under the old ratio test.

## Reproducing

Harness committed at `scripts/lab-eps-ratio-test-2026-08-16/` (read-only, not wired into any build
step — same convention as `scripts/synthetic-calibration-oracles-2026-08-16.ts`). Saved outputs
from the 2026-08-16 run are in that directory's `out/`; findings above are frozen from that run.

```bash
npx tsx scripts/lab-eps-ratio-test-2026-08-16/sweepProd.ts
npx vitest run --config scripts/lab-eps-ratio-test-2026-08-16/lab.vitest.config.ts
```

`sweepProd.ts` must be run first and under plain `tsx` — it captures the unaliased production
baseline that `levelA.labtest.ts` diffs against. Pass a name (`levelA`, `drift`, `pivots`,
`centers`, `deltas`, `harrisDelta`, `adversarial`, `oracles`) to run one file; `adversarial`
(~50 min, `LAB_TRIALS` / `LAB_NS` / `LAB_RULES` / `LAB_TAG`) and `oracles` (~25 min,
`LAB_ORACLE_ROUNDS`) are the slow ones, and `baseline` is ~100× slower than the candidates in the
adversarial sweep because its failing cells burn the iteration cap.
