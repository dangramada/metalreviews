// Baseline capture against the UNMODIFIED production simplex (run via plain tsx, no alias).
import * as fs from 'node:fs';
import { sweepCommitted } from './sweepCore.js';
const rows = sweepCommitted();
fs.writeFileSync(
  new URL('./out/prod-committed-sweep.json', import.meta.url).pathname,
  JSON.stringify(rows, null, 0)
);
const fails = rows.filter((r) => !r.ok);
console.log(`prod sweep: ${rows.length} solves, ${fails.length} failures`);
for (const f of fails) console.log(`  FAIL ${f.fixture} n=${f.n}: ${f.err?.slice(0, 200)}`);
