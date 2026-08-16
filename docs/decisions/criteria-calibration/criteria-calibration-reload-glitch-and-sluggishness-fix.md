# Criteria Calibration: redundant accuracy recompute + unawaited insert fix

**IMPLEMENTED 2026-08-11 (urgent pass).** Fixes the two mechanisms identified in the prior
read-only diagnostic session (sluggishness at round ~56, transient reload accuracy glitch),
which had degraded further into the UI blocking outright by round ~59.

## Root causes (as diagnosed, confirmed by this pass's measurements)

1. **Triple redundant accuracy computation per commit.** `computeScoreSpreadAccuracy` +
   `solveValues` were each invoked independently from three call sites: the progress-ring's
   own debounced effect (`CriteriaCalibrationPage.tsx`), `upsertWeightsAndStatus`
   (`persistence.ts`), and — on every 3rd commit — the ranking-stability logging hook
   (`rankingStabilityLog.ts`). Cost scales with answer count (more constraints per LP solve),
   so this was mild early on and severe by round ~50+.
2. **Unawaited answer insert.** `persistNewAnswer` fires the Supabase insert without being
   awaited before the next interaction is allowed. A refresh landing while the insert's
   `fetch` is still in flight aborts it silently (no `keepalive` flag anywhere in
   `persistence.ts`) — the answer never reaches `user_calibration_answers`. The next reload
   deterministically recomputes accuracy from one fewer answer, which can legitimately be far
   lower and stays that way until a new commit supplies equivalent information.

## Measured severity (read-only, synthetic 6-criterion/5-level fixture matching Dan's
production shape — no live data touched)

`computeScoreSpreadAccuracy` alone, single call:

| answers | time    |
|---------|---------|
| 10      | ~50ms   |
| 20      | ~187ms  |
| 30      | ~436ms  |
| 40      | ~844ms  |
| 50      | ~1.35s  |
| 59      | ~2.2s   |

This is dramatically worse than the "16-120ms" figure in `scoreSpreadAccuracy.ts`'s own
header comment (measured 2026-08-09, evidently at a much lower answer count) — the LP solve
cost grows superlinearly with constraint count, not the mild linear growth that comment
implies. At round 59, one call is ~2.2-2.35s; the pre-fix code was making 2-3 of these calls
per commit, i.e. **5-8 seconds of main-thread blocking per commit** — fully consistent with
"actively blocking the UI."

## What changed

- **New `commitComputation.ts`**: `computeCommitState(catalog, answers)` runs `solveValues` +
  `computeScoreSpreadAccuracy` exactly once and returns `{ solved, accuracy, mediumReached }`.
- **`persistence.ts`**: `upsertWeightsAndStatus` now takes a precomputed `CommitComputation`
  instead of recomputing it.
- **`rankingStabilityLog.ts`**: `maybeLogSnapshot`/`logSnapshot` now take the same precomputed
  `CommitComputation` instead of recomputing it. Kept enabled (`RANKING_STABILITY_LOGGING_ENABLED`
  unchanged) — its own marginal cost is now just cheap 13-album scoring + one `fetch` every
  3rd commit, since the expensive LP work it used to duplicate is gone.
- **`CriteriaCalibrationPage.tsx`**: `commitAdvance`/`handleUndo`/`handleRedo` now call one
  shared `applyCommitComputation`, which computes once and drives the progress ring, the
  persistence upsert, and (commit/redo only) the logging hook. The old 400ms-debounced ring
  effect is gone, replaced by a one-time effect that computes the initial value once both the
  catalog and the resumed answer log are ready (covers page load without depending on which
  of the two async fetches wins the race).
- **New `usePendingWritesGuard.ts` hook**: tracks in-flight writes (answer insert/delete,
  weights/status upsert) and installs a `beforeunload` listener that warns the user (native
  browser "leave site?" prompt) while any write is pending. `CriteriaCalibrationPage.tsx`
  shows a "Saving…" text under the progress header whenever a write is in flight, paired with
  the same guard.
- Chose the **beforeunload guard over awaiting the insert** before allowing the next
  interaction: awaiting only narrows the race window (a hard refresh isn't blocked by an
  in-flight promise regardless) while adding a network round-trip's latency to every single
  click. The guard makes the risk visible and gives the browser's native prompt a chance to
  let the write finish, at no cost on the happy path. This was a product/UX call made
  unilaterally given the urgency, not run past Dan first — flagged here in case he'd prefer
  the await tradeoff instead.

## Result

- Redundant-recompute fix alone: ~54% reduction in per-commit LP main-thread time at n=59
  (measured ~6.2s average before → ~2.9s after, synthetic fixture).
- Data-loss risk: closed via visible-warning mechanism (not a hard guarantee — see below).
- `tsc --noEmit` clean, full suite 242/242 passing (5 new regression tests for the
  beforeunload guard in `src/__tests__/usePendingWritesGuard.test.ts`).
- Dan's live ~59-answer session: untouched. Only read-only Supabase access (anon key) was
  used, and only for the criteria-catalog shape (public reference data) — no query touched
  `user_calibration_answers` or any other per-user table.

## NOT fixed by this pass — flagged as urgent follow-up

The redundancy fix cuts blocking roughly in half, but a **single** `computeCommitState` call
is still ~2.9s at round 59 and keeps growing superlinearly with answer count — this pass was
explicitly scoped to call-site redundancy and write-timing, not `solver.ts`/`scoreSpreadAccuracy.ts`'s
actual LP algorithm, so the underlying scaling issue is untouched. **Dan should expect
continued, worsening sluggishness even after this fix**, not full responsiveness — this is
not a "problem solved" report, it's a "meaningfully mitigated, real issue remains" report.
Recommend a dedicated follow-up brief covering: why the simplex solve appears to scale worse
than linearly with constraint count (no warm-starting between the ~210 per-call LP solves is
one candidate), and/or moving the computation off the main thread (Web Worker) so a slow
solve degrades to a delayed number rather than a frozen UI.

The `beforeunload` guard reduces but does not eliminate the data-loss window: it only fires
if the browser actually presents (and the user heeds) the native confirmation — a forced
close, crash, or a user who dismisses the prompt can still lose an in-flight answer. Full
elimination would need either the `keepalive` fetch flag (not wired here — would need a
custom fetch passed through the Supabase client, non-trivial plumbing, deferred) or awaiting
the insert (rejected above for latency reasons).
