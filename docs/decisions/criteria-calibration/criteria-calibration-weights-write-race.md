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
(`docs/backups/ranking-stability-log-2026-08-12.jsonl`, which independently records
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

## 2026-08-15 correction — the specific 92.04%/n=69 incident is not confirmed as an observed race

Re-verification this date, live-querying Dan's account directly and recomputing
`computeScoreSpreadAccuracy` fresh over the current answer log, found:

- The account currently holds **70** answers, not 71. `user_calibration_status.updated_at`
  is `2026-08-12T17:32:07Z` and has not changed since — no write, and no answer insert/
  delete, has touched this account since the original diagnosis session ended.
- A fresh recomputation over the live 70-answer log produces `0.920422402480693` — an
  **exact match** (diff = 0) to the stored `accuracy_value`. The full n=1→70 trajectory
  never exceeds ~0.9204 anywhere; there is no execution path through this data that
  produces anything near the 0.99999 figure logged in `deferred-work.md` on 2026-08-15 as a
  same-day, unexplained discrepancy against this same doc's evidence.
- The three ranking-stability-log files (`answerCount` 3 through 69, every 3rd real commit,
  spanning 2026-08-10 through 2026-08-12) are strictly monotonically non-decreasing
  throughout, with zero evidence of an Undo at any logged checkpoint.
- The original "71 answers total" figure (repeated in
  `criteria-calibration-ranking-stability-analysis.md`) cannot be independently verified
  against the log: the log only records every 3rd commit, and n=69 is the last multiple of
  3 below both 70 and 71, so the log reads identically either way. There is also no
  delete-audit trail in this schema (`user_calibration_answers` is a hard-delete table, no
  soft-delete/tombstone) — so whether a genuine mid-session Undo took the count from 71 down
  to 70 before the final write, versus "71" simply being a miscount, cannot be forensically
  distinguished after the fact. Definitively ruled out: any deletion happening *after* the
  original diagnosis session closed (`updated_at` unchanged since).

Net effect: this account currently shows no live evidence of a persisted write-race
outcome — the stored value is exactly what a fresh, correct final-state computation
produces over the data that exists today. **The specific 92.04%/n=69 incident used as
motivating evidence for this doc should not be treated as a confirmed observed race** —
retracting that specific claim.

This does **not** change the underlying structural finding: `upsert_calibration_status`'s
conflict clause still unconditionally overwrites `accuracy_value`/`tier`/
`last_eligible_top10`/`last_change_answer_index` with `excluded.*` on every write, with no
ordering guard beyond `fired`'s existing OR-guard. That gap is real and independent of
whether it has visibly bitten this account — it remains the justification for the
`criteria-calibration-weights-write-race-fix` branch (adds an `answer_count`-gated guard on
`accuracy_value`/`tier`; see `user_calibration_status-add-answer-count-guard.sql`).

## Fix implemented (2026-08-15, branch `criteria-calibration-weights-write-race-fix`)

Chose option (a) from the original three candidates: a DB-level monotonic guard, extending
`upsert_calibration_status` rather than touching the client. Rejected (b) (gate the write
*start* via `weightsGenRef`) because it provably can't close a last-instant race between two
already-in-flight requests. Rejected (c) (serialized write queue / `AbortController`)
because it touches `persistFailingRef`'s resolve/reject assumption for no extra benefit over
(a), which was explicitly out of scope.

**Schema**: `supabase/user_calibration_status-add-answer-count-guard.sql` adds a `NOT NULL
DEFAULT 0` `answer_count` column (the `answers.length` a write was computed against;
confirmed live that a direct `NULL` insert is rejected by the constraint, so the guard's
`excluded.answer_count >= current` comparison can never silently short-circuit on a `NULL`)
and rewrites `upsert_calibration_status`'s conflict clause so `accuracy_value`/`tier`/
`answer_count` are only adopted from an incoming write when
`excluded.answer_count >= user_calibration_status.answer_count` — **`>=`, not `>`**: the
correct reason (corrected from an earlier draft of this note — see below) is that
`accuracy_value`/`tier` are pure functions of the answer-list content, so two writes tied at
the same `answer_count` compute identical values whenever they're Undo+Redo-of-the-same-
answer, but answer_count can also tie via *different* answer-list states (Undo, then a
*different* real answer) — a strict `>` would freeze the field at whichever write happens to
land first at a given count, forever rejecting every subsequent write at that same count even
if it's the one that actually reflects the current DB state. `>=` avoids that freeze by
reproducing today's pre-fix "last write wins" behavior on ties specifically, which is not a
regression. `fired`'s existing OR-guard is unchanged. Migration is idempotent (`add column if
not exists`, `create or replace function`, an extra `drop function if exists` covering both
the old and new signatures) — needed in practice, since the first apply attempt hit a stale
partial-application state from an earlier try and had to be re-run.

`last_eligible_top10`/`last_change_answer_index`/the `previous_*` triple stay on plain
`excluded.*` overwrites, completely unaffected by this migration's guard either way (this was
scoped correctly from the start; an earlier draft of this note incorrectly attributed the
`>=` choice to a scenario involving these fields, which the `>=`/`>` decision can't actually
affect since they're never gated at all). **Re-verified 2026-08-15, following a direct
challenge to this scoping**: the prior two migrations' "staleness here only delays firing,
never falsely un-fires" argument for leaving these two fields unguarded does **not** cleanly
extend to a specific mechanism found this session. `computeStabilityWindowUpdate`'s
ratings-null skip (`commitComputation.ts`) means a write computed *before* the
`RANKING_TEST_SET` ratings fetch resolves carries the client's prior (pre-advance) window
state; if that write's HTTP response resolves at the DB *after* a later write (e.g. the same
commit reached again via Undo+Redo, this time with ratings already resolved) already advanced
`last_eligible_top10`/`last_change_answer_index` forward, the stale write silently
overwrites them backward — reproduced directly against the live RPC in
`scripts/verify-write-race-guard.ts`'s check #4: `last_change_answer_index` regressed from
`11` to `4` via exactly this tied-answer_count mechanism. A regressed (smaller)
`last_change_answer_index` makes a later resumed session compute a *larger* apparent
stability span than the true trajectory warrants, which could fire the auto-escalation
signal *earlier* than it should — not merely later, the property the original argument
actually established. This is a real, pre-existing gap (these fields were always unguarded;
this migration doesn't introduce or worsen it), left unfixed here since it's out of scope for
the accuracy_value/tier bug this migration targets. Tracked as its own, newly-distinct item
in `deferred-work.md` — no longer covered by the "safe direction" characterization the prior
migrations used for the window fields as a group.

**App code**: `commitComputation.ts`'s `CommitComputation` now carries `answerCount:
answers.length`, computed once alongside `solved`/`accuracy` inside `computeCommitState` (no
new plumbing needed at the three call sites — `commitAdvance`/`handleUndo`/`handleRedo` all
already had `nextAnswers` in scope, but reading it off the shared computation result keeps
`applyCommitComputation`'s signature unchanged). `persistence.ts`'s `upsertWeightsAndStatus`
passes it through as the new `p_answer_count` RPC argument. `weightsGenRef`'s toast-gating
logic was not touched, per the brief.

**Verification**: `scripts/verify-write-race-guard.ts` (kept in the repo, not a throwaway —
not run by `npm run test` since it exercises real Postgres conflict-clause semantics a mocked
`supabase.rpc()` can't validate; run manually against the disposable QA test account, which
the script confirms has no pre-existing row before running and deletes again at the end):
1. Out-of-order `answer_count` (newer write `answer_count=10`/0.92/`high`, then a stale write
   `answer_count=9`/0.70/`medium`) — stale write correctly rejected in full.
2. A genuinely newer `answer_count=11` write afterward — applies correctly.
3. A tied `answer_count=11` write with a different `accuracy_value` — applies correctly
   (confirms `>=`, not silently dropped by a stricter `>`).
4. A tied `answer_count=11` write with a different `last_eligible_top10`/
   `last_change_answer_index` — this is the check added after the scoping review above:
   confirms (rather than assumes) that these two fields are unconditionally last-write-wins,
   and directly reproduces the `last_change_answer_index` regression (`11` → `4`) described
   above as a real, open gap.

Also re-ran the Step 0 cross-check on Dan's live account post-migration: `answer_count`
backfilled to `70` (matching the live answer table exactly), `accuracy_value` unchanged at
`0.920422402480693`, and a fresh `computeScoreSpreadAccuracy` recompute over the live
70-answer log still matches it exactly (diff = 0) — the fix didn't disturb the already-correct
stored state. Also confirmed directly that `answer_count` can never be `NULL` — a deliberate
raw insert with `answer_count: null` against the DB was rejected by the `NOT NULL` constraint.

`tsc --noEmit` clean. Full suite 288/288 (286 pre-existing + 2 new: `commitComputation.ts`
answerCount coverage in `commitComputation.test.ts`; the `persistence.test.ts` RPC-args
assertion was tightened to explicitly assert `p_answer_count`, since the pre-fix mock fixture
didn't set `answerCount` and the exact-match assertion was passing only because
`toHaveBeenCalledWith` treats an explicit `undefined` value as equal to an absent key — not
real coverage of the new field).
