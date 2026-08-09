# Album rating soft gate (reversal of the 30 July hard calibration gate)

Branch: `album-rating-soft-gate`. 2026-08-09.

## Context

A same-day diagnostic (preceding this branch) traced a live report from Dan — the
"Calibrate your criteria first" modal blocking him from rating albums — to
`useCalibrationGate.ts` (`passed = tier !== 'none'`) + the block in
`FavoritesPage.tsx`'s `handleRate()`, shipped 2026-07-30 (`bf04b1b`, part 6 of Criteria
Calibration). The gate itself was untouched by any of that day's four merged branches;
what changed was Dan's own account's `tier`, correctly re-graded from a false `'medium'`
to `'none'` by the `criteria-calibration-medium-gate-redesign` migration (0.60 accuracy
< the new 0.85 Medium threshold — see that doc). Same gate, same code, its input just
flipped from pass to fail. The diagnostic also found `/rate/:albumId`
(`AlbumRatingPage.tsx`, the direct route) had **no** gate check at all — only the
Favorites "Rate" button did.

## Decision (Dan, confirmed)

Stop blocking rating access at any accuracy level. This explicitly **reverses** the
original 30 July design (`album-rating-drawer.md`'s gate, carried forward unchanged
through `album-rating-page`). Instead, surface confidence transparently wherever a
score/ranking is shown, reusing the accuracy tiers already computed by
`accuracyTiers.ts`/`persistence.ts` — no new scale invented, no changes to
`computeSolverAccuracy`, the Medium/High/Very-High thresholds, or any of that day's
other four merges.

Two implementation choices flagged back to Dan and confirmed:

1. **The nudge modal stays, but non-blocking.** Below-Medium users clicking "Rate" on
   Favorites still see a dialog, but both buttons now lead forward — "Rate anyway"
   navigates to `/rate/:albumId`, "Go to calibration" navigates to
   `/criteria-calibration`. (Rejected alternative: remove the modal entirely and rely
   solely on the on-page confidence label as the nudge — simpler, but loses a moment
   that actively points first-time users at calibration.)
2. **Confidence indicator on both the rating page and the Favorites rank badge**, not
   AlbumRatingPage alone. (Considered restricting to AlbumRatingPage only, since that's
   the only place a numeric score currently renders — Dan chose to also cover the more
   frequently-seen list view, accepting a compact abbreviated form there instead of the
   full label.)

## Implementation

- `useCalibrationGate.ts`: hook's return already included `tier`
  (`'none'|'medium'|'high'|'very_high'`) — no change needed there. Added two pure
  label-mapping exports: `confidenceLabel(tier)` (full text — "Low"/"Medium"/"High"/"Very
  High"; `'none'` reads as "Low", not "None", since the user has a real score on screen)
  and `confidenceAbbreviation(tier)` (`"L"/"M"/"H"/"VH"`, for the compact badge).
- `FavoritesPage.tsx`:
  - `handleRate()` no longer blocks. Below-Medium (`tier === 'none'`) opens the nudge
    dialog with the target album id held in new `pendingRateAlbumId` state; Medium+
    navigates straight through. Both dialog buttons now navigate somewhere real (dialog
    renamed `gateBlockedOpen` → `gateNudgeOpen`, copy rewritten to describe the tradeoff
    rather than a requirement).
  - `FavoriteListItemRow` gained a `confidenceTier` prop, rendered as a small badge
    (new `confidenceBadge` theme token, flush top-right of the artwork — muted, not
    accent-filled, so it doesn't compete with the existing bottom-left `rankOverlayBadge`)
    only alongside an existing rank badge (unrated albums have no score to be confident
    about). Desktop badge uses the existing `Tooltip` component for the full label;
    mobile uses a plain `title`/`aria-label` attribute instead, matching this file's
    existing precedent that touch has no hover state.
- `AlbumRatingPage.tsx`: added a `useCalibrationGate()` call (read-only here — this page
  was never gated), threading `confidenceTier` through `DesktopRatingLayout` and
  `MobileRatingLayout` into the shared `RatingProgressBox`.
- `RatingProgressBox.tsx`: v1, deliberately minimal — one muted mono `Text` line ("Score
  confidence: {label}") below the Score/Rank slabs, no tooltip or explanation copy.
  Ship-and-evaluate per Dan's explicit instruction not to over-build this pass.

## Verification

No Supabase test credentials this session (same recurring constraint as several prior
sessions — see `album-rating-page.md`, `criteria-calibration-medium-gate-redesign.md`).
Live-verified via a temporary dev-only route (`DevSoftGatePreview.tsx` +
`/dev-soft-gate-preview` in `main.tsx`) rendering `FavoriteListItemRow` and
`RatingProgressBox` directly against all four tier values, plus the nudge dialog —
confirmed badge placement/abbreviations, label text, and dialog copy/button behavior all
render correctly. Harness removed before this commit; not present on the branch.

`tsc --noEmit` clean. `eslint` — zero new violations on touched files (pre-existing
repo-wide prettier drift, ~3280 problems on `master` before this branch, confirmed via
`git stash` diff — unrelated to this change, not touched). `npx vitest run` — 31 files,
224 tests, all pass (no existing test exercised the gate-blocked path, so no test
updates were required by the behavior change itself).

## Follow-up pass (same day, 2026-08-09) — badge restyle + Cancel button

Two revisions requested by Dan after reviewing the first pass:

1. **Warning badge, not an abbreviation strip.** The original design showed a compact
   `L`/`M`/`H`/`VH` abbreviation for all four tiers, top-right corner of the artwork.
   Replaced with a single red-on-black `!` glyph, shown **only for tier `'none'`** — the
   only case that actually warrants a warning — positioned directly beside
   `rankOverlayBadge` (same bottom-left corner, same row) rather than a separate corner,
   sized to match it (`px`/`py`/`fontSize` identical to `rankOverlayBadge`). New theme
   token `confidenceWarningBadge` replaces the removed `confidenceBadge`: `bg: 'black'`,
   `color: 'red.400'`, sharp square corners (no radius, consistent with every other badge
   in this design system), `cursor: 'pointer'` + `_hover` for real hover affordance since
   its only content is one glyph. `confidenceAbbreviation()` (and the now-unused `passed`
   field on `useCalibrationGate`'s return) removed as dead code — nothing calls either
   anymore.
2. **Cancel button on the nudge dialog.** Added as a third `DialogFooter` button
   (`secondaryButton` + `variant="outline"`, leftmost), alongside the existing "Rate
   anyway" (solid secondary) and "Go to calibration" (primary) — closes the dialog
   without navigating anywhere, restoring an explicit no-op path the outline styling
   (rather than solid, to read as the least-committal of the three) distinguishes from
   "Rate anyway."

Live-verified via the same temporary-dev-route pattern (harness re-created, screenshotted
against all four tiers + the dialog's three-button footer, removed before committing —
not present on the branch). `tsc --noEmit` clean, zero new lint violations on touched
files, `npx vitest run` 224/224 still passing.

## Out of scope, not touched this pass

`computeSolverAccuracy`, `accuracyTiers.ts` thresholds, `solver.ts`,
`elicitationDriver.ts` — this branch only reads the already-persisted `tier` value. The
levels-2–5 flatness / degree-3 escalation issue remains a separate, already-deferred
thread (`deferred-work.md`).
