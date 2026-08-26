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

In progress: `criteria-calibration-freeze-checkpoint` (fifth checkpoint — explicit
acknowledgement that degree 2 is "frozen" for the four preference shapes that never reach
`coverage-complete`. **Both steps done.** Step 1: for all four shapes (`#2 single-dominant`,
`#4 linear-control`, `#5 front-loaded`, `#6 back-loaded`), the degree-2 refinement candidate pool
is NOT empty at round 90 (54-62 unasked candidates remain) — a uniform Case B, not mixed, so no
runtime Case A/B branching was built. Step 2: `DEGREE_2_FREEZE_ANSWER_THRESHOLD = 78`
(`degreeTiers.ts`) is 77 + 1, the smallest answer-count position that never false-triggers on any
of the 8 healthy evidence traces (latest healthy exit: `#10 dan-approximation` at round 77) —
chosen on POSITION rather than freeze-run length, confirmed necessary since a healthy trace's
worst freeze (28 rounds, `#3 zero-weight-criterion`) is longer than a permanently-blocked
trace's (23 rounds, `#4 linear-control`). Wires `isDegree2Frozen` to the already-merged
`'frozen'` checkpoint variant/copy from `criteria-calibration-checkpoint-copy-rewrite` (no copy
changed on this branch); reuses `acknowledgedBoundaryDegree` (safe — the freeze branch and a
real degree-2 boundary are mutually exclusive by the threshold's own margin). Verified live via
a real-driver RTL integration test (no mocked `nextAction`/`computeScoreSpreadAccuracy`) replaying
78 real `#2 single-dominant` answers: fires at exactly 78, not 77; accuracy percentage identical
across "Continue" (weights not reset); Blurry never appears after continuing (label not
retroactively promoted). 333/333 tests, `tsc` clean. Full detail:
`docs/decisions/criteria-calibration/criteria-calibration-freeze-checkpoint.md` (Step 2),
`docs/decisions/criteria-calibration/criteria-calibration-freeze-checkpoint-step1-pool-check.md`
(Step 1)).

Also merged (docs/CSVs only, no code changes): `criteria-calibration-checkpoint-copy-rewrite`
(rewrites all four checkpoint screens' copy against six rules — no em dashes, no "label" as a
noun, the accuracy percentage never bare, no low-percentage-reads-as-failure phrasing, pausing
always last and lightest, max 3 content sentences per body — and makes the tier badge
permanently visible via a new `tier` prop decoupled from `variant`. Also makes degree-5
exhaustion show a checkpoint for the first time (`isLabelChangingDegree` gained degree 5; it was
silent before) — the one non-visual side effect is that 5→6 no longer auto-escalates silently,
now needs a click, same as every other boundary. Defines the unwired `'frozen'` variant's copy
for the freeze-checkpoint branch above to consume without re-touching this file. 328/328 tests,
`tsc` clean. Full detail:
`docs/decisions/criteria-calibration/criteria-calibration-checkpoint-copy-rewrite.md`), merged
to `master` `--no-ff` at `9f7eb54` on 2026-08-26. Rollback tag:
`pre-merge-criteria-calibration-checkpoint-copy-rewrite`.

Also merged (docs/CSVs only, no code changes): `criteria-calibration-normalized-coverage-width-diagnostic`
(tests whether a NORMALIZED coverage-width threshold frees the four preference shapes that never
leave degree 2 under the absolute `MAX_VALUE_RANGE_FOR_COVERAGE = 0.2` gate. **Verdict:
negative — the usable threshold window is empty for both candidates**, and the one threshold that
frees all four turns the width test inert. The UX route stays the chosen path; no implementation
followed from this branch — the freeze-checkpoint brief above is a separate, later decision. Full
detail: `docs/decisions/criteria-calibration/criteria-calibration-normalized-coverage-width-diagnostic.md`),
merged to `master` `--no-ff` at `907d70a` on 2026-08-25. Rollback tag:
`pre-merge-criteria-calibration-normalized-coverage-width-diagnostic`.

Also merged (docs/CSVs only, no code changes): `criteria-calibration-accuracy-threshold-recalibration`
(fit the three `SCORE_SPREAD_*` constants against real ground truth and found no cutoff set
generalizes, because `computeScoreSpreadAccuracy` measures determinacy, not correctness;
`accuracyTiers.ts` deliberately left untouched. Superseded as a live decision by
`criteria-calibration-degree-tiers-and-progress.md`, which moved tier assignment off percentage
thresholds entirely — this doc's findings are historical context, not open work. Full detail:
`docs/decisions/criteria-calibration/criteria-calibration-accuracy-threshold-recalibration.md`).

Most recent merge was `criteria-calibration-degree-tiers-and-progress`
(replaces threshold-based accuracy tiers with degree-tied ones: the label names how many degrees
of trade-off comparison are finished — Unfocused / Blurry / Clear / Sharp, single-sourced in
`accuracyTierLabels.ts` — while the accuracy percentage stays as an independent, still-displayed
number. Collapses the whole threshold-crossing apparatus (tier Set, two resume seeds, degree-2
flag, four-way precedence) to one `acknowledgedBoundaryDegree`; degrees 5-6 escalate silently.
Progress ring becomes the segmented per-degree bar, filled continuously by the same coverage gate
that ends a degree. Soft gate decoupled from the tier (`hasWeights`, not `tier === 'none'`). No DB
migration. **Reverses `criteria-calibration-tiered-checkpoints`' rule that the top tier offers no
continuation.** 326/326 tests; live browser pass done on the disposable QA account (full degree-2
transition, the persistence round-trip, and one "stuck" shape at 60 answers; Dan's account
untouched). Note existing `user_calibration_status` rows keep their old threshold-derived tier
until that user next opens calibration — Dan's own will go Sharp → Clear. Known accepted gap:
four preference shapes never exhaust degree 2 and therefore never leave the base rung or see a
checkpoint at all — logged in `deferred-work.md`. Full detail:
`docs/decisions/criteria-calibration/criteria-calibration-degree-tiers-and-progress.md`), merged
to `master` `--no-ff` at `4b564d8` on 2026-08-25. Rollback tag:
`pre-merge-criteria-calibration-degree-tiers-and-progress`.

Before that, most recent merge was `criteria-calibration-tiered-checkpoints`
(retires Brief 3's auto-escalation signal outright and replaces it with four explicit
checkpoints — degree-2 boundary / crossing High / crossing Very High / neutral exhaustion
fallback — with silent escalation in between. Deletes ~876 lines, 3 one-off scripts and 7
`user_calibration_status` columns; **the write-race correctness risk is retired rather than
fixed**, being scoped exactly to the dropped columns. Corrects two stale premises in its own
brief: the threshold constants it named were deprecated 2026-08-09 (live metric is
`computeScoreSpreadAccuracy` at 0.55/0.75/0.85), and the prerequisite removal it assumed was
merged was still live. Migration applied to the live DB and verified; browser pass on the
disposable QA account. Two bugs the unit tests missed were caught live and fixed: a session
resumed at a degree-3+ boundary was stranded, and the degree-2 checkpoint offered "Increase
accuracy" next to an already-maxed tier. Dan's 71-answer account untouched. 305/305 tests),
merged to `master` `--no-ff` at `892f79c` on 2026-08-17. Rollback tag:
`pre-merge-criteria-calibration-tiered-checkpoints`. Full detail:
`docs/decisions/criteria-calibration/criteria-calibration-tiered-checkpoints.md`.

Before that was `criteria-calibration-escalation-signal-candidates`
(docs-only diagnostic, no production code touched: evaluates replacements for Brief 3's
`RANKING_TEST_SET` top-10 stop signal, which cannot work for any first-time user. **All five
signal variants fail** across 12 traces × four R values — coverage width, width plateau,
normalised ratio, accuracy plateau, weight-vector stability — none has a threshold that is safe
across the evidence set, closing the mathematical-signal direction. **Standing recommendation is
Candidate C**: drop detection, show an explicit checkpoint at each existing
`isDegreeCoverageComplete` degree boundary. Measured cost 2 extra screens per real session;
deletes ~876 lines, 7 DB columns, and **the one open correctness risk** — the
`last_eligible_top10`/`last_change_answer_index` write-race is scoped exactly to the columns C
removes, so it stops existing rather than needing a guard. **Resolved 2026-08-17 — a tier-gated
variant of C was implemented on `criteria-calibration-tiered-checkpoints`, above.** Also corrects `deferred-work.md`'s stale n=35/n=45 stability points to n=39/n=46;
the Harris fix moved both), merged to `master` `--no-ff` at `f5e3a6c` on 2026-08-16. Rollback
tag: `pre-merge-criteria-calibration-escalation-signal-candidates`. Full detail:
`docs/decisions/criteria-calibration/criteria-calibration-escalation-signal-candidates.md`.

Before that was `criteria-calibration-harris-ratio-test`
(ships the `EPS = 1e-9` near-singular-pivot **cure**: `simplex.ts`'s leaving-row rule is now a
Harris two-pass ratio test, `pivotTolerance = 1e-7` / `δ = 1e-8`, one production file changed.
Closes `deferred-work.md`'s former item 3 and the all-'equal' entry, both relocated to
`finished-work.md`; opens `deferred-work.md` item 5, the reported weights being one arbitrary
pick among tied optima — surfaced, not caused. Dan's live 71-answer log re-solved read-only:
clean at all 71 prefixes, stored weights move max 0.0239 / median 0.0065.
`MAX_VALUE_RANGE_FOR_COVERAGE = 0.2` re-checked and left unchanged), merged to `master`
`--no-ff` at `ca7f905` on 2026-08-16. Rollback tag:
`pre-merge-criteria-calibration-harris-ratio-test`. That merge also subsumed its parent
`criteria-calibration-eps-ratio-test-diagnostic` (docs + harness only, never merged
separately). Full detail: `docs/decisions/criteria-calibration/criteria-calibration-harris-ratio-test.md`.

Before that was `criteria-calibration-solver-crash-safety-net`
(contains the LP solver's near-singular breakdown at the page boundary: compute-first ordering on
the mutating handlers, auto-recovery for already-persisted bad logs, route-level `ErrorBoundary`;
solver layer deliberately untouched at the time, so sessions still hit the breakdown but degraded
legibly instead of blanking the page — the `EPS = 1e-9` cure above has since closed that gap),
merged to `master` `--no-ff` at `f7f6f3c` on 2026-08-16. Rollback tag:
`pre-merge-criteria-calibration-solver-crash-safety-net`. That merge also subsumed
`criteria-calibration-synthetic-oracles` (docs-only, never merged separately). Full detail:
`docs/decisions/criteria-calibration/criteria-calibration-solver-crash-safety-net.md` and
`docs/decisions/criteria-calibration/criteria-calibration-near-singular-pivot-impact.md`.

The auto-recovery path was confirmed live in a browser on 2026-08-16 (throwaway account,
service-key seed, 3 identical runs) — that check caught and fixed a `flushSync` warning the
jsdom tests missed. Incidentally, Dan's real 71-answer log was re-solved read-only at every
prefix and all 71 solve cleanly, so the historical `n=54`/`n=57` breakdowns do not reproduce
post-Dantzig-fix. Details in the safety-net doc's "Live verification" section.

Before that was `criteria-calibration-cross-degree-undo-redo-fix`
(fixed `degree` staying pinned after Undo crossed a degree boundary without a page refresh,
plus the mirrored gap in Redo; added `inferDegreeFromAnswers` to `preferenceGraph.ts`, reusing
`useCalibrationResume`'s existing formula rather than inventing new inference logic), merged
to `master` `--no-ff` at `46fbc98` on 2026-08-16. Rollback tag:
`pre-merge-criteria-calibration-cross-degree-undo-redo-fix`. Full detail:
`docs/decisions/criteria-calibration/criteria-calibration-cross-degree-undo-redo-fix.md`.

Before that was `docs-album-identity-rating-reorg`
(docs-only: moved the 7 `album-identity-*` decision docs into
`docs/decisions/album-identity/`, added a gateway file at
`docs/decisions/album-identity-summary.md`, collapsed CLAUDE.md's 7 individual
`album-identity-*` index lines to one pointer; and prepended a summary block to
`album-rating-page.md` — no folder move for the 4 `album-rating-*` files, no application
code touched), merged to `master` `--no-ff` at `0146773` on 2026-08-16. Rollback tag:
`pre-merge-docs-album-identity-rating-reorg`. Full detail: this doc's own dated section in
`docs/decisions/documentation-audit-june2026.md`.

Before that was `docs-criteria-calibration-reorg` (docs-only folder+gateway reorg of the
Criteria Calibration cluster; see `docs/decisions/criteria-calibration-summary.md`), merged
`--no-ff` at `97b4e3d` on 2026-08-16.

Account state (`criteria-calibration-second-session-reset.md`, "Outcome" section): the awaited
second validation session **ran and completed at 71 answers on 2026-08-15** — Dan's account is
not empty, and score/rank badges are back. Treat those 71 answers as the validated dataset, not
scratch space; a further session needs a fresh backup+reset, and the reset must DELETE, not
upsert (`archive-and-reset-calibration.ts --reset` is disabled for that reason).

Also carried forward from the two merges before that: LP warm-start's O(n²) ceiling. (The
`last_eligible_top10`/`last_change_answer_index` write-race risk is **retired** by
`criteria-calibration-tiered-checkpoints` above — the columns are dropped, so there is no
unguarded write left to race, pending that branch's migration actually being run.) See
`docs/decisions/criteria-calibration-summary.md` for the current single-source statement of
both, plus `deferred-work.md` for open-item tracking.

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
- `album-identity-summary.md` — gateway/index for the Album Identity decision-doc cluster (7 files, now in `docs/decisions/album-identity/`); read this first for anything album-identity-related
- `design-system-spec-slant-take.md` — reference spec for the Slant Take visual redesign, split across passes
- `slant-take-design-system.md` — consolidated decision doc for all nine passes plus two follow-up tweaks; Chakra v3 gotchas, badge positioning, `averageScore` vs raw `score`
- `naming-decisions.md` — product name (Slant Take), display face, logo mark, accent-colour change
- `deferred-work.md` — consolidated tracker of deferred/postponed work — check here first for what's outstanding
- `unknown-band-collision-audit.md` — read-only audit of non-review posts across AMG/PS/Metal Storm, RSS category-tag signal discovery
- `roundup-skip-fix.md` — RSS category-tag filtering, `skipped_posts` table, AMG allowlist
- `stale-row-cleanup.md` — migrated 3 pre-fix stale rows into `skipped_posts`, deleted orphaned albums
- `criteria-calibration-summary.md` — gateway/index for the entire Criteria Calibration decision-doc cluster (24 files + supporting data, now in `docs/decisions/criteria-calibration/`); read this first for anything calibration-related. **Before touching `simplex.ts`, read `criteria-calibration-harris-ratio-test.md`'s "What NOT to change".** **Before touching degree escalation, stopping, the accuracy tiers shown to the user, or the calibration progress bar, read `criteria-calibration-degree-tiers-and-progress.md`'s "What NOT to change" first, then `criteria-calibration-tiered-checkpoints.md`'s — the newer doc reverses several of the older one's choices, and both reverse designs older still.**
- `favorites-row-desktop-redesign.md` — 128px flush artwork, `rankOverlayBadge` token, delete-confirmation dialog; branch merged to `master` 2026-08-07
- `favorites-row-mobile-layout.md` — vertical artwork-first mobile layout for `FavoriteListItemRow`, 768px `@media` split; branch merged to `master` 2026-08-07
- `design-system-audit-2026-08.md` — read-only token/consistency audit across the whole app; 3 open items await Dan's decision (card shadow, radius token naming, proposed tokens)
