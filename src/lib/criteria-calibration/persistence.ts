// Supabase persistence for Criteria Calibration (part 5b). Consumes the engine's public
// exports (solveValues / isMediumTierReached / computeScoreSpreadAccuracy /
// solverAccuracyTier) but doesn't modify any of the locked engine modules or the schema
// (part 3). Accuracy source switched 2026-08-09 from computeSolverAccuracy to
// computeScoreSpreadAccuracy (scoreSpreadAccuracy.ts) — see that module's header and
// docs/decisions/criteria-calibration/criteria-calibration-engine.md's "Part 4 finding" for why. Already async
// and off the interactive render path (runs once per committed answer, not per keystroke),
// so the extra LP solves the new metric needs are swapped in directly here, no debounce
// needed (contrast CriteriaCalibrationPage.tsx's progress ring, which does debounce).
//
// TIER SOURCE CHANGED 2026-08-18. This module used to compute the stored tier itself, from
// accuracy thresholds plus a combined Medium gate (the rule user_calibration_status.sql
// documents). Both are gone: the tier is now decided by how many degrees of comparison the user
// has finished and is passed in by the caller — see degreeTiers.ts and
// docs/decisions/criteria-calibration/criteria-calibration-degree-tiers-and-progress.md. The
// column, its CHECK constraint and its four values are unchanged, so no migration was needed;
// what changed is only what puts a value in it. `accuracy_value` still stores the live
// score-spread accuracy, which is now an independent quantity rather than the tier's source.

import { supabase } from '../../supabaseClient.js';
import type { ComparisonResult, Profile } from './preferenceGraph.js';
import type { AccuracyTier } from './accuracyTierLabels.js';
import type { CriteriaCatalog } from './criteriaCatalog.js';
import type { CommitComputation } from './commitComputation.js';

export type DbResult = 'a_preferred' | 'b_preferred' | 'equal';
export type StatusTier = 'none' | 'medium' | 'high' | 'very_high';

export function resultToDb(result: ComparisonResult): DbResult {
  if (result === 'A') return 'a_preferred';
  if (result === 'B') return 'b_preferred';
  return 'equal';
}

export function dbToResult(result: DbResult): ComparisonResult {
  if (result === 'a_preferred') return 'A';
  if (result === 'b_preferred') return 'B';
  return 'equal';
}

export interface PersistedAnswerRow {
  id: string;
  profileA: Profile;
  profileB: Profile;
  result: ComparisonResult;
}

/** Ordered by answered_at so replaying them reproduces the session exactly as it was left. */
export async function fetchPersistedAnswers(userId: string): Promise<PersistedAnswerRow[]> {
  const { data, error } = await supabase
    .from('user_calibration_answers')
    .select('id, profile_a, profile_b, result')
    .eq('user_id', userId)
    .order('answered_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    profileA: row.profile_a as Profile,
    profileB: row.profile_b as Profile,
    result: dbToResult(row.result as DbResult),
  }));
}

/** Returns the new row's id — callers need it so a later undo can delete the exact row. */
export async function insertAnswer(
  userId: string,
  profileA: Profile,
  profileB: Profile,
  result: ComparisonResult
): Promise<string> {
  const { data, error } = await supabase
    .from('user_calibration_answers')
    .insert({
      user_id: userId,
      profile_a: profileA,
      profile_b: profileB,
      result: resultToDb(result),
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Insert returned no row');
  return data.id as string;
}

export async function deleteAnswer(id: string): Promise<void> {
  const { error } = await supabase.from('user_calibration_answers').delete().eq('id', id);
  if (error) throw error;
}

/** Deletes every persisted answer for this user — the server-side half of Restart
 *  (criteria-calibration-page-redesign's ActionRail). A full reset, not a trim: the caller is
 *  responsible for resetting local state (answers, degree, redo buffer, acknowledged
 *  boundary) and re-running the commit computation to zero accuracy/weights, same as any
 *  other answers-array replacement. */
export async function deleteAllAnswers(userId: string): Promise<void> {
  const { error } = await supabase.from('user_calibration_answers').delete().eq('user_id', userId);
  if (error) throw error;
}

/**
 * Forces `user_calibration_status` to an exact (tier, accuracy, answer_count) triple, bypassing
 * `upsert_calibration_status` entirely rather than going through it. Used by any caller whose
 * new `answer_count` is LOWER than what's stored — Restart (always 0) and Undo (one less than
 * before) — since the RPC's guard (`>= stored answer_count`) categorically cannot accept a
 * decrease, by design, for a purpose that has nothing to do with either of those callers (see
 * below).
 *
 * WHY NOT THE RPC. The guard exists to reject a genuinely stale write racing a fresher one
 * within a live, forward-moving session (`user_calibration_status-add-answer-count-guard.sql`).
 * Restart and Undo are not that: both are legitimate, deliberate decreases to the true answer
 * count, the exact case the guard's own design never anticipated needing to accept. `user_
 * calibration_status`'s own RLS policy ("Users can manage their own calibration status", `for
 * all using/with check auth.uid() = user_id`) already permits a plain client upsert with no RPC
 * needed; the guard is application logic layered on top of that policy, not a security
 * boundary, so bypassing it here does not touch RLS at all.
 *
 * CALLER MUST SEQUENCE THIS AFTER any in-flight `upsertWeightsAndStatus` call from the same
 * action. Both `handleRestart` and `handleUndo` also fire `applyCommitComputation`, which calls
 * `upsertWeightsAndStatus` with the SAME lower `answer_count` this function is about to force —
 * carrying `tierRef.current`, which still reflects the render BEFORE this action, since the ref
 * only updates on a later render. That write is expected to lose the guard's race (the stored
 * count is still the higher, pre-action value when it arrives). But if THIS function's write
 * lands FIRST, it lowers `answer_count` in the DB, which makes the guard newly PERMISSIVE for
 * that still-in-flight stale write (`lower >= lower` is true), so it can land SECOND and clobber
 * the correct sync right back to the stale tier. Every caller awaits the weights/status write's
 * promise before calling this function, specifically to make this function's write the
 * temporally last one, not just call it "eventually" — see `handleRestart`/`handleUndo`.
 */
export async function syncCalibrationStatus(
  userId: string,
  tier: AccuracyTier,
  accuracy: number,
  answerCount: number
): Promise<void> {
  const { error } = await supabase
    .from('user_calibration_status')
    .upsert({
      user_id: userId,
      tier: tierToDb(tier),
      accuracy_value: accuracy,
      answer_count: answerCount,
    });
  if (error) throw error;
}

/** Restart's other half: `syncCalibrationStatus` at the zero-answer state every Restart wants,
 *  by name for the one caller whose target is always the same fixed triple rather than one it
 *  has to carry over from a `computation`. */
export async function resetCalibrationStatus(userId: string): Promise<void> {
  return syncCalibrationStatus(userId, 'none', 0, 0);
}

/**
 * The app's tier identifier in the database's spelling. The two differ only in case
 * convention ('veryHigh' vs 'very_high'), which is deliberate — the column's CHECK constraint
 * and every existing row use snake_case, so degree-tying the tier needed no migration.
 *
 * CHANGED 2026-08-18: the tier is no longer computed here from accuracy thresholds. It is
 * decided by how many degrees of comparison the user has finished (degreeTiers.ts) and passed
 * in by the caller, because that is a property of the elicitation position — which degree the
 * driver is at, and whether it has reported that degree exhausted — and this module only ever
 * sees the answer log. Deriving it here from the log alone would lag the flow by one answer,
 * and specifically would lag it for the user who reaches a boundary and stops right there,
 * which is the case where the album pages' confidence label matters most.
 */
export function tierToDb(tier: AccuracyTier): StatusTier {
  if (tier === 'veryHigh') return 'very_high';
  if (tier === 'high') return 'high';
  if (tier === 'medium') return 'medium';
  return 'none';
}

/**
 * Status-only write, for when the tier changes without a new answer — which degree-tying makes
 * a real case: reaching a degree boundary promotes the tier on the same answer log the previous
 * write already covered. Goes through the same guarded RPC as the combined write below, and the
 * answer-count guard is `>=`, so re-writing at an unchanged count is accepted rather than
 * rejected as stale.
 */
export async function upsertCalibrationStatus(
  userId: string,
  tier: AccuracyTier,
  accuracy: number,
  answerCount: number
): Promise<void> {
  const { error } = await supabase.rpc('upsert_calibration_status', {
    p_user_id: userId,
    p_tier: tierToDb(tier),
    p_accuracy_value: accuracy,
    p_answer_count: answerCount,
  });
  if (error) throw error;
}

/** Whether this user has any solved criterion weights stored at all.
 *
 *  This is what the album-rating soft gate asks as of 2026-08-18, replacing `tier === 'none'`.
 *  The two used to be near-equivalent — under accuracy thresholds essentially every session
 *  left 'none' within a handful of answers — but a degree-tied 'none' means "has not finished
 *  degree 2", which for some preference shapes never happens at all (see deferred-work.md's
 *  entry on shapes that never exhaust degree 2). Gating a nudge on that would keep nudging a
 *  user who has answered ninety questions. Weight rows exist from the very first commit, which
 *  is the thing the gate actually cares about: is there a calibrated model to score with. */
export async function hasCalibrationWeights(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_criterion_weights')
    .select('criterion_id')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * Upserts user_criterion_weights (one row per criterion x level), plus
 * user_calibration_status (tier + raw accuracy value, combined-rule gated) from an
 * already-solved computation. The caller (CriteriaCalibrationPage) computes solveValues +
 * computeScoreSpreadAccuracy exactly once per commit via computeCommitState and shares that
 * result across every consumer — this function no longer re-solves them itself (see
 * commitComputation.ts for why: three independent recomputes of the same LP was the direct
 * cause of the round-50+ UI blocking).
 *
 * The status write goes through the upsert_calibration_status RPC (see
 * supabase/user_calibration_status-add-answer-count-guard.sql for the surviving guard, and
 * supabase/user_calibration_status-drop-stability-window.sql for the 2026-08-17 migration
 * that dropped the seven Brief 3 columns and narrowed this RPC to four parameters), not a
 * plain `.upsert()` — accuracy_value/tier are guarded against an `answer_count` that's gone
 * backward (see the answer-count-guard migration's header for why `>=` and not `>`).
 *
 * The un-awaited-write race documented in
 * docs/decisions/criteria-calibration/criteria-calibration-weights-write-race.md was scoped
 * exactly to the stability-window columns this migration drops (last_eligible_top10 /
 * last_change_answer_index and the previous_ triple, all of which the answer-count guard
 * deliberately did not cover). With those columns gone, every field this RPC still writes is
 * covered by the guard — the race is not fixed here so much as no longer expressible.
 */
export async function upsertWeightsAndStatus(
  userId: string,
  catalog: CriteriaCatalog,
  computation: CommitComputation,
  tier: AccuracyTier
): Promise<void> {
  const { solved, accuracy } = computation;

  const weightRows = catalog.entries.flatMap((entry) =>
    Object.keys(entry.levels)
      .map(Number)
      .map((level) => ({
        user_id: userId,
        criterion_id: entry.index,
        level,
        value: solved.values[entry.index][level].point,
      }))
  );

  const { error: weightsError } = await supabase
    .from('user_criterion_weights')
    .upsert(weightRows, { onConflict: 'user_id,criterion_id,level' });
  if (weightsError) throw weightsError;

  const { error: statusError } = await supabase.rpc('upsert_calibration_status', {
    p_user_id: userId,
    p_tier: tierToDb(tier),
    p_accuracy_value: accuracy,
    p_answer_count: computation.answerCount,
  });
  if (statusError) throw statusError;
}
