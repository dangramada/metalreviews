import { describe, it, expect } from 'vitest';
import { CalibrationSession } from '../lib/criteria-calibration/calibrationSession';
import {
  nextAction,
  buildCanonicalDegree2Pairs,
  coldStartProfilesForPair,
} from '../lib/criteria-calibration/elicitationDriver';
import { degree2CoveragePercent } from '../lib/criteria-calibration/sessionProgress';
import type { ComparisonResult, Profile } from '../lib/criteria-calibration/preferenceGraph';

// Mirrors elicitationDriver.test.ts's "cold-start coverage" fixture and answering strategy
// exactly (same N=3, C(3,2)=3 pairs, same globally-consistent lowest-index-wins answer rule).
//
// As of 2026-08-08 (see docs/decisions/criteria-calibration-medium-gate-redesign.md),
// degree2CoveragePercent and isMediumTierReached are no longer expected to agree at
// 100%/true — Medium is now a solver-accuracy threshold, independent of pair coverage
// (buildCanonicalDegree2Pairs still backs degree2CoveragePercent's progress display only).
// This file therefore only tests degree2CoveragePercent's own coverage-tracking
// correctness; the former cross-check against isMediumTierReached was removed since its
// premise (the two are derived from the same canonical pair list) no longer holds — see
// elicitationDriver.test.ts / accuracyTiers.test.ts for isMediumTierReached's own coverage.
describe('degree2CoveragePercent', () => {
  const levelsPerCriterion = [4, 4, 4];

  function answerByLowestIndex(profileA: Profile, profileB: Profile): ComparisonResult {
    const lowestIndex = Object.keys(profileA)
      .map(Number)
      .sort((a, b) => a - b)[0];
    if (profileA[lowestIndex] > profileB[lowestIndex]) return 'A';
    if (profileB[lowestIndex] > profileA[lowestIndex]) return 'B';
    return 'equal';
  }

  it('reaches 100% exactly when every canonical pair has been directly answered', () => {
    const session = new CalibrationSession();
    const canonicalPairs = buildCanonicalDegree2Pairs(levelsPerCriterion);

    expect(degree2CoveragePercent(session.graph, canonicalPairs)).toBe(0);

    let action = nextAction(session, levelsPerCriterion, 2);
    let guard = 0;
    while (action.type === 'ask' && action.reason === 'cold-start-coverage' && guard < 50) {
      const result = answerByLowestIndex(action.profileA, action.profileB);
      session.recordAnswer(action.profileA, action.profileB, result);
      action = nextAction(session, levelsPerCriterion, 2);
      guard++;
    }

    expect(degree2CoveragePercent(session.graph, canonicalPairs)).toBe(100);
  });

  it('sanity check: coldStartProfilesForPair-built pairs are exactly what buildCanonicalDegree2Pairs uses', () => {
    // Guards against the two ever silently drifting apart in a future edit.
    const canonicalPairs = buildCanonicalDegree2Pairs(levelsPerCriterion);
    expect(canonicalPairs[0]).toEqual(coldStartProfilesForPair(0, 1, levelsPerCriterion));
  });
});
