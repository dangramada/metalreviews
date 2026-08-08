import { describe, it, expect } from 'vitest';
import { PreferenceGraph } from '../lib/criteria-calibration/preferenceGraph';
import type { ComparisonResult, Profile } from '../lib/criteria-calibration/preferenceGraph';
import { CalibrationSession } from '../lib/criteria-calibration/calibrationSession';
import {
  enumerateCriterionPairs,
  coldStartProfilesForPair,
  buildCanonicalDegree2Pairs,
  generateCandidatesForSubset,
  nextAction,
} from '../lib/criteria-calibration/elicitationDriver';
import {
  isMediumTierReached,
  computeSolverAccuracy,
  MEDIUM_ACCURACY_THRESHOLD,
} from '../lib/criteria-calibration/accuracyTiers';
import { solveValues } from '../lib/criteria-calibration/solver';
import {
  REAL_SESSION_EXPECTED_VALUES,
  REAL_SESSION_LEVELS_PER_CRITERION,
} from '../lib/criteria-calibration/fixtures';

describe('enumerateCriterionPairs', () => {
  it('generates exactly C(N,2) pairs, generic over N', () => {
    expect(enumerateCriterionPairs(6)).toHaveLength(15);
    expect(enumerateCriterionPairs(5)).toHaveLength(10);
    expect(enumerateCriterionPairs(3)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });
});

describe('coldStartProfilesForPair', () => {
  it("asks the maximal-contrast trade-off using each criterion's actual max level", () => {
    const { profileA, profileB } = coldStartProfilesForPair(0, 2, [5, 5, 3, 5]);
    expect(profileA).toEqual({ 0: 5, 2: 1 });
    expect(profileB).toEqual({ 0: 1, 2: 3 });
  });
});

describe('buildCanonicalDegree2Pairs', () => {
  it('produces one comparison per pair, matching enumerateCriterionPairs count', () => {
    expect(buildCanonicalDegree2Pairs([5, 5, 5, 5, 5, 5])).toHaveLength(15);
  });
});

function isDominatedOrTied(profileA: Profile, profileB: Profile): boolean {
  const keys = Object.keys(profileA).map(Number);
  let sawAGreater = false;
  let sawBGreater = false;
  for (const idx of keys) {
    if (profileA[idx] > profileB[idx]) sawAGreater = true;
    if (profileB[idx] > profileA[idx]) sawBGreater = true;
  }
  return !(sawAGreater && sawBGreater);
}

describe('generateCandidatesForSubset — dominance filter', () => {
  it('never emits a dominated or tied pair, across many subsets/degrees', () => {
    const levelsPerCriterion = [5, 5, 5, 5, 5, 5];
    const subsets: number[][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [0, 5],
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 4],
      [0, 2, 4],
      [0, 1, 2, 3],
      [2, 3, 4, 5],
    ];
    let totalCandidates = 0;
    for (const subset of subsets) {
      const candidates = generateCandidatesForSubset(subset, levelsPerCriterion);
      totalCandidates += candidates.length;
      for (const { profileA, profileB } of candidates) {
        expect(isDominatedOrTied(profileA, profileB)).toBe(false);
      }
    }
    // Sanity check the assertion loop actually exercised real candidates, not empty pools.
    expect(totalCandidates).toBeGreaterThan(subsets.length * 3);
  });

  it('still fills up to CANDIDATES_PER_SUBSET candidates per subset despite the filter', () => {
    const levelsPerCriterion = [5, 5, 5, 5, 5, 5];
    for (const subset of [
      [0, 1],
      [2, 3],
      [0, 1, 2],
      [3, 4, 5],
    ]) {
      const candidates = generateCandidatesForSubset(subset, levelsPerCriterion);
      expect(candidates.length).toBe(6);
    }
  });
});

describe('closure does not bridge across criteria pairs (structural assumption behind coverage)', () => {
  it('never implies a relationship for a pair with zero direct answers, even with lots of same-degree answers elsewhere', () => {
    const graph = new PreferenceGraph();
    graph.insertAnswer({ 0: 5, 1: 1 }, { 0: 1, 1: 5 }, 'A');
    graph.insertAnswer({ 2: 5, 3: 1 }, { 2: 1, 3: 5 }, 'A');
    graph.insertAnswer({ 4: 5, 5: 1 }, { 4: 1, 5: 5 }, 'A');

    // Same pair, different level combination — never directly compared, not implied.
    expect(graph.isImplied({ 0: 1, 1: 1 }, { 0: 5, 1: 5 })).toEqual({ implied: false });
    // Cross-pair — answering (0,1) tells nothing about (2,3).
    expect(graph.isImplied({ 0: 5, 1: 1 }, { 2: 5, 3: 1 })).toEqual({ implied: false });
    // Totally uncovered pair.
    expect(graph.isImplied({ 0: 5, 2: 1 }, { 0: 1, 2: 5 })).toEqual({ implied: false });
  });
});

describe('nextAction — driver states on a small hand-built session', () => {
  const levelsPerCriterion = [4, 4, 4]; // N=3, C(3,2)=3 pairs

  // Deterministic and globally consistent (never contradicts itself): whichever profile
  // has the higher level on the lowest-index criterion present wins. Equivalent to a
  // fixed global ranking (criterion 0 > criterion 1 > criterion 2 in importance), so no
  // cold-start or refinement answer can ever create a cycle.
  function answerByLowestIndex(profileA: Profile, profileB: Profile): ComparisonResult {
    const lowestIndex = Object.keys(profileA)
      .map(Number)
      .sort((a, b) => a - b)[0];
    if (profileA[lowestIndex] > profileB[lowestIndex]) return 'A';
    if (profileB[lowestIndex] > profileA[lowestIndex]) return 'B';
    return 'equal';
  }

  it('asks cold-start coverage first and covers all pairs (coverage itself no longer implies Medium — see isMediumTierReached below)', () => {
    const session = new CalibrationSession();

    const first = nextAction(session, levelsPerCriterion, 2);
    expect(first).toEqual({
      type: 'ask',
      reason: 'cold-start-coverage',
      degree: 2,
      ...coldStartProfilesForPair(0, 1, levelsPerCriterion),
    });

    let action = first;
    let coveredCount = 0;
    while (action.type === 'ask' && action.reason === 'cold-start-coverage') {
      const result = answerByLowestIndex(action.profileA, action.profileB);
      session.recordAnswer(action.profileA, action.profileB, result);
      coveredCount++;
      action = nextAction(session, levelsPerCriterion, 2);
    }
    expect(coveredCount).toBe(3); // C(3,2)

    // Medium is now a solver-accuracy threshold (2026-08-08), not derived from
    // buildCanonicalDegree2Pairs/pair-coverage at all — verify isMediumTierReached
    // matches the actual solved accuracy at this point, whatever it is.
    const solved = solveValues({
      levelsPerCriterion,
      answers: session.fullLog.map((e) => ({
        profileA: e.profileA,
        profileB: e.profileB,
        result: e.result,
      })),
    });
    const accuracy = computeSolverAccuracy(solved);
    expect(isMediumTierReached(accuracy)).toBe(accuracy >= MEDIUM_ACCURACY_THRESHOLD);
  });

  it('signals degree-exhausted (a distinct status, not silence) once nothing at the current degree is worth asking, with escalation info', () => {
    const session = new CalibrationSession();
    let action = nextAction(session, levelsPerCriterion, 2);
    let guard = 0;
    while (action.type === 'ask' && guard < 200) {
      const result = answerByLowestIndex(action.profileA, action.profileB);
      session.recordAnswer(action.profileA, action.profileB, result);
      action = nextAction(session, levelsPerCriterion, 2);
      guard++;
    }

    expect(action.type).toBe('degree-exhausted');
    if (action.type === 'degree-exhausted') {
      expect(action.degree).toBe(2);
      expect(action.canEscalate).toBe(true); // N=3, degree 3 (full profile) is still <= N
      expect(action.nextDegree).toBe(3);
    }
  });
});

describe('oracle-based simulation (real 5-criterion value table as complete ground truth)', () => {
  const levelsPerCriterion = REAL_SESSION_LEVELS_PER_CRITERION; // [5,5,5,5,5]
  const numCriteria = levelsPerCriterion.length;

  // Every level of every criterion has a known real value, so this oracle can correctly
  // answer ANY hypothetical comparison, not just the 31 Dan happened to be asked — that's
  // what makes it valid for testing a driver that will legitimately ask different
  // questions than Dan's fixed historical sequence.
  function oracleAnswer(profileA: Profile, profileB: Profile): ComparisonResult {
    const sum = (p: Profile) =>
      Object.keys(p).reduce(
        (total, key) => total + REAL_SESSION_EXPECTED_VALUES[Number(key)][p[Number(key)]],
        0
      );
    const diff = sum(profileA) - sum(profileB);
    if (Math.abs(diff) < 0.005) return 'equal'; // matches the granularity of real recorded answers
    return diff > 0 ? 'A' : 'B';
  }

  function currentAccuracy(session: CalibrationSession): number {
    const solved = solveValues({
      levelsPerCriterion,
      answers: session.fullLog.map((e) => ({
        profileA: e.profileA,
        profileB: e.profileB,
        result: e.result,
      })),
    });
    return computeSolverAccuracy(solved);
  }

  it('reaches full degree-2 coverage in the same rough ballpark as the real session (20), tapers across degrees, and shows diminishing accuracy returns', () => {
    const session = new CalibrationSession();
    const accuracyAtStart = currentAccuracy(session); // 1 (no answers yet: zero-width trivial ranges)

    // --- Phase 1: cold-start coverage only, until the driver itself stops offering it.
    let action = nextAction(session, levelsPerCriterion, 2);
    let coverageQuestionCount = 0;
    while (action.type === 'ask' && action.reason === 'cold-start-coverage') {
      session.recordAnswer(
        action.profileA,
        action.profileB,
        oracleAnswer(action.profileA, action.profileB)
      );
      coverageQuestionCount++;
      action = nextAction(session, levelsPerCriterion, 2);
    }

    // Structurally guaranteed: exactly one cold-start question per pair, no waste.
    expect(coverageQuestionCount).toBe(enumerateCriterionPairs(numCriteria).length); // C(5,2) = 10

    const accuracyAtCoverage = currentAccuracy(session);

    // Medium is now a solver-accuracy threshold (2026-08-08), not pair-coverage — verify
    // isMediumTierReached matches the actual accuracy reached at minimum coverage.
    expect(isMediumTierReached(accuracyAtCoverage)).toBe(
      accuracyAtCoverage >= MEDIUM_ACCURACY_THRESHOLD
    );

    // --- Phase 2: continue adaptively — refinement at degree 2, then escalate through
    // higher degrees as each is signaled exhausted, for a bounded number of further steps.
    const asksByDegree: Record<number, number> = { 2: coverageQuestionCount };
    let currentDegree = 2;
    let stepsAfterCoverage = 0;
    const maxFurtherSteps = 45;

    while (stepsAfterCoverage < maxFurtherSteps) {
      if (action.type === 'ask') {
        session.recordAnswer(
          action.profileA,
          action.profileB,
          oracleAnswer(action.profileA, action.profileB)
        );
        asksByDegree[action.degree] = (asksByDegree[action.degree] ?? 0) + 1;
      } else {
        if (!action.canEscalate) break; // top degree exhausted, nothing more to do
        currentDegree = action.nextDegree!;
      }
      stepsAfterCoverage++;
      action = nextAction(session, levelsPerCriterion, currentDegree);
    }

    const accuracyAtEnd = currentAccuracy(session);

    // --- Total degree-2 usage (coverage + refinement) stays in the same rough ballpark
    // as the real session's 20 — not, say, 200 (which would indicate badly inefficient
    // cold-start/coverage logic).
    expect(asksByDegree[2]).toBeGreaterThanOrEqual(coverageQuestionCount);
    expect(asksByDegree[2]).toBeLessThan(60);

    // --- Tapering: front-loaded at degree 2, sparser at each higher degree reached —
    // mirroring the real session's 20 → 7 → 2 → 2 shape, without expecting exact counts.
    const degreesAsked = Object.keys(asksByDegree)
      .map(Number)
      .sort((a, b) => a - b);
    for (let i = 1; i < degreesAsked.length; i++) {
      expect(asksByDegree[degreesAsked[i]]).toBeLessThanOrEqual(asksByDegree[degreesAsked[i - 1]]);
    }

    // --- Accuracy is already meaningfully high right at minimum coverage, and further
    // questions show diminishing (not linear/unbounded) improvement.
    expect(accuracyAtCoverage).toBeGreaterThan(0.5);
    const earlyGain = accuracyAtCoverage - accuracyAtStart;
    const lateGain = accuracyAtEnd - accuracyAtCoverage;
    expect(Math.abs(lateGain)).toBeLessThan(Math.abs(earlyGain));
  }, 30_000);

  it('never asks a dominated or tied pair across a full driver-paced run (regression for the dominance filter)', () => {
    const session = new CalibrationSession();
    let action = nextAction(session, levelsPerCriterion, 2);
    let currentDegree = 2;
    let asked = 0;

    while (asked < 59) {
      if (action.type === 'ask') {
        expect(isDominatedOrTied(action.profileA, action.profileB)).toBe(false);
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
  }, 30_000);
});
