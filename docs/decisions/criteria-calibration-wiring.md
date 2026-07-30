# Criteria Calibration — parts 5a/5b: wire UI to real engine, then persist it

## Part 5a: wire UI to real engine (in-memory, Medium-only)

Branch: `criteria-calibration-wiring` (branched from `master` after both
`criteria-calibration-ui` and `criteria-calibration-engine` merged). Scope: replace the
mock question pool and placeholder progress curves in `CriteriaCalibrationPage.tsx` with a
real, in-memory `CalibrationSession` driven by `elicitationDriver.ts`'s `nextAction`. No
Supabase writes — that's part 5b. No rating drawer/gate/`album_criteria_ratings` — that's
part 6, and depends on 5b, not this pass.

## New files

- `src/hooks/useCriteriaCatalog.ts` — fetches `criteria`/`criteria_levels` (public read, no
  RLS restriction, no per-user state) via a plain `useEffect`/`useState` hook, mirroring
  `useFavoritesList.ts`'s convention exactly (one embedded select, no cache layer beyond the
  component's lifetime).
- `src/lib/criteria-calibration/criteriaCatalog.ts` — adapter between the fetched rows and
  the engine's `Profile` type: `buildCriteriaCatalog` (rows → dense array indexed by
  `criteria.id`, i.e. the same 0-5 `criterionIndex` the engine uses) and
  `profileToCriterionData` (a `Profile` → the `CriterionData[]` `OptionCard`/`ComparisonRow`
  already expect, sorted by criterion index so both sides of a comparison line up). New
  file — doesn't modify any of the seven locked engine modules, only imports `Profile` from
  `preferenceGraph.ts`.
- `src/lib/criteria-calibration/sessionProgress.ts` — `degree2CoveragePercent`, a 0-100
  coverage number derived purely from the same public `PreferenceGraph.isImplied` API
  `isMediumTierReached` itself uses. Kept separate from `accuracyTiers.ts` since it's a
  continuous progress number, not a tier decision; `isMediumTierReached` remains the sole
  source of truth for the actual Medium/not boolean.
- `src/__tests__/sessionProgress.test.ts` — cross-checks `degree2CoveragePercent` reaching
  100% against `isMediumTierReached` independently returning `true` on the *same* session
  state, at the moment coverage claims 100% (requested explicitly — mirrors the same
  cross-check pattern already in `elicitationDriver.test.ts` between the driver's own
  coverage tracking and `isMediumTierReached`; don't assume agreement just because both
  consume `buildCanonicalDegree2Pairs`, verify it directly). They agreed on the first run,
  no divergence found.

## `CriteriaCalibrationPage.tsx` rewrite

Single source of truth is now `answers: {profileA, profileB, result}[]` in React state, plus
a `redoBuffer` and `degree` (starts at 2, the Medium-tier prerequisite). The
`CalibrationSession` itself is *derived*, not stored — rebuilt fresh via `useMemo` by
replaying every entry in `answers` in order:

```ts
const session = useMemo(() => {
  const s = new CalibrationSession();
  for (const a of answers) s.recordAnswer(a.profileA, a.profileB, a.result);
  return s;
}, [answers]);
```

This is the brief's recommended undo approach (the engine isn't designed for in-place
removal), applied uniformly to *every* `answers` change, not just undo — one code path
instead of a special-cased replay-only-on-undo branch. Cheap at the session sizes this
feature operates at (single-digit-to-low-tens of answers).

- **Undo**: pops the last entry off `answers` onto `redoBuffer`.
- **Redo**: pops the last entry off `redoBuffer` back onto `answers`.
- A new real answer clears `redoBuffer` (standard semantics).
- `degree` is untouched by undo/redo — escalating to the next degree is a separate,
  explicit user action not tied 1:1 to any single answer, so reversing one answer shouldn't
  silently drop the user back a degree tier. Judgment call, not specified in the brief.

`action = nextAction(session, catalog.levelsPerCriterion, degree)` is computed directly in
the render body (not stored in state) — it's a pure, synchronous function of `session` and
`degree`, so there's no risk of it going stale the way a `useState`-cached copy could.

- `action.type === 'ask'` → `profileToCriterionData` feeds the existing `ComparisonRow`/
  `OptionCard` unchanged; the selection→hold→fade timeout machinery from the mock pass is
  untouched, just calling into `commitAdvance(result)` instead of advancing a fake snapshot.
- `action.type === 'degree-exhausted'` → inline replacement block (no new component file)
  with an explicit "Add more detail" button, shown only when `canEscalate`. Escalation is
  never automatic, per the driver's own contract.

## Progress display — binary, Medium-only

Kept both `ProgressHeader` sub-widgets rather than rebuilding the shell, but feed them one
real number instead of retiring either:

- `progressPercent` (the `ProgressCircle`) = `degree2CoveragePercent` — genuine coverage
  toward Medium, not a fake per-round curve.
- `AccuracyStatus`'s `level` prop is fed only `'Low'` or `'Medium'` (from
  `isMediumTierReached`) — `'High'` is simply never passed, so no High/Very-High code path
  needs touching and nothing High/Very-High-shaped can render. `percent` mirrors the same
  coverage number and snaps to 100 at Medium.
- `RoundCounter` shows `answers.length + 1`.

`accuracyTiers.ts`'s High/Very-High logic (`computeSolverAccuracy`, `solverAccuracyTier`) is
untouched and unused by the UI — deliberately blocked pending the separate, already-flagged
solver-metric issue (`criteria-calibration-engine.md`, "Part 4 finding").

## Stop here

Wired to real state (round/degree are real), but still writes nothing — sets a local
`stopped` flag that disables further interaction and swaps the question area for an explicit
"paused — refresh to restart" message, making the pass's limitation (no persistence yet)
visible in the UI rather than silent.

## Manual verification

Ran live against the dev server + real Supabase `criteria`/`criteria_levels` data: cold-start
questions rendered with real criterion/level text (not mock strings), answering advanced
round/coverage-% correctly, Undo reverted to the exact prior pair and coverage number, Redo
restored it, Stop here paused interaction and showed the real round/coverage state at the
moment of stopping.

## Definition of done — status

All eight DoD items from the brief met: real session end-to-end, no mock data, criterion
text from `criteria`/`criteria_levels` only (no per-user table touched), Medium detection is
real, escalation always explicit, Stop here works at any point, Undo verified correct,
refresh-loses-progress is explicit and acceptable, single commit.

## Part 5b: Supabase persistence (save + resume)

Removes 5a's accepted scope boundary ("a page refresh loses all progress"). Every real
answer is now saved to `user_calibration_answers` as it happens, and reopening the page
resumes an in-progress session exactly.

### New files

- `src/lib/criteria-calibration/persistence.ts` — `fetchPersistedAnswers`, `insertAnswer`,
  `deleteAnswer`, and `upsertWeightsAndStatus` (re-runs `solveValues` against the given
  answer log and upserts both `user_criterion_weights` and `user_calibration_status`, using
  the **combined** tier rule `user_calibration_status.sql` itself documents as a gap:
  `'high'`/`'very_high'` require `isMediumTierReached()` to also be true, not
  `solverAccuracyTier()` alone — otherwise a user could reach a high solver-accuracy value
  via degree-3+ answers while having skipped a degree-2 pair entirely). Reuses
  `buildCanonicalDegree2Pairs` from `elicitationDriver.ts` for the Medium check rather than
  re-deriving canonical pairs a third time.
- `src/hooks/useCalibrationResume.ts` — fetch-on-mount hook mirroring
  `useFavoritesList.ts`'s convention. Infers the starting `degree` as the max number of
  criteria present across all persisted profiles (defaulting to `STARTING_DEGREE` when
  empty), rather than storing degree as its own column.

### Race safety: undo vs. an in-flight insert

Each `AnswerEntry` gets a client-generated `localId` (`crypto.randomUUID()`) at creation
time, before any DB round-trip — not an array index, not the eventual DB row id. When an
`insertAnswer` call resolves, the callback checks a ref mirroring the current `answers`
state (`answersRef`, kept in sync via a `useEffect` on every `answers` change — safe because
any undo that happens will have already gone through its render+effect cycle, which is far
faster than a network round trip) for that `localId`. If it's gone — the user undid it while
the insert was still in flight — the just-inserted row is deleted immediately instead of
being attached to a resurrected local entry. This guarantees the DB can never end up holding
a row for an answer the user already retracted, regardless of network timing.

Undo deletes the persisted row directly (by the entry's `dbId`, if the insert had already
resolved); redo always creates a **brand-new** `AnswerEntry` (fresh `localId`, no `dbId`) and
re-inserts it as a new row — redo is a re-answering, not a resurrection, consistent with the
table's insert-only convention. This was flagged as an open judgment call (the brief was
silent on whether undo needed to touch the DB at all) and resolved with the user before
implementation: without deleting on undo, an undone answer would silently reappear after a
refresh, which would contradict "resumes exactly where left off."

### Weights/status recompute: cheap staleness guard

A `weightsGenRef` counter is bumped on every `recomputeWeightsAndStatus` call; a call's
`.then()`/`.catch()` only fires its success/failure notification if its generation is still
current when it resolves. This doesn't prevent an older, slower call's write from landing
after a newer one (both requests are already in flight by the time either resolves) — that
residual staleness is self-correcting on the next answer, per the brief, and wasn't solved
here. The guard's actual value is avoiding a stale call's resolution incorrectly clearing or
setting the shared failure indicator.

### Failure handling

Every persistence call (insert, delete, weights/status upsert) shares one failure indicator
(`persistFailingRef`) that surfaces via the existing `useFeedbackToast` convention only on
the *transition* into a failing streak — not per-call — so a run of failures during an
outage doesn't spam toasts, and clears silently on the next success. No persistence failure
ever blocks or rolls back the in-memory `answers`/`degree` state.

### Auth gating

`/criteria-calibration` is now wrapped in the existing `RequireAuth` component in
`main.tsx` (same shape as `/favorites`) — a necessary, minimal change outside the
`criteria-calibration/` folder, since the per-user tables are RLS-scoped to `auth.uid()` and
persistence cannot function for an anonymous visitor. Flagged and confirmed with the user
before implementation. The route itself is unchanged otherwise — still no nav entry point.

### What deliberately didn't change

No "stopped" flag is persisted — resuming just picks up wherever the real answer log left
off, offering the same choices as before. The redo buffer does not survive a refresh
(confirmed live: after undo + refresh, Redo was correctly disabled). No change to the
Medium-only display decision — `'high'`/`'very_high'` are computed and stored but never
rendered. No engine or schema file touched.

### Manual verification

Live against the dev server + real Supabase data, logged in as a real user: answered two
questions, confirmed (via `performance.getEntriesByType('resource')`, since the browser
tool's own network-request listing doesn't capture these cross-origin fetches) that the
insert and the weights/status upserts fired; refreshed and confirmed the exact same round,
coverage %, and pending question resumed. Undid the second answer, confirmed a `DELETE
.../user_calibration_answers?id=eq....` request fired for that exact row; refreshed again
and confirmed Round 1 / 0% / Undo disabled — the undone answer did not reappear.

### Definition of done — status

All seven DoD items met: every real answer saved, resume replays exactly via the same
mechanism as undo, weights/status stay current via the combined tier rule, a failed write
never breaks the in-memory flow or silently drops an answer, manually verified live
(including the undo-persistence race fix), no other UI/engine/schema files touched, single
commit (`7101105`, feature only — this doc update is the separate docs commit, matching 5a's
pattern).
