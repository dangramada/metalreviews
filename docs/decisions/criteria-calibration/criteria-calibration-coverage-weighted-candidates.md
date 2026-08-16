# Criteria Calibration: coverage-weighted degree-2+ candidate generation

Branch: `criteria-calibration-coverage-weighted-candidates`, off `master`.

## 2026-08-09 — What shipped

`generateCandidatesForSubset` (`elicitationDriver.ts`) previously drew each criterion's
level uniformly at random (1..max) for both sides of a candidate pair. Diagnosed
(prior session, same day) as a contributing factor to the degree-2 refinement stall: with
6 criteria at 5 levels each, ~51/74 degree-2 pool candidates landed on level combinations
the solver already treats as near-flat, making `nextAction()`'s ambiguity ranking see a
near-zero gap almost everywhere and never report `degree-exhausted` to trigger degree-3
escalation.

Fix implemented: a new `computeTouchCounts(session, levelsPerCriterion)` derives, fresh
from `session.fullLog` on every call (no new persisted state — same pattern as
`isPairCovered`/`hasBeenAsked`), how many times each `(criterion, level)` combination has
appeared in any logged answer so far. `generateCandidatesForSubset` gained an optional
third parameter, `touchCounts?: number[][]`; when supplied, the per-criterion level draw
is weighted `1 / (1 + touchCount)` instead of uniform, biasing toward under-covered
levels. Omitting the parameter preserves the original uniform behavior exactly (existing
dominance-filter tests pass unchanged). `buildRefinementCandidatePool` computes
`touchCounts` once per `nextAction` call and threads it through.

## This does NOT fix the degree-2 flatness / degree-3-escalation stall

Confirmed by a read-only trace against Dan's real 33-answer production session
(`REAL_PRODUCTION_SESSION_ANSWERS` in `fixtures.ts`, same fixture as the prior diagnostic
session) run against the new weighted sampling:

```
Touch counts [criterion][level 1..5]:
  criterion 0: [5, 6, 1, 5, 7]     criterion 3: [5, 4, 4, 3, 8]
  criterion 1: [5, 4, 5, 3, 7]     criterion 4: [5, 3, 5, 1, 6]
  criterion 2: [5, 3, 2, 4, 6]     criterion 5: [5, 1, 1, 3, 10]

nextAction() at degree 2: ask (ambiguity-refinement)
  profileA: {0: 3, 2: 5}   profileB: {0: 4, 2: 4}
  gap: 2.78e-16   <- still effectively zero
```

Digging into why: the solver's own `.point` values are already flat for levels 2-5
regardless of which specific combination gets compared —

```
criterion 0: [0, 0.4995, 0.4996, 0.4996, 0.4996]   <- big jump 1->2, then flat 2-5
criterion 1: [0, 0.4991, 0.4992, 0.4995, 0.4995]   <- same shape
criterion 2: [0, 0.0002, 0.0003, 0.0004, 0.0004]   <- near-zero everywhere
criterion 3: [0, 0.0000, 0.0002, 0.0003, 0.0003]
criterion 4: [0, 0.0000, 0.0002, 0.0002, 0.0002]
criterion 5: [0, 0.0000, 0.0000, 0.0000, 0.0000]   <- solver assigns this criterion NO weight
```

The flatness is not a sampling artifact — it's baked into the solved point estimates
themselves. Levels 2-5 score almost identically to each other no matter which
combination happens to get asked about, because the solver hasn't differentiated them.
Coverage-weighting pushes the draw *away* from level 1 and each criterion's max (already
well-touched by cold start) and *toward* levels 2-5 — which is exactly the region the
solver already treats as flat, so the weighted pool ends up sampling *more* into the
flat region, not less. No candidate-generation change can create signal the solver
hasn't produced yet; the gap is a property of the solved values, not of which pair
happens to get compared.

**New finding, beyond the original flatness diagnosis:** criterion 5 received a solved
weight of essentially zero across all 5 levels on this real session — the solver isn't
just flat across levels 2-5 for this criterion, it's flat at zero everywhere including
level 1. Flagged as possibly relevant to an upcoming solver-design decision (not
investigated further here — out of scope for this branch, which touches
`elicitationDriver.ts` only).

## What stays untouched (per this branch's scope)

- `questionOrdering.ts` / `rankCandidatesByAmbiguity` — ranking logic unchanged.
- `coldStartProfilesForPair` and the degree-2 coverage floor.
- `accuracyTiers.ts`, `MEDIUM_ACCURACY_THRESHOLD`, the gate mechanism.
- Dominance/tied-pair filtering (`isDominatedPair`).
- `MAX_AMBIGUOUS_GAP` (0.05) — not recalibrated; flagged, not changed.
- `solver.ts` (`solveValues`, `computeChebyshevCenter` or equivalent point-estimate
  assignment) — this is where the actual fix for the flatness problem would need to
  live, per this session's trace. Explicitly not started here; a separate, upcoming
  design decision.

## Verification

`tsc --noEmit` clean, `eslint` clean, full suite 226/226 (`vitest run`). Two new tests in
`elicitationDriver.test.ts` cover weighted-vs-uniform sampling behavior directly.
