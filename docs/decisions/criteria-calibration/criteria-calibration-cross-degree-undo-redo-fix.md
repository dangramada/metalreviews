# Criteria Calibration — cross-degree Undo/Redo stale-`degree` fix

Root cause diagnosed 2026-08-15 (`criteria-calibration-second-session-reset.md`'s session,
not written up there — this doc is the write-up). Fixed 2026-08-16.

## Bug

`degree` in `CriteriaCalibrationPage.tsx` was a plain `useState`, mutated in exactly two
places — the resume effect and `handleEscalate` — both forward-only. `handleUndo` popped
`answers`/`windowHistory` but never touched `degree`. So once every degree-4 answer was
undone, `nextAction(session, degree=4)` kept running with `degree` pinned at 4, returning a
fresh-but-wrong degree-4 question instead of reverting to degree 3. A page refresh masked
this — `useCalibrationResume` re-derives `degree` from the truncated log on mount — which is
why it went unnoticed until it was hit mid-session without a refresh.

## Fix

Added `inferDegreeFromAnswers(answers, startingDegree)` to `preferenceGraph.ts`, next to
`profileDegree` (which it wraps): the same `Math.max` reduction `useCalibrationResume.ts`
already used inline to derive degree from a resumed answer log on mount. `handleUndo` and
`handleRedo` both now call it against their post-mutation `nextAnswers` array and `setDegree`
the result — reusing the existing formula, not inventing new inference logic.

`useCalibrationResume.ts` itself was deliberately left untouched — its own inline `reduce` is
byte-for-byte the same formula today, so there's no live bug, but nothing guards against the
two diverging if either is edited later. Logged as a drift-risk follow-up in
`deferred-work.md` (section B) rather than done here, since the brief scoped this pass to the
Undo/Redo bug only.

## Redo finding

Checked explicitly, not assumed: before this fix, `handleRedo` never touched `degree` either.
It didn't visibly break because `handleRedo` reconstructs its entry from the redo buffer's
stored `profileA`/`profileB` directly, not via `action`/`nextAction`, so the insert itself
always succeeded regardless of `degree`. But once `handleUndo` alone is fixed to correctly
drop `degree` back to 3 when crossing the boundary, a subsequent Redo across that same
boundary needs to bring `degree` back up to 4 — and nothing did, since `handleRedo` had the
identical missing reconciliation, just masked by `handleUndo`'s bug pinning `degree` high
the whole time. `handleRedo` got the same one-line fix.

## Call-site audit

`degree` (the React state, not the `degree` field on unrelated fixture/notation types) is
read in exactly four places, all inside `CriteriaCalibrationPage.tsx`:

1. `action = useMemo(() => nextAction(session, catalog.levelsPerCriterion, degree), [...])` —
   recomputes automatically once `degree` is correct.
2. `isFirstAnswerAtDegree` — derived in the render body from `answers` + `degree` directly,
   not a separately-memoized stale value.
3. `degreeClarificationText` — same, render-body derivation from `degree`.
4. The resume-seed effect and `handleEscalate` — the pre-existing forward-only setters,
   unchanged.

Confirmed via `grep -rl degree src` that no other file reads this state: `ProgressHeader` /
`RoundGaugeGroup` / `RoundCounter` only receive `round` (`answers.length + 1`), never
`degree`; `commitComputation.ts` and `rankingStabilitySignal.ts` (the stability-window
machinery) take no `degree` parameter at all. The fix is fully contained to `handleUndo` /
`handleRedo` in `CriteriaCalibrationPage.tsx` plus the new helper.

## Verification

- Manual repro via a new component test (below) — reproduces the exact bug shape without a
  refresh, in both directions.
- `preferenceGraph.test.ts`: 4 new direct unit tests for `inferDegreeFromAnswers` (empty log,
  all-below-starting, highest-seen, and the Undo-simulation drop-back-down case).
- New `src/__tests__/CriteriaCalibrationPage.test.tsx`: seeds a resumed session at degree 4
  via `buildHistoricalFixture()` (the same real 6-criteria/5-level degree-ramp fixture
  `preferenceGraph.test.ts` already uses — 20 rounds at degree 2, 7 at degree 3, 2 at degree
  4), sliced to the first 29 rounds so the session lands exactly on the 3/4 boundary. Mocks
  every page-level hook (`useCriteriaCatalog`, `useCalibrationResume`, `useAuth`,
  `useRankingTestSetRatings`, `usePendingWritesGuard`, `useFeedbackToast`,
  `useReducedMotion`) and the `persistence` module, then drives real Undo/Redo clicks and
  asserts the rendered comparison's criteria count (a direct proxy for its degree) updates
  correctly crossing the boundary in both directions, with no remount.
- Full suite: 302/302 passing (`npx vitest run`). `tsc --noEmit` clean. `eslint` clean after
  a Prettier auto-format pass on the new test file.

## What was NOT touched

- `useCalibrationResume.ts`'s own mount-time inference (reused, not rewritten).
- The `answer_count`-gated write-race guard (`upsert_calibration_status`).
- No UI/UX changes — same rendering, same copy, only the `degree` value feeding it is now
  correct across a boundary crossing without a refresh.
