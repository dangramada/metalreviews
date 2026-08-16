# Criteria Calibration — solver-crash safety net

**Date:** 2026-08-16. **Branch:** `criteria-calibration-solver-crash-safety-net`.
**Status: shipped on the branch, `tsc` clean, 307/307 tests passing.**

Acts on `criteria-calibration-near-singular-pivot-impact.md`'s hotfix recommendation. **This is
the safety net, not the numerical fix** — the `EPS = 1e-9` ratio-test root cause
(`deferred-work.md` item 3) is untouched and remains scheduled work. Nothing in `solver.ts` or
`simplex.ts` changed.

## The bug being contained

The LP solver throws on a numerical breakdown (`computeChebyshevCenter`, `solver.ts:291`)
rather than degrading to a wrong point estimate. That is correct and stays. What was wrong was
everything downstream of the throw:

1. `commitAdvance` ran `setAnswers` → `persistNewAnswer` → `computeCommitState`. The solve was
   **last**, so by the time it threw, the answer was in React state and already inserted into
   Supabase.
2. The throw escaped a `setTimeout`, so React never saw it — but the `setAnswers` scheduled in
   step 1 still flushed, and the re-render hit the `action` memo → `nextAction` → `solveValues`
   → **threw during render**.
3. No `ErrorBoundary` and no route `errorElement` existed anywhere in the app, so React
   unmounted the whole root: blank page.
4. Reload replayed the persisted log and threw at mount. Permanently bricked, recoverable only
   by deleting the row from Supabase by hand.

## What shipped

### 1. Compute-first ordering (`CriteriaCalibrationPage.tsx`)

`trySolve` is the single place a solver throw is absorbed on the mutating paths. All three
handlers — `commitAdvance`, `handleUndo`, `handleRedo` — now solve **before** touching React
state or Supabase:

```
before:  setAnswers → persistNewAnswer → computeCommitState (throws)
after:   computeCommitState (throws → return null) → setAnswers → persistNewAnswer
```

`computeCommitState` is pure — `(catalog, nextAnswers, {previous: persistedWindow, ratingsByAlbum})`
are all readable before any mutation — so this reordering is free. A `null` return means the
step never happened: nothing to roll back, and no persisted answer left without matching
weights/status.

**This was chosen over the persist-then-delete auto-undo originally briefed**, and the reason is
worth keeping: persist-then-delete makes recovery depend on a *second network call succeeding*.
If that `deleteAnswer` fails — offline, precisely when things are already going wrong — memory
is reverted but the row survives, and the next reload is the bricked-session case again.
Compute-first has no such failure mode. Accepted cost: the insert no longer runs in parallel
with the solve, so it's delayed by solve duration (~1–3s at n=70); closing the tab inside that
window loses one answer. Judged clearly better than a rollback that can fail.

Undo gets the same treatment for a different reason: an undo whose target state the solver
can't handle is now **refused outright** rather than half-applied (state popped and the DB row
deleted, then the solve throws).

### 2. Guarded `action` memo + auto-recovery

`nextAction` runs its own `solveValues`, so it throws during render on exactly the same logs.
The memo now catches and returns `{ action: null, failed: true }`; the page renders a
"Recovering your session…" state instead of unmounting.

A recovery effect then does the real auto-undo — the one place a Supabase delete genuinely is
required, since the row is already committed. It trims the trailing answer, deletes its row,
reverts the stability window via the same `popWindowHistory` path as `handleUndo`, and re-syncs
the persisted weights/status against the trimmed log. If it still fails, it trims again, up to
`RECOVERY_TRIM_LIMIT = 5`, then stops and says so rather than continuing to eat real answers.
The user is told once per session, not once per trim.

Compute-first means a live commit can no longer produce a bad persisted log, so in practice this
path exists for sessions bricked before this shipped — and as the general backstop for "the log
in the DB doesn't solve."

The initial-accuracy effect is wrapped too, and deliberately does **not** set
`initialAccuracyComputedRef` on failure, so it re-runs against the trimmed log.

### 3. Visible, honest messaging

Three messages, no silent reverts:

- commit/redo failure: *"That comparison caused a calculation issue, so your answer wasn't
  saved. Try a different answer, or undo a previous one."*
- undo failure: *"Couldn't undo that — the calculation failed on the earlier state, so your
  progress is unchanged."*
- auto-recovery: *"We hit a calculation issue with your saved session and had to remove your
  most recent answer to recover it."*

Every catch also `console.error`s the LP diagnostics — a blank page with a silent console is
what made this hard to characterise after the fact.

### 4. Route-level `ErrorBoundary` (`src/components/ErrorBoundary.tsx`)

Backstop only, wrapping `/criteria-calibration` in `main.tsx`. The page handles its own solver
failures in place; anything reaching the boundary is by definition unanticipated, so the only
honest offer is a reload. Kept generic (no calibration-specific copy) so other routes can reuse
it. Class component because `componentDidCatch`/`getDerivedStateFromError` have no hook
equivalent.

## Where the catches are NOT

Nothing was caught inside `solver.ts` or `simplex.ts`. A silent catch at the solver layer is
exactly how the pre-2026-08-12 Big-M bug reported `feasible: true` on ~1e14 outputs, and how the
pre-Dantzig Chebyshev failure persisted 30 all-zero weight rows. The throw is the correct
behaviour; only its handling changed.

## Tests

- `solverCrashFixture.test.ts` — pins the fixture's two load-bearing properties: it still throws
  at n=44 (matching the *Chebyshev* message specifically, not just "throws"), and solves at
  n=43. **This is deliberately a canary**: when the `EPS = 1e-9` fix lands, this log will likely
  stop breaking down, and without this test every safety-net test below would keep passing while
  exercising nothing.
- `CriteriaCalibrationPage.solverCrash.test.tsx` — three tests against the real page: a
  breaking comparison leaves the page mounted and writes nothing (`insertAnswer`,
  `upsertWeightsAndStatus`, `deleteAnswer` all uncalled, round counter unchanged, message
  shown); a resumed bad log auto-recovers (row deleted, question rendered, weights re-synced);
  and a normal undo is unaffected.

All three were **verified to fail** with the catches temporarily replaced by a rethrow — they
are not vacuous.

- Fixture: `SOLVER_CRASH_ANSWERS` / `SOLVER_CRASH_DEGREE` /
  `SOLVER_CRASH_LEVELS_PER_CRITERION` in `fixtures.ts`. Synthetic, not real user data —
  generated by driving oracle #8 through the real `nextAction`/`CalibrationSession` loop, so it
  is an answer log the production driver itself produced.

## Live verification (2026-08-16)

Confirmed in a real browser against real Supabase, on a throwaway account
(`usertest@gmail.com`), after the jsdom-only gap flagged below was raised. Dan signed in
manually; the fixture was seeded straight into `user_calibration_answers` via the service-key
client (`scripts/seed-solver-crash-session.ts`, guarded against Dan's own user id and against
non-empty accounts), never through the UI.

**Ran three times, identical each time.** Before: 44 rows, no status row, no weights. After:
**43 rows, and the specific trailing row id gone** each time (`980128b3…`, `6085f1eb…`,
`cb782ff8…`), the first row untouched, `user_calibration_status` re-synced to
`answer_count: 43`, and 30 `user_criterion_weights` rows written. The page rendered a real
degree-3 question at Round 44, 94%, Accuracy: Medium — not a blank page.

Console showed the guards firing exactly as designed: `Calibration solver failed while
choosing the next question` (×2, StrictMode double-render — the `action` memo catch),
`Calibration solver failed on the resumed answer log` (the initial-accuracy effect catch),
both with the Chebyshev diagnostic attached.

**One real defect this caught that jsdom did not.** Calling `showError` synchronously inside
the recovery effect produced `Warning: flushSync was called from inside a lifecycle method` —
the toaster commits with `flushSync`, which React cannot do mid-render. Fixed by deferring the
toast through the component's existing `after(0, …)` helper (so an unmount mid-recovery
cancels it like every other deferred callback here). Two further live runs after the fix
produced zero occurrences. This is the specific reason the live check was worth doing.

**Incidental, and it closes an open question from the impact assessment:** Dan's real account
currently holds a **71-answer** log — the session the assessment could only reason about
indirectly, since it was never committed as a fixture. Every prefix `n=1…71` was re-solved
read-only against the current solver: **all 71 solve cleanly, no failures.** So the `n=54`/`n=57`
breakdowns recorded in `criteria-calibration-ranking-stability-analysis.md` do *not* reproduce
on this log post-Dantzig-fix. That is reassuring but not a general clearance — the 4/10 oracle
crash rate stands, and this is one log.

## Known residuals

- **A question all of whose answers break the solver is a dead end.** `nextAction` is
  deterministic, so it re-offers the same pair after a failure. If all three responses fail, the
  user can't advance — but the page renders and Undo / "Stop here" both work, so it's a dead
  end, not a brick. A skip-question affordance is a product decision, not part of this hotfix.
- ~~**Verified in jsdom only**~~ — **closed 2026-08-16**, see "Live verification" above.
- **The root cause is untouched.** Sessions will still hit the breakdown; they now degrade
  legibly instead of blanking.
