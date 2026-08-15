// One-off, READ-ONLY Step 0 verification for the calibration-reset brief (2026-08-15).
// Confirms the target account identity, RANKING_TEST_SET ratings coverage, and exports a
// backup of everything the reset will delete. Makes no writes to Supabase.
//
//   npx tsx scripts/verify-pre-reset-step0.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from './supabaseClient.js';
import { RANKING_TEST_SET } from '../src/lib/criteria-calibration/rankingTestSet.js';

const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';
const DAN_EMAIL = 'dan.gramada@gmail.com';
const CRITERIA_COUNT = 6;

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR = join(__dirname, '..', 'docs', 'decisions', 'backups');

async function main() {
  // --- Check 1: user_id <-> email match, via the admin auth API (service key) --------------
  const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(DAN_USER_ID);
  if (userErr) throw new Error(`auth.admin.getUserById failed: ${userErr.message}`);
  const email = userData.user?.email;
  console.log('--- Check 1: identity ---');
  console.log(`  auth.users id ${DAN_USER_ID} -> email: ${email}`);
  console.log(`  MATCH: ${email === DAN_EMAIL ? 'YES' : 'NO'}`);

  // --- Check 2: RANKING_TEST_SET ratings coverage for this account -------------------------
  const ids = RANKING_TEST_SET.map((a) => a.albumId);
  const { data: ratings, error: ratErr } = await supabase
    .from('album_criteria_ratings')
    .select('album_id, criterion_id, level, user_id')
    .eq('user_id', DAN_USER_ID)
    .in('album_id', ids);
  if (ratErr) throw new Error(`album_criteria_ratings read failed: ${ratErr.message}`);

  const byAlbum = new Map<string, number>();
  for (const r of ratings ?? []) {
    byAlbum.set(r.album_id as string, (byAlbum.get(r.album_id as string) ?? 0) + 1);
  }
  console.log('\n--- Check 2: RANKING_TEST_SET coverage ---');
  console.log(`  total rating rows for this user across the 13 albums: ${ratings?.length ?? 0}`);
  let fullyRated = 0;
  for (const a of RANKING_TEST_SET) {
    const n = byAlbum.get(a.albumId) ?? 0;
    if (n === CRITERIA_COUNT) fullyRated++;
    else console.log(`  INCOMPLETE: ${a.band} - ${a.name} (${a.albumId}): ${n}/${CRITERIA_COUNT}`);
  }
  console.log(
    `  fully rated (all ${CRITERIA_COUNT} criteria): ${fullyRated}/${RANKING_TEST_SET.length}`
  );

  // Cross-check: are any of these rows owned by a *different* user? Note this script runs on
  // the service key, which BYPASSES RLS — hence the explicit .eq('user_id', ...) above, and
  // hence this deliberately-unfiltered query being able to see other owners at all. The
  // frontend's useRankingTestSetRatings has no user_id filter but is safe regardless: RLS
  // (`using (auth.uid() = user_id)`, album_criteria_ratings.sql) scopes it per-user at the DB.
  const { data: allRatings, error: allErr } = await supabase
    .from('album_criteria_ratings')
    .select('user_id')
    .in('album_id', ids);
  if (allErr) throw new Error(`album_criteria_ratings (all users) read failed: ${allErr.message}`);
  const owners = new Map<string, number>();
  for (const r of allRatings ?? []) {
    owners.set(r.user_id as string, (owners.get(r.user_id as string) ?? 0) + 1);
  }
  console.log('  rows on these 13 albums by owner:');
  for (const [uid, n] of owners) console.log(`    ${uid}: ${n}`);

  // --- Check 4: backup export --------------------------------------------------------------
  const [answers, weights, status] = await Promise.all([
    supabase.from('user_calibration_answers').select('*').eq('user_id', DAN_USER_ID),
    supabase.from('user_criterion_weights').select('*').eq('user_id', DAN_USER_ID),
    supabase.from('user_calibration_status').select('*').eq('user_id', DAN_USER_ID),
  ]);
  for (const [name, res] of [
    ['answers', answers],
    ['weights', weights],
    ['status', status],
  ] as const) {
    if (res.error) throw new Error(`read ${name} failed: ${res.error.message}`);
  }

  console.log('\n--- Check 4: backup ---');
  console.log(`  user_calibration_answers: ${answers.data?.length ?? 0} row(s)`);
  console.log(`  user_criterion_weights:   ${weights.data?.length ?? 0} row(s)`);
  console.log(`  user_calibration_status:  ${JSON.stringify(status.data)}`);

  mkdirSync(BACKUPS_DIR, { recursive: true });
  const filePath = join(BACKUPS_DIR, 'pre-reset-dan-account-2026-08-15.json');
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        purpose: 'Pre-reset backup before second validation calibration session',
        userId: DAN_USER_ID,
        email,
        user_calibration_answers: answers.data,
        user_criterion_weights: weights.data,
        user_calibration_status: status.data,
      },
      null,
      2
    )
  );
  console.log(`  written to: ${filePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
