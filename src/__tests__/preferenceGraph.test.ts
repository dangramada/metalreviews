import { describe, it, expect } from 'vitest';
import {
  PreferenceGraph,
  profileFromNotation,
  inferDegreeFromAnswers,
} from '../lib/criteria-calibration/preferenceGraph';
import {
  buildHistoricalFixture,
  DEFAULT_FIXTURE_CONFIG,
} from '../lib/criteria-calibration/fixtures';

describe('preferenceGraph', () => {
  it('processes the degree ramp 2 -> 3 -> 4 -> 5 without error, in order', () => {
    const rounds = buildHistoricalFixture();
    const degreesSeen: number[] = [];
    const graph = new PreferenceGraph({
      numCriteria: DEFAULT_FIXTURE_CONFIG.numCriteria,
      levelsPerCriterion: DEFAULT_FIXTURE_CONFIG.levelsPerCriterion,
    });

    for (const round of rounds) {
      if (degreesSeen[degreesSeen.length - 1] !== round.degree) {
        degreesSeen.push(round.degree);
      }
      expect(() => graph.insertAnswer(round.profileA, round.profileB, round.result)).not.toThrow();
    }

    expect(degreesSeen).toEqual([2, 3, 4, 5]);

    const counts = rounds.reduce<Record<number, number>>((acc, r) => {
      acc[r.degree] = (acc[r.degree] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ 2: 20, 3: 7, 4: 2, 5: 2 });
  });

  it('inserts a strict preference edge and reports it via isImplied', () => {
    const graph = new PreferenceGraph();
    const a = profileFromNotation('1-5---');
    const b = profileFromNotation('3-3---');

    graph.insertAnswer(a, b, 'A');

    expect(graph.isImplied(a, b)).toEqual({ implied: true, equal: false, winner: 'A' });
  });

  it('inserts an equivalence and reports profiles as equal', () => {
    const graph = new PreferenceGraph();
    const a = profileFromNotation('2-4---');
    const b = profileFromNotation('4-2---');

    graph.insertAnswer(a, b, 'equal');

    expect(graph.isImplied(a, b)).toEqual({ implied: true, equal: true });
  });

  it('resolves a chain of 3+ preferences at the same degree via transitive closure', () => {
    const graph = new PreferenceGraph();
    const a = profileFromNotation('5-5---');
    const b = profileFromNotation('3-3---');
    const c = profileFromNotation('1-1---');
    const d = profileFromNotation('1-2---');

    graph.insertAnswer(a, b, 'A'); // A > B
    graph.insertAnswer(b, c, 'A'); // B > C
    graph.insertAnswer(c, d, 'A'); // C > D

    // Not directly inserted, but implied by the chain: A > D
    expect(graph.isImplied(a, d)).toEqual({ implied: true, equal: false, winner: 'A' });
    expect(graph.isImplied(a, c)).toEqual({ implied: true, equal: false, winner: 'A' });
  });

  it('folds an equivalence into the closure so a preference on one side transfers to the other', () => {
    const graph = new PreferenceGraph();
    const a = profileFromNotation('4-4---');
    const b = profileFromNotation('4-3---'); // equivalent to A for this test's purposes
    const c = profileFromNotation('1-1---');

    graph.insertAnswer(a, b, 'equal');
    graph.insertAnswer(b, c, 'A'); // B > C, and B ≡ A, so A > C should be implied

    expect(graph.isImplied(a, c)).toEqual({ implied: true, equal: false, winner: 'A' });
  });

  it('detects a pair already implied by closure without needing a direct edge', () => {
    const graph = new PreferenceGraph();
    const a = profileFromNotation('5-1-1--');
    const b = profileFromNotation('3-1-1--');
    const c = profileFromNotation('1-1-1--');

    expect(graph.isImplied(a, c)).toEqual({ implied: false });

    graph.insertAnswer(a, b, 'A');
    graph.insertAnswer(b, c, 'A');

    const implied = graph.isImplied(a, c);
    expect(implied.implied).toBe(true);
    expect(implied).toEqual({ implied: true, equal: false, winner: 'A' });
  });

  it('returns not-implied for profiles of different degrees', () => {
    const graph = new PreferenceGraph();
    const degree2 = profileFromNotation('1-5---');
    const degree3 = profileFromNotation('1-5-2--');

    expect(graph.isImplied(degree2, degree3)).toEqual({ implied: false });
  });

  it('throws when a comparison round mixes degrees', () => {
    const graph = new PreferenceGraph();
    const degree2 = profileFromNotation('1-5---');
    const degree3 = profileFromNotation('1-5-2--');

    expect(() => graph.insertAnswer(degree2, degree3, 'A')).toThrow(/different degrees/);
  });

  it('throws on a contradictory cycle (C > A after A > B > C already implies A > C)', () => {
    const graph = new PreferenceGraph();
    const a = profileFromNotation('5-5---');
    const b = profileFromNotation('3-3---');
    const c = profileFromNotation('1-1---');

    graph.insertAnswer(a, b, 'A');
    graph.insertAnswer(b, c, 'A');

    expect(() => graph.insertAnswer(c, a, 'A')).toThrow(/[Cc]ontradiction/);
  });

  it('throws when marking equal a pair that already has a strict preference', () => {
    const graph = new PreferenceGraph();
    const a = profileFromNotation('5-5---');
    const b = profileFromNotation('1-1---');

    graph.insertAnswer(a, b, 'A');

    expect(() => graph.insertAnswer(a, b, 'equal')).toThrow(/[Cc]ontradiction/);
  });
});

describe('inferDegreeFromAnswers', () => {
  it('returns startingDegree for an empty answer log', () => {
    expect(inferDegreeFromAnswers([], 2)).toBe(2);
  });

  it('returns startingDegree when every answer is at or below it', () => {
    const answers = [
      { profileA: profileFromNotation('5-5---') }, // degree 2
      { profileA: profileFromNotation('3-----') }, // degree 1
    ];
    expect(inferDegreeFromAnswers(answers, 2)).toBe(2);
  });

  it('returns the highest degree seen across the answer log', () => {
    const answers = [
      { profileA: profileFromNotation('5-5---') }, // degree 2
      { profileA: profileFromNotation('5-5-5-') }, // degree 3
      { profileA: profileFromNotation('3-----') }, // degree 1
    ];
    expect(inferDegreeFromAnswers(answers, 2)).toBe(3);
  });

  it('drops back down when the highest-degree answers are removed (Undo simulation)', () => {
    const fullLog = [
      { profileA: profileFromNotation('5-5---') }, // degree 2
      { profileA: profileFromNotation('5-5-5-') }, // degree 3
      { profileA: profileFromNotation('5-5-5-5') }, // degree 4
    ];
    expect(inferDegreeFromAnswers(fullLog, 2)).toBe(4);

    const afterUndoingDegree4 = fullLog.slice(0, -1);
    expect(inferDegreeFromAnswers(afterUndoingDegree4, 2)).toBe(3);
  });
});
