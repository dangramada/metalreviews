// Pins what SOLVER_CRASH_ANSWERS means NOW. It used to assert the opposite.
//
// History, because the inversion is the point: this 44-answer log (produced by the real
// elicitation driver, not synthesised) broke the solver at n=44 and solved at n=43, and this
// file asserted exactly that — deliberately, so the safety-net tests in
// CriteriaCalibrationPage.solverCrash.test.tsx could not silently start passing against an
// input that no longer exercised anything. deferred-work.md item 3 predicted this file would
// fail when the EPS = 1e-9 ratio-test cure landed, and it did.
//
// The cure landed on 2026-08-16 (Harris two-pass ratio test, see simplex.ts). The assertion
// is inverted rather than deleted: the log solving cleanly is now a real property worth
// protecting, since a regression in the ratio test would show up here first, on a known-hard
// real input. The safety-net tests no longer depend on this log's numerics at all — they
// inject a throwing solver, so the guard this file used to provide is no longer needed.
import { describe, it, expect } from 'vitest';
import { solveValues } from '../lib/criteria-calibration/solver';
import {
  SOLVER_CRASH_ANSWERS,
  SOLVER_CRASH_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';

describe('SOLVER_CRASH_ANSWERS fixture (cured by the Harris ratio test)', () => {
  it('no longer makes the solver throw at n=44', () => {
    expect(() =>
      solveValues({
        levelsPerCriterion: SOLVER_CRASH_LEVELS_PER_CRITERION,
        answers: SOLVER_CRASH_ANSWERS,
      })
    ).not.toThrow();
  });

  it('still solves at n=43, so the fix added a case rather than trading one for another', () => {
    expect(() =>
      solveValues({
        levelsPerCriterion: SOLVER_CRASH_LEVELS_PER_CRITERION,
        answers: SOLVER_CRASH_ANSWERS.slice(0, -1),
      })
    ).not.toThrow();
  });
});
