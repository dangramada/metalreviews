# Auto-escalation signal — candidate replacements for the RANKING_TEST_SET top-10 stop signal

**Status: diagnostic only, 2026-08-16. No code changed. No threshold chosen. This is input to a
design decision, not a decision.**

**Headline: both candidates as briefed fail. Candidate A (coverage width) has no single
threshold that works across the evidence set at any R; Candidate B (weight-vector stability) is
worse and is structurally unsound — its converged-tail jitter is the same order of magnitude as
its still-learning movement on 5 of 11 traces, including the primary real session. Neither is
ready to replace the incumbent. Section 7 sketches the direction that is still open.**

> **Superseded in part by the second pass (§9–§14, appended later the same day).** §7's two
> named follow-ups were tested and both fail; the mathematical-signal direction is closed, not
> open. The current recommendation is **Candidate C** (§12) — drop detection, show an explicit
> checkpoint at each existing degree boundary. Read §12–§13 for the standing recommendation;
> §1–§8 remain accurate as the record of why A and B were rejected.
>
> **RESOLVED 2026-08-17 — a variant of Candidate C shipped. See
> `criteria-calibration-tiered-checkpoints.md`.** This doc is now the historical record of why
> no mathematical signal was viable; it is no longer awaiting a decision. What shipped differs
> from §12's Candidate C in one respect: checkpoints are gated on accuracy TIERS (the degree-2
> boundary, then High, then Very High, plus a neutral exhaustion fallback) rather than on every
> degree boundary. §12's open sub-questions are all answered there. Note §14's caveat 5 about
> tier thresholds being provisional still applies to the shipped design.

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

---

# Second pass — 2026-08-16 (later the same day)

**Scope: the two follow-ups §7 named but did not test (A2 normalised ratio, A3 accuracy
plateau), plus Candidate C, a structurally different alternative that drops the detection
problem entirely.**

**Headline: A2 and A3 both fail, in the same way and for a sharper reason than A1 did — there
is no threshold at any R that fires at-or-after settle across the evidence set, and A2's
normalisation anchor is itself missing or mis-placed on 6 of 10 oracles. That closes out the
mathematical-signal direction as briefed: four variants tested across two passes, none viable.
Candidate C, by contrast, costs a measured two extra screens per real session and deletes
~800 lines plus the project's one open correctness risk. The comparison is no longer close.**

No new data was generated for A2/A3 — both derive entirely from columns already in the two
committed trajectory CSVs (`avg_coverage_width`, `accuracy`, `tier`). Ground truth, trace set
and the "fires before settle = false positive" rule are unchanged from the first pass.

## 9. Candidate A2 — normalised coverage-width ratio

`ratio(n) = avgCoverageWidth(n) / avgCoverageWidth(at tier-eligibility)`, where tier-eligibility
is the same gate `advanceStabilityWindow` already uses (`tier !== 'insufficient'`). Fire when the
ratio holds below T for R consecutive answers (A2), or stops decreasing (A2b).

### The anchor is the problem, before any threshold is chosen

| trace                      | settle | tier-eligible at n    | avgW there | avgW at end | ratio at end |
| -------------------------- | ------ | --------------------- | ---------- | ----------- | ------------ |
| `A70`                      | 39     | 26                    | 0.156      | 0.085       | 0.544        |
| `B71`                      | 46     | 14                    | 0.125      | 0.00002     | 0.0002       |
| `#1 uniform`               | 65     | 5                     | 0.125      | 0.042       | 0.333        |
| `#2 single-dominant`       | 29     | **never**             | —          | —           | —            |
| `#3 zero-weight-criterion` | 57     | 30                    | 0.160      | 0.042       | 0.260        |
| `#4 linear-control`        | 70     | **never**             | —          | —           | —            |
| `#5 front-loaded`          | 37     | **never**             | —          | —           | —            |
| `#6 back-loaded`           | 40     | **71** (after settle) | 0.183      | 0.170       | 0.934        |
| `#7 near-tied`             | 42     | **53** (after settle) | 0.220      | 0.087       | 0.396        |
| `#8 noisy`                 | 36     | 9                     | 0.125      | 0.000       | 0.000        |
| `#9 degree2-cap`           | 24     | 5                     | 0.125      | 0.122       | 0.972        |
| `#10 dan-approximation`    | 27     | **47** (after settle) | 0.188      | 0.109       | 0.576        |

**On 6 of 10 oracles the denominator is either never defined (3 traces never reach a
tier-eligible checkpoint at all) or is first set _after_ the ranking has already settled
(3 traces).** Normalising against tier-eligibility inherits the tier gate's own unreliability —
the very unreliability Pass 2 established when it rejected tier-crossing as a signal. A ratio
anchored to a point that arrives at n=71 for a session that settled at n=40 is not measuring
convergence.

**The brief asked specifically whether shape differences reintroduce the problem in relative
terms. They do, and worse than in absolute terms:** `#5 front-loaded` never becomes eligible, so
it has no ratio at all, while `#6 back-loaded` becomes eligible only at n=71 and ends at ratio
0.934 — barely moved. The front/back-loaded asymmetry doesn't just distort the scale, it decides
whether the metric exists.

### Firing points (R=12 shown; R=3/6/9 differ only by the expected shift)

| trace            | settle | T=0.9        | T=0.75       | T=0.5        | T=0.35       | T=0.25     |
| ---------------- | ------ | ------------ | ------------ | ------------ | ------------ | ---------- |
| `A70`            | 39     | 68 ✓ (+29)   | 70 ✓ (+31)   | never        | never        | never      |
| `B71`            | 46     | 52 ✓ (+6)    | 54 ✓ (+8)    | 57 ✓ (+11)   | 62 ✓ (+16)   | 65 ✓ (+19) |
| `#1 uniform`     | 65     | **52 (−13)** | **52 (−13)** | **52 (−13)** | **52 (−13)** | never      |
| `#3 zero-weight` | 57     | **51 (−6)**  | **51 (−6)**  | **56 (−1)**  | 69 ✓ (+12)   | never      |
| `#7 near-tied`   | 42     | 68 ✓ (+26)   | 72 ✓ (+30)   | never        | never        | never      |
| `#8 noisy`       | 36     | 49 ✓ (+13)   | 60 ✓ (+24)   | 60 ✓ (+24)   | 64 ✓ (+28)   | 64 ✓ (+28) |
| `#10 dan-approx` | 27     | 73 ✓ (+46)   | 88 ✓ (+61)   | never        | never        | never      |

(`#2`, `#4`, `#5`, `#6`, `#9` omitted — no usable ratio, never fires at any T.)

`A70` still can't get below 0.5 of its own starting width; `B71` reaches 0.0002. **Normalisation
narrows the cross-session gap from ~4000× (absolute) to ~2700× (relative) — it does not close
it.** The two real sessions remain incompatible.

### A2b (ratio stops decreasing) — same failure as A1's plateau variant

Fires at rounds 8–36 against settles of 24–70 on most traces at every δ tested. The staircase
shape survives normalisation intact, because dividing by a constant doesn't change where the
flat stretches are.

## 10. Candidate A3 — accuracy-value plateau

Same R-window logic on the raw `accuracy` value: step form (`|acc(n) − acc(n−1)| ≤ δ`) and
window form (`|acc(n) − acc(n−R)| ≤ δ`).

**The step form is the worst-performing candidate tested across either pass.** At R=3 it fires
EARLY on all 12 traces at every δ from 1e-4 to 5e-2 — rounds 8–23 against settles of 24–70.
At R=12 it is still early on 10 of 12. The mechanism is the one Pass 2 already documented for
tier-crossing, in continuous form: the score-spread accuracy metric saturates and then sits
flat for long stretches. `#1 uniform` reaches 0.7563 at round 5 and holds it, unchanged to six
decimal places, for the next ten rounds — while its ranking does not settle until round 65.
A plateau in accuracy is not evidence of a settled ranking; it is evidence that the metric has
stopped being informative.

The window form (A3b) is marginally less catastrophic but still fires early on the majority of
traces at every δ, and where it does fire late it does so erratically (`#4 linear-control`:
never at δ=1e-4, then round 80 at δ=5e-3, then round 24 at δ=1e-2).

## 11. Viable-threshold windows — the summary that closes the direction

Thresholds that fire at-or-after settle, computed over a fine log grid, intersected across
traces:

| R    | family              | all 12 traces | incumbent-fires subset | real sessions only                   |
| ---- | ------------------- | ------------- | ---------------------- | ------------------------------------ |
| 3    | A2 ratio            | **empty**     | **empty**              | **empty**                            |
| 6    | A2 ratio            | **empty**     | **empty**              | [0.75, 0.75]                         |
| 9    | A2 ratio            | **empty**     | **empty**              | [0.75, 0.75]                         |
| 12   | A2 ratio            | **empty**     | **empty**              | [0.75, 0.75]                         |
| 3–12 | A2b ratio plateau   | **empty**     | **empty**              | ~empty (two grid points, R=3/6 only) |
| 3–12 | A3 accuracy step    | **empty**     | **empty**              | **empty**                            |
| 3–12 | A3b accuracy window | **empty**     | **empty**              | **empty**                            |

The single non-empty cell is one grid point (T≈0.75) on two same-user traces — the same
coincidence-shaped result the first pass found for A1, not a constant.

**Verdict on A2 and A3: neither beats the "unusable" conclusion. Both confirm it.** Across two
passes, four variants (absolute width, width plateau, normalised ratio, accuracy plateau) plus
weight-vector stability have now been tested at four R values against 12 traces; none produces
a single constant that is safe across the evidence set. The failures are not near-misses.

## 12. Candidate C — explicit checkpoint instead of detection

### What `fired` actually controls today

Worth stating precisely, because it is narrower than the surrounding machinery suggests.
`isDegreeCoverageComplete` already decides _when a checkpoint exists_ — it is what makes
`nextAction` return `degree-exhausted`. `fired` decides only _whether the user sees that
checkpoint_: while `!fired`, a `useLayoutEffect` in `CriteriaCalibrationPage.tsx:696` escalates
the degree automatically before paint; once `fired`, the same checkpoint renders with an
"Add more detail" button and the user chooses.

So Candidate C is not "build a new trigger." It is "stop suppressing the trigger that already
exists" — plus the better interstitial copy from the 1000minds pattern (plain-language tier
explanation, "See results" / "Answer more questions").

### Is `isDegreeCoverageComplete` sufficient on its own?

**Yes, structurally — it is already the sole trigger.** It needs no threshold tuning (its one
constant, `MAX_VALUE_RANGE_FOR_COVERAGE = 0.2`, was re-checked and left unchanged during the
Harris merge), it is degree-scoped and correct since the 2026-08-11 scoping fix, and it fires
deterministically from solver state with no benchmark data.

One honest limitation, which applies equally to the current design: **4 of 12 traces never reach
a degree boundary at all** (`#2`, `#4`, `#5`, `#9` — coverage never completes at degree 2 within
the round cap). Those sessions get no checkpoint under either design. They are not left without
an exit — the Exit affordance (`handleExit`) is always available — but neither the incumbent nor
C offers them a _considered_ stopping point. Notably, these are the same four traces where the
incumbent never fires either, so C loses nothing here; it just doesn't gain anything.

### What convenience is actually lost — measured, not estimated

Degree-boundary checkpoints per trace, split by whether the current design auto-skips them
(before `fired`) or shows them (after):

| trace                    | boundaries at n | auto-skipped today | shown today | shown under C |
| ------------------------ | --------------- | ------------------ | ----------- | ------------- |
| `A70`                    | 33, 47, 57, 65  | 2                  | 2           | 4             |
| `B71`                    | 29, 50          | 2                  | 0           | 2             |
| `#1 uniform`             | 31, 52, 65, 74  | 4                  | 0           | 4             |
| `#3 zero-weight`         | 35, 50, 60, 67  | 4                  | 0           | 4             |
| `#7 near-tied`           | 74              | 0                  | 1           | 1             |
| `#8 noisy`               | 29, 51, 67, 78  | 1                  | 3           | 4             |
| `#10 dan-approx`         | 78              | 0                  | 1           | 1             |
| `#2`,`#4`,`#5`,`#6`,`#9` | none            | 0                  | 0           | 0             |

**On Dan's two real sessions, Candidate C costs exactly two extra interstitial screens each** —
at n=33 and n=47 for `A70`, at n=29 and n=50 for `B71`. Across all 12 traces the worst case is
four. That is the entire measured value of Brief 3's auto-escalation: it suppresses a median of
2 screens (max 4) across a 70-answer session.

**And that value accrues to exactly one account.** Per the 2026-08-16 correction now recorded in
`criteria-calibration-duration-based-window-fix.md`, `computeTop10Set`'s null-guard means `fired`
stays permanently `false` for the entire session on any non-Dan account — so every other user is
already auto-escalated through every degree boundary, to degree 6, with no checkpoint ever
offered. Candidate C does not take convenience away from those users; it gives them the two-to-
four checkpoints they currently never see. The convenience being weighed here is Dan's alone,
and it is two screens.

Against that, `A70` currently sees 2 interstitials anyway and `#8 noisy` sees 3 — so the
_variance_ in how many checkpoints a user meets is currently driven by where a threshold-free
signal happens to fire, which is itself unpredictable. C makes the count deterministic: one per
degree boundary, always.

### What wiring this removes

- `rankingStabilitySignal.ts` (273 lines), `rankingTestSet.ts` (63), `useRankingTestSetRatings.ts`
  (76), and `rankingStabilitySignal.test.ts` (464) — ~876 lines deleted outright.
- The `stabilityWindow` half of `commitComputation.ts` and its `StabilityWindowContext`
  threading, plus the `windowHistory` undo/redo plumbing in `CriteriaCalibrationPage.tsx`
  (21 references).
- Seven `user_calibration_status` columns: `last_eligible_top10`, `last_change_answer_index`,
  `fired`, the three `previous_*` mirrors, and `last_commit_changed_window` — plus the RPC
  parameters carrying them.

**And it moots the project's one open correctness risk.** The un-awaited-write race is scoped
_exactly_ to `last_eligible_top10` / `last_change_answer_index` and the `previous_` triple —
`supabase/user_calibration_status-add-answer-count-guard.sql:37-38` says so explicitly, the
guard was deliberately not extended to them. Deleting those columns deletes the race. That is a
better outcome than fixing it: the correctness risk that has been carried forward in
`CLAUDE.md` and the cluster summary every session stops existing rather than becoming
one-more-guarded-column.

It also retires the per-user rework the `RANKING_TEST_SET` deferred-work entry has been holding
open for multi-user launch, and removes one of the two consumers of the implicit-RLS-scoping
sub-note filed under it.

## 13. Structural comparison — C against the best of A2/A3

The best mathematical candidate is A2 at R∈{6,9,12}, T≈0.75, and it is not close to viable.

|                                           | A2 (best variant)                                          | C (explicit checkpoint)                                                  |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| Needs a tuned constant                    | yes — and none exists that is safe across 12 traces        | no                                                                       |
| Works for a first-time user               | in principle                                               | yes                                                                      |
| Anchor/trigger defined for every session  | **no** — undefined on 3 traces, set after settle on 3 more | trigger exists on 8 of 12; the other 4 have no boundary under any design |
| False positives                           | unavoidable at every T that fires at all                   | not applicable — makes no stability claim                                |
| Sensitive to solver tie-breaking (item 5) | inherits it via the tier gate and via `settle` calibration | no                                                                       |
| Code added / removed                      | adds a metric + threshold + window state                   | removes ~876 lines and 7 DB columns                                      |
| Open write-race risk                      | unchanged                                                  | **eliminated**                                                           |
| Cost to the user                          | none if it worked                                          | 2 extra screens per real session (max 4)                                 |
| Product precedent                         | none                                                       | 1000minds ships exactly this                                             |

The asymmetry is stark enough that I would not spend another pass on the signal family without
a specific new idea. A2/A3 were the two ideas §7 had; both are now tested and dead.

**Recommendation, for Dan's decision:** take Candidate C. It replaces an unsolved estimation
problem with a UI decision the product already knows how to make, at a measured cost of two
screens, and it retires a correctness risk and a multi-user blocker as a side effect. The one
thing it does not do is help sessions that never complete degree-2 coverage — but nothing
currently proposed does, and that is a separate question about `MAX_VALUE_RANGE_FOR_COVERAGE`
and degree-2 pool exhaustion, not about stop signals.

**What C still needs before implementation** (not scoped here): the interstitial's copy and
tier explanation, whether "See results" should be available at the _first_ degree boundary or
only once Medium tier is reached, and what happens on resume after a user chose "See results"
(today no stopped-state is persisted — `handleExit` only halts locally).

## 14. Data gaps, second pass

The first pass's four gaps all still apply. Two additions specific to this pass:

5. **A2's anchor analysis depends on the tier thresholds**, which are themselves provisional
   (`SCORE_SPREAD_*_THRESHOLD`, flagged in `deferred-work.md`). A different High threshold
   would move which traces are "never eligible" — though not, on inspection, enough to rescue
   A2: `#5 front-loaded` peaks at accuracy 0.63, far below any plausible High.
6. **Candidate C's cost is measured on 12 traces, only 2 of them real and both from one user.**
   "Two extra screens" is a solid number for Dan's own sessions and an estimate for anyone
   else. The synthetic oracles suggest 0–4 is the realistic range, but they answer perfectly
   consistently, which likely makes their coverage complete faster than a real user's would.
