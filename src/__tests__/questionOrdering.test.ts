import { describe, it, expect } from 'vitest';
import {
  rankCandidatesByAmbiguity,
  type CandidatePair,
} from '../lib/criteria-calibration/questionOrdering';
import { solveValues } from '../lib/criteria-calibration/solver';
import {
  buildRealSessionAnswers,
  REAL_SESSION_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';

describe('rankCandidatesByAmbiguity', () => {
  const answers = buildRealSessionAnswers();
  const result = solveValues({ levelsPerCriterion: REAL_SESSION_LEVELS_PER_CRITERION, answers });

  it('ranks a pair with near-identical estimates ahead of a pair with a large estimate gap', () => {
    const closePair: CandidatePair = {
      profileA: { 0: 3 }, // Some innovation, point ≈ 0.17
      profileB: { 2: 3 }, // Competent, point ≈ 0.15-0.18 (close to the above)
    };
    const farPair: CandidatePair = {
      profileA: { 0: 5 }, // Revolutionary, near the top of its criterion
      profileB: { 0: 1 }, // Uninspired, fixed at 0 — maximally far apart
    };

    const ranked = rankCandidatesByAmbiguity([farPair, closePair], result.values);

    expect(ranked[0]).toBe(closePair);
    expect(ranked[1]).toBe(farPair);
  });

  it('is a pure reordering — same candidates in, same candidates out', () => {
    const candidates: CandidatePair[] = [
      { profileA: { 1: 2 }, profileB: { 1: 4 } },
      { profileA: { 3: 1 }, profileB: { 3: 5 } },
      { profileA: { 4: 3 }, profileB: { 4: 3 } },
    ];

    const ranked = rankCandidatesByAmbiguity(candidates, result.values);

    expect(ranked).toHaveLength(candidates.length);
    expect(new Set(ranked)).toEqual(new Set(candidates));
  });
});
