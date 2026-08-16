// Level A — replay every prefix of every committed real fixture through solveValues under
// each candidate ratio-test rule. Runs under the lab alias, so the FULL production solver
// stack is exercised with only the leaving-row choice swapped.
import * as fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { sweepCommitted, COMMITTED_FIXTURES } from './sweepCore.js';
import {
  setRatioRule,
  resetLabCounters,
  LAB_COUNTERS,
  type RatioRuleConfig,
} from './simplexLab.js';

const OUT = new URL('./out/', import.meta.url).pathname;

const RULES: RatioRuleConfig[] = [
  { name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-tiebreak', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-floor', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-floor', pivotFloor: 1e-5, delta: 1e-9 },
  { name: 'magnitude-floor', pivotFloor: 1e-3, delta: 1e-9 },
  { name: 'harris', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'harris', pivotFloor: 1e-7, delta: 1e-8 },
  { name: 'harris', pivotFloor: 1e-7, delta: 1e-7 },
  { name: 'harris', pivotFloor: 1e-5, delta: 1e-9 },
  { name: 'harris', pivotFloor: 1e-5, delta: 1e-8 },
];

const label = (r: RatioRuleConfig) =>
  r.name === 'baseline' || r.name === 'magnitude-tiebreak'
    ? r.name
    : r.name === 'magnitude-floor'
      ? `magnitude-floor(floor=${r.pivotFloor})`
      : `harris(floor=${r.pivotFloor},delta=${r.delta})`;

describe('Level A — committed real fixtures, every prefix', () => {
  it('runs every rule and reports failures + baseline parity', () => {
    const prod = JSON.parse(
      fs.readFileSync(`${OUT}prod-committed-sweep.json`, 'utf8')
    ) as ReturnType<typeof sweepCommitted>;
    const prodByKey = new Map(prod.map((r) => [`${r.fixture}#${r.n}`, r]));

    const summary: string[] = [];
    for (const rule of RULES) {
      setRatioRule(rule);
      resetLabCounters();
      const rows = sweepCommitted();
      const fails = rows.filter((r) => !r.ok);
      let digestMismatches = 0;
      let worstDigestDelta = 0;
      for (const r of rows) {
        const p = prodByKey.get(`${r.fixture}#${r.n}`);
        if (!p || !p.ok || !r.ok || !p.digest || !r.digest) continue;
        if (p.digest !== r.digest) {
          digestMismatches++;
          const a = p.digest.split(/[|/]/).map(Number);
          const b = r.digest.split(/[|/]/).map(Number);
          for (let i = 0; i < a.length; i++) {
            worstDigestDelta = Math.max(worstDigestDelta, Math.abs(a[i] - b[i]));
          }
        }
      }
      summary.push(
        `${label(rule).padEnd(34)} solves=${rows.length} failures=${fails.length} ` +
          `digestDiffVsProd=${digestMismatches} worstPointDelta=${worstDigestDelta.toExponential(2)} ` +
          `floorFallbacks=${LAB_COUNTERS.floorFallbacks} harrisDeviations=${LAB_COUNTERS.harrisDeviations} ` +
          `harrisWorstStepExcess=${LAB_COUNTERS.harrisWorstStepExcess.toExponential(2)}`
      );
      for (const f of fails) {
        summary.push(`    FAIL ${f.fixture} n=${f.n}: ${f.err?.slice(0, 190)}`);
      }
    }
    const out = [
      '=== LEVEL A: committed fixtures, all prefixes ===',
      `fixtures: ${COMMITTED_FIXTURES.map((f) => `${f.name}(${f.answers.length})`).join(', ')}`,
      `production baseline (unaliased tsx run): ${prod.length} solves, ${prod.filter((r) => !r.ok).length} failures`,
      ...summary,
    ].join('\n');
    fs.writeFileSync(`${OUT}out-levelA.txt`, out + '\n');

    // Parity: one lab rule MUST be bit-identical to whatever production currently runs, or
    // nothing else here means anything.
    //
    // Which rule that is depends on when you run this. Through 2026-08-16 production ran the
    // strict min-ratio test, so the answer was `baseline` (the default, which reproduces the
    // frozen diagnostic run against out/prod-committed-sweep-2026-08-16-baseline.json). Once
    // the Harris rule shipped into simplex.ts, production IS harris(1e-7, 1e-8) — so
    // re-running sweepProd.ts and setting LAB_PARITY_RULE=harris re-establishes the same
    // guarantee against the shipped solver. Anything else here is unchanged.
    const parity: RatioRuleConfig =
      process.env.LAB_PARITY_RULE === 'harris'
        ? { name: 'harris', pivotFloor: 1e-7, delta: 1e-8 }
        : { name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 };
    setRatioRule(parity);
    const baseRows = sweepCommitted();
    for (let i = 0; i < baseRows.length; i++) {
      // Normalize signed zero before comparing. `prod` came back through JSON, and
      // JSON.stringify(-0) is "0" — so a genuine -0 totalSlack in production reads as +0
      // here, which toEqual (Object.is semantics) then calls a mismatch. That is a
      // serialization artifact of this harness, not a solver difference; it surfaced only
      // once the parity rule changed because the two rules land on -0 vs 0 on different rows
      // (n42-repro#24). Everything that carries actual information — ok, digest, the failure
      // message — is compared untouched.
      const norm = (r: (typeof baseRows)[number]) =>
        // `+ 0` maps -0 to 0 and leaves every other value alone. Guarded so a missing
        // totalSlack (failed solve) stays missing rather than becoming NaN.
        typeof r.totalSlack === 'number' ? { ...r, totalSlack: r.totalSlack + 0 } : r;
      expect(norm(baseRows[i])).toEqual(norm(prod[i]));
    }
  });
});
