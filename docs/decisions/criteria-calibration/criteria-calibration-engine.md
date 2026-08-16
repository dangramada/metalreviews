# Criteria Calibration engine — parts 1–4 (preference graph, closure, solver, elicitation driver)

Branch: `criteria-calibration-engine`. Scope: pure algorithm/logic only — no React, no
Supabase, no UI wiring. Separate from and independent of `criteria-calibration-ui` (the
markup/styling pass on its own branch, still mock-data only). Discovery docs for this
feature (`aoty-ranking--*.md`) live only in Project knowledge on claude.ai, not in this
repo — intentional, not an oversight, and this doc is written to be self-contained.

## What was built

**Part 1 — preference graph + same-degree transitive closure**
(`src/lib/criteria-calibration/preferenceGraph.ts`). A "profile" is a partial mapping of
criterion index → level (1-based), generic over N criteria and M levels per criterion —
nothing hardcodes the current 6×5 shape. `PreferenceGraph` holds one union-find + directed
edge graph per degree (how many criteria vary on a given comparison card). Inserting an
answer either merges two profiles into an equivalence class or adds a directed edge between
class representatives; `isImplied(A, B)` checks the closure so already-determined pairs can
be skipped during elicitation. Cross-degree closure (a degree-3 answer implying something
at degree-2, or vice versa) is explicitly out of scope for this pass — documented in the
module header, not a silent gap.

**Contradiction handling** (same file). `insertAnswer` still throws on a contradictory cycle
— unchanged behavior, unchanged tests. Its contradiction check is now factored into a
shared private helper (`detectContradiction`), additionally exposed as a non-throwing
`wouldContradict(profileA, profileB, result)` predicate. No clone-and-catch: `wouldContradict`
reads the same union-find/reachability state without mutating it.

**Orchestration layer** (`src/lib/criteria-calibration/calibrationSession.ts`).
`CalibrationSession.recordAnswer(...)` checks `wouldContradict` before inserting: a
contradictory answer is routed around the strict graph (not inserted there) but is always
appended to a separate full answer log regardless. That full log — not the graph — is what
feeds the solver, since absorbing inconsistency statistically is the solver's job, not the
graph's.

**Part 2A — question-ordering heuristic** (`src/lib/criteria-calibration/questionOrdering.ts`).
Closest-estimate ambiguity: ranks candidate pairs by how close the solver's current point
estimates are, tie-broken by combined feasible-range width. Chosen over highest-transitive-
impact because it uses the solver's live output directly rather than optimizing question
count in isolation (which part 1's closure already does for free via `isImplied`).

**Part 2B — slack-tolerant value solver** (`src/lib/criteria-calibration/solver.ts` +
`simplex.ts`). A from-scratch dense Big-M simplex LP engine (no LP library existed in
`package.json`, none warranted at this problem size) fits a per-(criterion, level) value
from the full raw answer log: monotonicity constraints per criterion, a per-answer slack
variable so a contradictory/noisy answer relaxes its own constraint instead of blocking the
model, and a normalization constraint (best-level values across all criteria sum to 1,
matching the additive value-model convention used by pairwise-ranking tools like 1000minds).
Phase 1 minimizes total slack; phase 2 solves the min/max feasible range for every value,
reported as a midpoint point estimate plus range.

**Part 2C — accuracy tiers** (`src/lib/criteria-calibration/accuracyTiers.ts`). Medium is
exact per spec: every degree-2 pair resolved, directly or via graph closure, checkable
without the solver. High/Very High — see the dedicated section below.

## The under-determination finding

Fed all 31 real answers from Dan's actual 5-criterion historical export through the solver.
Result: **zero contradictions** — every answer inserts cleanly into the strict graph, and
the export's own reference values independently satisfy all 31 answers with margin to
spare. The reference table is confirmed to be a fully feasible point of the LP (monotonic,
normalized, satisfies every answer).

But it is not the *only* feasible point, and the solver does not reproduce it to the ±0.001
tolerance originally hoped for. Two different, equally principled tie-break rules tried
during development — independent-axis midpoint-of-range (what shipped) vs.
maximize-the-minimum-adjacent-level-gap — landed **more than 5% apart** on some values
despite both being fully feasible for the same 31 constraints. This is a property of the
problem, not a bug: 31 raw pairwise answers under-determine a 20-free-variable LP (5
criteria × 4 free levels each). 1000minds' exact published numbers evidently come from
some further, undisclosed internal tie-break that isn't reachable by reverse-engineering the
constraint structure alone.

## The ranking-stability result — why the under-determination doesn't matter in practice

Ran the solver's own derived values (not the reference table) through all 19 albums' real
level assignments from the same export, and compared the resulting rank order to the real
one:

- **Top 10 unchanged**, rank 1 and ranks 14–19 exactly stable.
- Exactly two adjacent single-position swaps, both between real scores under 0.02 apart
  (Sumac/Moor Mother ↔ Gazpacho, real gap 0.0055; In Mourning ↔ Blackbride, real gap
  0.0163) — the kind of reordering expected from any noise, not evidence of a broken model.
- Max per-album score deviation from the reference ~0.040, average ~0.016 — several
  individual deviations sit at or above a "noisier than it looks" ±0.03 line, but none of
  those particular albums actually changed rank, because the solver's deviations point in a
  broadly consistent direction across mid/high-scoring albums.

Net: the exact per-level values won't match any reference table exactly (see above), but
for the purpose this engine actually serves — ranking albums against each other — the
under-determination doesn't move the needle. This is the evidence that matters more than the
±0.001 target.

## Accuracy thresholds — explicitly not validated

`HIGH_ACCURACY_THRESHOLD = 0.92` and `VERY_HIGH_ACCURACY_THRESHOLD = 0.97` in
`accuracyTiers.ts`. The *metric* they're built on — `1 − average(max − min)` across every
solved value's feasible range, normalized to the same 0–1 scale the normalization
constraint already puts everything on — is principled and reusable regardless of problem
size. The *two cutoff numbers* are not independently derived: 0.97 was picked to match the
one number Dan reported for his real 31-answer session ("~97% accuracy"), and 0.92 is a
round intermediate guess below that with no independent derivation. **Needs a second real
calibration session (on the current 6-criteria/5-level production model, not the 5-criterion
historical export) before these are treated as settled** — right now they're calibrated to
a single anecdote on a different criteria count.

## Part 4 finding — `computeSolverAccuracy` is blind to real ranking improvement from degree-3+ answers

Part 4 added the elicitation driver (`elicitationDriver.ts`) that actually runs a session:
covers all C(N,2) degree-2 criteria pairs via a cold-start rule, then asks whatever's most
ambiguous at increasing degree, never auto-escalating. Validating it against the oracle
simulation (the real 5-criterion value table used as ground truth, same as part 2) surfaced
a problem with the accuracy metric itself, not with the driver.

**The gap.** Across the simulation's three natural milestones — Q10 (degree-2 coverage just
completed), Q43 (end of the degree-3 phase), Q49 (end of the degree-4 phase) —
`computeSolverAccuracy` barely moves: 0.680102 → 0.680445 → 0.693412. Taken at face value,
that reads as "degree-3 questions accomplish almost nothing." But checking the thing this
engine actually exists to produce — the derived values' effect on the real 19-album ranking
— tells a different story: total rank displacement against the real order drops **44 → 40 →
26** over the same three milestones, and the top-10 set only becomes fully correct at Q49.
Degree-3 answers all insert with **zero slack** (fully consistent, not noise being absorbed),
so they're doing genuine, non-redundant work on the model — work the metric doesn't register.

**Why, structurally.** `computeSolverAccuracy` averages independent per-(criterion, level)
feasible-range widths (each solved via its own separate min/max LP). A degree-3 comparison's
LP constraint ties together three free variables in one inequality — it constrains a
*combination* of those values, not necessarily any single one of them tightly. That
information is real and it's exactly what narrows the ranking, but independently
re-optimizing each axis in isolation doesn't reliably reveal it. This is a structural property
of an axis-based range metric, not a bug: it was verified directly, not inferred — per-value
range widths were compared individually (all 20 values) between Q10 and Q43, and every one
narrowed by a uniformly tiny amount (0.0001–0.0007 out of 0.2–0.5-wide ranges), ruling out
"a few values are converging sharply and the average is hiding it." The flatness is real and
metric-wide, while the ranking-displacement improvement is also real and metric-invisible.

**Ruled out, not just assumed.** Both plausible driver-side explanations were checked and
rejected before concluding this is a metric problem:
- Degree-3 answers being wasted as slack/noise — no: `perAnswerSlack` is exactly 0 for all 16
  degree-3 answers in the simulation.
- `questionOrdering.ts`'s ambiguity ranking or the degree≥3 candidate generation choosing
  uninformative comparisons — no: the ranking measurably improves (44→40→26 displacement),
  which is the opposite of what "uninformative candidates" would produce.

**What this means for brief 5.** Gating any UI state on `HIGH_ACCURACY_THRESHOLD` /
`VERY_HIGH_ACCURACY_THRESHOLD` as currently defined would understate real progress to a
user, specifically past initial degree-2 coverage — a user who's meaningfully improved their
ranking accuracy via degree-3/4 answers would see the accuracy number barely budge. **This is
a blocker for brief 5's High/Very High gate specifically.** It does NOT affect the Medium
tier: `isMediumTierReached` is purely graph-based (every degree-2 pair resolved via direct
answer or closure), doesn't touch the solver or this metric at all, and is exactly as solid
as it was in part 2.

**Not resolved here.** No replacement metric is proposed in this document — that's flagged as
its own open decision, needing a dedicated design pass rather than being settled inside this
investigation. The displacement measure used above (comparing derived-value rankings against
a known order) is one plausible direction — it's what actually caught this problem — but
whether it, or something else rank-sensitive, is the right permanent replacement deserves its
own scrutiny. No code changed this session; this was investigation only, run via ad hoc
scripts against the existing `elicitationDriver.ts` and `solveValues`, not new test files.

## Not built / not touched

- No cross-degree closure (part 1 scope boundary, still holds).
- No UI wiring — `CriteriaCalibrationPage.tsx` and `src/components/criteria-calibration/`
  (on the separate `criteria-calibration-ui` branch) are untouched; that screen still runs
  on mock data.
- No Supabase schema or persistence — this is pure in-memory logic, same as part 1.
- No dominance-based constraint enrichment (comparing profiles never directly answered via
  logical dominance) — considered during the under-determination investigation, found to
  add nothing beyond what monotonicity already implies for same-criteria comparisons; true
  cross-criterion dominance would need its own answer, so wasn't pursued further.

## Files

`src/lib/criteria-calibration/`: `preferenceGraph.ts`, `fixtures.ts` (synthetic part-1
fixture + the real 31-answer/19-album part-2 acceptance fixture), `calibrationSession.ts`,
`questionOrdering.ts`, `solver.ts`, `simplex.ts`, `accuracyTiers.ts`, `elicitationDriver.ts`
(part 4). Tests in `src/__tests__/`: `preferenceGraph.test.ts`, `calibrationSession.test.ts`,
`solver.test.ts`, `questionOrdering.test.ts`, `accuracyTiers.test.ts`,
`elicitationDriver.test.ts`. Debug script: `scripts/debug-preference-graph.ts`.
