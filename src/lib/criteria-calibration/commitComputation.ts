// Single shared entry point for the per-commit accuracy/weights computation. Before this
// module existed, solveValues + computeScoreSpreadAccuracy were each invoked independently
// from three call sites (CriteriaCalibrationPage's progress-ring effect, persistence.ts's
// upsertWeightsAndStatus, rankingStabilityLog.ts's logSnapshot) — up to 3x the LP-solve cost
// per commit, which is what made the UI block outright once answer count (and therefore
// constraint count) grew past ~50 rounds. Callers now compute once via computeCommitState
// and pass the result to whichever of the three consumers need it.
//
// Does not touch solveValues / computeScoreSpreadAccuracy / isMediumTierReached themselves —
// those stay exactly as they were; this only removes duplicate top-level invocations.

import { solveValues, type SolverAnswer, type ValueSolverResult } from './solver.js';
import { computeScoreSpreadAccuracy } from './scoreSpreadAccuracy.js';
import { isMediumTierReached } from './accuracyTiers.js';
import type { CriteriaCatalog } from './criteriaCatalog.js';

export interface CommitComputation {
  solved: ValueSolverResult;
  accuracy: number;
  mediumReached: boolean;
}

export function computeCommitState(
  catalog: CriteriaCatalog,
  answers: readonly SolverAnswer[]
): CommitComputation {
  const solved = solveValues({ levelsPerCriterion: catalog.levelsPerCriterion, answers });
  const accuracy = computeScoreSpreadAccuracy({
    levelsPerCriterion: catalog.levelsPerCriterion,
    answers,
  });
  return { solved, accuracy, mediumReached: isMediumTierReached(accuracy) };
}
