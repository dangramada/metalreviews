# Criteria Calibration — fine-grained K=2 firing is a false positive at n=28

Read-only diagnostic, 2026-08-14, continuing Brief 3
(`criteria-calibration-auto-escalation-signal.md`) verification. Answers the two open
verifications that doc's "Before merging" section and the session brief left unresolved.
**Verdict: do not merge as-is** — n=28 is confirmed a false positive, not genuine
convergence, and a concrete mechanism is identified.

## Method

Replayed Dan's real 70-answer `user_calibration_answers` sequence (real account
`eec42cd4-e714-46a2-ad9c-35714a1d3a2c`, not the disposable test account used for Brief 3's
live UI verification) through the *current, unmodified* `solveValues` /
`computeScoreSpreadAccuracy` / `solverAccuracyTier` / `computeTop10Set` /
`advanceStabilityWindow` — one LP solve per answer count, n=1..70, i.e. the exact
per-commit granularity production actually runs at (not Pass 4's every-3rd-sample
retrospective sampling). Read-only: fetched via `fetchPersistedAnswers`-equivalent query
plus `album_criteria_ratings` for `RANKING_TEST_SET`'s 13 albums, no writes. Script was a
throwaway (`scripts/tmp-replay-stability.ts`, not committed — same convention as the prior
session's replay).

## Verification 1: was the K=2 window logic itself applied correctly?

Yes. The checkpoint sequence from the first tier-eligible answer through firing:

| n | tier | run (consecutiveMatchRun) | fired |
|---|---|---|---|
| 26 | high (anchor) | 0 | false |
| 27 | high (matches 26) | 1 | false |
| 28 | high (matches 27) | 2 | **true** |

This is exactly `advanceStabilityWindow`'s documented semantics (anchor → match event 1 →
match event 2 → fire) — the implementation is not buggy. The problem is what those three
checkpoints actually are: **three consecutive real answers, n=26/27/28, with zero
intervening real answers.** Under fine-grained (real, per-commit) checking, "2 consecutive
tier-eligible checkpoints matched" is only 2 real answers of evidence — a razor-thin margin,
exactly the mechanism the brief's re-derivation flagged as a live risk before this
verification ran.

## Verification 2 (decisive): does the top-10 set change again after n=28?

**Yes — repeatedly, from n=31 through n=70.** Full detail, not just yes/no:

- n=28's top-10 set has **Yūgen** at rank #10 (`0.4168`), immediately ahead of **House Of
  Mirrors** at rank #11 (`0.4167`) — a gap of 0.0001. This was never a comfortable margin;
  n=28 fired on a coin-flip-close boundary.
- n=29, n=30: still match n=28 (no flip yet).
- n=31: **House Of Mirrors overtakes Yūgen** for the #10 spot (0.4166 vs 0.3334). Flip #1.
- n=32: flips back to match n=28 (Yūgen back in). One answer of pure noise at the boundary.
- n=33: flips again to House Of Mirrors in.
- n=34: a THIRD distinct variant — A Tranquil Void in instead (neither n=28's nor n=33's
  set) — further evidence this whole zone is a live multi-way near-tie, not a settled
  ranking.
- n=35 onward, **every single checkpoint through n=70** (36 consecutive real answers) shows
  the identical delta versus n=28: House Of Mirrors in, Yūgen out. Since the delta is
  constant across all of n=35..70, the set itself is constant across that whole span — this
  is the genuine, robust settle point in this trace, not n=28.

**Conclusion: n=28 is a false positive.** The real, stable-to-end-of-session convergence
point in this trace is **n=35** (corrected from an initial read of n=33 — a follow-up
pairwise, checkpoint-vs-immediate-predecessor trace, done while evaluating candidate fixes,
found the n=34 third-variant flip this doc's first pass missed by comparing only against a
fixed n=28 reference instead of each checkpoint's immediate predecessor) — 7 real answers
later, and only provably robust in hindsight (nothing in the live signal at n=35 itself would
have told you it wouldn't flip again at n=40 — it just happens not to, all the way to n=70,
the end of the real log).

## Root cause

Exactly the mechanism the brief anticipated: K=2 measured as "2 consecutive tier-eligible
*checkpoints*" degrades under fine-grained checking to "2 consecutive real answers,"
because production checks every commit (no sampling). Pass 4's original every-3rd-sample
retrospective analysis had ~3x more real-answer distance baked into the same nominal "K=2"
by construction — an artifact of how that data was collected, not a deliberate design
margin, and it silently evaporated when the live signal was wired to check every commit
instead.

The boundary that got walked into here (Yūgen vs. House Of Mirrors, scores within 0.0001 at
n=28) is close enough that ordinary answer-to-answer noise flips it multiple times over a
~40-answer span. A window defined purely by "how many checkpoints in a row," with no floor
on how many real answers separate them, cannot distinguish "genuinely settled" from
"currently sitting still while passing through a noisy near-tie zone."

## Implication for the proposed fix

Confirms the fix direction floated in the brief before this verification ran, now with
evidence behind it rather than suspicion: **redefine the window not as a checkpoint count
but as confirmed stability over a minimum real-answer span** (e.g. the top-10 set must be
identical across every checkpoint touching at least N real answers, not just N tier-eligible
checkpoints) — independent of how often the caller happens to check. A checkpoint-count
window is fundamentally not robust to varying check frequency; a real-answer-span window is,
by construction.

Not implemented in this session — this doc closes out the two open verifications the brief
asked for; the fix itself is a separate, not-yet-started change to
`rankingStabilitySignal.ts`'s window semantics and needs its own design pass (at minimum:
what span is enough, and whether it should be a fixed answer count or itself derived from
data the way the old gap-based degree-escalation heuristic was replaced by a coverage-based
one — see `criteria-calibration-adaptive-degree-escalation.md` for that precedent).

## Before merging — superseded

The fix direction below has since been implemented — see
`criteria-calibration-duration-based-window-fix.md` for the R-value sweep against this same
real trace, the resume/persistence design analysis, and the implementation itself
(duration-based window, third migration, replaced test suite). That doc's "Before merging"
section is now the current one for this branch.

## Related

- `criteria-calibration-auto-escalation-signal.md` — Brief 3 implementation this verifies.
- `criteria-calibration-duration-based-window-fix.md` — the fix this finding's "Implication
  for the proposed fix" section led to; supersedes this doc's "Before merging" section.
- `criteria-calibration-additive-model-degree-sufficiency.md` — the degree-2-sufficiency
  finding from the same verification session, unaffected by this doc's finding.
- `criteria-calibration-ranking-stability-analysis.md` — Pass 4's original every-3rd-sample
  n=39 estimate; this doc explains why fine-grained checking diverges from it in both
  directions (n=28 fires earlier than n=39 predicted, then turns out to be premature).
