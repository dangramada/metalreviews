# Degree-tied accuracy tiers, renamed labels, segmented progress bar — Step 1 recon

**Status: RECON ONLY, 2026-08-18. No production code changed. Awaiting Dan's approval before
Step 2 (implementation).**

Branch: `criteria-calibration-degree-tiers-and-progress`, cut from `master`.

Diagnostic script: `scripts/degree-tier-recon-2026-08-18.ts` (read-only; the one Supabase call
is a `select`). Derived data: `degree-tier-recon-2026-08-18.csv`, 945 rows.

---

**Headline: the degree ladder has exactly ONE evidence-backed step in it — degree 2 → degree 3.
Beyond that, ranking quality and determinacy are both flat: across the five traces that
exhausted degrees 4, 5 and 6, tau moves by at most 0.04 non-monotonically and accuracy by at
most 0.001. A three-rung ladder can be built, but only the first rung is empirically earned; the
second (degree 3 → 4) rests on 1000minds parity and on determinacy completing at degree 4 in 2 of
5 traces, not on measured ranking gain.**

**The honest case for degree-tying is not that it predicts quality better — it doesn't. Judged as
a predictor by the recalibration report's own false-positive test, degree boundaries fail on the
same traces thresholds failed on. The case is that a degree boundary is a FACT about the answer
log ("every trade-off this model can distinguish at this level of detail has been asked"), not an
estimate of a hidden quantity — so the label can be true by construction instead of true on
average.**

**Two costs need Dan's decision before any code is written. (1) Four of twelve traces never
exhaust degree 2 within 90 answers, so their label would never leave the base rung — where
today's thresholds put three of them at Medium and one at High. (2) The tier is also persisted
and read by the album-rating soft gate, which nudges on `tier === 'none'`; degree-tying moves
that nudge from "~5–15 answers" to "28–90+ answers, sometimes never". The brief does not mention
(2).**

---

## 1. Method

**Re-simulation, not post-processing.** The committed trajectory CSVs behind the recalibration
report carry per-round solved _point_ vectors, but the per-degree coverage count the progress bar
needs is a function of per-variable feasible _ranges_, which a point vector cannot recover. So the
ten synthetic oracles were replayed against the real driver (`nextAction`, exactly as
`CriteriaCalibrationPage` calls it), with the oracle specs, ground truths, RNG seeds and
answering rule copied verbatim from `scripts/synthetic-calibration-oracles-2026-08-16.ts`. `A70`
is replayed from the committed pre-reset backup; `B71` read-only from live
`user_calibration_answers`.

**Cost control.** The committed generator calls `computeCommitState` (score-spread accuracy, ~100
LP solves) every round, which is what makes it a tens-of-minutes run. Here the per-round work is
one `solveValues`; score-spread accuracy is computed only at degree-exhaustion boundaries and each
trace's final round — the rounds where the tier decision under test actually happens. Full run:
~2 minutes.

**Reproduction check, not assumed.** Against the committed
`accuracy-threshold-recalibration-2026-08-17.csv` (945 rows, same 12 traces):

| quantity                                              | result                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| row count                                             | 945 vs 945                                                                                                       |
| per-round `degree`                                    | **0 mismatches in 945 rows**                                                                                     |
| score-spread accuracy at the 32 boundary/final rounds | **exact to all 6 decimals, 0 diff**                                                                              |
| Kendall tau                                           | max deviation 0.011, concentrated on the tied-truth oracles (`#8` 0.0109, `#2` 0.0061, `#1` 0.0054; `#5` 0.0003) |

The tau deviation is explained and expected: the recalibration report scored profiles from the
committed CSV's `point_vec` column, which is rounded to 9 decimals, against a tie epsilon of
`1e-9` — at that precision, quantization flips which pairs count as tied, and the tied-truth
oracles (`#1` has 15 distinct true scores across 200 profiles) are where that bites. This replay
solves live. `degree` and accuracy matching exactly is the stronger evidence that it is the same
experiment.

**One correction to the recalibration report's implementation, recorded rather than hidden.** Its
`kendallTauB` excludes both-tied pairs from the tie counts while still counting them in
`n0 = n(n-1)/2`, which inflates the denominator and biases the coefficient toward zero by
0.011–0.017 on these traces. This pass uses textbook tau-b as the primary measure and also emits
the published variant (`tau_published` column) so the cross-check above is exact rather than
approximate. **The bias is uniform across rounds and traces, so it changes no ordering and none of
that report's conclusions.**

## 2. Step 1a — what happens at each degree boundary

Every row where a degree was actually exhausted (or, marked `*`, where the trace hit the 90-round
cap still inside that degree). Oracle tau is against known ground truth; `A70`/`B71` tau is against
their own final ordering and is the weaker measure — the recalibration report showed `A70`'s final
top-10 is not uniquely determined, so its numbers carry a wide error bar.

| trace                | degree        | boundary at answer | accuracy                          | tau                               | covered |
| -------------------- | ------------- | ------------------ | --------------------------------- | --------------------------------- | ------- |
| `#1 uniform`         | 2             | 30                 | 0.7948                            | 0.7118                            | 24/24   |
|                      | 3             | 51                 | 0.9381                            | 0.8851                            | 24/24   |
|                      | 4             | 64                 | 0.9382                            | 0.9213                            | 24/24   |
|                      | 5             | 73                 | 0.9382                            | 0.8851                            | 24/24   |
|                      | 6             | 80                 | 0.9382                            | 0.8851                            | 24/24   |
| `#3 zero-weight`     | 2             | 34                 | 0.8025                            | 0.7238                            | 24/24   |
|                      | 3             | 49                 | 0.9143                            | 0.9058                            | 24/24   |
|                      | 4             | 59                 | 0.9335                            | 0.8809                            | 24/24   |
|                      | 5             | 66                 | 0.9335                            | 0.8762                            | 24/24   |
|                      | 6             | 71                 | 0.9335                            | 0.8809                            | 24/24   |
| `#8 noisy`           | 2             | 28                 | 0.7651                            | 0.8582                            | 24/24   |
|                      | 3             | 50                 | 0.9104                            | 0.7761                            | 24/24   |
|                      | 4             | 66                 | 1.0000                            | 0.7684                            | 24/24   |
|                      | 5             | 77                 | 1.0000                            | 0.7808                            | 24/24   |
|                      | 6             | 83                 | 1.0000                            | 0.7808                            | 24/24   |
| `#7 near-tied`       | 2             | 73                 | 0.8775                            | 0.8900                            | 24/24   |
|                      | 3             | 90\*               | 0.9113                            | 0.9148                            | 23/24   |
| `#10 dan-approx`     | 2             | 77                 | 0.8798                            | 0.7514                            | 24/24   |
|                      | 3             | 90\*               | 0.8857                            | 0.8082                            | 22/24   |
| `#9 degree2-cap`     | 2             | 30                 | 0.7948                            | 0.7118                            | 24/24   |
| `#2 single-dominant` | 2             | 90\*               | 0.7311                            | 0.6836                            | 20/24   |
| `#4 linear-control`  | 2             | 90\*               | 0.6883                            | 0.9247                            | 17/24   |
| `#5 front-loaded`    | 2             | 90\*               | 0.6223                            | 0.6863                            | 12/24   |
| `#6 back-loaded`     | 2             | 90\*               | 0.7690                            | 0.7167                            | 20/24   |
| `A70`                | 2 / 3 / 4 / 5 | 32 / 46 / 56 / 64  | 0.7677 / 0.8240 / 0.8521 / 0.8957 | 0.5844 / 0.6974 / 0.6771 / 0.8170 | 24/24   |
| `B71`                | 2 / 3         | 28 / 49            | 0.7619 / 0.9436                   | 0.7488 / 0.8996                   | 24/24   |

### 2a. Degree 2 → 3 is real; everything above it is flat

Change in tau across each boundary, on the three oracles that exhausted all five degrees:

| oracle           | d2→d3      | d3→d4  | d4→d5  | d5→d6  |
| ---------------- | ---------- | ------ | ------ | ------ |
| `#1 uniform`     | **+0.173** | +0.036 | −0.036 | 0.000  |
| `#3 zero-weight` | **+0.182** | −0.025 | −0.005 | +0.005 |
| `#8 noisy`       | −0.082     | −0.008 | +0.012 | 0.000  |

And in accuracy (determinacy — the quantity the metric actually measures):

| oracle | at d2  | d3     | d4           | d5     | d6           |
| ------ | ------ | ------ | ------------ | ------ | ------------ |
| `#1`   | 0.7948 | 0.9381 | 0.9382       | 0.9382 | 0.9382       |
| `#3`   | 0.8025 | 0.9143 | 0.9335       | 0.9335 | 0.9335       |
| `#8`   | 0.7651 | 0.9104 | 1.0000       | 1.0000 | 1.0000       |
| `B71`  | 0.7619 | 0.9436 | 1.0000 (cap) | —      | —            |
| `A70`  | 0.7677 | 0.8240 | 0.8521       | 0.8957 | 0.9204 (cap) |

**Degrees 5 and 6 change nothing measurable on any trace.** This is the same conclusion
`criteria-calibration-additive-model-degree-sufficiency.md` reached from the model's structure,
now visible in the quality numbers: an additive model has 24 free parameters and no interaction
terms, so once those are pinned, higher-degree comparisons re-state what is already known.

`#8 noisy` is the exception in the other direction and is exactly the case the recalibration
report called out (§6): it converges cleanly (accuracy 1.0000 at degree 4) to the wrong target,
because 12% of its answers are random. **No label derived from the answer log — degree or
threshold — can detect that**, because the log is all the evidence there is.

### 2b. Judged as a predictor, degree boundaries fail like thresholds did

Applying the recalibration report's own test — `durableRound` = first round from which a quality
bar holds for the rest of the trace; a signal firing earlier is a false positive:

| bar        | signal             | safe | false positive | never fires |
| ---------- | ------------------ | ---- | -------------- | ----------- |
| tau ≥ 0.80 | degree 2 exhausted | 1/10 | 5/10           | 4/10        |
| tau ≥ 0.80 | degree 3 exhausted | 1/10 | 2/10           | 7/10        |
| tau ≥ 0.85 | degree 2 exhausted | 0/10 | 6/10           | 4/10        |
| tau ≥ 0.85 | degree 3 exhausted | 1/10 | 2/10           | 7/10        |
| tau ≥ 0.90 | degree 3 exhausted | 0/10 | 3/10           | 7/10        |

**Stated plainly, as the brief asks: quality does not separate cleanly by degree either.** The
single sharpest illustration survives the change of signal intact — `#4 linear-control` has the
best true ranking in the set (tau 0.9247) and, under degree-tying, would sit on the base rung
after 90 answers, while `#8 noisy` (tau 0.7808, converged to the wrong model) would read Sharp.
The recalibration report's `#8`/`#4` inversion is not fixed by this change; it is re-expressed.

**This is not a reason to reject degree-tying, but it is a hard constraint on what the copy may
claim.** A degree boundary is not an estimator. "You have answered every trade-off this model can
distinguish at this level of detail" is true by construction at every one of the 18
`coverage-complete` boundaries observed here. "Your ranking is now accurate" is not, and must not
be implied — which is the same rule `criteria-calibration-tiered-checkpoints.md` §4 already set
for tier copy, applied to a different derivation.

### 2c. Proposed mapping

| internal tier                            | display                       | assigned when        | evidence                                                                                                                               |
| ---------------------------------------- | ----------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| _(base, currently `'insufficient'`/Low)_ | **needs Dan's pick** — see §5 | degree 2 in progress | —                                                                                                                                      |
| `medium`                                 | **Blurry**                    | degree 2 exhausted   | strong: the one real quality step, +0.17/+0.18 tau on the clean oracles, accuracy +0.11 to +0.15 on all five traces that reached it    |
| `high`                                   | **Clear**                     | degree 3 exhausted   | weak: no measured tau gain (−0.03 to +0.04); justified by 1000minds parity and by determinacy completing at degree 4 on `#8` and `B71` |
| `veryHigh`                               | **Sharp**                     | degree 4 exhausted   | none beyond `high`'s; degrees 5–6 measurably add nothing, so they get no further label                                                 |

Degrees 5 and 6 keep asking questions but produce no new label and no checkpoint — the existing
terminal-exhaustion screen still closes the session. This is a deliberate departure from the
brief's "checkpoint at every degree boundary": a checkpoint that says "still Sharp" is noise, and
§2a says that is all degrees 5 and 6 can honestly say.

**Does 6 criteria vs 1000minds' 5 move the cut points?** Not the cut points — the _cost_ of
reaching them. C(6,2) = 15 cold-start pairs vs C(5,2) = 10, and 24 free level-values vs 20. But
the dominant difference is not the criterion count at all: 1000minds' degree-2 completion is
purely combinatorial (all undominated pairs resolved by closure) and therefore bounded — Dan's
own parallel session hit it at round 27. Slant Take's `isDegreeCoverageComplete` adds an LP width
gate (`MAX_VALUE_RANGE_FOR_COVERAGE = 0.2`), which is unbounded and shape-dependent. That gate,
not the sixth criterion, is what §2d is about.

### 2d. The cost: four traces never leave the base rung

| trace                | answers | covered at cap | touched | narrow | max feasible width | today's label | proposed |
| -------------------- | ------- | -------------- | ------- | ------ | ------------------ | ------------- | -------- |
| `#2 single-dominant` | 90      | 20/24          | 24/24   | 20/24  | 0.997              | Medium        | _(base)_ |
| `#4 linear-control`  | 90      | 17/24          | 24/24   | 17/24  | 0.992              | Medium        | _(base)_ |
| `#5 front-loaded`    | 90      | 12/24          | 24/24   | 12/24  | 0.945              | Medium        | _(base)_ |
| `#6 back-loaded`     | 90      | 20/24          | 24/24   | 20/24  | 0.794              | High          | _(base)_ |

The blocker is identified precisely: **`touched` reaches 24/24 on all four; it is `narrow` that
stalls.** One or more level-values stay essentially undetermined (width up to 0.997 on a 0..1
scale) because these preference shapes never produce a comparison that constrains them. No number
of further degree-2 questions fixes it, and the driver will not escalate past a degree it has not
declared complete.

Full comparison of every trace's final label:

| trace                | answers | accuracy | today's label | proposed |
| -------------------- | ------- | -------- | ------------- | -------- |
| `#1 uniform`         | 80      | 0.938    | Very High     | Sharp    |
| `#3 zero-weight`     | 71      | 0.933    | Very High     | Sharp    |
| `#8 noisy`           | 83      | 1.000    | Very High     | Sharp    |
| `A70`                | 70      | 0.920    | Very High     | Sharp    |
| `B71`                | 71      | 1.000    | Very High     | Clear    |
| `#7 near-tied`       | 90      | 0.911    | Very High     | Blurry   |
| `#10 dan-approx`     | 90      | 0.886    | Very High     | Blurry   |
| `#9 degree2-cap`     | 30      | 0.795    | High          | Blurry   |
| `#6 back-loaded`     | 90      | 0.769    | High          | _(base)_ |
| `#2 single-dominant` | 90      | 0.731    | Medium        | _(base)_ |
| `#4 linear-control`  | 90      | 0.688    | Medium        | _(base)_ |
| `#5 front-loaded`    | 90      | 0.622    | Medium        | _(base)_ |

Degree-tying is uniformly more conservative. That is the intended direction — the recalibration
report's one clearly indefensible finding was Medium at answer 5 with tau 0.350, and the earliest
degree-2 exhaustion anywhere in this evidence set is **answer 28**, which satisfies that report's
proposed 15–20 answer floor for free, with no new constant. The price is the four traces above.

## 3. Step 1b — what the checkpoint architecture becomes

Confirmed: **under degree-tied tiers a tier can only change at a degree-exhaustion boundary**, so
the two-path firing logic collapses to one path. What that removes from
`src/CriteriaCalibrationPage.tsx` (all of it shipped 2026-08-17, all of it consequences of
threshold-crossing):

| today                                                                                            | why it exists                                                                                     | under degree-tying                                                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `acknowledgedTiers: Set<SolverAccuracyTier>` (page:209)                                          | a threshold stays crossed forever, so a standing state would re-fire every render                 | **replaced** by one `acknowledgedBoundaryDegree: number \| null`                                           |
| pre-acknowledging the resumed tier (page:366–390, doc §5)                                        | otherwise a resumed Very-High log renders a dead-end screen on load with no continuation          | **deleted** — a boundary is inherently one-time; acting on it escalates the degree and moves off it        |
| `degree2Acknowledged` + its resume seed (page:215, 230–235, doc §5b)                             | a resumed session at a degree-3+ boundary was stranded, rendering neither checkpoint nor question | **deleted** — subsumed by the single boundary flag, which fires correctly at any degree                    |
| precedence chain Very High > High > degree 2 > exhausted (page:438–471, doc §5c)                 | tier and degree-2 triggers are independent and could both hold                                    | **deleted** — at a boundary there is exactly one applicable screen, named by the degree just exhausted     |
| `tierIsSubstitutingForDegree2` and the extra settle in `handleCheckpointContinue` (page:474–476) | a substituting tier screen had to also answer the degree-2 question                               | **deleted** — no substitution exists                                                                       |
| silent auto-progression effect gated on `degree2Acknowledged` (page:785–799)                     | kept degree escalation silent between checkpoints                                                 | **kept, re-gated** on the boundary flag; now also carries degrees 5 and 6, which get no checkpoint per §2c |

Net: four pieces of session-local state and two resume-seeding effects become one number. The
checkpoint derivation becomes, in full: _at a boundary the user has not yet acted on, show the
screen for the degree just exhausted; if that degree has no successor, show the terminal screen._

**One correctness point that does NOT go away.** Acknowledgment stays session-local (doc §6, §8) —
persisting it would re-add `user_calibration_status` columns and re-open the write-race surface
that pass closed. The boundary flag is self-healing on reload exactly as `degree2Acknowledged` was:
the checkpoint simply shows again at the same boundary.

**And one the brief does not mention, which needs Dan's decision before Step 2.** The tier is not
only displayed in the calibration flow — `persistence.ts`'s `computeTier` writes it to
`user_calibration_status.tier`, and `useCalibrationGate` reads it on `AlbumRatingPage` (score
confidence label) and `FavoritesPage`, where `tier === 'none'` triggers the rate-album soft-gate
nudge. Under degree-tying, `'none'` stops meaning "barely started" (~5–15 answers today, since
every one of the 12 traces crosses 0.55 early) and starts meaning "has not exhausted degree 2" —
28 to 90+ answers, and never for the four traces in §2d. Three options, none of them free:

1. **Migrate everything to degree-tied.** Consistent labels everywhere; the soft-gate nudge fires
   for far longer, including forever for some users.
2. **Keep the persisted tier threshold-based, degree-tie only the calibration display.** No gate
   regression, but two live definitions of "tier" and the album page can read "High" while
   calibration reads "Blurry" — the exact contradiction the 2026-08-09 progress-ring fix existed
   to remove.
3. **Migrate the label, change the gate's condition** from `tier === 'none'` to "no calibration
   weights exist at all", which is what the nudge is actually about (it never blocked the page —
   see `album-rating-soft-gate`). Recommended, and the only option where both surfaces stay
   honest, but it is scope the brief did not ask for.

Also note `persistence.ts` cannot see "am I at a boundary" from the answer log alone. Deriving the
tier as `maxAnsweredDegree − 2` lags the checkpoint by one answer (a user sitting exactly on the
degree-3 boundary is told "Clear" while the DB still says `medium`). The fix is to thread the
completed-degree count from the page into `upsertWeightsAndStatus`, and to put the derivation in
one shared helper used by page, checkpoint and persistence.

## 4. Step 1c — the progress bar, confirmed and one correction

Confirmed as specified, with measurements:

- **`totalProgress = (degree − 2) * 20 + (coverageCount / 24) * 20`** — and the segment seam is
  exactly continuous, not approximately: at all 18 `coverage-complete` boundaries observed,
  `covered` is **24/24**, so the last frame of degree _d_ reads `(d−2)*20 + 20 = (d−1)*20`, which
  is the first frame of degree _d+1_. No jump, no overlap.
- **Monotone clamp: keep it, but it is defensive only.** Across all 945 rounds there are **zero**
  within-degree decreases in the raw count. The clamp costs nothing and the slack-tolerant LP means
  widening is not provably impossible, so it stays — but the write-up should not claim it fixes an
  observed dip, because there isn't one in this evidence set.
- **`pool.length === 0` fallback to 24/24:** correct, and rarer than expected — **all 18 oracle
  boundaries fired with reason `coverage-complete`; `pool-empty` did not occur once in 945
  rounds.** The fallback is a real path (it returns before solving, so no values exist to count)
  but it is untested by this evidence.
- **Uneven pacing, documented as intentional:** degree 2 is 34–100% of a session but worth 20% of
  the bar (`#1` 38%, `#3` 48%, `#8` 34%, `A70` 46%, `B71` 39%, `#7` 81%, `#10` 86%, four traces
  100%). Later degrees are progressively cheaper — `#1` spends 30 answers on segment 1 and 7 on
  segment 5. This is honest: it reflects that the first degree carries most of the information.
- **Displays from session start, existing gauge component, no new visual design** — unchanged.

### 4a. The correction: the discrete count freezes for long stretches

`covered` is a step function of a _threshold_ on feasible width, so it only moves when a variable
crosses `MAX_VALUE_RANGE_FOR_COVERAGE = 0.2`. Measured freeze lengths (consecutive answers with no
bar movement at all):

| trace                | longest freeze, discrete | freeze at the trace's end, discrete | continuous variant (§4b) |
| -------------------- | ------------------------ | ----------------------------------- | ------------------------ |
| `#2 single-dominant` | 64                       | **64**                              | 18 / tail 1              |
| `#5 front-loaded`    | 62                       | **62**                              | 7 / tail 2               |
| `#6 back-loaded`     | 28                       | **28**                              | 6 / tail 3               |
| `#3 zero-weight`     | 27                       | 0                                   | 10 / tail 0              |
| `#4 linear-control`  | 22                       | 2                                   | 7 / tail 0               |
| `#7 near-tied`       | 14                       | 0                                   | 5 / tail 0               |
| `#8 noisy`           | 13                       | 0                                   | 13 / tail 0              |
| `#10 dan-approx`     | 12                       | 3                                   | 5 / tail 3               |
| `B71`                | 11                       | 0                                   | 11 / tail 0              |
| `#1 uniform`         | 10                       | 0                                   | 10 / tail 0              |
| `#9 degree2-cap`     | 10                       | 0                                   | 10 / tail 0              |
| `A70`                | 7                        | 0                                   | 7 / tail 0               |

Three traces end with the bar frozen for 28–64 consecutive answers — and those are the same traces
whose label would also never move (§2d). A user on `#5 front-loaded` would answer 62 questions with
a frozen label _and_ a frozen bar at 10%, with only the accuracy percentage still moving. Even the
well-behaved traces have 7–27-answer freezes, mostly early in degree 2.

### 4b. Recommended fix, same gate and same constant

Read the gate continuously instead of as a step. Per free variable:

```
touched ? clamp01((1 − width) / (1 − MAX_VALUE_RANGE_FOR_COVERAGE)) : 0
```

averaged over the 24. A variable exactly at the gate's own width contributes 1, a fully
undetermined one contributes 0, and **the mean reaches 1.0 exactly when `isDegreeCoverageComplete`
would return true** — same gate, same constant, no new threshold, identical segment seams. Measured
above: the worst freeze drops from 64 answers to 18, every end-of-trace freeze drops to ≤3, and it
is monotone (0 decreases in 945 rounds), so the clamp story is unchanged.

This is a recommendation, not a unilateral change — the brief specifies the discrete count, and
§4a is the evidence for revisiting it. Either version is implementable in Step 2.

## 5. Open decisions for Dan

1. **The mapping in §2c** — Blurry at degree 2, Clear at degree 3, Sharp at degree 4, with
   degrees 5–6 silent. Or: Sharp reserved for terminal exhaustion (nothing left to ask at any
   degree), which is reachable at answers 71–83 on the clean traces and is a fact rather than an
   estimate, at the cost of being much more expensive.
2. **The base-rung display label.** The brief names three; a fourth is needed for "degree 2 in
   progress", where `AccuracyStatus` currently shows "Low". In the Blurry/Clear/Sharp optical
   metaphor, "Unfocused" fits; "Low" also still works and changes less.
3. **The persisted-tier / soft-gate question in §3** — options 1, 2 or 3. Recommended: 3.
4. **Discrete vs continuous within-degree fill** (§4a/§4b). Recommended: continuous.
5. **Whether §2d's four shapes are acceptable.** If not, the lever is
   `MAX_VALUE_RANGE_FOR_COVERAGE`, which is solver-adjacent, flagged PROVISIONAL in
   `elicitationDriver.ts`, and was deliberately re-checked and left alone by the Harris pass. Out
   of scope here; naming it as the only lever.

## 6. Data gaps

Carrying forward the recalibration report's gaps, all still applicable, plus two specific to this
pass:

1. **Four traces hit the 90-round cap still inside degree 2**, so their "never exhausts" is a
   lower bound, not a proof. What is certain is that 90 answers is not enough for them; whether
   130 would be is unmeasured.
2. **`A70`'s quality numbers remain unreliable** (its final ranking is not uniquely determined —
   25 challengers could still enter its top-10), and `B71` is the only real session with a
   trustworthy reference. Two real traces, one user, one account.
3. Only three traces exhausted all five degrees, so §2a's "degrees 5–6 add nothing" rests on
   `#1`, `#3` and `#8` — with `#8` being the deliberately-noisy one.
