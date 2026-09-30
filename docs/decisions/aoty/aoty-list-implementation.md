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

### Rank presentation (provisional)
Plain "#N" text prefix with `aria-label="Rank N"`, existing tokens, on `FavoriteListItemRow`'s new
optional `rank` prop (plus `note`, `extraActions`, `removeNote`, all additive). No visual design
exists for it. `RatingSlab` `high` is not reusable.

### Deviations from the discovery concept, logged
- No persistent mobile badge header.
- "AOTY →" on Contenders instead of a "Done →" action.

### Not in this pass / not done
- No backfill of Contenders for already-rated albums (1 of 15 at the time of writing).
- Desktop two-column layout, public share page, manual reordering, multi-list, Favorites renaming.
- Real-device screen-reader check of the new rank text.

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
