# Criteria Calibration — ranking-stability analysis (evidentiary, for Brief 3)

Test session ran 2026-08-10 through 2026-08-12, using the temporary
`maybeLogSnapshot`/`rankingStabilityLog.ts` instrument (now removed — see
`criteria-calibration-degree-scoped-coverage-fix.md`,
`criteria-calibration-partial-tie-fix.md`, `criteria-calibration-dantzig-fix.md` for the fixes
that shipped mid-session, and the cleanup note at the bottom of this doc). Purpose: observe how
the `RANKING_TEST_SET` (13 fixed albums, `rankingTestSet.ts`) rank/score snapshot evolves
against accuracy as real answers land, to evaluate whether any of the Medium/High/Very-High
accuracy tiers is a safe auto-stop point for Brief 3's auto-escalation design. 71 answers total
across the session (single account, single user — see caveat at the end).

Raw snapshots: `docs/backups/ranking-stability-log-{2026-08-10,2026-08-11,2026-08-12}.jsonl`
(gitignored local data, one JSON line every 3rd committed answer: `answerCount`, `accuracy`,
and the full 13-album `{albumId, score, rank}` ranking).

## Pass 1: original live-logged data — the n=57 anomaly

The 2026-08-11 log segment shows `accuracy = 0` at `answerCount = 57` — a real recorded value,
not a logging bug. This is the same live silent failure documented in
`criteria-calibration-dantzig-fix.md`: `simplex.ts`'s Bland's-rule pivoting was producing a
failed Chebyshev-center solve that degraded to an all-zero point estimate instead of throwing,
and `computeScoreSpreadAccuracy` propagated that into a bogus 0% accuracy reading. Every rank
in that snapshot is meaningless (computed from all-zero weights), which made the raw
n=27→n=57 trend impossible to read cleanly — the data has a discontinuity sitting right in the
middle of the High-tier range.

## Pass 2: Dantzig-corrected re-analysis

The 2026-08-12 fix (`criteria-calibration-dantzig-fix.md`) switched `simplex.ts` to Dantzig
pivoting and added a post-solve feasibility guard, closing the all-zero-weights failure mode.
The session continued from `answerCount = 60` onward on the fixed solver — those snapshots
(60, 63, 66, 69) are clean. Re-examining the full 24-snapshot trace (08-10 through 08-12,
duplicate-answerCount rows deduped) with the fix in place **resolves the n=57 anomaly** (it's
explained, not repeated) but **does not change the underlying conclusion**: the ranking keeps
moving well past every tier boundary. The oscillation is real signal, not solver noise from
the pre-fix crash.

### Moved-vs-final table

For each snapshot, "moved vs. final" = how many of the 13 albums have a different rank than
they do in the session's last snapshot (`answerCount = 69`, `accuracy = 0.9204`, all 13
albums stable — i.e. this is the closest thing to "true" ranking the session produced).
Tier boundaries: High = score-spread accuracy >= 0.75 (`SCORE_SPREAD_HIGH_THRESHOLD`), Very
High = accuracy >= 0.85 (`SCORE_SPREAD_VERY_HIGH_THRESHOLD`), both in `accuracyTiers.ts`.
Medium is not accuracy-gated (`mediumReached` is a degree-2 coverage boolean, not logged
per-snapshot in this instrument), so it isn't broken out as its own row here — but every
snapshot below the first High crossing was at most Medium.

| answerCount | accuracy | tier        | moved vs. final |
|------------:|---------:|-------------|-----------------:|
|  3 | 0.1923 | insufficient |  9/13 |
|  6 | 0.4338 | insufficient |  9/13 |
|  9 | 0.7228 | insufficient | 11/13 |
| 12 | 0.7229 | insufficient | 11/13 |
| 15 | 0.7228 | insufficient | 11/13 |
| 18 | 0.7239 | insufficient | 12/13 |
| 21 | 0.7371 | insufficient | 10/13 |
| 24 | 0.7434 | insufficient | 10/13 |
| 27 | 0.7522 | high         |  6/13 |
| 30 | 0.7673 | high         | 11/13 |
| 33 | 0.7677 | high         |  8/13 |
| 36 | 0.7699 | high         | 10/13 |
| 39 | 0.7741 | high         |  8/13 |
| 42 | 0.7883 | high         |  8/13 |
| 45 | 0.8235 | high         |  3/13 |
| 48 | 0.8277 | high         |  7/13 |
| 51 | 0.8301 | high         |  7/13 |
| 54 | 0.8439 | high         | 12/13 |
| 57 | 0.0000 | (crash — discard) | n/a |
| 60 | 0.8833 | veryHigh     |  2/13 |
| 63 | 0.8956 | veryHigh     |  6/13 |
| 66 | 0.9060 | veryHigh     |  2/13 |
| 69 | 0.9204 | veryHigh     |  0/13 (final) |

## Verdict

**None of Medium/High/Very High cleanly separates "ranking has settled" from "ranking is
still moving" in this session.** The High tier alone ranges from 3/13 to 12/13 albums still
moved depending on exactly which High-tier snapshot you pick — accuracy climbing within a tier
does not monotonically shrink how much the ranking is still shifting (n=45 at 3/13 is
immediately followed by n=48 at 7/13, then n=54 at 12/13, all still "high"). Very High is
better but not clean either: 60→63 goes from 2/13 back up to 6/13 before settling.

This is **evidence against treating any single accuracy threshold — Medium (0.55) in
particular — as a safe auto-stop point**, not proof of what the correct threshold is. Stopping
at the first Medium crossing in this session would have locked in a ranking that was still
substantially different (most Medium-tier snapshots in the pre-High range show 9-12/13 albums
away from final) from where the session ultimately landed.

### Caveats

- **Single session, single user.** This is Dan's own 71-answer trace against a fixed
  6-criterion/5-level model and a fixed 13-album test set. It demonstrates that instability
  *can* persist well past Medium and deep into High in at least one real case — it does not
  establish base rates, a distribution, or how this generalizes across different users,
  criteria counts, or answer patterns.
- **"Moved vs. final" is a coarse metric.** It counts any rank change, including two
  adjacent, near-tied albums swapping by a hair — it does not weight by how much the
  underlying score moved or whether the swap is one a user would even notice. A stricter
  metric (e.g. top-3 stability only, or a minimum score-gap threshold before counting a swap)
  might tell a different, possibly more forgiving story and would be worth running against the
  same raw snapshots before this feeds a final threshold decision.
- **n=57's discard** removes one data point from the High range but doesn't materially change
  the shape of the surrounding trend (n=54 and n=60 bracket it and already show the same
  non-monotonic pattern).

This doc is the evidentiary basis for Brief 3's auto-escalation threshold decision — cite it
directly rather than re-deriving from the raw logs, unless the "moved vs. final" metric itself
needs revisiting (see caveats above).

## Pass 3: top-10 set-membership re-analysis (2026-08-13)

Dan confirmed that for Brief 3's auto-escalation decision, only **top-10 set membership**
matters (which 10 of the 13 test-set albums land in the top 10, regardless of internal order)
— "moved vs. final" above is stricter than what actually matters, since exact ordering within
the top 10 is expected to keep shifting even after calibration is considered "stabilized."

Re-computed directly from the same raw `.jsonl` snapshots used in Pass 2, same dedup rules
(duplicate `answerCount` rows collapsed; identical content confirmed at the one duplicate,
`n=45`). New metric per snapshot: `|TOP10(snapshot) symmetric-difference TOP10(final)| / 2`,
i.e. how many albums swapped in or out of the top 10 relative to the `n=69` reference
snapshot (0 = exact set match).

### n=54: a second discard, alongside n=57

Investigating a tie found while building this table surfaced that **every album's score is
exactly 0** in the `n=54` snapshot — not a genuine rank-10/11 tie, but the entire 13-album
ranking being flat-tied (ranks 1-13 in the raw log are in plain alphabetical `albumId` order,
matching `rankAlbum`'s deterministic tie-break exactly, confirming all scores were identical).
Root cause, confirmed by inspection of `solver.ts`/`simplex.ts` and the `2026-08-11.jsonl`
file's write-time (`10:26:36`-`10:55:05`, over 24 hours before commit `65356de`/`bc93e49` on
2026-08-12):

> n=54 (2026-08-11) is a second, silent instance of the same pre-Dantzig Chebyshev-center
> degradation documented for n=57 — confirmed pre-both-fixes (2026-08-12). Unlike n=57,
> accuracy read as plausible (0.8439) rather than 0, because computeScoreSpreadAccuracy solves
> independently of the Chebyshev point and never observes its degradation. This is a
> structural property of the two functions being separate, not a second bug — the
> pre-consolidation async-race architecture (fixed same day, commit 65356de) was considered as
> an alternate explanation but isn't needed to account for the observed pattern, since the
> accuracy/ranking split predates and is independent of that race. Practical implication: a
> degraded point-estimate can silently pass as "confident" if only the accuracy number is
> checked, without inspecting the underlying ranking — worth remembering if a similar-looking
> anomaly surfaces post-fix.

Sanity-checked against the now-current guard: `computeChebyshevCenter`'s post-solve check
(`solver.ts:252`, backed by `solveLP`'s post-solve constraint re-verification in
`simplex.ts:405-414`) is unconditional — it re-verifies the returned point against the
original constraints (including the sum-to-1 normalization that an all-zero point would
violate) regardless of failure mechanism, not just the specific near-singular-pivot case
already tested. A repeat of the `n=54` pattern would throw today rather than silently persist.

`n=54` is discarded from the table below on the same basis as `n=57`.

### Top-10 set-membership table

| answerCount | accuracy | tier         | top-10 set diff vs. final |
|------------:|---------:|--------------|---------------------------:|
|  3 | 0.1923 | insufficient |  1/10 |
|  6 | 0.4338 | insufficient |  1/10 |
|  9 | 0.7228 | insufficient |  1/10 |
| 12 | 0.7229 | insufficient |  1/10 |
| 15 | 0.7228 | insufficient |  1/10 |
| 18 | 0.7239 | insufficient |  1/10 |
| 21 | 0.7371 | insufficient |  1/10 |
| 24 | 0.7434 | insufficient |  1/10 |
| 27 | 0.7522 | high         |  0/10 |
| 30 | 0.7673 | high         |  1/10 |
| 33 | 0.7677 | high         |  0/10 |
| 36 | 0.7699 | high         |  0/10 |
| 39 | 0.7741 | high         |  0/10 |
| 42 | 0.7883 | high         |  0/10 |
| 45 | 0.8235 | high         |  0/10 |
| 48 | 0.8277 | high         |  0/10 |
| 51 | 0.8301 | high         |  0/10 |
| 54 | 0.8439 | (discard — see root-cause note above) | n/a |
| 57 | 0.0000 | (discard — see Pass 1/Pass 2) | n/a |
| 60 | 0.8833 | veryHigh     |  0/10 |
| 63 | 0.8956 | veryHigh     |  0/10 |
| 66 | 0.9060 | veryHigh     |  0/10 |
| 69 | 0.9204 | veryHigh     |  0/10 (final) |

### Verdict

Top-10 **set** membership settles far earlier and far more cleanly than "moved vs. final"
suggested: from `n=3` through `n=24` exactly one album differs from the final top 10, and the
set first matches final exactly at `n=27` — the same snapshot that first crosses into High
tier. **This is not a clean monotonic settle, though**: the set reverts to a 1/10 mismatch at
`n=30` (still High tier) before locking at an exact 0/10 match from `n=33` onward. That single
reversion is the one non-monotonic point in an otherwise clean result, and it means the correct
statement is "the top-10 set first matched at n=27, wobbled once at n=30, then held from n=33"
— not "settled at first High crossing," which would overclaim monotonicity the data doesn't
show, the same kind of overclaim Pass 2 was written to avoid on the "moved vs. final" metric.

Two caveats on top of that:

- **Sampling granularity.** The log only captured every 3rd committed answer. "Stable from
  n=33" means stable *in the periodic samples available* — it says nothing about whether the
  top-10 set wobbled and recovered at any of the un-sampled answers in between (e.g. between
  n=27 and n=30, or between n=33 and n=69). A continuously-verified stability claim would need
  denser sampling, which this instrument didn't do.
- **Single session, single user**, same as Pass 1/Pass 2 — this is still Dan's own 71-answer
  trace against one fixed criteria model and one fixed 13-album test set; it doesn't establish
  base rates or generalize across users or answer patterns.

Net for Brief 3: if top-10 set membership (not full ranking order) is the actual auto-stop
criterion, this session's evidence is meaningfully more favorable to a High-tier auto-stop than
Pass 2's full-ranking metric suggested — but the n=30 reversion means even High is not
observed to be monotonically safe within this one session, and the sampling-granularity caveat
means "safe at High" isn't fully verified even where the sampled points look clean.

## Pass 4: tier-gated K-window signal (2026-08-13)

Follow-up to Pass 3's `n=30` finding and two intermediate read-only checks (not separately
documented, results folded in below): a **pure self-referential** top-10-set signal
("unchanged across the last K logged checkpoints," no reference to the known final set) and
a **tier-gated** variant of the same signal (only start counting once the already-logged
accuracy tier reaches High). Same raw snapshots, same `n=54`/`n=57` exclusion, and the same
9-answer `51→60` gap that exclusion creates, as Pass 3.

### Why the pure self-referential signal doesn't work

Checked first, before gating: the top-10 set was **frozen from `n=3` through `n=21`**
(`selfDiff = 0` for seven consecutive snapshots) while being wrong the entire time
(`diffVsFinal = 1` throughout) — the model simply hadn't gathered enough information yet to
move, which looks indistinguishable from real convergence to a signal that only compares each
snapshot to its immediate predecessor. Every K∈{1,2,3,4} tested fires inside this false
plateau (`n*=6,9,12,15` respectively), each one wrong at the moment it fires, each one
seeing the set change again multiple times afterward (`n=24,27,30,33`) before real
stabilization. A purely self-referential K-window, at any of the K values tested, is not a
viable signal on this trace.

### Tier-gated results

Gating the same K-window behind the existing accuracy tier (only High/veryHigh snapshots are
eligible to start or extend a run) removes the false plateau entirely, since every
`insufficient`-tier snapshot is simply ineligible.

**Gate: tier ∈ {high, veryHigh}**

| K | n* (fires) | diff-vs-final at n* | false positive after n*? | gap-entangled? |
|---|---:|---:|---|---|
| 1 | 36 | 0 | None | No |
| 2 | 39 | 0 | None | No — firing window (36, 39) is entirely pre-gap |
| 3 | 42 | 0 | None | No — firing window (36, 39, 42) is entirely pre-gap |
| 4 | 45 | 0 | None | No — firing window (36, 39, 42, 45) is entirely pre-gap |

All four fire on an exact match to the true final top-10 set, with no reversal anywhere in the
remaining sequence through `n=69`. The gate is what does the real work here: `n=27`, `n=30`,
`n=33` all carry `selfDiff=1` (High tier, but still moving — this is the `n=30` wobble from
Pass 3), so no run can start accumulating until `n=36`. Note the "no false positive after"
claim for all four does look past `n=51` out to `n=69`, which crosses the `51→60` gap — none
of the four firing points themselves depend on the gap, but that tail-check isn't fully
verified across the unobserved `n=54–57` stretch.

**Gate: tier == veryHigh only (stricter variant) — flagged as less trustworthy**

| K | n* (fires) | diff-vs-final at n* | false positive after n*? | gap-entangled? |
|---|---:|---:|---|---|
| 2 | 63 | 0 | None | **Yes** — firing window (60, 63) includes `n=60`'s gap-spanning selfDiff |
| 3 | 66 | 0 | None | **Yes** — window (60, 63, 66) includes the gap-spanning point |
| 4 | 69 | 0 | None (trivial — n* is the last snapshot) | **Yes** — window (60, 63, 66, 69) includes the gap-spanning point |

Also clean on both metrics, but unlike the High-gate results, every veryHigh-gate window is
anchored on `n=60`'s `selfDiff`, which is measured against `n=51` across the excluded
`n=54/57` stretch rather than a real 3-answer step — these results can't rule out a wobble
hidden inside that gap the way the High-gate results can. **Kept here for completeness, not
as evidence on the same footing as the High-gate table.**

### Verdict

**Tier-gated (High) K=2 is the strongest candidate signal found across every check in this
document** — pure accuracy threshold (Pass 2), pure self-referential window, and this
composite. It fires at `n=39`, lands on an exact match to the final top-10 set, and sees no
reversal anywhere afterward through `n=69`, without the gap-entanglement that weakens the
veryHigh-gate variant.

Set against K=1 (same High gate, no confirmation window): K=1 fires at `n=36`, also an exact
match, also with no reversal afterward. **In this specific trace, the confirmation window adds
nothing beyond the gate itself** — K=1 already landed correctly three answers earlier, and
K=2's extra requirement only cost latency, not correctness. That is a property of this one
71-answer trace, not a guarantee: the structural argument for requiring K≥2 in production
still holds regardless of what a single trace shows, since a lone post-gate `selfDiff=0`
reading has no way to distinguish "genuinely settled" from "coincidentally unchanged this one
checkpoint" — Pass 3's `n=30` wobble already demonstrates the tier gate alone doesn't prevent
a single-point read from being briefly wrong (`n=27`), it's the requirement to stay unchanged
across a window that would catch a repeat of that pattern if it recurred elsewhere in a
different session.

This composite is the current leading candidate for Brief 3's auto-escalation signal design —
**not a validated production threshold.** Every result above, including the clean ones, is a
retroactive fit to one 71-answer session from a single user (Dan) against one fixed
6-criterion/5-level model and one fixed 13-album test set. It demonstrates the tier-gated
approach *can* avoid both known failure modes (the false plateau and the `n=30` wobble) in at
least one real trace; it does not establish that K=2/High is the correct threshold, that it
generalizes to other users or criteria shapes, or that a different session couldn't produce a
counterexample the way `n=30` did for the ungated metric.

## Cleanup note

The instrument that produced this data (`rankingStabilityLog.ts`, its `maybeLogSnapshot` call
sites in `CriteriaCalibrationPage.tsx`, and the `POST /api/ranking-stability-log` route in
`server.ts`) was removed 2026-08-12 now that this analysis is complete. `rankingTestSet.ts`
(the 13-album fixture) is kept — it's now referenced only as historical evidence backing this
doc, not by any live code path. The raw `.jsonl` logs remain on disk under
`docs/backups/` (gitignored, not committed) as backing data for the table above.
