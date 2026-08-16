// Companion to lab.vitest.config.ts, added 2026-08-16 when the Harris rule shipped.
//
// Identical except for the one thing that matters: NO simplex alias. The diagnostic's whole
// design was to drive the real production stack with only the leaving-row choice swapped out
// for a lab copy — perfect for comparing candidate rules, but it means every number it
// produced came from simplexLab.ts. Once a rule actually ships, that is no longer the
// question; the question is whether the shipped simplex.ts reproduces those numbers. Running
// the same suites under this config answers it directly, because without the alias
// solver.ts and scoreSpreadAccuracy.ts import the real ./simplex.js.
//
// `setRatioRule` becomes inert under this config (nothing loads simplexLab), so suites that
// iterate over candidate rules will just run the production rule repeatedly. Only the suites
// that are meaningful this way are worth running here — oracles, and adversarial with
// LAB_PROD_SIMPLEX=1 (which additionally redirects that file's own direct solveLP import).
//
// Run:  LAB_PROD_SIMPLEX=1 npx vitest run --config scripts/lab-eps-ratio-test-2026-08-16/lab.prod.vitest.config.ts [name]
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

export default {
  root: REPO,
  test: {
    globals: true,
    environment: 'node',
    include: [path.join(HERE, '*.labtest.ts')],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
    pool: 'forks',
  },
};
