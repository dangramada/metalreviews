# Criteria Calibration — summary & index

## What this is

Criteria Calibration (Phase 7) is a pairwise-comparison questionnaire that lets a user
implicitly weight the app's rating criteria against each other, instead of typing in raw
numbers. Each answer feeds a preference graph; a linear-programming solver
(`src/lib/criteria-calibration/simplex.ts` / `solver.ts`) resolves that graph into a
per-criterion, per-level value model, which is what actually drives album scores and
rankings once a user has calibrated. The UI (`CriteriaCalibrationPage.tsx`) walks the user
through an adaptively-ordered sequence of questions, escalating from broad ("degree 2")
trade-offs to finer-grained ones as answers accumulate. As of 2026-08-17 the user decides when
to stop, at explicit checkpoints tied to accuracy tiers — the earlier design, which tried to
detect a good stopping point automatically, is retired (see
`criteria-calibration-tiered-checkpoints.md`).

## Current status

**Shipped and live in production:** the full pipeline — engine, UI, Supabase persistence,
undo/redo, resume-on-reload, adaptive degree escalation, the two-phase-simplex/Dantzig LP
solver rewrite, dominance/partial-tie candidate filtering, and the score-spread accuracy
metric. Two independent real user sessions (33/70/71 real answers across two account resets)
have exercised the shipped pipeline end to end. (Brief 3's auto-escalation stop signal was
also shipped, and was **deleted again on 2026-08-17** — see the entry below.)

**2026-08-16 — the LP solver's near-singular-pivot failure mode is CURED**, not merely
contained: the leaving-row rule is now a Harris two-pass ratio test. `deferred-work.md` item 3
and the all-'equal' entry are both closed. Read
`criteria-calibration-harris-ratio-test.md`'s "What NOT to change" before touching
`simplex.ts` — several of its constants are load-bearing in non-obvious ways. New open item
(3b, surfaced not caused): the reported point estimate is one arbitrary pick among tied optima,
so **never pin specific solved weight values in a test**.

**2026-08-17 — the auto-escalation signal is RETIRED, and with it the project's one open
correctness risk.** Brief 3's duration-based stop signal (top-10 stability over
`RANKING_TEST_SET`) is deleted outright — it could never work for a first-time user, and five
mathematical replacements were tested and all failed (see
`criteria-calibration-escalation-signal-candidates.md`). In its place, degree escalation is
gated by four explicit user-facing checkpoints: at the degree-2 boundary, on crossing High, on
crossing Very High, and a neutral fallback when comparisons run out. Between those, escalation
is silent. Full design, and the "what NOT to change" list:
`criteria-calibration-tiered-checkpoints.md`.

The write-race on `last_eligible_top10` / `last_change_answer_index` **stops existing rather
than being fixed**: it was scoped exactly to those columns, and
`supabase/user_calibration_status-drop-stability-window.sql` drops them along with the
`previous_` triple and narrows the RPC to four parameters. Every surviving field is covered by
the existing `answer_count` guard. `CLAUDE.md` and `deferred-work.md` point here rather than
restating it.

**Verified live 2026-08-17.** The migration is applied (all 7 columns dropped, the 4-param RPC
resolves, no stale 11-param overload lingering), and a browser pass on the disposable QA
account covered the degree-2 checkpoint, escalation, silent auto-progression, and a full
persistence round-trip through the narrowed RPC.

**Also retired by the same pass:** the `RANKING_TEST_SET` multi-user rework that
`deferred-work.md` had been holding open. There is no benchmark set left to make per-user.

**Not built:** an in-product explanation of why some users see more questions than others
(deferred, no UI planned); the "calibration results page" concept (weights/levels shown
visually); the accuracy-display two-signal split (consistency vs. coverage) proposed
2026-08-15. See `deferred-work.md` sections A/C for these and other open items.

## File index

Grouped by pipeline stage, roughly chronological within each group.

**Core engine, UI, wiring**

- `criteria-calibration-engine.md` — preference graph, closure, contradiction handling, LP solver, ordering heuristic
- `criteria-calibration-ui.md` — selection/hold/fade state machine, Progress-vs-Accuracy split, Undo/Redo
- `criteria-calibration-wiring.md` — wired to real `CalibrationSession`/`nextAction`, Supabase persistence

**Question-selection & degree-escalation tuning**

- `criteria-calibration-medium-gate-redesign.md` — fixed degree-2 extremes-only questions
- `criteria-calibration-dominance-filter.md` — rejects dominated/tied candidate pairs
- `criteria-calibration-coverage-weighted-candidates.md` — weights sampling toward under-covered levels
- `criteria-calibration-adaptive-degree-escalation.md` — coverage-based degree escalation replaces gap-based check
- `criteria-calibration-degree-scoped-coverage-fix.md` — scopes the coverage gate per-degree, not whole-model
- `criteria-calibration-partial-tie-fix.md` — rejects partial-tie candidates
- `criteria-calibration-additive-model-degree-sufficiency.md` — diagnostic: why degree-2 alone converges the additive model

**Solver correctness & performance**

- `criteria-calibration-joint-point-estimate.md` — single joint Chebyshev-center solve restores the sum-to-1 invariant
- `two-phase-simplex-rewrite.md` — Big-M → two-phase simplex, fixes a numerical blowup
- `criteria-calibration-score-spread-accuracy.md` — replaces `computeSolverAccuracy` with a score-spread LP metric
- `criteria-calibration-dantzig-stress-test.md` — read-only diagnostic validating Dantzig pivoting over Bland's rule
- `criteria-calibration-dantzig-fix.md` — ships Dantzig pivoting, feasibility guard, diagnostics
- `criteria-calibration-reload-glitch-and-sluggishness-fix.md` — collapses redundant per-commit solves, un-awaited insert
- `criteria-calibration-lp-warm-start.md` — `prepareLP`/`solveFromPrepared` split, 6× per-question speedup

**Auto-escalation / ranking-stability signal (Brief 3)**

- `criteria-calibration-ranking-stability-analysis.md` — evidentiary analysis across two real sessions
- `criteria-calibration-auto-escalation-signal.md` — Brief 3 implementation: tier-gated top-10 stability signal
- `criteria-calibration-fine-grained-firing-instability.md` — diagnostic: K=2 checkpoint window false-positives
- `criteria-calibration-duration-based-window-fix.md` — replaces K=2 checkpoint count with a real-answer-span window
- `criteria-calibration-escalation-signal-candidates.md` — diagnostic (2026-08-16, no code changed): evaluates two solver-internal replacements for the `RANKING_TEST_SET` signal, which cannot work for any first-time user. **Both fail** — coverage width (A) has no single threshold that works across the 12-trace evidence set at any R; weight-vector stability (B) is structurally unsound, its converged-tail jitter matching still-learning movement on 5 of 11 traces. Second pass (§9–§14, same day) tested the two named follow-ups — normalised coverage ratio (A2) and accuracy plateau (A3) — and **both fail too**, closing the mathematical-signal direction. **Standing recommendation is Candidate C**: drop detection entirely, show an explicit "See results / Answer more questions" checkpoint at each existing `isDegreeCoverageComplete` boundary (1000minds pattern). Measured cost: 2 extra screens per real session. Deletes ~876 lines, 7 DB columns, and **the project's one open correctness risk** — the write-race is scoped exactly to the columns C removes. Also records that the Harris fix moved both real sessions' stability points, making `deferred-work.md`'s n=35/n=45 figures stale. **RESOLVED 2026-08-17** — a tier-gated variant of Candidate C shipped; see `criteria-calibration-tiered-checkpoints.md`

- `criteria-calibration-accuracy-threshold-recalibration.md` — diagnostic (2026-08-17, no code changed): fits `SCORE_SPREAD_MEDIUM/HIGH/VERY_HIGH_THRESHOLD` against real ground truth (Kendall's tau vs the 10 oracles' known true weight vectors, on a 200-profile pool structurally disjoint from the metric's own 15-profile sample). **All six quality bars yield an empty usable threshold window across 12 traces** — `#1 uniform` crosses High at answer 5 while `#4 linear-control` never crosses it in 90 and ends with the best ranking in the set. Cause is not placement: **`computeScoreSpreadAccuracy` measures determinacy, not correctness**, and the two diverge both ways (`#8 noisy` hits accuracy 1.0000 at tau 0.7575 — precisely determined, to the wrong model). Same within-session-good / across-session-incomparable failure as Candidate A. **Recommendation was: keep 0.55/0.75/0.85, add a ~15–20 answer floor, reword the copy to claim determinacy** — `accuracyTiers.ts` untouched. **Superseded 2026-08-25** by `criteria-calibration-degree-tiers-and-progress.md`, which moved tier assignment off percentage thresholds entirely; this doc's findings are now historical context, not open work. Also establishes that `A70`'s final top-10 is **not** uniquely determined (25 challengers, 8/9 internal orders undecided) and that the published 13-album `settle` points understate convergence

**Data operations & write-race safety**

- `criteria-calibration-tiered-checkpoints.md` — **read this for anything about degree escalation, stopping, or the accuracy tiers shown to the user.** Retires the auto-escalation signal and replaces it with tier-gated checkpoints (degree-2 boundary / High / Very High / neutral exhaustion fallback); deletes ~876 lines, 7 DB columns and the write-race; corrects two stale premises in its own brief (deprecated threshold constants, and an assumed-merged prerequisite that wasn't); records why tier-crossing here is NOT the thing Pass 2 rejected, and why checkpoints fire on an in-session crossing rather than a standing tier
- `criteria-calibration-weights-write-race.md` — diagnoses and partially fixes the un-awaited-write race; **the residual risk it documents was retired 2026-08-17 by deleting the columns** (see "Current status" above)
- `criteria-calibration-second-session-reset.md` — wipes a completed session for a second validation run; its "Outcome" section (added 2026-08-16) is the current source of truth for Dan's account state — that session ran and completed at 71 answers, so the account is **not** empty

**Research**

- `criteria-calibration-1000minds-comparative-research.md` — comparative research against 1000minds' PAPRIKA calibration UX
- `criteria-calibration-synthetic-oracles.md` — 10 synthetic ground-truth oracles driving the real `nextAction()` flow; surfaces a live LP solver crash on clean/consistent input (new, higher-priority than the prior stress test's "GO" verdict), plus solver-recovery and UX-arbitration data (Idea 1/Idea 2 pause-screen proposals, tier-crossing spread) for the future Concept Draft session
- `criteria-calibration-near-singular-pivot-impact.md` — impact assessment for that crash: traced end to end (no error boundary anywhere → React root unmounts → blank page), reproduced through the real `CriteriaCalibrationPage`, answer persisted before the solve so a reload reproduces it; Supabase integrity unaffected. Recommends a **mitigation hotfix** ahead of the `EPS = 1e-9` cure
- `criteria-calibration-solver-crash-safety-net.md` — that hotfix, shipped: compute-first ordering on the mutating handlers (chosen over persist-then-delete, which depends on a delete succeeding), guarded `action` memo + auto-recovery for already-persisted bad logs, route-level `ErrorBoundary`. Solver layer untouched; the `EPS = 1e-9` cure is still open
- `criteria-calibration-eps-ratio-test-diagnostic.md` — the `EPS = 1e-9` cure, diagnosed (read-only, 2026-08-16): **GO for a Harris two-pass ratio test at `pivotTolerance = 1e-7`, `δ = 1e-8`** — near-singular incidence 41+25/240 → 0/240, oracle crashes 4/10 → 0/10. Rules out periodic refactorization by measurement (no accumulated drift to purge — one pivot destroys the tableau), rules out the plain magnitude floor as sketched (unbounded step overshoot), and finds that Harris's own slack trips `FEASIBILITY_TOLERANCE` once δ ≥ 1e-7. Flags that **any** rule re-prices existing users' weights, because the Chebyshev point estimate is not uniquely determined today. Harness: `scripts/lab-eps-ratio-test-2026-08-16/`
- `criteria-calibration-harris-ratio-test.md` — **the cure, shipped (2026-08-16)**: implements the above at `pivotTolerance = 1e-7`, `δ = 1e-8` in `simplex.ts`. Re-confirms every regression track against the shipped solver rather than the lab copy (bit-identical parity, `digestDiffVsProd=0` on 181 solves), re-solves Dan's live 71-answer log read-only for the real repricing magnitude, inverts `solverCrashFixture.test.ts` after failing to construct any realistic-n log that still breaks the rule, and re-checks `MAX_VALUE_RANGE_FOR_COVERAGE`. **Read its "What NOT to change" before editing `simplex.ts`.**

**Supporting data**

- `second-session-accuracy-trajectory-2026-08-15.csv` — full accuracy/tier/fired trajectory from the second real session, referenced by the ranking-stability and 1000minds docs

## Not in this repo

`criteria-calibration-algorithm-map.md` exists only in Project Knowledge (claude.ai) — it
is not and has never been checked into this repo. Don't go looking for it under
`docs/decisions/`.
