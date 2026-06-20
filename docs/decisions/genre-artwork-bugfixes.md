# Session decisions — Genre coverage + artwork regression fixes (June 2026)

## RSS title pollution (root cause of all three bugs below)

Both AMG and The Progressive Subway embed review-site boilerplate in their RSS `<title>` fields:

- **AMG**: `"Band – Album Review"` or `"Band – Album EP Review"` — trailing ` Review` suffix on the album portion.
- **PS**: `"Review: Band – Album"` — leading `Review: ` prefix before the band name.

`extractBandAlbum` was called on the raw title, so the boilerplate ended up stored in `reviews.json` (`album: "Ritual of the Cloven Hoof Review"`, `band: "Review: Cellar Noise"`). This broke MusicBrainz lookups (quoted Lucene search couldn't match the real release/artist) and polluted the display names shown on cards.

**Fix — parse time (primary):**
- `fetchAngryMetalGuy`: strips trailing ` Review` / ` EP Review` from `item.title` before passing to `extractBandAlbum`.
- `fetchProgressiveSubway`: strips leading `Review: ` from `item.title` before passing to `extractBandAlbum`.

**Fix — MB search (safety net):**
- `fetchMusicBrainzData` also strips both patterns from its `band` / `album` arguments (`bandForSearch`, `albumForSearch`) so a future source with similar boilerplate won't silently produce empty results.

**Data cleanup:** Entries already stored in `reviews.json` with polluted band/album names got different `computeId` hashes than the corrected names, so they were removed from the file manually. They are re-fetched clean on the next ingest run.

**Reminder for future sources:** when adding a new scraper source (see root `CLAUDE.md`), check its RSS `<title>` field for site-specific boilerplate before wiring up `extractBandAlbum`. This exact bug pattern has hit two sources already.

## Bug 1: AMG / Progressive Subway reviews getting `genre: []`

**Root cause:** MB search failed on polluted titles (see above) → `fetchMusicBrainzData` returned `genres: []`. Additionally, `mbAlreadyFetched` condition `Array.isArray(r.genre)` evaluated `true` for `[]`, so once an empty array was stored, that review was permanently skipped and never retried.

**Fix:**
- Title pollution fix above makes MB searches succeed.
- Changed `mbAlreadyFetched` to require `r.genre.length > 0` in addition to `Array.isArray(r.genre)`, so reviews stuck with `genre: []` are retried on the next run.

## Bug 3: Reviews with `artworkUrl: null` permanently skipped even when artwork exists

**Root cause:** `mbAlreadyFetched` used `r.artworkUrl !== undefined` as the artwork check. `null !== undefined` is `true`, so a review with `artworkUrl: null` (MB was tried, CAA returned nothing) and a non-empty genre list was treated as fully fetched and never retried — even though CAA coverage improves over time.

**Fix:** Changed condition to `typeof r.artworkUrl === 'string'`, which is only true for actual URL strings. Reviews with `artworkUrl: null` are now retried on every ingest run until artwork is found.

## Bug 2: Artwork regression (artworkUrl going null on existing reviews)

**Root cause:** Same MB search failure → `fetchMusicBrainzData` returned `artworkUrl: null`. The old upsert loop (`merged.set(review.id, review)`) blindly overwrote previously-good `artworkUrl` values with `null`.

**Fix:** Merge guard added to the upsert loop (`scripts/ingest.ts`):
- `artworkUrl`: prefer fresh value; fall back to existing if fresh is null.
- `genre`: prefer fresh if non-empty; otherwise keep existing (never regress from a non-empty genre list to `[]`).

This means a transient MB failure (network, rate limit, lookup miss) can no longer erase data already stored. (At the time this fix was written, the store was still `reviews.json`; the same guard logic was carried over to Supabase — see `docs/decisions/supabase-migration.md`, `applyMergeGuard`.)
