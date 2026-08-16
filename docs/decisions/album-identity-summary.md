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
