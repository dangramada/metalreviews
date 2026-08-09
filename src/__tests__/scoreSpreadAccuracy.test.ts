import { describe, it, expect } from 'vitest';
import type { ComparisonResult, Profile } from '../lib/criteria-calibration/preferenceGraph';
import { CalibrationSession } from '../lib/criteria-calibration/calibrationSession';
import { nextAction } from '../lib/criteria-calibration/elicitationDriver';
import {
  computeScoreSpreadAccuracy,
  defaultSamplePairs,
} from '../lib/criteria-calibration/scoreSpreadAccuracy';
import {
  REAL_SESSION_EXPECTED_VALUES,
  REAL_SESSION_LEVELS_PER_CRITERION,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
  REAL_PRODUCTION_SESSION_ANSWERS,
} from '../lib/criteria-calibration/fixtures';

// Same oracle used by elicitationDriver.test.ts's "oracle-based simulation" describe block —
// every level of every criterion has a known real value, so it can correctly answer ANY
// hypothetical comparison the driver generates, not just a fixed historical sequence.
function oracleAnswer(profileA: Profile, profileB: Profile): ComparisonResult {
  const sum = (p: Profile) =>
    Object.keys(p).reduce(
      (total, key) => total + REAL_SESSION_EXPECTED_VALUES[Number(key)][p[Number(key)]],
      0
    );
  const diff = sum(profileA) - sum(profileB);
  if (Math.abs(diff) < 0.005) return 'equal';
  return diff > 0 ? 'A' : 'B';
}

describe('defaultSamplePairs', () => {
  it('produces exactly C(15,2)=105 pairs — structural cost-regression guard', () => {
    // A future change to the pool size is a deliberate cost/precision trade-off, not
    // something that should happen silently; this pins the count so it fails loudly.
    expect(defaultSamplePairs(REAL_SESSION_LEVELS_PER_CRITERION).length).toBe(105);
    expect(defaultSamplePairs(REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION).length).toBe(105);
  });

  it('is a pure, memoized function of levelsPerCriterion (identical pairs across calls)', () => {
    const a = defaultSamplePairs(REAL_SESSION_LEVELS_PER_CRITERION);
    const b = defaultSamplePairs(REAL_SESSION_LEVELS_PER_CRITERION);
    expect(a).toEqual(b);
  });
});

describe('computeScoreSpreadAccuracy — oracle-based simulation (regression for the accuracy-metric blind spot)', () => {
  const levelsPerCriterion = REAL_SESSION_LEVELS_PER_CRITERION;

  function driveToQuestionCount(target: number): CalibrationSession {
    const session = new CalibrationSession();
    let action = nextAction(session, levelsPerCriterion, 2);
    let currentDegree = 2;
    let asked = 0;

    while (asked < target) {
      if (action.type === 'ask') {
        session.recordAnswer(
          action.profileA,
          action.profileB,
          oracleAnswer(action.profileA, action.profileB)
        );
        asked++;
      } else {
        if (!action.canEscalate) break;
        currentDegree = action.nextDegree!;
      }
      action = nextAction(session, levelsPerCriterion, currentDegree);
    }
    return session;
  }

  function accuracyAt(questionCount: number): number {
    const session = driveToQuestionCount(questionCount);
    const answers = session.fullLog.map((e) => ({
      profileA: e.profileA,
      profileB: e.profileB,
      result: e.result,
    }));
    return computeScoreSpreadAccuracy({ levelsPerCriterion, answers });
  }

  // This is the direct regression test for the Part 4 finding
  // (docs/decisions/criteria-calibration-engine.md): computeSolverAccuracy stayed nearly
  // flat (+0.0006) across the degree-3 refinement window while real rank displacement
  // genuinely improved. The 2026-08-09 measurement pass confirmed computeScoreSpreadAccuracy
  // moves meaningfully through that exact window (+0.127 in the same span) — assert it here
  // so a future change to the metric or its sampling can't silently regress back to the old
  // blind spot without a test noticing.
  it('increases meaningfully across the Q10 -> Q29 -> Q49 milestones', () => {
    const atQ10 = accuracyAt(10);
    const atQ29 = accuracyAt(29);
    const atQ49 = accuracyAt(49);

    expect(atQ29).toBeGreaterThan(atQ10);
    expect(atQ49).toBeGreaterThan(atQ29);

    // Not just "increases" (a single-value-per-axis metric that barely moves would still
    // technically pass a bare `toBeGreaterThan`) — require the improvement to be
    // substantial across the full Q10->Q49 span, matching the magnitude actually measured.
    expect(atQ49 - atQ10).toBeGreaterThan(0.1);
  }, 30_000);

  // Regression guard against the OTHER rejected candidate from the same day: a raw
  // Chebyshev inscribed radius, which saturated to near-zero almost immediately and stayed
  // there — carrying no discriminative signal. Score-spread accuracy should never collapse
  // that way once past initial cold-start coverage.
  it('does not collapse to near-zero once past cold-start coverage (regression for the rejected Chebyshev-radius approach)', () => {
    const atQ10 = accuracyAt(10);
    expect(atQ10).toBeGreaterThan(0.1);
  });
});

describe('computeScoreSpreadAccuracy — real production session (no ground truth, sanity-check only)', () => {
  const levelsPerCriterion = REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION;

  it('moves sensibly (non-decreasing) as more real answers are added, without saturating early', () => {
    const checkpoints = [5, 15, 33];
    const values = checkpoints.map((n) =>
      computeScoreSpreadAccuracy({
        levelsPerCriterion,
        answers: REAL_PRODUCTION_SESSION_ANSWERS.slice(0, n),
      })
    );

    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
    }
    // Still moving at the last checkpoint (not flat-lined at an early plateau) — matches
    // the 2026-08-09 measurement pass's finding that this metric keeps creeping upward in
    // the tail where computeSolverAccuracy had already gone essentially flat.
    expect(values[2] - values[1]).toBeGreaterThan(0.005);
  });

  // Cost sanity bound — generous and CI-noise-tolerant on purpose, not a tight benchmark.
  // Exists to catch a future regression that silently reintroduces an O(n^2)-ish blowup
  // (e.g. a much larger default sample pool), not to enforce a specific performance target.
  it('completes within a generous time budget at the full 33-answer checkpoint', () => {
    const start = Date.now();
    computeScoreSpreadAccuracy({ levelsPerCriterion, answers: REAL_PRODUCTION_SESSION_ANSWERS });
    expect(Date.now() - start).toBeLessThan(3000);
  });
});
