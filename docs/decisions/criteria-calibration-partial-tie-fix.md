# Criteria Calibration: partial-tie collision fix (degree-3+ candidate generation)

**IMPLEMENTED 2026-08-11.** Fixes the defect quantified in the prior diagnostic session:
degree-3+ comparisons with a tied criterion on both sides were being generated, selected, and
counted as full-degree progress despite contributing zero LP information for that criterion.

## Root cause (confirmed, not assumed)

`generateCandidatesForSubset` (`elicitationDriver.ts`) draws each varying criterion's level
independently per side. Only three rejections existed: full tie (`keyA === keyB`), dominance,
and exact-duplicate dedup — none rejected a *partial* tie (one criterion matching while others
differ). Mathematically confirmed via `solver.ts:162-181`: a tied criterion's coefficient
cancels to exactly zero in the LP's `diff = coeffsA - coeffsB` row, so the comparison is
informationally identical to a lower-degree one over just the differing criteria, while still
being logged and touch-counted as the full subset's degree.

Diagnosis further found the *dominant* mechanism wasn't generation-time weighting (a modest
+5pp effect: 29.2% → 34.2% unweighted vs. weighted pool collision rate) but
`rankCandidatesByAmbiguity`'s "closest estimate gap" selection — a tied criterion removes a
term from the score-gap sum, mechanically shrinking it and making tied candidates look more
"ambiguous" than they are. Selected-question collision rate measured at ~55-61% against both
real (13-answer) and synthetic (2400-candidate) data, vs. ~34-38% at the pool level.

## What changed

`elicitationDriver.ts`:
- New `hasAnyTiedCriterion(profileA, profileB, subset)` — true if any criterion in the subset
  matches on both sides. Wired into `generateCandidatesForSubset`'s rejection loop as a
  fourth check, same treatment tier as the existing full-tie/dominance/dedup checks, not a
  separate filter mechanism.
- Retry budget raised from `CANDIDATES_PER_SUBSET * 20` (120 attempts) to `* 60` (360
  attempts) — `MAX_GENERATION_ATTEMPTS_PER_SUBSET`. Chosen empirically: confirmed 0/20
  degree-3 subsets under-filled against Dan's real round-45 touch-count state, and 0/20
  degree-3 subset-calls under-filled across a 20-round synthetic run (2400 candidates total),
  both with zero collisions surviving. A more extreme adversarial state (every criterion
  restricted to the exact same 2-of-5 levels simultaneously — not representative of how real,
  independently-evolving touch counts behave) can still under-fill even at this cap; not
  chased further since it doesn't arise from real per-criterion-independent touch
  accumulation.

`questionOrdering.ts`: **unchanged.** Investigated whether `rankCandidatesByAmbiguity` needs
an independent defensive check against partial ties, since it's the dominant mechanism per
diagnosis. Confirmed via full-repo grep: `rankCandidatesByAmbiguity` has exactly one
production caller (`nextAction`), and its `pool` argument comes exclusively from
`buildRefinementCandidatePool` → `generateCandidatesForSubset`. No other path exists (no
separate candidate source, no undo/redo-driven residual pool state — pools are always freshly
regenerated per `nextAction` call). The generation-time fix therefore provably eliminates the
input case for the only real call site; a redundant filter in `questionOrdering.ts` was
explicitly not added, per the brief's own instruction not to add one without a reachable path
requiring it.

Side note confirmed mathematically, not just for degree 3: for degree-2 subsets specifically,
`isDominatedPair` already rejected every partial-tie case before this fix (with only 2
criteria, one tying while the other differs is always a dominated pair by construction) — so
`hasAnyTiedCriterion` only changes observable behavior starting at degree 3+, exactly matching
how the diagnosis was scoped, even though the code fix lives in the degree-agnostic shared
function.

## The `computeTouchCountsForDegree` tied-appearance-crediting side issue

Investigated per the brief's instruction. Historically-recorded degree-3 answers with a tied
criterion (from before this fix) still get counted as "touched" by `computeTouchCountsForDegree`
even though they constrained nothing that specific time — this is real, but **explicitly not
touched**, per the brief's own constraint not to retroactively alter already-recorded answers
or their touch-count credit. Going forward, this concern is now structurally moot: since
generation can no longer produce a partial-tie candidate, no future degree-3+ answer can ever
have a tied criterion, so there's nothing left for `computeTouchCountsForDegree` to
over-credit going forward. No separate follow-up brief needed — the generation fix subsumes
this concern for all future data; only the small number of historical entries carry the
(unfixable-without-violating-the-brief's-own-constraint) residual over-credit.

## Regression tests (`elicitationDriver.test.ts`)

- `'generateCandidatesForSubset — partial-tie rejection'` describe block: (a) no candidate
  across degrees 2-6 and three representative touch-count states (none/uniform/skewed) ever
  has a partial tie; (b) still fills to 6 candidates per subset at degree 3 under a
  representative skewed state.
- `'degree-3 partial-tie collision fix — regression against real session data'`: extends the
  frozen `DEGREE_ANOMALY_SESSION_ANSWERS` fixture (Dan's real 31-answer session) with
  simulated degree-3 rounds and confirms 0 collisions among selected questions, down from the
  pre-fix ~55-61% observed rate.

## Verification

- `tsc --noEmit`: clean.
- Full suite: 237/237 passing (234 pre-existing + 3 new).
- Oracle n=63 checkpoint (`elicitationDriver.test.ts`'s existing coverage-complete test):
  **unchanged, exactly n=63** — confirmed by direct instrumentation. The oracle trace never
  leaves degree 2 before converging, so this fix (degree-3+ only) has zero effect on it, as
  expected.
- Dan's live Supabase session confirmed untouched throughout (45 answers, before and after
  this pass) — read-only access only.

## Not done this pass (out of scope per the brief)

Deferred item #3 from `deferred-work.md`/`criteria-calibration-adaptive-degree-escalation.md`
(unifying escalation timing with question selection into one coverage/uncertainty-driven
mechanism) was explicitly not touched — this fix addresses a specific measured defect, not
that larger design question.
