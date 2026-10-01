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
  stays in Contenders marked "In AOTY". Remove from AOTY deletes the `aoty` row only.
- NULL date: no user path exists from Contenders (see `deferred-work.md`), so the row shows the
  visible status text "No release date yet." and a disabled button.
- Cascade: removing a Contender that is in AOTY also drops its AOTY row. The single-remove dialog
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
- **Tests/tsc:** no code files changed; suite (959) and `tsc -b` not re-run.
