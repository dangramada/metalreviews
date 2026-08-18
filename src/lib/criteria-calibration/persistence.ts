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
