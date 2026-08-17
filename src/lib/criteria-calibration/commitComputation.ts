// Single shared entry point for the per-commit accuracy/weights computation. Before this
// module existed, solveValues + computeScoreSpreadAccuracy were each invoked independently
// from three call sites (CriteriaCalibrationPage's progress-ring effect, persistence.ts's
// upsertWeightsAndStatus, rankingStabilityLog.ts's logSnapshot) — up to 3x the LP-solve cost
// per commit, which is what made the UI block outright once answer count (and constraint
// count) grew past ~50 rounds. Callers now compute once via computeCommitState and pass the
// result to whichever of the two consumers need it.
//
// Does not touch solveValues / computeScoreSpreadAccuracy / isMediumTierReached themselves —
// those stay exactly as they were; this only removes duplicate top-level invocations.
//
// The Brief 3 stability-window half of this module (advanceStabilityWindow threading via a
// StabilityWindowContext, plus computeStabilityWindowUpdate) was DELETED 2026-08-17 with the
// rest of the duration-based auto-escalation signal — see
// docs/decisions/criteria-calibration/criteria-calibration-tiered-checkpoints.md. Everything
// this module now returns is a pure function of `answers`, with no path-dependent state and
// nothing to persist beyond the answer log itself, which is what lets the tiered-checkpoint
// flow recompute a tier fresh at every render instead of replaying a trajectory.

import { solveValues, type SolverAnswer, type ValueSolverResult } from './solver.js';
import { computeScoreSpreadAccuracy } from './scoreSpreadAccuracy.js';
import { isMediumTierReached } from './accuracyTiers.js';
import type { CriteriaCatalog } from './criteriaCatalog.js';

export interface CommitComputation {
  solved: ValueSolverResult;
  accuracy: number;
  mediumReached: boolean;
  /** answers.length this computation was solved against — threaded through to
   *  upsertWeightsAndStatus so the DB can reject an out-of-order write (see
   *  docs/decisions/criteria-calibration/criteria-calibration-weights-write-race.md). */
  answerCount: number;
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
  const mediumReached = isMediumTierReached(accuracy);

  return { solved, accuracy, mediumReached, answerCount: answers.length };
}
