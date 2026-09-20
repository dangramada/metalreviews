// One-off diagnostic for the "Restart leaves stale/contradictory score state" brief
// (docs/decisions/criteria-calibration/criteria-calibration-restart-stale-state-diagnostic.md,
// Q3). Exercises the
// real upsert_calibration_status RPC and the real user_criterion_weights upsert shape
// (mirroring src/lib/criteria-calibration/persistence.ts's upsertWeightsAndStatus exactly —
// two independent writes, one guarded, one not) against the disposable QA test account, the
// same account and pattern scripts/diagnostics/verify-write-race-guard.ts uses.
//
// Read-mostly: writes only to the disposable QA account's own rows, filtered by user_id
// throughout, and deletes every row it creates at the end (or on failure).
//
//   npx tsx scripts/diagnostics/restart-stale-state-2026-09-20.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
const supabase = createClient(url, key);

const TEST_USER_ID = '2c2e8851-2c5d-49f3-9aa2-6246b110ad3d';
const CRITERION_ID = 0;
const LEVEL = 1;

async function callStatusRpc(opts: { tier: string; accuracy: number; answerCount: number }) {
  const { error } = await supabase.rpc('upsert_calibration_status', {
    p_user_id: TEST_USER_ID,
    p_tier: opts.tier,
    p_accuracy_value: opts.accuracy,
    p_answer_count: opts.answerCount,
  });
  if (error) throw error;
}

// Mirrors persistence.ts's upsertWeightsAndStatus: an unconditional upsert, no guard.
async function writeWeight(value: number) {
  const { error } = await supabase
    .from('user_criterion_weights')
    .upsert(
      { user_id: TEST_USER_ID, criterion_id: CRITERION_ID, level: LEVEL, value },
      { onConflict: 'user_id,criterion_id,level' }
    );
  if (error) throw error;
}

async function readStatus() {
  const { data, error } = await supabase
    .from('user_calibration_status')
    .select('accuracy_value, tier, answer_count')
    .eq('user_id', TEST_USER_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function readWeight() {
  const { data, error } = await supabase
    .from('user_criterion_weights')
    .select('value')
    .eq('user_id', TEST_USER_ID)
    .eq('criterion_id', CRITERION_ID)
    .eq('level', LEVEL)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

async function cleanup() {
  await supabase.from('user_calibration_status').delete().eq('user_id', TEST_USER_ID);
  await supabase
    .from('user_criterion_weights')
    .delete()
    .eq('user_id', TEST_USER_ID)
    .eq('criterion_id', CRITERION_ID)
    .eq('level', LEVEL);
}

// Restores whatever state the account had before this script ran, rather than assuming a
// leftover row is safe to discard — the account is disposable-for-testing, not
// zero-state-guaranteed, and an earlier session may have left something in it deliberately.
async function restore(
  status: { accuracy_value: number; tier: string; answer_count: number } | null,
  weight: number | null
) {
  await cleanup();
  if (status) await callStatusRpc({ tier: status.tier, accuracy: status.accuracy_value, answerCount: status.answer_count });
  if (weight !== null) await writeWeight(weight);
}

let failures = 0;
function check(label: string, pass: boolean) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'} — ${label}`);
  if (!pass) failures++;
}

async function main() {
  const originalStatus = await readStatus();
  const originalWeight = await readWeight();
  if (originalStatus || originalWeight !== null) {
    console.log(
      `Note: ${TEST_USER_ID} already has state (status=${JSON.stringify(originalStatus)}, weight=${originalWeight}) — will restore it exactly after this run.`
    );
  }

  try {
  console.log('\nScenario 1 — empty account, no prior calibration ever');
  await callStatusRpc({ tier: 'none', accuracy: 0.1, answerCount: 1 });
  await writeWeight(0.11);
  let status = await readStatus();
  let weight = await readWeight();
  check('first-ever write is adopted immediately (no row to be stale relative to)', status?.tier === 'none' && status?.answer_count === 1);
  check('weight reflects the first commit', weight === 0.11);
  await cleanup();

  console.log('\nScenario 2 — Restart, then answer up to (but not past) the old answer_count');
  // Simulate the old, pre-restart session's stored state: 30 answers, tier frozen at very_high.
  await callStatusRpc({ tier: 'very_high', accuracy: 0.98, answerCount: 30 });
  await writeWeight(0.98);
  // New session, answers 1..29 (Restart cleared user_calibration_answers but never touched
  // this row, so every write below races against a stored answer_count of 30).
  for (let i = 1; i <= 29; i++) {
    await callStatusRpc({ tier: 'none', accuracy: 0.2, answerCount: i });
    await writeWeight(0.2 + i * 0.001); // unconditional — always overwrites
  }
  status = await readStatus();
  weight = await readWeight();
  check('tier still frozen at old value after 29 new answers', status?.tier === 'very_high' && status?.answer_count === 30);
  check('weight already reflects the tiny new-session model (desync from tier)', Math.abs((weight ?? 0) - (0.2 + 29 * 0.001)) < 1e-9);
  // Answer #30 — exactly equal to the old stored count, not past it.
  await callStatusRpc({ tier: 'medium', accuracy: 0.5, answerCount: 30 });
  status = await readStatus();
  check('guard releases at equality (>=), not only when strictly exceeded', status?.tier === 'medium' && status?.answer_count === 30);
  await cleanup();

  console.log('\nScenario 3 — Restart, then Undo before reaching the old answer_count');
  await callStatusRpc({ tier: 'very_high', accuracy: 0.98, answerCount: 30 });
  await writeWeight(0.98);
  // New session reaches 10 answers.
  await callStatusRpc({ tier: 'none', accuracy: 0.4, answerCount: 10 });
  await writeWeight(0.41);
  // Undo one answer — recompute is a fresh call with the trimmed (smaller) answerCount, same
  // as any other commit; nothing Undo-specific happens in the guard itself.
  await callStatusRpc({ tier: 'none', accuracy: 0.35, answerCount: 9 });
  await writeWeight(0.36);
  status = await readStatus();
  weight = await readWeight();
  check('status still frozen at the old session value (10 and 9 both < 30)', status?.tier === 'very_high' && status?.answer_count === 30);
  check('weight still unconditionally overwritten by the post-Undo recompute', weight === 0.36);
  await cleanup();

  console.log('\nScenario 4 — Restart happening at a degree boundary in the old session');
  await callStatusRpc({ tier: 'very_high', accuracy: 0.98, answerCount: 30 });
  await writeWeight(0.98);
  // New session reaches 5 answers, then crosses a degree boundary — which fires a
  // status-ONLY write (upsertCalibrationStatus, not upsertWeightsAndStatus) at the SAME
  // answerCount as the last commit, per persistence.ts's own comment on that function.
  await callStatusRpc({ tier: 'none', accuracy: 0.3, answerCount: 5 });
  await writeWeight(0.31);
  await callStatusRpc({ tier: 'medium', accuracy: 0.3, answerCount: 5 }); // boundary promotion, same count
  status = await readStatus();
  check(
    'boundary promotion does not bypass the guard — still frozen (5 < 30, degree is irrelevant to this check)',
    status?.tier === 'very_high' && status?.answer_count === 30
  );
  await cleanup();

  } finally {
    await restore(originalStatus, originalWeight);
    console.log('\nRestored original account state.');
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
