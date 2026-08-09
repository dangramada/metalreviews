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

`criteria-calibration-joint-point-estimate` — not yet merged, currently checked out.
Replaces `solver.ts`'s independent-axis point estimate (midpoint of each value's
separately-solved min/max range) with a single joint Chebyshev-center LP solve, fixing a
confirmed live bug where reported values didn't sum to 1 as claimed (1.308 on a real
production account). `computeSolverAccuracy` deliberately left unchanged per Dan's
explicit scope call (range-width method, not redefined around the new joint point) — only
`LevelValue.point` (feeding album scores and candidate-ambiguity ranking) changed. Verified
exact normalization on both the 5-criterion historical fixture and a newly-embedded real
6-criteria/33-answer production fixture (1.308 → 1.0 exactly). Measured (not assumed): does
**not** move the degree-3 escalation point on real data — the separate levels-2–5 flatness
issue is unaffected. `tsc`/lint/vitest clean (224/224 tests). Full detail:
`docs/decisions/criteria-calibration-joint-point-estimate.md`.

`criteria-calibration-dominance-filter` merged to `master` on 2026-08-09 via merge
commit `bcfbeed` (rollback tag `pre-merge-dominance-filter` on the prior tip) — branch
retained per convention, not deleted. `generateCandidatesForSubset` now rejects dominated
candidate pairs (one profile weakly >= the other on every varied criterion, strictly >
on at least one) via a new `isDominatedPair` check, alongside the existing full-tie
guard — such pairs offer no real trade-off and previously could be asked/ranked
high-priority. Repro: 12 dominated/tied pairs across 59 simulated questions pre-fix, 0
across 47 post-fix (post-fix run naturally exhausts sooner — dominance pressure shrank
candidate pools, not a separate effect). Retry-attempt margin against the existing
120-attempt cap: worst case (degree 2) averages 16.5 attempts, ~5x headroom. No change to
the real 31-answer historical session's Medium-threshold crossing point (still answer
19) — that replay never calls the candidate generator. `tsc`/lint/vitest all clean
post-merge (223/223 tests). Full detail: `docs/decisions/criteria-calibration-dominance-filter.md`.

`criteria-calibration-progress-ring-accuracy` merged to `master` on 2026-08-09 via merge
commit `8efa3ac` (rollback tag `pre-merge-progress-ring-accuracy` on the prior tip) —
branch retained per convention, not deleted. Fixes a live contradiction Dan hit
(Progress ring at 100% while Accuracy label read "Low"): the ring was driven by stale
canonical-pair-coverage bookkeeping while the Accuracy label used the real solver
accuracy. Both the ring and the Accuracy number now derive from the same
`computeSolverAccuracy` call — a deliberate reversal of the original 28 July design that
kept Progress and Accuracy as two distinct metrics. `sessionProgress.ts` and its test
deleted outright (no other consumer). `tsc`/lint/vitest all clean post-merge (222/222
tests). Full detail: `docs/decisions/criteria-calibration-medium-gate-redesign.md`'s
2026-08-09 entry.

`criteria-calibration-medium-gate-redesign` merged to `master` on 2026-08-09 via merge
commit `5555b7e` (rollback tag `pre-merge-criteria-calibration-medium-gate-redesign` on the
prior tip) — branch retained per convention, not deleted. Redefines Medium tier:
`isMediumTierReached` no longer checks exhaustive canonical degree-2 pair coverage
(measured bookkeeping, not model determinacy — one production account reached old-Medium
at 0.60 solver accuracy with levels 2-4 fully unconstrained for every criterion); it's now
`computeSolverAccuracy(result) >= MEDIUM_ACCURACY_THRESHOLD` (0.85, explicitly provisional,
same unvalidated status as the 0.92/0.97 High/Very High thresholds — final calibration
deferred to a planned future real-calibration session). `MAX_AMBIGUOUS_GAP` decoupled from
gating (UX pacing only now). Migration: the one production account previously at Medium
(`eec42cd4-...`) re-gated to `'none'` via a direct Supabase write, `accuracy_value` (0.599)
left untouched as an accurate record under the new rule. Fixture re-check against the real
31-answer historical session: new gate first fires at answer 19 (accuracy 0.8715), close to
the real session's own ~20-answer degree-2 milestone. Full detail:
`docs/decisions/criteria-calibration-medium-gate-redesign.md`.

`album-eval-rank-score-reorder` merged to `master` on 2026-08-08 via merge commit `8781e3b` —
branch retained per convention, not deleted. Swaps the Rank/Score block's DOM order (Score/
light-bg first, Rank/ember-bg second) and tightens mobile-only vertical padding on both slabs to
a uniform 8px (desktop unchanged at 16px/12px), across the shared `RatingProgressBox`/
`RatingSlab` used by both `DesktopRatingLayout` and `MobileRatingLayout`. Live-verified via a
temporary `/dev-rating-preview` route (no test credentials available this session), removed
before finishing. Full detail: `docs/decisions/album-rating-page.md`'s 2026-08-08 entry.

`mobile-album-evaluation-redesign` merged to `master` on 2026-08-08 via merge commit `9db9464`
(rollback tag `pre-merge-mobile-album-evaluation-redesign` on the prior tip) — branch retained
per convention, not deleted. Stages 1-4 of 4a complete and live-verified: `MobileRatingLayout`
rebuilt to match `DesktopRatingLayout`'s bordered-card language, a tap-to-open radar-chart modal
on Screen 1, removal of the old "View Your Evaluation" summary dialog (`RatingSummaryView.tsx`
deleted outright), and selection feedback + screen transitions (`MobileScreenTransition`'s
unified two-panel slide, a `revealed` boolean gate fixing a real Rank/Score race, plain
`sand.200` `_checked` styling per Dan's request) after four live-testing revisions. One open
follow-up: stage 4b (sticky album-info/criterion-name headers) — two approaches tried and
reverted, not present in this merge; tracked in `docs/decisions/deferred-work.md` (Section A) so
a future session doesn't redo that research. `FEEDBACK_MS`/`PAUSE_MS`/`SLIDE_MS` timing also
still needs Dan's live feel-confirmation. Full detail: `docs/decisions/album-rating-page.md`'s
2026-08-07/08 dated entries.

`favorites-row-mobile-layout` merged to `master` on 2026-08-07 via merge commit `2a90198` —
branch retained per convention, not deleted. Mobile layout for `FavoriteListItemRow`, completing
the `favorites-row-desktop-redesign` restyle (merged same day, commit `5055ba7`, branch also
retained). Both branches' full detail moved to the Past-decisions index below now that the
desktop→mobile follow-on is done; remaining open item (desktop's `Tooltip`s untested on touch)
tracked in `docs/decisions/deferred-work.md`.

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
- `favorites-row-desktop-redesign.md` — 128px flush artwork, `rankOverlayBadge` token, delete-confirmation dialog; branch merged to `master` 2026-08-07
- `favorites-row-mobile-layout.md` — vertical artwork-first mobile layout for `FavoriteListItemRow`, 768px `@media` split; branch merged to `master` 2026-08-07
- `design-system-audit-2026-08.md` — read-only token/consistency audit across the whole app; 3 open items await Dan's decision (card shadow, radius token naming, proposed tokens)
