# Album-identity frontend update — home page (July 2026)

Implements the frontend session from the four-session plan in
`album-identity-decisions.md` §"Where this leaves the sequencing", scoped strictly to the
home page / dashboard grid, following the schema migration (`album-identity-migration.md`)
and ingest-pipeline update (`album-identity-ingest.md`). Those two sessions moved
`artwork_url`/`genre`/`release_date` off `reviews` onto `albums`, and moved `favorites` from
`review_id` to `album_id` — both of which had left the home page reading a schema that no
longer exists. `/favorites`, `AddAlbumDrawer`, `useFavoritesList`, and `manual_albums` are
untouched — still on old, stale logic, a known and accepted gap for a future session.

> **PARTIALLY SUPERSEDED by its own later section below.** The one-review-per-album placeholder
> rule was replaced by a multi-source display treatment — see the "Superseded" and "Bugfix"
> sections later in this file for what changed and why.

## Orientation findings (before any code was written)

- `src/dbMapping.ts` was exactly as stale as the ingest session's doc flagged: `DbRow`/
  `fromDbRow` still described the pre-migration flat `reviews` shape (`artwork_url`/`genre`/
  `release_date` directly on it, no `album_id`).
- `src/App.tsx` queried Supabase directly (no data-fetching hook) in two places: the initial
  `useEffect` load, and the post-refresh reload inside `handleRefresh`'s poll loop. Both did
  `supabase.from('reviews').select('*').order('published_at', ...)`.
- Favorites hydration/toggle also queried Supabase directly in `App.tsx`, keyed by
  `favorites.review_id` (three call sites: hydration select, delete-eq, insert).
- `src/hooks/useFavoritesList.ts` (used only by `/favorites`, out of scope) also depends on
  the old `DbRow` shape and old `favorites.review_id` column — already broken by the schema
  migration, left broken on purpose per the brief.

## The one-review-per-album placeholder rule

An album can now have zero, one, two, or three attached `reviews` rows. The card component
isn't being redesigned this session — the multi-source badge/average display treatment
described in `album-identity-decisions.md` §3 is a **deferred, separate design decision, not
made yet**. This session picks exactly one review to represent the album on the card, as an
explicitly temporary stopgap:

**Rule: highest `normalized_score` wins; ties (including two/three reviews all missing a
score) are broken alphabetically by source name.**

Implemented in `pickRepresentativeReview()` in `src/dbMapping.ts`. Chosen because it's fully
deterministic regardless of row/query order (unlike "first in the array" or "most recently
fetched"), and needs no new column or extra query. It is explicitly **not** an editorial
ranking of sources — `album-identity-decisions.md` §3 already rejected fixed source-priority
ranking outright; this rule only ever looks at scores, never at which source they came from,
except as a last-resort tiebreak. When the real multi-source display design lands, this
function and its single call site are the only things that need to change.

Live-verified consequence: as of this session, the live `reviews` table has **zero** albums
with more than one attached review (the historical `computeId` bug meant only one review ever
survived per album; the ingest-pipeline session that would start creating genuine multi-review
albums hasn't re-run against overlapping sources yet). The tie-break path is therefore
exercised only by the new component test (`App.favorites.test.tsx`, mocked), not by live data
— noted here so a future session doesn't mistake "no live examples yet" for "this path is
unused."

## What changed in `src/dbMapping.ts`

Old `DbRow`/`fromDbRow` (the flat pre-migration shape) are **kept, byte-for-byte, untouched**.
Two call sites still depend on that exact shape and are out of scope for this session:
`scripts/ingest.ts`'s vestigial `toDbRow()` (kept alive only for `scripts/seed-from-json.ts`,
already broken by the schema migration itself) and `src/hooks/useFavoritesList.ts` (the
`/favorites` page). Changing `DbRow` would have broken both typechecks for no reason — new
types were added alongside instead of replacing the old ones.

New, added:

- `NestedReviewRow` — mirrors one `reviews` row as returned nested under its parent album via
  Supabase/PostgREST embedding (no `artwork_url`/`genre`/`release_date` — those live on the
  album now).
- `AlbumWithReviewsRow` — mirrors an `albums` row with `reviews: NestedReviewRow[]` embedded.
- `AlbumCard` — the per-card shape the home page actually renders: album-level fields
  (`albumId`, `band`, `album`, `genre`, `artworkUrl`, `releaseDate`) plus the representative
  review's fields (`source`, `score`, `normalizedScore`, `summary`, `url`, `publishedAt`,
  `publishedDate`), all empty/zero when the album has no reviews at all.
- `fromAlbumWithReviews(row): AlbumCard` — the new mapping function, replacing `fromDbRow` as
  the home page's boundary function. `publishedAt` falls back to the album's `created_at` when
  there's no review to source a date from, so date-sort still places a zero-review album
  somewhere sensible instead of computing `Invalid Date`.

## What changed in `src/App.tsx`

- Both Supabase queries (initial load, post-refresh reload) now read
  `supabase.from('albums').select(ALBUMS_WITH_REVIEWS_SELECT).order('created_at', ...)`, where
  `ALBUMS_WITH_REVIEWS_SELECT` is a shared module-level constant embedding `reviews(...)` —
  this is a **left join**: albums with zero attached reviews still come back, with
  `reviews: []`, which is exactly what surfaces manually-added albums on the home page (a case
  that didn't structurally exist before this migration).
- The local `Review` interface (previously a hand-duplicated mirror of `MetalReview`) is now
  just `type Review = AlbumCard`, imported from `dbMapping.ts`. Removes a second hand-written
  copy of the same shape; every existing `rev: Review` usage in the file kept working
  unchanged since the field names line up (`band`, `album`, `genre`, `artworkUrl`,
  `releaseDate`, `score`, `summary`, `url`, `publishedAt`, `publishedDate`,
  `normalizedScore`) — only `id` became `albumId`.
- Favorites hydration/toggle re-keyed from `review_id` to `album_id` (hydration `select`,
  delete `.eq()`, insert payload) — `favorites` no longer has a `review_id` column
  (`supabase/favorites-drop-review-id.sql`, confirmed run — see `album-identity-ingest.md`'s
  live-queried confirmation). `toggleFavorite(reviewId)` renamed to `toggleFavorite(albumId)`.
- Card grid: `key`, `favoritedIds.has(...)`, and `onToggle`'s argument all switched from
  `rev.id` to `rev.albumId`.
- Card wrapping is now conditional: `rev.url ? <Link href={rev.url}>...</Link> : <Box>...</Box>`.
  A zero-review album has no URL to link out to — the previous unconditional `<Link
  href={rev.url}>` would have rendered a dead/empty-href anchor around the whole card. The
  heart toggle still works either way (`e.stopPropagation()` already guarded it against the
  wrapping `Link`'s click).
- Source badge (previously unconditional) is now guarded by `rev.source && rev.source !== ''`,
  matching the existing pattern already used for the score badge. The review-date `<Text>` at
  the bottom of the card is now guarded by `rev.publishedDate` for the same reason.
- The source filter dropdown's option list now filters out the empty-string placeholder value
  (`sources = ... .filter((s) => s !== '')`) so a zero-review album doesn't produce a blank
  `<option>`.

## Verification performed

- `npx vitest run` — 150/150 passing (148 pre-existing + 2 new: zero-review-album rendering,
  multi-review-album representative-pick, both in `src/__tests__/App.favorites.test.tsx`).
  `App.favorites.test.tsx`'s mock data/assertions were updated to the new `albums`+nested-
  `reviews` query shape and `favorites.album_id` (previously mocked the old `reviews` table
  and `review_id`).
- `npx tsc --noEmit` — clean.
- `npm run lint` — no new errors introduced (diffed against `git stash`; the 12 pre-existing
  Prettier findings in `src/App.tsx` are untouched lines, unrelated to this session).
- Live-verified in a running dev server against the real Supabase project (136 albums, matches
  the migration's confirmed final `albums` row count):
  - Full grid renders: artwork (or the "No artwork found" placeholder), genre tags, release
    date, source badge, score badge, and outbound review link all correct for reviewed albums.
  - Three manually-added, zero-review albums (Neurosis, W.M.D., Green Carnation — all
    `created_by` not null, confirmed via a direct query) render with no score badge, no source
    badge, no review-date line, and are **not** wrapped in a `<Link>` (confirmed via the
    accessibility tree — reviewed cards show an enclosing `link` node, these three don't).
    "No summary available." fallback text shows correctly; no crash, no blank/broken fields.
  - Clicking the heart on a zero-review album while logged out correctly shows the "Log in to
    save favorites" toast — proves the toggle handler works off `rev.albumId` without
    depending on review data.
  - Sort by "Highest Score" and filter by source both work without error; zero-review albums
    (score 0) correctly sort last and are excluded from the empty-string-free source dropdown.
  - Zero console errors and zero failed network requests throughout.
  - **Not verified live:** the logged-in favorite insert/delete round-trip against
    `favorites.album_id` (no test-account credentials available in this session) and the
    multi-review tie-break path (no live album currently has more than one attached review —
    see above). Both are covered by the component test's mocked Supabase calls instead, which
    mirror the real query/table shape.

## What this session did NOT do

- Did not touch `scripts/ingest.ts` or `scripts/musicbrainz.ts` (already updated by the
  ingest-pipeline session; confirmed via `git diff --stat` that this session added no further
  changes to them).
- Did not touch `src/hooks/useFavoritesList.ts`, `FavoritesPage.tsx`, `AddAlbumDrawer`, the
  `/favorites` route, or the `manual_albums` table — all confirmed untouched via `git status`.
  These remain on stale pre-migration logic (`review_id`, flat `reviews` columns) — a known,
  accepted gap for a future session, not fixed here.
- Did not design or implement the multi-source badge/average display treatment
  (`album-identity-decisions.md` §3) — still open, still deferred. The one-review-per-album
  rule above is a placeholder only.
- Did not change RLS policies.
- Did not implement AOTY or admin merge tooling.

## Superseded (July 2026): multi-source display replaces the placeholder rule

The one-review-per-album placeholder rule above was always explicitly temporary (see its own
section, kept as-is above for history). This later session in the same branch replaced it with
the real multi-source design from `album-identity-decisions.md` §3 — implementing the design
question that section left open, rather than changing the decision itself.

**What changed in `src/dbMapping.ts`:** `pickRepresentativeReview()` and `AlbumCard`'s flat
single-review fields (`source`, `score`, `normalizedScore`, `summary`, `url`, `publishedDate`)
are gone. `AlbumCard` now carries:

- `reviews: AlbumReviewLine[]` — every attached review, unfiltered/unranked, each with
  `source`, `score` (raw stored string, e.g. `"9/10"`), `url`, `publishedAt`, `publishedDate`.
  No `summary` — it's never displayed anymore.
- `averageScore: number | null` — the average of all attached reviews' `normalized_score`
  (0–100 scale, same scale the old per-review `normalizedScore` used), computed over reviews
  that have a non-null score. `null` when the album has zero reviews (or, degenerately, when
  every attached review is missing a score) — the score badge's existing zero-review guard
  continues to work unchanged against this field.
- `publishedAt` — now the *most recent* attached review's `publishedAt` (falls back to the
  album's `created_at` when there are no reviews), so "newest first" sorting reflects the most
  recent review activity on an album rather than one arbitrarily chosen review's date.

**What changed in `src/App.tsx`:**

- Score badge (bottom-right over artwork, position **unchanged** — see note below) now shows
  `formatAverageScore(rev.averageScore)`, a new helper formatting the 0–100 average back down
  to the site's `/10` display scale (e.g. `87` → `"8.7"`). Guard is `rev.averageScore !== null`.
- Source badge (bottom-left over artwork, position **unchanged**) is now a `Wrap`/`WrapItem`
  list — one badge per attached review — reusing the exact wrapping pattern the genre-tag row
  already used below the artwork, so multiple badges stack onto additional lines on narrow
  cards instead of overflowing or clipping. Guard is `rev.reviews.length > 0`.
- The summary excerpt and its review-date line are both deleted, replaced by a `List.Root`/
  `List.Item` (Chakra v3's semantic list primitives — a real `<ul>`/`<li>`, not a stacked
  `<Text>`) with one line per attached review: `` {source}: {score} — {date} [see review] ``,
  where `[see review]` links to that specific review's own `url`.
- The card-level outbound `<Link>` wrapping the whole card is removed entirely (it made sense
  for one review with one URL; it doesn't for up to three). Each review now links out only via
  its own per-source line.
- Sort-by-score and the min-score filter now read `averageScore` instead of the old
  per-review `normalizedScore`. The source filter/dropdown now flattens across every review on
  every album (`reviews.flatMap((r) => r.reviews.map((rv) => rv.source))`) instead of reading
  one source per album.
- The heart-toggle's `e.preventDefault()`/`e.stopPropagation()` calls were removed — verified
  (not assumed) to be dead code once the outer card-level `<Link>` was removed: no ancestor of
  the button has a click handler or navigation behavior left to guard against.

**Badge position — resolved conflict:** the design reference for this session (a mockup
reviewed directly) described the average-score badge as top-right and source badges as
top-left over the artwork. That would collide with the heart-favorite toggle, which already
occupies the artwork's top-right corner and is explicitly out of scope for this session
(per the brief, "unaffected by any of this"). Resolved by keeping both badges at their
existing bottom corners (bottom-right average, bottom-left source-badge row) — same
position as the old single-badge layout, only the content and the source badge's
one-vs-many cardinality changed.

**Verification performed:** `npx tsc --noEmit` clean; `npx vitest run` 150/150 (two tests in
`App.favorites.test.tsx`'s multi-review describe block updated for the new shape — one now
asserts both source badges/lines render with correct per-review scores/dates/links instead of
one being picked and the other suppressed); `npx eslint` shows only the same pre-existing
Prettier findings already present before this session (confirmed via `git diff` line-range
comparison, not touched by this session's edits). Live-verified against the real Supabase
project: Volubilis – Theasterion (the one confirmed real multi-review album) renders both its
Angry Metal Guy and Progressive Subway reviews as separate source badges and separate
per-source lines with correct individual scores/dates/links, and the average-score badge
correctly shows `7.8` (average of normalized 80 and 75). Zero-review albums (e.g. Neurosis)
still degrade cleanly — no average badge, no source badges, no per-source lines, artwork/
genre/release-date/heart-toggle all still render and the heart toggle still works while
logged out (shows the "Log in to save favorites" toast, confirmed no console errors and no
unintended navigation on click).

**What this session did NOT do:** did not touch `/favorites`, `AddAlbumDrawer`,
`useFavoritesList`, or `manual_albums` (still separately out of scope, still on old stale
logic); did not change RLS, ingest, or migration-related code; did not address the still-open
sub-question from `album-identity-decisions.md` §3 about signaling how many sources
contributed to a given average (e.g. flagging a 2-source average as more volatile than a
3-source one) — flagged there as non-blocking, still not built.

## Bugfix (14 July 2026): multi-source display was applied to every card, not just 2+ reviews

The multi-source session above shipped a brief that was ambiguous about review count and got
implemented too broadly: the average badge, stacked source badges, per-source `<li>` list, and
removal of the card-level link were applied to **every** card regardless of how many reviews
were attached, including albums with exactly one review. That's wrong — an average of one
number is just that number, displayed with unnecessary indirection, and the original
single-review layout (summary excerpt, one date line, one source+score badge, whole-card link)
was working correctly before and had no reason to change.

**Fix:** both `ArtworkBlock` and the card body in `src/App.tsx` now branch explicitly on
`rev.reviews.length`:

- **0** — unchanged from the multi-source session: no badges, no summary/list, no card-level
  link.
- **exactly 1** — reverted to the original pre-multi-source-session rendering: single source
  badge + single score badge (the review's own raw `score` string, not `averageScore`), summary
  excerpt text, one review-date line, and the whole card wrapped in a `<Link>` to that review's
  `url`.
- **2 or more** — the multi-source session's design, unchanged: wrapping `Wrap`/`WrapItem`
  source badges, the `averageScore` badge, the per-source `<li>` list, no card-level link.

`AlbumReviewLine` (`src/dbMapping.ts`) gained back a `summary: string` field — needed by the
restored single-review branch — since the multi-source session had dropped it as "never
displayed." It's populated from the same `reviews(...).summary` column already being selected;
no query change needed. `fromAlbumWithReviews()` and `averageScore` are otherwise unchanged —
sort-by-score and the min-score filter still read `averageScore` uniformly for all three cases,
since the average of a single score equals that score, so no branching was needed there.

The heart-toggle's `e.preventDefault()`/`e.stopPropagation()` calls (removed by the multi-source
session as dead code once the card-level link was removed) are back, since the card-level link
is back for the 1-review case — they guard the button against that Link's click bubbling as
they originally did. They're inert no-ops on 0- and 2+-review cards, which have no such wrapper.

**Verification:** `npx tsc --noEmit` clean; `npx vitest run` 151/151 (added a single-review
rendering test to `App.favorites.test.tsx`'s review-count describe block, and added a
no-card-level-link assertion to the existing multi-review test). Live-verified against the real
Supabase project: single-review cards (e.g. Stormhammer – Wrath of the Hammer, Emptiness –
Nowhere Speaks) show the raw score ("4/10", "7/10"), one source badge, summary text, one date
line, and are wrapped in a card-level link again (confirmed via the accessibility tree — the
whole card is one `link` node). Volubilis – Theasterion still shows the multi-source treatment
unchanged (two source badges, `7.8` average, two per-source lines, no wrapping `link` node in
the accessibility tree). Neurosis (zero reviews) still degrades cleanly with no console errors.
