// Brief 3 — top-10 set stability, the auto-escalation stop signal.
//
// Evidentiary chain (see docs/decisions/criteria-calibration-ranking-stability-analysis.md):
// Pass 2 (accuracy tiers alone unreliable) -> Pass 3 (top-10 SET membership stabilizes far
// earlier and more cleanly than full ranking order) -> Pass 4 (tier-gated K-window: only
// High/veryHigh checkpoints are eligible to participate; K=2 chosen over K=1 for structural
// robustness against a lucky single-snapshot match). This module implements exactly the
// signal Pass 4 validated — not a fresh design.
//
// This file is INERT as of this commit: computed, exported, and tested, but not called from
// commitComputation.ts or CriteriaCalibrationPage.tsx yet. Wiring is a separate commit.

import {
  computeScore,
  type CriterionLevelRating,
  type CriterionLevelWeight,
} from '../album-rating/scoreAndRank.js';
import type { LevelValue } from './solver.js';
import type { SolverAccuracyTier } from './accuracyTiers.js';

const TOP_N = 10;

/**
 * Flattens the live solved point estimate (values[c][level].point, the same shape
 * computeCommitState already produces once per commit) into the flat (criterionId, level,
 * value) triples computeScore expects. Includes level 1 explicitly (value 0) — values[c][1]
 * is always {0,0,0} by solver.ts's own convention, but computeScore looks up ratings by
 * (criterionId, level) key and a rating can legitimately sit at level 1.
 */
export function toFlatWeights(values: LevelValue[][]): CriterionLevelWeight[] {
  const weights: CriterionLevelWeight[] = [];
  for (let c = 0; c < values.length; c++) {
    for (let level = 1; level < values[c].length; level++) {
      weights.push({ criterionId: c, level, value: values[c][level].point });
    }
  }
  return weights;
}

/**
 * Scores every album in `ratingsByAlbum` against `weights` (reusing computeScore — the same
 * function useAlbumRatingsSummary.ts uses for real user-facing scores, not a reimplementation)
 * and returns the top 10 albumIds by score, tie-broken by albumId ascending (matching
 * scoreAndRank.ts's rankAlbum convention). Returns null if any album's score can't be
 * computed (a rating references a (criterion, level) the current weights don't cover) —
 * defensive; not expected once every RANKING_TEST_SET album is fully rated, per that file's
 * own header.
 *
 * Purpose-built for RANKING_TEST_SET's fixed 13-album domain (see rankingTestSet.ts), not a
 * generic top-N utility — the "10" is Pass 3/4's own validated cutoff, not a parameter.
 */
export function computeTop10Set(
  ratingsByAlbum: ReadonlyMap<string, CriterionLevelRating[]>,
  weights: CriterionLevelWeight[]
): Set<string> | null {
  const scored: { albumId: string; score: number }[] = [];
  for (const [albumId, ratings] of ratingsByAlbum) {
    const score = computeScore(ratings, weights);
    if (score === null) return null;
    scored.push({ albumId, score });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.albumId.localeCompare(b.albumId);
  });
  return new Set(scored.slice(0, TOP_N).map((s) => s.albumId));
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export interface StabilityWindowState {
  /** Top-10 set at the most recently seen tier-eligible checkpoint, or null before the first
   *  one. */
  lastEligibleTop10: Set<string> | null;
  /** Length of the current run of CONSECUTIVE tier-eligible checkpoints that each matched the
   *  top-10 set of the tier-eligible checkpoint immediately before them. This is a run of
   *  MATCH EVENTS (checkpoint-to-predecessor comparisons), not a count of checkpoints — see
   *  the worked example below. 0 means no run in progress. */
  consecutiveMatchRun: number;
  fired: boolean;
}

export const INITIAL_STABILITY_WINDOW_STATE: StabilityWindowState = {
  lastEligibleTop10: null,
  consecutiveMatchRun: 0,
  fired: false,
};

// K=2: Pass 4's chosen confirmation window. Chosen over K=1 for structural robustness against
// a lucky single-snapshot match — one 71-answer trace can't prove K=1 is sufficient, even
// though K=1 also happened to land correctly in that trace.
const REQUIRED_CONSECUTIVE_MATCHES = 2;

/**
 * Advances the tier-gated K=2 stability window by one commit checkpoint.
 *
 * Checkpoints where `tier === 'insufficient'` are skipped ENTIRELY: they don't count toward
 * the window, they never become "the previous checkpoint" for a later comparison, and they
 * don't reset an in-progress run — a dip below High and a later return to High compares
 * against whatever the last ELIGIBLE checkpoint was, as if the dip never happened. THIS
 * SPECIFIC RULE (skip for adjacency, not just for counting) is an assumption Pass 4's
 * retroactive data never actually exercised — in that trace, tier never dropped back below
 * High once reached. See rankingStabilitySignal.test.ts's synthetic
 * "drop below High then return" case for a test that at least verifies this doesn't crash or
 * misbehave, since no real trace has ever exercised it.
 *
 * IMPORTANT — what "2 consecutive checkpoints have an identical top-10 set" actually means:
 * it is NOT "the two most recent eligible checkpoints match each other" (that would make K=1
 * and K=2 fire at the same point, which contradicts Pass 4's own table). It means two
 * consecutive MATCH EVENTS: checkpoint N matches checkpoint N-1, AND checkpoint N-1 matches
 * checkpoint N-2 — i.e. three checkpoints, all with the identical set, confirmed via
 * transitivity. Worked example from the real Pass 4 trace (gate=High, K=2, fires at n=39):
 *   n=27 (anchor, no predecessor to compare)      -> run=0
 *   n=30 (top-10 != n=27's)                        -> run=0 (reset, not "1")
 *   n=33 (top-10 != n=30's)                        -> run=0
 *   n=36 (top-10 == n=33's)                        -> run=1 (first match event)
 *   n=39 (top-10 == n=36's)                        -> run=2 -> FIRES
 * A naive "just compare the current checkpoint to the last-seen eligible one and fire on the
 * first match" reading fires 3 answers early, at n=36 — that's actually K=1's firing point,
 * confirmed against Pass 4's own K=1 row. Verified directly against the frozen Pass 4 fixture
 * in the test file for this exact discrepancy before this implementation was finalized.
 *
 * Once `fired` is true, state is terminal — the signal does not un-fire if the top-10 set
 * later changes again (matches the brief: "fire" is a one-way transition).
 */
export function advanceStabilityWindow(
  state: StabilityWindowState,
  tier: SolverAccuracyTier,
  top10Set: Set<string>
): StabilityWindowState {
  if (state.fired) return state;
  if (tier === 'insufficient') return state;

  if (state.lastEligibleTop10 === null) {
    // First-ever eligible checkpoint: nothing to compare against yet, so this cannot itself
    // be a match event — it only seeds the anchor the next eligible checkpoint compares to.
    return { lastEligibleTop10: top10Set, consecutiveMatchRun: 0, fired: false };
  }

  const matched = setsEqual(state.lastEligibleTop10, top10Set);
  const consecutiveMatchRun = matched ? state.consecutiveMatchRun + 1 : 0;
  return {
    lastEligibleTop10: top10Set,
    consecutiveMatchRun,
    fired: consecutiveMatchRun >= REQUIRED_CONSECUTIVE_MATCHES,
  };
}
