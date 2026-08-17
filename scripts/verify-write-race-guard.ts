// Repeatable regression check for the upsert_calibration_status write-race guard (see
// docs/decisions/criteria-calibration/criteria-calibration-weights-write-race.md and
// supabase/user_calibration_status-add-answer-count-guard.sql). Not run by `npm run test` —
// this exercises real Postgres conflict-clause semantics (CASE/WHEN inside `on conflict do
// update`), which a mocked `supabase.rpc()` call (as every *.test.ts file in this repo uses)
// cannot actually validate. Run manually against the live DB whenever this RPC changes:
//
//   npx tsx scripts/verify-write-race-guard.ts
//
// AMENDED 2026-08-17 for the four-parameter RPC (see
// supabase/user_calibration_status-drop-stability-window.sql). The former check #4 —
// which demonstrated that last_eligible_top10 / last_change_answer_index were NOT covered by
// the answer_count guard and could regress backward — is deleted along with those columns.
// It is not an unverified gap now; it is an unreachable one. Every field this RPC still
// writes goes through the guard checks 1-3 exercise, so this script now covers the RPC's
// whole surface rather than most of it.
//
// Uses the disposable QA test account (dgramada07@gmail.com) as the target row — the RPC's
// FK to auth.users means a fake UUID is rejected (confirmed live; the migration file's old
// manual-verification comment claiming otherwise was wrong). Confirms the account has no
// real row before running and deletes the scratch row again at the end.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
const supabase = createClient(url, key);

const TEST_USER_ID = '2c2e8851-2c5d-49f3-9aa2-6246b110ad3d';

async function callRpc(opts: { tier: string; accuracy: number; answerCount: number }) {
  const { error } = await supabase.rpc('upsert_calibration_status', {
    p_user_id: TEST_USER_ID,
    p_tier: opts.tier,
    p_accuracy_value: opts.accuracy,
    p_answer_count: opts.answerCount,
  });
  if (error) throw error;
}

async function readRow() {
  const { data, error } = await supabase
    .from('user_calibration_status')
    .select('accuracy_value, tier, answer_count')
    .eq('user_id', TEST_USER_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function cleanup() {
  await supabase.from('user_calibration_status').delete().eq('user_id', TEST_USER_ID);
}

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

async function main() {
  const preExisting = await readRow();
  if (preExisting) {
    throw new Error(
      `Refusing to run: ${TEST_USER_ID} already has a user_calibration_status row (${JSON.stringify(preExisting)}). This script assumes a clean slate.`
    );
  }

  console.log('\n1) Out-of-order answer_count: stale write must not regress accuracy_value/tier');
  await callRpc({ tier: 'high', accuracy: 0.92, answerCount: 10 });
  await callRpc({ tier: 'medium', accuracy: 0.7, answerCount: 9 }); // stale, arrives second
  let row = await readRow();
  check('accuracy_value stays at newer write (0.92)', row?.accuracy_value === 0.92);
  check('tier stays at newer write (high)', row?.tier === 'high');
  check('answer_count stays at newer write (10)', row?.answer_count === 10);

  console.log('\n2) Genuinely newer answer_count still applies');
  await callRpc({ tier: 'very_high', accuracy: 0.95, answerCount: 11 });
  row = await readRow();
  check('accuracy_value updates to 0.95', row?.accuracy_value === 0.95);
  check('answer_count updates to 11', row?.answer_count === 11);

  console.log('\n3) Tied answer_count (same count, different accuracy_value) still applies — confirms >= not >');
  await callRpc({ tier: 'very_high', accuracy: 0.955, answerCount: 11 });
  row = await readRow();
  check('accuracy_value updates to 0.955 on a tie (not silently dropped)', row?.accuracy_value === 0.955);

  await cleanup();
  console.log('\nCleaned up scratch row.');

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exit(1);
});
