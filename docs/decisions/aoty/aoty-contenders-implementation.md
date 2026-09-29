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

## Selection UX — checkbox moved off FavoriteListItemRow onto a shared SelectableRow wrapper

**Date:** 2026-09-28

**Correction to the "Code review — Contenders implementation" section above:** that section
described `FavoriteListItemRow`'s `selectable`/`selected`/`onToggleSelect` extension as shipped.
This pass reverses that — those three props (and the checkbox they rendered, inline in the
row's desktop tree) are removed from `FavoriteListItemRow` entirely. `FavoritesPage.tsx` is back
to selection-agnostic, matching its pre-Contenders shape.

Selection now lives in a new shared `src/components/SelectableRow.tsx`, wrapping either
`FavoriteListItemRow` instance from the outside:

- **Checkbox outside the card frame, not inside it.** Layout is `[checkbox column][wrapped
  row]`, checkbox column on the left, vertically centered via `Flex align="center"`. Checked
  Chakra's installed `CheckboxCard` first (`node_modules/@chakra-ui/react`) — its `Root` wraps
  `Checkbox.Root` (Ark), which itself renders as a literal `<label>`
  (`@ark-ui/react/.../checkbox-root.js`). Nesting the row's own action buttons inside that label
  would make their text/labels contribute to the checkbox's accessible name — rejected for
  exactly the reason the brief flagged. Went with a plain wrapper instead: the row's own actions
  and the checkbox stay siblings, not label descendants.
- **Why outside, not overlaid on the row's own border:** keeping the checkbox physically
  separate from the card is what lets `FavoriteListItemRow` stay selection-agnostic — the row
  never needs to know it's being rendered inside a selectable context, so `FavoritesPage.tsx`
  (which never wraps its rows in `SelectableRow`) is untouched by this feature entirely.
- **Selected-state ring, not a second border color on the row itself.** Same constraint (the row
  can't be told it's selected) rules out styling its own `border.ruleStrong` frame directly. A
  `boxShadow` ring (`0 0 0 2px accent.border`) on `SelectableRow`'s own wrapping `Box` sits just
  outside the row's real border instead, using `useToken('colors', 'accent.border')` rather than
  a `{colors.accent.border}` brace-interpolated string — `MobileRatingLayout.tsx` already
  documents (and live-confirmed) that brace-interpolation doesn't reliably resolve inside a
  compound `boxShadow` value at runtime; this reuses that same resolved-token pattern rather
  than re-discovering the bug.
- **Click-anywhere-on-the-row toggle** via one `onClick` on the outer `Flex`, using
  `e.target.closest('button, a, input, label, [data-no-select]')` to no-op on the row's own
  actions and on the checkbox itself (Ark's checkbox root is a `<label>`, so this same check also
  absorbs the synthetic click it forwards to the hidden input — without it, a single visible
  click would toggle twice). `closest()` over `stopPropagation` on each action, so anything added
  to the row later is covered automatically rather than needing its own opt-out.
- **`desktopOnly` prop, not a hardcoded breakpoint.** `ContendersPage`'s real rows need the
  checkbox/ring hidden below `md` (checkboxes are desktop-only per this doc's own Decisions
  section); `AddToContendersPicker`'s rows need it *always* visible — they render in
  `FavoriteListItemRow`'s `previewMode` inside a Drawer that's always narrower than the desktop
  breakpoint, so a `desktopOnly` hide would blank its only selection affordance entirely. One
  boolean, not two components. `ContendersPage` passes `desktopOnly`; the picker leaves it
  `false`.
- **2026-09-29 follow-up — the mobile gap above is now closed.** `handleClick` checks
  `getComputedStyle(checkboxColumnRef.current).display === 'none'` before toggling (only when
  `desktopOnly`), and no-ops if so. `getComputedStyle` re-reads the live cascade on every call —
  no cached value, no `matchMedia`/`resize` listener needed, stays correct across a mid-session
  resize. Not JS viewport detection in the sense the `home-grid-virtualization.md` exception
  means (no `window.innerWidth` read, no breakpoint constant duplicated in JS) — it asks the DOM
  what the existing CSS already decided, which is a materially smaller exception than that one.
  Tests: jsdom doesn't evaluate the emotion-injected `@media` rule for `getComputedStyle`
  regardless of `window.innerWidth` (empirically confirmed — forcing `innerWidth` to 500 still
  reported `display: block`), so the regression test stubs `getComputedStyle` for the checkbox
  column element directly rather than attempting a real-viewport test that couldn't actually
  exercise the branch.

New tests: `src/__tests__/SelectableRow.test.tsx` (card-body click toggles; action-button click
does not toggle and the button still fires; checkbox click toggles exactly once, asserted on the
real `<input>` element per this doc's existing aria-label-on-the-input regression; a
keyboard-triggered click on the focused checkbox toggles exactly once — jsdom doesn't wire native
Space-activates-a-checkbox without `@testing-library/user-event`, which isn't installed, so this
simulates the browser's own default action directly rather than adding a dependency for one
test). Two integration cases added to `ContendersPage.test.tsx` (card-body click selects; Remove
does not select). `FavoritesPage.test.tsx`'s now-obsolete `FavoriteListItemRow selection
checkbox` describe block removed.

919/919 tests (914 baseline − 2 removed + 5 + 2 new), `tsc` clean, lint clean on every touched
file (`npx eslint` scoped to the touched files — the full-repo `npm run lint` currently reports
~7000 pre-existing prettier-formatting problems across unrelated files, not something this pass
introduced or is scoped to fix).

## Mobile selection split: Contenders (none) vs. the picker (tap + ring, checkbox visually hidden)

**Date:** 2026-09-29

Two different mobile behaviors, both intentional, easy to conflate since they're the same
`SelectableRow` component:

- **Contenders mobile still has no selection at all** — unchanged by this pass. Checkboxes and
  the bulk action bar remain desktop-only, per this doc's own Decisions section
  (`aoty-hub-population.md`: "checkboxes and a bulk action bar are desktop-only"; mobile keeps
  single-row remove, one album/one action at a time). `ContendersPage.tsx` still passes
  `desktopOnly`, which hides the checkbox with `display:none` (removed from the accessibility
  tree too — there's genuinely no selection feature to announce on Contenders mobile) and
  disables click-to-toggle there via `SelectableRow`'s `getComputedStyle` guard (2026-09-29,
  above). Nothing about this changed in this section's work.
- **`AddToContendersPicker`'s mobile selection is unchanged in *function*, changed in
  *chrome*.** Its checkbox is the picker's only selection affordance (unlike Contenders, it has
  no separate per-row action to fall back to), so click-to-toggle and the selected-state ring
  stay fully active at every width — reusing `desktopOnly` here would have disabled
  click-to-toggle via the same guard that's correct for Contenders, breaking bulk-add on mobile
  entirely. Instead, a new `hideCheckboxOnMobile` prop visually hides the checkbox below `md`
  (freeing that column's width for the title/artist text) using the same technique as Chakra's
  own `srOnly` utility — `position: absolute` + 1px box + `clip: rect(0,0,0,0)`, not
  `display: none` — so the checkbox stays in the accessibility tree. `AddToContendersPicker.tsx`
  now passes `hideCheckboxOnMobile` instead of nothing.

**Verification:** asked for VoiceOver/TalkBack. Neither is reachable from this session — no live
screen-reader session, and the live app itself isn't reachable either (no stored credentials;
this project's QA convention is that Dan always logs in himself). Verified with the strongest
available substitute instead: rendered `SelectableRow` with `hideCheckboxOnMobile` via Vitest,
dumped its real rendered markup + generated CSS to a static HTML file, served it locally, and
loaded it in a real Chromium tab (not jsdom, which — as the 2026-09-29 fix above already found —
doesn't evaluate the emotion-injected `@media` rule at all). At a 375px viewport, confirmed via
live `getComputedStyle` and the browser's own accessibility-tree read: the checkbox column
computes `position: absolute; width: 1px; clip: rect(0,0,0,0)` (not `display: none`, not
`visibility: hidden` — the two properties that actually remove an element from the accessibility
tree), the `<input>` remains queryable with `role: checkbox`, its correct `aria-label`, and
`checked` reflecting `selected`. At 1280px the same element computes back to normal static
layout. Chromium's accessibility tree is what TalkBack (Chrome/Android) reads directly and is
structurally equivalent to what WebKit exposes to VoiceOver on iOS Safari — a strong proxy, but
not a substitute for an actual screen-reader pass on a real device before this ships. That pass
is still open; flagged rather than silently treated as done.

New tests: `src/__tests__/SelectableRow.test.tsx` gains coverage for `hideCheckboxOnMobile` (the
checkbox stays queryable by role/name; a card-body click still toggles even when the checkbox
column is stubbed to report `display: none`, proving the prop never engages `desktopOnly`'s
`getComputedStyle` guard). 923/923 tests, `tsc` clean, lint clean on every touched file.
