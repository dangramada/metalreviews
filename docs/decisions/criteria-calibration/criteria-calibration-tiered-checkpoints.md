# Tier-gated checkpoints replace the auto-escalation signal

**Status: MERGED to `master` `--no-ff` at `892f79c`, 2026-08-17. Rollback tag:
`pre-merge-criteria-calibration-tiered-checkpoints`. Migration applied to the live database;
browser verification done on the disposable QA account. See "Verification" below.**

Design decision made 2026-08-17. Supersedes both Brief 3's duration-based auto-escalation
signal and the earlier "checkpoint at every degree boundary" sketch (Candidate C as originally
scoped in `criteria-calibration-escalation-signal-candidates.md` §12).

---

## 1. What this replaces, and why there is no signal any more

`criteria-calibration-escalation-signal-candidates.md` closed out the mathematical-signal
direction: five variants (coverage width, width plateau, normalised ratio, accuracy plateau,
weight-vector stability) tested across 12 traces × four R values, none with a threshold safe
across the evidence set. The incumbent signal it was trying to replace — top-10 stability over
`RANKING_TEST_SET` — cannot work for any first-time user at all, because calibration is gated
to run _before_ a user has rated anything.

So this pass does not build a better detector. It removes the detection problem: the user is
asked, at points the system can identify honestly, whether they want more accuracy.

**What Candidate C got wrong, and what changed.** C proposed a checkpoint at _every_
`isDegreeCoverageComplete` boundary. Measured cost was 2 extra screens per real session (max 4
across all traces). The 2026-08-17 decision keeps C's core move — stop suppressing a trigger
that already exists — but re-gates it on accuracy tiers rather than on every boundary, so the
checkpoints land where they carry information the user can act on ("your accuracy is now High")
rather than at every structural boundary regardless of whether anything changed.

## 2. The flow

1. **Degree-2 checkpoint.** Fires when degree 2 hits `degree-exhausted`, _regardless_ of whether
   Medium was reached. Shows the real tier — "Low" if it is Low. Two actions: "Increase
   accuracy" / "Stop here — evaluate albums". **Unless accuracy has already reached High or Very
   High, in which case that tier's screen shows instead — see §5c.**
2. **Silent progression, degree 3+.** After "Increase accuracy", degree escalates 3→4→5→6 as
   pools exhaust, with no screen, until a tier crossing or terminal exhaustion.
3. **High checkpoint.** Fires on the commit that crosses `SCORE_SPREAD_HIGH_THRESHOLD`.
   Interrupts the question stream — it does not wait for a boundary, because some sessions never
   reach another one.
4. **Silent progression toward Very High**, same as 2.
5. **Very High checkpoint.** Single action. No continuation offered: per 1000minds' own framing
   100% is unreachable, so Very High is the practical ceiling.
6. **Exhaustion fallback.** When a boundary has no further degree to escalate to. Neutral copy,
   single action.

## 3. Two corrections to the brief, confirmed with Dan before implementing

**The brief named deprecated constants.** It specified `MEDIUM/HIGH/VERY_HIGH_ACCURACY_THRESHOLD`
(0.85/0.92/0.97) and `computeSolverAccuracy`. Those have been dead code since 2026-08-09, kept
only for rollback safety — that metric was found blind to real ranking improvement from
degree-3+ answers ("Part 4 finding"), which is precisely the range steps 2–4 operate in. The
live metric is `computeScoreSpreadAccuracy` with `SCORE_SPREAD_MEDIUM/HIGH/VERY_HIGH_THRESHOLD`
= **0.55 / 0.75 / 0.85**. Confirmed 2026-08-17 as a naming slip, not a request. Thresholds are
unchanged by this pass and remain provisional.

**The prerequisite removal was not merged.** The brief assumed
`criteria-calibration-vacuous-signal-fix` was already on `master`. No such branch exists; the
entire signal was live. The removal is therefore part of this pass.

## 4. Why tier-crossing is legitimate here, and Pass 2 does not apply

Pass 2 (`criteria-calibration-ranking-stability-analysis.md`) rejected accuracy tiers **as a
proxy for ranking stability** — the tier gate arrives unpredictably relative to the round where
the ranking settles (oracle `#6` becomes tier-eligible at n=71 for a session that settled at
n=40). That is a finding about tiers being a poor _estimator of a different, hidden quantity_.

Here the tier estimates nothing. The checkpoint's subject **is** the accuracy tier, and its copy
makes no claim about ranking or stability. "Your accuracy reached High" is true by definition
when `solverAccuracyTier` returns `'high'`. This distinction is recorded as a code comment at the
derivation site specifically to stop a future session from "fixing" it by reviving a window.

## 5. Firing on a crossing, not on a standing state

Found during implementation, and a genuine design correction rather than a detail.

The tier is a pure function of the answer log, so "accuracy is High" stays true forever once
crossed. A naive derivation therefore fires the checkpoint on every render after the crossing —
including immediately on page load for a resumed session. For Very High that is a **dead end**:
that screen offers no continuation by design, so a returning user whose saved log is already
Very High could never reach another question.

Fix: at the one moment the resumed log is first solved, pre-acknowledge whatever tier it already
sits at. Checkpoints then fire only on an in-session crossing. Still fully derived, still nothing
persisted, and it removes the "a reload re-shows a checkpoint" wrinkle that session-local
acknowledgment would otherwise have had. `degree2Acknowledged` is deliberately _not_ seeded this
way — that checkpoint is triggered by the degree-2 boundary, not a tier, and re-showing it to a
user sitting exactly on that boundary is correct.

Regression-tested (`CriteriaCalibrationCheckpoints.test.tsx`, "does not fire a tier checkpoint on
load").

### 5b. The same gap, one level up: `degree2Acknowledged` on resume

Found during live verification, and the same shape of bug as §5 — session-local state that is
correct within a visit but wrong on the first render of a resumed one.

`degree2Acknowledged` gates the silent auto-progression effect. On a resumed session it starts
`false`, because no click happened this visit. A session that left off **exactly at a degree-3+
boundary** therefore rendered neither a checkpoint (degree is no longer 2, and tiers are
pre-acknowledged per §5) nor a question (the driver is at a boundary), and could not escalate —
a dead end with only the transient "Moving on…" fallback showing.

Fix: seed `degree2Acknowledged` from `resume.degree > STARTING_DEGREE`. A session above degree 2
has already passed the degree-2 decision in an earlier visit; the answer log proves it. Same
principle as §5 — derive the flag from the log rather than assume a fresh visit.

Caught by the live pass, not by the unit tests as originally written; regression test added
("a session resumed at a degree-3 boundary is not stranded"), and confirmed live afterwards.

### 5c. Tier beats degree 2 when both apply

Changed 2026-08-17 after live verification, reversing the first implementation's precedence.

The two triggers are independent, so both can hold at once. Observed live: a perfectly
consistent answerer exhausted degree 2 at **105 answers with accuracy 0.8607 — Very High**.
Degree-2-wins rendered "Your accuracy so far: 86% — Very High" above an **"Increase accuracy"**
button — inviting the user to improve a number already at the practical ceiling, and directly
contradicting the Very High screen's premise that nothing further is worth offering.

Precedence is now **Very High > High > degree 2 > terminal exhaustion**. No new copy variant was
added; it is purely which existing screen wins.

Two consequences that need the code to do more than reorder four branches:

1. **A substituting tier screen must settle the degree-2 decision.** The High screen asks the
   same question with better-matched copy, so acting on it answers the degree-2 question too.
   Without this, dismissing High at a degree-2 boundary renders the degree-2 screen immediately
   afterward, asking again. `handleCheckpointContinue` sets `degree2Acknowledged` in that case.
2. **The substitution cannot be keyed on "tier not yet acknowledged."** On a resumed session
   every reached tier is pre-acknowledged (§5), so a resumed session sitting on the degree-2
   boundary at Very High would fall straight through to the degree-2 screen and reintroduce the
   exact invitation this removes. The tier branches therefore also fire when a degree-2 decision
   is pending, acknowledged or not. This cannot loop: acting on the screen clears
   `degree2Pending`.

Both are regression-tested, and all four tests were confirmed to fail under the old ordering
before the change landed. Re-verified live on the same 105-answer seed: the Very High screen now
renders with its single "Evaluate albums" action, which navigates to `?from=` correctly.

## 6. Acknowledgment is session-local, deliberately

Decided with Dan (option (a) of two). Persisting it would mean re-adding columns to
`user_calibration_status` — the table this pass just emptied of exactly this kind of client
trajectory bookkeeping — and would re-open the un-awaited-write-race surface that emptying it
closed. Consistent with `stopped`, which has never been persisted either. With the crossing-based
firing above, the cost that motivated the alternative (re-showing on reload) does not arise.

## 7. What was deleted

- `rankingStabilitySignal.ts` (273), `rankingTestSet.ts` (63), `useRankingTestSetRatings.ts` (76),
  `rankingStabilitySignal.test.ts` (464) — ~876 lines.
- The `stabilityWindow` half of `commitComputation.ts` and its `StabilityWindowContext`
  threading; the `windowHistory`/`persistedWindow` undo/redo plumbing in the page; the
  resume-time window fetch.
- Seven `user_calibration_status` columns and the RPC parameters carrying them —
  `supabase/user_calibration_status-drop-stability-window.sql`.
- Three one-off diagnostic scripts tied strictly to the retired signal
  (`verify-pre-reset-step0.ts`, `analyze-second-session-2026-08-15.ts`,
  `reset-calibration-2026-08-15.ts`).

**Kept, with judgment calls recorded:**

- `fixtures.ts`'s `PASS4_RANKING_STABILITY_CHECKPOINTS` — now has **no consumer**, kept anyway
  because it is the only committed copy of the gitignored
  `ranking-stability-log-2026-08-1{0,1,2}.jsonl` snapshots. It is evidence, not dead code; a
  header comment says so.
- `verify-write-race-guard.ts` — the guard it validates (accuracy_value/tier/answer_count)
  survives. Its check #4, which demonstrated the unguarded columns could regress, is deleted
  along with those columns: not an unverified gap now, an unreachable one.
- `synthetic-calibration-oracles-2026-08-16.ts` and the eps lab harness — signal columns
  stripped, everything else unchanged. The committed CSV still carries its original `fired`
  header; it is the 2026-08-16 record and was deliberately not regenerated.

## 8. The write-race is retired, not fixed

`criteria-calibration-weights-write-race.md`'s open risk was scoped _exactly_ to
`last_eligible_top10` / `last_change_answer_index` and the `previous_` triple — the answer-count
guard deliberately did not extend to them. Dropping the columns removes the only fields the RPC
wrote without an ordering guard. Every surviving field is guarded. There is no unguarded write
left to race.

## 9. Exit destination

`handleFinish` resolves a `?from=` query param through an **allowlist**, mirroring
`AlbumRatingPage`'s `resolveBackDestination` (same param name, same shape — see
`album-rating-page--concept-draft.md`). An allowlist rather than a raw path so a crafted `?from=`
cannot redirect anywhere unintended. Favorites' soft-gate dialog now passes `?from=favorites`;
absent or unrecognised falls back to `/favorites`, which is the previous hardcoded behaviour.

Noted, not fixed: `RequireAuth` preserves nothing across a login redirect — a logged-out user
hitting the calibration URL loses the whole route, not just the query. Pre-existing and general,
unrelated to this param.

## 10. Accuracy label now reaches Very High

The page hard-capped the displayed label at Medium. That cap was about `computeSolverAccuracy`,
the metric deprecated on 2026-08-09. The live score-spread metric's tiers are what this flow is
built on, so all four are displayable. `AccuracyLevel` gained `'Very High'`.

## 11. Verification

- `tsc -p tsconfig.app.json --noEmit`: **no new errors** against the `master` baseline (43 vs 44
  pre-existing file-level errors, none in changed files).
  - **`npm run type-check` is a no-op in this repo** — the root `tsconfig.json` has `files: []`
    with project references, so bare `tsc --noEmit` checks nothing and exits 0. Filed in
    `deferred-work.md`.
- `npx vitest run`: **300/300 pass**, including 10 new tests covering all four screens, silent
  progression, the crossing-not-standing rule, the neutral-copy constraint, and the `?from=`
  round-trip.
- `eslint`: 2 errors on the changed page, **both pre-existing on `master`** (recovery effect).
- Dev server loads clean, no console or server errors.
- **Migration applied and verified against the live database** (read-only probe, 2026-08-17):
  all 7 dropped columns return `42703 undefined_column`; `tier`/`accuracy_value`/`answer_count`
  survive; the 4-param RPC resolves; **the old 11-param overload is gone** (`PGRST202`). That
  last check matters — `create or replace` with a different parameter list creates an overload
  rather than replacing, and PostgREST would then disambiguate by argument names. The explicit
  `drop function` did its job.
- **Live browser verification, disposable QA account** (seeded via service key from the real
  driver + a consistent oracle, the same approach that validated auto-recovery on 2026-08-16;
  account restored to empty afterwards, Dan's own 71-answer account never touched):
  - **Degree-2 checkpoint** rendered at the boundary with correct copy and both actions.
  - **"Increase accuracy"** escalated to degree 3 — card went from 2 to 3 criteria, with the
    "Now comparing 3 criteria at once." clarification.
  - **Silent auto-progression** confirmed: a session resumed at a degree-3 boundary moved
    straight to a degree-4 question with no interstitial.
  - **Very High label** displayed in the header, confirming §10.
  - **Full persistence round-trip through the narrowed RPC** — the one thing the unit tests
    have to mock. One browser-committed answer produced `answer_count: 117`,
    `tier: very_high`, `accuracy_value: 0.9106`, 30 weight rows, and a status row with no
    stability columns.

## 12. Open question — NOT resolved here

Synthetic oracle data (2026-08-16) shows several plausible preference shapes — single-dominant,
front-loaded, linear-control — never crossing High within 86–90 answers, running to natural
exhaustion instead. Whether that reflects genuine under-information in those shapes or a blind
spot in `computeScoreSpreadAccuracy` is **unresolved**, and tracked in `deferred-work.md` for a
future data-analysis session.

This is why the exhaustion-fallback copy must stay neutral. It states the accuracy as fact and
stops — it does not imply the user answered badly or inconsistently, and equally does not imply
the metric failed. A test asserts both directions. Do not reword it until this is settled.

## 13. What NOT to change

- Don't revive a stability window to "improve" the tier checkpoints — see §4.
- Don't "simplify" the checkpoint precedence back to degree-2-first, and don't make the tier
  branches depend solely on `acknowledgedTiers` — see §5c for both, each backed by a test.
- Don't make tier acknowledgment persistent without re-reading §6 and §8; it re-opens a closed
  correctness risk.
- Don't reword the exhaustion screen in either direction — see §12.
- Don't delete `PASS4_RANKING_STABILITY_CHECKPOINTS` as dead code — see §7.
- Don't retune `SCORE_SPREAD_*_THRESHOLD` here; still on the joint-recalibration list.
