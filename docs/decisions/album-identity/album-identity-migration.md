# Album-identity schema migration (July 2026)

Implements the design in `album-identity-decisions.md`, following `album-identity-diagnosis.md`'s confirmed finding that `computeId` (band+album only, no source) silently loses reviews when two sources cover the same album. Schema + one-time data migration only — does not touch `ingest.ts`/`computeId` (ingest-pipeline session) or the frontend (frontend session), both deferred to separate later sessions per the four-session plan.

Rollback point: git tag `pre-album-identity-migration` (tags the `master` commit immediately before this work started).

## What NOT to change (carried forward from the brief)

- `reviews.id` (existing `text` primary key, the buggy `computeId` output) is **untouched** — `favorites.review_id` still references it, and `scripts/ingest.ts`'s upsert (`onConflict: 'id'`) still needs it until the ingest-pipeline session replaces `computeId`. The new `unique(album_id, source)` constraint is additive, not a replacement.
- No MusicBrainz lookups performed. `mb_release_group_id` is NULL on all 136 `albums` rows created by this migration — confirmed, not attempted.
- No historical score/data correction. Rows carrying misattributed scores from the diagnosed bug were migrated structurally as-is.
- `favorites.review_id` was **not** dropped during the main migration — left in place pending a future explicit go-ahead (Dan deferred this at the second checkpoint). `supabase/favorites-drop-review-id.sql` was written on a later, separate request; as of this writing it has been handed over but not yet confirmed run.
- `manual_albums` itself is unchanged — no `album_id` column was added to it. This migration only used it as a *source* for backfilling `albums` (checking for norm_key matches to avoid duplicate album rows); the brief did not ask for a `manual_albums` -> `albums` foreign key.

## `norm_key` normalization

No existing helper matched what the brief asked for (diacritic folding + punctuation collapsing) — grepped first, confirmed none existed (`normalizeScore()` is numeric/unrelated; `computeId`'s lowercase+strip-whitespace is the buggy behavior being replaced). New pure function: `scripts/normalizeKey.ts` — `computeNormKey(band, album)`. Punctuation is replaced with a space, not deleted, so words don't glue together (`"St.Louis"` -> `"st louis"`, not `"stlouis"`). 6 unit tests in `scripts/__tests__/normalizeKey.test.ts` (diacritics, punctuation variants, case/whitespace, empty strings). Intended for reuse by the ingest-pipeline session's `norm_key` fallback match (per `album-identity-decisions.md` §4) — do not write a second implementation there.

## Step 1 — `albums` table

`supabase/albums.sql`, applied by Dan in the Supabase SQL editor (no automated migration runner or direct Postgres connection exists in this repo — DDL is always applied manually, matching the `manual_albums.sql` precedent). Schema exactly as specified in the brief. RLS: enabled, single public-read policy (`select using (true)`) since the dashboard is unauthenticated; no anon write policy — writes go through the service-role client only, matching how `reviews` is written today.

## Step 2 — backfill `albums` (checkpoint 1, actual counts)

Script: `scripts/migrations/2026-07-album-identity-backfill-albums.ts`.

- `reviews` rows read at run time: **133** (grew from the 126 seen during initial scoping — normal drift on a live table)
- Legacy `computeId` groups with >1 row: **0** — confirmed the brief's assumption (at most one review row per band+album today)
- Distinct `norm_key` groups from `reviews`: **133** — i.e. the stricter normalization did not surface any *additional* collisions beyond what the diagnosis already found (those were already collapsed to single rows by the existing bug, so each now maps 1:1 to its own `albums` row)
- `manual_albums` rows read: **3**
- Matched an existing album (skipped, no duplicate row created): **0**
- New `albums` rows created from `manual_albums`: **3**
- **Total `albums` rows: 136** (133 + 3), verified via a fresh `select count(*)` after insert (not just the script's own tally)

`band`/`album`/`artwork_url`/`genre`/`release_date` on each reviews-derived `albums` row: taken from the group's rows sorted by `id`, first non-empty value wins per field (same fallback philosophy as `applyMergeGuard`, applied across a group rather than existing-vs-fresh). Since every group had exactly one row (no collisions), this tie-break logic never actually had to choose between competing values in this run — documented for when the ingest-pipeline session starts creating real multi-row groups.

## Step 3 — `reviews` restructure

Files, in dependency order: `supabase/reviews-add-album-id.sql` (nullable column) -> `scripts/migrations/2026-07-album-identity-populate-reviews.ts` (population) -> `supabase/reviews-finalize.sql` (NOT NULL, new unique constraint, column drops). The brief lists "drop columns / change constraint" before "populate" — resequenced here for correctness (can't add `NOT NULL` or a new `UNIQUE` constraint against an all-NULL column); scope unchanged.

Population result: 133/133 rows matched and updated, **0** remaining NULLs, verified before `reviews-finalize.sql` was handed over.

`reviews-finalize.sql` result: `album_id` set `NOT NULL`, `unique (album_id, source)` constraint added, `artwork_url`/`genre`/`release_date` dropped from `reviews`.

**Confirmed and accepted consequence:** dropping those three columns breaks `scripts/ingest.ts` (writes them on every upsert) and the frontend (reads them directly off `reviews` rows) until the ingest-pipeline and frontend sessions land. This is why the branch is not merged to `master` yet.

## Step 4 — `favorites` remap (checkpoint 2, actual counts)

Files: `supabase/favorites-add-album-id.sql` (nullable column) -> `scripts/migrations/2026-07-album-identity-populate-favorites.ts` (population + dedup).

- `favorites` rows read at run time: **5** (was 6 during initial scoping — live-data drift, not a migration artifact)
- `album_id` populated on: **5/5**
- `(user_id, album_id)` collisions found: **0** — no duplicate favorites to collapse, no rows deleted

Final row counts after step 4: `reviews` 133, `favorites` 5, `albums` 136.

`favorites.review_id` was intentionally **not** dropped — Dan deferred that decision at the checkpoint. Do not drop it without a fresh explicit go-ahead.

## Verification performed

- `npx vitest run scripts/__tests__/normalizeKey.test.ts` — 6/6 passing
- Every row count above was re-queried via a fresh `select count(*)` after each write, not taken from the migration scripts' own running tallies
- `reviews.album_id IS NULL` count checked and confirmed zero before `reviews-finalize.sql` was applied
