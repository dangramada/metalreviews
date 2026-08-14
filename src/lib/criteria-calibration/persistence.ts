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
import { solverAccuracyTier } from './accuracyTiers.js';
import type { CriteriaCatalog } from './criteriaCatalog.js';
import type { CommitComputation } from './commitComputation.js';
import {
  INITIAL_PERSISTED_STABILITY_WINDOW,
  type PersistedStabilityWindow,
  type StabilityWindowState,
} from './rankingStabilitySignal.js';

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

function rowToWindowState(
  top10: string[] | null,
  consecutiveMatchRun: number | null,
  fired: boolean | null
): StabilityWindowState {
  return {
    lastEligibleTop10: top10 === null ? null : new Set(top10),
    consecutiveMatchRun: consecutiveMatchRun ?? 0,
    fired: fired ?? false,
  };
}

/**
 * Reads back the tier-gated K=2 stability window (Brief 3) as of the last successful write,
 * so a resumed session picks up exactly where it left off instead of starting empty —
 * unlike accuracy/weights (path-independent, safe to recompute fresh from the current
 * answer list), the window is path-dependent: it needs the trajectory of past checkpoints,
 * not just the current state, and re-deriving that trajectory would mean re-solving the LP
 * once per historical answer count (see rankingStabilitySignal.ts's header — not viable
 * given the documented, still-unresolved superlinear solve cost). Persisting the compact
 * running state itself avoids that entirely.
 *
 * Returns both the current window AND the one-step-back `previous` snapshot plus
 * `lastCommitChangedWindow` (see PersistedStabilityWindow) — together these let
 * seedWindowHistoryOnResume correctly gate a single post-resume Undo instead of either always
 * rolling back (which would wrongly un-fire a signal that fired several no-op commits ago) or
 * never rolling back (which would keep a truly-undone firing commit's effect alive). Returns
 * INITIAL_PERSISTED_STABILITY_WINDOW if no row exists yet (first-ever session) or the row
 * predates this migration (nulls).
 */
export async function fetchPersistedStabilityWindow(
  userId: string
): Promise<PersistedStabilityWindow> {
  const { data, error } = await supabase
    .from('user_calibration_status')
    .select(
      'last_eligible_top10, consecutive_match_run, fired, previous_last_eligible_top10, previous_consecutive_match_run, previous_fired, last_commit_changed_window'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return INITIAL_PERSISTED_STABILITY_WINDOW;

  return {
    current: rowToWindowState(
      data.last_eligible_top10 as string[] | null,
      data.consecutive_match_run as number | null,
      data.fired as boolean | null
    ),
    previous: rowToWindowState(
      data.previous_last_eligible_top10 as string[] | null,
      data.previous_consecutive_match_run as number | null,
      data.previous_fired as boolean | null
    ),
    lastCommitChangedWindow: (data.last_commit_changed_window as boolean | null) ?? false,
  };
}

/**
 * Upserts user_criterion_weights (one row per criterion x level), plus
 * user_calibration_status (tier + raw accuracy value + Brief 3's stability window,
 * combined-rule gated) from an already-solved computation. The caller (CriteriaCalibrationPage)
 * computes solveValues + computeScoreSpreadAccuracy exactly once per commit via
 * computeCommitState and shares that result across every consumer — this function no longer
 * re-solves them itself (see commitComputation.ts for why: three independent recomputes of
 * the same LP was the direct cause of the round-50+ UI blocking).
 *
 * The status write goes through the upsert_calibration_status RPC (see
 * supabase/user_calibration_status-add-stability-window.sql and
 * supabase/user_calibration_status-add-previous-window.sql), not a plain `.upsert()` —
 * `fired` needs an atomic `fired OR excluded.fired` at the database level so an
 * out-of-order write (the write-race documented in
 * docs/decisions/criteria-calibration-weights-write-race.md, still unfixed) can never
 * regress an already-fired stop signal back to unfired. Every other field here (including
 * consecutive_match_run/last_eligible_top10 and the previous_ triple / last_commit_changed_window
 * fields) still goes through that same unfixed race — only `fired`'s regression direction is
 * dangerous enough to need the guard now (see the second migration's header for why
 * previous_fired specifically doesn't need it either — it's mathematically always false).
 */
export async function upsertWeightsAndStatus(
  userId: string,
  catalog: CriteriaCatalog,
  computation: CommitComputation,
  // Defaults to the empty window so the pre-wiring call site (CriteriaCalibrationPage.tsx,
  // still on 3 args as of this commit) keeps compiling without silently losing real
  // progress: writing the empty window on every commit is safe under the OR-guard above
  // (can never regress a real fired=true) and there's no real per-commit tracking to lose
  // yet — this default should be removed once the UI wiring commit always passes a real,
  // live-tracked PersistedStabilityWindow.
  windowUpdate: PersistedStabilityWindow = INITIAL_PERSISTED_STABILITY_WINDOW
): Promise<void> {
  const { solved, accuracy, mediumReached } = computation;

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
  const { current, previous, lastCommitChangedWindow } = windowUpdate;

  const { error: statusError } = await supabase.rpc('upsert_calibration_status', {
    p_user_id: userId,
    p_tier: tier,
    p_accuracy_value: accuracy,
    p_last_eligible_top10: current.lastEligibleTop10 ? Array.from(current.lastEligibleTop10) : null,
    p_consecutive_match_run: current.consecutiveMatchRun,
    p_fired: current.fired,
    p_previous_last_eligible_top10: previous.lastEligibleTop10
      ? Array.from(previous.lastEligibleTop10)
      : null,
    p_previous_consecutive_match_run: previous.consecutiveMatchRun,
    p_previous_fired: previous.fired,
    p_last_commit_changed_window: lastCommitChangedWindow,
  });
  if (statusError) throw statusError;
}
