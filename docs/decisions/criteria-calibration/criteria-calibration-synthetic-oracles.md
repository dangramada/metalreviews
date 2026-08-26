# Criteria Calibration — synthetic calibration oracles: solver correctness + UX-arbitration data

**Date:** 2026-08-16. **Status: read-only diagnostic. No production files changed, no fixes
applied.** Follows the `two-phase-simplex-rewrite.md` / `criteria-calibration-dominance-filter.md`
/ `criteria-calibration-dantzig-stress-test.md` precedent: oracle-driven diagnostics with
**known ground truth**, so solver output can be checked against a known correct answer, not
just internal consistency.

Ten synthetic 6-criterion oracles, each driving the real adaptive elicitation flow —
`nextAction()` (`elicitationDriver.ts`), `CalibrationSession` (`calibrationSession.ts`),
`computeCommitState` (`commitComputation.ts`, the same per-commit entry point
`CriteriaCalibrationPage.tsx` uses) — called live, in response to whatever candidate pair the
driver actually offers, answered from a fixed known ground-truth weight/level vector. **Not**
a pre-scripted answer sequence: every oracle is a closed loop over the production code with a
different hidden "personality," matching the brief exactly.

Harness: `scripts/synthetic-calibration-oracles-2026-08-16.ts` (kept, read-only, not wired
into any build step — same convention as `scripts/diagnose-second-session-flatness-2026-08-15.ts`).
Full per-round trajectory (all 10 oracles): `docs/data/criteria-calibration/synthetic-oracle-trajectories-2026-08-16.csv`.

## Headline finding, not in the original brief: a live solver crash

**4 of 10 oracles — including the most benign one — crashed the real production solver with
a numerical breakdown before finishing.** This surfaced by just running the harness, not by
looking for it, and changes the shape of this report: the crash is now the primary
solver-correctness finding, ahead of the three questions the brief posed.

| Oracle | Crashed at round | LP diagnostic |
|---|---:|---|
| #1 uniform | 79 | `phase1-iteration-cap`, minPivotMagnitude 1.32e-9 |
| #2 single-dominant | 87 | `phase1-iteration-cap`, minPivotMagnitude 1.03e-9 |
| #3 zero-weight-criterion | 56 | `post-solve-infeasible`, minPivotMagnitude 1.27e-9 |
| #8 noisy | 44 | `post-solve-infeasible`, minPivotMagnitude 1.91e-9 |

All four are the exact `nearSingularPivot` mechanism `criteria-calibration-dantzig-stress-test.md`
already root-caused (`EPS = 1e-9` ratio-test threshold admitting near-singular pivots) and
that pass's own "GO" verdict said held with **zero failures** across n=20…300 on its own
synthetic oracle track and Dan's real data. This run disagrees on the most important point:
**oracle #1 (uniform weights, linear level spacing — the most benign, symmetric case
possible) crashed at n=79, with `totalSlack = 0.000000` at every round up to the crash** (see
the CSV) — fully self-consistent answers, zero contradictions, not the "all-equal-heavy" or
"high-contradiction-rate" adversarial regime the stress test identified as the danger zone.
This is a **new failure regime**: clean, well-behaved, realistic-shaped input, well within
the answer-count range Dan's own real sessions already reach (33/70/71 real answers) or could
plausibly reach with a few more sittings. This is not a contradiction of the stress test's own
data (that pass used a different candidate generator and didn't specifically construct a
clean 6-criterion uniform oracle at this exact scale) — it's new evidence the stress test
didn't happen to surface, and it matters because it means **a real user with an unremarkable,
consistent preference pattern is not provably safe from this crash** simply by being
consistent and not over-using "equal."

**Leading indicator, incidentally found:** oracle #1's accuracy trajectory shows 3
monotonicity violations in the 5 rounds immediately before its crash (round 74: 0.9723→0.9628,
round 76: same, round 78: 0.9723→0.9532 — real, non-trivial dips, not float noise). No other
non-crashed oracle shows a violation of this size. This is consistent with the LP tableau
already destabilizing before the final throw, and could plausibly serve as an early-warning
signal in production — flagged as an observation, not a proposed fix; out of this brief's
scope.

This finding does not resolve the pivot-magnitude-guard follow-on `criteria-calibration-dantzig-stress-test.md`
already named — it strengthens the case for it. Filed as a priority addition to
`deferred-work.md`.

## Method

- **Criteria shape:** 6 criteria × 5 levels, matching production (`LEVELS_PER_CRITERION =
  [5,5,5,5,5,5]`).
- **Driving loop:** call `nextAction(session, levelsPerCriterion, degree)`; if `ask`, answer
  from the oracle's ground truth (exact score comparison, `'equal'` only on a true tie);
  `session.recordAnswer(...)`; recompute the full per-commit state via `computeCommitState`
  (solved values, score-spread accuracy, tier, ranking-stability window) exactly as
  production does per real answer. If `degree-exhausted` and escalation is available, the
  harness **always escalates** (unlike production today, where Brief 3 gates *auto*-escalation
  at `fired` but a user can still manually click through — the harness models "a user who
  keeps clicking through no matter what," which is what's needed to observe the true
  fired→exhaustion gap this brief asks about).
- **Ranking-stability signal (`fired`):** needs `RANKING_TEST_SET`-shaped ratings. Real ones
  aren't in this repo (no criteria ratings are checked in), so 13 synthetic album profiles
  were generated once, seeded, and shared identically across all 10 oracles — only each
  oracle's ground-truth *weights* determine ranking/stability, not the album pool.
- **Round cap: 90, compute-informed, not a product assumption.** Per-round cost grows
  steeply with answer count (`computeCommitState`'s cost went from ~5ms at n=1 to ~3s at
  n=73 in a timing pilot — matches the documented, unfixed O(n²)-ish `computeScoreSpreadAccuracy`
  cost, compounded by the also-documented, unfixed duplicate `solveValues` call inside
  `nextAction` itself — see `deferred-work.md`'s "`nextAction` and `computeCommitState` each
  run their own `solveValues`" entry, reproduced live here). 90 real answers were **not**
  expected to be enough for every oracle to reach true degree/coverage exhaustion (degree can
  go to 6) — and indeed none of the round-cap-terminated oracles did. This mirrors reality:
  Dan's own real sessions (33/70/71 answers) never reached full exhaustion either.
- **Oracle #3/#5/#6 construction (level-shape control):** oracles #4/#5/#6 share one weight
  vector (`[0.30, 0.25, 0.20, 0.10, 0.10, 0.05]`) and differ only in within-criterion shape —
  linear, front-loaded, back-loaded respectively — isolating shape fidelity from weight
  recovery.
- **Oracle #10 construction:** "rough weight shape from Dan's real sessions" has no portable
  numeric form in this repo (the referenced CSV records only the accuracy/tier/fired
  trajectory, not solved weight vectors) — so its ground truth was derived by running the
  real `solveValues` against `REAL_PRODUCTION_SESSION_ANSWERS` (Dan's actual first 33-answer
  session, already committed as a fixture) and using that solved vector directly as the
  oracle's ground truth. This is a real, derived-from-real-data anchor, not invented.

## Ground truth recovery — per oracle

`maxAbsErr`/`rmse` are computed against **whatever round the oracle stopped at** (crash, round
cap, or the degree-2-only design stop) — not a fully-converged end state, since most oracles
didn't reach one. Treat every row below as "recovery so far," not "recovery at convergence."

| # | oracle | stop | round | maxAbsErr | rmse | high@ | veryHigh@ | fired@ |
|---:|---|---|---:|---:|---:|---:|---:|---:|
| 1 | uniform | solver-crash | 79 | 0.0416 | 0.0294 | 5 | 32 | 34 |
| 2 | single-dominant | solver-crash | 87 | **0.4140** | 0.1319 | never | never | never |
| 3 | zero-weight-criterion | solver-crash | 56 | 0.1665 | 0.0595 | 30 | 35 | 47 |
| 4 | linear-control | round-cap | 90 | 0.0431 | 0.0143 | 90 | 90 | never |
| 5 | front-loaded | round-cap | 90 | 0.1140 | 0.0547 | never | never | never |
| 6 | back-loaded | round-cap | 90 | 0.0644 | 0.0189 | 68 | never | 80 |
| 7 | near-tied | round-cap | 90 | 0.0272 | 0.0161 | 63 | never | 75 |
| 8 | noisy | solver-crash | 44 | 0.0417 | 0.0295 | 9 | 34 | never |
| 9 | short-session (degree-2 cap) | degree2-cap, real exhaustion | 49 | 0.0417 | 0.0295 | 5 | 32 | 34 |
| 10 | dan-approximation | round-cap | 90 | 0.0736 | 0.0373 | 40 | 86 | 52 |

**Not "close enough" uniformly.** Symmetric/near-symmetric ground truths (#1, #7, #8, #9)
recover well (rmse 0.016–0.030). Oracle #2 (single dominant criterion, ~70% of total weight)
is a clear, sizeable miss: after 87 real answers, solved best-level values are `[0.286, 0.143,
0.143, 0.143, 0.143, 0.143]` against a true `[0.70, 0.06, 0.06, 0.06, 0.06, 0.06]` — the
solver never gets closer than a 0.41 absolute error on the dominant criterion and never even
reaches High tier. **Cold-start's canonical comparisons (max-vs-1 per pair) establish
direction (which criterion wins) but not magnitude** — confirming a dominant criterion needs
many more, and more targeted, comparisons than a moderate one to have its true weight
*recovered precisely*, not just correctly *ranked*. This is a real, load-bearing gap for any
future UX that implies "the app has learned your true weights" once a tier is reached — tier
crossing measures ranking-consistency confidence, not weight-magnitude accuracy, and oracle
#2 shows those can diverge substantially.

### Oracle #3 — the historical "criterion 5 near-zero" finding: unsettled, and here's why

At the crash (round 56, mid-degree-3), the zero-weight criterion (index 5) has **not**
converged to zero: solved shape `[0, 0.125, 0.125, 0.125, 0.167]` against ground truth `[0, 0,
0, 0, 0]`. But its own **feasible range at level 5 is `-0.0000 to 0.1665`** — true zero sits
exactly at the bottom of the range the solver has already established; the Chebyshev-center
point estimate is just sitting near the *top* of that range rather than the bottom. The
mechanism is visible directly in the numbers: all five real (nonzero) criteria are each
under-shot by exactly the same 0.0333, and `5 × 0.0333 = 0.1665` — precisely criterion 5's
excess. Normalization (`sum of best-level values = 1`) forces the "missing" 0.1665 budget
*somewhere*; because the other five criteria haven't yet been individually pinned tightly
enough, the joint Chebyshev-center solve is free to park it on the criterion that's actually
supposed to hold zero.

**This can't settle the original question, and that's itself the honest finding: the solver
crashed before reaching a state where it could be answered.** What it does add: a zero-weight
criterion's *point estimate* is not a reliable "has the solver learned true irrelevance yet"
signal on its own — its *range* is the trustworthy part (0 stayed inside it at every
checkpoint up to the crash), while the point estimate can sit anywhere up to ~1/6 of the total
weight budget purely from under-determination elsewhere in the model, with no data-quality
problem at all. The original 33-answer session's near-zero point estimate is therefore
plausible either as a genuine, converged finding, or as this same underdetermination
happening to park the center near zero that particular time — this run cannot distinguish the
two, and neither could the original session's own data on its own terms.

### Oracles #5/#6 — plateau shape: fidelity confirmed, magnitude recovery is asymmetric

Both recover the **correct qualitative shape** — this is the fidelity-vs-fabrication question
the brief posed, and the answer is fidelity, not fabrication:

| | level 2 | level 3 | level 4 | level 5 |
|---|---:|---:|---:|---:|
| #5 front-loaded, solved | 0.146 | 0.195 | 0.244 | 0.268 |
| #5 front-loaded, ground truth | 0.225 | 0.255 | 0.279 | 0.300 |
| #6 back-loaded, solved | 0.052 | 0.070 | 0.139 | 0.302 |
| #6 back-loaded, ground truth | 0.021 | 0.045 | 0.075 | 0.300 |

Front-loaded's solved curve is still front-loaded (big early jump relative to later ones);
back-loaded's solved curve is still back-loaded (small early jumps, big final one, and it
essentially reaches the true final value). Neither collapses toward a flat/linear default —
the solver is responding to the actual shape of the answers, not fabricating a generic
plateau. **But magnitude recovery is clearly asymmetric**: back-loaded reached High tier at
round 68 and stayed within 0.06 rmse of ground truth; front-loaded never left degree 2 or
reached High tier in 90 rounds, and stayed compressed well below its true scale throughout.
Both oracles share the same weight vector, seed, and candidate-generation logic — only the
shape differs — so this asymmetry is a genuine, reproducible property of front-loaded vs.
back-loaded shapes under this elicitation design, not sampling noise. No mechanism is claimed
beyond what's directly observable here; worth a closer look if a future session revisits
degree-2 candidate weighting.

## UX-arbitration questions

### 1. Idea 1 (hide accuracy in degree 2 entirely) — premise confirmed, but incomplete

**Yes, an oracle can complete and stop fully inside degree 2.** Oracle #9 (uniform ground
truth, deliberately barred from escalating) hit `degree-exhausted`/`coverage-complete` at
round 49 without ever leaving degree 2 — the premise Idea 1 depends on is real, not
hypothetical.

**But Progress% is not free of jarring jumps on its own, and today it can't be, because it's
the same number as Accuracy%.** `CriteriaCalibrationPage.tsx:594` sets
`accuracyPercent={progressPercent}` — they are one live variable, not two. Oracle #9's own
trajectory shows a 22-percentage-point jump in a single answer at round 4 (11% → 76%,
reproducing the same "punctuated" pattern already documented for Dan's real second session:
10%→68% by round 7). Hiding the *Accuracy* label doesn't remove this jump from what the user
sees under *Progress* — it's the identical underlying value. **Idea 1's premise (degree-2-only
completion is achievable) holds; its implicit assumption (that Progress% alone needs no
explanation) does not, unless a future implementation actually decouples Progress% from the
accuracy-derived metric** — e.g. a genuine coverage/round-based progress measure, not a
relabeled accuracy number. This is exactly the same tension the 1000minds comparative
research already flagged from the outside (`criteria-calibration-1000minds-comparative-research.md`:
1000minds' own Progress% "is visibly non-linear with no explanation").

### 2. Idea 2 (hard-stop-with-continue at `fired`) — the gap varies a lot; 14 is not obviously typical

| oracle | fired@ | stopped@ | gap | note |
|---|---:|---:|---:|---|
| #1 uniform | 34 | 79 | **45** | lower bound — crashed, true gap unknown and possibly much larger |
| #3 zero-weight | 47 | 56 | **9** | lower bound — crashed |
| #6 back-loaded | 80 | 90 | **10** | lower bound — round cap |
| #7 near-tied | 75 | 90 | **15** | lower bound — round cap |
| #9 short-session | 34 | 49 | **15** | **exact — real degree-2 exhaustion, not censored** |
| #10 dan-approximation | 52 | 90 | **38** | lower bound — round cap |
| #2, #5, #8 | never fired | — | — | — |

Dan's real second session measured 14. Oracle #9 — the one uncensored data point in this set,
since it's the only oracle that reached genuine exhaustion rather than hitting the crash or
the round cap — lands at 15, remarkably close. But every *other* value in the table is a
**lower bound**, and several are already well past 14 before being cut off (oracle #1 at 45
and still climbing when the crash hit; oracle #10 at 38 and still climbing at the round cap).
**14 looks like it may sit toward the low end of the real range, not a typical value** — a
hard-stop screen calibrated on Dan's single real trace risks under-selling how much more
learning realistically remains for other weight shapes. `fired` is, however, **consistent in
the one direction that matters most for a pause-screen design**: in no oracle did it fire
*after* exhaustion, or fail to fire well ahead of it — it never fires "too late." What it
can't promise is a consistent "you're almost done" framing; the honest copy would need to
avoid implying a fixed remaining distance.

### 3. Coverage/range signal during the post-`fired` plateau — mixed, not uniform

| oracle | width @ fired | width @ stop | Δ | % narrowed |
|---|---:|---:|---:|---:|
| #1 uniform | 0.1146 | 0.0416 | 0.0730 | 64% (censored — crashed) |
| #3 zero-weight | 0.0406 | 0.0406 | 0.0000 | 0% (only 9 rounds observed) |
| #6 back-loaded | 0.1497 | 0.1429 | 0.0068 | 5% |
| #7 near-tied | 0.1790 | 0.1738 | 0.0053 | 3% |
| #9 short-session | 0.1146 | 0.0417 | 0.0729 | **64% — real, uncensored** |
| #10 dan-approximation | 0.1736 | 0.1354 | 0.0382 | 22% |

Genuinely mixed, reported honestly both ways: for the uniform/symmetric ground truth
(oracles #1 and #9, and #9 is the clean, uncensored case) coverage width keeps narrowing
**substantially** after `fired` — real, continued signal a user isn't shown today. For
back-loaded and near-tied ground truths, over a similar or longer post-fired window, it's
nearly flat (3–5%). This is consistent with the proposal's premise being **real but
shape-dependent** — the product can't know in advance which regime a given user's session is
in, so a coverage/confidence second signal would sometimes show meaningful continued
narrowing and sometimes look nearly as flat as accuracy already does. That's a real argument
*for* surfacing it (it's the only one of the two metrics that ever shows continued movement in
this data) but not a guarantee it reads as informative every time.

### 4. Tier-crossing consistency — round count is a bad basis for "how much is left" copy

| oracle | High (0.75) @ round | Very High (0.85) @ round |
|---|---:|---:|
| #1 uniform | 5 | 32 |
| #2 single-dominant | never (87 rounds) | never |
| #3 zero-weight | 30 | 35 |
| #4 linear-control | 90 | 90 |
| #5 front-loaded | never (90 rounds) | never |
| #6 back-loaded | 68 | never |
| #7 near-tied | 63 | never |
| #8 noisy | 9 | 34 |
| #9 short-session | 5 | 32 |
| #10 dan-approximation | 40 | 86 |

The spread is enormous: High tier is reached as early as round 5 (uniform) or not at all
within 90 rounds (single-dominant, front-loaded) — an 18×+ range among the oracles that
crossed it at all, plus two that never did. **A round-based framing ("N more questions") would
be wrong for a large share of real users by construction** — the actual number of questions
needed to reach a given confidence level depends heavily on the user's own weight shape, which
the product has no way to know in advance. The existing percent-based framing (score-spread
accuracy itself) is the more consistent basis of the two, even though — per Idea 1's finding
above — it isn't jump-free either. Neither is a clean answer to "how much is left"; round-count
is measurably the worse of the two.

## What NOT concluded here

No production code was changed. No fix is proposed for the solver crash, the front/back-loaded
asymmetry, oracle #2's slow convergence, or any UX question above — this is data collection for
a future Concept Draft session and a future solver-hardening session, per the brief's scope.

## Follow-ups for `deferred-work.md`

1. **New, higher-priority evidence for the existing pivot-magnitude-guard item**: the LP
   solver crash reproduces on a fully self-consistent (`totalSlack = 0`) synthetic oracle at
   n=44–87, not only on the adversarial inputs the 2026-08-12 stress test characterized as the
   danger zone. A real user's own multi-sitting session could plausibly reach this range.
2. **New, standalone item**: monotonicity dips in score-spread accuracy immediately preceding
   a solver crash (observed 3× for oracle #1, 5–3 rounds before its crash) — worth checking
   whether this generalizes as an early-warning signal, unexplored here.
3. **New, standalone item**: front-loaded value shapes converge markedly slower than
   back-loaded shapes under the current degree-2 candidate-weighting design (oracle #5 vs. #6,
   same weight vector, same seed) — worth a closer look if degree-2 candidate weighting is
   revisited.

## Reproducing

`ORACLE_DEBUG=1 ORACLE_ONLY=<id> ORACLE_MAX_ROUNDS=<n> npx tsx scripts/synthetic-calibration-oracles-2026-08-16.ts`
— env vars are optional (filters to one oracle, overrides the round cap, and prints per-round
timing respectively). Full run: `npx tsx scripts/synthetic-calibration-oracles-2026-08-16.ts`,
~4.5 minutes wall time on the dev machine used here. Regenerates the CSV in place; findings
above are frozen from the 2026-08-16 run and won't auto-update if re-run.
