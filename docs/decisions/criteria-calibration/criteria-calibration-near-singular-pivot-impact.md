# Criteria Calibration — `nearSingularPivot`: real user-facing impact assessment

**Date:** 2026-08-16. **Status: read-only diagnostic. No production files changed, no fixes
applied.** Follow-up to `criteria-calibration-synthetic-oracles.md`, which found 4/10 synthetic
oracles crashing the production LP solver at n=44–87. That pass established the crash exists;
this one establishes **what it does to a real user, and whether it needs a hotfix**.

**Recommendation: hotfix before any further real calibration sessions run.** Reasoning in the
last section; the short version is that the failure is not a degraded number or a one-off error
toast — it blanks the page, the triggering answer is already in Supabase when it happens, and
the session cannot be recovered from inside the app afterwards.

## Step 1 — What actually happens today, traced end to end

### 1a. Where the guard is, and what it does

There is no "pivot-magnitude guard" that acts on `nearSingularPivot`. The flag is
**diagnostic-only** — set in `simplex.ts:453` (`minPivotMagnitude < NEAR_SINGULAR_PIVOT_THRESHOLD`,
`1e-7`) and read nowhere except `describeLPFailure`'s error text (`solver.ts:59`). Nothing
branches on it.

What actually fails is a **separate, unconditional post-solve feasibility check** inside
`solveLP` (added by the 2026-08-12 Dantzig fix), which re-verifies the returned point against
the original constraints and reports `feasible: false, reason: 'post-solve-infeasible'` when it
doesn't hold. `nearSingularPivot` is then just the explanation attached to the failure, not its
trigger. Two call sites turn that into a thrown error:

- `solver.ts:222` — phase-1 LP infeasible → throw.
- `solver.ts:291` — **Chebyshev-center solve failed → throw** (`computeChebyshevCenter`).
  Deliberate: pre-2026-08-12 this degraded to an all-zero point estimate and *persisted* it
  (30 all-zero rows in `user_criterion_weights`, see `deferred-work.md` item 2). Throwing was
  the correct call and is not what should be reverted here.

Every observed crash — all 4 oracles, and the one reproduced below — is the **Chebyshev**
throw, not the phase-1 one. `phase1-iteration-cap` appears in the synthetic-oracles table as the
`reason`, but the throw itself still comes from the Chebyshev site.

There is no fallback, no degraded result, no retry. The solve throws.

### 1b. Does `computeCommitState` propagate it?

Yes, unmodified and uncaught. `computeCommitState` (`commitComputation.ts:79`) calls
`solveValues` first thing, with no `try`/`catch` anywhere between it and the page. Worth noting
which half fails: `solveValues` throws, but `computeScoreSpreadAccuracy` on the **same** answer
log returns a perfectly plausible `0.9413` — it has its own per-pair `if (!feasible) return 2`
fallback (`scoreSpreadAccuracy.ts:136`) and never observes the breakdown. That's the same
accuracy/point-estimate split already documented at `n=54` in
`criteria-calibration-ranking-stability-analysis.md`, still present.

### 1c. What the user sees

**A blank page, and no error boundary catches it.** There is no `ErrorBoundary` component and
no route `errorElement` anywhere in the app (`main.tsx:20`'s `createBrowserRouter` array has
neither), so an uncaught render error unmounts the entire React root.

The path on a live commit (`commitAdvance`, `CriteriaCalibrationPage.tsx:376`) is:

1. `setAnswers(nextAnswers)` — scheduled.
2. `persistNewAnswer(entry)` — **the answer insert is already in flight.**
3. `computeCommitState(...)` — throws. Because `commitAdvance` runs inside a `setTimeout`
   callback (`after()`, `CriteriaCalibrationPage.tsx:206`), the throw escapes as an uncaught
   window error rather than reaching React.
4. React still flushes the update scheduled in step 1. The re-render hits the
   `action` memo (`CriteriaCalibrationPage.tsx:234`), which calls `nextAction` →
   `solveValues` (`elicitationDriver.ts:468`) → **throws again, this time during render** →
   root unmounts.

`applyCommitComputation` — the only thing that writes weights/status — sits after the throw in
step 3 and never runs.

### 1d. Supabase

**No corrupted or partial state reaches Supabase.** Confirmed by mock-call counts in the
app-level repro below: `insertAnswer` = 1, `upsertWeightsAndStatus` = 0.

- The **answer row is written** (step 2 precedes the throw). It is a valid row, not corrupt —
  but it is what makes the failure sticky (see 2b).
- **Weights, status, and the stability window are not written at all** — they stay at the n−1
  values. Stale, internally consistent, not corrupt. The `answer_count` monotonic guard
  (`criteria-calibration-weights-write-race.md`) is unaffected.

So this is not a repeat of the pre-Dantzig silent-corruption class. It is strictly worse as a
UX failure and strictly better as a data-integrity one.

## Step 2 — Reproduced end to end through the real page

Oracle #8 (`noisy`, the earliest crasher, n=44) was re-driven through the real
`nextAction`/`CalibrationSession`/`computeCommitState` loop to capture its exact 44-answer log,
which was then fed to the **real `CriteriaCalibrationPage`** in jsdom (same mocking harness as
`CriteriaCalibrationPage.test.tsx` — real page, real solver, mocked hooks/persistence only).
Scratch scripts and the scratch test were deleted after the run; the numbers below are frozen
from it.

**Solver-layer path checks at the crashing log (n=44, degree 3):**

| call | result |
|---|---|
| `computeCommitState` | **throws** — `Chebyshev-center solve failed…post-solve-infeasible, maxViolation=3.108e-4, minPivotMagnitude=1.908e-9, totalPivots=818` |
| `solveValues` | **throws** (same) |
| `computeScoreSpreadAccuracy` | OK — returns `0.9413` |
| `nextAction` (the render-path memo) | **throws** (same) |
| resume-effect `computeCommitState` | **throws** (same) |
| same log minus the last answer (n=43) | **OK** — the state is recoverable in principle |

**App-level, scenario A — the user answers question 44:**

- page renders normally at n=43 ("Round 44", "94%", "Accuracy: Medium");
- click "About equal" → `insertAnswer` called **1×**, `upsertWeightsAndStatus` **0×**;
- the commit throws out of the fade timer;
- on the next flush, `container.innerHTML.length` goes to **0** — the entire page is gone.
  Blank white document, no error UI, no toast, nothing to click.

**App-level, scenario B — the user reloads:** mounting the page with the persisted 44-answer
log throws during mount; **nothing renders at all**. The reload does not clear it.

So the concrete end state is: **a permanently unusable `/criteria-calibration` route for that
user.** Undo would fix the underlying log — but the Undo button only exists on a page that no
longer renders. Recovery requires deleting the offending `user_calibration_answers` row out of
Supabase by hand.

## Step 3 — Real-world likelihood

### Is oracle #1's profile (n=44–87, zero slack) organically reachable?

Partly. The answer-count range is squarely inside reality — Dan's own sessions are 33/70/71
answers, and 70/71 sits inside 44–87. The *zero-slack* part is not: real humans produce some
inconsistency, and Dan's own sessions do. But zero slack is not the trigger — oracle #8
(`noiseRate = 0.12`, i.e. genuinely inconsistent) crashed **earliest**, at n=44. Slack level
doesn't separate the crashers from the survivors in this data; 4 of 10 crashed across both
clean and noisy profiles. What the oracle-#1 result actually removes is the *reassurance* that
consistency protects you — not evidence that inconsistency does.

### Have Dan's real sessions come close?

**Yes — his 71-answer session hit this exact breakdown twice, in production.**
`criteria-calibration-ranking-stability-analysis.md` records `n=54` and `n=57` as discarded
checkpoints, both root-caused as **failed Chebyshev-center solves**. At the time (pre-2026-08-12)
that degraded silently to an all-zero point estimate — all 13 albums tied at score 0 at `n=54`,
accuracy still reading a plausible 0.8439. That doc's own sanity-check says it plainly: *"A
repeat of the `n=54` pattern would throw today rather than silently persist."* Today's throw is
the blank page traced above.

Caveat, stated precisely: the 2026-08-12 Dantzig fix changed the entering-column rule and
therefore the whole pivot sequence, so it is **not** certain the same log breaks down at exactly
n=54/57 now. And it cannot be re-run — the 70/71-answer session's full answer log was never
committed (only the every-3rd-checkpoint `PASS4_RANKING_STABILITY_CHECKPOINTS` and the 33-answer
`REAL_PRODUCTION_SESSION_ANSWERS` exist in the repo). This is documentary evidence that Dan's
real data reached the failing regime, not a live reproduction of it.

### What the committed real fixtures do show

Every real answer log in the repo was scanned prefix-by-prefix (n=1…N), measuring
`minPivotMagnitude` on both the phase-1 tableau and the widened Chebyshev tableau (the one that
actually breaks down):

| fixture | worst phase-1 pivot | worst Chebyshev pivot | near-singular rounds | throws |
|---|---:|---:|---|---|
| real-production 33 answers (6×5) | 5.00e-1 | 8.73e-2 | none | none |
| degree-anomaly 31 answers (6×5) | 3.33e-1 | 3.98e-2 | none | none |
| n42-repro 42 answers (5×5) | 1.25e-1 | 2.84e-3 | none | none |

All are 4–7 orders of magnitude clear of the `1e-7` flag and the `1e-9` `EPS` floor. **Nothing
committed is anywhere near the edge.** That is genuinely reassuring for n≤42 — and it is also
the whole of the reassurance available, because the two sessions that actually reached n=70/71,
where the failures were observed, aren't in the repo to test.

## Step 4 — Recommendation: hotfix, before the next real session

Four things together, none of which is individually decisive:

1. **The failure mode is maximally bad for a user.** Not a wrong number, not an error toast — a
   blank page mid-session, with no in-app recovery and no error boundary to soften it. A reload,
   the one thing any user tries, reproduces it exactly.
2. **It is sticky by construction.** The answer is persisted before the solve runs, so the
   crashing state is the state that gets restored. This is an ordering accident, not a design
   choice, and it converts a transient numerical failure into a permanently bricked session.
3. **Real data has been in this regime.** The n=54/57 discards are the same solve failing on
   Dan's own 71-answer session. Not reproducible today, but not speculative either.
4. **Base rate is not small.** 4 of 10 independently-generated oracles, spanning clean and
   noisy profiles, at answer counts real sessions already reach.

Against deferring: the committed real fixtures are far from the threshold, the true fix (Harris
ratio test / periodic refactorization) is real work, and the *next* session will start from a
reset empty log (`criteria-calibration-second-session-reset.md`) and would need ~44+ answers to
get near the range at all. That is a real argument for scheduling the *proper* fix rather than
rushing it — but not for leaving the current behaviour in place while another 70-answer session
runs.

Given this project's specific history — a solver failure that silently reported `feasible: true`
on ~1e14 outputs, and a second that persisted 30 all-zero weight rows, both found only by going
looking — "we haven't seen it on committed data" is exactly the reasoning that missed those.
Err toward mitigating.

**What a hotfix brief should scope** (not implemented here, and deliberately not designed in
detail — that's the follow-up brief's job):

- **Don't** revert the Chebyshev throw. Silently degrading is the worse failure and was already
  fixed once.
- Catch the solver throw at the page boundary so a failed solve degrades to "we couldn't update
  your results — undo your last answer" instead of unmounting the root. An error boundary on the
  route is the blunt version; catching around the three `computeCommitState` call sites plus the
  `action` memo is the targeted one.
- Make the state recoverable: an offer to auto-undo the triggering answer (the n−1 log solves
  fine — verified above), and/or move `persistNewAnswer` to after a successful solve so the
  crashing answer is never persisted in the first place.
- The underlying `EPS = 1e-9` ratio-test fix (`deferred-work.md` item 3) stays a separate,
  scheduled piece of work. Mitigation first, cure second.

## What is NOT concluded here

No production code changed. No fix designed or implemented. The claim is about impact and
urgency only; the mechanism itself was already root-caused by
`criteria-calibration-dantzig-stress-test.md` and is unchanged by this pass.
