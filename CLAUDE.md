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

For the full branch history (including merged branches), see
`docs/decisions/branch-log.md`.

No active branches currently — most recent merge was
`criteria-calibration-second-session-reset` (admin/tooling + data operation: wiped Dan's
completed 70-answer calibration session so a second validation session can be run;
`album_criteria_ratings` untouched), merged to `master` `--no-ff` at `ea0b2a4` on 2026-08-15.
Rollback tag: `pre-merge-criteria-calibration-second-session-reset`. Note the reset must
DELETE, not upsert — `answer_count`/`fired` are guarded monotonic and an upsert cannot clear
them; `archive-and-reset-calibration.ts --reset` is disabled for that reason. Full detail:
`docs/decisions/criteria-calibration-second-session-reset.md`. Outstanding: the in-browser
fresh-state check was not completed (page is behind auth) — worth a glance before starting
the new session; score/rank badges stay absent app-wide until the new session's first commit.

Carried forward from `criteria-calibration-lp-warm-start` (`c2861ab`, 2026-08-15 —
`docs/decisions/criteria-calibration-lp-warm-start.md`): the computation is still O(n²) — a
constant factor was removed, not the complexity; the Web Worker decision is postponed, not
rejected; `nextAction` still duplicates `computeCommitState`'s `solveValues` (all in
`deferred-work.md`).

Carried forward from the previous merge (`criteria-calibration-weights-write-race-fix`,
`3e679a7`, 2026-08-15 — `docs/decisions/criteria-calibration-weights-write-race.md`):
`last_eligible_top10`/`last_change_answer_index` remain unguarded and can regress backward
via the same write race, a confirmed correctness risk to the already-shipped Brief 3
auto-escalation signal (flagged, not routine — see `deferred-work.md`); `RANKING_TEST_SET`
is also still not per-user (older, unrelated item, see `deferred-work.md`).

(Update this section, not individual decision docs, when a new branch is started or a
branch's status changes.)

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
- `criteria-calibration-wiring.md` — parts 5a/5b: wired `CriteriaCalibrationPage.tsx` to the real in-memory `CalibrationSession` + `nextAction`, then added Supabase persistence (`user_calibration_answers`/`user_criterion_weights`/`user_calibration_status`, undo/redo race safety, resume-on-reload); the original "self-correcting" write-race assumption in Part 5b was later found wrong, see `criteria-calibration-weights-write-race.md`
- `favorites-row-desktop-redesign.md` — 128px flush artwork, `rankOverlayBadge` token, delete-confirmation dialog; branch merged to `master` 2026-08-07
- `favorites-row-mobile-layout.md` — vertical artwork-first mobile layout for `FavoriteListItemRow`, 768px `@media` split; branch merged to `master` 2026-08-07
- `criteria-calibration-medium-gate-redesign.md` — 2026-08-08: diagnosed and fixed degree-2 questions being extremes-only (levels 2-4 indistinguishable, causing real score ties); traced to `coldStartProfilesForPair` hardcoding pure-extreme comparisons
- `design-system-audit-2026-08.md` — read-only token/consistency audit across the whole app; 3 open items await Dan's decision (card shadow, radius token naming, proposed tokens)
- `two-phase-simplex-rewrite.md` — `simplex.ts`'s LP solver rewritten Big-M -> two-phase; fixes a numerical blowup (~1e14 garbage values silently reported as `feasible: true`) found via a 42-answer oracle-driven diagnostic; branch merged to `master` 2026-08-09
- `criteria-calibration-dominance-filter.md` — 2026-08-09: `generateCandidatesForSubset` now rejects dominated/tied candidate pairs (a dominated pair offers no real trade-off); reproduced systematically, 12 dominated/tied pairs found across 59 rounds of a naive-sum-consistent oracle
- `criteria-calibration-coverage-weighted-candidates.md` — 2026-08-09: `generateCandidatesForSubset` weights degree-2+ level sampling toward under-covered levels instead of uniform random, fixing a degree-2 refinement stall (most candidates landing on near-flat combinations)
- `criteria-calibration-joint-point-estimate.md` — 2026-08-09: `solveValues`'s reported `.point` values now come from a single joint Chebyshev-center LP solve instead of independent per-variable midpoints, restoring the "values sum to exactly 1" invariant on reported (not just constrained) values
- `criteria-calibration-score-spread-accuracy.md` — `computeSolverAccuracy` replaced by a score-spread LP metric (tracks real rank displacement through the old metric's blind spot, confirmed on oracle + real production data); old metric kept deprecated for rollback; new provisional thresholds; branch merged to `master` 2026-08-09
- `criteria-calibration-adaptive-degree-escalation.md` — design checkpoint, implemented 2026-08-10: coverage-based degree escalation (`isDegreeCoverageComplete`, `computeTouchCounts`/`.min`/`.max`) replaced the old gap-based `MAX_AMBIGUOUS_GAP` check in `elicitationDriver.ts`; also notes an unfixed LP-infeasibility bug found while diagnosing this
- `criteria-calibration-degree-scoped-coverage-fix.md` — implemented 2026-08-11: `isDegreeCoverageComplete`'s touch-count gate scoped to the degree being checked (was whole-model, causing every degree to falsely self-report exhausted at once); fixes the degree-jump anomaly Dan hit live; UI still doesn't show current degree (flagged, not fixed)
- `criteria-calibration-partial-tie-fix.md` — implemented 2026-08-11: `generateCandidatesForSubset` now rejects partial-tie candidates (a tied criterion contributes zero LP information, confirmed mathematically); fixes the dominant selection-bias mechanism in `rankCandidatesByAmbiguity` by eliminating its input case, no change needed there; oracle n=63 checkpoint unaffected (trace never leaves degree 2)
- `criteria-calibration-reload-glitch-and-sluggishness-fix.md` — implemented 2026-08-11 (urgent): collapsed 3 redundant per-commit `computeScoreSpreadAccuracy`/`solveValues` calls (progress ring, persistence upsert, ranking-stability log hook) into one shared `computeCommitState`; fixed unawaited answer insert via a `usePendingWritesGuard` beforeunload warning instead of awaiting (latency tradeoff, unilateral call, flagged); ~54% per-commit LP time reduction measured, but the underlying LP solve itself scales superlinearly (2.2s+ at n=59) — real, unresolved, flagged as urgent follow-up in `deferred-work.md`
- `criteria-calibration-dantzig-stress-test.md` — read-only diagnostic 2026-08-12: extended the prior n=59-only Dantzig test across n=20…800, three data tracks and six adversarial constructions; verdict **GO** for a production Dantzig implementation (0 failures on all realistic data vs Bland's 44/120 at n=59, 30/30 at n=150; strict dominance over 1760 paired solves). Also root-causes the crash to `EPS = 1e-9` admitting near-singular pivots (Dantzig is a mitigation, not a cure), records the rejected Bland-fallback design, and flags that Bland silently returns constraint-violating weights in ~2/120 real orderings today. No production files touched; follow-ups in `deferred-work.md`
- `criteria-calibration-dantzig-fix.md` — implemented 2026-08-12: `simplex.ts` pivoting switched Bland -> Dantzig (both phases + the artificial-cleanup handoff), plus a post-solve feasibility guard in `solveLP` and near-singular-pivot detection surfaced via a new `LPSolution.diagnostics`; `computeChebyshevCenter` now throws instead of degrading to an all-zero point estimate. Fixes the crash that stalled Dan's session at question #59 AND a live silent failure that had been persisting all-zero weights (confirmed read-only in the DB). Parity with Bland verified to <=2.9e-13 where Bland worked; `MAX_ITERATIONS` left at 2000 (>3x headroom, pinned by test). Point estimates changed materially — expected, see the doc. All-'equal'-at-high-n breakdown NOT fixed, now loud instead of silent, tracked in `deferred-work.md`; branch merged to `master` 2026-08-12
- `criteria-calibration-weights-write-race.md` — diagnosed (not fixed) 2026-08-12: `upsertWeightsAndStatus` calls fired un-awaited on every commit can resolve out of order; `weightsGenRef` only gates the toast, not the write, so an older commit's write can silently overwrite a newer one's `accuracy_value` with no self-correction (confirmed on Dan's live `user_calibration_status` row, persisted at a stale mid-session 92.04% instead of the true final value); two candidate fixes identified, neither implemented, tracked in `deferred-work.md`
- `criteria-calibration-lp-warm-start.md` — 2026-08-15: root-causes `computeScoreSpreadAccuracy`'s superlinear scaling to per-solve cost (call count is constant at 210) and to Phase 1 being rebuilt identically for every objective; `solveLP` split into `prepareLP`/`solveFromPrepared`, plus a `nextAction` `useMemo` fixing 4 solves per question down to 1. 1881ms → 309ms per question at n=59, bit-for-bit identical output. Also records the still-O(n²) ceiling and the deferred Web Worker decision
- `criteria-calibration-second-session-reset.md` — 2026-08-15: data operation, wiped Dan's completed 70-answer session (answers + weights + status) so a second validation session can be run; `album_criteria_ratings` untouched. Records why the reset must DELETE rather than upsert (`answer_count`/`fired` are guarded monotonic, so `archive-and-reset-calibration.ts --reset` is now disabled and throws), and retracts an over-stated audit claim about `useRankingTestSetRatings`'s missing `user_id` filter (RLS already scopes it; the real corollary is that service-key scripts bypass RLS)
- `criteria-calibration-ranking-stability-analysis.md` — evidentiary doc for Brief 3, 2026-08-10 through 2026-08-12: both the original pass (n=57 all-zero-weights anomaly, later explained by the Dantzig fix) and the Dantzig-corrected re-analysis (71-answer session, 13-album `RANKING_TEST_SET`); verdict is that none of Medium/High/Very-High cleanly separates "ranking settled" from "still moving" — evidence against Medium (0.55) as a safe auto-stop point, not proof of the correct threshold; single-session/single-user caveat applies. The temporary `rankingStabilityLog.ts` instrument that produced this data (and its `server.ts` route) was removed once the analysis was written; `rankingTestSet.ts` kept as historical evidence backing this doc
