# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working conventions

- Always read this file fully before starting any task
- Always show a plan and wait for approval before writing code
- After each completed feature, update this file with decisions made
- Target deployment: Vercel (someday) — avoid permanent server dependencies
  where possible
- Comment all non-trivial code: explain WHY, not just what. Prioritise scraper logic, ingestion pipeline, React state, and any API or browser quirks.

## Deployment target

Vercel (future, not imminent). Avoid permanent server dependencies where
possible. When the time comes, the migration will require:

- ~~Replacing public/reviews.json with a database~~ — **done** (Supabase, June 2026)
- Replacing node-cron with Vercel Cron Jobs
- Replacing any Express server with Vercel serverless functions at api/
- Replacing Puppeteer with @sparticuz/chromium + puppeteer-core

## Commands

```bash
npm run dev           # Start Vite dev server + Express API server together (via concurrently)
npm run build         # Build frontend for production
npm run ingest        # Run the scraper/ingestion pipeline once (also starts cron)
npm run server        # Start Express API server alone (port 3001)
npm run test          # Run all tests (Vitest, watch mode)
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix
npm run format        # Prettier format
npm run type-check    # TypeScript check without emitting
```

Run a single test file:

```bash
npx vitest run src/__tests__/angrymetal.test.js
```

## Architecture

This project has two distinct halves that share `src/types.ts`:

### 1. Scraper / Ingestion (`scripts/ingest.ts`)

A Node.js script (run with `tsx`) that:

- Fetches RSS feeds from all sources in parallel
- For each item, fetches the full review page to extract the rating (using `axios` + `cheerio`, or `puppeteer` for Metal Storm which requires JS rendering)
- Normalizes all scores to 0–100
- Fetches artwork URL and genre tags from MusicBrainz / Cover Art Archive
- Merges fresh results with existing Supabase rows (merge guard preserves artwork/genre from prior runs)
- Upserts the merged result to the Supabase `reviews` table
- Schedules itself via `node-cron` to run at 07:00 and 19:00 daily

Each source has its own extractor module in `src/scraper/`:

- `angrymetal.js` — looks for `.rating` / `.review-score` classes, then `Rating:` text patterns, then textual label lookup (`RATING_MAP`)
- `progressivesubway.ts` — scans for `Final verdict:` lines with numeric or textual ratings (`RATING_MAP`)
- `metalstorm.ts` — extracts user score from `span.bold[style*="color:#eebb00"]` inside `.album-rating`

### 2. Frontend (`src/App.tsx`)

A single-page React + Chakra UI app that reads `public/reviews.json` at load time and renders a dark-themed card grid. No routing, no server-side state — all filtering, sorting, and searching happen in-memory on the already-loaded array.

Key data flow: `reviews.json` → `fetch('/reviews.json')` → React state → filter/sort → card grid.

**Phase 3 pending:** The frontend still reads from `public/reviews.json`. This file is no longer written by the ingest pipeline (which now writes to Supabase). Phase 3 will migrate the frontend to read from Supabase directly. Until then, `reviews.json` is stale and the refresh button's completion-detection polling (which compares `publishedAt` snapshots of the JSON file) will not work.

### Shared type (`src/types.ts`)

`MetalReview` is the canonical shape shared by the scraper output and the frontend.

## Score normalization

All scores are stored in two forms:

- `score`: raw string as it appears on the site (e.g. `"8.5/10"`, `"7.3/10"`)
- `normalizedScore`: 0–100 number for sorting (computed in `normalizeScore()` in `ingest.ts`)

Textual ratings from AMG and Progressive Subway are first converted to a 0–10 numeric via their respective `RATING_MAP`, then stored as `"<value>/10"` before normalization.

## Adding a new scraper source

1. Create `src/scraper/<sourcename>.ts` exporting `extractRating(html: string): number | null`
2. Add a `fetch<SourceName>()` function in `scripts/ingest.ts` following the pattern of existing fetchers
3. Add the result to the `Promise.all` in `runIngestion()`
4. Update the source filter options in `App.tsx` (they are derived dynamically from data, so this may be automatic)

## Session decisions — Album artwork (June 2026)

### What was built

- Album artwork is fetched during ingestion via **MusicBrainz** (release search) then **Cover Art Archive** (front image URL). Stored as `artworkUrl: string | null` on every review object.
- Artwork is displayed at the top of each card as a square block. Score badge moved from the card body into the artwork block, absolutely positioned bottom-right.
- Double-Positive detection and its UI (cyan border, star badge) were removed entirely. `isDoublePositive` is kept as an optional field in the type to avoid breaking existing JSON reads.

### Key patterns introduced

**`ArtworkBlock` component** (`src/App.tsx`): Extracted as a sibling function (not a separate file) so each card gets its own isolated `useState(false)` for `loaded` without prop-drilling a Map. Pattern to reuse if other per-card stateful UI is needed.

**Skeleton shimmer**: Uses Chakra's `<Skeleton>` as a `position="absolute"` overlay with `opacity={loaded ? 0 : 1}` and `transition="opacity 0.3s ease"`. Deliberately does **not** use Chakra's `isLoaded` prop — that would instantly remove the shimmer element, bypassing the CSS fade. `pointerEvents="none"` prevents the invisible skeleton from blocking clicks after load.

**Square artwork aspect ratio**: Uses `paddingBottom="100%"` on a `position="relative"` Box (not Chakra's `AspectRatio` component) so absolutely-positioned children (image, skeleton, score badge) all stack cleanly inside it.

**`overflow: 'hidden'` on cardStyle**: Required so the artwork image clips to the card's `borderRadius: 'lg'` at the top corners.

### MusicBrainz rate limiting

`fetchArtworkUrl` calls are **sequential** in `runIngestion` with a `sleep(1000)` between each one. MusicBrainz requires a max of 1 req/sec from a single client. The existing parallel RSS + rating fetches are unaffected. Required `User-Agent` header on every MB and CAA request: `MetalReviewsDashboard/1.0 (dan.gramada@gmail.com)`.

## Session decisions — Persistent review history (June 2026, superseded)

> **Superseded by the Supabase migration (June 2026).** The merge guard logic described here was preserved and extracted into `applyMergeGuard()` — see the Supabase migration section below. The JSON file is no longer the write target.

The original implementation merged fresh results into `public/reviews.json` so history beyond the current RSS window was preserved. The merge key was `computeId()` (stable band+album hash). The merge guard prevented artwork/genre regressions on transient MB failures.

## Session decisions — Manual refresh / Express server (June 2026)

### What was built

- **`server.ts`** (project root): Express server on port 3001. Serves `public/` as static files and exposes one endpoint: `POST /api/ingest`.
- **`scripts/ingest-cli.ts`**: Thin entry point that imports `runIngestion` and owns the cron schedule + immediate startup run. This is what `npm run ingest` executes.
- **`scripts/ingest.ts`**: `runIngestion()` is now `export`ed and contains no top-level side effects — safe to import from `server.ts` without triggering a cron or an ingest on import.
- **Vite proxy**: `/api` is proxied to `http://localhost:3001` in `vite.config.ts`, so the frontend uses relative `/api/ingest` with no hardcoded localhost URLs.
- **`concurrently`**: `npm run dev` runs `vite` and `tsx server.ts` together in one terminal.
- **Refresh button** in `src/App.tsx`: added to the right end of the controls bar.

### `POST /api/ingest` behaviour

- Returns **202 Accepted** immediately with `{ status: "running" }` — ingest runs in the background.
- Returns **409 Conflict** with `{ status: "busy", message: "Ingest already running" }` if a run is in progress. Tracked via a simple `let ingesting = false` flag in `server.ts`.
- Ingest is **not triggered automatically** when the server starts — only on button click or `npm run ingest`.

### Refresh button states and polling

- `refreshState`: `'idle' | 'loading' | 'success' | 'error'` — local state in `App`.
- On 202: polls `GET /reviews.json` every 3 seconds. Compares `Math.max(...publishedAt)` snapshot taken before the POST against the new data. When a newer date appears, updates React state and sets `'success'` for 3 seconds then resets.
- On 409: shows a Chakra `useToast` warning, stays `'idle'`.
- On network error: sets `'error'` for 3 seconds then resets.

### Controls bar styling pattern

A shared `controlStyle` const is defined in the `App` component body (alongside `cardStyle`) and spread onto the Input and all three Selects (Sort, Source, Score):

```ts
const controlStyle = {
  size: 'md',
  variant: 'outline',
  bg: 'surface.card',
  color: 'text.primary',
  borderColor: 'border.default',
} as const;
```

The Refresh button does **not** spread `controlStyle` — it is fully explicit. Reason: Chakra v2's `variant="outline"` conflicts with explicit `bg` overrides, causing the border to not contain its content. The button uses `border="1px solid"` + `borderColor` directly, with no `variant` prop, and `flexShrink={0}` to prevent flex compression.

Both `<Select>` controls use `sx={{ '& option': { background: '#1a202c' } }}` to override the native browser white dropdown background on Windows.

## Session decisions — Genre data + card badge redesign (June 2026)

### What was built

- Genre data is now fetched during ingest via MusicBrainz and stored as `genre: string[]` on every `MetalReview`.
- Source badge moved from the card body onto the artwork block (top-left, absolutely positioned).
- Genre tags added to the card body where the source badge previously lived.

### Genre lookup (two-level)

1. **Release level:** after fetching the MBID via search, call `GET /ws/2/release/{mbid}?inc=genres&fmt=json`. Sort `release.genres` by `count` descending, take top 3.
2. **Artist fallback:** if the release returns 0 genres, call `GET /ws/2/artist/?query=artist:"{band}"&fmt=json&limit=1` → get artist MBID → `GET /ws/2/artist/{artist-mbid}?inc=genres&fmt=json` → take top 3 from `artist.genres`.

### Rate limiting

`fetchMusicBrainzData` includes internal `sleep(1000)` calls between each pair of back-to-back MB requests. `runIngestion` adds one more `sleep(1000)` after each `fetchMusicBrainzData` call (gap between reviews). The artist fallback adds two extra MB calls with two extra internal sleeps. The artist fallback is wrapped in its own try/catch so a failure there preserves the artworkUrl already resolved from the release-level CAA call.

### Skip logic

`mbAlreadyFetched` replaces the old `artworkAlreadyFetched` set. A review is skipped only when BOTH `artworkUrl !== undefined` AND `Array.isArray(r.genre)` — ensuring reviews from before genre support was added are re-fetched once.

### MB search query

Both the release search and artist search quote band/album names with Lucene quoting (`artist:"${band}" AND release:"${album}"`) to handle metacharacters in band names (e.g., `Sunn O)))`, `Mgła`).

### Source badge styling

- Component: `ArtworkBlock` (`src/App.tsx`)
- Position: `position="absolute"` `top={2}` `left={2}`
- Colors: `bg="accent.border"` (teal.500) / `color="accent.text"` (teal.300) — from theme semanticTokens
- Shape: `borderRadius="base"` (Chakra built-in, = 4px), `fontSize="xs"`, `fontWeight="semibold"`
- Overflow: `maxW="calc(100% - 16px)"` + `overflow="hidden"` + `textOverflow="ellipsis"` + `whiteSpace="nowrap"`

### Genre tag styling

- Components: Chakra `<Tag size="sm">` inside `<Wrap spacing={1}>` / `<WrapItem>`
- Colors: `bg="whiteAlpha.100"` / `color="purple.300"` — no hardcoded hex
- Shape: `borderRadius="base"` (Chakra built-in, = 4px)
- Conditional: only rendered when `rev.genre.length > 0`

### Card body order post-redesign

1. Band – Album title
2. Genre tags (Wrap of Tag, purple) — new
3. Date (text.dim)
4. Summary excerpt (text.dim)

## Session decisions — Genre coverage + artwork regression fixes (June 2026)

### RSS title pollution (root cause of all three bugs below)

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

### Bug 1: AMG / Progressive Subway reviews getting `genre: []`

**Root cause:** MB search failed on polluted titles (see above) → `fetchMusicBrainzData` returned `genres: []`. Additionally, `mbAlreadyFetched` condition `Array.isArray(r.genre)` evaluated `true` for `[]`, so once an empty array was stored, that review was permanently skipped and never retried.

**Fix:**
- Title pollution fix above makes MB searches succeed.
- Changed `mbAlreadyFetched` to require `r.genre.length > 0` in addition to `Array.isArray(r.genre)`, so reviews stuck with `genre: []` are retried on the next run.

### Bug 3: Reviews with `artworkUrl: null` permanently skipped even when artwork exists

**Root cause:** `mbAlreadyFetched` used `r.artworkUrl !== undefined` as the artwork check. `null !== undefined` is `true`, so a review with `artworkUrl: null` (MB was tried, CAA returned nothing) and a non-empty genre list was treated as fully fetched and never retried — even though CAA coverage improves over time.

**Fix:** Changed condition to `typeof r.artworkUrl === 'string'`, which is only true for actual URL strings. Reviews with `artworkUrl: null` are now retried on every ingest run until artwork is found.

### Bug 2: Artwork regression (artworkUrl going null on existing reviews)

**Root cause:** Same MB search failure → `fetchMusicBrainzData` returned `artworkUrl: null`. The old upsert loop (`merged.set(review.id, review)`) blindly overwrote previously-good `artworkUrl` values with `null`.

**Fix:** Merge guard added to the upsert loop (`scripts/ingest.ts`):
- `artworkUrl`: prefer fresh value; fall back to existing if fresh is null.
- `genre`: prefer fresh if non-empty; otherwise keep existing (never regress from a non-empty genre list to `[]`).

This means a transient MB failure (network, rate limit, lookup miss) can no longer erase data already stored in `reviews.json`.

## Session decisions — Controls bar enhancements (June 2026)

### What was built

Two additions to `src/App.tsx` only — no scraper or server files touched.

**Score filter** — a fourth Select control added to the controls bar between the Source filter and the Refresh button. State: `const [minScore, setMinScore] = useState('')`. Options: All Scores / 7+ / 8+ / 9+ (per 10). Filter logic: `r.normalizedScore >= parseFloat(minScore) * 10`. Width: `w="130px"`, uses the same `controlStyle` spread and `sx={{ '& option': { background: '#1a202c' } }}` as the existing Selects.

**Review counter** — a `<Text fontSize="sm" color="text.dim">` rendered between the controls bar `<Flex>` and the card grid, guarded by `!loading`. Shows `"{n} of {total} reviews"` when `filtered.length < reviews.length` (any filter is reducing the set), and `"{total} reviews"` otherwise. Uses `mt={2}` spacing from the controls bar.

### Controls bar final order (left → right)

```
[Search input — flex: 1]  [Sort ▾]  [Source ▾]  [Score ▾]  [Refresh]
```

### Filter pipeline order

Reordered in this session to make the score filter slot in cleanly:

1. Source filter (`filterSource`)
2. Score filter (`minScore`)
3. Search (band, album, genre text match)
4. Sort (newest / highest score)

The counter reads `filtered.length` — the length of the final array after all four stages.

---

## Session decisions — Design tokens (June 2026)

### What was built

All hardcoded design values consolidated into `src/theme.ts`, which is registered in `src/main.tsx` via `<ChakraProvider theme={theme}>`. `src/App.tsx` references only named tokens — no raw hex codes, no bare Chakra palette keys.

### Token groups

| Prefix | Purpose | Examples |
|---|---|---|
| `surface.*` | Background layers | `surface.page`, `surface.card`, `surface.raised`, `surface.darkest` |
| `border.*` | Border colours | `border.default`, `border.hover` |
| `text.*` | Text colours | `text.primary`, `text.muted`, `text.dim` |
| `accent.*` | Brand accent (teal/blue) | `accent.start`, `accent.end`, `accent.border`, `accent.text` |
| `brand.*` | One-off product colours | `brand.score` (#c9a227), `brand.scoreText` (#111111) |

### Border radii — use Chakra's built-in scale

No custom radii are defined in the theme. Use Chakra's built-in keys directly:

- `base` (4px) — score badge, source badge, genre tags
- `md` (6px) — refresh button
- `lg` (8px) — cards

**Gotcha:** values in a custom `radii` block must be raw CSS strings (`'0.375rem'`). Referencing another Chakra scale key by name (e.g., `button: 'md'`) silently produces no border radius. Avoid adding custom radii unless a value has no Chakra equivalent.

### Intentional non-token values

Two hardcoded values are deliberate carve-outs:

- `sx={{ '& option': { background: '#1a202c' } }}` on all three `<Select>` controls (Sort, Source, Score) — Chakra semantic tokens cannot resolve inside native CSS `sx` option selectors. `#1a202c` is the hex equivalent of `gray.900`.
- `color="gray.300"` on the Refresh button — pending a decision on whether the button adopts teal (`accent.text`) styling. Not a token yet.

---

## Session decisions — Controls bar responsive layout (June 2026)

### What was built

Replaced the fixed-width controls bar with a responsive flex layout in `src/App.tsx`. No other files were touched.

### Layout behaviour

| Breakpoint | Behaviour |
|---|---|
| `base` (0–767px) | Every control stacks full-width, one per line |
| `md` (768–991px) | Search takes its own full-width first line; Sort + Source + Score + Refresh share the second line |
| `lg` (992px+) | Single row: Search gets `flex: 2`, each Select gets `flex: 1` |

### Key changes

- `<Flex>` now has `flexWrap="wrap"` and `gap={2}`. The `<Spacer />` element was removed (gap handles spacing).
- `Spacer` removed from the Chakra import.
- All hardcoded `w="150px"` / `w="130px"` removed from the three Selects.
- All per-control `ml={2}` removed (replaced by `gap={2}` on the container).
- `ml={2}` removed from the Refresh button for the same reason.

### Responsive prop values

**Search Input:**
```
flex={{ base: '1 1 100%', lg: '2' }}
minW={{ lg: '180px' }}
```

**Sort / Source / Score Selects:**
```
flex={{ base: '1 1 100%', md: '1', lg: '1' }}
minW={{ base: '100px', lg: '110px' }}   // Sort and Score
minW={{ base: '100px', lg: '120px' }}   // Source (slightly wider label)
```

**Refresh Button:**
```
w={{ base: '100%', md: 'auto' }}
flexShrink={0}
```

### What did NOT change

- `controlStyle` values (bg, border, color, size) — unchanged and still spread onto all Selects and the Input.
- Refresh button border/color treatment — still uses explicit `border`, `borderColor`, `color` props, no `controlStyle` spread.
- All filter, sort, and search logic.
- Card grid, artwork, theme, ingest, and server files.

---

## Session decisions — Supabase migration (June 2026)

### What was built

The ingest pipeline's write target moved from `public/reviews.json` to a Supabase Postgres table called `reviews`. The frontend still reads from `reviews.json` (Phase 3 will migrate it).

### New files

- **`scripts/supabaseClient.ts`**: Exports a single `supabase` client using `SUPABASE_URL` + `SUPABASE_SECRET_KEY` from `.env` (loaded via `dotenv/config`). Uses the service key, which bypasses RLS — never import this in frontend code.
- **`scripts/seed-from-json.ts`**: One-time migration script that read `public/reviews.json` and upserted all 53 records into Supabase. Safe to re-run (upserts on `id`). Keep in repo for reference; not needed again unless the table is reset.

### Supabase table schema

```sql
create table reviews (
  id text primary key,
  band text not null,
  album text not null,
  source text not null,
  score text,
  normalized_score numeric,  -- numeric (not integer) to preserve fractional values e.g. 83.33
  summary text,
  url text,
  published_at timestamptz,
  published_date text,       -- formatted display string e.g. "14 Jun 2026", derived from published_at
  artwork_url text,
  genre text[] default '{}'::text[]
);
```

### camelCase ↔ snake_case mapping (scripts/ingest.ts)

Postgres uses snake_case; `MetalReview` uses camelCase. Two explicit mapping functions handle the boundary — do not use a generic string converter:

- **`toDbRow(r: MetalReview): DbRow`** — maps before upsert. Drops fields not in the schema (`rating`, `isDoublePositive`).
- **`fromDbRow(row: DbRow): MetalReview`** — maps after select. Fills nullable DB fields with safe defaults (`''`, `0`, `[]`).

Both are exported. `DbRow` type mirrors the exact Postgres column names/types.

Affected field mappings:
| `MetalReview` | DB column |
|---|---|
| `normalizedScore` | `normalized_score` |
| `publishedAt` | `published_at` |
| `publishedDate` | `published_date` |
| `artworkUrl` | `artwork_url` |

### applyMergeGuard (extracted pure function)

The merge guard logic was extracted from the inline block in `runIngestion()` into `export function applyMergeGuard(existingById, freshReviews): MetalReview[]`. It is:

- **Pure** — no I/O, no side effects, operates entirely on in-memory maps
- **Tested** — 8 unit tests in `src/__tests__/mergeGuard.test.ts`
- **Exported** — importable without triggering any ingest side effects

Guard rules (unchanged from the JSON era):
- `artworkUrl`: use fresh if non-null; otherwise keep existing; otherwise null
- `genre`: use fresh if non-empty; otherwise keep existing; otherwise `[]`
- Existing rows not in fresh results are preserved in output
- Output sorted by `publishedAt` descending

### How runIngestion() works now

1. `SELECT *` from Supabase → `existingReviews` (non-fatal on failure, falls back to `[]`)
2. Build `existingById`, `ratingAlreadyFetched`, `mbAlreadyFetched` skip-sets from existing rows
3. Fetch RSS feeds + ratings + MusicBrainz data (unchanged)
4. `applyMergeGuard(existingById, final)` → `output`
5. `UPSERT output.map(toDbRow)` with `onConflict: 'id'` — throws on error (fatal)

### Known gap — refresh button (Phase 3)

The refresh button in `App.tsx` polls `GET /reviews.json` every 3 seconds to detect when an ingest completes, comparing `Math.max(...publishedAt)` snapshots. Since ingest no longer writes `reviews.json`, the poll never sees a change and the button spins indefinitely after clicking. Fix is part of Phase 3 (migrating the frontend to read from Supabase).
