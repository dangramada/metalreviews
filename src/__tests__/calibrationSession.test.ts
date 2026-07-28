import { describe, it, expect } from 'vitest';
import { CalibrationSession } from '../lib/criteria-calibration/calibrationSession';
import { profileFromNotation } from '../lib/criteria-calibration/preferenceGraph';
import { buildRealSessionAnswers } from '../lib/criteria-calibration/fixtures';

describe('CalibrationSession', () => {
  it('inserts a normal, non-contradictory answer into both the graph and the full log', () => {
    const session = new CalibrationSession();
    const a = profileFromNotation('5-5---');
    const b = profileFromNotation('1-1---');

    const entry = session.recordAnswer(a, b, 'A');

    expect(entry.insertedIntoGraph).toBe(true);
    expect(session.fullLog).toHaveLength(1);
    expect(session.graph.isImplied(a, b)).toEqual({ implied: true, equal: false, winner: 'A' });
  });

  it('routes a contradictory answer around the strict graph but still appends it to the full log', () => {
    const session = new CalibrationSession();
    const a = profileFromNotation('5-5---');
    const b = profileFromNotation('3-3---');
    const c = profileFromNotation('1-1---');

    session.recordAnswer(a, b, 'A'); // A > B
    session.recordAnswer(b, c, 'A'); // B > C, implies A > C

    // C > A directly contradicts the implied A > C.
    const contradictoryEntry = session.recordAnswer(c, a, 'A');

    expect(contradictoryEntry.insertedIntoGraph).toBe(false);
    expect(session.fullLog).toHaveLength(3);
    expect(session.fullLog[2].result).toBe('A'); // the raw answer is preserved as given, unmodified
    // The graph's closure is untouched by the rejected answer — still says A > C, not C > A.
    expect(session.graph.isImplied(a, c)).toEqual({ implied: true, equal: false, winner: 'A' });
  });

  it('throws on cross-degree answers, same as the underlying graph', () => {
    const session = new CalibrationSession();
    const degree2 = profileFromNotation('1-5---');
    const degree3 = profileFromNotation('1-5-2--');

    expect(() => session.recordAnswer(degree2, degree3, 'A')).toThrow(/different degrees/);
  });

  it('records all 31 real historical answers, in order, with none flagged as contradictory', () => {
    // This dataset happens to be fully self-consistent (verified separately against the
    // real export's own reference values) — zero contradictions here is the correct,
    // expected outcome for this specific log, not evidence the routing logic is unused
    // (see the synthetic test above for that).
    const session = new CalibrationSession();
    const answers = buildRealSessionAnswers();

    for (const answer of answers) {
      session.recordAnswer(answer.profileA, answer.profileB, answer.result);
    }

    expect(session.fullLog).toHaveLength(31);
    expect(session.fullLog.every((entry) => entry.insertedIntoGraph)).toBe(true);
  });
});
