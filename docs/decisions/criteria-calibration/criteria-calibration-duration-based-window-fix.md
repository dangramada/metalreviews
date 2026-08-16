# Criteria Calibration — duration-based stability window (replaces K=2)

Implemented 2026-08-14, same session as
`criteria-calibration-fine-grained-firing-instability.md`'s false-positive finding. Replaces
the checkpoint-COUNT K=2 window with a minimum-real-answer-SPAN window, per that doc's
"Implication for the proposed fix."

## Step 1 — candidate R sweep (real 70-answer trace, read-only, throwaway script)

Same method as the false-positive finding: replayed Dan's real answer sequence through the
current solver at every real answer (n=1..70), this time driving a candidate signal — "fire
once R real answers have elapsed since the top-10 set last changed at a tier-eligible
checkpoint" — for R in {3, 6, 9, 12}.

| R | Fires at n* | Top10 changes again after n*, through n=70? |
|---|---|---|
| 3 | 29 | **YES** — at n=[31, 33, 34, 35, 36, …, 70] — false positive, same failure class as K=2's n=28 |
| 6 | 41 | NO — frozen through n=70 |
| 9 | 44 | NO — frozen through n=70 |
| 12 | 47 | NO — frozen through n=70 |

Fired points line up exactly as `35 + R` for R=6/9/12 — the real last top-10 change in this
trace is n=35 (see the false-positive doc's corrected finding), so any R that clears that gap
holds. R=3 fires at n=29, before the n=31–35 flurry, so it walks into the same trap as the
original K=2's n=28.

**Sanity check (tier gate holds under the new definition):** tier stays `insufficient`
through n=25, including a genuine 4-answer top-10 plateau at n=19–22 that a non-tier-gated
duration signal could mistake for settling. All four R values correctly stayed unfired
throughout n≤25 — `advanceStabilityWindow` skips insufficient-tier checkpoints entirely, so
duration only accumulates against tier-eligible checkpoints.

## Step 2 — design analysis (persistence layer)

1. **Monotonic fired-guard (`fired = fired OR excluded.fired`) — applies as-is, confirmed not
   assumed.** The guard's correctness depends only on `fired` being monotonic along the true
   forward trajectory; `advanceStabilityWindow`'s terminal-once-fired structure (short-circuit
   return on `state.fired`) is unchanged by what drives the flip (match-count crossing K vs.
   duration crossing R).

2. **`previous`/`lastCommitChangedWindow` — mechanically unchanged.** Both the old and new
   `advanceStabilityWindow` return a freshly-constructed object on every non-short-circuited
   call, even when the resulting value is unchanged in substance — so
   `advancePersistedStabilityWindow`'s reference-inequality `changed` check fires on
   essentially every real eligible-tier commit in both designs, and `previous` tracks "state
   one real commit ago" identically either way.

3. **Third schema migration — yes, in-place rename** (per Dan's direction — no real
   end-user data at stake yet, both existing rows are Dan's own account plus the disposable
   QA account): `consecutive_match_run`/`previous_consecutive_match_run` →
   `last_change_answer_index`/`previous_last_change_answer_index`, plus a matching
   `upsert_calibration_status` signature update. `last_eligible_top10`,
   `previous_last_eligible_top10`, `fired`, `previous_fired`, `last_commit_changed_window` all
   reused unchanged. See `supabase/user_calibration_status-rename-duration-window.sql`.

### Double-Undo-immediately-after-resume, re-derived for the new shape (not assumed)

Per Dan's explicit request, this was codified as test cases in
`rankingStabilitySignal.test.ts`, not left as written analysis alone — mirroring the
algebraic-argument-plus-concrete-trajectory verification the original K=2 shape got.

- **`fired` monotonicity**: unchanged proof, re-confirmed — same terminal structure regardless
  of window shape.
- **`lastChangeAnswerIndex` is ALSO monotonically non-decreasing** along the true trajectory (a
  real change only ever sets it to the current, strictly larger answer index, never resets it
  backward) — a new structural fact this design needed that K=2's `consecutiveMatchRun` didn't
  have an equivalent of. This is what makes the accepted 2-undo clamp gap safe-direction for
  this field too, independent of `fired`.
- **Test: "lastChangeAnswerIndex mismatch, safe direction"** — constructs three real top-10
  changes in a row followed by a fire, then two consecutive Undos with no intervening commit.
  Confirms concretely that the clamped value's `lastChangeAnswerIndex` differs from the true
  two-undos-back value, and that the clamp is always the *larger* (more-recently-changed-looking)
  of the two — i.e. it can only understate elapsed stability, never manufacture spurious extra
  settledness. (This case doesn't port mechanically from the old K=2 test: `consecutiveMatchRun`
  incremented by exactly 1 per additional real match, so any 2-undo gap trivially showed a
  numeric mismatch; `lastChangeAnswerIndex` is "sticky" — unchanged across any run of matching
  checkpoints — so proving a genuine mismatch needs multiple real changes close together.)
- **Test: "Undo removing the actual last-change answer, then continuing"** — the specific
  concern flagged when this was first proposed: could Undo leave `lastChangeAnswerIndex` stuck
  referencing a removed change, causing a false-early fire on replay? Confirmed concretely: the
  reverted-then-continued trajectory is **byte-for-byte identical** (`toEqual`, not just
  "delayed") to a clean session that never had the undone answer at all — not merely
  non-accelerated, but exactly equivalent to honest replay of the edited history, which rules
  out a false-early fire entirely rather than just bounding it. A second assertion contrasts
  the alternative (keeping the disruptive answer as permanent history instead of undoing it)
  to show that path requires *strictly more* real-answer evidence before firing — Undo can only
  remove disruptive evidence the edited history no longer contains, never invent settledness
  beyond what the edited log honestly shows.

## Decision: R=12

Chosen for margin beyond the single observed instability window (last real change at n=35),
not as the bare minimum that happened to clear the check (R=6 also cleared it). **PROVISIONAL
— single-session, single-user evidence**, same standing as `SCORE_SPREAD_*_THRESHOLD` in
`accuracyTiers.ts` (see `deferred-work.md`); do not tighten or loosen without a second real
session's data.

## What changed

- `rankingStabilitySignal.ts`: `StabilityWindowState.consecutiveMatchRun` (number, run length)
  → `lastChangeAnswerIndex` (number, absolute real-answer index); `advanceStabilityWindow` now
  takes an explicit `answerIndex` parameter and fires on `answerIndex - lastChangeAnswerIndex
  >= REQUIRED_ANSWER_SPAN` (12) instead of a match-event count.
- `commitComputation.ts`: passes `answers.length` through to the window advance (no other
  change — the answer array was already in scope).
- `persistence.ts`: column/RPC-argument renames only, same read/write shape otherwise.
- `supabase/user_calibration_status-rename-duration-window.sql`: third migration, in-place
  column rename + RPC signature update. **Not yet run against the live database** — needs the
  same manual Supabase SQL editor step the prior two migrations got.
- `rankingStabilitySignal.test.ts`: K=2-specific tests replaced (not left alongside) with
  duration-based equivalents, including the Pass 4 n=39 fixture-reproduction test — removed
  rather than repurposed, since that fixture's every-3rd-sample granularity is exactly what
  the false-positive finding showed is unreliable for verifying an exact firing point.
  `fixtures.ts`'s `PASS4_RANKING_STABILITY_CHECKPOINTS` export itself is kept (historical
  evidentiary record for `criteria-calibration-ranking-stability-analysis.md`), just no longer
  exercised by a test here.
- `persistence.test.ts`: field/column renames only, same coverage.
- 281/281 tests pass, `tsc --noEmit` clean, lint clean.

## Live verification, pass 3 (2026-08-14, after the migration was applied)

Migration confirmed live: Dan ran `user_calibration_status-rename-duration-window.sql` in the
Supabase SQL editor; read-only queries in this pass selected `last_change_answer_index`/
`previous_last_change_answer_index` successfully (would have errored on the old column names
otherwise) — independent confirmation the rename applied cleanly, alongside Dan's own
confirmation.

Drove a fresh, noisy live session on the disposable test account (`dgramada07@gmail.com`,
distinct from the real-70-answer trace that informed R=12 — deliberately independent
evidence), mixing left/right/"About equal" picks through the actual UI (24+ real answers,
reaching degree 3).

**(a) Duration signal fires and stays fired — confirmed.** Tier reached `high` at real answer
9 (anchor). `fired` flipped true by real answer ~21 (9+12, matching R=12 exactly) — confirmed
via direct DB read mid-session (`fired: true`, `last_change_answer_index: 9`), and the UI
correctly showed the post-fired manual "Add more detail" gate at the next degree-2-exhaustion
checkpoint (real answer 23). Continued driving several more real degree-3 answers afterward
(accuracy climbed 0.76 -> 0.81) — `fired` stayed true and `last_change_answer_index` stayed
frozen at 9 throughout (the terminal short-circuit working exactly as designed), no re-flip.

**(b) Genuine no-click auto-escalation — still NOT observed, but now with a precise, structural
reason, not just "still unlucky."** Found while checking the DB: `last_eligible_top10` was `[]`
(an empty array), not a real 10-album set. Root cause, traced in
`useRankingTestSetRatings.ts`: its query against `album_criteria_ratings` for
`RANKING_TEST_SET`'s 13 hardcoded albumIds carries no explicit `user_id` filter — it relies
entirely on that table's RLS policy (`auth.uid() = user_id`) to scope it to the CURRENT
logged-in user. `RANKING_TEST_SET`'s 13 albumIds were frozen from **Dan's own** historical
ratings specifically (see `rankingTestSet.ts`'s header). For any other authenticated user —
including this disposable test account — that query returns zero rows, `ratingsByAlbum` is an
empty `Map`, and `computeTop10Set` returns a real, non-null **empty Set** (not the defensive
`null` a coverage gap would trigger — an empty ratings map still produces a valid, if vacuous,
top-10 of size 0).

An empty set trivially equals another empty set on every comparison, so the "has the top-10
changed" half of the signal is **structurally vacuous for every account except Dan's own** —
it can never register a real change, so `fired` degrades to a pure "R real answers after
tier-eligibility" timer, completely decoupled from whether that user's own ranking has
actually stabilized. Concretely in this trial: tier-eligibility (real answer 9) was reached
well before degree-2's real pool exhausted (real answer 23-24) — a 14-answer gap — and because
the vacuous match guarantees firing at exactly anchor+12, `fired` was mathematically certain to
trip (at ~21) before the pool could run dry, regardless of any real preference data. This isn't
an R-tuning problem — no R value can fix it, since the "does the ranking look stable" question
this signal exists to answer is never actually being asked for non-Dan accounts.

This likely also explains why the 3 *live* trials among Brief 3's original 4 (pass 2 of
`criteria-calibration-auto-escalation-signal.md`) never observed genuine auto-escalation
either, if any ran on a non-Dan account — a second, independent mechanism from "the additive
model settles fast at degree 2" (that finding is unaffected — it was verified separately,
via a direct programmatic replay of Dan's own real rated data, not a live non-Dan browser
session). ~~**Not fixed in this pass**~~ — see 2026-08-16 correction below.

> **Correction, 2026-08-16 (`criteria-calibration-vacuous-signal-fix` session):** the
> vacuous-match half of this finding — an empty ratings map producing a real, non-null, but
> trivially-self-equal empty Set — was fixed the very next day, in commit `914e27a` ("fix:
> reject partial ratings coverage in computeTop10Set (per-user-scoping bug)",
> 2026-08-15), one full day before this note above was written. `computeTop10Set`
> (`rankingStabilitySignal.ts`) now returns `null` — the existing "can't compute" signal —
> for any ratings map under `TOP_N` (10) albums, not just a fully-empty one, and
> `computeStabilityWindowUpdate` (`commitComputation.ts`) treats `null` as "skip this
> checkpoint entirely," so `PersistedStabilityWindow` never advances and `fired` stays
> permanently `false` for the whole session on any non-Dan account — not a vacuous match,
> not a vacuous fail either way. Confirmed both by the existing regression test
> (`commitComputation.test.ts`'s "untrustworthy RANKING_TEST_SET ratings" describe block —
> 50 synthetic checkpoints with empty/partial ratings, `fired` stays `false` throughout) and
> by a fresh live end-to-end reproduction driving the real adaptive elicitation flow
> (`nextAction`/`computeCommitState`) with a permanently-empty `ratingsByAlbum`: tier reached
> `high` at real answer 5, the session continued 75 more real answers (through `high` and
> `veryHigh`, to natural coverage-complete exhaustion at round 80) — under the pre-914e27a
> code this trajectory would have fired at round 17 (5+12); with the fix, `fired` stayed
> `false` for all 80 rounds and every single checkpoint's stability-window update was skipped
> (`stabilityWindowSkipped=true` throughout). Below, "**New, blocking for merge**" and the
> "Before merging" per-user-scoping bullet describe the state as of 2026-08-14/15, before this
> fix landed — read them as history, not current status. What's genuinely still open (tracked
> in `deferred-work.md`) is unrelated to the false-fire risk this note originally raised: the
> underlying design question of making `RANKING_TEST_SET` per-user (dynamic, each user's own
> rated albums) ahead of an eventual multi-user launch — a real gap, since a non-Dan account's
> escalation signal simply never advances at all today (safe, but non-functional for them),
> not a design question blocking merge.

## Before merging

- Both migrations (all three now) confirmed live.
- Duration-based firing itself (a-above) is live-verified and behaves exactly as designed.
- **New, blocking for a meaningful understanding of the feature (not for the window-timing fix
  itself, which is independently correct)**: the top-10-membership check `RANKING_TEST_SET`
  drives is only ever real for Dan's own account; every other account's signal reduces to a
  fixed R-answer timer. Needs a decision before merge: ship as-is (acceptable if this really is
  single-user-only in practice), or address the per-user scoping gap first.
- Genuine live pre-fired auto-escalation: still unobserved directly — now understood to be
  structurally near-impossible to observe on any non-Dan account, not just unlucky timing (see
  above). Whether it's observable on Dan's OWN real account remains untested live (only via the
  read-only 70-answer replay, which predates and informed R=12's choice, so isn't independent
  confirmation either).

## Related

- `criteria-calibration-fine-grained-firing-instability.md` — the false-positive finding this
  fix responds to.
- `criteria-calibration-auto-escalation-signal.md` — original Brief 3 implementation.
- `deferred-work.md` — R=12's provisional-threshold entry belongs alongside the other
  unvalidated Criteria Calibration constants tracked there.
