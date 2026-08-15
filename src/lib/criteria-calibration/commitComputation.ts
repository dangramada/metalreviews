// Single shared entry point for the per-commit accuracy/weights computation. Before this
// module existed, solveValues + computeScoreSpreadAccuracy were each invoked independently
// from three call sites (CriteriaCalibrationPage's progress-ring effect, persistence.ts's
// upsertWeightsAndStatus, rankingStabilityLog.ts's logSnapshot) — up to 3x the LP-solve cost
// per commit, which is what made the UI block outright once answer count (and constraint
// count) grew past ~50 rounds. Callers now compute once via computeCommitState and pass the
// result to whichever of the three consumers need it.
//
// Does not touch solveValues / computeScoreSpreadAccuracy / isMediumTierReached themselves —
// those stay exactly as they were; this only removes duplicate top-level invocations.
//
// Brief 3 addition: also advances the tier-gated stability window (rankingStabilitySignal.ts)
// using the SAME already-solved `solved.values` — no second LP solve. Only for the FORWARD
// path (a real commit or redo): `stabilityContext` is optional, and the stability computation
// is skipped entirely when omitted. Undo is NOT a forward step — it reverts to a specific,
// already-known prior StabilityWindowState (via popWindowHistory, in CriteriaCalibrationPage.tsx),
// not something advanceStabilityWindow's forward-only algorithm can produce — so undo calls
// computeCommitState without a stabilityContext and handles the window itself.

import { solveValues, type SolverAnswer, type ValueSolverResult } from './solver.js';
import { computeScoreSpreadAccuracy } from './scoreSpreadAccuracy.js';
import { isMediumTierReached, solverAccuracyTier } from './accuracyTiers.js';
import type { CriteriaCatalog } from './criteriaCatalog.js';
import {
  toFlatWeights,
  computeTop10Set,
  advanceStabilityWindow,
  advancePersistedStabilityWindow,
  type PersistedStabilityWindow,
} from './rankingStabilitySignal.js';
import type { CriterionLevelRating } from '../album-rating/scoreAndRank.js';

export interface CommitComputation {
  solved: ValueSolverResult;
  accuracy: number;
  mediumReached: boolean;
  /** answers.length this computation was solved against — threaded through to
   *  upsertWeightsAndStatus so the DB can reject an out-of-order write (see
   *  docs/decisions/criteria-calibration-weights-write-race.md). */
  answerCount: number;
  /** Present only when the caller supplied a StabilityWindowContext (a real commit/redo) —
   *  see this module's header for why Undo doesn't go through this path at all. */
  stabilityWindow?: PersistedStabilityWindow;
}

export interface StabilityWindowContext {
  previous: PersistedStabilityWindow;
  /** Null while the one-time RANKING_TEST_SET ratings fetch (useRankingTestSetRatings) is
   *  still in flight — the window simply doesn't advance for this one commit (it'll catch up
   *  on the next one, once ratings resolve) rather than blocking or throwing. */
  ratingsByAlbum: ReadonlyMap<string, CriterionLevelRating[]> | null;
}

// Exported for direct unit testing (commitComputation.test.ts) — avoids needing a full
// solveValues run just to exercise the "ratings not trustworthy" skip path, which only
// depends on this function's own arguments, not on how `solved`/`accuracy` were produced.
export function computeStabilityWindowUpdate(
  answerIndex: number,
  solved: ValueSolverResult,
  accuracy: number,
  context: StabilityWindowContext
): PersistedStabilityWindow | undefined {
  if (!context.ratingsByAlbum) return undefined;
  const weights = toFlatWeights(solved.values);
  const top10 = computeTop10Set(context.ratingsByAlbum, weights);
  if (top10 === null) return undefined; // defensive — see computeTop10Set's own header
  const tier = solverAccuracyTier(accuracy);
  const nextCurrent = advanceStabilityWindow(context.previous.current, answerIndex, tier, top10);
  return advancePersistedStabilityWindow(context.previous, nextCurrent);
}

export function computeCommitState(
  catalog: CriteriaCatalog,
  answers: readonly SolverAnswer[],
  stabilityContext?: StabilityWindowContext
): CommitComputation {
  const solved = solveValues({ levelsPerCriterion: catalog.levelsPerCriterion, answers });
  const accuracy = computeScoreSpreadAccuracy({
    levelsPerCriterion: catalog.levelsPerCriterion,
    answers,
  });
  const mediumReached = isMediumTierReached(accuracy);

  const stabilityWindow = stabilityContext
    ? computeStabilityWindowUpdate(answers.length, solved, accuracy, stabilityContext)
    : undefined;

  return { solved, accuracy, mediumReached, answerCount: answers.length, stabilityWindow };
}
