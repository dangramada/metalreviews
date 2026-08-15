# Criteria Calibration — why degree-2 alone converges the additive model

Read-only diagnostic, 2026-08-14, run during Brief 3 (auto-escalation signal) verification
after noticing accuracy climbs unusually fast from degree-2 answers alone — both in Dan's
real 12-August data (`criteria-calibration-ranking-stability-analysis.md`: n=9 already at
0.7228 accuracy) and in every live/synthetic auto-escalation trial that session, none of
which ever needed to escalate past degree 2 before the Brief 3 signal fired. See
`criteria-calibration-auto-escalation-signal.md` for the auto-escalation work this
investigation grew out of.

## The question

Is the fast climb explained by the specific benchmark data (`RANKING_TEST_SET`,
`computeScoreSpreadAccuracy`'s sample pool) happening to be structurally "easy" — resolvable
by single-axis monotonicity/dominance alone, needing no real cross-criterion trade-off
information — or is something else going on?

## Finding 1: the benchmarks are NOT dominance-heavy

Classified every pair in both benchmarks as dominance (one profile weakly ahead on every
criterion touched — resolvable with zero learned trade-off information) or trade-off (some
criteria favor one side, some the other — genuinely needs learned relative weights):

| Benchmark | Pairs | Dominance | Trade-off |
|---|---:|---:|---:|
| `RANKING_TEST_SET` (13 real albums) | 78 | 14 (18%) | **64 (82%)** |
| `computeScoreSpreadAccuracy`'s sample pool | 105 | 9 (9%) | **96 (91%)** |

Both benchmarks are overwhelmingly genuine trade-off pairs. The "this benchmark is
structurally easy" hypothesis is not supported by the data — if anything it's the reverse.

## Finding 2: trade-off pairs converge fast too, not just the easy ones

Replayed Dan's real 70-answer sequence (his actual `user_calibration_answers`, in order)
through the current, unmodified `solveValues`/`computeScoreSpreadAccuracy`, tracking the two
pair groups' average LP range-width separately. Dominance pairs start narrower at n=1 (1.00
vs. 1.98 max-width) — expected, their sign is structurally fixed before any data — but by
n=9 **both groups have collapsed to well under half their starting width** (0.39 and 0.57
respectively), in roughly matched proportion. It is not "dominance pairs converged while
trade-off pairs stayed wide" — both converge together.

## The actual mechanism: the additive model, not the benchmark

The value model has **no interaction terms between criteria** — `scoreProfile` is a plain
sum of independent per-(criterion, level) values, with monotonicity per criterion and one
global normalization constraint (`criteria-calibration-engine.md`, Part 2B — this is where
the additive-utility choice was originally made, "matching the additive value-model
convention used by pairwise-ranking tools like 1000minds").

In a purely additive model, a well-connected network of degree-2 (pairwise, 2-criteria)
comparisons determines cross-criterion trade-off weights **transitively**: comparing
{Innovation, Production} and separately {Production, Songwriting} lets the LP infer the
Innovation↔Songwriting trade-off through the shared Production axis plus the global
normalization constraint — without ever needing a direct 3-way comparison. Degree-3+
comparisons add more constraints (precision, noise-averaging against contradictory answers)
on top of this, but they are not what makes cross-criterion trade-off information
*reachable* in the first place — degree-2 alone already spans it, given adequate pairwise
coverage across criteria (which cold-start coverage guarantees by construction).

This is a third explanation, distinct from the two originally being distinguished: not "this
specific benchmark happens to be easy" (it isn't) and not "a general property of the accuracy
metric's formula" (the same phenomenon would appear under any reasonable ranking metric
applied to this model) — it is a property of the **additive value model itself**, independent
of both the benchmark and the specific metric measuring it.

## Standing limitation this implies

**If genuine interaction effects exist in Dan's real preferences — e.g. "Production quality
only matters if Songwriting is already good" — this model cannot represent them, and no
volume of degree-3+ answers can change that.** This is not a bug and not something more data
fixes: it is a direct, structural consequence of the additive-utility modeling choice made in
`criteria-calibration-engine.md`'s Part 2B. Interaction effects are a different, strictly
more expressive model family (multiplicative or explicit interaction terms), which this
solver was never built to represent.

Previously this was a theoretical caveat implicit in choosing an additive model. This
investigation makes it concrete and empirically demonstrated rather than assumed: real
degree-2 data measurably spans the full trade-off structure this model is capable of
expressing, which is the direct, positive-side confirmation of the same boundary — degree-3+
data was never going to reveal more, because there is no "more" for this model to find.

Not a call to change the model — additive utility is a deliberate, reasonable choice for this
product, shared with established pairwise-ranking tools (1000minds). Recorded here so a
future session investigating "why doesn't degree escalation ever seem to matter" or "could
the model capture X interaction" starts from this finding instead of re-deriving it.

## Related

- `criteria-calibration-auto-escalation-signal.md` — the Brief 3 work this diagnostic
  supported; includes the real-replay exact firing point (n=28, a correction to Pass 4's
  retrospective every-3rd-sample estimate of n=39).
- `criteria-calibration-ranking-stability-analysis.md` — Pass 2-4, the original evidence that
  accuracy/ranking stabilize well before degree-2 is technically "exhausted."
- `criteria-calibration-engine.md` — Part 2B, where the additive-utility/normalization-
  constraint choice was originally made.
- `deferred-work.md` — the deferred in-product explanation of calibration behavior
  (contradiction handling) is a related but distinct question from this doc's finding; that
  note is about UI communication, this one is about what the model can structurally learn.
