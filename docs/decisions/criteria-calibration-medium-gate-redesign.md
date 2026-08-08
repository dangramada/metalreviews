# Criteria Calibration: Medium-tier gate redesign

Branch: `criteria-calibration-medium-gate-redesign`, off `master`.

## 2026-08-08 — Diagnostic: why degree-2 questions were extremes-only

A live-observed issue (`deferred-work.md`, `album-rating-drawer.md`): "Medium tier's
degree-2 questions only ever compare each criterion's extreme levels (1 vs 5)," causing
levels 2-4 to be indistinguishable and producing real score ties. Traced with code
evidence, not paraphrase:

1. `coldStartProfilesForPair` (`elicitationDriver.ts`) hardcodes every degree-2
   cold-start comparison as pure extremes: `{criterion: max, other: 1}` vs
   `{criterion: 1, other: max}`. It runs unconditionally, once per criteria pair, for
   all `C(N,2)` pairs, before anything else in `nextAction` can run.
2. Extremes-only is hardcoded for the mandatory cold-start pass. A separate refinement
   pool (`generateCandidatesForSubset`) *can* draw mid-levels (1..max), but it's only
   reached after cold-start finishes covering every pair — and the old
   `isMediumTierReached` fired at exactly that moment (see below), so refinement rarely
   got a chance to run before Medium was already granted. Even when reached,
   `MAX_AMBIGUOUS_GAP = 0.05` typically returned `degree-exhausted` immediately
   afterward, because point estimates from the sparse extreme-only answers already
   looked artificially well-separated.
3. `PreferenceGraph`'s closure (`preferenceGraph.ts`) is a strict exact-profile-key
   match — no interpolation or assumption about untested levels. Confirms the bug isn't
   a closure defect; it's that the mandatory gate never inserted mid-level keys into the
   graph at all.
4. Confirmed on the one production account that reached Medium (`eec42cd4-...`): all 15
   stored answers are literally 1-vs-5, zero occurrences of level 2, 3, or 4.

Full method for this diagnostic pass: static read of `elicitationDriver.ts`,
`questionOrdering.ts`, `accuracyTiers.ts`, `preferenceGraph.ts`, plus a live Supabase
query (`user_calibration_status`, `user_calibration_answers`) against the one account
that had reached Medium in production.

## 2026-08-08 — Redesign decision: replace the gate, not the question template

A separate Claude.ai discovery session (Python/LP reconstruction against Dan's real
5-criterion 1000minds export) found that neither a canonical extreme-only protocol nor a
fixed/random mid-level template recovers per-level values or album-rank accuracy well —
only genuinely adaptive question selection (matching Dan's real historical session) does.
Conclusion: the fix isn't a better fixed/random degree-2 template. The codebase already
has adaptive candidate selection (`questionOrdering.ts`'s closest-estimate-ambiguity
heuristic); it just never gets a chance to run before the old Medium gate is satisfied.
**The gate itself needed to require genuine adaptively-gathered information, not raw
canonical-pair count.**

Re-verified the diagnostic findings still held (files unchanged since 2026-07-30), then
gathered two new pieces of evidence against the real engine (not a reconstruction):

- **The live production account's actual solver accuracy at the moment old-Medium was
  granted: 0.60** (`computeSolverAccuracy`, vs. `HIGH_ACCURACY_THRESHOLD = 0.92`). Levels
  2, 3, and 4 have identical, fully-unconstrained feasible ranges `[0, max]` for every
  one of the 6 criteria — the solver has zero information distinguishing them.
- **Replaying Dan's real 31-answer session through the old `isMediumTierReached` never
  fires at all.** The real session never asks the literal canonical `{max,1}` vs
  `{1,max}` comparison for most pairs (only 3 of 20 degree-2 rounds were extremes; 17
  were mid-level-anchored), and one pair (criteria 3 & 4 — "Album coherence" vs
  "Versatility") is never touched at any level, at any degree, in the entire 31-answer
  session — yet the model still reaches 0.92+ solver accuracy and 0.97+ Kendall-tau rank
  correlation by the end. Progression:

  | answers | solverAccuracy | rank correlation (τ) |
  |---|---|---|
  | 5 | 0.30 | 0.83 |
  | 10 | 0.53 | 0.72 |
  | 15 | 0.55 | 0.80 |
  | 20 | 0.88 | 0.92 |
  | 29 | 0.92 | 0.98 |
  | 31 | 0.92 | 0.98 |

This confirms exhaustive-canonical-pair coverage is neither necessary (pair 3,4 skipped
entirely in the real session) nor sufficient (0.60 accuracy from exactly that coverage in
production) for a model that's actually useful.

### Options considered

- **Option A — coverage + fixed refinement budget.** Rejected: the discovery session
  already showed fixed/random question budgets underperform adaptive selection — same
  structural flaw as the old gate, different name.
- **Option B — solver-accuracy convergence.** Chosen. Gate Medium on
  `computeSolverAccuracy(result)` crossing a threshold, same mechanism already used for
  High/Very High, extended downward.
- **Option C — tie Medium to the driver's own `degree-exhausted` exhaustion signal.**
  Deferred, not rejected: philosophically cleaner (reuses the existing mechanism rather
  than adding a second metric) but requires re-tuning `MAX_AMBIGUOUS_GAP` against real
  degree-2 refinement data we don't have yet — larger, more coupled change than B.
  Revisit only if B proves insufficient.

### Decisions (Dan, 2026-08-08)

1. **Option B.**
2. **`MEDIUM_ACCURACY_THRESHOLD = 0.85`, provisional** — same unvalidated-constant status
   already flagged for `HIGH_ACCURACY_THRESHOLD`/`VERY_HIGH_ACCURACY_THRESHOLD`
   (0.92/0.97). Final calibration deferred to the already-planned real calibration
   session on the current 6-criteria model; do not re-tighten/loosen without that
   session's data.
3. **`MAX_AMBIGUOUS_GAP` decoupled from gating** (sub-choice 3 of the three offered): it
   continues to govern only when `nextAction` stops *offering* further degree-2
   refinement questions (UX pacing). It has no authority over whether Medium is granted —
   that's `computeSolverAccuracy` vs. `MEDIUM_ACCURACY_THRESHOLD` alone.
4. **Migration: re-gate.** The one production account at old-Medium
   (`eec42cd4-e714-46a2-ad9c-35714a1d3a2c`) does not qualify under the new rule (0.60 <
   0.85) — its `user_calibration_status.tier` is flipped back to `'none'`. Flagged and
   executed as an explicit, separately-reported step (see below), not bundled silently
   into the code diff — a real account visibly loses its Medium status.

### Implementation

- `accuracyTiers.ts`: `isMediumTierReached` signature changed from
  `(graph: PreferenceGraph, allDegree2Pairs: readonly ComparisonPair[])` to
  `(accuracy: number)`, returning `accuracy >= MEDIUM_ACCURACY_THRESHOLD`. New exported
  `MEDIUM_ACCURACY_THRESHOLD = 0.85` constant, marked provisional in comments.
  `ComparisonPair` stays exported — still used by `sessionProgress.ts`'s
  `degree2CoveragePercent` for the UI's progress display, which is unchanged.
- `elicitationDriver.ts`: no logic changes (cold-start still asks canonical
  extreme-pairs first, unconditionally, as the solver-seeding floor before refinement) —
  doc comments updated to stop claiming cold-start coverage is "Medium tier's
  prerequisite," and to make `MAX_AMBIGUOUS_GAP`'s UX-pacing-only scope explicit.
- `persistence.ts`: `upsertWeightsAndStatus` reordered to compute `accuracy` before
  `mediumReached` and calls `isMediumTierReached(accuracy)` directly; the
  `CalibrationSession`/`buildCanonicalDegree2Pairs` imports it no longer needs were
  removed. The combined-tier-rule comment (`high`/`very_high` require Medium too) is
  updated to note the two checks now nest structurally by construction (0.92/0.97 both
  exceed 0.85), rather than needing the old graph-based independence argument.
- `CriteriaCalibrationPage.tsx`: `mediumReached` now runs `solveValues` +
  `computeSolverAccuracy` over the live in-memory answer log inside a `useMemo`, then
  calls `isMediumTierReached(accuracy)`. `canonicalPairs`/`session.graph` remain, used
  only by `degree2CoveragePercent` for the progress bar — unchanged display logic, no UI
  changes.
- Tests: `accuracyTiers.test.ts`'s `isMediumTierReached` describe block rewritten for the
  new `(accuracy: number)` contract. `elicitationDriver.test.ts` and
  `sessionProgress.test.ts` had cross-checks whose premise no longer holds ("coverage
  100% implies Medium") — replaced with accuracy-based assertions
  (`elicitationDriver.test.ts`) or removed with an explanatory comment
  (`sessionProgress.test.ts`, which now tests `degree2CoveragePercent` alone). All 222
  tests pass; `tsc --noEmit` and `eslint` clean.

### Fixture re-check (real engine, real 31-answer session)

Re-ran the check against the actual new rule (not the old canonical definition), walking
`buildRealSessionAnswers()` chronologically and computing
`isMediumTierReached(computeSolverAccuracy(solveValues(...)))` after each prefix:

**New gate first fires at answer 19 (accuracy = 0.8715)** — close to the real session's
own ~20-answer degree-2 milestone (accuracy 0.8804 at 20), and a real, non-degenerate
number reached partway through the degree-2 phase, not immediately at answer 1 or only
at the very end. For reference, full-session (31 answers) accuracy is 0.9237.

### Out of scope, not touched this pass

`computeSolverAccuracy`'s degree-3+ blindness (tracked separately); `HIGH_ACCURACY_THRESHOLD`/`VERY_HIGH_ACCURACY_THRESHOLD` values; any UI/`CriteriaCalibrationPage` visual or interaction changes; question generation beyond degree-2.
