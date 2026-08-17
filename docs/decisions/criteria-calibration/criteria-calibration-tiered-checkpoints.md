# Tier-gated checkpoints replace the auto-escalation signal

**Status: implemented 2026-08-17, branch `criteria-calibration-tiered-checkpoints`. Live
verification on a real account is OUTSTANDING — see "Verification" below.**

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
   accuracy" / "Stop here — evaluate albums".
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
- **OUTSTANDING: live verification on a real account.** The route is auth-gated and I cannot log
  in. Needs Dan to authenticate, then the degree-2 checkpoint and one silent-progression case
  driven in a browser. The SQL migration is also **not yet applied** — it must be run in the
  Supabase SQL editor, and until it is, the client sends a 4-param RPC call that will not resolve
  against the live 11-param function. **Apply the migration before the next live session.**

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
- Don't make tier acknowledgment persistent without re-reading §6 and §8; it re-opens a closed
  correctness risk.
- Don't reword the exhaustion screen in either direction — see §12.
- Don't delete `PASS4_RANKING_STABILITY_CHECKPOINTS` as dead code — see §7.
- Don't retune `SCORE_SPREAD_*_THRESHOLD` here; still on the joint-recalibration list.
