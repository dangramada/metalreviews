# Criteria Calibration — part 5a: wire UI to real engine (in-memory, Medium-only)

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
