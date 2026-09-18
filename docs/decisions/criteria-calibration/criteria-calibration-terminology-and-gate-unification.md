# Terminology unification + Favorites gate redesign

Branch: `criteria-calibration-terminology-gate-unification`, merged to `master` `--no-ff` at
`d082115` on 2026-09-18. Rollback tag: `pre-merge-criteria-calibration-terminology-gate-unification`.

## What this is

Two changes, bundled because the gate dialogs' copy depends on the terminology fix landing
first:

1. Unifies the tier terminology and fixes known copy-rule violations across Criteria
   Calibration, Album Rating, and Favorites.
2. Replaces the single Favorites "Calibrate your criteria first?" nudge dialog with a proper
   hard/soft gate pair, plus a persistent calibration action on the Album Rating page and a
   dismissible calibration resume banner.

Source brief: relayed inline in the session that authored this doc (not a separate Project
Knowledge file for this one — the brief's full text is reproduced in the git history of this
file's authoring commit if it's ever needed verbatim).

## Terminology changes

- Verb for the percentage: **"settled"** everywhere, replacing "clear" (checkpoint bodies) and
  "pinned down" (the badge's aria-label).
- Feature name: **"Score level: {label}"** everywhere it said "Score confidence" — Album Rating
  (`RatingProgressBox`) and Favorites both, no inconsistency between them.
- Tier names (Unfocused/Blurry/Clear/Sharp, `accuracyTierLabels.ts`) are unchanged — already
  correct, already unified. Not touched by this pass.

### Files changed (copy only, no logic)

- `src/lib/criteria-calibration/accuracyTierLabels.ts` — `TIER_BADGE_TOOLTIP` reworded, **and**
  its own explanatory comment fixed to match: the old comment claimed "the number moves
  continuously inside one [level]," which round 28 of the recalibration report's trace
  contradicts (78% sitting next to Unfocused, the base rung, not a fresh-within-level number).
  Flagged in review as a stale-comment case, not just a stale string: the comment was asserting
  something the tooltip text next to it no longer says.
- `src/components/criteria-calibration/TierAccuracyBadge.tsx` — aria-label →
  `"{label} tier. {percent} percent of your weighting settled."`
- `src/lib/criteria-calibration/checkpointCopy.ts` — the four checkpoint bodies (promotion,
  ceiling, terminal, frozen) plus the file's own rule-3 comment example.
- `src/components/criteria-calibration/ResultsTab.tsx` — caption reworded, also dropping an
  em-dash (house-style violation, `docs/commenting-style-guide.md`'s "no em dashes" rule
  extends to user-facing copy per `checkpointCopy.ts`'s own rule 1).
- `src/components/album-rating/RatingProgressBox.tsx` — `Score confidence:` → `Score level:`.
- `src/FavoritesPage.tsx` — same rename, desktop Tooltip content and mobile aria-label/title.
  The `!` low-confidence warning badge itself (still keyed on `tier === 'none'`) is
  **untouched** — its fate is a separate, already-flagged follow-up (see "Explicitly not in
  scope" below).

## Gate redesign

`useCalibrationGate` already exposed both `hasWeights` and `tier`, so no hook change was
needed — only `FavoritesPage.tsx`'s `handleRate` gained a second branch.

**Hard gate** — `hasWeights === false`. Blocking: Cancel / Go to calibration only, no bypass.
**Soft gate** — `hasWeights === true && tier === 'none'`. Non-blocking: Cancel / Evaluate Album
/ Go to calibration (primary). This is a **behavior change** from the pre-existing code, which
navigated straight to `/rate/:albumId` for any `hasWeights === true` user regardless of tier —
a `tier === 'none'` user with weights previously got no nudge at all.

Both dialogs are one component, `CalibrationGateDialog` (`mode: 'hard' | 'soft'`), not two
separate dialogs — same pattern as `RatingSlab`'s `variant` prop, per review feedback. New file:
`src/components/criteria-calibration/CalibrationGateDialog.tsx`. Deliberately placed under
`components/criteria-calibration/`, not local to `FavoritesPage.tsx`, since the brief calls out
reuse at the future AOTY page entry point.

## Persistent "Go to calibration" action

`RatingProgressBox.tsx`'s final-state (`!isPending`) branch gets a `react-router-dom` `Link` to
`/calibration`, next to (not replacing) the "Score level" text, always rendered regardless of
tier. Implemented as a plain `Link as={RouterLink}` in the leaf component itself — no prop
threading through `DesktopRatingLayout`/`MobileRatingLayout`, matching the `Link`/`RouterLink`
convention already used in `LoginPage.tsx`/`Footer.tsx`. No `?from=` param: preserving which
album sent the user here (return-to-album continuity) is explicitly out of scope this round, so
finishing or leaving calibration from here falls back to `/favorites`, same as the existing
default.

## Calibration resume banner

`CriteriaCalibrationPage.tsx` renders a dismissible `Alert` ("Pick up where you left off") when
`tier === 'none'`, as a sibling of the tab panel `Box` — **not** inside the panel's own
`gap={0}` `VStack`, which the file's own comment documents as load-bearing for the header/panel
border join ("Any gap, or any element rendered between the two, breaks that join"). Placing the
banner before that `VStack` (as an earlier sibling passed through `PageChrome`'s `children`)
keeps it outside that join entirely while still showing above the tab bar regardless of which
tab is active.

Dismiss state is local `useState`, deliberately unpersisted — same convention as `stopped`/
`acknowledgedBoundaryDegree` elsewhere in this file — so it reappears on the next page visit if
`tier === 'none'` still holds. Same copy on every entry, not customized by source.

## Explicitly not in scope this round

- **Return-to-album continuity.** Real gap (arrives at Calibration with no way back to the
  triggering album), not solved here. Needs its own decision pass on the exact mechanism.
- **`/rate/:albumId` route/file/DB naming** (`AlbumRatingPage.tsx`, `components/album-rating/`,
  `useAlbumRatingsSummary.ts`, `user_album_criterion_ratings`, `user_criterion_weights`) — the
  UI already says "Evaluate" while all of this still says "rate/rating." Confirmed, deferred,
  needs its own discovery pass given the DB migration involved.
- **The Favorites `!` warning badge's fate** (still keyed on `tier === 'none'`, a stale signal
  now that the soft gate covers the same condition) — a follow-up decision, not part of this
  brief.

## Tests

- `FavoritesPage.test.tsx` — added a `stubCalibrationTier` module variable (mirroring the
  existing `stubHasCalibrationWeights` pattern) so tests can drive `useCalibrationGate`'s `tier`
  independently of `hasWeights`. Rewrote the two existing gate tests (hard gate now asserts on
  "Answer a few comparisons first" and the absence of an "Evaluate Album" bypass; the old
  "does NOT nudge" test is replaced since that combination now DOES gate) and added a third
  covering the no-gate path (`hasWeights: true`, `tier: 'high'`).
- `CriteriaCalibrationCheckpoints.test.tsx`, `CriteriaCalibrationFreezeCheckpoint.test.tsx`,
  `CriteriaCalibrationTabsAndGuide.test.tsx` — updated copy assertions to the new aria-label/body
  wording.
- `CriteriaCalibrationTabsAndGuide.test.tsx` — added a new test for the resume banner (shows on
  a tier-none entry, dismissible).

## Status

Merged to `master` `--no-ff` at `d082115` on 2026-09-18. 52/52 files, 397/397 tests pass, `tsc`
clean on `master` post-merge (auto-merged cleanly against `master`'s intervening
`personal-data-exposure-remediation` merge — no conflicts). `eslint` clean on the branch (two
pre-existing `react-hooks/set-state-in-effect` findings in `CriteriaCalibrationPage.tsx` predate
this branch and are unrelated — confirmed by diffing against `master` before merge).

**Live-verified 2026-09-18** on Dan's own account (Dan logged in himself in the browser pane,
per the QA-account convention — no credentials entered by Claude): confirmed the soft gate
fires exactly as specced ("Keep going for a steadier score", three buttons, "Go to calibration"
styled as primary) for this account's real `hasWeights: true, tier: 'none'` state; "Evaluate
Album" bypasses to `/rate/:albumId`; on reaching the final Score/Rank state, "SCORE LEVEL:
UNFOCUSED" renders next to the new persistent "GO TO CALIBRATION" action, which navigates
correctly; the calibration resume banner appears on entry, sits above the tab bar without
disturbing the header/panel join, and dismisses cleanly; the `TierAccuracyBadge`'s new
aria-label (`"Unfocused tier. 5 percent of your weighting settled."`) and tooltip render
correctly; the untouched `!` warning badge's aria-label reads the new `"Score level: Unfocused"`
text. The hard gate (`hasWeights === false`) was **not** exercised live — this account already
has weights, and forcing that state would mean wiping real calibration data, out of proportion
for a copy/branching check already covered by `FavoritesPage.test.tsx`.

Side effect of verification: rating all six criteria on Dan's real favorited album (DJ Urutau –
Ornitofagia) was necessary to reach the final Score/Rank state and see the persistent action —
this is a real, kept change to his account data, not a rollback-and-discard test.
