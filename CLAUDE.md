# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working conventions

- Always read this file fully before starting any task
- Always show a plan and wait for approval before writing code
- After each completed feature, update this file (or the relevant `docs/decisions/` file — see below) with decisions made
- Target deployment: Render (current). Vercel migration is a possible future move — avoid permanent server dependencies where reasonably easy
- Comment all non-trivial code: explain WHY, not just what. Prioritise scraper logic, ingestion pipeline, React state, and any API or browser quirks.

## Past decisions (load only when relevant)

Detailed rationale, gotchas, and "what NOT to change" notes for completed features live in `docs/decisions/`. **Read the matching file before changing related code** — don't rely on memory of past sessions for these areas:

- `artwork.md` — MusicBrainz/Cover Art Archive artwork fetching, skeleton shimmer, square aspect ratio
- `persistent-history-superseded.md` — historical only; the original JSON merge-guard approach, superseded by Supabase
- `refresh-button.md` — Express server, manual refresh button, polling, controls bar styling pattern
- `genre-data.md` — MusicBrainz genre lookup (two-level), source badge + genre tag styling
- `genre-artwork-bugfixes.md` — RSS title pollution root cause, the three bugs it caused, and their fixes
- `controls-bar.md` — score filter, review counter, responsive flex layout breakpoints
- `design-tokens.md` — `src/theme.ts` token groups, border radii rules, intentional non-token carve-outs
- `supabase-migration.md` — ingest pipeline + frontend migration from `reviews.json` to Supabase, schema, mapping layer
- `render-deployment.md` — port binding, static serving, ingest endpoint auth, env vars
- `auth-routing.md` — React Router routes, AuthContext, login/signup/password-reset flows

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

## Architecture (current state)

This project has two distinct halves that share `src/types.ts`:

### 1. Scraper / Ingestion (`scripts/ingest.ts`)

A Node.js script (run with `tsx`) that:

- Fetches RSS feeds from all sources in parallel
- For each item, fetches the full review page to extract the rating (using `axios` + `cheerio`, or `puppeteer` for Metal Storm which requires JS rendering)
- Normalizes all scores to 0–100
- Fetches artwork URL and genre tags from MusicBrainz / Cover Art Archive — see `docs/decisions/artwork.md` and `genre-data.md` before touching this
- Reads existing rows from Supabase, merges with fresh results via `applyMergeGuard()` (preserves artwork/genre from prior runs on transient failures) — see `docs/decisions/supabase-migration.md`
- Upserts the merged result to the Supabase `reviews` table
- Schedules itself via `node-cron` to run at 07:00 and 19:00 daily

Each source has its own extractor module in `src/scraper/`:

- `angrymetal.js` — looks for `.rating` / `.review-score` classes, then `Rating:` text patterns, then textual label lookup (`RATING_MAP`)
- `progressivesubway.ts` — scans for `Final verdict:` lines with numeric or textual ratings (`RATING_MAP`)
- `metalstorm.ts` — extracts user score from `span.bold[style*="color:#eebb00"]` inside `.album-rating`

### 2. Frontend (`src/App.tsx`)

A React + Chakra UI app with client-side routing via React Router (v7, `react-router-dom`). All filtering, sorting, and searching happen in-memory on the already-loaded array.

Key data flow: Supabase `reviews` table → `supabase.from('reviews').select('*')` → `fromDbRow` mapping → React state → filter/sort → card grid.

Routes (see `docs/decisions/auth-routing.md` for full detail):
- `/` — dashboard (review grid), public — no auth required
- `/login` — email/password auth form (`LoginPage`)
- `/auth/callback` — handles `PASSWORD_RECOVERY` event and OAuth redirects (`AuthCallback`)

Auth state is managed by `AuthContext` (wraps `supabase.auth` events) and exposed via `useAuth()`. The `Header` component renders the app title + login/logout controls.

### 3. Shared types and mapping (`src/types.ts`, `src/dbMapping.ts`)

`MetalReview` in `src/types.ts` is the canonical shape shared by the scraper output and the frontend.

`src/dbMapping.ts` is the single source of truth for the Postgres ↔ app boundary:
- **`DbRow`** — mirrors the exact snake_case column names/types of the `reviews` table
- **`fromDbRow(row: DbRow): MetalReview`** — used by both the ingest pipeline (reading back existing rows) and the frontend (mapping query results before touching React state)

Full schema and mapping detail: `docs/decisions/supabase-migration.md`.

## Score normalization

All scores are stored in two forms:

- `score`: raw string as it appears on the site (e.g. `"8.5/10"`, `"7.3/10"`)
- `normalizedScore`: 0–100 number for sorting (computed in `normalizeScore()` in `ingest.ts`)

Textual ratings from AMG and Progressive Subway are first converted to a 0–10 numeric via their respective `RATING_MAP`, then stored as `"<value>/10"` before normalization.

## Toast feedback convention

Every CRUD action (create/update/delete) shows a toast via `useFeedbackToast()` from `src/hooks/useFeedbackToast.tsx`.

- `showSuccess(message)` — green, 3 s
- `showError(message)` — red, 4 s
- `showAction(message, { label, onClick })` — neutral, persistent; used for logged-out attempts at gated actions (shows a button in the toast body, no hard redirect)

`useFeedbackToast` is the **only** `useToast` call site in the codebase. Do not call `useToast` directly.

See `docs/decisions/favorites.md` for full Phase 6 rationale (written after implementation).

## Adding a new scraper source

1. Create `src/scraper/<sourcename>.ts` exporting `extractRating(html: string): number | null`
2. Add a `fetch<SourceName>()` function in `scripts/ingest.ts` following the pattern of existing fetchers
3. Add the result to the `Promise.all` in `runIngestion()`
4. Update the source filter options in `App.tsx` (they are derived dynamically from data, so this may be automatic)
5. Watch for RSS title pollution (boilerplate text embedded in `<title>`) — see `docs/decisions/genre-artwork-bugfixes.md` for the pattern this has caused twice before
