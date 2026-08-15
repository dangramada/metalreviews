# Criteria Calibration — LP warm start + `nextAction` memoization

**Branch:** `criteria-calibration-lp-warm-start` · **Date:** 2026-08-15
**Rollback tag:** `pre-merge-criteria-calibration-lp-warm-start`

Closes the "`computeScoreSpreadAccuracy` scales superlinearly" item that
`criteria-calibration-reload-glitch-and-sluggishness-fix.md` (2026-08-11) flagged as an
urgent follow-up and explicitly left out of scope.

---

## 1. What the problem actually was

The 2026-08-11 pass removed 2 of 3 redundant per-commit calls but was forbidden from
touching the LP logic itself, so the remaining single call still cost ~2.2s at n=59. Two
candidate mechanisms were logged and neither had been investigated: no warm-starting between
the ~210 `solveLP` calls, and/or main-thread blocking that a Web Worker would hide.

Read-only profiling settled it.

### Call count is constant; per-solve cost is what grows

| n   | wall (ms) | #solveLP | per-call (ms) | mean pivots | tableau |
| --- | --------- | -------- | ------------- | ----------- | ------- |
| 10  | 26.7      | 210      | 0.113         | 36.8        | 32×93   |
| 20  | 61.6      | 210      | 0.291         | 58.4        | 43×123  |
| 30  | 123.0     | 210      | 0.584         | 75.4        | 55×153  |
| 40  | 262.0     | 210      | 1.230         | 107.0       | 66×183  |
| 50  | 437.0     | 210      | 2.082         | 123.2       | 78×213  |
| 59  | 875.1     | 210      | 4.158         | 166.7       | 88×240  |

210 = C(15,2) sampled pairs × 2 solves, fixed by the seeded pool and independent of n.
Per-call cost grows 36.8× while n grows 5.9× ⇒ **≈ O(n²) per solve**. Cost tracks
`pivots × tableau area` almost exactly (area 7.1×, pivots 4.5×, product 32× vs measured 37×):
each answer adds constraint rows _and_ a slack variable column, so the tableau grows in both
dimensions while the pivot count grows too.

Everything outside the LP is noise: `buildValueLP` 3.4 ms (0.4%), `profileCoeffs` and diff
arrays for all 105 pairs 0.34 ms (0.04%). **99.6% of the time is inside `solveLP`.** No GC
artifact, no hidden repeated derivation.

### Why the per-solve cost was mostly waste

All 210 calls pass the **identical** constraint set (`lp.constraintsWithSlackCap`) and differ
only in the objective. In `simplex.ts`, `lp.objective` is first read when Phase 2 prices the
objective row, and Phase 2 zeroes that whole row — RHS column included — before repricing.
Tableau construction, all of Phase 1, and the degenerate-artificial cleanup depend on
`constraints` alone.

⇒ The post-Phase-1 tableau and basis were **bit-identical across all 210 calls and rebuilt
210 times.** Measured at n=59: 3.298 of 4.158 ms per call (**79%**), 134 of 166.7 pivots
(**80%**).

### A second, unrelated finding on the same per-commit path

`CriteriaCalibrationPage.tsx` called `nextAction(...)` **bare in the render body**, and
`elicitationDriver.ts`'s ambiguity-refinement branch runs a full `solveValues` inside it —
202.8 ms at n=59 (0 ms during cold start, where it returns before solving). The
selection/hold/fade state machine sets `phase` in four separate timeout ticks
(`holding` → `fading-out` → `fading-in` → `idle`), so **one answered question produced four
renders and four solves**, ~810 ms of which three quarters was duplicate.

That is very likely why the 2026-08-11 pass attributed 2.2–2.35 s to "a single
`computeCommitState` call" — the real per-question hitch was larger than
`computeScoreSpreadAccuracy` alone, and this component had not been found.

---

## 2. What shipped

### Commit 1 — `simplex.ts` warm start

`solveLP` is split into:

- `prepareLP(numOriginal, constraints)` → `PreparedLP` — tableau + Phase 1 + artificial
  cleanup. Objective-independent. Records a Phase 1 `failure` (feasibility is a property of
  the constraints, so every objective fails identically) and the `minPivotMagnitude` /
  `totalPivots` accumulators.
- `solveFromPrepared(prep, objective)` → `LPSolution` — Phase 2 for one objective.
- `solveLP(lp)` — unchanged signature and behaviour, now literally
  `solveFromPrepared(prepareLP(...), lp.objective)`.

That last point is the design's core safety property: single-shot callers execute the same
code as before **by construction**, not by keeping two parallel implementations in agreement.

Converted call sites — the only two that solve many objectives over one constraint set:
`computeScoreSpreadAccuracy` (210 solves) and `solveValues`'s pass-2 range solves (48 at the
6×5 shape).

Deliberately **not** converted, because each solves a _different_ constraint set:
`buildValueLP`'s own phase-1 solve (no slack-cap row) and `computeChebyshevCenter` (every
inequality widened by `r`, plus an extra variable).

### Commit 2 — `nextAction` memoization

`useMemo` keyed on exactly `nextAction`'s three arguments (`catalog`, `session`, `degree`).

Reference stability of all three was verified before implementing, since a dep that changes
identity every render would make the memo correct but useless:

- `catalog` — `useState` in `useCriteriaCatalog`, written once by a mount-only (`[]`) effect,
  never refetched. The hook returns a fresh `{catalog, loading, error}` wrapper each render,
  but the page destructures `catalog`, so only the stable inner reference matters.
- `session` — already `useMemo([answers])`, and `answers` is always _replaced_ with a fresh
  array (`[...answers, entry]`, `answers.slice(0, -1)`), never mutated in place, so its
  identity changes exactly when the answer log changes.
- `degree` — a number.

---

## 3. Decisions and rejected alternatives

**Structural warm start, not dual-simplex re-optimization.** Sharing the Phase 1 basis means
Phase 2 starts from an identical tableau and basis and therefore takes an identical pivot
path — results are bit-for-bit identical to solving cold. Re-optimizing each objective from
the _previous objective's optimum_ would cut Phase 2 pivots as well, but changes the pivot
path and forfeits bit-identity. In a solver with this file's history (Big-M reporting ~1e14
garbage as `feasible: true`; `computeChebyshevCenter` silently persisting all-zero weights),
giving up exact reproducibility to chase the remaining 20% was not worth it. **Do not
"upgrade" this to a dual simplex without re-establishing an equivalence story first.**

**Nothing numerical moved.** Two-phase structure, Dantzig's rule, the Chebyshev center,
`EPS`, `MAX_ITERATIONS`, `FEASIBILITY_TOLERANCE`, `NEAR_SINGULAR_PIVOT_THRESHOLD` — all
unchanged. This pass is purely about not repeating work.

**The post-solve feasibility guard stays per-objective.** It validates the extracted `x`,
which is objective-specific, so it cannot be hoisted into `prepareLP` alongside the shared
work — and it still checks against the _original_ constraints (carried on `PreparedLP`), not
the internally rhs-normalized rows. Measured cost 4.6 ms per 210 solves at n=59 (2.4%).

**`solveFromPrepared` deep-copies the constraint rows** before pivoting, so one `PreparedLP`
survives unlimited reuse. Only rows `0..numRows-1` are copied; the objective row is rebuilt
per objective anyway. Measured 2.5 ms per 210 solves (1.3%) — 0.75% of what it removes.

**`useMemo` over hoisting `nextAction` into an effect + state.** `action` is derived render
state read directly in JSX; an effect would introduce a render where it is stale or null plus
its own invalidation logic — new bug surface for no gain.

**Not done: dedupe `nextAction`'s `solveValues` against `computeCommitState`'s.** They solve
the identical answer log twice per question. Fixing it needs a driver API change to accept a
pre-solved result; after the warm start the duplicate costs ~50 ms rather than ~200 ms.
Logged in `deferred-work.md`.

**Not done: `Float64Array`/flat tableau.** Constant-factor only; the residual is 96% genuine
Phase 2 pivoting.

**Web Worker: deferred, not rejected.** Decision explicitly postponed until after real
post-fix measurement — see §5.

---

## 4. Verification

The suite was green through _both_ prior silent-corruption bugs in this file, so "tests pass"
was not treated as sufficient.

**Bit-identity (`scripts/verify-lp-warm-start.ts`, kept).** Cold (fresh Phase 1 per objective)
vs warm (one shared prepared Phase 1), compared with `Object.is` rather than a tolerance, over
every constraint-set shape the calibration path builds:

| corpus                                                    | solves   | mismatches |
| --------------------------------------------------------- | -------- | ---------- |
| PAPRIKA / 1000minds real session (31 answers, 5 criteria) | 250      | 0          |
| real production session (33 answers, 6 criteria)          | 258      | 0          |
| degree-anomaly session (31 answers, 6 criteria)           | 258      | 0          |
| synthetic 6×5 at n = 10, 20, 30, 40, 50, 59               | 258 each | 0          |
| **total**                                                 | **2314** | **0**      |

Compared per solve: `feasible`, `objectiveValue`, every component of `x`, and every
`diagnostics` field (`reason`, `maxViolation`, `minPivotMagnitude`, `nearSingularPivot`,
`totalPivots`). Diagnostics parity matters as much as values — they are what the Dantzig-era
guards report on, and a warm start that reset them would blind those guards.

**Failure paths (`src/__tests__/simplexWarmStart.test.ts`, 8 tests).** The script above only
reaches feasible solves. The split moved the Phase 1 accumulators and failure reason across a
function boundary, so a bad hand-off would leave every feasible solve perfect while corrupting
exactly the guards that exist to catch numerical breakdown. Covered: feasible, all-`le` (Phase
1 skipped entirely — a distinct hand-off path), `phase1-genuinely-infeasible`,
`phase2-unbounded`, infeasible-set replay across multiple objectives, long reuse runs,
order-independence (forward vs reverse traversal of one prep), and non-mutation of the
prepared tableau/basis.

**PAPRIKA end-to-end numerical diff.** Full `solveValues` snapshot before and after:

| quantity                                             | result                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 75 level values (`point`/`min`/`max`)                | **75/75 bit-identical**, max delta 0                                                     |
| `totalSlack`                                         | 0 → 0, delta 0                                                                           |
| `perAnswerSlack` (31 answers)                        | max delta 0                                                                              |
| 19 album scores                                      | **19/19 bit-identical**, max delta 0                                                     |
| album ordering                                       | **identical**                                                                            |
| pre-existing residual vs Dan's real 1000minds export | values 0.11129897906589478, scores 0.2742861920126871 — **unchanged in both directions** |

That last row is the pre-existing disagreement between this solver and 1000minds' own
algorithm. It is not something this pass set out to change; it is reported to prove the pass
did not perturb it.

**Suite:** 297/297 tests across 38 files, `tsc --noEmit` clean, including
`simplexDantzig.test.ts` (the permanent two-phase/Dantzig regression test) unmodified.

---

## 5. Results

Best-of-5, Node, 6 criteria × 5 levels synthetic degree ramp, same fixture before and after.

| n   | score-spread |       |       | `solveValues` |       |       | `nextAction` |       |
| --- | ------------ | ----- | ----- | ------------- | ----- | ----- | ------------ | ----- |
|     | before       | after |       | before        | after |       | before       | after |
| 10  | 23.1         | 4.9   | 4.71× | 6.2           | 2.2   | 2.82× | 0            | 0     |
| 20  | 61.2         | 14.1  | 4.34× | 14.5          | 4.0   | 3.63× | 0            | 0     |
| 30  | 122.1        | 28.3  | 4.31× | 29.2          | 9.2   | 3.17× | 0            | 0     |
| 40  | 258.6        | 53.1  | 4.87× | 61.6          | 15.7  | 3.92× | 0            | 0     |
| 50  | 434.2        | 106.1 | 4.09× | 99.2          | 26.9  | 3.69× | 104.6        | 31.8  |
| 59  | 871.8        | 206.1 | 4.23× | 198.0         | 49.6  | 3.99× | 202.9        | 53.1  |

`nextAction` is 0 ms below n≈50 on this fixture because the driver is still in its cold-start
branch and returns before solving.

**Per-question blocking time** — score-spread + `solveValues` + `nextAction` × (4 renders
before the memo, 1 after):

| n      | before        | after        |           |
| ------ | ------------- | ------------ | --------- |
| 10     | 29.3 ms       | 7.1 ms       | 4.13×     |
| 20     | 75.7 ms       | 18.1 ms      | 4.18×     |
| 30     | 151.3 ms      | 37.5 ms      | 4.03×     |
| 40     | 320.2 ms      | 68.8 ms      | 4.65×     |
| 50     | 951.8 ms      | 164.8 ms     | 5.78×     |
| **59** | **1881.4 ms** | **308.8 ms** | **6.09×** |

The n=59 before-figure (1881 ms measured here) is in line with the 2.2–2.35 s the 2026-08-11
pass reported on Dan's hardware — this machine runs the same fixture roughly 20% faster, and
the shape matches.

**Still O(n²).** This pass removed a ~4× constant factor and a ~4× redundancy; it did not
change the complexity. The remaining cost is 96% genuine Phase 2 pivoting. Expect the curve
to bite again at sufficiently high n — around n≈120 the per-question cost returns to today's
n=59 level. That is a real limit of this approach, not a claim to have solved scaling.

**Web Worker decision, deferred.** ~309 ms at n=59 here; Dan's hardware should be measured
directly rather than extrapolated. Not introduced in this pass, so
`usePendingWritesGuard.ts`'s "Saving…" / pending-writes UI is untouched and no off-thread
state-reflection question arises.

**Not verified in a live browser.** Both changes are exercised by tests and the verification
script, but reproducing the actual UI hitch needs an authenticated calibration session at
n≈59, which cannot be constructed from here. The memoization's user-visible behaviour rests
on the determinism test (`elicitationDriver.test.ts`) plus the dep-stability analysis in §2,
not on a live observation.
