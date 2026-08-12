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

Raw snapshots: `docs/decisions/backups/ranking-stability-log-{2026-08-10,2026-08-11,2026-08-12}.jsonl`
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

## Cleanup note

The instrument that produced this data (`rankingStabilityLog.ts`, its `maybeLogSnapshot` call
sites in `CriteriaCalibrationPage.tsx`, and the `POST /api/ranking-stability-log` route in
`server.ts`) was removed 2026-08-12 now that this analysis is complete. `rankingTestSet.ts`
(the 13-album fixture) is kept — it's now referenced only as historical evidence backing this
doc, not by any live code path. The raw `.jsonl` logs remain on disk under
`docs/decisions/backups/` (gitignored, not committed) as backing data for the table above.
