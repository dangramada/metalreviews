// Supabase persistence for Criteria Calibration (part 5b). Consumes the engine's public
// exports (solveValues / isMediumTierReached / computeScoreSpreadAccuracy /
// solverAccuracyTier) but doesn't modify any of the locked engine modules or the schema
// (part 3). Accuracy source switched 2026-08-09 from computeSolverAccuracy to
// computeScoreSpreadAccuracy (scoreSpreadAccuracy.ts) — see that module's header and
// docs/decisions/criteria-calibration-engine.md's "Part 4 finding" for why. Already async
// and off the interactive render path (runs once per committed answer, not per keystroke),
// so the extra LP solves the new metric needs are swapped in directly here, no debounce
// needed (contrast CriteriaCalibrationPage.tsx's progress ring, which does debounce).
//
// Combined tier rule (per user_calibration_status.sql's own documented gap): 'high'/
// 'very_high' require isMediumTierReached() to ALSO be true, not solverAccuracyTier() alone.
// As of 2026-08-08 (see docs/decisions/criteria-calibration-medium-gate-redesign.md) both
// checks read the same `accuracy` value against different thresholds (Medium >=
// SCORE_SPREAD_MEDIUM_THRESHOLD, High/Very High >= SCORE_SPREAD_HIGH/VERY_HIGH_THRESHOLD),
// so this is now structurally always true as long as those three constants stay nested in
// ascending order. The combined check is kept as-is (harmless, and keeps `computeTier`
// correct if Medium's threshold and High's threshold are ever independently retuned to no
// longer nest). Storing a 'high'/'very_high' value is harmless even though the UI (5a,
// unchanged here) never displays anything beyond Medium/not-Medium.

import { supabase } from '../../supabaseClient.js';
import type { ComparisonResult, Profile } from './preferenceGraph.js';
import { solveValues, type SolverAnswer } from './solver.js';
import { isMediumTierReached, solverAccuracyTier } from './accuracyTiers.js';
import { computeScoreSpreadAccuracy } from './scoreSpreadAccuracy.js';
import type { CriteriaCatalog } from './criteriaCatalog.js';

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

function computeTier(mediumReached: boolean, accuracy: number): StatusTier {
  if (!mediumReached) return 'none';
  const solverTier = solverAccuracyTier(accuracy);
  if (solverTier === 'veryHigh') return 'very_high';
  if (solverTier === 'high') return 'high';
  return 'medium';
}

/**
 * Re-runs the solver against the full given answer log and upserts both
 * user_criterion_weights (one row per criterion x level) and user_calibration_status
 * (tier + raw accuracy value, combined-rule gated). Answers are the caller's current
 * in-memory log — already 1:1 with what's persisted, so no separate re-fetch is needed.
 */
export async function upsertWeightsAndStatus(
  userId: string,
  catalog: CriteriaCatalog,
  answers: readonly SolverAnswer[]
): Promise<void> {
  const solved = solveValues({ levelsPerCriterion: catalog.levelsPerCriterion, answers });
  const accuracy = computeScoreSpreadAccuracy({
    levelsPerCriterion: catalog.levelsPerCriterion,
    answers,
  });
  const mediumReached = isMediumTierReached(accuracy);

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

  const tier = computeTier(mediumReached, accuracy);

  const { error: statusError } = await supabase
    .from('user_calibration_status')
    .upsert({ user_id: userId, tier, accuracy_value: accuracy }, { onConflict: 'user_id' });
  if (statusError) throw statusError;
}
