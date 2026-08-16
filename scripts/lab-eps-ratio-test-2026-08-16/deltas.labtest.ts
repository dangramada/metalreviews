// How far do the candidate rules move the REPORTED weights vs. production today?
// A rule that fixes the crash but silently re-prices every user's preferences is a different
// (and much larger) change than one that only differs where production was already breaking.
import * as fs from 'node:fs';
import { describe, it } from 'vitest';
import { sweepCommitted } from './sweepCore.js';
import { setRatioRule, type RatioRuleConfig } from './simplexLab.js';

const OUT = new URL('./out/', import.meta.url).pathname;

const RULES: RatioRuleConfig[] = [
  { name: 'magnitude-tiebreak', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-floor', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-floor', pivotFloor: 1e-3, delta: 1e-9 },
  { name: 'harris', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'harris', pivotFloor: 1e-7, delta: 1e-8 },
];
const label = (r: RatioRuleConfig) =>
  r.name === 'harris' ? `harris(floor=${r.pivotFloor},delta=${r.delta})` :
  r.name === 'magnitude-floor' ? `magnitude-floor(${r.pivotFloor})` : r.name;

describe('point-estimate movement', () => {
  it('quantifies it', () => {
    const prod = JSON.parse(fs.readFileSync(`${OUT}prod-committed-sweep.json`, 'utf8')) as ReturnType<
      typeof sweepCommitted
    >;
    const byKey = new Map(prod.map((r) => [`${r.fixture}#${r.n}`, r]));
    const out: string[] = [];

    for (const rule of RULES) {
      setRatioRule(rule);
      const rows = sweepCommitted();
      const deltas: number[] = [];
      const slackDeltas: number[] = [];
      const worst: { key: string; d: number }[] = [];
      for (const r of rows) {
        const p = byKey.get(`${r.fixture}#${r.n}`);
        if (!p?.ok || !r.ok) continue;
        const a = p.digest!.split(/[|/]/).map(Number);
        const b = r.digest!.split(/[|/]/).map(Number);
        let worstHere = 0;
        for (let i = 0; i < a.length; i++) worstHere = Math.max(worstHere, Math.abs(a[i] - b[i]));
        deltas.push(worstHere);
        slackDeltas.push(Math.abs((p.totalSlack ?? 0) - (r.totalSlack ?? 0)));
        worst.push({ key: `${r.fixture}#${r.n}`, d: worstHere });
      }
      deltas.sort((x, y) => x - y);
      worst.sort((x, y) => y.d - x.d);
      const q = (f: number) => deltas[Math.floor(f * (deltas.length - 1))];
      out.push(
        `${label(rule).padEnd(32)} n=${deltas.length} ` +
          `median=${q(0.5).toExponential(2)} p90=${q(0.9).toExponential(2)} ` +
          `p99=${q(0.99).toExponential(2)} max=${q(1).toExponential(2)} ` +
          `|>1e-3|=${deltas.filter((d) => d > 1e-3).length} ` +
          `maxTotalSlackDelta=${Math.max(...slackDeltas).toExponential(2)}`
      );
      out.push(`    worst 5: ${worst.slice(0, 5).map((w) => `${w.key}=${w.d.toFixed(4)}`).join(' ')}`);
    }
    fs.writeFileSync(`${OUT}out-deltas.txt`, out.join('\n') + '\n');
  });
});
