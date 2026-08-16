# Auto-escalation signal — candidate replacements for the RANKING_TEST_SET top-10 stop signal

**Status: diagnostic only, 2026-08-16. No code changed. No threshold chosen. This is input to a
design decision, not a decision.**

**Headline: both candidates as briefed fail. Candidate A (coverage width) has no single
threshold that works across the evidence set at any R; Candidate B (weight-vector stability) is
worse and is structurally unsound — its converged-tail jitter is the same order of magnitude as
its still-learning movement on 5 of 11 traces, including the primary real session. Neither is
ready to replace the incumbent. Section 7 sketches the direction that is still open.**

---

## 1. Why this was asked

Brief 3's auto-escalation stop signal (`rankingStabilitySignal.ts`, `REQUIRED_ANSWER_SPAN = 12`)
fires when the top-10 of `RANKING_TEST_SET` — 13 hardcoded albumIds frozen from Dan's own ratings
— stops changing for 12 real answers. That mechanism cannot work for anyone but Dan, and not
because of a scoping bug: Criteria Calibration is gated to run _before_ a user has rated
anything, so no first-calibration user can ever have a populated benchmark set. On an empty
ratings map the top-10 comparison degrades to a vacuous always-true match (the `computeTop10Set`
null-guard now blocks that specific failure, but the signal is left with nothing to measure).
See `criteria-calibration-duration-based-window-fix.md`.

So: is there a stop signal derivable purely from the solver's own state, needing no external
rated-album data? Two candidates were briefed:

- **Candidate A — coverage width.** `solveValues` already computes an independent min/max range
  per `(criterion, level)`. Track `avg_coverage_width` / `max_coverage_width`; fire when they
  stay below a threshold (A1), or stop shrinking (A2), for R consecutive real answers.
- **Candidate B — weight-vector stability.** Track the solved `.point` vector across all
  `(criterion, level)` pairs. Fire when `‖p(n) − p(n−R)‖` stays below ε for R consecutive real
  answers (L2 and max-abs both tested).

---

## 2. Method and data

Everything below was regenerated **post-Harris-fix** (`980c887`). The previously committed
`synthetic-oracle-trajectories-2026-08-16.csv` predates that fix by ~7 hours and was not reused.

**Evidence set — 12 traces:**

| trace      | source                                                                                                                                                                                                   | rounds |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `A70`      | first real session, 2026-08-10→12, replayed from `docs/decisions/backups/pre-reset-dan-account-2026-08-15.json` (those rows were deleted by the 2026-08-15 reset; the backup is the only surviving copy) | 70     |
| `B71`      | second real session, 2026-08-15, replayed read-only from live `user_calibration_answers`                                                                                                                 | 71     |
| `#1`–`#10` | the ten synthetic oracles from `scripts/synthetic-calibration-oracles-2026-08-16.ts`, re-run with per-round `.point` vectors emitted                                                                     | 30–90  |

Both replays run one `solveValues` per real answer through unmodified production code, and
compute the incumbent signal alongside the candidates from the _same_ solve — so all three are
measured on one identical trajectory, not three separate runs.

**Committed evidence:**

- `escalation-signal-real-session-trajectories-2026-08-16.csv` — 141 rows, both real sessions.
- `escalation-signal-oracle-trajectories-postharris-2026-08-16.csv` — 875 rows, all 10 oracles.

Both add three columns the original oracle CSV lacked: `point_vec` (24 values = 6 criteria ×
levels 2–5, fixed slot order, space-separated), the solved `top10`, and for oracles
`matches_true_top10`.

**Reproduction.** The two replay scripts and the analysis script live only in this session's
scratchpad — not committed, per the brief's no-code-changes scope. The oracle script is a
six-hunk diff over the committed generator: extend the `rankingStabilitySignal` import with
`toFlatWeights`/`computeTop10Set`; add `pointVec`/`solvedTop10`/`matchesTrueTop10` to
`RoundRecord`; build `pointVec` next to the existing `avgWidth`/`maxWidth` computation; add a
`trueTop10ForOracle(gt)` helper scoring the synthetic 13-album pool under ground-truth values
with `computeTop10Set`'s own sort order; widen the CSV header/rows; redirect the output path.
Say the word and I will commit all three scripts properly.

### Ground truth

For each trace, **`settle` = the last round at which the solved top-10 changed.** After that
round, further answers do not change the ranking the calibration exists to produce — that is
exactly what a stop signal is supposed to detect, and it is the same quantity
`last_change_answer_index` tracks in production. A candidate that fires _before_ `settle` is a
false positive of the same class as the original K=2 bug.

For the ten oracles this is checkable rather than merely observed: ground truth is hardcoded in
the generator (per-oracle `[criterion][level]` value tables), so the _true_ top-10 is computable
exactly. **9 of 10 oracles end on the correct top-10.** The exception is `#2 single-dominant`,
whose final solved top-10 does not match ground truth even at 90 answers — its `settle` is
therefore "the ranking stopped moving", not "the ranking got it right", and every `#2` row below
should be read with that caveat.

### Post-Harris shift in the ground truth itself — worth knowing

| session | settle (pre-Harris, as documented) | settle (post-Harris) | incumbent fires |
| ------- | ---------------------------------- | -------------------- | --------------- |
| `A70`   | 35                                 | **39**               | 47 → **51**     |
| `B71`   | 45                                 | **46**               | 57 → **58**     |

The Harris ratio test moved both real sessions' stability points. Nothing was wrong with the old
numbers; the solver's reported point moved, so the derived top-10 trajectory moved with it. This
is `deferred-work.md` item 5 (arbitrary pick among tied optima) showing up in a second place, and
it means **`deferred-work.md`'s "n=35" and "n=45" figures are now stale.** It also means the
incumbent signal's own firing point is not invariant to solver internals — a caveat that applies
to the incumbent, not just to the candidates.

The Harris fix also visibly changed the oracle runs: `#8 noisy` previously crashed at round 44
and now runs to natural coverage exhaustion at 83, and `#9` reaches coverage-complete at 30
rounds instead of 49.

---

## 3. Baseline — how the incumbent actually performs

| trace                          | rounds | settle | incumbent fires | gap | final top-10 correct |
| ------------------------------ | ------ | ------ | --------------- | --- | -------------------- |
| `A70`                          | 70     | 39     | 51              | +12 | —                    |
| `B71`                          | 71     | 46     | 58              | +12 | —                    |
| `#1 uniform`                   | 80     | 65     | 77              | +12 | yes                  |
| `#2 single-dominant`           | 90     | 29     | **never**       | —   | **no**               |
| `#3 zero-weight-criterion`     | 71     | 57     | 69              | +12 | yes                  |
| `#4 linear-control`            | 90     | 70     | **never**       | —   | yes                  |
| `#5 front-loaded`              | 90     | 37     | **never**       | —   | yes                  |
| `#6 back-loaded`               | 90     | 40     | 83              | +43 | yes                  |
| `#7 near-tied`                 | 90     | 42     | 65              | +23 | yes                  |
| `#8 noisy`                     | 83     | 36     | 48              | +12 | yes                  |
| `#9 short-session-degree2-cap` | 30     | 24     | **never**       | —   | yes                  |
| `#10 dan-approximation`        | 90     | 27     | 59              | +32 | yes                  |

**Zero false positives across all 12 traces** — it never fires before the ranking settles. Where
it fires promptly it fires at exactly `settle + 12`, by construction. Where the gap exceeds 12
(`#6`, `#7`, `#10`) the tier gate delayed eligibility. It never fires on 4 of 10 oracles.

That is the bar: _conservative, never wrong, sometimes silent._ Any replacement has to at least
match the "never wrong" half, because a false positive cuts a user's calibration short at a point
where their weights are still moving.

---

## 4. Candidate B first — the degeneracy check, which is decisive

The brief asked specifically whether Candidate B's distance metric stays elevated after real
learning has stopped. It does. This is not buried in a chart:

**Per-round step distance ‖p(n) − p(n−1)‖, split at `settle` (L2):**

| trace                      | still-learning median | converged-tail median | tail p90 | tail max  | tail/learn ratio |
| -------------------------- | --------------------- | --------------------- | -------- | --------- | ---------------- |
| `A70`                      | 0.328                 | 0.091                 | 0.212    | **0.271** | **0.28**         |
| `B71`                      | 0.207                 | 0.008                 | 0.037    | 0.052     | 0.04             |
| `#1 uniform`               | 0.236                 | 0.000                 | 0.000    | 0.000     | 0.00             |
| `#2 single-dominant`       | 0.372                 | 0.000                 | 0.078    | 0.149     | 0.00             |
| `#3 zero-weight-criterion` | 0.101                 | 0.000                 | 0.000    | 0.000     | 0.00             |
| `#4 linear-control`        | 0.188                 | 0.082                 | 0.140    | 0.198     | **0.44**         |
| `#5 front-loaded`          | 0.274                 | 0.107                 | 0.181    | **0.294** | **0.39**         |
| `#6 back-loaded`           | 0.289                 | 0.097                 | 0.203    | 0.241     | **0.34**         |
| `#7 near-tied`             | 0.280                 | 0.103                 | 0.203    | 0.271     | **0.37**         |
| `#8 noisy`                 | 0.167                 | 0.000                 | 0.000    | 0.250     | 0.00             |
| `#9 degree2-cap`           | 0.236                 | **0.289**             | 0.408    | 0.408     | **1.22**         |
| `#10 dan-approximation`    | 0.289                 | 0.091                 | 0.152    | 0.295     | **0.31**         |

On 6 traces the converged-tail movement is 28–44% of still-learning movement, and on `#9` the
weight vector moves **more** after the ranking settles than before (ratio 1.22 L2, 1.00 max-abs)
while its coverage width barely shrinks at all over the same span (0.1250 → 0.1215). `#9` is the
clean demonstration that this is not just "learning continues after the top-10 settles": there
the feasible region is essentially static and the point is simply being re-picked among tied
optima, exactly as `deferred-work.md` item 5 predicts.

Some of the tail movement elsewhere _is_ genuine — `A70`'s average coverage width still shrinks
0.153 → 0.085 across its tail, so real constraints are still arriving. But the signal cannot tell
the two apart, and that is the whole problem: **Candidate B measures a quantity that moves for
reasons unrelated to whether the user has told us enough.**

**The firing rule's own window distance confirms it.** `d₁₂(n) = ‖p(n) − p(n−12)‖`, comparing
windows entirely inside the learning phase against windows entirely inside the converged tail:

| trace | learning median | learning **min** | tail median | tail **max** | separated? |
| ----- | --------------- | ---------------- | ----------- | ------------ | ---------- |
| `A70` | 0.408           | 0.204            | 0.141       | 0.244        | **no**     |
| `B71` | 0.358           | 0.047            | 0.029       | 0.047        | yes        |
| `#1`  | 0.300           | 0.000            | 0.000       | 0.000        | yes        |
| `#2`  | 0.500           | 0.289            | 0.076       | 0.223        | yes        |
| `#3`  | 0.289           | 0.000            | 0.000       | 0.000        | yes        |
| `#4`  | 0.275           | 0.117            | 0.142       | 0.159        | **no**     |
| `#5`  | 0.408           | 0.249            | 0.153       | 0.263        | **no**     |
| `#6`  | 0.395           | 0.185            | 0.126       | 0.230        | **no**     |
| `#7`  | 0.395           | 0.219            | 0.102       | 0.225        | **no**     |
| `#8`  | 0.343           | 0.236            | 0.000       | 0.001        | yes        |
| `#10` | 0.433           | 0.323            | 0.114       | 0.245        | yes        |

"Separated" means max(tail) < min(learning) — i.e. _some_ ε cleanly divides them. **On 5 of 11
traces, including `A70`, there is no such ε: the tail's noisiest window is noisier than the
learning phase's quietest.** Candidate B can still be made to fire late enough on those traces
(the R-consecutive-rounds requirement suppresses isolated dips), but only with zero margin, by
luck of where the dips fall.

The R-window formulation adds a second, independent defect: `d_R` is small whenever the point
_wanders and returns_, not only when it stops. Across the converged tails, max `d₁₂` is
consistently ~0.8–1.5× the max single-step distance — the vector routinely travels much further
than its 12-round net displacement suggests.

**Verdict on B: unusable as briefed, regardless of ε.** Not "needs a better threshold" — the
quantity itself does not carry the signal.

---

## 5. Candidate A

### A2 (stop-shrinking) — dead on arrival

Fires absurdly early on **every trace at every R and every δ tested** (1e-4, 1e-3, 1e-2): rounds
8–21 against settles of 24–70. Coverage width is a staircase — it holds flat for long stretches
between degree escalations, and "flat for R rounds" hits during the first plateau every time. At
R=3 it fires at round 12 on `A70` (settle 39) and round 9 on `B71` (settle 46). No δ rescues it,
because the plateaus are _exactly_ flat. Discard this variant.

### A1 (absolute threshold) — the plausible one, but no shippable constant

`avg_coverage_width ≤ T` sustained R rounds. Selected results:

| R   | T    | `A70` (settle 39) | `B71` (settle 46)    |
| --- | ---- | ----------------- | -------------------- |
| 6   | 0.05 | never             | 53 ✓ (+7)            |
| 6   | 0.10 | never             | 48 ✓ (+2)            |
| 6   | 0.15 | 49 ✓ (+10)        | **19 — early by 27** |
| 12  | 0.05 | never             | 59 ✓ (+13)           |
| 12  | 0.15 | 55 ✓ (+16)        | **25 — early by 21** |

The two real sessions want thresholds an order of magnitude apart. `B71`'s coverage collapses to
~0 by the end (avgW 0.00002); `A70`'s bottoms out at 0.085 — it never gets under 0.10 at all. A
threshold tight enough not to false-fire on `B71` never fires on `A70`; one loose enough to fire
on `A70` false-fires on `B71` by 21–27 answers.

Across the whole evidence set, computed over a fine log-spaced threshold grid, the set of
thresholds that fire at-or-after `settle`:

| R   | all 12 traces | real sessions only | real + oracles where the incumbent also fires |
| --- | ------------- | ------------------ | --------------------------------------------- |
| 3   | **empty**     | empty              | **empty**                                     |
| 6   | **empty**     | [0.108, 0.108]     | **empty**                                     |
| 9   | **empty**     | empty              | **empty**                                     |
| 12  | **empty**     | empty              | **empty**                                     |

The one non-empty cell is a single grid point on two traces — not a threshold, a coincidence.
`max_coverage_width` behaves the same way, slightly worse.

The reason is structural. Coverage width is measured in units of the _value scale_, but how small
it can get depends on how much of the model the elicitation has pinned down, which depends on
degree, on how many criteria carry near-zero weight, and on the shape of the user's preferences.
`#5 front-loaded` ends at avgW 0.370 and `#2 single-dominant` at 0.228 — both with settled,
correct rankings. Any absolute threshold below those values can never fire for those users; any
threshold above them fires almost immediately for users like `B71`. **A single global constant
cannot be right, because the quantity is not comparable across users.**

For completeness: **Candidate A is invariant to the tie-break degeneracy** that sinks Candidate B
— min/max ranges are properties of the feasible region, not of which optimal vertex the pivot
rule reports. Its failure is a different and more tractable one (no common scale), which is why
Section 7 puts the remaining hope here rather than in B.

---

## 6. Verdict

|                                  | false positives                                 | never-fires | shippable single constant?                  |
| -------------------------------- | ----------------------------------------------- | ----------- | ------------------------------------------- |
| **Incumbent** (top-10, R=12)     | **0 / 12**                                      | 4 / 12      | yes (but needs data no first-time user has) |
| **Candidate A1** (avg width ≤ T) | unavoidable at every T that fires at all        | —           | **no**                                      |
| **Candidate A2** (plateau)       | 12 / 12                                         | —           | **no**                                      |
| **Candidate B** (‖Δp‖ ≤ ε)       | avoidable only with zero margin, on 5/11 traces | many        | **no**                                      |

**Neither candidate is ready to replace the incumbent.** If a decision were forced today, the
answer is "keep the incumbent and accept that it degrades to a bare answer-count timer for
non-Dan users" — which is bad, but is at least conservative, whereas both candidates cut
calibration short for some users.

**If one of the two is to be developed further, it is A**, on three grounds: it is immune to the
tie-break degeneracy; its failure mode is a _scale_ problem rather than a _signal_ problem; and
its per-trace viable windows, while non-intersecting, are wide and well-behaved where they exist.
B's are narrow, erratic, and on `A70` have no margin at all.

---

## 7. What is still open (not scoped, not recommended yet)

The finding that A fails on _scale_ rather than on _signal_ points at a normalised variant that
was not in the brief and was not tested here: coverage width relative to each trace's own
starting width, or relative to the width of the still-unpinned part of the model — a ratio rather
than an absolute. That would sidestep the incomparability in Section 5 while keeping the
degeneracy-immunity. It is untested and might fail for its own reasons; it is named here so the
next session does not have to rediscover the motivation.

A second, cheaper direction, also untested: `#4`, `#5` and `#2` all end with high accuracy and a
settled ranking while the incumbent never fires. A signal built on the _accuracy_ trajectory
plateauing, gated on a minimum answer count, may be worth a pass — the raw data for it is already
in both committed CSVs.

## 8. Data gaps that limit confidence

1. **Two real sessions, one user, one account.** Both real traces are Dan's. The synthetic
   oracles broaden the shape coverage but are generated by an oracle that answers perfectly
   consistently (except `#8`), which no human does. `A70` and `B71` disagree with each other by
   an order of magnitude on A1's threshold; there is no way to tell from n=2 which is typical.
2. **The ground truth is itself solver-dependent.** `settle` moved by +4 / +1 across the Harris
   fix. Any threshold calibrated against it inherits that sensitivity until item 5
   (deterministic tie-breaking) is fixed. Fixing item 5 first would make every number in this
   document more durable — arguably it should precede a threshold decision, not follow it.
3. **`#2 single-dominant` never reaches the correct top-10**, so its `settle` measures the wrong
   thing; and four oracles hit the 90-round cap without exhausting, so their tails are truncated
   rather than complete.
4. **Neither candidate was tested against the thing that actually matters to a user** — whether
   the weights are _good enough to rank their albums well_ — because for a first-time user there
   are no rated albums to check against. That is the same wall the incumbent hit, and no
   solver-internal metric can climb it; it can only be approximated.
