# Finished work — relocated from deferred-work.md

This file holds items that were tracked in `deferred-work.md` and have since been
confirmed fully closed — shipped, verified, resolved, or retracted, with no open
follow-up remaining in the item itself. This is a relocation, not a rewrite: entries
below are unchanged from their original wording in `deferred-work.md` except where
noted in a bracketed `[2026-08-16 reorg note: ...]` correction. See `deferred-work.md`
for what's still open, including several items that are *mostly* done but keep a real
open sub-item and were deliberately left there rather than split.

---

- ~~**GitHub Actions cron for scheduled ingest**~~ — **DONE (2026-07-21)**.
  Implemented as `.github/workflows/ingest.yml` (`0 7,19 * * *` UTC +
  `workflow_dispatch`), calling `POST /api/ingest` with a server-only
  `Authorization: Bearer` secret. Live-verified via an actual `workflow_dispatch`
  run against production (`metalreviews.onrender.com`) — job completed green, the
  endpoint returned `202`, and `/api/ingest/status` confirmed the run finished.
  `node-cron` wiring in `scripts/ingest-cli.ts` is now genuinely dead code
  (superseded by the Actions workflow), not merely dormant. 60-day
  GitHub-inactivity caveat: accepted risk, unrelated to this item's completion.
  Full history: `ingest-trigger-and-security.md` Section 7.

- ~~**Favorites row mobile redesign**~~ — **DONE**, `favorites-row-mobile-layout` branch (not
  yet merged, blocked on Dan's live visual confirmation). Both carry-over questions from the
  desktop pass are resolved: mobile drops `Tooltip` entirely (no touch/hover concern there;
  desktop's own `Tooltip` is still unaddressed), and real artwork was live-verified at both
  sizes. Full detail: `favorites-row-mobile-layout.md`.
  [2026-08-16 reorg note: this entry's "not yet merged" clause is stale — the
  `favorites-row-mobile-layout` branch merged to `master` `2a90198` on 2026-08-07, per
  `branch-log.md` and `CLAUDE.md`'s Past-decisions index.]

- **`favorites.review_id` column — resolved, not open.** The original migration
  brief called for this to stay deferred pending Dan's go-ahead
  (`album-identity-migration.md`), but a later session confirmed via direct live
  query that the column is already gone (`favorites` rows are `{ user_id,
created_at, album_id }` only — `album-identity-ingest.md`), and
  `album-identity-frontend-homepage.md` explicitly logs the drop as "confirmed
  run." Listed here only so the now-superseded "not run yet" language in
  `album-identity-migration.md` isn't mistaken for current status.

- **`manual_albums` legacy table — resolved, not open.** Drop script
  (`supabase/manual_albums-drop.sql`) has been run against live Supabase; table
  physically dropped. Confirmed by Dan 2026-07-19. `manual-albums.md`,
  `album-identity-visibility-and-duplicate-fix.md`.

- **`scripts/seed-from-json.ts` — resolved, deleted.** Along with the
  `DbRow`/`fromDbRow()`/`toDbRow()` vestigial pre-migration mapping layer it
  was the sole consumer of, and `src/__tests__/dbMapping.test.ts` (an
  unanticipated second consumer, found via reference search before deletion,
  removed alongside since it only tested the removed code). `tsc --noEmit`
  clean, 164/164 tests passing post-deletion. `architecture.md`'s description
  of this relic is now historical only.

- **Security Finding #9 (`--no-sandbox` not passed to `puppeteer.launch()`)
  — closed, no current evidence.** Diagnosed 2026-07-19 against real Render
  production logs; no sandbox-crash signature found across runs checked.
  See `ingest-trigger-and-security.md` for full resolution note. Revisit only
  if a genuine sandbox-crash error signature appears in future logs.

- **Puppeteer `dependencies` fix (commit `a63fa62`) — resolved, not open.**
  Verified against a real Render deploy 2026-07-19: live ingest succeeded
  across all three sources with real scores returned. `render-deployment.md`.

- **Dropdown `<option>` white-background gap — resolved, not open.** Fixed and
  verified in Step 5 of the Chakra v3 migration (`css: { '& option': {...} }`
  on `controlFieldStyle`, all 4 dropdowns confirmed dark by Dan).
  `chakra-v3-migration-plan.md`.

- **Menu whiteAlpha-flash CSS override — verified correct under v3, closed
  (2026-07-20).** Live-checked both `Menu` instances (`src/Header.tsx`)
  running `npm run dev`: desktop account `Menu.Trigger` Button and mobile
  hamburger `Menu.Trigger` IconButton both show `aria-expanded="true"` driving
  the `css` override to `bg: surface.raised` (`rgb(63, 63, 70)`) /
  `color: text.primary` (white), confirmed via computed styles — no bare
  Chakra whiteAlpha flash underneath. `Menu.Item`s (`Log out` on desktop;
  `Reviews`/`Favorites`/`Log out` on mobile) show the same `surface.raised`
  bg on `data-highlighted` (hover), also via computed styles, not just
  eyeballing. `header-redesign.md` line 71-74 and
  `chakra-v3-migration-plan.md` Step 5 can be considered fully closed.

- **4 historical `reviews` rows with `score: ''` / `normalized_score: 0`,
  non-review-post pollution — diagnosed and migrated, 2026-07-20.** Found while
  diagnosing the Metal-Storm-timeout score-collapse bug (2026-07-19). All 4
  were Angry Metal Guy, matching known non-review franchise patterns ("Yer
  Metal is Olde: Warning" / _Watching from a Distance_, "The Willowtip Files:
  Commit Suicide" / _Synthetics_, "Stuck in the Filter" / _April 2026's Angry
  Misses_, "Record(s) o' the Month" / _March 2026_). Diagnosis confirmed all 4
  `published_at` dates (2026-06-12 through 2026-07-02) predate the
  non-review-post skip-fix's ship date (2026-07-17) — not a live gap in the
  filter, simply outside the narrow scope of the prior two `stale-row-cleanup.md`
  passes. None appeared in `skipped_posts` already, ruling out a
  double-logging edge case. A third cleanup pass (same pattern as the prior
  two) then migrated all 4 into `skipped_posts`
  (`reason='backfilled_non_review_cleanup'`) and deleted the now-orphaned
  `reviews`/`albums` rows — see the appended entry in `stale-row-cleanup.md`.
  Final counts: albums 151→147, reviews 151→147. **Closed — no remaining
  action.**
  - Same investigation also found and fixed an adjacent, previously-unknown
    bug: `logSkippedPost` had no dedup check, so every `npm run ingest` run
    unconditionally re-logged every non-review post still in the RSS feed's
    current window, even if already logged. 40 rows had accumulated in
    `skipped_posts` from just 12 manual ingest runs across two debugging
    sessions (2026-07-17, 2026-07-19) — confirmed via timestamp analysis to be
    normal repeated manual runs, not a rogue/scheduled process. Fixed by
    adding a `url`-based existence check before insert in
    `scripts/ingest.ts`'s `logSkippedPost` (now exported, covered by
    `scripts/__tests__/logSkippedPost.test.ts`); the 40 pre-existing
    duplicates were then backfill-deduped (kept earliest row per URL) down to 4. `tsc --noEmit` clean, full test suite passing throughout. Not written
    up as a standalone decision doc — tracked here only, per explicit
    direction.

- **Solver point-estimate normalization doesn't jointly hold — fixed 2026-08-09.**
  Originally confirmed live 2026-07-30 (1.308 normalization sum on a real account, raw
  score 122%, display-clamped to 100% as a stopgap). Fixed on the
  `criteria-calibration-joint-point-estimate` branch: `LevelValue.point` now comes from a
  single joint Chebyshev-center LP solve rather than independent per-variable midpoints,
  so normalization holds exactly by construction (verified: real production account
  1.3077509833333332 → 1.0000000000000002). `computeSolverAccuracy` deliberately left
  unchanged (range-width method, per Dan's explicit scope call) — only the point used for
  scoring/ranking/candidate-ambiguity changed. Measured, not assumed: this fix does
  **not** move `nextAction`'s degree-3 escalation point on the same real data (top
  candidate gap ~0 either way) — the separate levels-2–5 flatness issue (see
  `deferred-work.md`) is unaffected. Full detail:
  `docs/decisions/criteria-calibration/criteria-calibration-joint-point-estimate.md`.

- **`simplex.ts`'s LP solver could silently return garbage values on degenerate
  input — fixed 2026-08-09.** Discovered live via a diagnostic that drove
  `nextAction` for 42 rounds against the `REAL_SESSION_*` (5-criterion) oracle:
  the pre-fix Big-M solver returned `feasible: true` with `values[c][level].point`
  up to ~1.16e14, despite `totalSlack === 0` (the data was fully consistent — a
  purely numerical failure, not a real infeasibility). Root cause: Big-M mixed a
  `1e7` penalty coefficient into the same objective row as the real O(1) costs,
  which wrecked the tableau's conditioning on this problem's highly degenerate
  constraint shape (many monotonicity/answer rows sharing structure); separately,
  the old feasibility check only verified artificials were out of the basis, never
  that the simplex loop actually reached optimality rather than exhausting
  `MAX_ITERATIONS`. Fixed by rewriting `solveLP` as two-phase simplex (Phase 1
  minimizes only the sum of artificials to establish feasibility, no Big-M
  anywhere; Phase 2 optimizes the real objective from that feasible basis), with
  both phases now propagating a `converged` flag so a run that hits the iteration
  cap without reaching optimality is reported `feasible: false` instead of
  silently returned as a solution. Bland's rule (already in place for
  anti-cycling) carried through unchanged into both phases. `solveLP`'s public
  signature/return shape is unchanged — `solveValues`/`computeChebyshevCenter`
  (its only callers, both in `solver.ts`) needed no changes. Verified: all 226
  pre-existing tests pass unchanged plus one new permanent regression test
  (`solver.test.ts`'s "n=42 numerical-blowup regression" block, fixture
  `N42_REPRO_ANSWERS` in `fixtures.ts`, regenerated deterministically the same way
  the diagnostic found it — driving `nextAction` against the `REAL_SESSION_*`
  oracle for 42 rounds); the same input now produces monotonic, exactly-normalized
  point values in the sane `[0, 0.5]` range instead of ~1e14. Full detail:
  `docs/decisions/criteria-calibration/two-phase-simplex-rewrite.md`.

- ~~**`accuracy_value`/fresh-recompute discrepancy on Dan's real account**~~ — **NOT
  CONFIRMED, retracted.** Re-verified 2026-08-15
  (`docs/decisions/criteria-calibration/criteria-calibration-weights-write-race.md`'s
  dated correction section): a fresh `computeScoreSpreadAccuracy` recompute over the live
  70-answer log exactly matches (diff = 0) the stored `accuracy_value`, and no write or
  answer mutation has touched the account since the original 92.04% reading. The 0.99999
  figure doesn't reproduce and was most likely a bug in that session's own ad hoc check, not
  a real stored/fresh mismatch.

- ~~**`computeScoreSpreadAccuracy` scales superlinearly with answer count**~~ — **DONE
  (2026-08-15)**, on `criteria-calibration-lp-warm-start`. Diagnosis: call count is constant
  at 210, so the superlinearity was entirely per-solve cost (~O(n²): tableau grows in both
  dimensions per answer while pivot count grows too). All 210 solves shared one constraint set
  and differed only in objective, so tableau construction + Phase 1 — 79% of each solve's time,
  80% of its pivots — was identical work repeated 210 times. Fixed by splitting `solveLP` into
  `prepareLP` + `solveFromPrepared` and preparing once (`simplex.ts`); `solveValues`'s pass-2
  range solves share the same win. Warm-starting was the applicable mechanism of the two
  originally guessed. Per-question blocking time at n=59: 1881ms → 309ms (6.09×), bit-for-bit
  identical output verified over 2314 solves. Full detail:
  `docs/decisions/criteria-calibration/criteria-calibration-lp-warm-start.md`.

- ~~**Weights/status upsert had an unfixed write-race**~~ — **DONE**, fixed 2026-08-15 on
  `criteria-calibration-weights-write-race-fix`. `upsert_calibration_status`'s conflict
  clause now only adopts `accuracy_value`/`tier`/`answer_count` from a write whose
  `answer_count` is `>=` the row's current value (see
  `supabase/user_calibration_status-add-answer-count-guard.sql`), verified with a deliberate
  two-write race test. Note: the account-level 92.04%/n=69 "evidence" that originally
  motivated this diagnosis did not hold up under re-verification (see the item above and
  `docs/decisions/criteria-calibration/criteria-calibration-weights-write-race.md`'s dated
  correction) — the fix ships anyway because the RPC's structural lack of a guard was real and
  independently confirmed by reading its code, regardless of that one account never having
  visibly hit it. `last_eligible_top10`/`last_change_answer_index`/the `previous_*` triple
  remain unguarded, deliberately in scope terms — but see `deferred-work.md`'s "CORRECTNESS
  RISK TO AN ALREADY-SHIPPED SIGNAL" entry for why their staleness is no longer simply
  "safe-direction/delay-only" as previously assumed. Full detail:
  `docs/decisions/criteria-calibration/criteria-calibration-weights-write-race.md`.

- ~~**"Graded Slab" visual direction**~~ — **DONE.** Implemented as the
  Slant Take design system across 9 sequential passes (colors/fonts, radii,
  badge restructure, chrome polish, rename, footer, loading indicator,
  consistency/hover pass) — all ✅ Complete, verified. "Graded Slab" was the
  internal working name during exploration only; the shipped system is the
  Slant Take design system. Full detail: `slant-take-design-system.md`.

- ~~**Card footer / ingest-timestamp line never built**~~ — **DONE (2026-07-25,
  design-system pass 8).** `src/Footer.tsx` built and wired into both `App.tsx` and
  `FavoritesPage.tsx`. Full detail: `slant-take-design-system.md` pass 8, this
  entry's original text preserved below for context.
  <details>Mockup `03-graded-slab-void-accent_1.html` has a page footer (mono,
  uppercase, `text.muted`) carrying "Last ingest &lt;date&gt;" on the left and a
  source list on the right. The app had no footer element at all, so pass 3's
  typography audit had nothing to fix. This overlapped the parked "last ingest date
  timestamp element" idea listed under Portable IA in `deferred-work.md` — same
  feature. Pass 8 found no "last ingest run" timestamp is persisted anywhere (the old
  `/api/ingest/status` endpoint only ever exposed an in-memory running/idle flag,
  removed along with the refresh button when ingest moved to GitHub Actions cron —
  see `ingest-trigger-and-security.md`), so it used "Last updated" sourced from the
  newest `publishedAt` across loaded albums/reviews instead, and replaced the
  mockup's source-count text with `Reviews`/`Favorites` nav links per Dan's brief.</details>
