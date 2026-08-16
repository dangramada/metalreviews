# Album-identity ingest-pipeline update (July 2026)

Implements the ingest-pipeline session from the four-session plan in
`docs/decisions/album-identity-decisions.md` §"Where this leaves the sequencing", following
the schema migration in `docs/decisions/album-identity-migration.md`. That migration dropped
`artwork_url`/`genre`/`release_date` from `reviews` (moved to the new `albums` table) and added
`reviews.album_id` + `unique(album_id, source)` — which broke `scripts/ingest.ts` against the
live schema until this session.

## Orientation findings (before any code was written)

- **`computeId`** (band+album only, no source) was doing triple duty: rating-fetch skip key,
  MB-lookup skip key, and row identity/upsert-conflict target. All three needed re-deriving —
  confirmed by grepping every call site before touching anything.
- **`favorites.review_id`** — queried the live table directly rather than trusting either doc
  (the migration doc and Dan's later confirmation disagreed on paper): confirmed gone. A live
  row is `{ user_id, created_at, album_id }` only.
- **`albums.genre` "malformed" sample** — the JSON-stringified-array sample Dan pasted was
  **not reproducible** against a direct query of all 136 rows (all return genuine native
  arrays via the Supabase client). Treated as a one-off display/tool artifact, not a real data
  problem — no cleanup pass was needed or done.
- **`albums.artwork_url` convention** — all 105 non-null existing rows store the bare
  `coverartarchive.org/release/<mbid>/<file>.jpg` URL, not a `-500.jpg` thumbnail. Checked
  against `docs/decisions/artwork.md`: this is correct, not a bug. Storage keeps full
  resolution; the `-500` thumbnail transform happens client-side at render time
  (`toThumbnailUrl()` in `App.tsx`). `musicbrainz.ts` already stored URLs this way and needed
  no change here.
- **MB release-group id availability** — confirmed via a live MusicBrainz API call that the
  default release-search response already includes `release-group.id`, at no extra
  request/rate-limit cost. `musicbrainz.ts` was extended rather than adding a second lookup.

## What changed in `scripts/ingest.ts`

### Identity resolution (`resolveAlbumIdentity`)

New pure, exported function implementing the dual-key strategy from
`album-identity-decisions.md` §4: `mb_release_group_id` checked first when a fresh MusicBrainz
lookup resolves one, `norm_key` (via the existing `computeNormKey()` from
`scripts/normalizeKey.ts` — not reimplemented) as the fallback only when MB fails or is skipped.
Branches:

1. MB resolves a release-group id that matches an existing album → attach.
2. MB resolves a release-group id with no existing match, but `norm_key` matches an existing
   album whose `mb_release_group_id` is still null → attach **and backfill** the id onto that
   row (the opportunistic, non-bulk mechanism described in the decisions doc).
3. MB resolves a release-group id with no match at all → create a new album.
4. MB lookup was skipped or found nothing, `norm_key` matches → attach, no backfill possible.
5. MB lookup was skipped or found nothing, `norm_key` has no match → create a new album.

All five branches have dedicated unit tests in `src/__tests__/resolveAlbumIdentity.test.ts`,
plus one extra case (an edition-variant album, e.g. "Circadian Promise" vs "Circadian Promise
(Deluxe Edition)") confirming an mb-id match wins even when it was found via a *different*
album's norm_key than the one just computed for the current item.

**Live-sample confirmation** (read-only, no writes — 3 real AMG RSS items run through the real
function against the real `albums` table):

- Brand-new album ("Stormhammer — Wrath of the Hammer"): MB resolved a release-group id, no
  existing match by id or norm_key → new album created correctly.
- Existing norm_key match, MB found nothing ("Yer Metal Is Olde: Stratovarius — Episode" — a
  real AMG title-formatting oddity): attached to the existing album, no duplicate created.
- Existing norm_key match, MB *did* resolve an id this time ("Spread the Disease — The
  Darkness. The Dread. The Suffering."): attached to the existing album **and**
  `mb_release_group_id` was backfilled — the opportunistic path firing for real, live proof it
  triggers correctly.

### `mb_release_group_id` coverage will stay sparse without a future bulk pass — stated plainly

This is a deliberate design consequence, not an oversight, and it is easy to later mistake for
"already handled" if it isn't called out on its own:

The MB call is only made when a norm_key-matched album is **not yet fully enriched**
(`isAlbumEnriched` — missing artwork, genre, or release_date). Once an album has all three
fields, `needMbCall` is false and the pipeline never calls MusicBrainz for it again on its own —
which means it also never gets another chance to backfill `mb_release_group_id`, since that
backfill only happens as a side effect of a call that was going to happen anyway for enrichment
reasons. An album that reached full enrichment before MB ever resolved its release-group id
(e.g. it was manually added with artwork/genre/date already filled in, or CAA/MB indexed it
between separate ingest runs before a second source reviewed it) will very likely keep
`mb_release_group_id = null` **indefinitely** under this design.

The opportunistic path only fires in two situations: a second source reviews an
*incompletely-enriched* album (triggers a fresh MB call, which may resolve the id), or the
periodic backfill pass picks up an album that's still incomplete. Neither converges toward full
coverage over time — they only catch albums that happen to still be missing artwork/genre/date
for unrelated reasons. This session **avoids making the `mb_release_group_id` coverage gap
worse** (it's the correct, priority-ordered mechanism whenever a lookup does happen), but it
does **not close the gap** on already-enriched albums. A future bulk enrichment pass (explicitly
out of scope for this session, per the brief) is the only way to raise coverage beyond whatever
opportunistic hits land by chance. Do not read the presence of `resolveAlbumIdentity`'s
backfill branch as "the coverage problem is solved" — it solves correctness (no duplicate
albums, no wrong-source overwrites), not coverage.

### Review identity → `(album_id, source)`

`existingReviewByAlbumSource: Map<`${album_id}::${source}`, ExistingReviewRow>` (built once,
up front, from the real `reviews` columns) replaces `computeId` as the "does this review exist"
check. A hit is treated as an update-in-place (reuses the existing row's `id` — e.g. a score
correction on the source's end); a miss is a new row (fresh `randomUUID()` id). A single album
can now correctly hold up to three `reviews` rows, one per source — not a bug case.

**What `reviews.id` still does, concretely**: it remains a `NOT NULL` PK column (schema
unchanged) and is still the `onConflict` target for the Supabase upsert call, for mechanical
reasons only — Supabase's upsert needs *some* unique-constraint target, and reusing the
already-resolved existing id (or generating a fresh random one) trivially satisfies that.
Nothing in the file reads or branches on `reviews.id`'s *value* to decide identity anymore —
that decision is fully made by the `(album_id, source)` map lookup before an id is ever
touched. `computeId()` itself was deleted; nothing calls it.

### Skip-set logic, re-derived (restructuring beyond a 1:1 port)

The old `ratingAlreadyFetched` / `mbAlreadyFetched` sets (both keyed by the buggy band+album-only
`computeId`, sourced from *all* existing reviews regardless of source — this conflation is
exactly the diagnosed collision mechanism) are gone. Replaced by two independently-scoped
mechanisms:

- **Rating-fetch skip** (per source, no network cost): `scoreByNormKeyForSource(source)` builds
  a `norm_key -> score` map filtered to that one source's existing reviews (joined through each
  review's album to get its `norm_key`). Fully decoupled from MusicBrainz — this fixes the
  cross-source collision bug with zero added MB calls, since it never needed MB in the first
  place.
- **MB-call skip** (`needMbCall` in the main loop): skipped only when a `norm_key` match exists
  **and** is already fully enriched. This is a judgment call flagged rather than silently
  decided: `album-identity-decisions.md` §4 says "check mb_release_group_id first, always" for
  *resolution order when a lookup happens* — it was not read as a mandate to force an MB call on
  every single review on every run regardless of known state, which would defeat the whole
  point of the original skip-set (MB's 1 req/sec limit). See the coverage-gap note above for the
  direct consequence of this choice.

### Enrichment merge-guard retargeted (`applyAlbumEnrichment`)

The old `applyMergeGuard` reconciled the *entire* existing-reviews table against the *entire*
fresh-fetched set on every run, because `artwork_url`/`genre`/`release_date` lived on `reviews`
and needed non-regression protection across runs for every row, touched or not. Now that those
fields live on `albums`, that whole-table reconstruction is no longer needed at all — `reviews`
rows not touched by this run's RSS fetch or backfill pass are simply left alone (not
re-uploaded), which is both simpler and strictly fewer writes than before.

`applyAlbumEnrichment(existing: AlbumRow, fresh: MusicBrainzData): AlbumRow` keeps the same
non-regression philosophy (fresh artwork/genre only overwrite when non-empty; release_date uses
the same precision-aware rule as before — a coarser fresh value never overwrites a finer stored
one), just called once per resolved album instead of once per whole-table run.

### Backfill pass re-derived to album granularity (`selectAlbumBackfillCandidates`)

The old `selectBackfillCandidates` operated on individual reviews, since enrichment
completeness and the `mb_lookup_attempts` retry counter both lived on `reviews`. Enrichment
completeness moved to `albums`; **`mb_lookup_attempts` did not** — no new column/migration was
added this session (judged unnecessary; see below), so the counter still lives per-review.

This creates a granularity mismatch (attempts tracked per-review, eligibility now needed at
album level, and up to 3 reviews can share one album) that the brief anticipated
("report back if this requires restructuring more than expected"). Resolution: a candidate
album's eligibility is **OR'd across all its attached reviews** — the album is still eligible as
long as at least one attached review hasn't exhausted its own cap (`attempts >= 5 AND older than
14 days`), so an older source's exhausted budget doesn't block a newer source's fresher one. On a
successful backfill attempt, every review attached to that album gets its `mb_lookup_attempts`
incremented by 1, keeping the counters synchronized as a de facto album-level proxy. Considered
adding `albums.mb_lookup_attempts` instead (would remove the aggregation entirely) but decided
against a schema change for this one counter, given the OR-aggregation is simple and correct;
revisit if the two-column split ever causes an observed problem.

## Definition of done — status

- [x] Step 0 orientation reported and reviewed before proceeding
- [x] MB release-group lookup implemented (extended `musicbrainz.ts`, not duplicated), checked
      before `norm_key` fallback, never the reverse
- [x] Opportunistic `mb_release_group_id` backfill happens naturally inside
      `resolveAlbumIdentity`, confirmed live against real data — not a bulk operation
- [x] `reviews` uniqueness in code reflects `(album_id, source)`, not `computeId` (deleted)
- [x] Skip-set logic re-derived and reported (see above), not assumed to transfer as-is
- [x] Artwork/genre/release-date write to `albums` (new, via `resolveAlbumIdentity`) or respect
      merge-guard non-regression (existing, via `applyAlbumEnrichment`)
- [x] Full existing test suite green (148/148, 20 files) + new tests for all 5 identity branches
- [x] This doc; `CLAUDE.md` index + architecture section updated to match
- [x] Continued on `album-identity-migration` branch, confirmed via `git branch --show-current`
      before starting — not yet merged to `master`

## What this session did NOT do (unchanged from the brief's scope)

- Frontend (`src/App.tsx`, card components, `useFavoritesList`, `AddAlbumDrawer`) — untouched.
  Note for that session: `src/dbMapping.ts` (`DbRow`/`fromDbRow`) still describes the
  *pre-migration* `reviews` shape (still has `artwork_url`/`genre`/`release_date`, no
  `album_id`) — deliberately left alone this session since it's the frontend's shared boundary
  type, but it needs updating before the frontend can read real data again.
- `manual_albums` UI/admin tooling — untouched.
- Retroactive/bulk `mb_release_group_id` sweep — not performed; see the coverage-gap section
  above for why this session doesn't (and by design can't) close that gap on its own.
- `scripts/seed-from-json.ts` — a pre-Supabase-migration relic that imports `toDbRow` from
  `ingest.ts`. It was already broken by the schema migration (writes columns `reviews` no
  longer has) before this session started. `toDbRow`/`DbRow` were kept as a vestigial,
  functioning-in-isolation export purely so this script's import doesn't newly fail — it is not
  wired into `runIngestion()` and was not otherwise fixed, since it wasn't in scope.
