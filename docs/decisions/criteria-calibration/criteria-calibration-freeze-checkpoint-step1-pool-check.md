# Freeze checkpoint — Step 1: is the degree-2 pool actually empty?

Read-only diagnostic, no production code touched. Answers the brief's mandatory pre-check
before any Step 2 UI work on the fifth checkpoint ("freeze detection" for the four preference
shapes that never reach `coverage-complete` at degree 2).

## Question

For `#2 single-dominant`, `#4 linear-control`, `#5 front-loaded`, `#6 back-loaded` — at round 90
(end of the 90-round simulated session, `MAX_ROUNDS` default in `degree-tier-recon-2026-08-18.ts`)
— does the degree-2 refinement candidate pool still have unasked pairs (`pool.length > 0`), or is
it exhausted (`pool.length === 0`)?

- **Case A** (pool empty): nothing left to ask at degree 2. Escalating to degree 3 is the
  unconditional continuation of running out of material — not an artificial promotion.
- **Case B** (pool non-empty): candidates remain, but answering them no longer narrows feasible
  ranges (all free variables already `touched`, some stay `narrow`-blocked regardless).
  Escalating here is a user choice with real information still nominally extractable at degree 2,
  not an automatic transition.

## Method

New script: `scripts/freeze-checkpoint-pool-recon-2026-08-25.ts`. Re-simulates (does not
post-process) the same 10 oracle traces `degree-tier-recon-2026-08-18.ts` already replays — same
ground truths, same seeds, same `nextAction` driver calls, same `MAX_ROUNDS=90` default — because
neither the committed recon CSV nor the normalized-coverage-width CSV carries a pool-size column;
it isn't recoverable from either without re-running the driver.

`buildRefinementCandidatePool` (the function `nextAction`'s `pool-empty` fallback reads) is
module-private in `elicitationDriver.ts` and was **not** exported or modified — this pass stays
read-only, no `src/` file touched. Instead, the script reconstructs the pool from
`elicitationDriver.ts`'s exported pieces (`generateCandidatesForSubset`, `profileKey`,
`session.graph.isImplied`) plus three tiny private helpers copied verbatim
(`enumerateCriterionSubsets`, `hasBeenAsked`, `computeTouchCounts` — each a pure few-line
function with no hidden state).

**Self-check, not just a courtesy claim of fidelity:** at every round, the script asserts its
independently-computed pool size agrees with what the real `nextAction` call implies —
`degree-exhausted`/`pool-empty` must see pool size 0, `ask`/`ambiguity-refinement` must see pool
size > 0 (per `nextAction`'s own branch order: the pool-length check runs before the
coverage-complete check, so an `ask` at all means the pool was non-empty). A mismatch throws
immediately. Result: **zero mismatches across all 10 oracle traces, every round up to each
trace's cutoff** (90 for the four in question; A70/B71 aren't included here since they replay a
fixed answer log rather than being driven live by `nextAction`, so "pool size" isn't a
decision the driver makes for them).

## Result

| Trace | Round | Degree | Driver action at that round | Independently-computed pool size | Case |
|---|---|---|---|---|---|
| #2 single-dominant | 90 | 2 | `ask` / `ambiguity-refinement` | 62 | **B** |
| #4 linear-control | 90 | 2 | `ask` / `ambiguity-refinement` | 57 | **B** |
| #5 front-loaded | 90 | 2 | `ask` / `ambiguity-refinement` | 54 | **B** |
| #6 back-loaded | 90 | 2 | `ask` / `ambiguity-refinement` | 57 | **B** |

All four are non-boundary at round 90 (confirmed independently in the already-committed
`docs/data/criteria-calibration/degree-tier-recon-2026-08-18.csv`: `is_boundary = 0` for all four at every round from 1 to 90 —
they never once hit `degree-exhausted`, of either reason, in the whole 90-round window). Since
`nextAction` only returns `type: 'ask'` after passing the `pool.length === 0` check, that
committed CSV column already logically proves non-empty; this diagnostic adds the actual counts
(54–62 remaining candidates) and the direct self-checked reconstruction.

## Verdict

**Uniformly Case B — not mixed.** All four flagged shapes still have 54–62 unasked, non-implied,
non-dominated degree-2 candidate pairs at round 90. None of the four is "out of material" — they
are all narrow-blocked (per `criteria-calibration-normalized-coverage-width-diagnostic.md` and
`criteria-calibration-degree-tiers-and-progress.md` §2d), not pool-exhausted.

**Consequence for Step 2** (per the brief, not re-litigated here): the fifth checkpoint's
degree-3 continuation must NOT be offered as an automatic/unconditional transition for these
four shapes. It requires the explicit-consent copy path — "we can't refine further at this level
of detail for your preference profile" — not the plain continuation the checkpoint would use if
this had come back Case A. Since the result is uniform across all four (no shape landed in Case
A), the checkpoint screen does not need to distinguish Case A vs. B at runtime for shapes that
reach this fifth checkpoint at all — only Case B's copy path is live. (A shape not on this list
of four could still be Case A if it ever freezes for other reasons — this diagnostic only covers
the four already flagged as never-coverage-complete.)

## Reproduction

```bash
npx tsx scripts/freeze-checkpoint-pool-recon-2026-08-25.ts
```

Writes nothing (stderr report only). ~10s runtime for all 10 oracle traces.
