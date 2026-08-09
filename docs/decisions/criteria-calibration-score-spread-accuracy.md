# Score-spread accuracy metric (replacing `computeSolverAccuracy`)

**Status: DONE, pending merge to `master`. Branch:
`criteria-calibration-score-spread-accuracy`.**

## Problem

`computeSolverAccuracy` (`accuracyTiers.ts`) averages independent per-(criterion,
level) feasible-range widths. `criteria-calibration-engine.md`'s "Part 4 finding"
established this is blind to real ranking improvement from degree-3+ answers: a
degree-3 comparison's LP constraint ties three free variables together, narrowing a
*combination* of them without necessarily narrowing any single axis, which an
independent per-axis metric can't see. Measured live (oracle simulation, 2026-08-09):
the metric moved 0.680102 → 0.680724 (Q10 → Q29, essentially flat) while real rank
displacement against a known-good order genuinely improved over the same window.

A same-day throwaway diagnostic tested a raw Chebyshev inscribed radius as a
replacement — rejected: it saturates to near-zero almost immediately (bounded by the
single tightest constraint anywhere in the whole polytope) and carries no
discriminative signal across the range where real progress happens.

## What was measured before building anything

For a sample of profile pairs, solve max/min of `scoreProfile(A) - scoreProfile(B)`
over the current feasible LP region (two extra `solveLP` calls per pair), aggregate as
`1 - avg(range width)/2`. Confirmed via a throwaway script (not committed) against:

- The oracle simulation (5-criterion, `REAL_SESSION_*` ground truth): moved
  0.492034 → 0.618936 across the exact Q10→Q29 window where the old metric stayed
  flat — this is the direct evidence the new metric fixes the identified blind spot.
- Dan's real 6-criteria/33-answer production session (no ground truth there): moved
  sensibly (0.298→0.464 across checkpoints), still creeping upward in the tail where
  the old metric had already gone flat (0.599061→0.599112→0.599290) — no sign of the
  Chebyshev-radius early-collapse failure mode.
- Cost: full 171-pair real-album-catalog sampling cost ~40–1000ms per computation as
  the tableau grows with each new answer — not viable on every answer/keystroke. A
  fixed 15-profile pool (105 pairs, 212 solves) ran in 16–123ms — viable if debounced.

## What was built

**LP construction extracted, not duplicated** (`solver.ts`). `buildValueLP` and
`profileCoeffs` pulled out of `solveValues` as their own exports — both `solveValues`
and the new metric module build against the exact same constraint set (monotonicity +
per-answer slack rows + normalization + slack cap), rather than a second,
possibly-drifting copy of that logic (which is what the throwaway measurement script
had done). `solveValues`'s own behavior is unchanged — confirmed via
`solver.test.ts`'s existing 10 tests passing unmodified after the refactor.

**New module** `src/lib/criteria-calibration/scoreSpreadAccuracy.ts`:
- `defaultSamplePairs(levelsPerCriterion)` — a fixed, seeded 15-profile pool (LCG seed
  `20260809`, same deterministic-PRNG pattern as `fixtures.ts`'s `createRng`/
  `buildPool`), degree-mixed 2-4 like `buildHistoricalFixture`. All C(15,2)=105 pairs.
  Pure function of `levelsPerCriterion` alone, memoized per shape (module-level
  `Map` cache) — not regenerated per call, not tied to session state.
  **Deliberately does NOT reuse `elicitationDriver.ts`/`questionOrdering.ts`'s live
  candidate pool** — that pool is adaptive (touch-count weighting, dominance
  filtering, degree escalation), all choices about what's worth *asking*, not what
  best *measures* current determinacy; tying the metric to it would make its own
  denominator drift for reasons unrelated to the model actually getting more
  determined.
- `computeScoreSpreadAccuracy(input, samplePairs?)` — builds the LP once via
  `buildValueLP`, solves max/min of the score-difference objective for each sampled
  pair, aggregates as `1 - avg(width)/2`, clamped to [0,1].

**Recompute strategy split by call site** (per plan, cost-driven):
- `persistence.ts`'s `upsertWeightsAndStatus` — swapped in directly, no debounce.
  Already async and off the interactive render path (runs once per committed
  answer, not per keystroke).
- `CriteriaCalibrationPage.tsx`'s progress ring — moved from an inline `useMemo`
  (recomputed synchronously on every `answers` change) to a `useEffect` debounced
  ~400ms after `answers` settles, holding the last-known `progressPercent`/
  `mediumReached` state in the meantime. Avoids blocking render on ~105-pair
  solve bursts during rapid undo/redo.

**Thresholds** (`accuracyTiers.ts`) — new, provisional, same status as the constants
they replace:
```ts
export const SCORE_SPREAD_MEDIUM_THRESHOLD = 0.55;
export const SCORE_SPREAD_HIGH_THRESHOLD = 0.75;
export const SCORE_SPREAD_VERY_HIGH_THRESHOLD = 0.85;
```
`isMediumTierReached`/`solverAccuracyTier` are unchanged in signature (still
`(accuracy: number) => ...`, metric-agnostic) — they now read these constants instead
of the old `MEDIUM_ACCURACY_THRESHOLD`/`HIGH_ACCURACY_THRESHOLD`/
`VERY_HIGH_ACCURACY_THRESHOLD`. Tied to the deferred-work.md entry (below) for future
recalibration.

**Amendment from the approved plan (Dan's call):** `computeSolverAccuracy` is
**kept**, not deleted, marked `DEPRECATED` in its doc comment, and removed from both
production call sites (now genuinely dead code) — rollback safety, since only one real
account has been tested against the new metric so far. The old threshold constants
(`MEDIUM_ACCURACY_THRESHOLD`/`HIGH_ACCURACY_THRESHOLD`/`VERY_HIGH_ACCURACY_THRESHOLD`)
are kept alongside it for the same reason — a rollback to the old metric shouldn't also
need to resurrect its thresholds from git history.

## Tests

`scoreSpreadAccuracy.test.ts` (new): `defaultSamplePairs` structural regression
(exactly 105 pairs, pure/memoized), an oracle-milestone test asserting
`computeScoreSpreadAccuracy` increases by >0.1 across Q10→Q29→Q49 (direct regression
test for the Part 4 blind spot), a no-early-collapse floor assertion (regression for
the rejected Chebyshev-radius approach), a real-production-session monotonicity check,
and a generous (3s) cost sanity bound.

`accuracyTiers.test.ts`: `computeSolverAccuracy`-specific tests removed (testing dead
code isn't valuable); `isMediumTierReached`/`solverAccuracyTier` tests retargeted to
the new `SCORE_SPREAD_*` constants.

`elicitationDriver.test.ts`: the two spots that used `computeSolverAccuracy` as a
helper (not as the subject under test) were switched to `computeScoreSpreadAccuracy`
so the driver tests reflect actual production behavior. The oracle-simulation test's
old numeric assertions calibrated to `computeSolverAccuracy`'s specific shape
(`accuracyAtCoverage > 0.5`, a strict diminishing-returns comparison between early and
late gain) were replaced with a looser monotonic-improvement check — those old
assertions were testing the deprecated metric's particular character, and the new
metric's actual shape (meaningful, not-strictly-diminishing improvement) is already
covered precisely by `scoreSpreadAccuracy.test.ts`'s dedicated milestone test, so it
wasn't duplicated here.

Full suite: 230/230 passing (32 files). `tsc --noEmit` clean. Lint clean on every file
touched this branch (a pre-existing, unrelated ~3285-problem repo-wide `npm run lint`
backlog was confirmed present identically on `master` before this branch — not
introduced or touched here).

## Not built / not touched

- `elicitationDriver.ts`/`questionOrdering.ts` — untouched, per plan (sampling
  deliberately independent of the adaptive candidate pool).
- `simplex.ts` internals — untouched (separate, already-merged work).
- No solve-sharing between `solveValues` and `computeScoreSpreadAccuracy` beyond the
  shared `buildValueLP` constraint construction — `persistence.ts`'s
  `upsertWeightsAndStatus` calls both separately (one extra phase-1 LP solve per commit,
  acceptable given it's async/off-render-path).

## Files

`src/lib/criteria-calibration/`: `solver.ts` (refactored: `buildValueLP`,
`profileCoeffs` extracted and exported), `scoreSpreadAccuracy.ts` (new),
`accuracyTiers.ts` (new thresholds, `computeSolverAccuracy` deprecated),
`persistence.ts`, `CriteriaCalibrationPage.tsx`. Tests:
`scoreSpreadAccuracy.test.ts` (new), `accuracyTiers.test.ts`,
`elicitationDriver.test.ts`, `solver.test.ts` (unmodified, still passing — confirms
the `buildValueLP` extraction is behavior-preserving).
