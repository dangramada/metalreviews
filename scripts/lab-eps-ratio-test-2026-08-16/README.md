# EPS = 1e-9 ratio-test lab (2026-08-16)

Read-only diagnostic harness for `deferred-work.md` item 3 — the `EPS = 1e-9` ratio-test
threshold in `src/lib/criteria-calibration/simplex.ts` that admits near-singular pivots.
Not wired into any build step. Findings: `docs/decisions/criteria-calibration/criteria-calibration-eps-ratio-test-diagnostic.md`.

## How it avoids touching production

`lab.vitest.config.ts` sets one Vite alias, `/^\.\/simplex\.js$/` -> `simplexLab.ts`. That is
the only specifier `solver.ts` and `scoreSpreadAccuracy.ts` use to reach the solver, so the
whole production stack above it — `nextAction`, `CalibrationSession`, `computeCommitState`,
`solveValues`, `buildValueLP` — runs unmodified against a pluggable ratio test. `setRatioRule`
switches rules at runtime; `'baseline'` reproduces production exactly.

`simplexLab.ts` is still a copy, so it is parity-checked rather than trusted: `sweepProd.ts`
runs the same sweep under plain `tsx` (no alias, real `simplex.ts`) and `levelA.labtest.ts`
diffs against its output. Run `sweepProd.ts` first — the other files depend on
`out/prod-committed-sweep.json`.

## Running

```bash
npx tsx scripts/lab-eps-ratio-test-2026-08-16/sweepProd.ts
npx vitest run --config scripts/lab-eps-ratio-test-2026-08-16/lab.vitest.config.ts [name]
```

Outputs land in `out/` (the 2026-08-16 run's results are committed there; re-running
overwrites them).

| file | what it answers | runtime |
|---|---|---|
| `levelA` | every prefix of every committed real fixture, per rule; baseline-vs-production parity | ~15s |
| `deltas` | how far each rule moves the reported point estimates | ~6s |
| `centers` | whether that movement is a worse centre or an equally-optimal tie (it is a tie) | ~3s |
| `drift` | accumulated round-off vs. single-pivot blow-up — the refactorization question | ~1s |
| `harrisDelta` | Harris δ vs `FEASIBILITY_TOLERANCE` / `PHASE1_FEASIBILITY_TOLERANCE` | ~5s |
| `pivots` | pivot counts + `MAX_ITERATIONS` headroom + cycling check | ~3s |
| `adversarial` | equal-share / contradiction sweeps at n=150,300 | ~50 min |
| `oracles` | all 10 synthetic oracles re-run closed-loop per rule | ~25 min |

Env vars: `adversarial` takes `LAB_TRIALS`, `LAB_NS`, `LAB_RULES`, `LAB_TAG`; `oracles` takes
`LAB_ORACLE_ROUNDS`. Run `baseline` separately from the candidate rules in the adversarial
sweep — its failing cells burn `MAX_ITERATIONS` on every solve and it is ~100x slower.
