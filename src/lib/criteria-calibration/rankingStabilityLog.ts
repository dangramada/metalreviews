// TEMPORARY — diagnostic instrument for the ranking-stability test session (Brief 2). Observes
// how the RANKING_TEST_SET's score/rank snapshot evolves against accuracy as answers land,
// to validate whether MEDIUM_ACCURACY_THRESHOLD is a sensible auto-stop point (see
// docs/decisions/criteria-calibration-adaptive-degree-escalation.md and its follow-ups).
// Never influences the session — read-only observation, fire-and-forget logging.
//
// Does not touch solver.ts / simplex.ts / elicitationDriver.ts / preferenceGraph.ts /
// scoreSpreadAccuracy.ts / accuracyTiers.ts / scoreAndRank.ts — only calls their existing
// exports. To disable after the test session, flip RANKING_STABILITY_LOGGING_ENABLED to
// false below, or remove the maybeLogSnapshot(...) call sites in CriteriaCalibrationPage.tsx.
// Delete this file (and the /api/ranking-stability-log route in server.ts) once the session's
// data has been collected and analyzed.

import { supabase } from '../../supabaseClient.js';
import type { SolverAnswer } from './solver.js';
import { computeScore, rankAlbum, type ScoredAlbum } from '../album-rating/scoreAndRank.js';
import { RANKING_TEST_SET } from './rankingTestSet.js';
import type { CriteriaCatalog } from './criteriaCatalog.js';
import type { CommitComputation } from './commitComputation.js';

export const RANKING_STABILITY_LOGGING_ENABLED = true;

// Snapshot cadence — every Nth committed answer.
const LOG_EVERY_N_ANSWERS = 3;

// Fixed per page-load, so every snapshot in one run lands in the same log file.
const RUN_DATE = new Date().toISOString().slice(0, 10);

// Cached after the first fetch — the 13 test albums' ratings don't change mid-session.
let ratingsCache: Map<string, { criterionId: number; level: number }[]> | null = null;
let ratingsFetchPromise: Promise<void> | null = null;

async function ensureRatingsLoaded(): Promise<void> {
  if (ratingsCache) return;
  if (!ratingsFetchPromise) {
    ratingsFetchPromise = (async () => {
      const albumIds = RANKING_TEST_SET.map((a) => a.albumId);
      const { data, error } = await supabase
        .from('album_criteria_ratings')
        .select('album_id, criterion_id, level')
        .in('album_id', albumIds);
      if (error) {
        console.warn('[rankingStabilityLog] Failed to load test-set ratings', error);
        ratingsCache = new Map();
        return;
      }
      const byAlbum = new Map<string, { criterionId: number; level: number }[]>();
      for (const row of data ?? []) {
        const list = byAlbum.get(row.album_id) ?? [];
        list.push({ criterionId: row.criterion_id, level: row.level });
        byAlbum.set(row.album_id, list);
      }
      ratingsCache = byAlbum;
    })();
  }
  await ratingsFetchPromise;
}

/**
 * Call after every committed answer (new answer or redo — not undo). No-ops unless logging is
 * enabled and this is the Nth answer. Fire-and-forget: never awaited by the caller, never
 * throws into the UI. Takes the caller's already-solved `computation` (see
 * commitComputation.ts) instead of re-running solveValues/computeScoreSpreadAccuracy itself —
 * this hook used to be a third independent recompute of the same LP on every 3rd commit,
 * which compounded the round-50+ blocking; it now reuses the one computation the commit
 * already produced.
 */
export function maybeLogSnapshot(
  nextAnswers: SolverAnswer[],
  catalog: CriteriaCatalog,
  computation: CommitComputation
): void {
  if (!RANKING_STABILITY_LOGGING_ENABLED) return;
  if (nextAnswers.length % LOG_EVERY_N_ANSWERS !== 0) return;

  logSnapshot(nextAnswers, catalog, computation).catch((e) =>
    console.warn('[rankingStabilityLog] Failed to log snapshot', e)
  );
}

async function logSnapshot(
  answers: SolverAnswer[],
  catalog: CriteriaCatalog,
  computation: CommitComputation
): Promise<void> {
  await ensureRatingsLoaded();
  if (!ratingsCache || ratingsCache.size === 0) return;

  const { accuracy, solved } = computation;

  const weights = catalog.entries.flatMap((entry) =>
    Object.keys(entry.levels)
      .map(Number)
      .map((level) => ({
        criterionId: entry.index,
        level,
        value: solved.values[entry.index][level].point,
      }))
  );

  const scored: ScoredAlbum[] = [];
  for (const album of RANKING_TEST_SET) {
    const ratings = ratingsCache.get(album.albumId) ?? [];
    const score = computeScore(ratings, weights);
    if (score !== null) scored.push({ albumId: album.albumId, score });
  }

  const ranking = scored.map((s) => ({
    albumId: s.albumId,
    score: s.score,
    rank: rankAlbum(s.albumId, scored),
  }));

  await fetch('/api/ranking-stability-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answerCount: answers.length, accuracy, ranking, runDate: RUN_DATE }),
  });
}
