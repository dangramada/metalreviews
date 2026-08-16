// Vitest config for the EPS ratio-test lab (2026-08-16), read-only diagnostic.
//
// The alias is the whole trick: production's two `./simplex.js` importers (solver.ts and
// scoreSpreadAccuracy.ts) are redirected at simplexLab.ts, so the FULL production stack —
// nextAction, CalibrationSession, computeCommitState, solveValues — can be driven under any
// candidate ratio-test rule without editing a single production file. `setRatioRule` then
// switches rules at runtime.
//
// Run:  npx vitest run --config scripts/lab-eps-ratio-test-2026-08-16/lab.vitest.config.ts [name]
// (`sweepProd.ts` is run separately, under plain tsx, so it exercises the REAL simplex — that
// is what the baseline-parity check in levelA.labtest.ts diffs against.)
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

export default {
  root: REPO,
  resolve: {
    alias: [{ find: /^\.\/simplex\.js$/, replacement: path.join(HERE, 'simplexLab.ts') }],
  },
  test: {
    globals: true,
    environment: 'node',
    include: [path.join(HERE, '*.labtest.ts')],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
    pool: 'forks',
  },
};
