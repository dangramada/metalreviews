# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working conventions

- Always read the Working conventions, Commands, and Active branches sections fully before
  starting any task; consult the historical/reference section below only when the task at
  hand touches it
- Always show a plan and wait for approval before writing code
- After each completed feature, update this file (or the relevant `docs/decisions/` file — see below) with decisions made
- Target deployment: Render (current). Vercel migration is a possible future move — avoid permanent server dependencies where reasonably easy
- Comment all non-trivial code: explain WHY, not just what. Prioritise scraper logic, ingestion pipeline, React state, and any API or browser quirks.
- When a session identifies new deferred or postponed work, add it to `docs/decisions/deferred-work.md` rather than only stating it inline in that session's own doc.
- Docs that are read repeatedly across sessions and grow large after a decision ships get a
  short summary block prepended once shipped-and-verified, so future sessions can skip the
  full body (currently done for `ingest-trigger-and-security.md` and
  `unknown-band-collision-audit.md`). Apply this only when a doc is both large and frequently
  re-read — not as a default for every decision doc.
- Periodically (roughly monthly) review `deferred-work.md` for shipped items older than
  ~30 days whose full detail already lives in a decision doc, and compress them to one-liners.
- Commit at the end of each individual pass in a multi-pass effort, not only at the very end —
  uncommitted work across many passes has no real save point.
- A shipped feature's top-of-file "✅ COMPLETE" narrative is temporary, not permanent — once its
  immediate follow-on work is done, collapse it into a single line in the Past-decisions index,
  same as everything else. The decision doc keeps full detail regardless; only the
  mandatory-read copy shrinks.
- File order matters: operationally-relevant content (conventions, commands, active branch
  state) comes first, since every session reads it. Historical completion narratives and the
  Past-decisions index go last — reference material, read only when the task at hand needs it.

## Commands

```bash
npm run dev           # Start Vite dev server + Express API server together (via concurrently)
npm run build         # Build frontend for production
npm run ingest        # Run the scraper/ingestion pipeline locally (one-off). In production, ingest is triggered by a GitHub Actions schedule + workflow_dispatch calling POST /api/ingest — see docs/decisions/ingest-trigger-and-security.md
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

## Active branches

`favorites-row-mobile-layout` — not yet merged, active as of 2026-08-07. Adds the mobile
counterpart to the desktop redesign below: a vertical, artwork-first mobile layout for
`FavoriteListItemRow`, gated at 768px via the same raw-`@media` show/hide mechanism
`AlbumRatingPage`'s `DesktopRatingLayout`/`MobileRatingLayout` split already uses (both layouts
always mount; CSS `display:none` toggles which is visible — not `useBreakpointValue`, and not a
container query, per Dan's explicit approval of that tradeoff). `toThumbnailUrl(url, 500)` for
mobile artwork (desktop's 250px call is untouched); `rankOverlayBadge` reused unmodified,
overlaid bottom-left on the mobile artwork. Band/album render as two separate lines on mobile
(16px/14px, new inline styles — not tokens, dropping the desktop's inline em-dash join) instead
of desktop's single-line inline-span treatment. Actions footer uses Chakra `Button` (icon+label),
collapsing to icon-only under a secondary 400px `@media` breakpoint (an accepted-imprecision
tradeoff vs. a container query — flagged, not blocking); no `Tooltip` on mobile since touch has
no hover state. Delete-confirmation `DialogRoot` reused unchanged, triggered from the mobile
button. `FavoriteListItemRow` mounts both layouts simultaneously (CSS-hidden, not conditionally
rendered), which required updating several `FavoritesPage.test.tsx` assertions from single-match
(`getByText`/`getByRole`) to multi-match (`getAllByText`/`getAllByRole`) queries, since band/
album text and artwork now appear twice in the DOM regardless of viewport — `tsc --noEmit` clean,
218/218 tests passing. Live-verified at 375px and 430px via a temporary dev-only route
(`/dev-favorites-row-preview`, removed before this branch's work concluded) against a real Cover
Art Archive URL fetched directly from Supabase — confirmed real artwork loads correctly at both
the 250px desktop and 500px mobile sizes, the icon-only/icon+label collapse triggers correctly
either side of 400px, the desktop layout is unaffected at >=768px, and the delete-confirmation
dialog opens correctly from the mobile trigger. Surfaced a new deferred item: a font-size-token
audit (many hardcoded, some non-standard, values app-wide) — explicitly out of scope for this
component-level brief, tracked in `docs/decisions/deferred-work.md`. **Still needed before this
is mergeable: Dan's own live visual confirmation of the rendered mobile card** (this session's
verification was tool-driven, not a substitute for that per the brief's Definition of Done).

`favorites-row-desktop-redesign` merged to `master` on 2026-08-07 via merge commit `5055ba7` —
branch retained per convention, not deleted. Desktop-only restyle of `FavoriteListItemRow`
(`FavoritesPage.tsx`, shared by `/favorites` and the `AddAlbumDrawer` preview): 128px artwork
flush to the row's left/top/bottom edges, a new `rankOverlayBadge` token (`theme.ts`) replacing
the old inline `rankBadge` chip — accent-filled flush-corner overlay on the artwork's bottom-left,
single `#{rank}` node, no threshold — plus a new inline uppercase/bold band-name style (kept on
the same combined "band – album" line, not split into two), hover `Tooltip`s on the rate/delete
icon buttons, and a delete-confirmation `DialogRoot` (previously immediate) matching
`AddAlbumDrawer`'s discard-confirm pattern. Mobile untouched — separate brief still needed, and
two things carry over into it: the new `Tooltip`s are hover-only and untested on touch, and real
artwork softness at the new 128px display size was never actually verified live (both dev-harness
checks used a non-resolving artwork URL). Full detail: `docs/decisions/favorites-row-desktop-redesign.md`;
carry-over items also tracked in `docs/decisions/deferred-work.md`.

`criteria-calibration-update` merged to `master` on 2026-07-30 — branch retained per convention,
not deleted. Gave `CriteriaCalibrationPage` the same `Header`/`Footer` page-shell chrome and
`container.xl` margins as `App.tsx`/`FavoritesPage.tsx` (previously the only page without it); no
session/persistence/gate/engine logic touched. Page-shell pattern itself now documented in
`docs/decisions/architecture.md`.

`album-rating-page-desktop-redesign` merged to `master` on 2026-08-06 via merge commit
`c316da6` (rollback tag `pre-album-rating-page-desktop-redesign-merge` on the prior tip) —
branch retained per convention, not deleted. Reworked `DesktopRatingLayout` into a 3-section
bordered-card layout (artwork+meta | criteria-list+levels | Rank/Score slabs+radar chart),
since made responsive across 3 tiers (>=1024px / 768-1023px / <768px mobile untouched), plus a
run of same-day/next-day retouch and radar-chart polish passes (borders, contrast, label
abbreviation), then a motion pass (radar animation, a single "Evaluation progress n/total" box
pre-completion that crossfades to Rank/Score on the 6th rating, criterion-switch fade). Full
detail, including all chosen values, rejected approaches, and bugs found along the way: the
dated 2026-08-05/06 entries in `docs/decisions/album-rating-page.md`. The temporary dev-only
harness (`src/DevRatingPreview.tsx`, route `/dev-rating-preview`) added during the motion pass
was confirmed still present ahead of the merge (despite the prior note to remove it) and removed
in a pre-merge commit — not present on `master`.

`album-rating-page` merged to `master` on 2026-08-03 via merge commit `523d059` — branch
retained per convention, not deleted. **Branch ref is stale: 3 commits behind `master`**
(missing the post-merge polish pass `5e6f8af` and the docs commit `4b92722` recording a
concurrent-session collision/undo — fast-forward not yet done). Third UI attempt at rating
(see the two entries below): a dedicated route `/rate/:albumId?from=favorites|aoty` replacing both
`AlbumRatingDrawer` (deleted outright, confirmed unreferenced elsewhere) and the rejected
`album-rating-modal` branch (left untouched, not built on, not referenced). Genuinely
different desktop (originally 3 simultaneous fluid columns: artwork+radar chart, criterion-name
list, selected criterion's `RadioCard` levels — **superseded 2026-08-05 by the 3-section
bordered-card layout above**, this description is historical only) and mobile (2 sequential
screens: Overview list with checkmarks, Detail with full levels, auto-return + highlight after a
pick) layouts, not one layout scaled. New dependency `@chakra-ui/charts` (+ `recharts` transitively) for the radar
chart — first charting library in this project; the brief assumed a turnkey `RadarChart`
component but the package only exports composition primitives (`useChart`/`Chart.Root`/
`Chart.Tooltip`) wrapping Recharts' own chart components. Two real runtime-only bugs found and
fixed during the pre-build spike (Recharts requires an explicit `ResponsiveContainer` or it
silently renders 0×0; `Chart.Tooltip`'s `render` prop takes the raw data point, not a payload
wrapper) plus one found via live verification against real Supabase data (weight-tooltip
lookup used mismatched snake_case/camelCase keys, always showing "—" instead of the real
weight). Gate, progressive save, and score/rank computation are unchanged — reused as-is. Full
detail: `docs/decisions/album-rating-page.md`.

`album-rating-modal` — rejected, not merged, retained per convention (do not build on it or
reference its component structure). Wizard-style modal replacement for `AlbumRatingDrawer`,
one criterion per step. Rejected after review: level descriptions hidden behind a compact
numeric picker until interaction, no persistent summary while rating, and a modal's limited
footprint felt cramped. Superseded by `album-rating-page` above.

`album-rating-drawer` merged to `master` on 2026-07-30 (commit `aeb3f3f`) — branch retained per
convention, not deleted. Criteria Calibration part 6: a calibration-status gate (blocks rating
until Medium+ tier), a rating drawer (`AlbumRatingDrawer`, direct 1-5 level picker per
criterion, progressive save to `album_criteria_ratings`), and a score/rank display (rank badge
only on Favorites cards, full breakdown in the drawer's confirmation state). Live verification
against a real account surfaced and fixed a real bug: `solver.ts`'s "best-level values sum to
1" normalization claim doesn't hold jointly across independently-solved point estimates
(confirmed: summed to 1.308 on real data) — displayed score is now clamped to 100%, real fix
deferred (`deferred-work.md`). Also found: Medium tier can't distinguish middle levels (2-4),
so exact score ties are common and the `albumId` tie-break is load-bearing, not a rare edge
case. No engine/schema/Calibration UI files touched. The drawer component itself
(`AlbumRatingDrawer`) was subsequently replaced by `album-rating-page`'s dedicated page above
(an intermediate wizard-modal attempt, `album-rating-modal`, was built and rejected in
between) — the gate/score/rank logic from this pass is unchanged and still current. Full
detail: `docs/decisions/album-rating-drawer.md`.

`criteria-calibration-wiring` merged to `master` on 2026-07-30 (as part of this session's setup, before branching `album-rating-drawer`) — branch retained per convention, not deleted. Parts 5a+5b: wired the Calibration UI to the real engine and added Supabase persistence for calibration answers/weights/status. Full detail: `docs/decisions/criteria-calibration-wiring.md`.

`criteria-calibration-ui` and `criteria-calibration-engine` merged to `master` on 2026-07-30 — branches retained per convention, not deleted. Full detail: `docs/decisions/criteria-calibration-ui.md`, `docs/decisions/criteria-calibration-engine.md`.

`design-system-slant-take` merged to `master` on 2026-07-25 (see the historical section below) — branch retained per convention, not deleted. Naming note: the rename shipped in that effort supersedes the formal naming gates (friend test, domain check, trademark search) rather than completing them — see `docs/decisions/naming-decisions.md`'s 2026-07-25 entry. Still outstanding: favicon (stale, predates the design system), and the domain/GitHub-repo/Render-service name (still literally "metalreviews" — infra-level, not touched).

`album-identity-migration` merged to `master` on 2026-07-15 (see `docs/decisions/album-identity-migration.md` in the Past-decisions index) — branch retained per convention, not deleted.

(Update this section, not individual decision docs, when branch status changes.)

## Completed feature narratives & Past decisions (historical/reference — read only when relevant to the task at hand)

### Slant Take design system — ✅ COMPLETE (merged 2026-07-25)

The `design-system-slant-take` branch is merged to `master` (`--no-ff`, commit `a3eeb88`). All
nine passes verified: `tsc --noEmit` clean, `npx vitest run` 171/171. Rollback tag
`pre-slant-take-design-system` remains on `master`. Branch kept, not deleted, per project
convention. Full pass-by-pass history: `docs/decisions/slant-take-design-system.md`.

### Non-review post filtering during ingest — ✅ COMPLETE, verified live (2026-07-17)

`scripts/ingest.ts` skips roundups/retrospective columns from Angry Metal Guy and The
Progressive Subway via RSS `<category>` tag checks (`isGenuineReview`/`isAllowlistedFranchise`/
`shouldSkipPost`), logging skipped posts to the `skipped_posts` Supabase table
(`supabase/skipped_posts.sql`, already run). Verified against a live `npm run ingest`: known
roundup/retrospective-column posts from both sources were skipped and logged with zero
`albums`/`reviews` rows created; normal reviews from all three sources ingested unaffected. Full
decision + rationale: `docs/decisions/roundup-skip-fix.md`. Preceded by the read-only audit in
`docs/decisions/unknown-band-collision-audit.md`.

The 3 pre-fix stale rows the audit found (including the `Unknown Band | Unknown Album` sentinel)
were separately cleaned up the same day — see `docs/decisions/stale-row-cleanup.md`.

### Past decisions (load only when relevant)

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
- `chakra-v3-migration-plan.md` — Chakra v2→v3 migration, complete and verified (210/210 tests, `tsc` clean); full sequenced history (Steps 0–7)
- `chakra-v3-foundation-audit-brief.md` — re-examining v2-era styling hacks; eligible to start, not started
- `documentation-audit-june2026.md` — June 2026 doc-layer audit: findings and fixes
- `ingest-trigger-and-security.md` — ingest-trigger decision + dated security audit cross-check
- `score-parsing-bugfixes.md` — Progressive Subway footnote-digit-pollution bugfix
- `album-identity-diagnosis.md` — diagnostic: `computeId` collision, confirmed data loss
- `album-identity-decisions.md` — design decisions: album+source dedup, dual-key identity strategy
- `album-identity-migration.md` — schema + data migration: `albums` table, backfill; branch merged to `master` 2026-07-15
- `album-identity-ingest.md` — ingest-pipeline session: `resolveAlbumIdentity`, `computeId` deleted
- `album-identity-frontend-homepage.md` — home-page session: multi-source display, `dbMapping.ts`
- `album-identity-frontend-favorites.md` — `/favorites` session: `useFavoritesList` re-plumb, `findExistingAlbum`
- `album-identity-visibility-and-duplicate-fix.md` — home-page visibility filter + duplicate-check fixes
- `design-system-spec-slant-take.md` — reference spec for the Slant Take visual redesign, split across passes
- `slant-take-design-system.md` — consolidated decision doc for all nine passes plus two follow-up tweaks; Chakra v3 gotchas, badge positioning, `averageScore` vs raw `score`
- `naming-decisions.md` — product name (Slant Take), display face, logo mark, accent-colour change
- `deferred-work.md` — consolidated tracker of deferred/postponed work — check here first for what's outstanding
- `unknown-band-collision-audit.md` — read-only audit of non-review posts across AMG/PS/Metal Storm, RSS category-tag signal discovery
- `roundup-skip-fix.md` — RSS category-tag filtering, `skipped_posts` table, AMG allowlist
- `stale-row-cleanup.md` — migrated 3 pre-fix stale rows into `skipped_posts`, deleted orphaned albums
- `criteria-calibration-ui.md` — Phase 7 UI-only screen: selection/hold/fade state machine, Progress-vs-Accuracy split, `OptionCard`, Undo/Redo; branch merged to `master` 2026-07-30
- `criteria-calibration-engine.md` — preference graph + closure, contradiction handling, LP solver, ordering heuristic; under-determination finding, ranking-stability result, unvalidated accuracy thresholds; branch merged to `master` 2026-07-30
