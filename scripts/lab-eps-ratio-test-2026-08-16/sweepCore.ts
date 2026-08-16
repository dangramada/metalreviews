// Shared sweep logic for the EPS = 1e-9 ratio-test diagnostic (2026-08-16).
//
// Imported by BOTH:
//   - sweepProd.ts, run under plain `tsx` (no alias) -> exercises the real production simplex
//   - levelA.labtest.ts, run under vitest with the lab alias -> exercises simplexLab.ts
// so "baseline reproduces production exactly" is a diff of two runs of identical code, not an
// assertion about two parallel implementations.

import { solveValues } from '../../src/lib/criteria-calibration/solver.js';
import type { SolverAnswer } from '../../src/lib/criteria-calibration/solver.js';
import {
  buildRealSessionAnswers,
  REAL_SESSION_LEVELS_PER_CRITERION,
  N42_REPRO_ANSWERS,
  N42_REPRO_LEVELS_PER_CRITERION,
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
  DEGREE_ANOMALY_SESSION_ANSWERS,
  DEGREE_ANOMALY_SESSION_LEVELS_PER_CRITERION,
  SOLVER_CRASH_ANSWERS,
  SOLVER_CRASH_LEVELS_PER_CRITERION,
} from '../../src/lib/criteria-calibration/fixtures.js';

export interface Fixture {
  name: string;
  levelsPerCriterion: number[];
  answers: SolverAnswer[];
}

export const COMMITTED_FIXTURES: Fixture[] = [
  {
    name: 'real-session-n31',
    levelsPerCriterion: REAL_SESSION_LEVELS_PER_CRITERION,
    answers: buildRealSessionAnswers(),
  },
  {
    name: 'n42-repro',
    levelsPerCriterion: N42_REPRO_LEVELS_PER_CRITERION,
    answers: N42_REPRO_ANSWERS,
  },
  {
    name: 'real-production-n33',
    levelsPerCriterion: REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
    answers: REAL_PRODUCTION_SESSION_ANSWERS,
  },
  {
    name: 'degree-anomaly-n31',
    levelsPerCriterion: DEGREE_ANOMALY_SESSION_LEVELS_PER_CRITERION,
    answers: DEGREE_ANOMALY_SESSION_ANSWERS,
  },
  {
    name: 'solver-crash-n44',
    levelsPerCriterion: SOLVER_CRASH_LEVELS_PER_CRITERION,
    answers: SOLVER_CRASH_ANSWERS,
  },
];

export interface SolveRecord {
  fixture: string;
  n: number;
  ok: boolean;
  /** Trimmed error message when !ok — the LP diagnostics string. */
  err?: string;
  /** Digest of the solved point estimates, so parity is checked on VALUES not just on
   *  pass/fail. Rounded to 1e-9; anything coarser could hide a real numerical divergence. */
  digest?: string;
  totalSlack?: number;
}

export function solveRecord(fx: Fixture, n: number): SolveRecord {
  try {
    const r = solveValues({
      levelsPerCriterion: fx.levelsPerCriterion,
      answers: fx.answers.slice(0, n),
    });
    const digest = r.values
      .map((perLevel, c) =>
        perLevel
          .slice(1, fx.levelsPerCriterion[c] + 1)
          .map((v) => v.point.toFixed(9))
          .join('/')
      )
      .join('|');
    return { fixture: fx.name, n, ok: true, digest, totalSlack: Number(r.totalSlack.toFixed(12)) };
  } catch (e) {
    return {
      fixture: fx.name,
      n,
      ok: false,
      err: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Every prefix of every committed fixture — the same "re-solve at every prefix" method the
 *  solver-crash safety net used to check Dan's real 71-answer log. */
export function sweepCommitted(): SolveRecord[] {
  const out: SolveRecord[] = [];
  for (const fx of COMMITTED_FIXTURES) {
    for (let n = 1; n <= fx.answers.length; n++) out.push(solveRecord(fx, n));
  }
  return out;
}
