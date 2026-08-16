// Pins the properties SOLVER_CRASH_ANSWERS has to keep for the safety-net tests
// (CriteriaCalibrationPage.solverCrash.test.tsx) to be exercising anything real.
//
// The point of asserting that the solver still THROWS: the EPS = 1e-9 ratio-test root-cause
// fix is separate, scheduled work (deferred-work.md item 3). When it lands, this log will
// very likely stop breaking down — and if that happened silently, every safety-net test
// would keep passing while testing nothing at all. This test turns that into a loud,
// self-explanatory failure instead.
import { describe, it, expect } from 'vitest';
import { solveValues } from '../lib/criteria-calibration/solver';
import {
  SOLVER_CRASH_ANSWERS,
  SOLVER_CRASH_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';

describe('SOLVER_CRASH_ANSWERS fixture', () => {
  it('still makes the solver throw at n=44', () => {
    expect(() =>
      solveValues({
        levelsPerCriterion: SOLVER_CRASH_LEVELS_PER_CRITERION,
        answers: SOLVER_CRASH_ANSWERS,
      })
    ).toThrow(
      // Matching the Chebyshev message specifically, not just "throws": a phase-1 throw
      // would be a different failure mode and shouldn't quietly satisfy this.
      /Chebyshev-center solve failed/
    );
  });

  it('solves cleanly at n=43, so trimming one answer is a real recovery', () => {
    expect(() =>
      solveValues({
        levelsPerCriterion: SOLVER_CRASH_LEVELS_PER_CRITERION,
        answers: SOLVER_CRASH_ANSWERS.slice(0, -1),
      })
    ).not.toThrow();
  });
});
