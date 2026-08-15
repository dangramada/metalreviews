// Read-only analysis of the second validation calibration session (2026-08-15), per the
// final-report brief. Replays the live `user_calibration_answers` log for Dan's account
// through the exact same solver/accuracy/stability-window/driver logic production uses (one
// LP solve per real answer, same as the prior fine-grained replay docs), to find:
//
//   1. the exact answer_count where `fired` flips true
//   2. leftover real questions in the current degree's pool at that moment
//   3. the accuracy trajectory
//   4. answer-log internal consistency (duplicates / row count sanity)
//
// No writes. No production code touched or imported-and-modified — only imported as-is.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from './supabaseClient.js';
import { RANKING_TEST_SET } from '../src/lib/criteria-calibration/rankingTestSet.js';
import { CalibrationSession } from '../src/lib/criteria-calibration/calibrationSession.js';
import {
  profileDegree,
  profileKey,
  type Profile,
} from '../src/lib/criteria-calibration/preferenceGraph.js';
import { solveValues, type SolverAnswer } from '../src/lib/criteria-calibration/solver.js';
import { computeScoreSpreadAccuracy } from '../src/lib/criteria-calibration/scoreSpreadAccuracy.js';
import { solverAccuracyTier } from '../src/lib/criteria-calibration/accuracyTiers.js';
import {
  toFlatWeights,
  computeTop10Set,
  advanceStabilityWindow,
  INITIAL_STABILITY_WINDOW_STATE,
  type StabilityWindowState,
} from '../src/lib/criteria-calibration/rankingStabilitySignal.js';
import { generateCandidatesForSubset } from '../src/lib/criteria-calibration/elicitationDriver.js';
import type { CriterionLevelRating } from '../src/lib/album-rating/scoreAndRank.js';

const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];
const CRITERIA_COUNT = 6;

const __dirname = dirname(fileURLToPath(import.meta.url));
// NOT docs/decisions/backups/ — that directory is gitignored (personal diagnostic dumps
// convention, see .gitignore:16) and this file is meant to be committed, per Dan's request.
const CSV_PATH = join(
  __dirname,
  '..',
  'docs',
  'decisions',
  'second-session-accuracy-trajectory-2026-08-15.csv'
);

interface AnswerRow {
  id: string;
  profile_a: Profile;
  profile_b: Profile;
  result: 'a_preferred' | 'b_preferred' | 'equal';
  answered_at: string;
}

function toComparisonResult(r: AnswerRow['result']): 'A' | 'B' | 'equal' {
  if (r === 'a_preferred') return 'A';
  if (r === 'b_preferred') return 'B';
  return 'equal';
}

// --- Local reimplementations of elicitationDriver.ts's non-exported helpers, needed to
// reproduce buildRefinementCandidatePool's exact pool at the firing checkpoint. Copied
// logic, not copied code where avoidable: generateCandidatesForSubset itself IS imported
// directly (exported), so the RNG/dominance/tie/dedup filtering is the real production
// function, not a reimplementation. Only the trivial combinatorial/lookup pieces around it
// are reproduced here, matching elicitationDriver.ts verbatim.
function enumerateCriterionSubsets(numCriteria: number, degree: number): number[][] {
  const subsets: number[][] = [];
  function build(start: number, current: number[]) {
    if (current.length === degree) {
      subsets.push([...current]);
      return;
    }
    for (let i = start; i < numCriteria; i++) {
      current.push(i);
      build(i + 1, current);
      current.pop();
    }
  }
  build(0, []);
  return subsets;
}

function computeTouchCounts(
  fullLog: readonly { profileA: Profile; profileB: Profile }[]
): number[][] {
  const counts = LEVELS_PER_CRITERION.map((max) => new Array<number>(max + 1).fill(0));
  for (const entry of fullLog) {
    for (const profile of [entry.profileA, entry.profileB]) {
      for (const key of Object.keys(profile)) {
        const idx = Number(key);
        const level = profile[idx];
        counts[idx][level]++;
      }
    }
  }
  return counts;
}

function hasBeenAsked(
  fullLog: readonly { profileA: Profile; profileB: Profile }[],
  profileA: Profile,
  profileB: Profile
): boolean {
  const keyA = profileKey(profileA);
  const keyB = profileKey(profileB);
  return fullLog.some((entry) => {
    const entryKeyA = profileKey(entry.profileA);
    const entryKeyB = profileKey(entry.profileB);
    return (entryKeyA === keyA && entryKeyB === keyB) || (entryKeyA === keyB && entryKeyB === keyA);
  });
}

/** Reproduces buildRefinementCandidatePool's pool.length exactly (same filters, same seeded
 *  RNG via the real generateCandidatesForSubset), for a session/degree snapshot. */
function poolSizeAt(session: CalibrationSession, degree: number): number {
  const touchCounts = computeTouchCounts(session.fullLog);
  const subsets = enumerateCriterionSubsets(CRITERIA_COUNT, degree);
  let count = 0;
  for (const subset of subsets) {
    for (const candidate of generateCandidatesForSubset(
      subset,
      LEVELS_PER_CRITERION,
      touchCounts
    )) {
      if (hasBeenAsked(session.fullLog, candidate.profileA, candidate.profileB)) continue;
      if (session.graph.isImplied(candidate.profileA, candidate.profileB).implied) continue;
      count++;
    }
  }
  return count;
}

async function main() {
  // --- Fetch the live, chronological answer log ------------------------------------------
  const { data: rows, error } = await supabase
    .from('user_calibration_answers')
    .select('id, profile_a, profile_b, result, answered_at')
    .eq('user_id', DAN_USER_ID)
    .order('answered_at', { ascending: true });
  if (error) throw new Error(error.message);
  const answers = (rows ?? []) as AnswerRow[];
  console.log(`Fetched ${answers.length} answers (chronological by answered_at).`);

  // --- Fetch RANKING_TEST_SET ratings (unaffected by the reset, confirmed intact) ---------
  const ids = RANKING_TEST_SET.map((a) => a.albumId);
  const { data: ratingRows, error: ratErr } = await supabase
    .from('album_criteria_ratings')
    .select('album_id, criterion_id, level')
    .eq('user_id', DAN_USER_ID)
    .in('album_id', ids);
  if (ratErr) throw new Error(ratErr.message);
  const ratingsByAlbum = new Map<string, CriterionLevelRating[]>();
  for (const r of ratingRows ?? []) {
    const list = ratingsByAlbum.get(r.album_id as string) ?? [];
    list.push({ criterionId: r.criterion_id as number, level: r.level as number });
    ratingsByAlbum.set(r.album_id as string, list);
  }
  console.log(
    `RANKING_TEST_SET ratings: ${ratingsByAlbum.size}/${RANKING_TEST_SET.length} albums.`
  );

  // --- Item 4: internal consistency check, on the RAW fetched rows -----------------------
  console.log('\n=== Consistency check ===');
  const seenPairKeys = new Set<string>();
  let duplicates = 0;
  for (const r of answers) {
    const keyA = profileKey(r.profile_a);
    const keyB = profileKey(r.profile_b);
    const pairKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
    if (seenPairKeys.has(pairKey)) {
      duplicates++;
      console.log(`  DUPLICATE profile pair: ${pairKey} (row id ${r.id}, at ${r.answered_at})`);
    }
    seenPairKeys.add(pairKey);
  }
  console.log(`  ${answers.length} rows, ${duplicates} duplicate profile-pair(s).`);
  // Flag any answered_at gap suspiciously small (<50ms) or non-monotonic, which would hint at
  // a race between an in-flight insert and an undo-delete around the same moment.
  let outOfOrder = 0;
  const closeTimestamps: string[] = [];
  for (let i = 1; i < answers.length; i++) {
    const dt =
      new Date(answers[i].answered_at).getTime() - new Date(answers[i - 1].answered_at).getTime();
    if (dt < 0) outOfOrder++;
    if (dt >= 0 && dt < 50) closeTimestamps.push(`  rows ${i - 1}/${i}: ${dt}ms apart`);
  }
  console.log(`  ${outOfOrder} out-of-order timestamp pair(s).`);
  console.log(`  ${closeTimestamps.length} suspiciously-close (<50ms) consecutive pair(s):`);
  for (const line of closeTimestamps) console.log(line);

  // --- Replay: one LP solve per real answer, exactly matching the fine-grained-replay method
  const session = new CalibrationSession();
  let windowState: StabilityWindowState = INITIAL_STABILITY_WINDOW_STATE;
  let firedAtIndex: number | null = null;
  let firedLastChangeIndex: number | null = null;
  const trajectory: {
    n: number;
    degree: number;
    result: string;
    accuracy: number;
    tier: string;
    fired: boolean;
    lastChangeAnswerIndex: number;
  }[] = [];

  for (let i = 0; i < answers.length; i++) {
    const row = answers[i];
    const result = toComparisonResult(row.result);
    session.recordAnswer(row.profile_a, row.profile_b, result);
    const n = i + 1;
    const degree = profileDegree(row.profile_a);

    const solverAnswers: SolverAnswer[] = session.fullLog.map((e) => ({
      profileA: e.profileA,
      profileB: e.profileB,
      result: e.result,
    }));
    const solved = solveValues({
      levelsPerCriterion: LEVELS_PER_CRITERION,
      answers: solverAnswers,
    });
    const accuracy = computeScoreSpreadAccuracy({
      levelsPerCriterion: LEVELS_PER_CRITERION,
      answers: solverAnswers,
    });
    const tier = solverAccuracyTier(accuracy);

    const weights = toFlatWeights(solved.values);
    const top10 = computeTop10Set(ratingsByAlbum, weights);
    if (top10 !== null) {
      const wasFired = windowState.fired;
      windowState = advanceStabilityWindow(windowState, n, tier, top10);
      if (!wasFired && windowState.fired && firedAtIndex === null) {
        firedAtIndex = n;
        firedLastChangeIndex = windowState.lastChangeAnswerIndex;
      }
    }

    trajectory.push({
      n,
      degree,
      result: row.result,
      accuracy,
      tier,
      fired: windowState.fired,
      lastChangeAnswerIndex: windowState.lastChangeAnswerIndex,
    });
  }

  console.log('\n=== Item 1: exact fired transition ===');
  if (firedAtIndex === null) {
    console.log('  fired never flipped true across the replayed log.');
  } else {
    const degreeAtFire = trajectory[firedAtIndex - 1].degree;
    console.log(
      `  fired flips true at answer_count = ${firedAtIndex} (degree ${degreeAtFire} question)`
    );
    console.log(`  last_change_answer_index at fire time = ${firedLastChangeIndex}`);
    console.log(
      `  (anchor/eligible-since span = ${firedAtIndex} - ${firedLastChangeIndex} = ${firedAtIndex! - firedLastChangeIndex!}, expect >= 12 = R)`
    );

    // --- Item 3 (leftover questions): reconstruct session state truncated to firedAtIndex,
    // compute the exact pool size for degreeAtFire at that moment.
    const truncatedSession = new CalibrationSession();
    for (let i = 0; i < firedAtIndex; i++) {
      const row = answers[i];
      truncatedSession.recordAnswer(row.profile_a, row.profile_b, toComparisonResult(row.result));
    }
    const pool = poolSizeAt(truncatedSession, degreeAtFire);
    console.log(
      `\n=== Item 3: real leftover questions in degree ${degreeAtFire}'s pool at firing ===`
    );
    console.log(
      `  pool.length = ${pool} (exact, same generateCandidatesForSubset/hasBeenAsked/isImplied logic as production)`
    );

    // Corroborating proxy: how many more real SAME-degree answers were actually asked after
    // firing, before the log shows a degree change (i.e. before degree-exhausted actually
    // gated the user forward). Distinct from pool.length above (that's an instantaneous
    // pool snapshot; this is what really happened afterward in the live session).
    let sameDegreeAfterFire = 0;
    for (let i = firedAtIndex; i < answers.length; i++) {
      if (profileDegree(answers[i].profile_a) === degreeAtFire) sameDegreeAfterFire++;
      else break;
    }
    console.log(
      `  corroborating: ${sameDegreeAfterFire} more real degree-${degreeAtFire} answer(s) were actually asked after firing before the degree changed in the log`
    );

    // Like-for-like with pass 2's 0/7/9 metric: pool.length at the actual exhaustion point
    // (the session's real final answer, where nextAction independently returns
    // degree-exhausted/coverage-complete), not at the firing point above (a different,
    // earlier moment in this session — see the report caveat).
    const finalDegree = trajectory[trajectory.length - 1].degree;
    const poolAtEnd = poolSizeAt(session, finalDegree);
    console.log(
      `\n=== Pool size at actual exhaustion (n=${answers.length}, degree ${finalDegree}) ===`
    );
    console.log(`  pool.length = ${poolAtEnd} (like-for-like with pass 2's 0/7/9 metric)`);
  }

  console.log('\n=== Item 4 (comparison basis, first session) ===');
  console.log('  First session (70-answer trace): K=2/fine-grained false positive at n=28,');
  console.log('  corrected duration-based signal settles at n=35; R=12 fires at n=47 in that');
  console.log('  replay (35+12) per criteria-calibration-duration-based-window-fix.md.');

  console.log('\n=== Item 2 (accuracy trajectory) ===');
  console.log('  n\tdegree\tresult\taccuracy\ttier\tfired\tlastChangeIdx');
  for (const t of trajectory) {
    console.log(
      `  ${t.n}\t${t.degree}\t${t.result}\t${t.accuracy.toFixed(4)}\t${t.tier}\t${t.fired}\t${t.lastChangeAnswerIndex}`
    );
  }

  // "About equal" clustering
  const equalIndices = trajectory
    .map((t, idx) => (t.result === 'equal' ? idx + 1 : null))
    .filter((x): x is number => x !== null);
  console.log(
    `\n  "equal" answers at n = [${equalIndices.join(', ')}] (${equalIndices.length}/${trajectory.length})`
  );

  const csvHeader = 'n,degree,result,accuracy,tier,fired,last_change_answer_index';
  const csvRows = trajectory.map(
    (t) =>
      `${t.n},${t.degree},${t.result},${t.accuracy.toFixed(6)},${t.tier},${t.fired},${t.lastChangeAnswerIndex}`
  );
  writeFileSync(CSV_PATH, [csvHeader, ...csvRows].join('\n') + '\n');
  console.log(`\nAccuracy trajectory written to: ${CSV_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
