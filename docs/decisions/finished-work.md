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
  (`album-identity/album-identity-migration.md`), but a later session confirmed via direct live
  query that the column is already gone (`favorites` rows are `{ user_id,
created_at, album_id }` only — `album-identity/album-identity-ingest.md`), and
  `album-identity/album-identity-frontend-homepage.md` explicitly logs the drop as "confirmed
  run." Listed here only so the now-superseded "not run yet" language in
  `album-identity/album-identity-migration.md` isn't mistaken for current status.

- **`manual_albums` legacy table — resolved, not open.** Drop script
  (`supabase/manual_albums-drop.sql`) has been run against live Supabase; table
  physically dropped. Confirmed by Dan 2026-07-19. `manual-albums.md`,
  `album-identity/album-identity-visibility-and-duplicate-fix.md`.

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

- ~~**Dantzig is a mitigation, not a cure**~~ — **DONE 2026-08-16. The cure shipped.**
  `simplex.ts`'s leaving-row rule is now a Harris two-pass ratio test
  (`pivotTolerance = 1e-7`, `δ = 1e-8`), implementing the diagnostic's verdict verbatim.
  Re-confirmed against the shipped solver, not the lab copy: committed real fixtures
  181/181 clean (was 1 failure), adversarial near-singular incidence 66/240 → **0/240**,
  closed-loop oracles 4/10 crashing → **0/10**, and the shipped rule proved bit-identical
  to the validated lab rule on all 181 solves (`digestDiffVsProd=0`). Dan's live 71-answer
  log was re-solved read-only: clean at every one of its 71 prefixes, and its stored
  weights move by max 0.0239 / median 0.0065 — ~25× smaller than the synthetic estimate.
  `solverCrashFixture.test.ts`'s assertion was inverted rather than deleted, after 1000
  generated logs at n ≤ 100 failed to produce any replacement that still breaks the new
  rule. Full detail:
  `criteria-calibration/criteria-calibration-harris-ratio-test.md`.

  Two things this closed item hands forward, neither a regression:
  - **`MAX_ITERATIONS = 2000` (item 4) is now the sole cause of adversarial failure at
    n=300**, with healthy pivots throughout. The 844 → 200 drop in max pivots per solve
    buys real headroom against it.
  - **The reported weights are not uniquely determined, and never were.** Every candidate
    rule attains the identical optimal Chebyshev radius on all 180 solvable regions; the
    optimum is degenerate enough (mean radius ≈ 1.5e-7) that the pivoting rule silently
    picks among ties. A deterministic secondary objective (lexicographic tie-break, or a
    strictly convex proxy) would fix it — **new open item, see below.**
  - `MAX_VALUE_RANGE_FOR_COVERAGE = 0.2` was re-checked and **left unchanged**: escalation
    timing shifts in *both* directions depending on data shape (one oracle 19 rounds later,
    another 19 earlier), so no single value corrects both. Flagged as a product call.

  <details><summary>Historical detail (the diagnosis that led here) — expand only if
  re-opening the numerics</summary>

  **Was: still open — Dantzig is a mitigation, not a cure.** The root cause is the
  `EPS = 1e-9` ratio-test threshold admitting near-singular pivots; the smallest pivot
  element used is a perfect predictor of failure across every case tested. The 2026-08-12
  pass added detection (`nearSingularPivot` in `LPSolution.diagnostics`) but deliberately
  did NOT change the ratio test — the real fix is a Harris ratio test or periodic
  refactorization. See the separate all-'equal' entry below for what remains reachable.

  **2026-08-16 addendum — raises this item's priority, doesn't change its status.** The
  synthetic calibration oracles diagnostic (`criteria-calibration-synthetic-oracles.md`)
  reproduced this exact crash (`nearSingularPivot`, `EPS=1e-9`-floor pivots) on **4 of 10**
  independently-run oracles at n=44–87, including oracle #1 — uniform weights, linear level
  spacing, `totalSlack = 0.000000` at every round up to the crash (fully self-consistent,
  zero contradictions). This is a materially different regime from the 2026-08-12 stress
  test's own characterization of the danger zone (all-'equal'-heavy or high-contradiction
  inputs at n≥100–150) — a clean, realistic-shaped, low-'equal' answer log crashed at n=79,
  comfortably inside the range Dan's own real sessions already reach (33/70/71 answers).
  The stress test's "GO" verdict (0 failures across ~4000 solves, n=20…300) used a
  different candidate generator; it did not specifically test this shape at this scale, so
  this isn't a contradiction of that data, but it removes "stay consistent and you're safe"
  as a reason to deprioritize the pivot-magnitude guard. Incidental finding from the same
  run: 3 real (non-float-noise) score-spread-accuracy monotonicity dips appeared in the 5
  rounds immediately preceding oracle #1's crash, nowhere else in the 10-oracle run —
  plausible early-warning signal, unexplored, not chased down this session.

  **2026-08-16 impact assessment — a MITIGATION hotfix is now recommended ahead of the
  cure.** `criteria-calibration-near-singular-pivot-impact.md` traced the failure end to
  end and reproduced it through the real `CriteriaCalibrationPage`: the throw escapes a
  `setTimeout`, React re-renders against the new answer log, `nextAction`'s own
  `solveValues` throws during render, and with no `ErrorBoundary`/`errorElement` anywhere
  in the app the root unmounts — **blank page, no in-app recovery**. The triggering answer
  is already persisted (`persistNewAnswer` runs before the solve), so a reload reproduces
  it and the session is permanently bricked until the row is deleted from Supabase by hand.
  Supabase integrity itself is fine (`insertAnswer` 1×, `upsertWeightsAndStatus` 0×) — this
  is not a repeat of the all-zero-weights class. Also confirmed: Dan's real 71-answer
  session already reached this regime (the `n=54`/`n=57` discards in
  `criteria-calibration-ranking-stability-analysis.md` are the same failed Chebyshev
  solve, silent pre-Dantzig), and every committed real fixture stays 4–7 orders of
  magnitude clear of the threshold up to n=42. Hotfix scope: page-boundary catch +
  auto-undo/defer-persist, NOT reverting the Chebyshev throw. The `EPS = 1e-9` ratio-test
  fix below stays the separate, scheduled cure.

  **2026-08-16 — the safety net SHIPPED; this item (the cure) is still open.**
  `criteria-calibration-solver-crash-safety-net.md`: compute-first ordering on all three
  mutating handlers, a guarded `action` memo plus auto-recovery (trim + delete) for
  already-persisted bad logs, honest user-facing messages, and a route-level
  `ErrorBoundary` backstop. Nothing was caught inside `solver.ts`/`simplex.ts` — the
  Chebyshev throw is unchanged. **Sessions will still hit the numerical breakdown**; they
  now degrade legibly instead of blanking the page. When this item's `EPS = 1e-9` fix
  eventually lands, expect `solverCrashFixture.test.ts` to fail: it deliberately asserts
  that `SOLVER_CRASH_ANSWERS` still throws, precisely so the safety-net tests can't
  silently start passing against an input that no longer exercises anything. Update that
  fixture/test as part of the cure, don't just delete the assertion.

  **2026-08-16 — DIAGNOSED, ready for an implementation brief; still not implemented.**
  `criteria-calibration/criteria-calibration-eps-ratio-test-diagnostic.md` tested three
  candidate ratio-test rules against the full regression set, driving the real production
  stack via a Vite alias (no production file touched; baseline verified bit-identical to
  production on 181 solves and reproducing the published oracle crashes exactly). Headlines:
  - **Verdict GO for a Harris two-pass ratio test at `pivotTolerance = 1e-7`, `δ = 1e-8`.**
    Near-singular-pivot incidence goes 41+25/240 → **0/240**; committed real fixtures
    181/181 clean; closed-loop oracle crashes 4/10 → **0/10**, with oracles #1 and #3 now
    reaching genuine `coverage-complete` through degrees 2→6 and recovering ground truth
    exactly.
  - **The "pivot-magnitude guard" as sketched in `dantzig-stress-test.md` Result 4 should NOT
    be built as sketched** — taking the min ratio among rows above a floor lets the step
    overshoot by an *unbounded* amount when the floor excludes the true min-ratio row.
    Harris's δ is exactly the bound that makes the same trade legitimate.
  - **A bare largest-|pivot| tie-break** (smallest possible diff, provably step-length-neutral)
    clears every real fixture and all 10 oracles but leaves the mechanism alive at n ≥ 150 —
    it is a better mitigation, not a cure. Choosing it would keep the all-'equal' entry below
    open.
  - **Q2 answered:** Harris's own slack IS flagged as corruption by `FEASIBILITY_TOLERANCE`
    once δ ≥ 1e-7 (156/181 good solves rejected at δ = 1e-6). δ ≤ 1e-8 leaves 21× headroom.
    `PHASE1_FEASIBILITY_TOLERANCE` is unaffected at every δ tested. Do **not** loosen either
    guard to accommodate a larger δ.
  - **Q3 answered — drop periodic refactorization from this item's candidate list.** Measured
    on the committed n=44 crash fixture: drift from the exact basic solution stays at ~1e-15
    for 626 consecutive pivots, then one division by 1.91e-9 blows the tableau
    1.6e+4 → 8.3e+12 in a single step and leaves the basis singular. There is no accumulated
    round-off to purge, so no re-derivation schedule can help — independent of the
    dense-vs-revised-simplex question.
  - **Two decisions are Dan's before an implementation brief:** (a) every candidate re-prices
    existing users' solved weights (154/181 prefixes move, median 0.167) — this is NOT a
    regression, since `totalSlack` is unchanged and every rule attains the *identical* optimal
    Chebyshev radius on all 180 solvable regions; the point estimate is simply not uniquely
    determined today and the pivoting rule silently picks among ties; (b) which rule ships.
  - Also surfaced: `MAX_ITERATIONS = 2000` (item 4 below) becomes the *sole* remaining cause of
    adversarial failure at n=300 once this lands, and escalation timing shifts (oracle #9 hits
    degree-2 coverage-complete at round 30 vs 49), so `MAX_VALUE_RANGE_FOR_COVERAGE = 0.2`
    needs re-checking against the new solver.

  </details>

  Residual left open by the safety net: `nextAction` is deterministic, so a question whose
  every possible answer breaks the solver re-offers the same pair indefinitely. The page
  stays usable (Undo and "Stop here" both work) but can't advance — a skip-question
  affordance was judged a product decision, not hotfix scope. Note this is now much harder
  to reach in practice (no realistic-n input is known to break the solver at all), but the
  safety net and this residual both remain, deliberately: the guards stay whatever the
  pivot rule does.

- ~~**All-'equal'-heavy answer logs at high n can still fail the LP**~~ — **CLOSED 2026-08-16
  by item 3's Harris ratio test.** Re-confirmed against the shipped solver, not the lab copy:
  across 240 adversarial solves the near-singular-pivot mechanism this entry describes has
  **zero incidence**, and failures at n=150 are **0/120** — including the 100%-`'equal'` and
  100%-contradiction cells the entry called unfixable without item 3. The residual 47/120
  failures at n=300 are `MAX_ITERATIONS` (item 4) with healthy pivots throughout, a different
  cause and one well beyond any real session length. Nothing here is deferred any more; the
  historical framing below is kept because it records the boundary measurements.
  `criteria-calibration/criteria-calibration-harris-ratio-test.md`.

  <details><summary>Historical framing (pre-fix)</summary>

  **Was: NOT fixed, deliberately
  out of scope of the 2026-08-12 Dantzig pass.** On pathologically degenerate inputs — answer
  logs that are majority `'equal'` at n >= 100, or >30% self-contradictory at n >= 300 —
  Dantzig degrades the same way Bland did, via the same near-singular-pivot mechanism. What
  the Dantzig pass changed is that these now fail **loudly** (a thrown error naming the
  numerical cause) instead of returning silently-wrong weights, which was the bar that pass
  targeted. Making them not fail at all requires fixing item 3 above — the `EPS = 1e-9`
  admission itself — which is substantially larger work (Harris ratio test / refactorization)
  and needs its own brief. Practical exposure is low: Dan's real session runs ~12% `'equal'`
  with a low contradiction rate, and the measured breakdown boundary is around a 70% equal
  share at n=150. Relevant if auto-escalation ever pushes sessions into the hundreds, or if a
  user answers 'equal' very frequently. Measurements and the variable-separation sweep that
  established the boundary: `criteria-calibration-dantzig-stress-test.md`.

  **2026-08-16 update — this is now closable by item 3's fix, and measured to be so.** The
  EPS-ratio-test diagnostic re-ran the equal-share and contradiction-rate tracks (rebuilt
  generator, `'equal'` answers genuinely true under the oracle so consistency is really held
  fixed) at n=150 and n=300. Both curing candidates take near-singular incidence to 0/240 and
  failures at n=150 to **0/120**, including the 100%-`'equal'` and 100%-contradiction cells this
  entry describes as unfixable without item 3. The bare largest-|pivot| tie-break does **not**
  close it (4/120 failures, 5/240 near-singular still), so whether this entry can be retired
  depends on which rule ships. Residual n=300 failures under the curing rules are
  `MAX_ITERATIONS` (item 4), not this mechanism.
  `criteria-calibration/criteria-calibration-eps-ratio-test-diagnostic.md`.

  </details>
