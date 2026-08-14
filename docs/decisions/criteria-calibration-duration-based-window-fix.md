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

## Before merging

- **New, not yet done**: run `supabase/user_calibration_status-rename-duration-window.sql`
  against the live database (same manual step the prior two migrations needed) — the two
  existing migrations are confirmed live, but this third one is not yet applied.
- Live-browser re-verification on the disposable test account (or a fresh one) has NOT been
  re-run against this new window shape — Brief 3's original pass-2 live verification (per-degree
  clarification text, Undo, refresh-resume) covered the K=2 shape; the mechanics it touched
  (windowHistory push/pop, resume seeding) are unchanged by this fix per the design analysis
  above, but a live pass on the new duration-based firing behavior itself has not been done.
- Genuine live pre-fired auto-escalation: still unobserved directly (unaffected by this fix;
  see `criteria-calibration-additive-model-degree-sufficiency.md`).

## Related

- `criteria-calibration-fine-grained-firing-instability.md` — the false-positive finding this
  fix responds to.
- `criteria-calibration-auto-escalation-signal.md` — original Brief 3 implementation.
- `deferred-work.md` — R=12's provisional-threshold entry belongs alongside the other
  unvalidated Criteria Calibration constants tracked there.
