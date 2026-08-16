# Criteria Calibration: adaptive/automatic degree escalation — design checkpoint

**IMPLEMENTED 2026-08-10** on top of this checkpoint's "Current state of the design"
section below — see `deferred-work.md`'s "Automatic degree escalation" entry for the
shipped summary and verification. This doc's own reasoning chain (below) is kept as the
historical record of how the coverage-based rule was arrived at; nothing here was
retroactively edited to match the implementation.

This doc exists so that reasoning chain survives between sessions — it was written as a
checkpoint, not a finalized design ready to build, but the design it landed on was then
built as-is.

## 2026-08-09 — Reasoning chain, in order

**1. Root problem (already documented elsewhere — see `deferred-work.md`'s "Degree-2
refinement candidates rarely differentiate levels 2–5" entry).** `nextAction()`'s
`degree-exhausted` check (`elicitationDriver.ts`'s `MAX_AMBIGUOUS_GAP = 0.05` gap
check) never fires on Dan's real 33-answer/6-criteria session because degree-2
candidate gaps stay ~0 by construction — the solver's own `.point` values plateau
across levels 2-5 within each criterion. The user gets stuck being offered degree-2
questions indefinitely; the "Add more detail" escalation UI never appears.

**2. Product direction (Dan, explicit).** The system must decide on its own when to
escalate — the user should not need to understand gaps, degrees, or accuracy
mechanics. Two combined goals: (a) drive toward high accuracy automatically, (b)
minimize the number of questions required to get there — efficiency, not just
eventual completion.

**3. First plateau-detection proposal — measured, then rejected.** A fixed rolling
window ("last 8 answers at this degree, total gain < 0.01") was tested against real
oracle-simulation data (`REAL_SESSION_EXPECTED_VALUES`, 5-criterion ground truth) and
against Dan's real session extended via a self-consistent pseudo-oracle into degree 3.
Result: `computeScoreSpreadAccuracy` improves in a **punctuated** pattern, not
steadily — long near-zero streaks (observed up to ~6 consecutive answers) interrupted
by sharp jumps (+0.056 at answer 47, +0.044 at answer 63 in the oracle trace). A fixed
window/threshold rule risks declaring false plateau immediately before a real jump —
concretely, gains of `0.0000, -0.0000, 0.0064` at answers 43-45 (three-in-a-row under
a 0.01 threshold) sat right before the +0.056 jump at answer 47.

Root cause of the jumps, traced: cold-start only ever compares each criterion pair's
level-1 vs level-max, so levels 2 through (max-1) stay completely **unconstrained**
until some refinement answer happens to touch one. A "jump" is an answer finally
pinning a previously-untouched middle level, not steady accumulation — consistent with
the flatness finding in point 1.

**4. Dan's correction — the key insight of this session.** A fixed number-of-answers
threshold is the wrong shape of rule: it guesses *when* a plateau probably occurred
based on past data shape, rather than directly checking *whether there is still real
information to extract*. That signal already exists in the codebase and needs no
tuning: `computeTouchCounts` (`elicitationDriver.ts`, built for candidate sampling in
the coverage-weighted-candidates branch — see `criteria-calibration-coverage-weighted-candidates.md`)
directly answers "has this `(criterion, level)` combination been probed yet or not."
The escalation rule should be built around **coverage state**, not elapsed-answer
count. In Dan's words: the right question is "is there still something to learn or
not" — not "how many answers has it been."

**5. External validation — 1000minds.** Dan shared screenshots of 1000minds' UI
(a competing PAPRIKA-method tool). It displays exactly this per-`(criterion, level)`
uncertainty directly to the user, as a "Marginal effects" table: each level's
preference value alongside its Lower/Upper bound interval, level by level. A narrow
Lower/Upper gap reads as determined; a wide gap reads as still uncertain. This is
conceptually the **same signal** this project's solver already computes
(`LevelValue.min`/`.max` in `solver.ts`) — not the Chebyshev radius (tested and
rejected the same day as a single global number, see
`criteria-calibration-score-spread-accuracy.md`'s header comment on
`scoreDiffRangeWidth`), but the same range data applied per-`(criterion, level)`,
potentially surfaced to the user directly the way 1000minds does it, rather than
collapsed into one global metric. 1000minds also displays "Accuracy: Very high — 97%
— you have answered all trade-offs involving 5 criteria," suggesting their model
reaches full confidence through criterion-pair coverage completion — external
evidence pointing the same direction as point 4: coverage-based, not
time/count-based, escalation logic.

## Current state of the design (not measured or implemented — next session's starting point)

Direction agreed: replace **both** the original gap-based `degree-exhausted` check
**and** the fixed-window plateau proposal from point 3 with a coverage-based rule
along these lines:

- Do not declare a degree exhausted/plateaued while any `(criterion, level)`
  combination relevant to that degree still has zero or low touch count (via
  `computeTouchCounts`, already built) **or** still has a wide `.min`/`.max` range
  (already computed by `solveValues`, unused for this purpose today).
- Candidate/question selection at each step should preferentially target whichever
  `(criterion, level)` combination currently has the widest uncertainty
  (`.max - .min`) or lowest touch count — pursuing "what's still unknown" directly,
  rather than a proxy like the ambiguity gap between two specific profiles
  (`rankCandidatesByAmbiguity` in `questionOrdering.ts`, unchanged today).
- This reframes escalation timing and question *selection* as two faces of the same
  underlying idea (target uncertainty directly), rather than two separately-tuned
  mechanisms (a gap threshold for escalation, an ambiguity ranking for selection) —
  worth exploring whether they unify into one coverage/uncertainty-driven engine.
  **Not decided** — flagged as the next design question, not resolved here.

## Explicitly not decided yet

- Exact rule for combining touch-count and min/max-range signals into a single
  escalation trigger — not measured.
- Whether/how this unifies with question *selection* (not just escalation timing) —
  the marginal-information-gain idea raised earlier the same day, now with a more
  concrete mechanism (target widest `.min`/`.max` range or lowest touch count) than
  when first raised, but still unexplored.
- Target accuracy tier to auto-drive toward (Dan leaning High / `SCORE_SPREAD_HIGH_THRESHOLD`
  = 0.75 in `accuracyTiers.ts`, not fixed).
- Whether escalation also means auto-asking without a manual "continue" click, or just
  removing the manual degree-bump trigger.
- What the transparent "you've exhausted what's askable, here's your real accuracy"
  UI state says concretely when the top degree plateaus below target. Dan approved the
  general shape (show real %, explain why, don't block) — exact copy/UI not designed.
- The separately-found LP infeasibility bug (`solveLP` throws "infeasible even with
  slack" after enough forced/synthetic answers — n=70 in the oracle trace, n=55 in the
  real-session-extended trace, both from this session's diagnostic) is still unfixed
  and caps how aggressively any auto-escalation design can push before the solver
  itself needs hardening. Not yet scoped as its own brief — needs one before any
  implementation that would drive sessions this deep.

## Definition of done for this pass

Documentation only — see `deferred-work.md`'s pointer entry for the one-line summary.
Nothing in `elicitationDriver.ts`, `scoreSpreadAccuracy.ts`, `solver.ts`, or
`questionOrdering.ts` changed. Next session should start from "Current state of the
design" above, not re-derive it.
