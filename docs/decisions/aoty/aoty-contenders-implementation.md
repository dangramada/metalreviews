# AOTY Contenders — implementation record

Follows `aoty-hub-population.md` (discovery decision record, frozen as of 2026-09-22). This
file tracks the actual build of the Contenders stage on `feature/aoty-contenders`: corrections
to stale discovery claims, code-review findings and fixes, and every decision made during
implementation that either follows or deviates from the original discovery doc. Dated sections,
append-only — see `docs/decisions/aoty-summary.md` for current overall status.

**Date:** 2026-09-28 (all sections below)

---

## Correction — Favorites-Score dependency already satisfied

`aoty-hub-population.md`'s Dependencies section (and `concept-draft.md`) flag "Favorite page
needs a Score display update" as a blocking dependency for the Contenders row design. That
shipped since discovery: `feature/favorites-score-badge` + `feature/rating-page-score-format`
are both merged to `master`, and `FavoritesPage.tsx`'s `scoreOverlayBadge` already renders a
personal Score for any fully-rated album. Nothing needed here before building Contenders.

Also scoping this pass: the Contenders stage is being implemented standalone (own route,
own nav label "Contenders") without the AOTY final-list screen — Dan's call, since the two
were designed as one coupled two-column screen but AOTY itself isn't built yet. The bulk
action bar does bulk-remove only for now; "Select for AOTY" gets added once AOTY ships.
Nav label becomes "AOTY" at that point too.

## Code review — Contenders implementation

Three parallel review passes (simplicity/DRY, bugs/correctness, conventions) against the
Contenders implementation (`/aoty/contenders`, `useContendersList`, `AddToContendersPicker`,
`FavoriteListItemRow`'s `selectable`/`removeLabel` extension, the auto-add hook in
`AlbumRatingPage.handlePick`). Two real bugs fixed, both independently verified against the
actual installed packages/code before fixing:

- **Checkbox accessible name was broken.** A bare `aria-label` prop on the shared `<Checkbox>`
  wrapper lands on Ark's wrapping `<label>` (spread via `...rest`), not on the actual
  `role="checkbox"` `<input>` — the input's name comes from `aria-labelledby` pointing at a
  `Checkbox.Label` part this app never renders, so real screen readers would hear an unnamed
  checkbox. `getByRole('checkbox', { name })` in the original tests didn't catch this because
  jsdom's accessible-name computation is more lenient than a real AT. Fixed by using the
  wrapper's `inputProps={{ 'aria-label': ... }}` passthrough instead, at both call sites
  (`FavoritesPage.tsx`, `AddToContendersPicker.tsx`). Regression tests now assert the
  `aria-label` attribute directly on the `<input>` element, not just via role/name matching.
- **Auto-add-to-Contenders insert wasn't idempotent.** A plain `.insert()` on a PK'd table hits
  a real Postgres 23505 conflict — not hypothetical — whenever an album is manually added to
  Contenders (via the picker) while only partially rated, then later finishes rating. That
  logged a misleading "failed" warning for an entirely benign case. Fixed with
  `.upsert(..., { onConflict: 'user_id,album_id', ignoreDuplicates: true })`.

One extraction was flagged (`ContendersPage`'s calibration-gate `handleRate` duplicates
`FavoritesPage.tsx`'s almost verbatim) but deliberately deferred rather than fixed on this
branch — it would mean editing already-shipped Favorites code, widening this branch's diff
beyond Contenders. Logged in `docs/decisions/deferred-work.md` §B, to revisit once the AOTY
final-list screen becomes a third call site for the same flow.

913/913 tests, `tsc` clean, lint clean on all touched files.

## Banner revision — Alert reuse, insufficient-data branch dropped

Two deviations from the original build, caught when Dan asked whether the "more prominent"
Contenders banner duplicated an existing component before any code changed:

- **Built with the shared `Alert` component (`status="info"`, `variant="surface"`,
  `status.info` tokens), not `TierAccuracyBadge size="lg"`.** The original build plan
  (`aoty-hub-population.md`'s Decisions section) named `TierAccuracyBadge`, but the actual
  first-pass implementation used neither that nor `Alert` — a hand-rolled `Flex`+icon+`Text`,
  styled ad hoc (`border.ruleStrong`/`surface.card`/`text.muted`) rather than reusing anything.
  A grep for existing banner/alert/callout patterns turned up two direct precedents for this
  exact `tier === 'none'` condition, both already using `Alert`: `AlbumRatingPage.tsx`'s
  insufficient-data banner and `CriteriaCalibrationPage.tsx`'s resume banner. Replaced the
  hand-rolled version with `Alert`, matching both. `TierAccuracyBadge`'s `percent` prop was
  never adopted either pass, for the reason already recorded above (computed from live
  calibration-solver state in `CriteriaCalibrationPage`, not something to replay for a page
  banner) — see `criteria-calibration-degree-tiers-and-progress.md`'s "What NOT to change".
- **Dropped, not kept: the banner no longer also fires on `hasInsufficientData`.** The first
  pass OR'd `tier === 'none'` with `hasInsufficientData` into one combined condition;
  `aoty-hub-population.md`'s own Decisions section only ever specified `tier === 'none'`.
  Dropped rather than kept as a recorded extra decision: no page-level banner for
  `hasInsufficientData` exists anywhere else in the app (Favorites — the closest sibling list
  page — only surfaces it via the existing per-row `confidenceWarningBadge`/dash treatment,
  which Contenders rows already inherit unchanged through `FavoriteListItemRow`), so a
  page-level banner for it here would have been a new, undiscussed pattern rather than reuse.
- **Banner copy** now reuses the exact sentence `CalibrationGateDialog`'s soft-gate mode and
  `CriteriaCalibrationPage`'s resume banner already use for this same `tier === 'none'` state
  ("A few more comparisons usually settle the score closer to what matters most to you."),
  title `` `Score level: ${label}` `` matching the established feature-name convention
  (`criteria-calibration-terminology-and-gate-unification.md`). A third reuse of the same
  words for the same event, not a fourth variant.

## Empty state — EmptyState component adopted

Contenders' "no rows yet" message was a plain `<Text>`, copied from `FavoritesPage.tsx`'s own
bare-Text empty state. Switched to the shared `EmptyState` component
(`src/components/ui/empty-state.tsx`) — previously scaffolded but never imported anywhere in
the app — with a Lucide `Info` icon, title "No contenders yet.", description "Score an album,
or add one from your favorites."

`FavoritesPage.tsx`'s matching empty state is untouched (still bare `Text`), so the two sibling
list pages now diverge visually. Not fixed here — out of this branch's stated scope. Logged as
an app-wide empty-state consistency audit in `docs/decisions/deferred-work.md` §B rather than
expanding scope to fix every instance found.

`supabase/contenders.sql` has already been run against the live project (Dan, 2026-09-28,
before this branch's frontend code was written) — confirmed via a read-only query, noted in the
migration file's own header. Not still pending.

914/914 tests, `tsc` clean, lint clean.

## Documentation restructure — this folder + gateway created

`aoty-hub-population.md` (the original discovery record) and this file were previously one
file, with implementation notes appended as dated sections onto the discovery doc. Split apart
and moved into `docs/decisions/aoty/` once a second file existed to organize, matching the
`album-identity/` and `criteria-calibration/` cluster precedent (both were also reorged into a
folder + gateway only after accumulating multiple files, not preemptively). `docs/discovery/`
(the design-discovery source files referenced above) confirmed gitignored, not committed — per
`documentation-governance.md`'s two-layer rule, that content belongs in Project Knowledge only.
