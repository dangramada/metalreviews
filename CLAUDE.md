# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Chakra UI v2 → v3 migration — ✅ COMPLETE

**The frontend has fully migrated from Chakra UI v2 to v3.** Steps 0–7 are complete and verified (full test suite green, 210/210). The full history of how this happened lives in `docs/decisions/chakra-v3-migration-plan.md`, kept for reference — no further migration work is expected.

## Album-identity restructure — ✅ COMPLETE (merged 2026-07-15)

The `album-identity-migration` branch is merged to `master` (`--no-ff`, commit `e205d5d`). Fresh full verification before merge: 160/160 tests, `tsc --noEmit` clean, live spot-checks of the home page, `/favorites`, and manual-add-with-duplicate-check all passed, and the `favorites_user_album_unique` constraint was confirmed present in Supabase. Render build/deploy of the merged `master` confirmed successful. The branch is kept, not deleted, per project convention. Full history: `docs/decisions/album-identity-*.md`.

## Working conventions

- Always read this file fully before starting any task
- Always show a plan and wait for approval before writing code
- After each completed feature, update this file (or the relevant `docs/decisions/` file — see below) with decisions made
- Target deployment: Render (current). Vercel migration is a possible future move — avoid permanent server dependencies where reasonably easy
- Comment all non-trivial code: explain WHY, not just what. Prioritise scraper logic, ingestion pipeline, React state, and any API or browser quirks.

## Active branches

None. `album-identity-migration` merged to `master` on 2026-07-15 (see closing note above) — branch retained per convention, not deleted.

(Update this section, not individual decision docs, when branch status changes.)

## Past decisions (load only when relevant)

Detailed rationale, gotchas, and "what NOT to change" notes for completed features live in `docs/decisions/`. **Read the matching file before changing related code** — don't rely on memory of past sessions for these areas:

- `architecture.md` — current-state technical reference: scraper/ingestion, frontend, routes, types/mapping, score normalization, toast convention, adding a new scraper source
- `artwork.md` — MusicBrainz/Cover Art Archive artwork fetching, skeleton shimmer, square aspect ratio
- `persistent-history-superseded.md` — historical only: original JSON merge-guard approach
- `refresh-button.md` — Express server, manual refresh button, polling, controls bar styling pattern
- `genre-data.md` — MusicBrainz genre lookup (two-level), source badge + genre tag styling
- `genre-artwork-bugfixes.md` — RSS title pollution root cause, the three bugs it caused, and their fixes
- `controls-bar.md` — score filter, review counter, responsive flex layout breakpoints
- `design-tokens.md` — `src/theme.ts` token groups, badge tokens, button style sets, `/style-guide` dev route
- `supabase-migration.md` — ingest pipeline + frontend migration from `reviews.json` to Supabase, schema, mapping layer
- `render-deployment.md` — port binding, static serving, ingest endpoint auth, env vars
- `auth-routing.md` — React Router routes, AuthContext, login/signup/password-reset flows
- `favorites.md` — Phase 6: heart toggle, useFeedbackToast, optimistic-update decision
- `release-date.md` — release date field: MB data source, precision-aware merge guard
- `header-redesign.md` — Header rewrite: useLocation active state, responsive breakpoints
- `favorites-view.md` — `/favorites` route: RequireAuth, useFavoritesList, AddAlbumDrawer flow
- `manual-albums.md` — `manual_albums` table schema, MB lookup endpoint, year-bounding decisions
- `chakra-v3-migration-plan.md` — full sequenced history of the Chakra v2→v3 migration (Steps 0–7)
- `chakra-v3-foundation-audit-brief.md` — re-examining v2-era styling hacks; eligible to start, not started
- `documentation-audit-june2026.md` — June 2026 doc-layer audit: findings and fixes
- `ingest-trigger-and-security.md` — ingest-trigger decision + dated security audit cross-check
- `score-parsing-bugfixes.md` — Progressive Subway footnote-digit-pollution bugfix
- `album-identity-diagnosis.md` — diagnostic: `computeId` collision, confirmed data loss
- `album-identity-decisions.md` — design decisions: album+source dedup, dual-key identity strategy
- `album-identity-migration.md` — schema + data migration: `albums` table, backfill
- `album-identity-ingest.md` — ingest-pipeline session: `resolveAlbumIdentity`, `computeId` deleted
- `album-identity-frontend-homepage.md` — home-page session: multi-source display, `dbMapping.ts`
- `album-identity-frontend-favorites.md` — `/favorites` session: `useFavoritesList` re-plumb, `findExistingAlbum`
- `album-identity-visibility-and-duplicate-fix.md` — home-page visibility filter + duplicate-check fixes

## Commands

```bash
npm run dev           # Start Vite dev server + Express API server together (via concurrently)
npm run build         # Build frontend for production
npm run ingest        # Run the scraper/ingestion pipeline (starts cron wiring in ingest-cli.ts, but no scheduled process runs in production — see docs/decisions/ingest-trigger-and-security.md)
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
