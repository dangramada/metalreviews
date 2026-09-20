# Restart leaves stale/contradictory score state — diagnostic

Read-only diagnostic. No production code or schema changed as a result of this pass. Requested
by Dan, 2026-09-20. Related: `criteria-calibration-restart-stale-state--understand-the-problem.md`
(Project Knowledge — original discovery artifact and full problem framing).

New files this pass: `scripts/diagnostics/restart-stale-state-2026-09-20.ts` (exercises the real
`upsert_calibration_status` RPC and the real `user_criterion_weights` upsert shape against the
disposable QA test account — `dgramada07@gmail.com`, `2c2e8851-2c5d-49f3-9aa2-6246b110ad3d`, same
account `verify-write-race-guard.ts` uses) and, for the mature-session addendum below,
`scripts/diagnostics/restart-mature-session-weights-2026-09-20.ts`. The account already held
leftover state from earlier manual testing (a `tier: 'none', answer_count: 1` status row plus a
full set of 30 weight rows) — both scripts capture that state up front and restore it exactly in
a `finally` block rather than assuming a leftover row is safe to discard. Confirmed restored
byte-for-byte after every run.

## Q1 — Is the weights write guarded the same way as the status write?

**No. Two separate Supabase calls, and only one of them is guarded.**
`upsertWeightsAndStatus` ([persistence.ts:187-218](../../../src/lib/criteria-calibration/persistence.ts:187)) makes:

1. A plain, unconditional `.upsert()` on `user_criterion_weights`, keyed on
   `(user_id, criterion_id, level)`:

   ```ts
   const { error: weightsError } = await supabase
     .from('user_criterion_weights')
     .upsert(weightRows, { onConflict: 'user_id,criterion_id,level' });
   ```

   No `answer_count` column exists on this table at all ([user_criterion_weights.sql](../../../supabase/user_criterion_weights.sql)),
   no transaction wraps it with the status write, and nothing about this call can be rejected
   for being stale — whichever write reaches Postgres last simply wins, unconditionally.

2. A separate call to the guarded `upsert_calibration_status` RPC:

   ```ts
   const { error: statusError } = await supabase.rpc('upsert_calibration_status', {
     p_user_id: userId,
     p_tier: tierToDb(tier),
     p_accuracy_value: accuracy,
     p_answer_count: computation.answerCount,
   });
   ```

The RPC itself ([user_calibration_status-drop-stability-window.sql](../../../supabase/user_calibration_status-drop-stability-window.sql),
the currently-live 4-parameter version) does **not** skip its write when the guard fails — it
always executes the `on conflict … do update`, but two of its three settable columns are
individually gated by a `CASE`:

```sql
on conflict (user_id) do update set
  tier = case when excluded.answer_count >= user_calibration_status.answer_count
               then excluded.tier else user_calibration_status.tier end,
  accuracy_value = case when excluded.answer_count >= user_calibration_status.answer_count
                         then excluded.accuracy_value else user_calibration_status.accuracy_value end,
  answer_count = greatest(user_calibration_status.answer_count, excluded.answer_count);
```

So a stale write (`p_answer_count` less than what's stored) still touches the row — it just
leaves `tier`/`accuracy_value` unchanged and takes `greatest()` for `answer_count` (a no-op in
that case, since the stored value is already larger). The guard is column-level, not
whole-function-level, and it exists only inside this one RPC — `user_criterion_weights` has no
equivalent, and no guard at all.

This is a stable structural fact of the schema and RPC signature, not something that needed a
live run to confirm — but Scenario 2/3 below exercise it live anyway, alongside the boundary
questions in Q3.

## Q2 — Does Restart leave `user_calibration_status.answer_count` untouched?

**Confirmed.** `deleteAllAnswers` ([persistence.ts:98-101](../../../src/lib/criteria-calibration/persistence.ts:98)) is the entirety of Restart's server-side effect:

```ts
export async function deleteAllAnswers(userId: string): Promise<void> {
  const { error } = await supabase.from('user_calibration_answers').delete().eq('user_id', userId);
  if (error) throw error;
}
```

One `delete` on `user_calibration_answers`. Nothing in `handleRestart`
([CriteriaCalibrationPage.tsx:983-1004](../../../src/CriteriaCalibrationPage.tsx:983)) touches
`user_calibration_status` or `user_criterion_weights` directly either — but `handleRestart` does
call `applyCommitComputation(computation)` for the freshly-emptied answer log *before* the
`deleteAllAnswers` call even fires, and `applyCommitComputation`
([CriteriaCalibrationPage.tsx:655-680](../../../src/CriteriaCalibrationPage.tsx:655)) always
calls `upsertWeightsAndStatus` when a user is signed in. That means Restart itself, on its very
first render, immediately:

- overwrites `user_criterion_weights` (unconditional) with whatever a zero-answer solve produces
  — a fully unconstrained default, not the old session's values, and not the new session's
  values either, yet;
- attempts a status write with `p_answer_count: 0`, which the guard rejects outright against any
  nonzero stored `answer_count` — so `tier`/`accuracy_value` don't move at all here.

Every answer the user then commits in the new session repeats this same pair of calls with an
incrementing `answerCount` (1, 2, 3, …) — `handleUndo`/`handleRedo` included, since both route
through the same `applyCommitComputation`
([CriteriaCalibrationPage.tsx:761-826](../../../src/CriteriaCalibrationPage.tsx:761)). Each of
those unconditionally overwrites weights to the new session's tiny-sample solve, while the
status write keeps losing the guard race until the new session's count reaches the old stored
`answer_count`. This is the exact mechanism the discovery artifact hypothesized, confirmed
directly against the current code.

## Q3 — Synthetic scenarios

Run live against the disposable QA account via
`scripts/diagnostics/restart-stale-state-2026-09-20.ts`
(`npx tsx scripts/diagnostics/restart-stale-state-2026-09-20.ts`). All 8 checks passed:

```
Scenario 1 — empty account, no prior calibration ever
  PASS — first-ever write is adopted immediately (no row to be stale relative to)
  PASS — weight reflects the first commit

Scenario 2 — Restart, then answer up to (but not past) the old answer_count
  PASS — tier still frozen at old value after 29 new answers
  PASS — weight already reflects the tiny new-session model (desync from tier)
  PASS — guard releases at equality (>=), not only when strictly exceeded

Scenario 3 — Restart, then Undo before reaching the old answer_count
  PASS — status still frozen at the old session value (10 and 9 both < 30)
  PASS — weight still unconditionally overwritten by the post-Undo recompute

Scenario 4 — Restart happening at a degree boundary in the old session
  PASS — boundary promotion does not bypass the guard — still frozen (5 < 30, degree is irrelevant to this check)
```

**1. Empty account, no prior calibration ever.** No difference in kind — confirmed, not just
assumed. With no existing `user_calibration_status` row, the RPC's `on conflict` branch never
fires; it's a plain `insert`, so the very first write is adopted regardless of its
`answer_count`. There is nothing to be stale *relative to*. (A `tier: 'none', answer_count: 0`
row, if one already existed from a genuinely-zero-answer prior state, behaves identically to no
row — `0 >= 0` still passes.)

**2. Restart, then answer exactly up to the old session's `answer_count`.** The guard is
`>=`, and this releases at *equality*, confirmed live: answers 1–29 (old count 30) all lose the
guard race and the tier stays frozen at the old value; answer 30 — equal to, not past, the old
count — is immediately adopted. So a user who Restarts and answers exactly as many questions as
their old session had will see the tier unfreeze on that exact answer, not one after it.

**3. Restart, then Undo one of the new answers before reaching the old `answer_count`.** No
special interaction. `handleUndo` recomputes and calls `applyCommitComputation` exactly like any
other commit, with `computation.answerCount` simply one lower than before
([CriteriaCalibrationPage.tsx:761](../../../src/CriteriaCalibrationPage.tsx:761),
[:794](../../../src/CriteriaCalibrationPage.tsx:794)). The guard has no concept of Undo, Redo, or
insert-time vs. recompute-time — it only ever compares the `p_answer_count` value the caller
happens to pass against what's stored, and it never cross-checks that value against the real row
count in `user_calibration_answers`. Both the pre-Undo (10) and post-Undo (9) writes lose the
guard race identically; the tier stays frozen at the old value either way. The weights table, as
always, is overwritten unconditionally on both writes — so the visible score continues tracking
the post-Undo model even though the tier doesn't move.

**4. Restart at a degree boundary in the old session.** No change in behavior — confirmed. A
degree-boundary tier promotion goes through the same guarded RPC via the status-only
`upsertCalibrationStatus` ([persistence.ts:130-143](../../../src/lib/criteria-calibration/persistence.ts:130)),
at the *same* `answerCount` as the commit that reached the boundary (not incremented). Degree
never enters the guard's comparison at all — it's purely `p_answer_count` vs. stored
`answer_count` — so a boundary-promotion write is rejected exactly like any other write at that
count would be, live-confirmed against a stored `answer_count` of 30 with the promotion attempt
at 5.

## What this confirms about the mechanism

- The tier/accuracy freeze and the weights desync are not two coincidental bugs — they're the
  same root cause (Restart never touching `user_calibration_status.answer_count`) producing two
  different visible symptoms only because `user_criterion_weights` has no equivalent guard at
  all. A fix that adds a guard to the weights write, or that makes Restart reset
  `user_calibration_status`, would need to pick one behavior for both fields, not patch the tier
  alone and leave weights how they are (or vice versa) — see the discovery artifact's Open
  Questions for that decision, out of scope here.
- The guard's `>=` semantics behave exactly as `criteria-calibration-weights-write-race.md` and
  the migration header describe, live-verified again in this pass (Scenario 2) rather than
  re-derived from the SQL text alone.
- No schema change, no code change. `scripts/diagnostics/restart-stale-state-2026-09-20.ts` is
  now available in `scripts/diagnostics/` for re-running if the RPC or the weights upsert shape
  changes before a fix lands.

## Addendum 2026-09-20 — mature session, checked at zero new answers

Follow-up: a live check on Dan's real account showed the Album Evaluation page displaying the
exact pre-Restart score/rank/tier (82%, #1, Sharp) immediately after Restart, with zero new
answers. Scenario 1 above only covered an *empty* account, which can't reproduce this — this
addendum reproduces it with a mature (33-answer) session instead.

**`user_criterion_weights` does change, immediately, confirmed by direct query.**
`scripts/diagnostics/restart-mature-session-weights-2026-09-20.ts` seeds the disposable QA
account with the real solved weights from `REAL_PRODUCTION_SESSION_ANSWERS`
([fixtures.ts:332](../../../src/lib/criteria-calibration/fixtures.ts:332) — Dan's own account
data, already embedded there with his sign-off; not newly copied into this doc), fires the exact
write `handleRestart`'s `applyCommitComputation` makes on its first render (unconditional weights
upsert to a zero-answer solve, plus the guarded status RPC at `p_answer_count: 0`), and reads
`user_criterion_weights` back immediately:

```
BEFORE Restart — 33-answer mature session:
  c0: [0.0000, 0.0000, 0.1664, 0.1664, 0.1669]
  c1: [0.0000, 0.0000, 0.0833, 0.1668, 0.1668]
  c2: [0.0000, 0.0833, 0.1666, 0.1667, 0.1667]
  c3: [0.0000, 0.0000, 0.1665, 0.1666, 0.1666]
  c4: [0.0000, 0.1663, 0.1665, 0.1665, 0.1665]
  c5: [0.0000, 0.0000, 0.0000, 0.1663, 0.1663]

AFTER Restart, zero new answers, queried immediately:
  c0: [0.0000, 0.0318, 0.0767, 0.1217, 0.1667]
  c1: [0.0000, 0.0318, 0.0767, 0.1217, 0.1667]
  c2: [0.0000, 0.0318, 0.0767, 0.1217, 0.1667]
  c3: [0.0000, 0.0318, 0.0767, 0.1217, 0.1667]
  c4: [0.0000, 0.0318, 0.0767, 0.1217, 0.1667]
  c5: [0.0000, 0.0318, 0.0767, 0.1217, 0.1667]
```

A zero-answer solve is a uniform linear ramp, identical across every criterion (there is no
preference data left to distinguish them) — a world apart from the mature session's
non-uniform, front-loaded step function. `user_calibration_status` stayed exactly at
`tier: 'very_high', answer_count: 33` in the same run, confirming the guard again. So the DB
genuinely changes right away; **the "no visible change" observation on Dan's account is not
evidence that the write didn't happen.**

**Why a "perfect" album's score specifically can survive Restart unchanged — a real invariant,
not a coincidence.** `solver.ts` builds a hard normalization equality constraint into the LP —
every solve, regardless of answer content, satisfies "the six level-5 (max) values sum to 1"
exactly ([solver.ts:26-32](../../../src/lib/criteria-calibration/solver.ts:26)). The diagnostic
script confirms this numerically: an album profile rated at level 5 on all six criteria scores
**exactly 1.0000 under both the mature weights and the zero-answer weights** — identical by
construction, not by chance. A mid-range profile (level 3 across the board) is *not* protected
by that constraint and moves substantially (0.7494 → 0.4605). So this invariant is real, but it
only explains a **100%** album staying at 100% — it does not explain an **82%** album staying at
82%, since 82% is not the protected max-level case, and the level-3 comparison above shows a
non-max profile's score is expected to move a lot when weights collapse to the zero-answer ramp.

**The far more likely explanation for Dan's specific 82%/#1/Sharp observation is front-end
caching, not a DB-write failure or a protected invariant.** Every hook that reads
`user_criterion_weights` or `user_calibration_status` fetches once, in a `useEffect`, and never
refetches on its own:

- `useAlbumRatingsSummary.ts` ([useAlbumRatingsSummary.ts:29-42](../../../src/hooks/useAlbumRatingsSummary.ts:29))
  fetches `user_criterion_weights` only when `[user, refreshKey]` changes — `refreshKey` only
  moves via its own `refetch()`, which nothing on the Calibration page calls.
- `AlbumRatingPage.tsx`'s own weights fetch ([AlbumRatingPage.tsx:103-138](../../../src/AlbumRatingPage.tsx:103))
  depends only on `[albumId, user]` — mounting the page once and leaving it mounted keeps
  serving the weights it fetched at mount, however stale.
- `useCalibrationGate.ts` ([useCalibrationGate.ts:73](../../../src/hooks/useCalibrationGate.ts:73))
  (the tier badge) depends only on `[user]`, same pattern.

None of these are invalidated by `handleRestart`, and there is no live subscription or shared
cache tying them to the calibration page's writes. If Dan's Album Evaluation view was already
mounted (not freshly navigated to, or the app hadn't done a full reload) at the moment he
checked, every one of the three numbers he saw — score, rank, tier — would be exactly what was
fetched before Restart, regardless of what the DB now holds. This matches "front-end caching"
per the brief's own anticipated alternative, and per the brief's scope, no fix is proposed here.

## Out of scope (unchanged from the brief)

Any fix or mitigation, UI/copy changes, and the AOTY/Ranked Albums hub work all remain deferred
pending a separate solution-space decision.
