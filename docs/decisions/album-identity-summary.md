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

**Confirmed bug, diagnosed 2026-09-18, now mostly resolved:** Step A's search
(`artist:"{band}" AND release:"{album}"`) can match two genuinely different real works sharing
a title (e.g. Khemmis's self-titled 2013 EP vs. self-titled 2026 album) — `releases[0]`'s
arbitrary pick then attaches the wrong work's data. Of the 29 flagged pairs: **9 corrected/
confirmed-broken-and-fixed by hand** (Khemmis, Moonspell, Yes, Shadowborne, Elder, Black Veil
Brides, Haken, Cancer Bats, Flotsam and Jetsam), **3 confirmed already correct** (Devin
Townsend, Wormwood, Stormhammer — the last also confirmed protected against future drift), 1
(Sun Guts) deliberately left alone with its correct target noted, **8 auto-verified low-risk**,
**3 flagged for a possible future look** (Green Lung, Opeth, Beseech — no live defect, just
visibly different candidate art), and 5 not comparable either way. The
`isAlbumEnriched()`-widening fix (step 2b-i, both re-fetch paths now excluded via
`FLAGGED_SAME_TITLE_COLLISION_NORM_KEYS`) is shipped. What's still open: whether to act on the
3 flagged pairs (step 2b-ii). See
`album-identity/album-identity-same-title-release-group-collision.md` for the full list,
merge-risk analysis, and correction detail. Still blocks resuming the Metal Storm
back-catalogue exclusion filter (though a fresh cross-check found 0 overlap between that
filter's currently-hidden reviews and these 29 pairs).

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
8. `album-identity/album-identity-same-title-release-group-collision.md` — same-title,
   different-real-work release-group collisions: 29/320 albums flagged, 9 corrected, 3
   confirmed-safe, 3 flagged for a possible future look, rest cleared; `isAlbumEnriched()`
   widened (step 2b-i) to guard both re-fetch paths; blocks the Metal Storm back-catalogue
   exclusion filter
