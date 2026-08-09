import { describe, it, expect } from 'vitest';
import {
  isMediumTierReached,
  solverAccuracyTier,
  SCORE_SPREAD_MEDIUM_THRESHOLD,
  SCORE_SPREAD_HIGH_THRESHOLD,
  SCORE_SPREAD_VERY_HIGH_THRESHOLD,
} from '../lib/criteria-calibration/accuracyTiers';

// 2026-08-08: Medium tier's definition changed from "every canonical degree-2 pair
// resolved via the strict graph's closure" to a solver-accuracy threshold — see
// docs/decisions/criteria-calibration-medium-gate-redesign.md. The old pair-coverage
// definition measured bookkeeping, not actual model determinacy: a real production
// account reached the old Medium at 0.60 solver accuracy with levels 2-4 completely
// unconstrained for every criterion.
//
// 2026-08-09: the accuracy value fed to isMediumTierReached/solverAccuracyTier switched
// from computeSolverAccuracy to computeScoreSpreadAccuracy (see scoreSpreadAccuracy.ts and
// its own test file) — computeSolverAccuracy was found blind to real ranking improvement
// from degree-3+ answers (docs/decisions/criteria-calibration-engine.md's "Part 4
// finding") and is kept only as unused, deprecated code for rollback safety. These two
// functions' own signatures ((accuracy: number) => ...) are metric-agnostic and unchanged
// by that switch — only the thresholds they compare against did.
describe('isMediumTierReached (Part C — Medium, redefined 2026-08-08, re-thresholded 2026-08-09)', () => {
  it('respects the documented threshold boundary', () => {
    expect(isMediumTierReached(SCORE_SPREAD_MEDIUM_THRESHOLD)).toBe(true);
    expect(isMediumTierReached(SCORE_SPREAD_MEDIUM_THRESHOLD - 0.01)).toBe(false);
  });

  it('is false for low accuracy and true for high accuracy', () => {
    expect(isMediumTierReached(0)).toBe(false);
    expect(isMediumTierReached(1)).toBe(true);
  });
});

describe('solverAccuracyTier (Part C — High / Very High, re-thresholded 2026-08-09)', () => {
  it('respects the documented threshold boundaries', () => {
    expect(solverAccuracyTier(SCORE_SPREAD_HIGH_THRESHOLD)).toBe('high');
    expect(solverAccuracyTier(SCORE_SPREAD_HIGH_THRESHOLD - 0.01)).toBe('insufficient');
    expect(solverAccuracyTier(SCORE_SPREAD_VERY_HIGH_THRESHOLD)).toBe('veryHigh');
    expect(solverAccuracyTier(SCORE_SPREAD_VERY_HIGH_THRESHOLD - 0.01)).toBe('high');
  });
});
