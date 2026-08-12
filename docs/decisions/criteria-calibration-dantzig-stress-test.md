# Criteria Calibration — Dantzig pivoting rule: extended stress test (READ-ONLY pass)

**Date:** 2026-08-12
**Status:** Diagnostic only. **No production files were modified** — `simplex.ts` and
`solver.ts` are byte-identical to their pre-session state. No writes to Dan's live Supabase
session; the only real data used is the already-cached 58-answer dump.
**Verdict:** **GO** — proceed to a production implementation brief for pure Dantzig, with two
caveats that belong in that brief (below).

---

## Why this pass existed

The previous session found that the LP infeasibility crash was *not* cycling but **numerical
amplification**: Bland's rule selects near-zero pivot elements on this problem's constraint
shape, blowing tableau magnitudes up to ~5e25. Dantzig's rule (most-negative reduced cost)
was tested at n=59 across 120 random answer orderings: 0/120 failures vs Bland's 44/120.

That was a single-n result on one person's data. Dan wanted broader confidence before
committing production code that determines real preference weights. This pass extends the
test across n, across data distributions, and into deliberately adversarial inputs.

## Method

Same instrumented-scratch approach as the prior two diagnostic passes: `lp-lab.mjs` is a
verbatim copy of `simplex.ts`'s two-phase logic plus `solver.ts`'s `buildValueLP` phase-1
constraint construction, with a pluggable entering rule and added instrumentation
(per-pivot degeneracy classification, **smallest pivot element used**, **largest tableau
entry reached**). Verified line-by-line against production before use.

Real data caps out at 59 answers, so n>59 required synthetic sessions. The generator mirrors
`elicitationDriver.ts`'s candidate rules (random criterion subset, level draw, rejection of
full ties, partial ties, and dominated pairs) and answers from a hidden monotone oracle with
a tunable self-contradiction rate. **The generator was validated before use**: at n=59 it
reproduced Bland's failure rate on real data (17/30 synthetic vs 11/30 real ≈ the prior
session's 44/120). Three tracks were run — real data, pure synthetic, and real-59 +
synthetic continuation — and they agree throughout.

Sample sizes are stated per table below; the headline sweeps used 300 Dantzig trials per
(n, track) with Bland comparators at 120 trials (n≤59) / 30 trials (n>59, where Bland is
~100x slower because it burns the iteration cap).

---

## Result 1 — Dantzig holds across the whole realistic range

Dantzig, 300 trials per cell, under the **production** cap `MAX_ITERATIONS = 2000`:

| track | n=20 | n=40 | n=59 | n=80 | n=100 | n=150 | n=200 | n=300 |
|---|---|---|---|---|---|---|---|---|
| real (random orderings/subsets) | 0 | 0 | 0 | — | — | — | — | — |
| synthetic oracle | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| real 59 + synthetic tail | — | — | 0 | 0 | 0 | 0 | 0 | 0 |

Failures across every cell: **zero**. Worst constraint violation anywhere in that block:
**6.6e-13**. Bland over the same sets fails 44/120 at n=59 (real), 62/120 at n=59
(synthetic), and **30/30 at n=150**.

Correctness where both rules converged: worst objective disagreement 7.9e-13 (real),
2.0e-8 (synthetic n=59). Dantzig's solutions satisfy monotonicity, non-negativity, and the
sum-to-1 normalization to ~1e-13.

**Head-to-head, 1760 paired solves across every case and n tested: the number of instances
where Bland produced a correct answer and Dantzig did not is 0.** Dantzig strictly dominates
Bland on this problem. There is no correctness argument for keeping Bland anywhere in the
path.

## Result 2 — pivot growth is roughly linear, and the 2000 cap is the real ceiling

Dantzig, cap raised to 100000 to measure what the LP actually needs:

| n | rows | mean pivots | pivots/n | pivots/row | trials > 2000 |
|---|---|---|---|---|---|
| 10 | 30 | 34 | 3.4 | 1.13 | 0/40 |
| 59 | 89 | 212 | 3.6 | 2.38 | 0/40 |
| 100 | 137 | 383 | 3.8 | 2.80 | 0/40 |
| 150 | 198 | 598 | 4.0 | 3.02 | 0/40 |
| 200 | 265 | 853 | 4.3 | 3.22 | 0/20 |
| 300 | 375 | 1455 | 4.9 | 3.88 | **1/20** |
| 400 | 504 | 1838 | 4.6 | 3.65 | 0/8 |
| 600 | 739 | 3352 | 5.6 | 4.54 | **8/8** |
| 800 | 980 | 4297 | 5.4 | 4.38 | **4/4** |

Growth is **linear with a slow drift** — pivots ≈ 4n, with the constant creeping from ~3.0
to ~5.6 over a 60x range in n. Not the runaway the prior n=1..59 data (0.93 → 2.35
pivots/row) might have suggested at the top end, but the drift is real and monotone.

The structural reason growth stays tame: the model has **only 24 value variables regardless
of n**. Every additional answer adds one row and one slack variable, so the problem grows in
constraints, not in the dimension being fitted.

**`MAX_ITERATIONS = 2000` is first exceeded at n≈300 and is routinely exceeded by n≈400–600.**
It is safe for any plausible near-term session length and is *not* safe if auto-escalation
ever pushes sessions into the hundreds. This should be stated in the implementation brief;
it does not block the change.

### Growing-but-not-failing signals (brief item 3)

Two off-trend pivot-count explosions, both at n well beyond the brief's range, both
correlated with the near-zero-pivot mechanism described in Result 4:

- **real+synth n=800**: mean 18932, max 57862 pivots (pivots/row 19.4 vs the ~4.5 trend).
- **kitchen-sink adversarial n=400**: mean 9142, max 52512 (pivots/row 14.6 vs ~3).

Neither failed at cap 100000, but both are ~10x off trend and are early warnings of the same
breakdown, not ordinary growth.

## Result 3 — Dantzig's zero-failure record does NOT hold universally

This is the finding that changes the picture from the n=59-only test, and it should not be
soft-pedalled. Under the production cap, Dantzig, 120–300 trials per cell:

| adversarial case | n=20 | n=59 | n=100 | n=150 | n=300 |
|---|---|---|---|---|---|
| duplicate-heavy (pool of 8 / of 2) | 0 | 0 | 0 | 0 | 0–1 |
| symmetric-swap indifference pairs | 0 | 0 | 0 | 0 | 0 |
| rank-deficient (only 2 criteria ever touched) | 0 | 0 | 0 | 0 | **17 loud + 1 silent** |
| kitchen-sink (dupes + contradictions + swaps) | 0 | 0 | 0 | 1 | 1 |
| **all-'equal' sequences** | 0 | 0 | **1 loud + 3 silent** | **15 loud + 6 silent** | **53 loud + 7 silent** |
| real answers forced to all-'equal' | 0 | 0 | **4 loud + 2 silent** | **11 loud + 4 silent** | **14 loud + 3 silent** |

Two failure modes, and the second is the dangerous one:

- **loud** — returns `feasible: false`; the UI's error path handles it.
- **silent** — returns `feasible: true` with an `x` that violates its own constraints by up
  to **1.3** (on variables normalized to sum to 1). Production consumes `x` directly as the
  preference weight vector, so these are wrong weights presented as correct ones.

**Raising the iteration cap does not fix this.** At n=150 all-equal, going from cap 2000 to
cap 100000 reduced loud failures 15→5 but *increased* silent wrong answers 6→10. The
breakdown is numerical, not budgetary.

Some of these failures carry a signature that is mathematically impossible in exact
arithmetic: `phase1-unbounded`. Phase 1 minimizes a sum of non-negative artificial variables
and is bounded below by zero, so it cannot be unbounded. Every occurrence is proof of
tableau corruption rather than a legitimate LP outcome.

## Result 4 — the root cause is not the pivoting rule at all

The instrumentation makes the mechanism unambiguous. Across every cell in the entire study,
**the smallest pivot element used is a perfect predictor of failure**:

| case | min pivot element | max tableau entry | outcome |
|---|---|---|---|
| real n=59, Dantzig | 4.9e-3 | 6.3e+3 | 0/120 fail |
| real n=59, **Bland** | **1.00e-9** | **1.85e+46** | 48/120 loud + 2 silent |
| all-equal n=59, Dantzig | 1.8e-3 | 1.2e+4 | 0/120 fail |
| all-equal n=100, Dantzig | **1.01e-9** | **3.02e+17** | 1 loud + 3 silent |
| all-equal n=150, Dantzig | **1.00e-9** | **1.31e+31** | 15 loud + 6 silent |
| all-equal n=59, **Bland** | **1.00e-9** | **3.63e+49** | 60/60 fail |

Whenever the ratio test admits a pivot element sitting at the `EPS = 1e-9` floor, the tableau
blows up and the solve is corrupt. Whenever the smallest pivot element stays at ~1e-3 or
above, the solve is clean. There is no counterexample in either direction anywhere in the
data.

**So the true root cause is `simplex.ts`'s `EPS = 1e-9` ratio-test threshold accepting
near-singular pivots — not the choice of entering rule.** Dantzig is a very effective
mitigation because its column choice makes such pivots rare, but it is a mitigation, not a
cure. A pivot-element magnitude guard in the ratio test (reject candidate rows whose pivot
element is below a magnitude floor, preferring a larger-element row) attacks the actual
mechanism and would compose with Dantzig rather than replace it.

## Result 5 — what actually endangers the solver (and how far real data is from it)

A first attempt at this sweep conflated two variables (it varied the 'equal' share by
overwriting answers with coin flips, which also changed answer *consistency*). Re-run with
the variables separated, Dantzig at cap 2000, 120 trials per cell:

**A. 'equal' share, answers fully self-consistent:**

| equal share | 0% | 9% | 18% | 43% | 71% | 93% | 100% |
|---|---|---|---|---|---|---|---|
| failures at n=150 | 0 | 0 | 0 | 0 | 2+2 | 3+3 | 12+8 |
| failures at n=300 | 0 | 0 | 1+0 | 5+1 | 25+3 | 44+1 | 49+9 |

**B. self-contradiction rate, 'equal' share held at ~18–32%:**

| contradiction rate | 0% | 5% | 15% | 30% | 50% | 75% | 100% |
|---|---|---|---|---|---|---|---|
| failures at n=150 | 0 | 0 | 0 | 0 | 0 | 5+1 | 22+1 |
| failures at n=300 | 0 | 0 | 1+0 | 66+0 | 120+0 | 120+0 | 120+0 |

**Dan's real session sits at 12% 'equal' with a low contradiction rate.** At n=150 that is
comfortably inside the clean region on both axes — the equal share would have to roughly
sextuple, or the contradiction rate reach ~75%, before failures appear. At n=300 the margin
narrows materially on the consistency axis (30% contradictions already breaks it). Sessions
of a few hundred answers with an indecisive or inconsistent user are the regime to watch.

---

## Rejected alternative: Dantzig primary with Bland fallback

Considered and **explicitly rejected** in the prior session; this pass reinforces the
rejection with new evidence rather than overturning it.

The proposed design was: use Dantzig, and switch to Bland after *k* consecutive degenerate
pivots as an anti-cycling safety net.

Original reason for rejection — **the trigger is the wrong signal.** Degenerate-pivot
percentage *declines* as n grows (65% → 50% → 43% over n=20/40/59 on real data, and 37% →
29% by n=150) while the real failure mode — near-zero pivot elements — gets *worse*. A
fallback keyed on consecutive degenerate pivots would therefore be least likely to fire
exactly when it is most needed.

Two further reasons from this pass:

1. **Bland is not a safety net here; it is the hazard.** Head-to-head over 1760 paired
   solves, there is not one instance where Bland succeeded and Dantzig failed. On the
   all-equal sets where Dantzig degrades at n≥100, Bland fails **60/60 already at n=59**.
   Falling back to Bland in a hard case swaps a rule that sometimes fails for one that
   nearly always does.
2. **Bland has its own silent-wrong mode** (see the note below), so the fallback could
   convert a loud Dantzig failure into a silent Bland one — strictly worse.

The right follow-on for the residual risk is the **pivot-magnitude guard** of Result 4, not a
rule-switching fallback.

---

## Incidental finding: Bland silently returns wrong weights in production today

Not what this pass was looking for, and it concerns current shipped behaviour, so flagging it
plainly.

At the **production** cap of 2000, at n=59 on Dan's real answers across 120 orderings, Bland:

- fails loudly in **48/120** orderings (already known), and
- returns `feasible: true` with a **not-actually-feasible** solution in **2/120** orderings.

Inspected directly (`run-trial55.mjs`): in one case the returned weight vector contains a
**negative value variable** (criterion 4 / level 2 at −0.0220, i.e. the weights claim level 2
is worse than level 1) and violates one of Dan's own answer constraints by 8.65e-2 — while
reporting an objective of 6.0000e-4, **identical to Dantzig's correct answer**. Nothing
downstream would flag it: the objective looks right, so the score-spread accuracy metric
would look right, and only the weights are wrong.

`two-phase-simplex-rewrite.md` records that the two-phase rewrite fixed Big-M's
`feasible: true`-with-garbage behaviour. That is true of the *loud* case — the added
`converged` check catches cap exhaustion — but `converged` only means "no negative reduced
cost was found", which a corrupted tableau can satisfy. The silent mode survived the rewrite
at reduced frequency. Switching to Dantzig removes it on realistic data (0 silent in 900
production-cap solves on real data); a feasibility check on the returned `x` would remove the
class of bug outright.

---

## Verdict and what the implementation brief should carry

**GO.** Dantzig's robustness holds up under the broader test on every realistic input tested,
strictly dominates Bland everywhere, and its correctness is sound to ~1e-13. Nothing
surfaced that argues against the change; what surfaced argues for making it *sooner*, since
the incumbent rule is silently corrupting weights at a low rate today.

Three items to carry into the implementation brief:

1. **Dantzig is a mitigation, not a cure.** The root cause is the `EPS = 1e-9` ratio-test
   threshold admitting near-singular pivots (Result 4). Follow-on work: a pivot-element
   magnitude guard, and a post-solve feasibility check on `x` so a corrupt solve can never be
   returned as `feasible: true`.
2. **`MAX_ITERATIONS = 2000` is fine now and is not fine forever** — first exceeded at
   n≈300, routinely by n≈400–600. Relevant to any auto-escalation work that lengthens
   sessions.
3. **Record the rejected fallback design and its reasoning** (section above), so a future
   session doesn't re-propose it.

## Reproducing

Harness lives in this session's scratchpad (not committed):
`lp-lab.mjs` (instrumented solver + LP construction), `synth.mjs` (validated synthetic
generator), and runners `pilot.mjs`, `run-extended.mjs`, `run-growth.mjs`, `run-prodcap.mjs`,
`run-allequal.mjs`, `run-dominance.mjs`, `run-q4fix.mjs`, `run-trial55.mjs`, with outputs
saved alongside as `*-out.txt`.
