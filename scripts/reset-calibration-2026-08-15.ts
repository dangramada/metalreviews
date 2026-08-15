// One-off admin script (2026-08-15): reset Dan's criteria-calibration session to a genuinely
// fresh state for a second validation run. Supersedes archive-and-reset-calibration.ts's
// --reset path, which upserted user_calibration_status to {tier:'none', accuracy_value:0} —
// that is NO LONGER SUFFICIENT: the upsert_calibration_status guard added in
// supabase/user_calibration_status-add-answer-count-guard.sql makes answer_count monotonic
// (`greatest(existing, excluded)`) and `fired` sticky (`existing or excluded`), so those
// fields cannot be reset downward through an upsert. DELETE is the only way to clear them.
// Deleting the row is also the state fetchPersistedStabilityWindow already handles: with no
// row it returns INITIAL_PERSISTED_STABILITY_WINDOW (persistence.ts).
//
//   npx tsx scripts/reset-calibration-2026-08-15.ts
//
// Backup was taken first by verify-pre-reset-step0.ts ->
// docs/decisions/backups/pre-reset-dan-account-2026-08-15.json
//
// Scoped to a single hardcoded user_id. album_criteria_ratings is deliberately NEVER touched.

import { supabase } from './supabaseClient.js';
import { RANKING_TEST_SET } from '../src/lib/criteria-calibration/rankingTestSet.js';

const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';
const CRITERIA_COUNT = 6;

async function countFor(table: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw new Error(`count ${table} failed: ${error.message}`);
  return count ?? 0;
}

// Guards against a delete that leaks past the user_id filter: snapshot every other user's
// row count before, compare after.
async function countsByOtherUsers(table: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from(table).select('user_id');
  if (error) throw new Error(`count-by-user ${table} failed: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    if (uid === DAN_USER_ID) continue;
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }
  return counts;
}

async function main() {
  console.log('=== BEFORE ===');
  const beforeOtherAnswers = await countsByOtherUsers('user_calibration_answers');
  const beforeOtherWeights = await countsByOtherUsers('user_criterion_weights');
  const beforeOtherStatus = await countsByOtherUsers('user_calibration_status');
  const ratingsBefore = await countFor('album_criteria_ratings', DAN_USER_ID);
  console.log(
    `  user_calibration_answers: ${await countFor('user_calibration_answers', DAN_USER_ID)}`
  );
  console.log(
    `  user_criterion_weights:   ${await countFor('user_criterion_weights', DAN_USER_ID)}`
  );
  console.log(
    `  user_calibration_status:  ${await countFor('user_calibration_status', DAN_USER_ID)}`
  );
  console.log(`  album_criteria_ratings:   ${ratingsBefore}  (MUST NOT CHANGE)`);

  console.log('\n=== DELETING ===');
  for (const table of [
    'user_calibration_answers',
    'user_criterion_weights',
    'user_calibration_status',
  ]) {
    const { error } = await supabase.from(table).delete().eq('user_id', DAN_USER_ID);
    if (error) throw new Error(`delete ${table} failed: ${error.message}`);
    console.log(`  deleted ${table} for ${DAN_USER_ID}`);
  }

  console.log('\n=== AFTER (expect 0 / 0 / 0) ===');
  const aAnswers = await countFor('user_calibration_answers', DAN_USER_ID);
  const aWeights = await countFor('user_criterion_weights', DAN_USER_ID);
  const aStatus = await countFor('user_calibration_status', DAN_USER_ID);
  console.log(`  user_calibration_answers: ${aAnswers}`);
  console.log(`  user_criterion_weights:   ${aWeights}`);
  console.log(`  user_calibration_status:  ${aStatus}`);

  const ratingsAfter = await countFor('album_criteria_ratings', DAN_USER_ID);
  console.log(
    `  album_criteria_ratings:   ${ratingsAfter} (was ${ratingsBefore}) -> ${
      ratingsAfter === ratingsBefore ? 'UNCHANGED OK' : 'CHANGED — PROBLEM'
    }`
  );

  console.log('\n=== OTHER USERS UNCHANGED? ===');
  for (const [table, before] of [
    ['user_calibration_answers', beforeOtherAnswers],
    ['user_criterion_weights', beforeOtherWeights],
    ['user_calibration_status', beforeOtherStatus],
  ] as const) {
    const after = await countsByOtherUsers(table);
    const ids = new Set([...before.keys(), ...after.keys()]);
    let mismatches = 0;
    for (const uid of ids) {
      if ((before.get(uid) ?? 0) !== (after.get(uid) ?? 0)) {
        mismatches++;
        console.error(`  MISMATCH ${table} user ${uid}: ${before.get(uid)} -> ${after.get(uid)}`);
      }
    }
    console.log(`  ${table}: ${ids.size} other user(s), ${mismatches} mismatch(es)`);
  }

  // --- Step 2 fresh-state checks -----------------------------------------------------------
  console.log('\n=== STEP 2: FRESH STATE ===');

  // useCalibrationResume derives degree as max(profile key count) over persisted answers,
  // seeded with STARTING_DEGREE=2 — with zero rows the reduce returns the seed unchanged.
  const { data: answerRows, error: aErr } = await supabase
    .from('user_calibration_answers')
    .select('profile_a')
    .eq('user_id', DAN_USER_ID);
  if (aErr) throw new Error(aErr.message);
  const maxDegree = (answerRows ?? []).reduce(
    (max, r) => Math.max(max, Object.keys(r.profile_a as object).length),
    2
  );
  console.log(`  inferred resume degree: ${maxDegree} (expect 2 = STARTING_DEGREE)`);

  // fetchPersistedStabilityWindow returns INITIAL_PERSISTED_STABILITY_WINDOW when maybeSingle
  // finds no row — verify the row really is absent.
  const { data: statusRow, error: sErr } = await supabase
    .from('user_calibration_status')
    .select('*')
    .eq('user_id', DAN_USER_ID)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  console.log(
    `  status row: ${statusRow === null ? 'null -> INITIAL_PERSISTED_STABILITY_WINDOW, tier none, 0% progress' : JSON.stringify(statusRow)}`
  );

  // useRankingTestSetRatings must still return a non-empty, fully-rated map.
  const ids = RANKING_TEST_SET.map((a) => a.albumId);
  const { data: ratings, error: rErr } = await supabase
    .from('album_criteria_ratings')
    .select('album_id, criterion_id, level')
    .in('album_id', ids);
  if (rErr) throw new Error(rErr.message);
  const byAlbum = new Map<string, number>();
  for (const r of ratings ?? []) {
    byAlbum.set(r.album_id as string, (byAlbum.get(r.album_id as string) ?? 0) + 1);
  }
  const fullyRated = [...byAlbum.values()].filter((n) => n === CRITERIA_COUNT).length;
  console.log(
    `  RANKING_TEST_SET: ${ratings?.length ?? 0} rating rows, ${fullyRated}/${RANKING_TEST_SET.length} fully rated (expect 78, 13/13)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
