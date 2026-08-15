// Repeatable regression check for the upsert_calibration_status write-race guard (see
// docs/decisions/criteria-calibration-weights-write-race.md and
// supabase/user_calibration_status-add-answer-count-guard.sql). Not run by `npm run test` —
// this exercises real Postgres conflict-clause semantics (CASE/WHEN inside `on conflict do
// update`), which a mocked `supabase.rpc()` call (as every *.test.ts file in this repo uses)
// cannot actually validate. Run manually against the live DB whenever this RPC changes:
//
//   npx tsx scripts/verify-write-race-guard.ts
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

async function callRpc(opts: {
  tier: string;
  accuracy: number;
  answerCount: number;
  lastEligibleTop10?: string[] | null;
  lastChangeAnswerIndex?: number;
}) {
  const { error } = await supabase.rpc('upsert_calibration_status', {
    p_user_id: TEST_USER_ID,
    p_tier: opts.tier,
    p_accuracy_value: opts.accuracy,
    p_answer_count: opts.answerCount,
    p_last_eligible_top10: opts.lastEligibleTop10 ?? null,
    p_last_change_answer_index: opts.lastChangeAnswerIndex ?? 0,
    p_fired: false,
    p_previous_last_eligible_top10: null,
    p_previous_last_change_answer_index: 0,
    p_previous_fired: false,
    p_last_commit_changed_window: false,
  });
  if (error) throw error;
}

async function readRow() {
  const { data, error } = await supabase
    .from('user_calibration_status')
    .select('accuracy_value, tier, answer_count, last_eligible_top10, last_change_answer_index')
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

  console.log(
    '\n4) Tied answer_count, different last_eligible_top10: NOT guarded by answer_count at all — ' +
      'whichever write lands last wins regardless of content (this is the exact mechanism ' +
      'flagged in the 2026-08-15 doc addendum as an unresolved gap, not something this test ' +
      'claims is safe)'
  );
  await callRpc({
    tier: 'very_high',
    accuracy: 0.955,
    answerCount: 11,
    lastEligibleTop10: ['album-early', 'album-stale'],
    lastChangeAnswerIndex: 4, // simulates the "incomplete" write's stale/reverted anchor
  });
  row = await readRow();
  check(
    'last_eligible_top10 became the stale set (["album-early","album-stale"]) even though answer_count tied',
    JSON.stringify(row?.last_eligible_top10) === JSON.stringify(['album-early', 'album-stale'])
  );
  check('last_change_answer_index regressed to 4 (moved BACKWARD from 11 — the real risk)', row?.last_change_answer_index === 4);

  await callRpc({
    tier: 'very_high',
    accuracy: 0.955,
    answerCount: 11,
    lastEligibleTop10: ['album-fresh'],
    lastChangeAnswerIndex: 11,
  });
  row = await readRow();
  check(
    'a subsequent tied write with a fresher payload overwrites again (last write wins, unconditionally)',
    JSON.stringify(row?.last_eligible_top10) === JSON.stringify(['album-fresh']) &&
      row?.last_change_answer_index === 11
  );

  await cleanup();
  console.log('\nCleaned up scratch row.');

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed (including the deliberately-unguarded scenario in #4).');
}

main().catch(async (e) => {
  console.error(e);
  await cleanup();
  process.exit(1);
});
