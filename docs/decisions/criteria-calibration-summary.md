# Criteria Calibration — summary & index

## What this is

Criteria Calibration (Phase 7) is a pairwise-comparison questionnaire that lets a user
implicitly weight the app's rating criteria against each other, instead of typing in raw
numbers. Each answer feeds a preference graph; a linear-programming solver
(`src/lib/criteria-calibration/simplex.ts` / `solver.ts`) resolves that graph into a
per-criterion, per-level value model, which is what actually drives album scores and
rankings once a user has calibrated. The UI (`CriteriaCalibrationPage.tsx`) walks the user
through an adaptively-ordered sequence of questions, escalating from broad ("degree 2")
trade-offs to finer-grained ones as answers accumulate, and stops once the model's accuracy
and coverage stop improving.

## Current status

**Shipped and live in production:** the full pipeline — engine, UI, Supabase persistence,
undo/redo, resume-on-reload, adaptive degree escalation, the two-phase-simplex/Dantzig LP
solver rewrite, dominance/partial-tie candidate filtering, the score-spread accuracy metric,
and Brief 3's auto-escalation stop signal. Two independent real user sessions (33/70/71
real answers across two account resets) have exercised the shipped pipeline end to end.

**The one open correctness risk, carried forward every session:** `last_eligible_top10` and
`last_change_answer_index` (`user_calibration_status` table) are unguarded against the same
un-awaited-write race that `accuracy_value`/`tier`/`answer_count` were fixed against on
2026-08-15 (see `criteria-calibration-weights-write-race.md`). A regressed
`last_change_answer_index` can make a later resumed session compute an inflated stability
span, which can fire Brief 3's auto-escalation signal **earlier than the true trajectory
warrants** — confirmed live via reproduction script, not theoretical. It cannot falsely
*un-fire* an already-correct stop (`fired`'s own guard is unaffected), only fire early. No
user-visible symptom, no self-correction. Full mechanism and reproduction:
`criteria-calibration-weights-write-race.md`'s "Fix implemented" section. This is the single
statement of that risk — `CLAUDE.md` and `deferred-work.md` both point here rather than
restating it.

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

**Data operations & write-race safety**
- `criteria-calibration-weights-write-race.md` — diagnoses and partially fixes the un-awaited-write race (see "Current status" above)
- `criteria-calibration-second-session-reset.md` — wipes a completed session for a second validation run

**Research**
- `criteria-calibration-1000minds-comparative-research.md` — comparative research against 1000minds' PAPRIKA calibration UX
- `criteria-calibration-synthetic-oracles.md` — 10 synthetic ground-truth oracles driving the real `nextAction()` flow; surfaces a live LP solver crash on clean/consistent input (new, higher-priority than the prior stress test's "GO" verdict), plus solver-recovery and UX-arbitration data (Idea 1/Idea 2 pause-screen proposals, tier-crossing spread) for the future Concept Draft session
- `criteria-calibration-near-singular-pivot-impact.md` — impact assessment for that crash: traced end to end (no error boundary anywhere → React root unmounts → blank page), reproduced through the real `CriteriaCalibrationPage`, answer persisted before the solve so a reload reproduces it; Supabase integrity unaffected. Recommends a **mitigation hotfix** ahead of the `EPS = 1e-9` cure

**Supporting data**
- `second-session-accuracy-trajectory-2026-08-15.csv` — full accuracy/tier/fired trajectory from the second real session, referenced by the ranking-stability and 1000minds docs

## Not in this repo

`criteria-calibration-algorithm-map.md` exists only in Project Knowledge (claude.ai) — it
is not and has never been checked into this repo. Don't go looking for it under
`docs/decisions/`.
