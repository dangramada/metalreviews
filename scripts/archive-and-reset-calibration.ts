// One-off admin script: archive Dan's production criteria-calibration session, then reset it
// to a fresh starting state, so a new controlled session can be run to validate the Medium
// auto-stop threshold (see docs/decisions/criteria-calibration-adaptive-degree-escalation.md
// and the follow-up briefs it references). Not wired into package.json or CI — run manually:
//
//   npx tsx scripts/archive-and-reset-calibration.ts --export-only   (steps 1-3, safe, no writes)
//   npx tsx scripts/archive-and-reset-calibration.ts --reset         (DISABLED — see below)
//
// !! --reset IS DISABLED as of 2026-08-15. Use scripts/reset-calibration-2026-08-15.ts. !!
// Its resetCalibration() below upserts user_calibration_status to {tier:'none',
// accuracy_value:0}, which was a complete reset when written but is NOT anymore: the
// upsert_calibration_status guard added in
// supabase/user_calibration_status-add-answer-count-guard.sql made answer_count monotonic
// (`greatest(existing, excluded)`) and `fired` sticky (`existing or excluded`), so neither
// can be cleared through an upsert. Running it now would leave a half-reset row — a stale
// answer_count/fired surviving into what looks like a fresh session — and silently corrupt
// the very stability-window signal a fresh validation session exists to measure. The
// replacement DELETEs the row instead. --export-only remains safe and is left enabled.
//
// Scoped to a single hardcoded user_id (Dan's own account, single-user project) — never touches
// any other user's rows. Deliberately does not touch engine/schema/fixture files.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabase } from './supabaseClient.js';

const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUPS_DIR = join(__dirname, '..', 'docs', 'decisions', 'backups');

function todayStamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchAll(table: string, userId: string) {
  const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
  return data ?? [];
}

async function countByUser(table: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from(table).select('user_id');
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }
  return counts;
}

async function exportArchive(): Promise<string> {
  const [answers, weights, status] = await Promise.all([
    fetchAll('user_calibration_answers', DAN_USER_ID),
    fetchAll('user_criterion_weights', DAN_USER_ID),
    fetchAll('user_calibration_status', DAN_USER_ID),
  ]);

  console.log('Row counts before archive:');
  console.log(`  user_calibration_answers: ${answers.length}`);
  console.log(`  user_criterion_weights:   ${weights.length}`);
  console.log(`  user_calibration_status:  ${status.length}`);

  mkdirSync(BACKUPS_DIR, { recursive: true });
  const filePath = join(BACKUPS_DIR, `calibration-archive-${todayStamp()}.json`);

  writeFileSync(
    filePath,
    JSON.stringify(
      {
        archivedAt: new Date().toISOString(),
        userId: DAN_USER_ID,
        user_calibration_answers: answers,
        user_criterion_weights: weights,
        user_calibration_status: status,
      },
      null,
      2
    )
  );

  console.log(`\nArchive written to: ${filePath}`);
  return filePath;
}

async function verifyOtherUsersUnchanged(
  before: Map<string, number>,
  table: string
): Promise<void> {
  const after = await countByUser(table);
  let mismatches = 0;
  const otherUserIds = new Set(
    [...before.keys(), ...after.keys()].filter((id) => id !== DAN_USER_ID)
  );
  for (const uid of otherUserIds) {
    const b = before.get(uid) ?? 0;
    const a = after.get(uid) ?? 0;
    if (b !== a) {
      mismatches++;
      console.error(`  MISMATCH for user ${uid} in ${table}: before=${b} after=${a}`);
    }
  }
  console.log(`  ${table}: ${otherUserIds.size} other user(s) checked, ${mismatches} mismatch(es)`);
}

async function resetCalibration(): Promise<void> {
  console.log('Capturing other-user row counts before reset (for verification)...');
  const beforeAnswers = await countByUser('user_calibration_answers');
  const beforeWeights = await countByUser('user_criterion_weights');
  const beforeStatus = await countByUser('user_calibration_status');

  console.log(`\nDeleting user_calibration_answers for ${DAN_USER_ID}...`);
  const { error: answersErr } = await supabase
    .from('user_calibration_answers')
    .delete()
    .eq('user_id', DAN_USER_ID);
  if (answersErr) throw new Error(`Failed to delete answers: ${answersErr.message}`);

  console.log(`Deleting user_criterion_weights for ${DAN_USER_ID}...`);
  const { error: weightsErr } = await supabase
    .from('user_criterion_weights')
    .delete()
    .eq('user_id', DAN_USER_ID);
  if (weightsErr) throw new Error(`Failed to delete weights: ${weightsErr.message}`);

  console.log(`Upserting user_calibration_status to tier='none' for ${DAN_USER_ID}...`);
  const { error: statusErr } = await supabase
    .from('user_calibration_status')
    .upsert({ user_id: DAN_USER_ID, tier: 'none', accuracy_value: 0 }, { onConflict: 'user_id' });
  if (statusErr) throw new Error(`Failed to upsert status: ${statusErr.message}`);

  console.log("\nVerifying Dan's reset state...");
  const [answersAfter, weightsAfter, statusAfter] = await Promise.all([
    fetchAll('user_calibration_answers', DAN_USER_ID),
    fetchAll('user_criterion_weights', DAN_USER_ID),
    fetchAll('user_calibration_status', DAN_USER_ID),
  ]);
  console.log(`  user_calibration_answers: ${answersAfter.length} row(s) (expect 0)`);
  console.log(`  user_criterion_weights:   ${weightsAfter.length} row(s) (expect 0)`);
  console.log(
    `  user_calibration_status:  ${JSON.stringify(statusAfter)} (expect tier='none', accuracy_value=0)`
  );

  console.log('\nVerifying other users are unchanged...');
  await verifyOtherUsersUnchanged(beforeAnswers, 'user_calibration_answers');
  await verifyOtherUsersUnchanged(beforeWeights, 'user_criterion_weights');
  await verifyOtherUsersUnchanged(beforeStatus, 'user_calibration_status');
}

async function main() {
  const mode = process.argv[2];

  if (mode === '--export-only') {
    await exportArchive();
    console.log('\nExport-only run complete. No writes were made. Awaiting go-ahead for --reset.');
    return;
  }

  if (mode === '--reset') {
    // Fail loudly rather than perform a partial reset — see this file's header for the full
    // mechanism. Throws before touching anything, so an accidental invocation is a no-op.
    throw new Error(
      '--reset is DISABLED as of 2026-08-15 and would leave a HALF-RESET status row.\n' +
        '\n' +
        "  Cause: this script's resetCalibration() upserts user_calibration_status, but\n" +
        '  supabase/user_calibration_status-add-answer-count-guard.sql made answer_count\n' +
        '  monotonic (greatest()) and `fired` sticky (OR) — an upsert CANNOT clear either.\n' +
        '  A stale answer_count/fired would survive into an apparently fresh session and\n' +
        '  corrupt the stability-window signal.\n' +
        '\n' +
        '  Use instead:  npx tsx scripts/reset-calibration-2026-08-15.ts\n' +
        '  (DELETEs the rows, which is the only way to clear the guarded fields.)\n' +
        '\n' +
        '  --export-only is unaffected and still safe to run.'
    );
  }

  console.error(
    'Usage: npx tsx scripts/archive-and-reset-calibration.ts --export-only\n' +
      '  (--reset is DISABLED — use scripts/reset-calibration-2026-08-15.ts)'
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
