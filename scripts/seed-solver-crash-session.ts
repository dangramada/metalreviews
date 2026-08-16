// One-off admin script: seed the committed SOLVER_CRASH_ANSWERS fixture into a THROWAWAY
// account's user_calibration_answers, so the solver-crash auto-recovery path can be confirmed
// in a live browser rather than only in jsdom. Not wired into package.json or CI.
//
//   npx tsx scripts/seed-solver-crash-session.ts <user-id>            (dry run — no writes)
//   npx tsx scripts/seed-solver-crash-session.ts <user-id> --seed     (writes 44 rows)
//   npx tsx scripts/seed-solver-crash-session.ts <user-id> --cleanup  (deletes what it wrote)
//
// Writes directly via the service-key client (scripts/supabaseClient.ts, bypasses RLS) — the
// same class of operation as reset-calibration-2026-08-15.ts. It never authenticates as a
// user and never handles credentials: the account owner signs in themselves in the browser.
//
// Context: docs/decisions/criteria-calibration/criteria-calibration-solver-crash-safety-net.md
// ("Known residuals" — the auto-recovery path was verified in jsdom only).
//
// TWO GUARDS, both deliberate:
//
//   1. Refuses to run against Dan's own user id. This seeds 44 synthetic answers into a real
//      account; his is reserved for the pending fresh calibration session
//      (criteria-calibration-second-session-reset.md) and must stay clean.
//   2. Refuses to seed into an account that already has calibration answers, rather than
//      appending to them — appending would produce a log that is neither the fixture nor the
//      user's own, and would not reliably reproduce the crash.
//
// EXPLICIT answered_at TIMESTAMPS, not the column default: fetchPersistedAnswers orders by
// answered_at ascending, and a bulk insert can stamp every row with the same now(), leaving
// the replay order undefined. An order-scrambled log is a DIFFERENT answer log — it would very
// likely not reproduce the crash at all, and the live check would silently prove nothing.

import { supabase } from './supabaseClient.js';
import {
  SOLVER_CRASH_ANSWERS,
  SOLVER_CRASH_LEVELS_PER_CRITERION,
} from '../src/lib/criteria-calibration/fixtures.js';
import { solveValues } from '../src/lib/criteria-calibration/solver.js';
import { resultToDb } from '../src/lib/criteria-calibration/persistence.js';

// Reserved — see guard 1 above.
const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';

const TABLE = 'user_calibration_answers';

const [, , userId, mode] = process.argv;

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!userId)
  fail('Usage: npx tsx scripts/seed-solver-crash-session.ts <user-id> [--seed|--cleanup]');
if (userId === DAN_USER_ID) {
  fail(
    "Refusing to run against Dan's own account — this seeds 44 synthetic answers, and that " +
      'account is reserved for the pending fresh calibration session. Use a throwaway account.'
  );
}

async function existingCount(): Promise<number> {
  const { count, error } = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) fail(`Failed to read ${TABLE}: ${error.message}`);
  return count ?? 0;
}

async function seed() {
  const existing = await existingCount();
  if (existing > 0) {
    fail(
      `Account already has ${existing} calibration answers. Refusing to append — the resulting ` +
        'log would be neither the fixture nor the real session, and would not reliably ' +
        'reproduce the crash. Clear them first, or use a fresh throwaway account.'
    );
  }

  // Strictly increasing, one second apart — see the answered_at note in this file's header.
  const base = Date.now() - SOLVER_CRASH_ANSWERS.length * 1000;
  const rows = SOLVER_CRASH_ANSWERS.map((a, i) => ({
    user_id: userId,
    profile_a: a.profileA,
    profile_b: a.profileB,
    result: resultToDb(a.result),
    answered_at: new Date(base + i * 1000).toISOString(),
  }));

  const { error } = await supabase.from(TABLE).insert(rows);
  if (error) fail(`Insert failed: ${error.message}`);
  console.log(`✓ Inserted ${rows.length} rows for ${userId}`);

  await verify();
}

/** Reads the log back the way the app does and confirms it still reproduces the crash. Without
 *  this, a scrambled or partial seed would only be discovered by staring at a browser and
 *  wondering why nothing happened. */
async function verify() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('profile_a, profile_b, result')
    .eq('user_id', userId)
    .order('answered_at', { ascending: true });
  if (error) fail(`Verification read failed: ${error.message}`);

  const rows = data ?? [];
  if (rows.length !== SOLVER_CRASH_ANSWERS.length) {
    fail(`Expected ${SOLVER_CRASH_ANSWERS.length} rows on read-back, got ${rows.length}`);
  }

  const orderMatches = rows.every((row, i) => {
    const expected = SOLVER_CRASH_ANSWERS[i];
    return (
      JSON.stringify(row.profile_a) === JSON.stringify(expected.profileA) &&
      JSON.stringify(row.profile_b) === JSON.stringify(expected.profileB) &&
      row.result === resultToDb(expected.result)
    );
  });
  if (!orderMatches) {
    fail('Read-back order does not match the fixture — the staged log is not the crash log.');
  }
  console.log('✓ Read-back matches the fixture exactly, in order');

  try {
    solveValues({
      levelsPerCriterion: SOLVER_CRASH_LEVELS_PER_CRITERION,
      answers: SOLVER_CRASH_ANSWERS,
    });
    fail(
      'The staged log NO LONGER CRASHES the solver. If the EPS = 1e-9 fix has landed, this ' +
        'whole live check is obsolete — see deferred-work.md item 3.'
    );
  } catch {
    console.log('✓ Staged log still breaks the solver — the live check will exercise recovery');
  }

  console.log(
    '\nNext: sign in as this account in the browser and open /criteria-calibration.\n' +
      'Expect: "Recovering your session…", then a real question at round 44, and one row gone\n' +
      `(${SOLVER_CRASH_ANSWERS.length} → ${SOLVER_CRASH_ANSWERS.length - 1}).\n`
  );
}

async function cleanup() {
  const { error } = await supabase.from(TABLE).delete().eq('user_id', userId);
  if (error) fail(`Cleanup failed: ${error.message}`);
  console.log(`✓ Deleted all ${TABLE} rows for ${userId}`);
  console.log('Note: user_calibration_status / user_criterion_weights are NOT touched here.');
}

async function dryRun() {
  const existing = await existingCount();
  console.log(`Target user:      ${userId}`);
  console.log(`Existing answers: ${existing}`);
  console.log(`Would insert:     ${SOLVER_CRASH_ANSWERS.length} rows`);
  console.log(
    existing > 0 ? '\n✗ --seed would REFUSE (account not empty)' : '\n✓ --seed would proceed'
  );
}

async function main() {
  if (mode === '--seed') await seed();
  else if (mode === '--cleanup') await cleanup();
  else await dryRun();
}

main().catch((e) => fail(String(e)));
