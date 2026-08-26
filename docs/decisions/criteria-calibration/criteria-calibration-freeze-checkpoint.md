# Freeze checkpoint — Step 2: threshold, screen, and verification

Branch: `criteria-calibration-freeze-checkpoint`, rebased onto `master` after
`criteria-calibration-checkpoint-copy-rewrite` merged (`9f7eb54`). Step 1 (read-only pool-empty
diagnostic) is `criteria-calibration-freeze-checkpoint-step1-pool-check.md`; this document covers
Step 2 (threshold, trigger wiring, verification) only. Solver logic
(`MAX_VALUE_RANGE_FOR_COVERAGE`, `isDegreeCoverageComplete`) is untouched throughout.

## Recap: what Step 1 already settled

For all four preference shapes that never reach `coverage-complete` at degree 2 (`#2
single-dominant`, `#4 linear-control`, `#5 front-loaded`, `#6 back-loaded`), the degree-2
candidate pool is confirmed NON-empty at round 90 — 54-62 unasked candidates remain, uniformly
Case B across all four, not mixed. Consequence carried into this step: the checkpoint's degree-3
continuation is a single, uniform explicit-consent screen for all four shapes — **no runtime
Case A/B branching was built**, since Case A never occurs among them.

## Step 2a — the freeze threshold, empirically derived

**Question**: at what answer-count position, if the session is still at degree 2 and
unexhausted, is it safe to conclude the session is frozen rather than merely still working
through a normal cold start?

**Method**: position, not freeze-run length, is the discriminator (per Dan's own calibration
note). For each of the 12 evidence traces (10 synthetic oracles +
`degree-tier-recon-2026-08-18.csv`'s A70/B71), find the round at which degree 2 actually ends
(`is_boundary = 1` with `degree = 2` in that CSV) for the 8 traces that DO leave degree 2, and
the largest max-consecutive-no-`covered`-movement run for context. The threshold is one past the
latest of those exit rounds — the smallest position that cannot false-trigger on any healthy
trace in the set.

| Trace | Exits degree 2 at round | Max freeze run within degree 2 (context only) |
|---|---|---|
| `#8 noisy` | 28 | 11 |
| `B71` | 28 | 10 |
| `#1 uniform` | 30 | 11 |
| `#9 short-session-degree2-cap` | 30 | 11 |
| `A70` | 32 | 8 |
| `#3 zero-weight-criterion` | 34 | **28** |
| `#7 near-tied` | 73 | 15 |
| `#10 dan-approximation` | **77** (latest) | 13 |
| `#2 single-dominant` | never (round 90 cap) | 65 |
| `#4 linear-control` | never (round 90 cap) | **23** |
| `#5 front-loaded` | never (round 90 cap) | 63 |
| `#6 back-loaded` | never (round 90 cap) | 29 |

**Chosen threshold: `DEGREE_2_FREEZE_ANSWER_THRESHOLD = 78`** (77 + 1). Zero false positives on
all 8 healthy traces; correctly frozen at round 90 for all 4 blocked traces (78 ≤ 90 for all of
them, and their trajectories are still active well past 78 — see Step 1's pool-size data at
round 90, 54-62 candidates remaining).

**Why position and not freeze-run length**, confirmed directly by the "max freeze run" column
above: `#3 zero-weight-criterion` (healthy) has a **28-round** freeze that still fully resolves
by round 34. `#4 linear-control` (permanently blocked) has a shorter **23-round** max freeze
that never resolves. A length-based threshold gets the two groups backwards — the healthy trace's
worst freeze is LONGER than the blocked trace's worst freeze. Position sidesteps this entirely:
it doesn't ask "how long has it been stuck", it asks "has this exceeded the latest point any
healthy trace was ever still stuck at all" — a question the data answers cleanly.

Implementation, `degreeTiers.ts`:

```ts
export const DEGREE_2_FREEZE_ANSWER_THRESHOLD = 78;

export function isDegree2Frozen(currentDegree: number, answersAtCurrentDegree: number): boolean {
  return currentDegree === 2 && answersAtCurrentDegree >= DEGREE_2_FREEZE_ANSWER_THRESHOLD;
}
```

Deliberately scoped to degree 2 only (matches the brief's title — "recunoaștere explicită a
gradului 2 'înghețat'") — not a general "any degree can freeze" detector, and should not be
generalized without new evidence, same caution `isLabelChangingDegree`'s own header already
states for adding rungs.

## The screen: architecturally identical to the other four, one new trigger

No new copy was written on this branch — Tip 4's headline, body, and button text were defined
and merged by `criteria-calibration-checkpoint-copy-rewrite` (`'frozen'` variant in
`checkpointCopy.ts` / `CalibrationCheckpoint.tsx`), unwired at the time specifically so this
branch would only need to add the trigger condition. Re-confirmed byte-for-byte against the
approved brief text before starting this step (headline, all four body sentences including the
apostrophe contractions, both button labels) — no drift.

**Trigger wiring**, `CriteriaCalibrationPage.tsx`'s checkpoint derivation:

```ts
} else if (
  !atDegreeBoundary &&
  action?.type === 'ask' &&
  acknowledgedBoundaryDegree !== degree &&
  isDegree2Frozen(degree, answersAtCurrentDegree)
) {
  checkpoint = 'frozen';
}
```

This is the one structural difference from the other four checkpoints: they all fire when
`action.type === 'degree-exhausted'` (`atDegreeBoundary`); `'frozen'` fires while
`action.type === 'ask'` — the driver is still offering real degree-2 comparisons (pool is
non-empty, per Step 1), the checkpoint is an editorial judgment call layered on top, not a
report from the driver itself.

**"Continue" handler**: `handleEscalate()` could not be reused — it requires
`action.type === 'degree-exhausted'`, which is never true when this checkpoint shows. A new
`handleFreezeContinue()` advances `degree + 1` directly, guarded the same way `canEscalate` is
guarded elsewhere (`nextDegree > catalog.levelsPerCriterion.length` bails out, though this can
never actually trigger at degree 2 for any catalog with 3+ criteria):

```ts
function handleFreezeContinue() {
  if (!catalog) return;
  const nextDegree = degree + 1;
  if (nextDegree > catalog.levelsPerCriterion.length) return;
  setAcknowledgedBoundaryDegree(degree);
  setDegree(nextDegree);
}
```

**Acknowledgment state**: reuses `acknowledgedBoundaryDegree` — no second, parallel
acknowledgment field was introduced, per the brief. This is safe, not merely convenient: the
freeze branch and the real degree-2-boundary branch above it in the same `if`/`else if` chain
are mutually exclusive by construction of the threshold's own safety margin. Every healthy trace
in the evidence set exits degree 2 by round 77 at the latest; a session that is still at degree
2, still receiving `ask` actions, at answer 78 cannot simultaneously be sitting on degree 2's
real `degree-exhausted` boundary in that same render. Two events that can never coexist for the
same session can safely share one acknowledgment slot.

## Verification: label doesn't retroactively promote

Unchanged from the copy-rewrite branch's own verification (that branch established the general
mechanism; this step exercises it end to end with the real trigger for the first time). While
still at degree 2 past the freeze threshold, `completedDegrees(2, false) = 1` maps to `'none'`
(Unfocused) — the badge shown on the frozen screen itself. After clicking Continue,
`degree` becomes 3; until degree 3 hits its OWN real boundary, `completedDegrees(3, false) = 2`
still maps to `'none'`, not `'medium'` (Blurry) — degree 2 is never retroactively marked
complete just because the user moved past it. If degree 3 later exhausts normally, the badge
jumps straight to `'high'` (Clear), skipping Blurry entirely, exactly as
`criteria-calibration-checkpoint-copy-rewrite.md`'s skip-Blurry case describes.

## Verification: weights are not reset

Confirmed both by inspection and by a direct behavioral test (see below): `degree` is a
page-local pointer to which comparisons `nextAction` offers next, not solver state. The solver
(`solveValues`, called inside `computeCommitState`/`computeScoreSpreadAccuracy`) always re-runs
against the full `session.fullLog`, which `handleFreezeContinue` never touches — it calls
`setDegree` only. Nothing about the 78 already-recorded answers changes when the user continues
past the freeze checkpoint.

## Live verification

Per the brief: a new integration test,
`src/__tests__/CriteriaCalibrationFreezeCheckpoint.test.tsx`, that does NOT mock `nextAction` or
`computeScoreSpreadAccuracy` (unlike the other checkpoint test file) — the real driver,
real solver, and real checkpoint derivation all run against a genuinely-replayed 78-round answer
log for the `#2 single-dominant` oracle (same ground truth as the diagnostic scripts, generated
once at module load by calling the real `nextAction`/`CalibrationSession` in a loop, throwing
loudly if the driver ever reports degree 2 exhausted within those 78 rounds — which would mean
Step 1's finding no longer holds).

Five tests, all passing:

1. **Exact boundary, negative case**: 77 answers (the log's own first 77 entries, not a
   separately-generated sequence, so the ONLY difference from the positive case is one fewer
   answer) shows a real question, not the freeze checkpoint.
2. **Exact boundary, positive case**: all 78 answers shows the freeze checkpoint, with the
   Unfocused badge.
3. **Weights don't reset**: `computeScoreSpreadAccuracy` runs for real in this file, so the
   displayed percentage is the actual solver output against the actual 78-answer log. Clicking
   "Continue" is asserted to leave that percentage byte-identical — a direct behavioral proof,
   not an inference from reading the source, that nothing about the answer log changed.
4. **Label doesn't promote**: after continuing past the freeze checkpoint into a real degree-3
   question, the Blurry badge never appears anywhere on screen.
5. **Pause navigates**: "Pause here" from the frozen screen navigates to the `?from=`
   destination, same as every other checkpoint.

```bash
npx vitest run src/__tests__/CriteriaCalibrationFreezeCheckpoint.test.tsx
```

No separate live-browser screenshot pass was done for this step (unlike the copy-rewrite
branch's Tip 1/Tip 2 visual check) — the copy and badge visuals were already confirmed there;
this step's own verification need was behavioral (does the trigger fire at exactly the right
answer, do weights survive, does the label stay honest), which the RTL test above proves more
rigorously than a screenshot could.

## Test suite and type check

`npx vitest run`: 333/333 passing (328 pre-existing + 5 new).
`npx tsc -p tsconfig.app.json --noEmit`: 491 pre-existing, unrelated errors, unchanged; zero
errors in any file this branch touches.

## What's still not in scope

- `MAX_VALUE_RANGE_FOR_COVERAGE`, `isDegreeCoverageComplete`, or any other solver/coverage-gate
  logic.
- The album-rating results page or the accuracy-vs-ranking-quality split — separate, undesigned
  ideas tracked in `deferred-work.md` section C.
- Full visual styling of the checkpoint screens — same not-yet-styled status as the other four.
- Generalizing freeze detection to any degree other than 2 — no evidence exists for that yet.
