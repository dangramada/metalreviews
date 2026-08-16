# Architecture (current state)

This project has two distinct halves that share `src/types.ts`.

## 1. Scraper / Ingestion (`scripts/ingest.ts`)

Read `docs/decisions/album-identity/album-identity-decisions.md` and `docs/decisions/album-identity/album-identity-ingest.md` before touching identity-resolution, skip-set, or enrichment-merge logic in this file.

A Node.js script (run with `tsx`) that:

- Fetches RSS feeds from all sources in parallel
- For each item, fetches the full review page to extract the rating (using `axios` + `cheerio`, or `puppeteer` for Metal Storm which requires JS rendering)
- Normalizes all scores to 0–100
- Resolves each (band, album) to an `albums` row via `resolveAlbumIdentity()` — `mb_release_group_id` checked first (fresh MusicBrainz lookup, extended in `scripts/musicbrainz.ts`), `norm_key` (`scripts/normalizeKey.ts`) as the fallback; creates a new `albums` row only when neither matches. See `docs/decisions/artwork.md`, `genre-data.md`, and `release-date.md` before touching the underlying MB/Cover Art Archive fetch logic itself.
- Writes artwork URL, genre tags, and release date onto the resolved **album** row (not the review) — new albums get them fresh from MusicBrainz; existing albums are merged via `applyAlbumEnrichment()`, a non-regression merge-guard (never let a fresh empty/coarser value overwrite a good stored one)
- Review identity/uniqueness is `(album_id, source)`. Up to 3 `reviews` rows can correctly exist per album, one per source.
- Upserts touched `albums` and `reviews` rows to Supabase — rows not touched this run are left alone
- Contains `node-cron` scheduling wiring in `scripts/ingest-cli.ts` (07:00 and 19:00 daily) — the code is real and functional, but no production process runs `ingest-cli.ts`, so the schedule never fires. Ingest is currently manual-only. See `docs/decisions/ingest-trigger-and-security.md`.

Each source has its own extractor module in `src/scraper/`:

- `angrymetal.js` — looks for `.rating` / `.review-score` classes, then `Rating:` text patterns, then textual label lookup (`RATING_MAP`)
- `progressivesubway.ts` — scans for `Final verdict:` lines with numeric or textual ratings (`RATING_MAP`)
- `metalstorm.ts` — extracts user score from `span.bold[style*="color:#eebb00"]` inside `.album-rating`. The score is injected client-side by JS, so `fetchMetalStormRating()` in `ingest.ts` calls `page.waitForSelector()` (7 s timeout) after `page.goto()` before snapshotting HTML — do NOT remove this or revert to reading content immediately after `goto`. A `waitForSelector` timeout is caught and swallowed locally (not a loggable error); the outer catch handles genuine navigation failures.

## 2. Frontend (`src/App.tsx`)

A React + Chakra UI v3 app with client-side routing via React Router v7 (`createBrowserRouter` + `RouterProvider`). All filtering, sorting, and searching happen in-memory on the already-loaded array.

**Home page (`/`):** reads `albums` inner-joined to its `reviews` (`supabase.from('albums').select('id, ..., reviews!inner(...)')`). The inner join means only albums with at least one attached review come back — a zero-review (manually-added) album never reaches the home page (see `docs/decisions/album-identity/album-identity-visibility-and-duplicate-fix.md`). → `fromAlbumWithReviews()` mapping (`src/dbMapping.ts`) → React state → filter/sort → card grid.

A home-page album can have one, two, or three attached reviews, and the card component branches explicitly on review count: **exactly one** review renders a single source+score badge showing that review's own raw score, a summary excerpt, one review-date line, and the whole card wrapped in a `<Link>` to that review's url; **two or more** renders a multi-source display — a computed average-score badge, one source badge per review (stacking/wrapping on narrow cards), a `{source}: {score} — {date} [see review]` line per review instead of a summary, and no card-level link (each review links out individually). See `docs/decisions/album-identity/album-identity-frontend-homepage.md` for the design rationale. The card component also has a **zero**-review branch (album-info-only, no badges, no card-level link) — unreachable via the home page's own query, kept only because `AlbumCard`/`fromAlbumWithReviews` are shared plumbing.

Favorites are keyed by `favorites.album_id`.

**`/favorites`:** `useFavoritesList` reads `favorites -> albums(...reviews(...))` in one query — reviewed and manually-added albums both live in `albums` (distinguished only by `created_by`). `AddAlbumDrawer` inserts into `albums` (`created_by: user.id`) + `favorites`, and runs `findExistingAlbum()` (mb_release_group_id first, `norm_key` fallback — mirrors `resolveAlbumIdentity` in `scripts/ingest.ts`) before allowing an insert, favoriting an existing album instead of creating a duplicate when one is found. See `docs/decisions/album-identity/album-identity-frontend-favorites.md`.

### Routes

See `docs/decisions/auth-routing.md` for full detail:

- `/` — dashboard (review grid), public — no auth required
- `/login` — email/password auth form (`LoginPage`)
- `/auth/callback` — handles `PASSWORD_RECOVERY` event and OAuth redirects (`AuthCallback`)
- `/favorites` — protected shortlist view (`FavoritesPage`), redirects to `/login` if logged out via `RequireAuth`
- `/aoty/:shareId` — reserved comment only, not yet implemented

Auth state is managed by `AuthContext` (wraps `supabase.auth` events) and exposed via `useAuth()`. The `Header` component renders the app title, primary nav links (Reviews `/` and Favorites `/favorites` — active state via `useLocation()`), and an account control. Collapses into a hamburger menu below `md`. See `docs/decisions/header-redesign.md`.

### Page shell (`Header`/`Footer` wrapping)

Every page that should look like part of the app (as opposed to a bare/standalone screen) uses the same outer structure, established by `App.tsx` and `FavoritesPage.tsx` and reused as-is by `CriteriaCalibrationPage.tsx`:

```
<Box minH="100vh" bg="surface.page" color="text.primary" py={8}>
  <Container maxW="container.xl">
    <VStack gap={6} align="stretch">
      <Header />
      {/* page content */}
      <Footer />
    </VStack>
  </Container>
</Box>
```

`Container maxW="container.xl"` is what gives every page the same side margins — a page-specific inner `Container` with a narrower `maxW` (e.g. `CriteriaCalibrationPage`'s `4xl`) can nest inside it to constrain content width further without affecting the shared margins. `CriteriaCalibrationPage` wraps this pattern in a local `PageChrome` helper so all of its return branches (loading/error/resume-loading/main) get it consistently, not just the happy path — a pattern worth reusing if a future page also has multiple early-return states. Not yet extracted into a shared component; each consumer currently copies the structure.

## 3. Shared types and mapping (`src/types.ts`, `src/dbMapping.ts`)

`MetalReview` in `src/types.ts` is the canonical shape shared by the scraper output and the frontend.

`src/dbMapping.ts` holds two generations of mapping side by side:

- **`DbRow` / `fromDbRow(row: DbRow): MetalReview`** — the pre-migration, flat `reviews` shape (`artwork_url`/`genre`/`release_date` directly on it, no `album_id`). Kept alive on purpose for the one remaining call site that still depends on this exact shape: `scripts/ingest.ts`'s vestigial `toDbRow()` (used only by `scripts/seed-from-json.ts`, already broken by the schema migration itself). Do not "fix" this type without updating that call site.
- **`AlbumWithReviewsRow` / `AlbumCard` / `fromAlbumWithReviews()`** — the live post-migration shape: an `albums` row with its `reviews` embedded as an array, mapped to a card carrying every attached review (`AlbumCard.reviews: AlbumReviewLine[]`) plus a computed `averageScore`. This is what the home page (`src/App.tsx`) uses. See `docs/decisions/album-identity/album-identity-frontend-homepage.md`.

Full schema and mapping detail: `docs/decisions/supabase-migration.md`.

## Score normalization

All scores are stored in two forms:

- `score`: raw string as it appears on the site (e.g. `"8.5/10"`, `"7.3/10"`)
- `normalizedScore`: 0–100 number for sorting (computed in `normalizeScore()` in `ingest.ts`)

Textual ratings from AMG and Progressive Subway are first converted to a 0–10 numeric via their respective `RATING_MAP`, then stored as `"<value>/10"` before normalization.

## Toast feedback convention

`useFeedbackToast` (`src/hooks/useFeedbackToast.tsx`) delegates to `toaster.create()` from `src/components/ui/toaster.tsx`. The `<Toaster>` component is rendered once at the app root in `main.tsx`.

Every CRUD action (create/update/delete) shows a toast via `useFeedbackToast()`:

- `showSuccess(message)` — green, 3 s
- `showError(message)` — red, 4 s
- `showAction(message, { label, onClick })` — neutral; used for logged-out attempts at gated actions (shows a button in the toast body, no hard redirect)

`useFeedbackToast` is the **only** toast call site in the codebase. Do not call a toast API directly from elsewhere — always go through this hook. See `docs/decisions/favorites.md` for full rationale.

## Adding a new scraper source

1. Create `src/scraper/<sourcename>.ts` exporting `extractRating(html: string): number | null`
2. Add a `fetch<SourceName>()` function in `scripts/ingest.ts` following the pattern of existing fetchers
3. Add the result to the `Promise.all` in `runIngestion()`
4. Update the source filter options in `App.tsx` (they are derived dynamically from data, so this may be automatic)
5. Watch for RSS title pollution (boilerplate text embedded in `<title>`) — see `docs/decisions/genre-artwork-bugfixes.md` for the pattern this has caused twice before
