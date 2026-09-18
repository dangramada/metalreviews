# Album Identity — summary & index

## What this is

"Album identity" is how this codebase resolves a scraped review (or a manually-added
favorite) to a single row in the `albums` table, instead of creating a new row per source.
Before this work, an album was identified only by band+album name, so two sources reviewing
the same album silently collided or overwrote each other's data. The fix introduces a
dedicated `albums` table with a dual-key identity strategy and merges enrichment data
(artwork, genres, release date, MusicBrainz release-group id) across sources onto the same
row rather than duplicating it.

## Current status

**Shipped and live in production:** the dual-key identity strategy —
`mb_release_group_id` checked first (when a fresh MusicBrainz lookup resolved one), falling
back to `norm_key` (a diacritic-folded, punctuation-collapsed band+album string) — is what
`resolveAlbumIdentity()` in `scripts/ingest.ts` and `findExistingAlbum()` in the
`/favorites` manual-add flow both use today. The `albums` table migration, ingest-pipeline
rewrite, and both frontend sessions (home page multi-source display, `/favorites` dedup) are
complete and verified.

**Two deferred items, named here rather than left only to `deferred-work.md`:**
- **Admin merge tooling for manual album dedup** — select two `albums` rows, reassign
  `reviews`/`favorites` foreign keys onto one, delete the loser. Named only, not scheduled.
  `album-identity-decisions.md` §5 Layer 2.
- **Live MusicBrainz autocomplete on `AddAlbumDrawer`** — debounced search-as-you-type on
  manual album add, Layer 1 of the duplicate-prevention design (currently only Layer 2's
  post-submit `findExistingAlbum()` check runs). `album-identity-decisions.md` §5 /
  `album-identity-frontend-favorites.md`.

**Confirmed open bug, diagnosed 2026-09-18:** Step A's search
(`artist:"{band}" AND release:"{album}"`) can match two genuinely different real works sharing
a title (e.g. Khemmis's self-titled 2013 EP vs. self-titled 2026 album) — `releases[0]`'s
arbitrary pick then attaches the wrong work's data. 29 of 320 albums currently have more than
one candidate release-group; Khemmis and Moonspell manually confirmed broken and corrected the
same day (step 1 of 2), the other 27 unconfirmed. A currently-enriched row also silently blocks
any future re-check via `norm_key` alone, regardless of `mb_release_group_id` — fixing that
(step 2) is scoped but not started. See `album-identity-same-title-release-group-collision.md`
for the full list, merge-risk analysis, and correction detail. Still blocks resuming the Metal
Storm back-catalogue exclusion filter.

## Index (pipeline order)

1. `album-identity-diagnosis.md` — diagnostic: `computeId` collision, confirmed data loss
2. `album-identity-decisions.md` — design decisions: album+source dedup, dual-key identity
   strategy
3. `album-identity-migration.md` — schema + data migration: `albums` table, backfill;
   branch merged to `master` 2026-07-15
4. `album-identity-ingest.md` — ingest-pipeline session: `resolveAlbumIdentity`, `computeId`
   deleted
5. `album-identity-frontend-homepage.md` — home-page session: multi-source display,
   `dbMapping.ts`
6. `album-identity-frontend-favorites.md` — `/favorites` session: `useFavoritesList`
   re-plumb, `findExistingAlbum`
7. `album-identity-visibility-and-duplicate-fix.md` — home-page visibility filter +
   duplicate-check fixes
8. `album-identity/album-identity-same-title-release-group-collision.md` — diagnostic
   (read-only): same-title, different-real-work release-group collisions; 29/320 albums
   flagged; blocks the Metal Storm back-catalogue exclusion filter
