// Brief 3 — top-10 set stability, the auto-escalation stop signal.
//
// Evidentiary chain (see docs/decisions/criteria-calibration-ranking-stability-analysis.md):
// Pass 2 (accuracy tiers alone unreliable) -> Pass 3 (top-10 SET membership stabilizes far
// earlier and more cleanly than full ranking order) -> Pass 4 (tier-gated checkpoint-count
// K=2 window, only High/veryHigh checkpoints eligible). Pass 4's K=2 design shipped first but
// was found, via a fine-grained (every-real-answer) replay, to fire on a false positive under
// production's real per-commit checking granularity — see
// docs/decisions/criteria-calibration-fine-grained-firing-instability.md. The window here is
// now duration-based (a minimum real-answer SPAN with an unchanged top-10 set, not a
// checkpoint count) — see advanceStabilityWindow's own doc comment for the mechanism and why
// it isn't weakened by check frequency the way the count-based design was.

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
 *
 * Returns null (the same "can't compute" signal a missing weight level produces) if fewer
 * than TOP_N albums are present in `ratingsByAlbum` — not just when it's completely empty.
 * A per-user RLS-scoped fetch (see useRankingTestSetRatings.ts) returns zero rows for any
 * account other than the one RANKING_TEST_SET was frozen from, and an empty ratings map
 * would otherwise produce a real, non-null, but vacuous EMPTY Set — which trivially equals
 * every other empty Set in advanceStabilityWindow's setsEqual check, silently degrading the
 * signal to a bare answer-count timer completely decoupled from actual ranking stability
 * (found live, see docs/decisions/criteria-calibration-duration-based-window-fix.md's
 * per-user-scoping finding). A 1-9 row partial result is just as untrustworthy as 0 — either
 * way the resulting slice isn't a genuine top-10 selection — so both are rejected identically
 * here, forcing computeStabilityWindowUpdate (commitComputation.ts) to skip the checkpoint
 * entirely rather than advance the window against untrustworthy data.
 */
export function computeTop10Set(
  ratingsByAlbum: ReadonlyMap<string, CriterionLevelRating[]>,
  weights: CriterionLevelWeight[]
): Set<string> | null {
  if (ratingsByAlbum.size < TOP_N) return null;
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
  /** The real-answer index (1-based count of real answers in the session, matching
   *  `answers.length` at commit time) at which `lastEligibleTop10` last changed — or, before
   *  any change has happened yet, the index of the first-ever eligible checkpoint (the
   *  anchor). 0 before any eligible checkpoint has been seen at all (dead value in that
   *  state — see the null check below, which is what actually gates "have we anchored yet",
   *  not this field). Monotonically non-decreasing along any real forward trajectory: a
   *  "change" only ever sets it to the CURRENT (larger) answer index, never resets it
   *  backward — see advancePersistedStabilityWindow's doc comment for why this matters to
   *  the accepted Undo-clamp gap. */
  lastChangeAnswerIndex: number;
  fired: boolean;
}

export const INITIAL_STABILITY_WINDOW_STATE: StabilityWindowState = {
  lastEligibleTop10: null,
  lastChangeAnswerIndex: 0,
  fired: false,
};

// R=12: minimum real-answer span with an unchanged tier-eligible top-10 set before firing.
// PROVISIONAL — single-session evidence only (Dan's real 70-answer replay), same standing as
// SCORE_SPREAD_*_THRESHOLD in accuracyTiers.ts; see deferred-work.md. Chosen for margin
// beyond the single observed instability window in that trace (last real top-10 change at
// n=35), not as the bare minimum that happened to clear it (R=6 also cleared the same check)
// — see docs/decisions/criteria-calibration-fine-grained-firing-instability.md and the
// duration-based-fix follow-up doc for the full sweep (R=3 still false-fired at n=29; R=6/9/12
// all held through n=70).
const REQUIRED_ANSWER_SPAN = 12;

/**
 * Advances the tier-gated duration-based stability window by one commit checkpoint.
 *
 * Supersedes the original checkpoint-COUNT K=2 window (fired after 2 consecutive
 * checkpoint-to-predecessor MATCH EVENTS). That design was found, via a fine-grained
 * (every-real-answer) replay of Dan's real session, to fire on a false positive: under
 * per-commit checking (production's real granularity, not Pass 4's every-3rd-sample
 * retrospective sampling), "2 consecutive checkpoints" degrades to just 2 real answers of
 * evidence, with no floor on how far apart those checkpoints actually are in real-answer
 * terms — see docs/decisions/criteria-calibration-fine-grained-firing-instability.md for the
 * full n=28-false-positive finding this replaced.
 *
 * This design instead measures a minimum SPAN of real answers (REQUIRED_ANSWER_SPAN) since
 * the top-10 set last changed at a tier-eligible checkpoint — independent of how many
 * checkpoints happen to fall in that span, so it can't be weakened by checking more often.
 *
 * Checkpoints where `tier === 'insufficient'` are skipped ENTIRELY: they don't update
 * `lastEligibleTop10`/`lastChangeAnswerIndex`, and they don't reset anything — a dip below
 * High and a later return to High compares against whatever the last ELIGIBLE checkpoint was,
 * as if the dip never happened (same rule the old K=2 window used; unaffected by this change).
 *
 * Once `fired` is true, state is terminal — the signal does not un-fire if the top-10 set
 * later changes again (matches the brief: "fire" is a one-way transition).
 */
export function advanceStabilityWindow(
  state: StabilityWindowState,
  answerIndex: number,
  tier: SolverAccuracyTier,
  top10Set: Set<string>
): StabilityWindowState {
  if (state.fired) return state;
  if (tier === 'insufficient') return state;

  if (state.lastEligibleTop10 === null) {
    // First-ever eligible checkpoint: nothing to compare against yet, so this is the anchor —
    // the span starts counting from here.
    return { lastEligibleTop10: top10Set, lastChangeAnswerIndex: answerIndex, fired: false };
  }

  const changed = !setsEqual(state.lastEligibleTop10, top10Set);
  const lastChangeAnswerIndex = changed ? answerIndex : state.lastChangeAnswerIndex;
  return {
    lastEligibleTop10: top10Set,
    lastChangeAnswerIndex,
    fired: answerIndex - lastChangeAnswerIndex >= REQUIRED_ANSWER_SPAN,
  };
}

/**
 * What gets persisted per commit so a resumed session can seed its in-memory undo history
 * (windowHistory, built forward from here — see CriteriaCalibrationPage.tsx) without
 * replaying the whole answer log's LP solves. `current`/`previous` are a StabilityWindowState
 * pair: `previous` is only re-snapshotted on a commit where advanceStabilityWindow actually
 * produced a new state (see seedWindowHistoryOnResume for why); `lastCommitChangedWindow` is
 * overwritten unconditionally on every commit, real change or not.
 */
export interface PersistedStabilityWindow {
  current: StabilityWindowState;
  previous: StabilityWindowState;
  lastCommitChangedWindow: boolean;
}

export const INITIAL_PERSISTED_STABILITY_WINDOW: PersistedStabilityWindow = {
  current: INITIAL_STABILITY_WINDOW_STATE,
  previous: INITIAL_STABILITY_WINDOW_STATE,
  lastCommitChangedWindow: false,
};

/**
 * Given the previous commit's PersistedStabilityWindow and the newly-advanced state for THIS
 * commit, produces the next PersistedStabilityWindow to write. `previous` only moves when
 * `nextCurrent` actually differs from `prior.current` — a no-op commit (insufficient tier, or
 * already fired) leaves `previous` exactly where it was, so it keeps pointing at "the state
 * before the LAST real change" no matter how many no-op commits land in between.
 */
export function advancePersistedStabilityWindow(
  prior: PersistedStabilityWindow,
  nextCurrent: StabilityWindowState
): PersistedStabilityWindow {
  const changed = nextCurrent !== prior.current;
  return {
    current: nextCurrent,
    previous: changed ? prior.current : prior.previous,
    lastCommitChangedWindow: changed,
  };
}

/**
 * Seeds the in-memory windowHistory stack on resume (a plain array, Undo pops the top, new
 * commits push — see CriteriaCalibrationPage.tsx). Returns the last 1 or 2 known window
 * states, oldest first:
 *   - [current] if the most recent commit did NOT itself change the window (undoing it should
 *     leave the window untouched — it was a no-op, so window_{n-1} === window_n).
 *   - [previous, current] if the most recent commit DID change the window (undoing it should
 *     roll back to the pre-change state — window_{n-1} === previous, exactly).
 *
 * GAP, accepted as-is (see rankingStabilitySignal.test.ts's "two consecutive undos with zero
 * intervening commits" case for the proof): a SECOND consecutive Undo before any new commit
 * has no third level of history to fall back to — the caller clamps at the bottom of this
 * seed (an empty-stack pop is a no-op, not a further rollback) rather than reporting an
 * incorrect state. Proven confined to the SAFE direction only, at any further undo depth, not
 * just the second: the clamped value always equals the TRUE window_{n-1} (this function's own
 * output is exact for the first undo), and `fired` is monotonic along the true trajectory, so
 * a clamped value can never show `fired: false` when a deeper true state would need `fired:
 * true` — the reverse (clamped shows `fired: true`, "stuck" past a point where it should have
 * un-fired) is the only possible failure mode, which never lets auto-escalation wrongly
 * resume. Explicitly not chasing a further (third+) persisted field for this — the realistic
 * case this was built for is a single post-resume Undo; two or more consecutive Undos with no
 * answer in between is a rare sequence with diminishing returns past the safety already
 * proven here.
 *
 * Re-derived (not assumed) when the duration-based window replaced the checkpoint-count one:
 * `lastChangeAnswerIndex` is ALSO monotonically non-decreasing along the true trajectory
 * (every real change sets it to the current, strictly larger answer index — see
 * advanceStabilityWindow), so the same "clamp can only be stuck at a MORE settled-looking
 * state than the deeper truth, never a less settled one" argument applies to it directly,
 * independent of `fired`. Concretely: a clamped value's `lastChangeAnswerIndex` can only be
 * >= the true deeper state's — never <, which is what would be needed for the clamp to
 * manufacture spurious extra stability. See rankingStabilitySignal.test.ts's
 * "lastChangeAnswerIndex mismatch, safe direction" case for a concrete worked trajectory
 * where the two values actually differ.
 */
export function seedWindowHistoryOnResume(
  persisted: PersistedStabilityWindow
): StabilityWindowState[] {
  if (persisted.lastCommitChangedWindow) {
    return [persisted.previous, persisted.current];
  }
  return [persisted.current];
}

/**
 * Undo semantics for the windowHistory stack: pops the most recent entry and reports what's
 * now "current". A fresh (never-resumed) session's windowHistory always has exactly one entry
 * per answer (pushed by every real commit), so this only ever pops down to a single remaining
 * entry there — the existing `answers.length === 0` guard disables Undo before it could go
 * further. A RESUMED session's seed (1 or 2 entries, see seedWindowHistoryOnResume) can be
 * shorter than the true answer count, though: popping past its single remaining entry clamps
 * instead of removing it, so `current` never becomes undefined and never reports a state with
 * no data behind it. This clamp is exactly the accepted gap described on
 * seedWindowHistoryOnResume — proven safe-direction only, however many times it's hit in a
 * row.
 */
export function popWindowHistory(history: StabilityWindowState[]): {
  next: StabilityWindowState[];
  current: StabilityWindowState;
} {
  if (history.length <= 1) return { next: history, current: history[0] };
  const next = history.slice(0, -1);
  return { next, current: next[next.length - 1] };
}
