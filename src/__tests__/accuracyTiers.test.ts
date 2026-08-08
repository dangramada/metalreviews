import { describe, it, expect } from 'vitest';
import {
  isMediumTierReached,
  computeSolverAccuracy,
  solverAccuracyTier,
  MEDIUM_ACCURACY_THRESHOLD,
  HIGH_ACCURACY_THRESHOLD,
  VERY_HIGH_ACCURACY_THRESHOLD,
} from '../lib/criteria-calibration/accuracyTiers';
import { solveValues } from '../lib/criteria-calibration/solver';
import {
  buildRealSessionAnswers,
  REAL_SESSION_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';

// 2026-08-08: Medium tier's definition changed from "every canonical degree-2 pair
// resolved via the strict graph's closure" to a solver-accuracy threshold — see
// docs/decisions/criteria-calibration-medium-gate-redesign.md. The old pair-coverage
// definition measured bookkeeping, not actual model determinacy: a real production
// account reached the old Medium at 0.60 solver accuracy with levels 2-4 completely
// unconstrained for every criterion.
describe('isMediumTierReached (Part C — Medium, redefined 2026-08-08)', () => {
  it('respects the documented threshold boundary', () => {
    expect(isMediumTierReached(MEDIUM_ACCURACY_THRESHOLD)).toBe(true);
    expect(isMediumTierReached(MEDIUM_ACCURACY_THRESHOLD - 0.01)).toBe(false);
  });

  it('is false for low accuracy and true for high accuracy', () => {
    expect(isMediumTierReached(0)).toBe(false);
    expect(isMediumTierReached(1)).toBe(true);
  });
});

describe('computeSolverAccuracy / solverAccuracyTier (Part C — High / Very High, proposed)', () => {
  it('reports full accuracy (1.0) when every free value is fully pinned (zero-width ranges)', () => {
    const accuracy = computeSolverAccuracy({
      levelsPerCriterion: [3],
      values: [
        [
          undefined as never,
          { point: 0, min: 0, max: 0 },
          { point: 0.5, min: 0.5, max: 0.5 },
          { point: 1, min: 1, max: 1 },
        ],
      ],
      totalSlack: 0,
      perAnswerSlack: [],
    });
    expect(accuracy).toBe(1);
    expect(solverAccuracyTier(accuracy)).toBe('veryHigh');
  });

  it('reports low accuracy when ranges are wide (0 to 1 full-scale uncertainty)', () => {
    const accuracy = computeSolverAccuracy({
      levelsPerCriterion: [3],
      values: [
        [
          undefined as never,
          { point: 0, min: 0, max: 0 },
          { point: 0.5, min: 0, max: 1 },
          { point: 0.5, min: 0, max: 1 },
        ],
      ],
      totalSlack: 0,
      perAnswerSlack: [],
    });
    expect(accuracy).toBe(0);
    expect(solverAccuracyTier(accuracy)).toBe('insufficient');
  });

  it('respects the documented threshold boundaries', () => {
    expect(solverAccuracyTier(HIGH_ACCURACY_THRESHOLD)).toBe('high');
    expect(solverAccuracyTier(HIGH_ACCURACY_THRESHOLD - 0.01)).toBe('insufficient');
    expect(solverAccuracyTier(VERY_HIGH_ACCURACY_THRESHOLD)).toBe('veryHigh');
    expect(solverAccuracyTier(VERY_HIGH_ACCURACY_THRESHOLD - 0.01)).toBe('high');
  });

  it('computes the actual accuracy reached by the real 31-answer historical session (diagnostic)', () => {
    // Not a pass/fail bar on a specific number — this documents what the real session's
    // shape actually produces under our proposed formula, so the thresholds above can be
    // sanity-checked against it rather than guessed blind.
    const answers = buildRealSessionAnswers();
    const result = solveValues({ levelsPerCriterion: REAL_SESSION_LEVELS_PER_CRITERION, answers });
    const accuracy = computeSolverAccuracy(result);
    expect(accuracy).toBeGreaterThan(0);
    expect(accuracy).toBeLessThanOrEqual(1);
  });
});
