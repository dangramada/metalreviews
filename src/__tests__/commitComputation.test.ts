import { describe, it, expect } from 'vitest';
import { computeCommitState } from '../lib/criteria-calibration/commitComputation';
import type { CriteriaCatalog } from '../lib/criteria-calibration/criteriaCatalog';
import type { SolverAnswer } from '../lib/criteria-calibration/solver';

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
