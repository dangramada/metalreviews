import { describe, it, expect } from 'vitest';
import {
  computeCommitState,
  computeStabilityWindowUpdate,
} from '../lib/criteria-calibration/commitComputation';
import {
  INITIAL_PERSISTED_STABILITY_WINDOW,
  type PersistedStabilityWindow,
} from '../lib/criteria-calibration/rankingStabilitySignal';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';
import type { SolverAnswer, ValueSolverResult } from '../lib/criteria-calibration/solver';
import type { CriterionLevelRating } from '../lib/album-rating/scoreAndRank';

// Minimal single-criterion, 2-level solved result — computeStabilityWindowUpdate only reads
// `solved.values` (via toFlatWeights) and `accuracy` (via solverAccuracyTier), so this doesn't
// need a real solveValues run.
function fakeSolved(): ValueSolverResult {
  return {
    levelsPerCriterion: [2],
    values: [
      [
        { point: 0, min: 0, max: 0 }, // level 0, unused
        { point: 0, min: 0, max: 0 }, // level 1
        { point: 1, min: 1, max: 1 }, // level 2
      ],
    ],
    totalSlack: 0,
    perAnswerSlack: [],
  };
}

const HIGH_ACCURACY = 1; // comfortably clears every accuracyTiers.ts threshold, incl. High/veryHigh

describe('computeCommitState — answerCount', () => {
  const catalog: CriteriaCatalog = {
    entries: [{ index: 0, name: 'Test criterion', levels: { 1: 'a', 2: 'b' } }],
    levelsPerCriterion: [2],
  } as unknown as CriteriaCatalog;

  it('reports answers.length as answerCount, threaded through to upsertWeightsAndStatus (write-race guard)', () => {
    const answers: SolverAnswer[] = [
      { profileA: { 0: 2 }, profileB: { 0: 1 }, result: 'A' },
      { profileA: { 0: 2 }, profileB: { 0: 1 }, result: 'A' },
      { profileA: { 0: 2 }, profileB: { 0: 1 }, result: 'A' },
    ];
    const computation = computeCommitState(catalog, answers);
    expect(computation.answerCount).toBe(3);
  });

  it('is 0 for an empty answer log', () => {
    const computation = computeCommitState(catalog, []);
    expect(computation.answerCount).toBe(0);
  });
});

describe('computeStabilityWindowUpdate — untrustworthy RANKING_TEST_SET ratings', () => {
  it('zero ratings returned: window never fires, no matter how many commits are processed', () => {
    const emptyRatings = new Map<string, CriterionLevelRating[]>();
    let window: PersistedStabilityWindow = INITIAL_PERSISTED_STABILITY_WINDOW;

    for (let answerIndex = 1; answerIndex <= 50; answerIndex++) {
      const update = computeStabilityWindowUpdate(answerIndex, fakeSolved(), HIGH_ACCURACY, {
        previous: window,
        ratingsByAlbum: emptyRatings,
      });
      // Untrustworthy ratings must skip the checkpoint entirely, not merely "not fire yet".
      expect(update).toBeUndefined();
      window = update ?? window;
    }

    expect(window).toEqual(INITIAL_PERSISTED_STABILITY_WINDOW);
    expect(window.current.fired).toBe(false);
  });

  it('partial ratings (1-9 of 13 albums): same treatment, never fires', () => {
    const partialRatings = new Map<string, CriterionLevelRating[]>();
    for (let i = 0; i < 9; i++) {
      partialRatings.set(`album-${i}`, [{ criterionId: 0, level: 2 }]);
    }
    let window: PersistedStabilityWindow = INITIAL_PERSISTED_STABILITY_WINDOW;

    for (let answerIndex = 1; answerIndex <= 50; answerIndex++) {
      const update = computeStabilityWindowUpdate(answerIndex, fakeSolved(), HIGH_ACCURACY, {
        previous: window,
        ratingsByAlbum: partialRatings,
      });
      expect(update).toBeUndefined();
      window = update ?? window;
    }

    expect(window).toEqual(INITIAL_PERSISTED_STABILITY_WINDOW);
    expect(window.current.fired).toBe(false);
  });

  it('sanity check: >=10 ratings DOES advance the window (control for the two tests above)', () => {
    const fullRatings = new Map<string, CriterionLevelRating[]>();
    for (let i = 0; i < 10; i++) {
      fullRatings.set(`album-${i}`, [{ criterionId: 0, level: 2 }]);
    }
    const update = computeStabilityWindowUpdate(1, fakeSolved(), HIGH_ACCURACY, {
      previous: INITIAL_PERSISTED_STABILITY_WINDOW,
      ratingsByAlbum: fullRatings,
    });
    expect(update).toBeDefined();
    expect(update!.current.lastEligibleTop10).not.toBeNull();
  });
});
