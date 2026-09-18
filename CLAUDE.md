# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working conventions

- Always read the Working conventions, Commands, and Active branches sections fully before
  starting any task; consult the historical/reference section below only when the task at
  hand touches it
- Always show a plan and wait for approval before writing code
- After each completed feature, update this file (or the relevant `docs/decisions/` file — see below) with decisions made
- Target deployment: Render (current). Vercel migration is a possible future move — avoid permanent server dependencies where reasonably easy
- Code commenting style (WHY not what, what to comment, what to skip): see `docs/commenting-style-guide.md`.
- When a session identifies new deferred or postponed work, add it to `docs/decisions/deferred-work.md` rather than only stating it inline in that session's own doc.
- `docs/decisions/` holds prose decision docs only. Raw/generated data a diagnostic script
  produces (CSV/JSON/TXT dumps) goes in the sibling `docs/data/<cluster>/` tree instead — mirror
  the decision-doc cluster's folder name (e.g. `docs/data/criteria-calibration/`) — so it can be
  excluded from the Project Knowledge GitHub-connector sync. `docs/data/<cluster>/` is still
  committed to git, though: only synthetic/aggregate diagnostic output belongs there. Diagnostic
  output that contains real personal session data (real session identifiers, real answer/
  preference sequences, anything traceable to an actual account) goes to the further sibling
  `docs/backups/` instead — gitignored, never committed, same as any other personal preference
  data kept on disk. This isn't a blanket "stop committing data" rule; it's specifically the
  personal-session subset. When adding a new data-producing script, check before the first write
  whether its output includes real personal session identifiers — if so it goes to
  `docs/backups/` by default, not `docs/data/<cluster>/`; otherwise write straight to the correct
  sibling folder rather than `docs/decisions/` and moving it later. See
  `docs/decisions/documentation-audit-june2026.md`'s 2026-08-26 sections for the reorg that
  established the `docs/data/` split, and `docs/decisions/criteria-calibration-summary.md`'s data
  index for the 2026-09-18 audit that added this carve-out after real session data was found
  committed under `docs/data/criteria-calibration/`.
- `scripts/` root holds only live code: production modules (`ingest.ts`, `ingest-cli.ts`,
  `musicbrainz.ts`, `normalizeKey.ts`, `supabaseClient.ts`), reusable dev tools meant to be run
  repeatedly (e.g. `debug-preference-graph.ts`), `migrations/`, `__tests__/`, and any
  self-contained investigation subfolder (e.g. `lab-eps-ratio-test-2026-08-16/`, used when an
  investigation needs more than one source file or its own test config). A script written to
  answer one question and then archived as history — run once or a handful of times, not
  reused going forward — goes in `scripts/diagnostics/` instead, named with its
  `<topic>-YYYY-MM-DD.ts` date suffix as before. This includes one-off `diagnose-*`, `verify-*`,
  `*-recon-*`, and `seed-*`/admin scripts once their run is done; a `seed-*`/admin script stays
  in `scripts/` root only if it's still meant to be reused for future runs, not just kept as a
  record. Its generated output still follows the rule above (`docs/data/<cluster>/`, not next to
  the script). No retention/deletion policy for `scripts/diagnostics/` — scripts there are inert
  history, unlike a stale branch ref, so nothing there goes stale by just sitting.
- Docs that are read repeatedly across sessions and grow large after a decision ships get a
  short summary block prepended once shipped-and-verified, so future sessions can skip the
  full body (currently done for `ingest-trigger-and-security.md` and
  `unknown-band-collision-audit.md`). Apply this only when a doc is both large and frequently
  re-read — not as a default for every decision doc.
- Periodically (roughly monthly) review `deferred-work.md` for shipped items older than
  ~30 days whose full detail already lives in a decision doc, and compress them to one-liners
  — and check for Project-Knowledge/repo duplication per `documentation-governance.md`.
- Design-discovery content vs. implementation-status docs have separate, non-duplicating homes
  (Project Knowledge vs. `docs/decisions/`), and every new `docs/decisions/` file needs an
  index entry in the same commit — see `documentation-governance.md`.
- Commit at the end of each individual pass in a multi-pass effort, not only at the very end —
  uncommitted work across many passes has no real save point.
- A shipped feature's top-of-file "✅ COMPLETE" narrative is temporary, not permanent — once its
  immediate follow-on work is done, collapse it into a single line in the Past-decisions index,
  same as everything else. The decision doc keeps full detail regardless; only the
  mandatory-read copy shrinks.
- File order matters: operationally-relevant content (conventions, commands, active branch
  state) comes first, since every session reads it. Historical completion narratives and the
  Past-decisions index go last — reference material, read only when the task at hand needs it.
- **Branch lifecycle**: a merged branch (`--no-ff`) may be deleted, local + remote, once
  > =14 days have passed since its merge date — safety rests on the merge commit's first
  > parent (always the pre-merge rollback point) plus the `docs/decisions/branch-log.md`
  > entry as the durable record, not on keeping the ref. Review cadence: folded into the
  > existing roughly-monthly `deferred-work.md` review — same session, check
  > `branch-log.md` for anything >=14 days past merge, delete what qualifies. Exception: a
  > branch ref confirmed stale (behind master — master has commits not reachable from the
  > branch) is deleted regardless of age, since a stale ref is actively misleading rather
  > than "not yet due." Branches that were never merged (rejected/abandoned work) are
  > **not** covered by this automatic policy — deleting them loses code that exists
  > nowhere else, so each such branch is a separate, explicit decision. On deletion,
  > append a note to the branch's `branch-log.md` line rather than removing the line.

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

No branches currently in progress.

Most recent merge: `personal-data-exposure-remediation` — Phase 1 (of 3) of a personal-data-
exposure remediation: relocated 11 files containing real Dan-account calibration session data
from committed `docs/data/criteria-calibration/` to gitignored `docs/backups/criteria-
calibration/`; added a `CLAUDE.md` carve-out (this section's own data-handling rule) so it
doesn't recur; updated every citing decision doc. Credential scan of full git history came back
clean — nothing to rotate. History purge (Phase 2, `git filter-repo`) not yet run — gated on a
separate explicit go-ahead. Merged to `master` `--no-ff` at `c383e63` on 2026-09-18. Rollback
tag: `pre-merge-personal-data-exposure-remediation`. Full detail: `docs/decisions/branch-log.md`.

Most recent merge: `deferred-work-audit-2026-09-18` — full systematic audit of
`deferred-work.md` (never previously had one): 2 items fixed in place (stale claims about
constants already deleted elsewhere in the codebase), 4 items relocated to `finished-work.md`
(3 with a verification citation), including a 114-line item that had silently answered its own
title. `deferred-work.md` 1215 → 1078 lines. Merged to `master` `--no-ff` at `ae90a9c` on
2026-09-18. Rollback tag: `pre-merge-deferred-work-audit-2026-09-18`. Full detail:
`docs/decisions/branch-log.md`.

Most recent merge: `artwork-releases0-tier3-fallback` — Concern E of the 2026-09-17 artwork/MB-
enrichment diagnostic brief, closing out the full brief (Concerns A–E): a third artwork tier in
`lookupMusicBrainz`, reached only when the release-group and `releases[0]` CAA lookups both
fail, sweeps up to 10 other releases in the group via `pickArtwork()`, fixing MB search's
no-relevance-sort `releases[0]` arbitrary pick. Isolated in its own `try/catch` so a tier-3
failure can't flip the outer `status` away from `'ok'`. No schema change. 52/52 files, 395/395
tests, `tsc` clean on `master` post-merge. Live-verified post-fix: Raphael Weinroth-Browne —
*Empyrean* now resolves real artwork via the exact sibling release (`d13afb14-...`) identified
during Concern B. No backfill script — resolves via the existing organic ingest path. Merged to
`master` `--no-ff` at `9f4839b` on 2026-09-17. Rollback tag:
`pre-merge-artwork-releases0-tier3-fallback`. Full detail: `docs/decisions/artwork.md` ("Concern
E — `releases[0]` arbitrary pick, tier-3 artwork fallback").

Most recent merge: `artwork-picker-approved-fallback` — Concern B of the 2026-09-17 artwork/MB-
enrichment diagnostic brief: shared `pickArtwork()` helper (front-preferred, falls back to the
first `approved:true` CAA image) applied at both CAA call sites in `lookupMusicBrainz`,
replacing the duplicated `front:true`-only filter. No schema change. 52/52 files, 392/392
tests, `tsc` clean on `master` post-merge. Live-verified post-fix: 1 of 2 confirmed rows
(slq — *Crown Shyness*) now resolves real artwork; the other (Raphael Weinroth-Browne —
*Empyrean*) still doesn't, but that's the separate, already-flagged `releases[0]`-arbitrary-
pick issue, not a regression in this fix. Merged to `master` `--no-ff` at `b4e95d2` on
2026-09-17. Rollback tag: `pre-merge-artwork-picker-approved-fallback`. Full detail:
`docs/decisions/artwork.md` ("Artwork picker: front-preferred, approved-fallback").

Most recent merge: `artwork-mb-status-field` — Concern A of the 2026-09-17 artwork/MB-
enrichment diagnostic brief: `MusicBrainzData` gains a `status: 'ok' | 'not_found' | 'error'`
field so the backfill loop's `mb_lookup_attempts` retry budget no longer burns equally on a
transient request error as on a confirmed-empty MB search (errors no longer increment the
counter). No schema change. 52/52 files, 388/388 tests, `tsc` clean on `master` post-merge.
Merged to `master` `--no-ff` at `5a276c5` on 2026-09-17. Rollback tag:
`pre-merge-artwork-mb-status-field`. Full detail: `docs/decisions/artwork.md` ("`lookupMusicBrainz`
status field: not_found vs error").

Most recent merge: `metalstorm-fetch-status-logging` — classifies and logs why a Metal Storm
fetch yielded no score (`cloudflare-challenge` by status/title only, `no-user-score`,
`unexpected-page`, `fetch-error`) plus a per-run summary line; no change to stored data.
52/52 files, 385/385 tests, `tsc` clean on `master` post-merge; one live load verified `scored`
after a live-caught false positive was fixed. The real-challenge path is unobserved until the
next Render run. Merged to `master` `--no-ff` at `f54c25b` on 2026-09-17. Rollback tag:
`pre-merge-metalstorm-fetch-status-logging`. Full detail:
`docs/decisions/metalstorm-ingest-memory-fix.md` ("Fetch-outcome logging").

Most recent merge: `metalstorm-ingest-memory-fix` — fixes the 2026-09-16 Render OOM: bounded
Metal Storm Puppeteer concurrency (2), 30s `protocolTimeout`, Chrome memory args, resource
blocking, close timeouts; no schema change. 51/51 files, 375/375 tests, `tsc` clean on `master`
post-merge. Merged by Dan's decision ahead of full resource-blocking parity (3/3 non-null scores
matched; the rest was invalidated by Cloudflare blocking local testing). Three verifications
open in `deferred-work.md` section B. Merged to `master` `--no-ff` at `7e248b4` on 2026-09-16.
Rollback tag: `pre-merge-metalstorm-ingest-memory-fix`. Full detail:
`docs/decisions/metalstorm-ingest-memory-fix.md`.

For the full branch history (including merged branches), see
`docs/decisions/branch-log.md`.

Most recent merge: `album-evaluation-bg-updates` (mobile header on `/rate/:albumId` — artwork/
band/album — moves from the inherited `surface.ratingCardFill` to `surface.card`, matching
desktop's existing convention there; the "Evaluation progress" slab, shared by mobile and
desktop via `RatingSlab.tsx`, moves from `ember.950` to `sand.800`). `tsc` clean, 367/367 tests.
Dan has since live-verified both changes on his own account. Merged to `master` `--no-ff` at
`eac0794` on 2026-09-16. Rollback tag: `pre-merge-album-evaluation-bg-updates`. Full detail:
`docs/decisions/album-evaluation-bg-updates.md`.

Most recent merge: `favorites-row-mobile-compact-redesign` (mobile `FavoriteListItemRow`
restructured from vertical artwork-first to horizontal, matching desktop's row shape, plus new
skeleton loading on both mobile and desktop artwork; several retouch passes followed — band
font, separator/genre placement iterated a few times, ending with genre back in its own
top-zone block and thinner full-width dividers, vertical centering resolved via the title
column's own flex layout rather than an `align` prop; also "Rate" renamed to "Evaluate" and a
new "Listen" footer button added, reusing the review-grid card's existing menu via a new shared
`src/components/ListenMenuItems.tsx`, footer order Evaluate → Listen → Remove). 50/50 test
files, 367/367 tests, `tsc` clean, both re-confirmed on `master` post-merge. The genre/layout
retouch and the Evaluate/Listen additions were merged ahead of a live check on Dan's account
(`/favorites` needs login, no credentials stored). Dan has since live-tested and confirmed the
desktop Listen button/menu on his real account (including the `getAnchorElement` positioning
fix below); the genre/layout retouch and the 3-button mobile footer collapse have not been
separately called out as checked and should still be treated as unconfirmed until he does.
Merged to `master` `--no-ff` at `cda29d2` on 2026-09-15. Rollback tag:
`pre-merge-favorites-row-mobile-compact-redesign`. Full detail:
`docs/decisions/favorites-row-mobile-compact-redesign.md`.

Most recent merge: `docs-hygiene-sept2026` (docs-only, no application code — five-phase
documentation/branch hygiene pass: deleted 18 confirmed-merged stale branches per the 14-day
policy, collapsed 13 old Active Branches narratives plus two Completed Feature Narratives into
the existing Past-decisions index one-liners, indexed two orphaned decision docs, relocated one
resolved `deferred-work.md` item to `finished-work.md` and fixed a self-contradicting misplaced
paragraph found in the process. Branch kept, not deleted, per project convention until past the
14-day window). Merged to `master` `--no-ff` at `7e5eb32` on 2026-09-15. Rollback tag:
`pre-merge-docs-hygiene-sept2026`. Full detail: this section's own prior state plus the branch's
5 individual commit messages (`git log docs-hygiene-sept2026`).

Most recent work landed as direct commits to `master` (no feature branch, no rollback tag —
deviates from this project's usual branch+merge+rollback-tag convention; flagged here rather
than silently matching the pattern below): (1) a previously-stalled, already-finished design-
review pass on four Your Taste tab files (badge stacking, spacing, hover contrast, fingerprint
tooltip), confirmed with Dan it was done work that just hadn't been committed; (2) a mobile
layout pass — Guide tab's carousel drops gutter Prev/Next buttons for a full-width card with
tappable pagination dots, Calibration tab's `ActionRail` becomes a horizontal row above the
comparison cards on mobile instead of a vertical column beside them (desktop unchanged in both
cases). 358/358 tests, `tsc` clean, verified live in-browser at both breakpoints on Dan's real
account (read-only interactions — no Undo/Redo/Restart clicks). Full detail:
`docs/decisions/criteria-calibration/criteria-calibration-mobile-guide-and-rail-layout.md`.

13 further merges dated 2026-08-16 through 2026-08-26 are folded into the `criteria-calibration-summary.md`
index entry below (Past decisions section), same treatment as the 3 most recent merges already
collapsed there — see that index line for the one-clause summary of each, and
`docs/decisions/branch-log.md` for merge hashes/dates/rollback tags.

(Update this section, not individual decision docs, when a new branch is started or a
branch's status changes.)

## Past decisions (historical/reference — read only when relevant to the task at hand)

Detailed rationale, gotchas, and "what NOT to change" notes for completed features live in `docs/decisions/`. **Read the matching file before changing related code** — don't rely on memory of past sessions for these areas. (The Slant Take design system, merged 2026-07-25 at `a3eeb88`, and the non-review post filtering / ingest fix, 2026-07-17, are long-complete — full detail lives in their own index lines below, `slant-take-design-system.md` and `roundup-skip-fix.md`, and merge facts in `docs/decisions/branch-log.md`; no separate narrative kept here.)

- `architecture.md` — current-state technical reference: scraper/ingestion, frontend, routes, types/mapping, score normalization, toast convention, adding a new scraper source
- `artwork.md` — MusicBrainz/Cover Art Archive artwork fetching, skeleton shimmer, square aspect ratio
- `persistent-history-superseded.md` — historical only: original JSON merge-guard approach
- `refresh-button.md` — Express server, manual refresh button, polling, controls bar styling pattern
- `genre-data.md` — MusicBrainz genre lookup (two-level), source badge + genre tag styling
- `genre-artwork-bugfixes.md` — RSS title pollution root cause, the three bugs it caused, and their fixes
- `controls-bar.md` — score filter, review counter, responsive flex layout breakpoints
- `design-tokens.md` — `src/theme.ts` token groups, badge tokens, button style sets, `/style-guide` dev route. **Exhaustive by test** since 2026-09-12: `src/__tests__/designTokensDoc.test.ts` fails if a custom semantic colour, text style or spacing token is added without a line here. `consistency-button-tokens.md` (2026-09-16) fixed one real colour mismatch (`ErrorBoundary.tsx`'s hardcoded `orange` vs. the app's `ember`) and aligned three live `gray` buttons onto `secondaryButton`, merged to `master` `--no-ff` at `9ca0534`; rollback tag `pre-merge-consistency-button-tokens`
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
- `album-identity-summary.md` — gateway/index for the Album Identity decision-doc cluster (7 files, now in `docs/decisions/album-identity/`); read this first for anything album-identity-related
- `design-system-spec-slant-take.md` — reference spec for the Slant Take visual redesign, split across passes
- `slant-take-design-system.md` — consolidated decision doc for all nine passes plus two follow-up tweaks; Chakra v3 gotchas, badge positioning, `averageScore` vs raw `score`
- `naming-decisions.md` — product name (Slant Take), display face, logo mark, accent-colour change
- `deferred-work.md` — consolidated tracker of deferred/postponed work — check here first for what's outstanding
- `finished-work.md` — the closed-items counterpart to `deferred-work.md`: items confirmed fully shipped/verified/resolved, relocated there rather than deleted
- `auth-email-smtp.md` — Resend/SMTP findings: Supabase's default mailer refuses delivery outside the project org team; custom SMTP lifts that but hits Resend's own sandbox restriction until a domain is verified
- `unknown-band-collision-audit.md` — read-only audit of non-review posts across AMG/PS/Metal Storm, RSS category-tag signal discovery
- `roundup-skip-fix.md` — RSS category-tag filtering, `skipped_posts` table, AMG allowlist
- `stale-row-cleanup.md` — migrated 3 pre-fix stale rows into `skipped_posts`, deleted orphaned albums
- `criteria-calibration-summary.md` — gateway/index for the entire Criteria Calibration decision-doc cluster (24 files + supporting data, now in `docs/decisions/criteria-calibration/`); read this first for anything calibration-related. Most recent merge: `criteria-calibration-page-redesign` (single `/calibration` route with a Guide/Calibration/Results tab bar, full design-review pass, themed progress bar with reduced-motion/ARIA fixes, `design-tokens.md` made exhaustive and test-enforced), merged to `master` `--no-ff` at `028ff34` on 2026-09-12; rollback tag `pre-merge-criteria-calibration-page-redesign` — full detail: `docs/decisions/criteria-calibration/criteria-calibration-page-redesign.md`. Most recent merge: `criteria-calibration-checkpoint-visual-refresh` (checkpoint screen title Clash Display → Inter, buttons → `primaryButton`/`secondaryButton` tokens, spacing → even 32px rhythm), merged to `master` `--no-ff` at `8aeeec1` on 2026-09-15; rollback tag `pre-merge-criteria-calibration-checkpoint-visual-refresh` — full detail: `docs/decisions/criteria-calibration/criteria-calibration-checkpoint-visual-refresh.md`. Most recent merge: `criteria-calibration-results-tab-design-brief` (implements the "Your Taste" tab against real solved weights — gate is now `tier !== 'none'`, not `hasWeights`), merged to `master` `--no-ff` at `e1e7bb6` on 2026-09-13; rollback tag `pre-merge-criteria-calibration-results-tab-design-brief` — full detail: `docs/decisions/criteria-calibration/criteria-calibration-results-tab-design-brief.md`. Also merged: `criteria-calibration-freeze-checkpoint` (fifth checkpoint — explicit acknowledgement that degree 2 is "frozen" for the four preference shapes that never reach `coverage-complete`; `DEGREE_2_FREEZE_ANSWER_THRESHOLD = 78`), merged `--no-ff` at `f075eae` on 2026-08-26 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-freeze-checkpoint.md`. Also merged: `criteria-calibration-checkpoint-copy-rewrite` (rewrites all four checkpoint screens' copy against six rules; tier badge permanently visible via a new `tier` prop), merged `--no-ff` at `9f7eb54` on 2026-08-26 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-checkpoint-copy-rewrite.md`. Also merged: `criteria-calibration-normalized-coverage-width-diagnostic` (docs+script only; tests a NORMALIZED coverage-width threshold — verdict negative), merged `--no-ff` at `907d70a` on 2026-08-25 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-normalized-coverage-width-diagnostic.md`. Also merged: `criteria-calibration-accuracy-threshold-recalibration` (docs-only; fits `SCORE_SPREAD_*` constants against ground truth, finds no cutoff set generalizes — superseded by degree-tiers-and-progress below), merged `--no-ff` at `d88ee99` on 2026-08-25 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-accuracy-threshold-recalibration.md`. Also merged: `criteria-calibration-degree-tiers-and-progress` (replaces threshold-based accuracy tiers with degree-tied ones — Unfocused/Blurry/Clear/Sharp — reverses tiered-checkpoints' no-continuation rule for the top tier), merged `--no-ff` at `4b564d8` on 2026-08-25 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-degree-tiers-and-progress.md`. Also merged: `criteria-calibration-tiered-checkpoints` (retires Brief 3's auto-escalation signal for four explicit checkpoints; deletes ~876 lines and 7 `user_calibration_status` columns, retiring the write-race risk), merged `--no-ff` at `892f79c` on 2026-08-17 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-tiered-checkpoints.md`. Also merged: `criteria-calibration-escalation-signal-candidates` (docs-only diagnostic; all five auto-escalation signal variants fail, recommends explicit checkpoints instead), merged `--no-ff` at `f5e3a6c` on 2026-08-16 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-escalation-signal-candidates.md`. Also merged: `criteria-calibration-harris-ratio-test` (ships the `EPS = 1e-9` near-singular-pivot cure via a Harris two-pass ratio test in `simplex.ts`; also subsumed `criteria-calibration-eps-ratio-test-diagnostic`), merged `--no-ff` at `ca7f905` on 2026-08-16 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-harris-ratio-test.md`. Also merged: `criteria-calibration-solver-crash-safety-net` (contains the LP solver's near-singular breakdown at the page boundary with auto-recovery and a route-level `ErrorBoundary`; also subsumed `criteria-calibration-synthetic-oracles`), merged `--no-ff` at `f7f6f3c` on 2026-08-16 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-solver-crash-safety-net.md`. Also merged: `criteria-calibration-cross-degree-undo-redo-fix` (fixed `degree` staying pinned after Undo/Redo crossed a degree boundary without a page refresh), merged `--no-ff` at `46fbc98` on 2026-08-16 — full detail: `docs/decisions/criteria-calibration/criteria-calibration-cross-degree-undo-redo-fix.md`. Also merged: `docs-album-identity-rating-reorg` (docs-only reorg of the 7 `album-identity-*` decision docs into their own folder with a gateway file), merged `--no-ff` at `0146773` on 2026-08-16 — full detail: `docs/decisions/documentation-audit-june2026.md` (2026-08-16 section). Also merged: `docs-criteria-calibration-reorg` (docs-only folder+gateway reorg of the Criteria Calibration cluster), merged `--no-ff` at `97b4e3d` on 2026-08-16. Account state: Dan's account has 71 validated real answers (not empty) as of the 2026-08-15 second validation session — see `criteria-calibration-second-session-reset.md`'s "Outcome" section. LP warm-start's O(n²) solve-cost ceiling remains open — see `criteria-calibration-lp-warm-start.md`. **Before touching `simplex.ts`, read `criteria-calibration-harris-ratio-test.md`'s "What NOT to change".** **Before touching degree escalation, stopping, the accuracy tiers shown to the user, or the calibration progress bar, read `criteria-calibration-degree-tiers-and-progress.md`'s "What NOT to change" first, then `criteria-calibration-tiered-checkpoints.md`'s — the newer doc reverses several of the older one's choices, and both reverse designs older still.**
- `album-rating-page.md` — dedicated `/rate/:albumId` route replacing the drawer and rejected modal; soft-gated since the 2026-08-09 reversal; has a summary block at the top of the file itself
- `album-rating-drawer.md` — the original flat-drawer rating UI this page replaced, plus the Criteria Calibration part-6 gate/score/rank wiring still in effect
- `album-rating-page--concept-draft.md` — stub only; full Concept Draft content lives in Project Knowledge, not this repo
- `documentation-governance.md` — two-layer ownership rule (design-discovery vs. implementation-status docs) and same-commit indexing rule for `docs/decisions/`
- `album-rating-soft-gate.md` — 2026-08-09 hard→soft gate reversal and why
- `favorites-row-desktop-redesign.md` — 128px flush artwork, `rankOverlayBadge` token, delete-confirmation dialog; branch merged to `master` 2026-08-07
- `favorites-row-mobile-layout.md` — vertical artwork-first mobile layout for `FavoriteListItemRow`, 768px `@media` split; branch merged to `master` 2026-08-07 (superseded by `favorites-row-mobile-compact-redesign.md`'s horizontal layout below)
- `favorites-row-mobile-compact-redesign.md` — supersedes the above: horizontal mobile layout matching desktop's row shape (128px artwork, stacked truncated title, footer separator), plus new skeleton loading on both mobile and desktop artwork (previously absent); later passes moved genre placement a few times before landing back in its own top-zone block, and added an Evaluate rename + new Listen footer button (shared with the review-grid card's menu via `ListenMenuItems`) — see the doc's own "Fourth retouch" and "New footer action" sections; those two passes were merged ahead of Dan's live check, so treat their on-screen result as unverified until he looks
- `design-system-audit-2026-08.md` — read-only token/consistency audit across the whole app; 3 open items await Dan's decision (card shadow, radius token naming, proposed tokens)
- `metalstorm-ingest-memory-fix.md` — 2026-09-16 Render OOM: unbounded Metal Storm tab concurrency (not a leak) → bounded pool, 30s `protocolTimeout`, Chrome memory args, resource blocking, close timeouts; RSS window already caps retries so no schema change; Cloudflare challenge pages yield `null` scores
- `streaming-links.md` — "Listen" chip on the album card: generated (non-exact) search-links to Bandcamp/Spotify/YouTube Music/Deezer, why exact-match isn't viable, `simple-icons` dependency scoped to the menu, overlay-scrim standing pattern extended to the new chip; landed as direct commits to `master`, no feature branch merged (see the doc's own "Git history" section)
