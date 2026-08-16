// Level A — replay every prefix of every committed real fixture through solveValues under
// each candidate ratio-test rule. Runs under the lab alias, so the FULL production solver
// stack is exercised with only the leaving-row choice swapped.
import * as fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { sweepCommitted, COMMITTED_FIXTURES } from './sweepCore.js';
import { setRatioRule, resetLabCounters, LAB_COUNTERS, type RatioRuleConfig } from './simplexLab.js';

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
    const prod = JSON.parse(fs.readFileSync(`${OUT}prod-committed-sweep.json`, 'utf8')) as ReturnType<
      typeof sweepCommitted
    >;
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

    // Baseline MUST be bit-identical to production, or nothing else here means anything.
    setRatioRule({ name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 });
    const baseRows = sweepCommitted();
    for (let i = 0; i < baseRows.length; i++) {
      expect(baseRows[i]).toEqual(prod[i]);
    }
  });
});
