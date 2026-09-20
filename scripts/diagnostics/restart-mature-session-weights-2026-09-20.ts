// Follow-up to restart-stale-state-2026-09-20.ts, for
// docs/decisions/criteria-calibration/criteria-calibration-restart-stale-state-diagnostic.md's
// "mature session" addendum. Seeds the disposable QA test account with a real mature session's
// solved weights (REAL_PRODUCTION_SESSION_ANSWERS, 33 answers — Dan's own account data, already
// embedded in fixtures.ts with his explicit sign-off, see that file's header), triggers the
// exact write handleRestart's applyCommitComputation makes on its first render (an unconditional
// user_criterion_weights upsert to the zero-answer solve, plus the guarded status RPC at
// p_answer_count=0), and reads the DB directly before/after to settle whether weights actually
// change at that exact moment.
//
// Captures and restores the account's pre-existing state exactly, same as
// restart-stale-state-2026-09-20.ts.
//
//   npx tsx scripts/diagnostics/restart-mature-session-weights-2026-09-20.ts

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
} from '../../src/lib/criteria-calibration/fixtures.js';
import { solveValues } from '../../src/lib/criteria-calibration/solver.js';
import { computeScoreSpreadAccuracy } from '../../src/lib/criteria-calibration/scoreSpreadAccuracy.js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
const supabase = createClient(url, key);

const TEST_USER_ID = '2c2e8851-2c5d-49f3-9aa2-6246b110ad3d';
const LEVELS_PER_CRITERION = REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION; // [5,5,5,5,5,5]

type WeightRow = { criterion_id: number; level: number; value: number };

async function writeWeights(values: { point: number }[][]) {
  const rows: { user_id: string; criterion_id: number; level: number; value: number }[] = [];
  for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
    for (let level = 1; level <= LEVELS_PER_CRITERION[c]; level++) {
      rows.push({ user_id: TEST_USER_ID, criterion_id: c, level, value: values[c][level].point });
    }
  }
  const { error } = await supabase
    .from('user_criterion_weights')
    .upsert(rows, { onConflict: 'user_id,criterion_id,level' });
  if (error) throw error;
}

async function readWeights(): Promise<WeightRow[]> {
  const { data, error } = await supabase
    .from('user_criterion_weights')
    .select('criterion_id, level, value')
    .eq('user_id', TEST_USER_ID)
    .order('criterion_id')
    .order('level');
  if (error) throw error;
  return (data ?? []) as WeightRow[];
}

async function callStatusRpc(opts: { tier: string; accuracy: number; answerCount: number }) {
  const { error } = await supabase.rpc('upsert_calibration_status', {
    p_user_id: TEST_USER_ID,
    p_tier: opts.tier,
    p_accuracy_value: opts.accuracy,
    p_answer_count: opts.answerCount,
  });
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

async function cleanupAll() {
  await supabase.from('user_calibration_status').delete().eq('user_id', TEST_USER_ID);
  await supabase.from('user_criterion_weights').delete().eq('user_id', TEST_USER_ID);
}

async function main() {
  const originalStatus = await readStatus();
  const originalWeights = await readWeights();
  if (originalStatus || originalWeights.length > 0) {
    console.log(
      `Note: ${TEST_USER_ID} already has state (status=${JSON.stringify(originalStatus)}, ${originalWeights.length} weight rows) — will restore it exactly after this run.`
    );
  }
  await cleanupAll();

  try {
    // 1. Seed the "mature session" state — exactly what 33 real answers solve to.
    const mature = solveValues({ levelsPerCriterion: LEVELS_PER_CRITERION, answers: REAL_PRODUCTION_SESSION_ANSWERS });
    const matureAccuracy = computeScoreSpreadAccuracy({
      levelsPerCriterion: LEVELS_PER_CRITERION,
      answers: REAL_PRODUCTION_SESSION_ANSWERS,
    });
    await writeWeights(mature.values);
    await callStatusRpc({ tier: 'very_high', accuracy: matureAccuracy, answerCount: REAL_PRODUCTION_SESSION_ANSWERS.length });

    const before = await readWeights();
    const beforeStatus = await readStatus();
    console.log(`\nBEFORE Restart — ${REAL_PRODUCTION_SESSION_ANSWERS.length}-answer mature session:`);
    console.log('  status:', beforeStatus);
    console.log('  weights (criterion_id: [level1..level5]):');
    for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
      const row = before.filter((w) => w.criterion_id === c).map((w) => w.value.toFixed(4));
      console.log(`    c${c}: [${row.join(', ')}]`);
    }

    // 2. Fire the EXACT write handleRestart's applyCommitComputation makes on its first
    // render, before any new answer and before deleteAllAnswers even resolves: an
    // unconditional weights upsert to the zero-answer solve, plus the guarded status RPC at
    // p_answer_count=0 (tierRef.current at that moment is still the OLD tier, 'very_high').
    const restart = solveValues({ levelsPerCriterion: LEVELS_PER_CRITERION, answers: [] });
    await writeWeights(restart.values);
    await callStatusRpc({ tier: 'very_high', accuracy: 0, answerCount: 0 });

    const after = await readWeights();
    const afterStatus = await readStatus();
    console.log('\nAFTER Restart, zero new answers, queried immediately:');
    console.log('  status:', afterStatus);
    console.log('  weights (criterion_id: [level1..level5]):');
    for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
      const row = after.filter((w) => w.criterion_id === c).map((w) => w.value.toFixed(4));
      console.log(`    c${c}: [${row.join(', ')}]`);
    }

    console.log('\nVerdict:');
    console.log(`  status unchanged: ${afterStatus?.tier === beforeStatus?.tier && afterStatus?.answer_count === beforeStatus?.answer_count} (guard rejects p_answer_count=0 < ${beforeStatus?.answer_count})`);
    const weightsChanged = before.some((b, i) => Math.abs(b.value - after[i].value) > 1e-9);
    console.log(`  weights changed: ${weightsChanged}`);

    // 3. Score a couple of representative album profiles under both weight sets, to show
    // where the visible score WOULD and WOULD NOT move.
    function scoreAtUniformLevel(values: typeof mature.values, level: number) {
      let total = 0;
      for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) total += values[c][level].point;
      return total;
    }
    console.log('\nSample profile scores (mature vs. restart-zero weights):');
    console.log(`  all criteria at level 5 (a "perfect" album): mature=${scoreAtUniformLevel(mature.values, 5).toFixed(4)}, restart=${scoreAtUniformLevel(restart.values, 5).toFixed(4)} — identical by the LP's own sum-to-1-at-max-level normalization constraint, independent of answer content`);
    console.log(`  all criteria at level 3 (a mid-range album): mature=${scoreAtUniformLevel(mature.values, 3).toFixed(4)}, restart=${scoreAtUniformLevel(restart.values, 3).toFixed(4)} — NOT protected by that constraint, moves substantially`);
  } finally {
    await cleanupAll();
    if (originalStatus) await callStatusRpc({ tier: originalStatus.tier, accuracy: originalStatus.accuracy_value, answerCount: originalStatus.answer_count });
    if (originalWeights.length > 0) {
      const { error } = await supabase
        .from('user_criterion_weights')
        .upsert(originalWeights.map((w) => ({ user_id: TEST_USER_ID, ...w })), { onConflict: 'user_id,criterion_id,level' });
      if (error) throw error;
    }
    console.log('\nRestored original account state.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
