# Score-spread accuracy thresholds — empirical recalibration

**Status: diagnostic only, 2026-08-17. No production code changed. `accuracyTiers.ts` untouched,
per the brief. Superseded as a live decision by
`criteria-calibration-degree-tiers-and-progress.md`, which moved tier assignment off percentage
thresholds entirely (2026-08-25) — the findings below are historical context for why that move
happened, not an open recommendation awaiting approval.**

Branch: `criteria-calibration-accuracy-threshold-recalibration`.

---

**Headline: fixed thresholds do not generalize, and the reason is not that the thresholds are
badly placed. `computeScoreSpreadAccuracy` measures how DETERMINED the model is, which is a
different quantity from how CORRECT the ranking is. The two diverge in both directions across the
evidence set — oracle `#8` reaches accuracy 1.0000 with a true-rank correlation of 0.7575, while
oracle `#4` ends at accuracy 0.6883 with the best ranking in the entire set (tau 0.9240). No
cutoff can separate those cases, because the metric is not wrong about either of them.**

**All six quality bars tested produce an EMPTY usable threshold window across 12 traces. This is
the same class of result as the escalation-signal diagnostic's Candidate A — and the same
underlying cause: a quantity that behaves well WITHIN a session (median within-trace Spearman
0.876 against true rank correlation) but is not comparable ACROSS sessions.**

**Recommendation: keep 0.55 / 0.75 / 0.85 — no empirically better triple exists — and change what
the checkpoint copy CLAIMS. Details in §8.**

---

## 1. What was asked and what "correct" was taken to mean

`criteria-calibration-tiered-checkpoints.md` shipped 2026-08-17, making
`SCORE_SPREAD_MEDIUM/HIGH/VERY_HIGH_THRESHOLD` (0.55 / 0.75 / 0.85) user-facing copy at every
checkpoint rather than internal gating seen once. Those constants are provisional: 0.55 and 0.85
are round intermediate guesses, 0.75 was approximated from one real session's reported figure.

A threshold is well-calibrated if crossing it reliably corresponds to real ranking quality. The
ten synthetic oracles have known true weight vectors, so that is directly checkable rather than
merely assertable.

## 2. Method and data

**No re-simulation.** The per-round solved value vectors already exist in the two committed
post-Harris trajectory CSVs (`escalation-signal-oracle-trajectories-postharris-2026-08-16.csv`,
875 rows; `escalation-signal-real-session-trajectories-2026-08-16.csv`, 141 rows), whose
`point_vec` column carries the full 24-value solved table per round. Every quantity here is a
pure offline function of those vectors plus ground truth.

**This was verified, not assumed.** Oracle `#9` was spot-re-run from the committed generator and
matched the committed CSV **exactly** on all 30 rounds across `degree`, `accuracy`, `tier`,
`avg_coverage_width`, `max_coverage_width` and `total_slack` — zero mismatches. The `point_vec`
slot order (criterion-major, levels 2–5) was independently confirmed by checking within-criterion
monotonicity on all 945 rows: 0 violations, which a level-major layout could not produce.

**Evidence set:** the same 12 traces the escalation-signal diagnostic used — oracles `#1`–`#10`
(30–90 rounds) and real sessions `A70` / `B71`.

**Scripts** (committed, read-only, no writes):
`scripts/accuracy-threshold-recalibration-2026-08-17.ts`,
`scripts/accuracy-threshold-final-region-determinacy-2026-08-17.ts`.
**Derived data:** `accuracy-threshold-recalibration-2026-08-17.csv` (945 rows),
`accuracy-threshold-recalibration-fits-2026-08-17.json`,
`accuracy-threshold-final-region-determinacy-2026-08-17.json`.

### 2a. The evaluation pool is independent of the metric's own sample pool

Stated explicitly because the circularity risk is real: if ranking quality were measured on the
same profiles `computeScoreSpreadAccuracy` samples, accuracy would correlate with quality
trivially — the metric graded on its own homework.

|              | metric's pool (`scoreSpreadAccuracy.ts`) | this diagnostic's eval pool |
| ------------ | ---------------------------------------- | --------------------------- |
| seed         | `20260809`                               | `20260817`                  |
| size         | 15 profiles (105 pairs)                  | 200 profiles                |
| profile class| degree-**2–4 partial** (`SAMPLE_DEGREES = [2,3,4]`) | degree-**6 complete** |

The class difference makes the intersection empty **by construction**, not by luck: a complete
profile specifies all six criteria, a partial one does not, so their `profileKey`s can never
coincide. The script asserts overlap = 0 empirically anyway and would throw otherwise. Complete
profiles are also the right unit — an actual album has all six criteria.

### 2b. Quality measures

- **Kendall's tau-b** between the round's solved ordering and the *true* ordering (oracles) or
  the session's own *final* ordering (real sessions). Tau-b, not tau-a, because ties are
  pervasive — see §3b.
- **Top-10 symmetric difference** against true / final, the measure
  `criteria-calibration-ranking-stability-analysis.md` already uses.

## 3. Prerequisite: is the measuring stick itself stable?

Both quality measures are derived by scoring profiles with the solved `.point` vector — the exact
quantity Candidate B was shown to jitter under tie-break degeneracy (`deferred-work.md` item 5).
This was checked **before** any threshold fitting, because if the reference is noisy then so is
everything fitted against it.

### 3a. Tail rank-order churn

Tail = rounds after the **published** `settle` from the escalation-signal doc §3 — an external
reference computed on the 13-album set / Dan's real rated albums, deliberately not on this
diagnostic's 200-profile pool. (Defining the tail by this pool's own last top-10 change would make
zero tail churn true by construction; an earlier draft did exactly that and the result was
vacuous.)

| trace | rounds | settle (published) | settle on 200-pool | tail max top-10 symdiff vs prev round | tail median tau vs prev | tail min tau vs prev |
| ----- | ------ | ------ | ---- | --- | ------ | ------ |
| `#1 uniform` | 80 | 65 | 66 | 2 | 0.9638 | 0.9623 |
| `#2 single-dominant` | 90 | 29 | 87 | 4 | 0.9820 | 0.8016 |
| `#3 zero-weight` | 71 | 57 | 57 | 0 | 0.9894 | 0.9879 |
| `#4 linear-control` | 90 | 70 | 88 | 4 | 0.9020 | 0.7796 |
| `#5 front-loaded` | 90 | 37 | 90 | **10** | 0.8436 | 0.6218 |
| `#6 back-loaded` | 90 | 40 | 90 | 8 | 0.8490 | 0.6635 |
| `#7 near-tied` | 90 | 42 | 90 | **14** | 0.8575 | 0.6462 |
| `#8 noisy` | 83 | 36 | 37 | 4 | 0.9747 | 0.7796 |
| `#9 degree2-cap` | 30 | 24 | 29 | 8 | 0.7964 | 0.7207 |
| `#10 dan-approx` | 90 | 27 | 90 | **10** | 0.8820 | 0.6400 |
| `A70` | 70 | 39 | **69** | **10** | 0.8538 | 0.6487 |
| `B71` | 71 | 46 | 46 | 0 | 0.9825 | 0.9133 |

**The published `settle` points substantially understate when the ranking stops moving.** On 7 of
12 traces the 200-profile top-10 is still changing well past `settle`, and on `A70` it changes
until round 69 against a published settle of 39. Round-to-round tau in the "converged" tail drops
as low as 0.62.

This is not purely tie-break noise — several of those traces (`#5`, `#6`, `#7`, `#10`) hit the
90-round cap with the 200-pool top-10 still moving, i.e. genuinely not converged. But it does mean
the 13-album `settle` figures carried through the earlier docs measure convergence on a narrow
benchmark, not convergence in general.

### 3b. Is the "final" reference even determined? (the decisive check)

`.point` jitter is a property of which optimal vertex the simplex reports; the **feasible region**
is not — it depends only on the answers. So rather than asking "did the reported ranking move",
ask directly: at the final answer count, could a profile outside the reported top-10 still beat
its 10th place *anywhere* in the feasible region? Maximise `score(challenger) − score(10th)` over
the final LP region, using production's own `buildValueLP`.

| session | answers | outside profiles that could still enter the top-10 | adjacent top-10 pairs with undetermined order | verdict |
| ------- | ------- | ---- | ----- | ------- |
| `A70` | 70 | **25 / 190** | **8 / 9** | **NOT uniquely determined** |
| `B71` | 71 | 0 / 190 | 0 / 9 | uniquely determined |

**`A70`'s final top-10 is largely a pivot-rule artifact.** 25 profiles could legitimately be in it
and 8 of its 9 internal orderings are not implied by Dan's answers. Any `A70` measurement of the
form "distance from final" is therefore substantially measuring solver internals.
**`B71`'s is fully determined** and is trustworthy.

Note the consistency: `B71` reaches accuracy 1.0000 and is fully determined; `A70` peaks at 0.9204
and is not. **The accuracy metric is doing exactly what it claims** — it tracks determinacy well.
That observation is what §7 turns on.

**Consequence for everything below:** `A70`-derived quality numbers carry a large error bar and are
treated as secondary. This does not rescue any threshold — the oracle traces, which have real
ground truth and need no "final" reference at all, fail on their own.

### 3c. The true top-10 is not unique either, for most oracles

| oracle | distinct true scores across 200 profiles | profiles tied at the true top-10 boundary |
| ------ | --- | --- |
| `#1 uniform` | 15 | 7 — not unique |
| `#2 single-dominant` | 57 | 3 — not unique |
| `#3 zero-weight` | 15 | 6 — not unique |
| `#4 linear-control` | 51 | 3 — not unique |
| `#5 front-loaded` | 183 | 1 |
| `#6 back-loaded` | 167 | 1 |
| `#7 near-tied` | 126 | 2 — not unique |
| `#8 noisy` | 15 | 7 — not unique |
| `#9 degree2-cap` | 15 | 7 — not unique |
| `#10 dan-approx` | 188 | 1 |

Symmetric ground truths (uniform weights, linear shape) produce massively tied true orderings —
`#1` has only 15 distinct scores across 200 profiles. **`top10-symdiff-vs-true` is therefore
unreliable on 7 of 10 oracles**, since which profiles occupy the true top-10 is itself
tie-break luck. Kendall's tau-b handles ties correctly and is the primary measure throughout;
the symdiff-based bars are reported for completeness and should be read with this caveat.

## 4. Threshold fitting

For each quality bar, per trace: `durableRound` = first round from which the bar is met and never
subsequently lost; `minSafeT` = smallest cutoff whose first crossing lands at or after
`durableRound` (a cutoff crossing earlier is a **false positive** — the same rule the
escalation-signal diagnostic used); `maxFiringT` = largest cutoff that fires within the trace at
all. A usable window requires `max(minSafeT) ≤ min(maxFiringT)` across traces.

| bar | tier | traces reaching bar | traces with no safe T | safe-T intersection | fires-everywhere upper bound | **usable window** |
| --- | ---- | --- | --- | --- | --- | --- |
| tau ≥ 0.80 | Medium | 7/12 | 0 | [0.920, 1.0] | 0.685 | **EMPTY** |
| tau ≥ 0.90 | High | 4/12 | 1 (`#7`) | — | — | **EMPTY** |
| tau ≥ 0.95 | VeryHigh | 2/12 | 1 (`B71`) | — | — | **EMPTY** |
| symdiff ≤ 4 | Medium | 8/12 | 1 (`#6`) | — | — | **EMPTY** |
| symdiff ≤ 2 | High | 4/12 | 0 | [0.920, 1.0] | 0.685 | **EMPTY** |
| symdiff = 0 | VeryHigh | 3/12 | 0 | [0.925, 1.0] | 0.920 | **EMPTY** |

**Six bars, six empty windows.** The gaps are not near-misses: on the Medium bar, the smallest
cutoff that is safe everywhere is 0.920, while the largest that fires on every bar-reaching trace
is 0.685 — a chasm, not a rounding error.

The single cleanest illustration, both at the currently-shipped High constant of 0.75:

- **`#1 uniform` crosses High at answer 5**, with tau 0.7686 — and its ranking does not settle
  until round 65.
- **`#4 linear-control` never crosses High in 90 answers**, and ends with tau 0.9240 — the best
  true-rank correlation of any oracle.

No cutoff orders those two traces correctly.

## 5. Within-session vs across-session — the diagnosis

| trace | Spearman(accuracy, tau vs true) | Spearman(accuracy, tau vs final) |
| ----- | ------ | ------ |
| `#1 uniform` | 0.580 | 0.818 |
| `#2 single-dominant` | 0.876 | 0.933 |
| `#3 zero-weight` | 0.758 | 0.835 |
| `#4 linear-control` | 0.896 | 0.907 |
| `#5 front-loaded` | 0.939 | 0.900 |
| `#6 back-loaded` | 0.614 | 0.896 |
| `#7 near-tied` | 0.936 | 0.938 |
| `#8 noisy` | **−0.158** | 0.680 |
| `#9 degree2-cap` | **−0.075** | 0.733 |
| `#10 dan-approx` | 0.939 | 0.956 |
| `A70` | n/a | 0.921 |
| `B71` | n/a | 0.968 |

**Median within-trace Spearman against true rank correlation: 0.876.** Within a single session,
rising accuracy really does mean an improving ranking — on 8 of 10 oracles, strongly. The two
negatives are `#8 noisy` and `#9 degree2-cap`, both explained in §6.

Pooled across all 804 oracle rounds, Spearman falls to 0.728, and the level-comparison failures in
§4 are worse than that number suggests: correlation over pooled rounds still credits the
within-session trend that dominates the sample.

**So the metric carries a good within-session progress signal and a poor across-session level
signal.** That is precisely Candidate A1's failure mode restated
(`criteria-calibration-escalation-signal-candidates.md` §5: "a single global constant cannot be
right, because the quantity is not comparable across users") — reached here independently, via
ground truth rather than via `settle`.

## 6. The ceiling oracles (brief task 4)

The three oracles that never cross current-High, with what their rankings are actually worth:

| oracle | max accuracy | tau vs true at that point | top-10 symdiff vs true | reading |
| ------ | ------------ | ---- | --- | ------- |
| `#2 single-dominant` | 0.7311 | 0.6718 | 4 | ceiling is **honest** — ranking genuinely poor |
| `#4 linear-control` | 0.6883 | **0.9240** | 2 | ceiling **understates** — best ranking in the set |
| `#5 front-loaded` | 0.6223 | 0.7489 | 8 | intermediate |

**Would recalibration change whether they cross?** No. Letting all three reach High requires
High ≤ 0.62. At that level `#1 uniform`, `#8 noisy` and `#9` cross within 5–9 answers, at tau
0.65–0.77 — the checkpoint would fire before the user has meaningfully calibrated anything. The
ceiling is a property of these preference shapes, not of threshold placement, and moving the
threshold trades one failure for a worse one.

**Is this a limitation in `computeScoreSpreadAccuracy` itself?** Flagging this explicitly, as the
brief asks, because it is the bigger finding and does not reduce to a number:

The metric measures **determinacy** — how much the score difference between profiles can still
vary across the feasible region. It does not measure, and structurally cannot measure,
**correctness**. The two come apart in both directions:

- **Determined but wrong.** `#8 noisy` reaches accuracy **1.0000** — the region has collapsed to a
  point — with tau vs true of only 0.7575. Its 12% random answer flips pin the model to a precise
  but wrong place. Accuracy is not lying; the answers were. This is also why `#8`'s within-trace
  correlation against *true* rank is negative (−0.158) while against its *own final* ranking it is
  +0.680: it converges cleanly, to the wrong target.
- **Undetermined but currently ranking well.** `#4` ends at 0.6883 with tau 0.9240. The wide region
  means many other points are equally consistent with the answers and would rank differently — so
  the good tau is partly a lucky vertex, and the low accuracy is a correct warning, not an error.

`#9 degree2-cap`'s negative correlation is a third variant: capped at degree 2, it reaches accuracy
0.7948 while its true ranking needs degree-3+ information it was never allowed to gather.

**This is not a defect to be fixed by re-tuning.** No metric computed from the answer log alone can
detect that a user answered inconsistently against their own true preferences, because the log is
all the evidence there is. It is a limit on what any accuracy number can promise — which is a
statement about the checkpoint copy, not about the constant.

## 7. Are 0.55 / 0.75 / 0.85 defensible? (brief task 5)

Quality actually obtained at each currently-shipped constant, measured at the crossing round:

| constant | crosses on | tau vs true at crossing (oracles): min / median / max | earliest crossing |
| -------- | ---------- | ---- | ---- |
| Medium 0.55 | 12/12 traces | 0.350 / 0.632 / 0.799 | round **5** (`#1`, `#3`, `#8`, `#9`) |
| High 0.75 | 9/12 traces | 0.582 / 0.716 / 0.812 | round **5** (`#1`, `#9`) |
| VeryHigh 0.85 | 7/12 traces | 0.695 / 0.840 / 0.893 | round **35** (`#1`, `#8`) |

Three things follow.

1. **The ordering is meaningful.** Median tau rises 0.632 → 0.716 → 0.840 across the three tiers.
   A higher tier does, on median, mean a better ranking. The tiers are not noise.
2. **They are too aggressive at the bottom.** Medium and High can both be reached at **answer 5**,
   and Medium's worst case is tau 0.350 — a near-random ranking labelled "Medium accuracy". For
   uniform-ish preference shapes the metric saturates almost immediately, because a handful of
   answers genuinely does pin a symmetric model.
3. **No better triple exists.** §4 establishes that raising them does not fix (2) without making
   the tiers unreachable for the shapes that need them most. Every candidate triple is a different
   trade, not an improvement.

**Verdict: defensible as an ordinal progress indicator, not defensible as a guarantee.** The
numbers themselves are as good as any alternative on this evidence. What is not supportable is a
claim that crossing High means the ranking is trustworthy.

## 8. Recommendation

**Do not change `accuracyTiers.ts`.** No empirically better triple exists, and changing the numbers
without changing the claim would move the problem rather than address it. `accuracyTiers.ts` is
untouched on this branch.

**Do change what the checkpoints claim, and add a floor.** Two concrete proposals, both needing
Dan's decision — neither implemented:

- **A floor on Medium/High of roughly 15–20 answers.** The "Medium at answer 5" case is the one
  clearly indefensible behaviour found, and it is a *count* problem, not a *threshold* problem —
  so it wants a count fix. Cheap, and it removes the worst false positive (tau 0.350 shown as
  Medium) without disturbing any trace that crosses later.
- **Copy that describes determinacy, not correctness.** "Your answers now pin down the model
  precisely" is defensible at any tier; "your ranking is accurate" is not, per `#8`. The existing
  design's insistence (`criteria-calibration-tiered-checkpoints.md` §4) that the checkpoint's
  subject *is* the tier and makes no ranking claim is exactly right and should be extended into the
  user-visible wording.

Also worth recording in `deferred-work.md`: **the metric cannot detect inconsistent answering**
(§6). A separate consistency measure — `totalSlack` is already computed and already in the CSVs —
would catch the `#8` case that accuracy structurally cannot. Not scoped here.

## 9. Data gaps

Carrying forward the escalation-signal diagnostic's four gaps, all still applicable, plus three
specific to this pass:

1. **`A70`'s final ranking is not uniquely determined** (§3b): 25 challengers, 8/9 internal orders
   undecided. Every `A70` quality number here has a wide error bar. `B71` is clean.
2. **The true top-10 is not unique on 7 of 10 oracles** (§3c), so the three symdiff-based bars are
   weaker evidence than the tau-based ones. The conclusion does not rest on them — the tau bars
   fail independently.
3. **Four oracles hit the 90-round cap still moving** (`#5`, `#6`, `#7`, `#10` — 200-pool top-10
   changing at the final round), so their `durableRound` values are lower bounds. This makes the
   fitting *more* generous to thresholds, not less: a later true durable round would only widen the
   false-positive gaps in §4.
4. **`#10 dan-approximation`'s ground truth is itself a solved 33-answer session**, inheriting that
   session's known level-value flatness. Its tau figures are sound; its symdiff figures inherit the
   §3c caveat.
5. Unchanged from before: two real traces, one user, one account; oracles answer perfectly
   consistently except `#8`; `settle` is solver-dependent; and no measurement here reaches the
   thing that actually matters to a user — whether the weights rank *their real albums* well —
   because a first-time calibrating user has no rated albums to check against.
