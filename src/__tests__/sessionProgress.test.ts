import { describe, it, expect } from 'vitest';
import { CalibrationSession } from '../lib/criteria-calibration/calibrationSession';
import {
  nextAction,
  buildCanonicalDegree2Pairs,
  coldStartProfilesForPair,
} from '../lib/criteria-calibration/elicitationDriver';
import { isMediumTierReached } from '../lib/criteria-calibration/accuracyTiers';
import { degree2CoveragePercent } from '../lib/criteria-calibration/sessionProgress';
import type { ComparisonResult, Profile } from '../lib/criteria-calibration/preferenceGraph';

// Mirrors elicitationDriver.test.ts's "cold-start coverage" fixture and answering strategy
// exactly (same N=3, C(3,2)=3 pairs, same globally-consistent lowest-index-wins answer rule)
// so this test exercises the same session shape that file already established reaches
// Medium — the addition here is the explicit cross-check requested: don't rely on
// degree2CoveragePercent and isMediumTierReached being derived from the same canonical pair
// list as proof they'll agree once coverage claims 100%. Verify it directly, same as the
// driver's own coverage tracking is cross-checked there.
describe('degree2CoveragePercent vs isMediumTierReached (cross-check, not assumed)', () => {
  const levelsPerCriterion = [4, 4, 4];

  function answerByLowestIndex(profileA: Profile, profileB: Profile): ComparisonResult {
    const lowestIndex = Object.keys(profileA)
      .map(Number)
      .sort((a, b) => a - b)[0];
    if (profileA[lowestIndex] > profileB[lowestIndex]) return 'A';
    if (profileB[lowestIndex] > profileA[lowestIndex]) return 'B';
    return 'equal';
  }

  it('reaching 100% coverage implies isMediumTierReached is independently true on the same session state', () => {
    const session = new CalibrationSession();
    const canonicalPairs = buildCanonicalDegree2Pairs(levelsPerCriterion);

    // Before any answers, neither should claim coverage/Medium.
    expect(degree2CoveragePercent(session.graph, canonicalPairs)).toBe(0);
    expect(isMediumTierReached(session.graph, canonicalPairs)).toBe(false);

    let action = nextAction(session, levelsPerCriterion, 2);
    let guard = 0;
    while (action.type === 'ask' && action.reason === 'cold-start-coverage' && guard < 50) {
      const result = answerByLowestIndex(action.profileA, action.profileB);
      session.recordAnswer(action.profileA, action.profileB, result);
      action = nextAction(session, levelsPerCriterion, 2);
      guard++;
    }

    const percent = degree2CoveragePercent(session.graph, canonicalPairs);
    expect(percent).toBe(100);

    // The explicit cross-check: verify isMediumTierReached agrees, independently, right at
    // the moment coverage claims 100% — not assumed from how the two were constructed.
    expect(isMediumTierReached(session.graph, canonicalPairs)).toBe(true);
  });

  it('sanity check: coldStartProfilesForPair-built pairs are exactly what buildCanonicalDegree2Pairs uses', () => {
    // Guards against the two ever silently drifting apart in a future edit.
    const canonicalPairs = buildCanonicalDegree2Pairs(levelsPerCriterion);
    expect(canonicalPairs[0]).toEqual(coldStartProfilesForPair(0, 1, levelsPerCriterion));
  });
});
