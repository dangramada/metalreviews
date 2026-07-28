import { describe, it, expect } from 'vitest';
import { PreferenceGraph, profileFromNotation } from '../lib/criteria-calibration/preferenceGraph';
import {
  isMediumTierReached,
  computeSolverAccuracy,
  solverAccuracyTier,
  HIGH_ACCURACY_THRESHOLD,
  VERY_HIGH_ACCURACY_THRESHOLD,
  type ComparisonPair,
} from '../lib/criteria-calibration/accuracyTiers';
import { solveValues } from '../lib/criteria-calibration/solver';
import {
  buildRealSessionAnswers,
  REAL_SESSION_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';

describe('isMediumTierReached (Part C — Medium)', () => {
  it('is false until every degree-2 pair is resolved', () => {
    const graph = new PreferenceGraph();
    const pairs: ComparisonPair[] = [
      { profileA: profileFromNotation('1-5---'), profileB: profileFromNotation('3-3---') },
      { profileA: profileFromNotation('2-4---'), profileB: profileFromNotation('4-2---') },
    ];

    expect(isMediumTierReached(graph, pairs)).toBe(false);

    graph.insertAnswer(pairs[0].profileA, pairs[0].profileB, 'A');
    expect(isMediumTierReached(graph, pairs)).toBe(false); // second pair still unresolved

    graph.insertAnswer(pairs[1].profileA, pairs[1].profileB, 'equal');
    expect(isMediumTierReached(graph, pairs)).toBe(true);
  });

  it('counts a pair resolved via isImplied (closure), not just a direct answer', () => {
    const graph = new PreferenceGraph();
    const a = profileFromNotation('5-5---');
    const b = profileFromNotation('3-3---');
    const c = profileFromNotation('1-1---');

    graph.insertAnswer(a, b, 'A');
    graph.insertAnswer(b, c, 'A');

    // A vs C was never directly answered, only implied by the chain.
    expect(isMediumTierReached(graph, [{ profileA: a, profileB: c }])).toBe(true);
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
