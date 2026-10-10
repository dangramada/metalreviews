# AOTY list implementation

Dated sections, append-only. Sources of truth this builds on (not rewritten):
`aoty-hub-population.md` (frozen), `aoty-contenders-implementation.md`, `../aoty-summary.md`.

## 2026-09-30: AOTY list screen (`feature/aoty-list`)

### Data
- New table `aoty` (`supabase/aoty.sql`, run manually): PK `(user_id, album_id)`, `created_at`,
  RLS identical in shape to `contenders`, composite FK `(user_id, album_id) -> contenders` with
  `ON DELETE CASCADE`, so AOTY is always a subset of Contenders.
- **Membership only.** Rank, score and year are never persisted. Year = first 4 characters of
  `albums.release_date` (`getReleaseYear`); order and rank are derived at render time from the
  user's current weights, so editing a rating re-orders the list with nothing to go stale.
- Verifier (2026-09-30): `albums.release_date` is `text`; 47/355 NULL; one row `3036-06-26`
  (deferred). Live RLS names and `ON DELETE` rules are not visible through PostgREST, so the
  DDL file is the record. No `aoty*` table existed.
- Widening the PK to a list-scoped key later is a live PK change (same caveat as `contenders`).

### Step 0: persisted vs live accuracy
Recomputed `computeCommitState(...).accuracy` over each non-test account's answer log and
compared with `user_calibration_status.accuracy_value`: two accounts, both equal to within 4.5e-16
(tiers none and medium, 3 and 26 answers, persisted and live counts equal). So
`TierAccuracyBadge size="lg"` may be fed the persisted value outside `CriteriaCalibrationPage`,
except in the stale window (`hasInsufficientData`), where the page shows the "No score yet"
Alert instead. `useCalibrationGate` now also returns `accuracyValue`.

### Ordering (`compareAotyOrder`, `scoreAndRank.ts`; `rankAlbum` untouched)
1. Score descending, compared after rounding to 6 decimals.
2. Tie-break by the user's most important criterion: importance = spread (max - min) of that
   criterion's level values in `user_criterion_weights`; equal spread falls to criterion id.
   Albums compare on their contribution to that criterion, same 6-decimal rounding, higher wins;
   equal moves to the next criterion. Chosen over "each album's own strongest criterion", which
   can be non-transitive.
3. Then `band`, `album`, `albumId` via `Intl.Collator('en')`. Total order.
- Rank #N = position among the members of that year; unique, no shared ranks.
- Contributions come from `useAlbumRatingsSummary` (additive: `contributions` per album and a
  `criterionOrder` return value; `computeScore` now sums `criterionContributions`). No forked
  fetch.
- Tests use synthetic near-ties only (gaps about 5e-8 and 8e-8 tie; about 1e-4 does not; about
  2e-10 across a rounding boundary orders by score). No real album data.

### Display rounding
Rows show scores via `formatBadgeScore` (1 decimal, unchanged). Two rows can therefore display
the same score while ranked differently (the ordering compares 6 decimals). Accepted.

### Screen and behavior
- `/aoty` = the list; "Contenders →" goes to `/aoty/contenders`; Contenders has "AOTY →". Same
  structure on desktop and mobile. Nav: "Contenders" relabelled "AOTY", `href /aoty`, active for
  `/aoty/*` (both lists in `Header.tsx`). `?from=aoty` on the rating page now returns to `/aoty`.
- Default year = latest with members; selector only when members span more than one year.
- Members never vanish: no score or no year -> unranked, listed after ranked ones (no-year ones
  under "No release year"). Tier `none` or insufficient data -> no rank numbers, ordered by
  `created_at`, banner explains.
- Banner: tier `none` reuses `ContendersPage`'s `Alert`; otherwise `TierAccuracyBadge size="lg"`,
  which carries its own subject ("N percent of your weighting settled") in aria-label/tooltip,
  so no new copy was written.
- "Select for AOTY" (per row, and bulk on desktop): always an enabled action except with a NULL
  release date. If the album is not ready (unrated, tier `none`, insufficient data) the click
  hands off to the existing gate flow (`handleRate`). Bulk adds only ready albums and reports the
  skipped count. Inserts are idempotent (`upsert`, `ignoreDuplicates`). After selection the row
  stays in Contenders marked "In AOTY" [SUPERSEDED 2026-10-03: promoted albums now leave Contenders, see "Reversal of decision 8" below]. Remove from AOTY deletes the `aoty` row only [now "Back to Contenders"].
- NULL date: no user path exists from Contenders (see `deferred-work.md`), so the row shows the
  visible status text "No release date yet." and a disabled button.
- Cascade [SUPERSEDED 2026-10-03: AOTY members are no longer listed in Contenders, so this UI is gone; the DB cascade remains]: removing a Contender that is in AOTY also drops its AOTY row. The single-remove dialog
  says so; bulk remove asks for confirmation only when the selection includes AOTY members, and
  shows the count. Code paths deleting from `contenders`: `ContendersPage` single and bulk only.

### Rank presentation (2026-10-01 — reverses the provisional "#N text" decision)
The earlier plain orange "#N" text prefix is gone. Rank is now an overlay badge on the artwork,
bottom-left, immediately left of the score badge (rank first, score after), inside the same grid
strip as `scoreOverlayBadge`/`confidenceWarningBadge`. Token `rankOverlayBadge` (`theme.ts`) =
`scoreOverlayBadge` spread (box metrics, borders, 14px heading face) with `scoreSlabHigh`'s
ember bg / ink text and bold weight; `scoreOverlayBadge` and `RatingSlab` are untouched.
Rendered only when the optional `rank` prop is passed, so Favorites is unchanged; unranked
members (no score / no year) show no badge, as before. Accessible name: visible "#N" is
`aria-hidden`, with Chakra's `srOnly` text "Rank N" beside it (not an `aria-label` on a plain
Box); tests assert the real text. The `note` text ("In AOTY", ...) stays, as a plain line.
Fit: artwork is a fixed 128px in both layouts. Measured on a StyleGuide sample (not a real
page; no login available): rank+score strip is 87.5px ("#4"/8.2), 94.7px ("#42"/9.1) and
114.6px ("#100"/10.0, stress case), all inside 128px with no overlap or clipping, at desktop
and under 320px viewport emulation. Rank never co-occurs with the tier-`none` warning badge.

### Deviations from the discovery concept, logged
- No persistent mobile badge header.
- "AOTY →" on Contenders instead of a "Done →" action.

### Not in this pass / not done
- No backfill of Contenders for already-rated albums (1 of 15 at the time of writing).
- Desktop two-column layout, public share page, manual reordering, multi-list, Favorites renaming.
- Real-device screen-reader check of the new rank text (now `srOnly` "Rank N"). Real-page visual check of the rank badge on `/aoty` (needs a logged-in account).

### Verification
- `npm run type-check` is `tsc -b` (package.json:16). Proven live: an injected
  `const x: number = 'x'` in `src/` made `npm run type-check` fail with TS2322; removed after.
- 955 tests (baseline 923, +32), lint clean on every touched file (repo-wide lint has ~1266
  pre-existing prettier errors, see `deferred-work.md`).

## 2026-09-30 (later): REVERSAL, no banner-scale `TierAccuracyBadge` on the hub

**Reverses** the earlier "Banner" bullet and Step 0's use of it: the AOTY screen no longer renders
`TierAccuracyBadge size="lg"`. Reason: consistency with `ContendersPage`.

- AOTY now uses the same banner as Contenders: the shared `Alert` with the same `tier === 'none'`
  condition and the same title/body text. Duplicated (about 10 lines) rather than extracted, since
  extraction would have touched `ContendersPage` for no size saving.
- The separate "No score yet" Alert for `hasInsufficientData` is dropped with the badge, to match
  Contenders (which shows no banner in that state). Rank numbers are still withheld and rows still
  show their own insufficient-data score badge, so the state is not silent, but there is no
  page-level explanation.
- `accuracyValue` (and the `toAppTier` helper) added to `useCalibrationGate` are reverted: grep of
  `src/` for `accuracyValue|toAppTier` found no consumer other than `AotyPage` (the only other
  hit, `CriteriaCalibrationCheckpoints.test.tsx`, is an unrelated local variable).
- Empty state was already the same `EmptyState` pattern as Contenders (CTA text unchanged).
- **Step 0 result stands as a finding:** persisted `accuracy_value` equals the live solver value
  to within 4.5e-16 on both non-test accounts, outside the stale window. It remains the basis for
  feeding a badge from persisted data if a later screen wants one.
- Tests: badge and insufficient-alert tests removed, one "no banner above tier none" test added;
  954 total (baseline 923).

## 2026-09-30 (later still): query fix and shared tier-none banner

- **Bug:** `useAotyList` embedded `albums(...)` from `aoty`, which has a foreign key only to
  `contenders`, so PostgREST returned 400 `PGRST200`. No FK from `aoty` to `albums` was added.
- **Fix:** two steps. Read `aoty` (`album_id, created_at`), then fetch those albums via the
  existing `contenders -> albums` embed (`CONTENDERS_SELECT`, now exported) filtered with `.in()`.
  Chosen over a nested `aoty -> contenders -> albums` embed: that shape resolves (200) but the
  table was empty, so its row shape could not be demonstrated; the two-step reuses a proven one.
- **Test:** `useAotyList.test.ts` asserts the tables queried are only `aoty` then `contenders`,
  that the `aoty` select has no embed, and that the contenders select equals `CONTENDERS_SELECT`.
- **Banner:** one shared `TierNoneBanner` (`src/components/TierNoneBanner.tsx`) on both pages,
  with a "Go to calibration" link to `/calibration?from=contenders|aoty` (copy and link styling
  reused from `AlbumRatingPage`'s insufficient-data banner). `CalibrationBreadcrumb`'s `from` map
  gained `contenders` and `aoty` entries so the breadcrumb returns to the right page (previously
  `?from=contenders` fell back to Favorites).

### 2026-10-01 follow-ups (appended; earlier sections above are left as written)
- **Rename:** `rankOverlayBadge` -> `aotyRankBadge` in `theme.ts`, `FavoritesPage.tsx`,
  `StyleGuide.tsx` (the only usages; no tests referenced it). The old name belonged to the
  Favorites token replaced 2026-09-26. Mentions of `rankOverlayBadge` in the "Rank presentation"
  section above mean the AOTY badge, now `aotyRankBadge`. `designTokensDoc.test.ts` passes.
- **Measured widths** (StyleGuide sample, `getBoundingClientRect` on the rank+score strip inside
  a 128px artwork square, real browser pane; not a real `/aoty` page). Desktop artwork is a fixed
  128px, not ~117px, and mobile uses the same 128px, so strip widths match across viewports.
  Under 320px emulation the pane's `innerWidth` read 415 (scaled), but the artwork and strip are
  fixed px, so the numbers are unaffected.

  | Case (score 10.0) | Desktop strip / artwork | 320px emulation strip / artwork | Fits |
  |---|---|---|---|
  | #1 | 91.3 / 128 | 91.3 / 128 | yes |
  | #42 | 106.4 / 128 | 106.4 / 128 | yes |
  | #100 (stress) | 114.6 / 128 | 114.6 / 128 | yes |

  (117px would also fit all three.)
- **Rank-before-score test:** `AotyPage.test.tsx`, "puts the rank badge before the score badge in
  the same strip".
- **"Your Score" tooltip** (naming table in `aoty-hub-population.md`): optional `scoreLabel` prop
  on `FavoriteListItemRow`, passed only by `AotyPage` and `ContendersPage`; Favorites,
  Album Rating and `AddToContendersPicker` unchanged. Desktop: existing `Tooltip` component on the
  score badge. Mobile: no tooltip (touch has no hover; same reason the warning badge uses no
  Tooltip on mobile), so the label is available there only to screen readers. Accessible name
  "Your Score x.x" is srOnly text with the visible number `aria-hidden`. The insufficient-data
  dash keeps its current behavior (no tooltip: there is no score for the label to describe).

### 2026-10-02: Contenders backfill (`feature/contenders-backfill`)

- **Rule:** a scored album enters Contenders via app-level auto-add on the first full rating
  (`isFirstFullRating`, `AlbumRatingPage.handlePick`). No mechanism was added; this pass only
  backfills albums that were fully rated before it shipped or whose fire-and-forget add failed.
  `handlePick` is the only rating writer, so no uncovered path exists.
- **Script:** `supabase/contenders-backfill.sql`, run manually by Dan. Insert-only, idempotent,
  all users; "fully rated" = rated on every `criteria` row (6 today). Wrapped in a transaction
  that asserts contenders = 21 and missing = 0, else raises and rolls back.
- **created_at:** `album_criteria_ratings.updated_at` exists, so backfilled `created_at` =
  `max(updated_at)` per (user, album) (when it became fully rated), not the insert time.
- **Counts (2026-10-01, pre-run):** 17 fully-rated albums across 2 users (Dan 15, other 1 user 2);
  15 missing from Contenders (Dan 14, other 1). Contenders 6 -> expected 21. 4 existing
  Contenders are not fully rated (manual adds) and are untouched.
- **Curiosity-removal caveat:** the backfill can't distinguish albums deliberately removed from
  Contenders, or scored out of curiosity, from ones never added; they all return. Remove by hand
  if unwanted; the first-full-rating rule won't re-add them.
- **Rollback:** delete the inserted (user_id, album_id) keys saved from the script's STEP 1;
  safe w.r.t. `aoty` (new rows have no aoty child). PK and aoty cascade are unaffected by inserts.
- **Run 2026-10-02 (Dan), verified live:** contenders 6 -> 21, fully-rated-but-missing 15 -> 0, 17 fully rated, aoty still 1 row.
- **Tests/tsc:** no code files changed; pre-merge 121 files / 959/959 tests, `tsc -b` clean (unchanged).

### Reversal of decision 8: a promoted album leaves Contenders (2026-10-03, `feature/aoty-promoted-leaves-contenders`)
Reverses "after selection the row stays in Contenders marked In AOTY" (and the cascade warnings
built on it). **Reason:** one place per album, no duplication in the planned two-column layout.
Discovery never stated coexistence explicitly. No schema change (`aoty` stays a subset of
`contenders`, FK/cascade untouched).
- **Contenders list** = contenders minus AOTY members (filtered client-side by the AOTY id set).
  Loading waits for both fetches (no flash of AOTY members); if the AOTY fetch fails, all
  contenders show and re-selecting is a harmless idempotent upsert. The picker still receives the
  unfiltered contender set, so AOTY albums stay hidden from it (copy: "already in Contenders or
  AOTY"). Empty state "All your contenders are in AOTY." is distinct from "No contenders yet.".
- **AOTY row:** the trash/remove control is replaced by "Back to Contenders" (desktop: ghost
  `IconButton` + tooltip; mobile: the existing icon+text button that collapses to icon-only under
  400px). Deletes only the `aoty` row, no confirm (non-destructive).
- **Removed as dead code:** "In AOTY" note, `removeNote` prop, single/bulk "also removes from
  AOTY" copy, bulk-remove confirm dialog and tests.
- **Toasts:** single "Added to AOTY"; bulk unchanged ("N added to AOTY." + skipped text). No
  year suffix: a later branch makes year a shared scope.
- **Focus:** after Select for AOTY / Back to Contenders succeeds and the row leaves, focus moves
  to the next row's primary control, else the list heading. On failure the row stays and the
  existing error toast shows.
- **Auto-add on first full rating:** unchanged; its upsert (`ignoreDuplicates`) is a no-op for an
  album already in AOTY (already a contender), and the filtered list keeps it hidden.
- **Tests/tsc:** 121 files, 968/968 (baseline 959), `tsc -b` clean; touched files lint-clean.

### In-flight feedback and local-first updates (2026-10-03, QA fix on the same branch)
- **Why:** Select for AOTY / Back to Contenders looked inert: no pending state, repeatable, and the
  row only moved after the write plus a full `useAotyList` reload (2 sequential reads, with a
  spinner flash).
- **Per-row pending:** `usePendingIds` (ref = synchronous guard, state = render). Same album never
  has two writes in flight; different albums run in parallel. The two row buttons deliberately do
  NOT use Chakra's `loading` (it sets `disabled`, which drops keyboard focus): `aria-busy` +
  `aria-disabled` + spinner + reduced opacity, accessible name unchanged, click ignored by the
  guard. Bulk buttons keep the standard `loading` pattern and lock each other; the selected rows'
  checkboxes lock via `SelectableRow`'s new `disabled` prop.
- **Local-first:** `useAotyList` gains `addLocal` / `removeLocal`, applied from the write result;
  `refetch()` is now silent (no spinner, no error on failure, keeps local state). A generation
  counter drops any refetch that began before the latest local mutation, so a slow earlier
  response cannot undo it. Reconcile does not move focus (focus is moved once, by the ref-held
  pending-focus intent, which is cleared when it fires).
- **Measured (SYNTHETIC harness, 200 ms per query, not live):** row visible after write resolved
  ~411 ms before (two sequential reads), ~1 ms after. Live timing needs Dan's session (Network tab).
- **Tests/tsc:** 981/981 (baseline 968), `tsc -b` clean, touched files lint-clean.

### Year as a shared scope (2026-10-03, `feature/year-scope`)
- **What:** the release year is one scope for `/aoty` and `/aoty/contenders`, held in the URL
  (`?year=YYYY`, or `?year=none` for albums without a usable release year) and read through one
  hook, `useYearScope` (`src/hooks/useYearScope.ts`; pure parse/serialize in
  `src/lib/aoty/yearScope.ts`). One selector component (`YearScopeSelect`, accessible name
  "Year", shown only when the pool spans more than one scope value) sits in both page headers.
  AOTY's own year chips and its "No release year" sub-heading are removed: the no-year bucket is
  now just another scope value. Rank stays per year (`buildAotyView` unchanged).
- **Derived, never stored.** Year still comes from `albums.release_date` via `getReleaseYear`.
  `aoty` is unchanged, no `list_id`. `getReleaseYear` reads the first four characters, so `YYYY`,
  `YYYY-MM` and full dates all work and a NULL or unparsable date is the no-year bucket.
- **Year source:** the unfiltered Contenders list plus the live `aotyIds` set (AOTY is a subset of
  Contenders, so Contenders' years cover AOTY's). `/aoty` now also calls `useContendersList`: one
  extra read on `/aoty`, none extra on `/contenders`. `/aoty` makes the AOTY ids read, then the
  members read (serial, only when AOTY has members), plus the all-contenders read (in parallel
  with that chain). If that request
  fails, the pool falls back to the AOTY items. `ContendersPage` keeps its ids-first gate.
- **Default year rule:** most AOTY members; if none, most contenders; ties go to the latest year.
  The no-year bucket is a default only when it is the only scope value. **Why not "last
  promoted":** it needs stored state (a timestamp read per user, or a persisted pick) and flips on
  a single action; counts are derivable from data already loaded.
- **Pinned after first resolution.** The scope resolves once and is then held in state: it is
  re-resolved only on mount, an account change, or when the URL value itself changes. Promoting or
  removing albums changes counts but never the displayed scope. A scope that becomes empty stays
  on screen with its empty state. An invalid or unavailable `?year` falls back to the default only
  at resolution. The hook writes the resolved scope to the URL with history `replace`, so the
  header link and a reload carry it; it writes nothing when there is only one scope value.
- **January 2027:** the rule never reads today's date. On 2027-01-01 the default stays at
  whichever year has the most members; a 2027 release appears as a selectable year and becomes the
  default only by out-counting it (contrast the 2026-09-21 Metal Storm calendar-year bug).
- **Implausible years** (e.g. a catalog row dated 3036) are listed as-is, not hidden: hiding a
  year would make its albums unreachable in both views, and a visible odd year is how bad catalog
  data gets noticed. Consequence: a tie with such a year goes to it (ties favor the latest). Catalog
  data not touched here.
- **Contenders list** = contenders minus AOTY members, filtered to the scope. Undated contenders
  appear only in the no-year scope, keep the "No release date yet." reason; their
  "Select for AOTY" opens the release date dialog instead of writing (see the 2026-10-04
  revisions). The selection is cleared when the scope changes (otherwise a bulk action
  could hit rows no longer on screen). Pending ids are per album and survive a scope switch; the
  focus handoff watches the unscoped list so a switch cannot steal focus.
- **Empty states** (same `EmptyState`): "No contenders in 2025." / "No contenders without a
  release year."; "All your 2026 contenders are in AOTY." (this replaces the unscoped text);
  AOTY: "No AOTY picks in 2025." with the existing "Pick from your Contenders." text. True-empty
  states unchanged.
- **Add from Favorites:** the picker's list and hidden set are unchanged. `onAdded` now receives
  the added albums, the page puts them in the pool (`useContendersList.addLocal`) before the toast,
  and may return a toast suffix and an action. If any added album is outside the current scope the
  toast appends how many are; if all of those share one year it uses `showAction` ("View 2024",
  `info` toast, 6 s) which switches the scope. Mixed years or undated: count only.
- **List-as-entity: consciously deferred** (discovery wanted multi-list possible). Reversible by
  a deterministic migration: a lists table with one default list per user and year, `aoty` gaining
  a list reference backfilled from the derived year. Nothing here forecloses it.
- **Auto-add on first full rating:** unchanged; an album from another year just widens the
  options.
- **Tests/tsc:** 123 files, 1040/1040 (baseline 1007 at `72d2f69`), `tsc -b` clean, touched files
  lint-clean apart from 3 `no-explicit-any` errors already in `Header.test.tsx`. Header layout
  checked at 320 px and desktop with a throwaway harness (real selector and theme, copied header
  rows, no login), not the live pages.
- **Not live-verified.** See the branch hand-off list for what needs a logged-in check.
- **Correction (2026-10-03, after the architecture check):** `/aoty` after this branch makes 3
  Supabase reads (ids, then members serially; all contenders in parallel), 2 when AOTY is empty;
  before it made 2 (1 when empty). `perf-initial-load.md` line 50 ("`/aoty` 15 -> 9", a static
  estimate) predates this branch and is not updated there (merged, append-only); by the same
  method the figure is now one higher, 10, not remeasured. The page also waits for the slowest of
  the two chains before showing the list.

## 2026-10-04: Release date at promotion (`feature/release-date-at-promotion`)

Implements `aoty-year-scope-and-two-column-decisions.md` section 4. In progress, not merged.

- **Entry point:** on a Contenders row with no release date, the per-row button reads "Add release
  date" (enabled) instead of a disabled "Select for AOTY"; "No release date yet." stays. Same
  `Button`, pending/`aria-busy` pattern, `data-primary-for` kept. The bulk bar is unchanged and
  still skips undated rows. Opens `ReleaseDateDialog` (shared `Dialog` parts): one text field,
  `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, helper text "shared with everyone who has this album and cannot
  be changed afterwards from the app", and a preview line ("Will be saved as: Mar 2024", via
  `formatReleaseDate`) shown only for valid input. Save only: no "Save and select", because
  selecting can still branch to the rating gate.
- **Validation:** `parseReleaseDate` (`src/lib/aoty/releaseDate.ts`): strict shape, month 1 to 12,
  real day of month (UTC component arithmetic, no `Date` parsing of the string, so no timezone
  shift), year 1900 to current year + 1 (from the clock). The string is stored as typed, trimmed.
  The 3036 case cannot be entered. `getReleaseYear` is `parseInt` of the first four characters,
  so `2024abc` reads as 2024; validation therefore has to come first.
- **Write:** `fill_missing_release_date` v2 returns the stored date. A different stored date
  (someone else filled it first) is shown ("already has the release date ..., nothing was
  changed") and applied locally; never overwritten, never reported as saved. A `void`/`null`
  return (pre-v2 function, or album not found) is "unknown": the date is read back from `albums`;
  if nothing is stored the user sees an error and the row stays. This makes deploy order safe.
- **After saving:** `useContendersList.setReleaseDateLocal` (with a new `mutationGen`, same scheme
  as `useAotyList`: a refetch that started before a local mutation is dropped), then a silent
  refetch and `useAlbumRatingsSummary.refetch()` (rank is computed within the release year, so
  dating an album changes its rank group). The pinned scope does not move: the emptied "No release
  year" scope stays with its empty state. Toast: "Saved Mar 2024 for ..." with "View 2024"
  (`showAction`). Failure: error toast, dialog and row stay, control re-enabled. The dialog cannot
  be dismissed while the write is in flight.
- **Focus:** cancel/Escape return to the row's button (explicit `finalFocusEl`, because Safari does
  not focus buttons on click). If the row left the view, focus goes to the next row (else the
  heading) from `onExitComplete`, after the dialog has finished closing; doing it earlier is
  overridden by the dialog's own focus restore. The AOTY-add focus effect now watches
  `scopedItems` instead of `items`.
- **`useContendersList` refetch is now silent** after the first load (no spinner, keeps the list on
  failure), like `useAotyList`. This also applies to the existing remove / add-from-Favorites
  refetches, which no longer flash the loading state.
- **Security finding: the RPC was callable without logging in.** `fill_missing_release_date` v1 is
  `SECURITY DEFINER`, validated nothing, and Supabase's default privileges had granted EXECUTE to
  `anon` explicitly, which `revoke ... from public` does not remove. Confirmed 2026-10-04 with a
  no-op call (random uuid, public key only): HTTP 204. So anyone with the public key could fill any
  NULL-dated album with arbitrary text. Fix: `supabase/albums-fill-missing-release-date-v2.sql`
  (run manually, before deploying this code): `auth.uid()` required, `revoke execute ... from
  public, anon`, shape/day/range validation, `returns text`. The SQL header carries a shared sample
  list; `releaseDateSql.test.ts` reads it and the function's regex literal and fails if
  `parseReleaseDate` disagrees (checked by mutating the regex).
- **Favorites:** before this branch its manual date input accepted any non-empty text, and an RPC
  error showed "Could not save release date — try again" (unchanged). It now uses
  `parseReleaseDate`: Confirm stays disabled for an invalid date and the inline error shows after
  blur. This also fixes a crash: typing an impossible date such as 2024-02-30 made the date
  picker's `parseDate` throw during render. The new-album path still inserts `release_date`
  directly (RLS has no column check); see `deferred-work.md`.
- **Not done:** a way to correct a wrong date; a DB CHECK on `release_date`; cleanup of the 3036
  row and the 47 NULLs; dating from the bulk bar or from `/aoty`.
- **Tests/tsc:** baseline 123 files, 1040/1040 on `master`; now 126 files, 1120/1120, `tsc -b`
  clean, touched files lint-clean apart from 2 `react-refresh/only-export-components` warnings
  that were already in `FavoritesPage.tsx`. jsdom cannot show that the input is focused when the
  dialog opens (the focus trap settles on the dialog); that is a manual check.
- **Not live-verified.** Needs the SQL applied and a logged-in check.

### Follow-up (2026-10-04, after the SQL was applied)

- **SQL applied:** Dan applied `supabase/albums-fill-missing-release-date-v2.sql` in the Supabase SQL
  editor (reported 2026-10-04; verified below). Application date is not independently recorded.
- **Verification 1, anonymous call:** the same no-op call as before (public key only, random uuid,
  from Node) now returns HTTP 401, error code 42501. Before the SQL it returned 204.
- **Verification 2, live catalog (architecture-verifier, read-only, the function was not called):**
  exactly one `public.fill_missing_release_date(p_album_id uuid, p_release_date text)` overload, so
  the old void version is gone; return type `text`; `SECURITY DEFINER`; `search_path=""`; live
  `prosrc` byte-identical to the repo file's body, regex literal included; ACL
  `{postgres, authenticated, service_role}`, no PUBLIC entry, `has_function_privilege` false for
  `anon`, true for `authenticated` and `service_role`. Not checked: roles that could inherit
  EXECUTE through membership (`authenticator`, `supabase_auth_admin`), and the function's runtime
  behavior (validation, `auth.uid()` check, return values), since calls were out of scope.
- **Change beyond the original brief 1:** `useContendersList` refetches silently after the first
  load (no spinner, keeps the list on failure). This also applies to the existing remove and
  add-from-Favorites refetches.
- **Change beyond the original brief 2:** the release date dialog cannot be dismissed while a save
  is in flight.
- **Change beyond the original brief 3:** the Favorites date picker crashed on an impossible date
  (typing 2024-02-30 made `parseDate` throw during render). It now seeds the picker only from a
  valid full date.
- **Copy:** the Favorites save error now reads "Could not save release date. Try again." (the
  dash-free form), superseding the "(unchanged)" note above. Other pre-existing error toasts with
  an em-dash in `ContendersPage.tsx` and `FavoritesPage.tsx` were not on lines this branch
  touched and were left as they are.

### Revision (2026-10-04): the button keeps its "Select for AOTY" label

The first pass relabelled an undated row's button "Add release date". Reversed on review: it is
not the right experience. Every Contenders row keeps "Select for AOTY" (and its accessible name,
"Select <band> – <album> for AOTY"); for an undated album the click opens the release date dialog
instead of writing, the same hand-off shape as the not-yet-rated case going to the rating gate.
"No release date yet." stays as the visible reason. The dialog, validation, write and focus
handling are unchanged. Saving the date does not continue into selecting the album (it stays a
Contender in its new year, with a "View <year>" toast); see `deferred-work.md`. This supersedes
the entry-point bullet and the "Add release date" wording above.

### Revision 2 (2026-10-04): saving the date continues into Select for AOTY

Supersedes the "save only" decision (and the revision above, which noted that saving did not
continue). The click was "Select for AOTY", so the dialog now finishes it when it can:

- **Ready to select** (fully rated, score level settled, not stale: the existing
  `isReadyForAoty`): the dialog's button reads "Save and select for AOTY". After the date is
  stored, the album is added to AOTY through the same `addToAoty` upsert as a dated row, in the
  same per-album pending guard. Toast: "Saved Mar 2024 and added <band> – <album> to AOTY." If
  someone else had dated the album first, it is selected with that date and the toast says so.
  The row leaves Contenders; focus handoff is as before.
- **Not ready:** the button reads "Save date" and only the date is saved (toast with "View <year>"
  as before). The next "Select for AOTY" click goes to the rating gate like for any dated album.
  Deliberately not chained into the gate or the rating page right after a date save.
- **Selection fails after the date was stored:** the date stays saved (local state, refetch),
  `addToAoty`'s own error toast shows, and the "Saved ... for ..." toast with "View <year>"
  follows. The row stays in Contenders under its new year, so a second click retries only the
  selection.
- **Date write fails:** nothing is selected.
- Tests: 5 new cases in `ContendersPage.test.tsx` (label with both writes in order, someone
  else's date, selection failure, date-write failure, not ready). Not live-verified.

### Revision 3 (2026-10-04): one shared date picker, `ReleaseDateField`

The dialog needed the calendar the Favorites add-album drawer already had. Instead of copying it,
the field was moved into one component, `src/components/ReleaseDateField.tsx`, now used by both
`AddAlbumDrawer` (Favorites) and `ReleaseDateDialog` (Contenders). Grep before: the Favorites
drawer was the only `DatePicker` use in `src/`, with no shared wrapper.

- **What it is:** the label, the free-text input (`2024`, `2024-03`, `2024-03-15`), the calendar
  button and the inline calendar (day, month, year views), moved over with the markup unchanged
  (inline, no positioner, to avoid Floating UI portal problems in a Drawer or Dialog). Props:
  `value`, `onChange`, `helperText`, `required`, `inputRef`. It owns the open state of the
  calendar and the "left the field" state, so the validation message (from `parseReleaseDate`)
  appears the same way in both places. What a valid value allows (Confirm enabled, Save enabled,
  the preview line) stays with the parent, which calls `parseReleaseDate` itself.
- **Behaviour changes in Favorites:** the calendar is now bounded to 1900-01-01 through 31 Dec of
  next year (derived from the clock, the same range the validation and the database function
  accept), so it can no longer reach a date the field would reject. Picking a day, typing, the
  placeholder, label, helper text and `required` are as before; the 54 existing Favorites tests
  passed unchanged after the move. `FavoritesPage.tsx` lost its `pickerOpen` and
  `manualDateTouched` state and the picker imports. The field unmounts when the lookup result is
  cleared, so its internal state resets where the page used to reset it by hand.
- **Dialog:** picking a day writes the ISO date into the field; the preview line and Save follow
  from it. Year and year-month can still only be typed.
- **Tests:** `ReleaseDateField.test.tsx` (6: label/helper/calendar button, typed text, validation
  only after leaving the field, no crash on `2024-02-30`, picking a day, calendar bounds at both
  ends) plus one dialog-level case. 127 files, 1132/1132, `tsc -b` clean. Not live-verified.
- **Not checkable in jsdom:** whether Escape with the calendar open closes only the calendar or the
  whole dialog, and how the inline calendar looks inside the dialog at phone width.

## 2026-10-05: Select for AOTY readiness and failure handling (`fix/release-date-flow-polish`)

Follows the release date revisions above. Append-only: the older "Entry point" bullet in the
2026-10-04 section ("Add release date" button, disabled "Select for AOTY") is superseded by the
Revision entries (the button keeps its "Select for AOTY" name, the click opens the dialog), and
"Save only" is superseded by Revision 2.

- **Pre-existing bug, fixed here (merged code, not this branch's regression):** readiness
  (`isReadyForAoty`) read an empty ratings summary and the default tier `'none'` as "not ready"
  while those were still loading. An early click on a dated, ready row either did nothing (gate
  still loading: `handleRate` returns on `gateLoading`) or, once the gate had loaded but the
  summary had not, sent a ready album to `/rate/:id`. Bulk showed "0 added" and cleared the
  selection. The release date dialog could label a ready album "Save date".
- **Rule:** readiness is unknown, not "not ready", until both the ratings summary and the
  calibration gate have settled once (`useReadinessKnown`). Settled means `loading` ended, whether
  the fetch succeeded, returned an error, or threw (both hooks now end `loading` on a throw too).
  The flag is sticky, so a later refresh (for example after a date save) never makes it unknown
  again, and it resets on a user id change (known again only after the new data has loaded).
- **While unknown:** a press on a row's "Select for AOTY" (dated) or on the bulk button is ignored
  (no gate, no navigation, no write, selection kept) and the control shows `aria-busy` with reduced
  opacity, no spinner, no `disabled`, so there is no layout shift and focus stays. The busy state
  appears after 150 ms of waiting, or at once when the user pressed during the wait, so a quick
  load never flashes it. Feedback for an early press is that busy state; there is no toast.
- **Dialog:** unknown shows a neutral "Save" with the spinner (`aria-busy`, presses ignored). When
  readiness is known the page decides once ("Save and select for AOTY" or "Save date") and keeps
  it for that dialog instance, even if the data refreshes underneath. The save uses the same
  decision as the label. Only in the not-ready case, and only after settle, one line appears:
  "This album also needs a rating and a settled score level before it can be selected." No change
  to the ready case or to any toast.
- **Bulk with nothing to add:** the toast is only the skipped explanation ("N skipped: not fully
  rated, no release date, or score level not settled."), shown as an error toast, and the
  selection is kept. When something is added the toast and the cleared selection are as before.
  Undated and dated rows cannot be selected together (undated rows exist only in the no-year
  scope), so "all undated" and "mixed ready and not ready, same year" are the two bulk cases.
- **Accessibility:** the row button is `aria-describedby` the visible "No release date yet." text;
  its accessible name is unchanged. The row mounts a desktop and a mobile tree, so each tree has
  its own note id (`extraActions` on `FavoriteListItemRow` may now be a function receiving
  `{ noteId }`).
- **Thrown rejections:** `console.warn` plus the existing error toast, busy flags always reset
  (try/catch/finally; no state set after unmount), in the release date save (rpc, read-back and
  the chained select), `addToAoty` (single, bulk and chained), single remove, bulk remove and bulk
  select. Same gap remains in `AddToContendersPicker`'s insert (other file), see `deferred-work.md`.
- **Tests:** 129 files, 1164/1164 (baseline 127 files, 1132). New: tier none and insufficient data
  with an undated row (including the follow-up click), loading cells, label stable while open,
  hint only after settle, early click on a dated ready row for each hook, bulk (all undated, mixed),
  both row trees, every throw above, `useReadinessKnown` (sticky, account switch, delay),
  `loadingSettles` (error result, rejection and sync throw in each hook; rejection and throw fail
  without the fix). `tsc -b` clean; touched files lint-clean apart from 2 old
  `react-refresh/only-export-components` warnings in `FavoritesPage.tsx`.
- **Not live-verified.** Early-click behavior needs a throttled network to see; jsdom cannot show
  focus or the 150 ms delay in a real browser.

## AOTY hub as tabs (`feature/aoty-tabs`, 2026-10-10)

Ready, not merged. Decision and numbers: `aoty-hub-layout-decision.md`. Code commits on top of
`master` `51c3375` (docs after them), in this order:

1. `8629b83` members derived from the Contenders pool (cherry-pick of `4319215`).
2. `a86dfbb` permanent 64px Contenders bulk bar and focus to the first remaining row (`4b80c4f`);
   the bar gets `effectiveSelectedIds.size`.
3. `03bee40` `hideGenres` prop on `FavoriteListItemRow` (default false; Favorites and the picker
   preview unchanged).
4. `89bd5a0` `AotyHub`, one component for both routes, behaviour parity: the existing page tests
   ran unmodified. Not carried over from the frozen hub: two columns, `useMediaQuery`, stacked rows,
   the error-state "Try again" and the hooks' `retry`.
5. `d2072f5` the hub passes `hideGenres` to both lists.
6. `a56acac` tabs UI and `?view=`.
7. `eb63721` `/aoty/contenders` redirects, `?from=contenders` consumers remapped.

- **View.** A forced `screen` prop wins, then a valid `?view`, else AOTY. A tab click writes
  `view` with `replace` and keeps the other params (`year`, `from`); `view` is not written on load.
- **Panel.** Outline Tabs like `CalibrationPageHeader`; the active tab's `Tabs.Content` only (so the
  `tabpanel` is labelled by its tab). Full frame and `minH` 640 from `md`; below `md` only the 2px
  top border, no side padding, because a framed panel left a 299px row and the footer wrapped (343px
  fits, 332px is the minimum).
- **Selection** is stored as `{key, ids}` with key `view|scope` and ignored under another key; the
  tab and year handlers also drop the record. A URL-driven round trip (Header link, then browser
  Back) can bring a selection back; harmless, every action goes through `effectiveSelectedIds`.
- **Dialogs.** The release-date and gate dialogs belong to the Contenders tab. A tab change that
  does not come from the page (browser Back) closes them by a render-phase reset, and they do not
  reopen on return.
- **Focus.** After promote, Back to Contenders and bulk add, focus goes to the next row, else the
  active tab trigger (not a heading).
- **Empty AOTY tab.** "No AOTY picks yet." with "Choose albums from the Contenders tab.", or "Add
  albums to Contenders first, then choose from them here." when both lists are empty, and a "Go to
  Contenders" button. The year-scoped empty state ("No AOTY picks in 2024.") gets the same
  description and button.
- **Redirect and links.** `AotyContendersRedirect` (its own file, because `main.tsx` has startup side
  effects) keeps the whole search and sets `view`, with `replace`. The rating page and calibration
  breadcrumbs return to `/aoty?view=contenders` (no year; none was carried before). The rating page's
  source map moved to `src/lib/navigation/ratingFromSources.ts` (unplanned, to test it without a new
  `react-refresh` warning).
- **Reads.** 9 per route on `master`, 8 with the hub, guarded by `AotyHubReads.test.tsx`.
- **Tests.** Plain `npx vitest run`: 77 files, 756 tests (`master`: 72 files, 718). Existing tests
  changed: `AotyPage.test.tsx` 4 (empty state button, description text, tab click with `waitFor`,
  focus on the active tab), `ContendersPage.test.tsx` 3 (two focus tests, the scope test),
  `AotyHub.test.tsx` 2 (path test, route-switch test). Lint: 1532 errors, 486 warnings, the same as
  `master` apart from one warning less in `main.tsx`.
- **Not live-verified.** Images are from a harness with mocked hooks; the logged-in pass is Dan's.
