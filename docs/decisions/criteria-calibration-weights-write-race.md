# Criteria Calibration — weights/status write-race (diagnosed, NOT fixed)

Diagnosed 2026-08-12, during the same session as the Dantzig-fix and ranking-stability-test
follow-ups. Read-only diagnosis against Dan's own live Supabase data
(`user_calibration_status`, account `eec42cd4-e714-46a2-ad9c-35714a1d3a2c`) plus a
commit-by-commit replay of the local ranking-stability diagnostic log (see
`criteria-calibration-ranking-stability-analysis.md`). No production code touched by this
diagnosis itself.

## The bug

`upsertWeightsAndStatus` (`persistence.ts`) is called, un-awaited, from
`applyCommitComputation` (`CriteriaCalibrationPage.tsx`) on every commit (answer, undo, redo).
Nothing in the request path serializes these calls or gives Supabase a way to reject an
out-of-order write:

- `weightsGenRef` (`CriteriaCalibrationPage.tsx`) is bumped once per call and checked in each
  call's `.then()`/`.catch()` — but only to decide whether to show/clear the shared
  `persistFailingRef` toast. It never gates the write itself.
- The Supabase call is `supabase.from('user_calibration_status').upsert({ user_id, tier,
  accuracy_value }, { onConflict: 'user_id' })` — an unconditional upsert. Whichever HTTP
  request's response Postgres processes last wins, full stop; there is no version column, no
  `WHERE accuracy_value < excluded.accuracy_value` guard, nothing.

So if commit N's request is in flight, the user answers again immediately (commit N+1 fires
its own request), and commit N+1's request happens to resolve at the database *before* commit
N's — commit N's now-stale `accuracy_value` overwrites commit N+1's correct one. Once that
happens, nothing self-corrects it: the row simply sits at the stale value until some future
commit's write happens to land last by luck.

`criteria-calibration-wiring.md`'s original design note framed this as "residual staleness
that's self-correcting on the next answer" — that assumption is wrong. A future commit's write
landing later doesn't retroactively fix a past inversion; it just means the *next* race, if
one happens, starts from whatever value is currently in the row. There is no mechanism that
notices or repairs a stale value once it's persisted.

## Evidence

The persisted `user_calibration_status.accuracy_value` for Dan's account was found (read-only
query) to be **92.04%**. Cross-referencing against the ranking-stability diagnostic log
(`docs/decisions/backups/ranking-stability-log-2026-08-12.jsonl`, which independently records
`computeCommitState`'s accuracy at every 3rd real commit using the exact same shared
computation `upsertWeightsAndStatus` was given) shows `92.04%` (`0.920422402480692`) matches
the snapshot logged at **answerCount = 69** — not the session's actual final answer count
(71, per the completed ranking-stability test session). The DB write was observed to land
roughly 3 seconds after the session's final (71st) answer — long after the n=71 commit's
`upsertWeightsAndStatus` call would have fired — which rules out "this is just an old value
nobody overwrote since" (there was no long gap; the write happened right at the end, and it
happened *after* the correct one).

Replaying every valid log prefix (n=1 through n=71) through `computeCommitState` confirms no
consistent, correctly-ordered execution of the session produces 92.04% as the *final*
persisted value from a 71-answer log — it's a genuine mid-session snapshot (n=69) whose write
resolved after the true final (n=71) write, exactly the ordering inversion described above.

## What was NOT fixed

This diagnosis identifies and evidences the bug; no code change was made. Two fix shapes were
considered, not yet implemented or chosen between:

1. **Extend `weightsGenRef` to gate the write itself**, not just the notification — e.g. only
   call `upsertWeightsAndStatus` after cancelling/ignoring any prior in-flight call's result,
   or check the generation again immediately before issuing the write. Cheapest change, but
   doesn't fully close the window (a request already sent to Supabase can't be un-sent; this
   only prevents *starting* a stale write once a newer commit has already begun, not a
   last-instant race between two near-simultaneous commits).
2. **Serialized write queue / `AbortController`** — queue `upsertWeightsAndStatus` calls and
   only ever have one in flight (aborting/superseding an outdated in-flight request when a new
   commit arrives), or attach an `AbortController` per call and abort the previous one before
   issuing the next. Closes the race properly but is more invasive — touches the write path's
   error handling and the `persistFailingRef` failure-toast logic, which currently assumes
   every issued call eventually resolves or rejects.

Neither is implemented. Tracked as an open follow-up in `deferred-work.md`.

## Related

- `criteria-calibration-wiring.md` — Part 5b, "Weights/status recompute: cheap staleness
  guard" — the original (incorrect) self-correcting assumption this doc supersedes.
- `criteria-calibration-reload-glitch-and-sluggishness-fix.md` — introduced
  `applyCommitComputation` as the shared per-commit computation entry point; did not change
  the write-race behavior, only collapsed redundant LP solves.
- `criteria-calibration-ranking-stability-analysis.md` — the diagnostic log used as
  cross-reference evidence here.
