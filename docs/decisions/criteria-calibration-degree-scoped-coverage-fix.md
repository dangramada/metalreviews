# Criteria Calibration: degree-scoped coverage-completeness fix

**IMPLEMENTED 2026-08-11.** Fixes the degree-escalation anomaly Dan hit at round 33 of his
live ranking-stability test session (see the prior diagnostic session in this project's
history — not a separate doc, folded in here since the fix followed directly from it).

## Root cause

`isDegreeCoverageComplete` (`elicitationDriver.ts`) decided whether a degree had "nothing
left worth asking" by checking every `(criterion, level)` value in the whole model, using
`touchCounts` computed from the ENTIRE answer log regardless of degree. Once the whole model
converged (all 30 values narrowly pinned — which happened on Dan's 32nd answer, all of them
degree-2), the check returned `true` for literally every degree from 2 through 6
simultaneously. "Add more detail" then just incremented `degree` by one per click without
ever asking a real degree-3+ question, landing on identical "resolved everything" screens
(the UI's copy is driven only by `action.canEscalate`, and `degree` is never shown anywhere)
until degree 6, where `canEscalate` finally went false and "No more comparisons left"
appeared. Undo doesn't touch `degree` (by design, unrelated to this bug), so a subsequent
Undo could leave `degree` stuck at 6 against a since-de-converged (post-undo) model, firing a
genuine but jarring all-6-criteria-vary question.

Confirmed via a live, read-only diagnostic replay of Dan's real answer log through the actual
`nextAction`/`CalibrationSession` code (no Supabase writes) — not theorized.

## Design tension considered before implementing

The value model is purely additive: 30 free `(criterion, level)` values, no other free
parameters at any degree. This means the original whole-model design was arguably
*mathematically* correct — once all 30 values are pinned, no degree can reveal anything new
about the model's values, full stop. Two fix directions were weighed and put to Dan directly
(not decided unilaterally, since it reverses a previously deliberate design choice
documented in the function's own prior comment):

- **A — scope `touchCounts` to degree-N-only answers** (chosen): a never-before-visited
  degree always asks at least one real question there before being declared exhausted.
  Tradeoff: once the model has already converged from lower-degree evidence, some of those
  questions are informationally redundant — asked anyway, for escalation-ladder consistency.
- **B — leave the engine as-is, fix the UI only** (declined): defensible math, but leaves the
  "Add more detail" ladder capable of silently doing nothing forever once the model
  converges early.

Dan confirmed **A**.

## What changed

`elicitationDriver.ts`:
- New `computeTouchCountsForDegree(session, levelsPerCriterion, degree)` — same shape as the
  existing `computeTouchCounts`, but counts only `session.fullLog` entries where
  `entry.degree === degree`.
- `nextAction`'s call to `isDegreeCoverageComplete` now passes this degree-scoped touch-count
  table instead of the global one. The global `touchCounts` (unscoped) is unchanged and still
  used for `buildRefinementCandidatePool`'s weighted candidate sampling — that concern
  (which levels to prioritize asking about) is independent of the coverage gate and wasn't
  touched.
- `.min`/`.max` range narrowness (`values`, from `solveValues`) stays computed globally,
  unchanged — cross-degree range-narrowing evidence is genuinely informative and was never
  part of the bug.

No changes to `solver.ts`, `simplex.ts`, `scoreSpreadAccuracy.ts`, `accuracyTiers.ts`, or any
threshold constant.

## Regression test

`elicitationDriver.test.ts`'s new `'scopes coverage-complete to the degree being checked...'`
test uses a new frozen fixture, `DEGREE_ANOMALY_SESSION_ANSWERS` (`fixtures.ts`) — Dan's real,
live 31-answer session pulled read-only from Supabase once and hardcoded (same convention as
`REAL_PRODUCTION_SESSION_ANSWERS`), plus one supplemental answer (the driver's own real next
degree-2 question at that state, not fabricated) to reach the 32-answer moment that triggered
the bug. Confirms: degree 2 still correctly reports `coverage-complete` (unchanged — all 32
answers are degree-2, so degree-scoped and global touch counts coincide); degrees 3-6 (never
visited) now correctly return a real `ask` instead of a false `coverage-complete`.

## Verification

- `tsc --noEmit`: clean.
- Full suite: 234/234 passing (233 pre-existing + 1 new).
- Oracle trace (`elicitationDriver.test.ts`'s existing n=63 coverage-complete test):
  **unchanged, still exactly n=63** — confirmed by direct instrumentation, not just the
  test's `[58,68]` tolerance window. The oracle trace never leaves degree 2 before
  converging, so degree-scoped and global touch counts are identical throughout — the fix
  has zero effect on this trace, as expected.
- Dan's live Supabase session confirmed untouched throughout (31 answers, both before and
  after this pass) — read-only access only.

## Not done this pass (flagged, not fixed)

**UX gap, explicitly deferred to Dan's own call:** `degree` is never displayed anywhere in
the UI (`ProgressHeader`/`RoundGaugeGroup` only show round/progress/accuracy). This is why
the original anomaly's repeated "resolved everything" screens were indistinguishable to Dan
even before this bug — some visible degree indicator would make it obvious when escalation
is genuinely progressing. Not implemented here per explicit instruction to flag only.

**Not touched:** `handleUndo`/`handleRedo`'s degree-handling behavior in
`CriteriaCalibrationPage.tsx` — the fix above should make the post-undo stale-degree scenario
harmless (a stale high `degree` against a now-non-coverage-complete model just asks a real,
correctly-scoped question instead of nothing), but this wasn't separately re-verified against
a live undo interaction in this pass; flagged per the brief's own instruction not to expand
scope here without a separate confirmation if it turns out insufficient.
