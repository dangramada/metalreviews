// One-off admin script: seed a THROWAWAY account's user_calibration_answers with an
// oracle-driven answer log, so the degree-tied tier flow and the per-degree progress bar can be
// confirmed in a live browser rather than only in jsdom. Not wired into package.json or CI.
//
//   npx tsx scripts/seed-degree-tier-qa-2026-08-18.ts <user-id> <shape> <answers>
//   npx tsx scripts/seed-degree-tier-qa-2026-08-18.ts <user-id> <shape> <answers> --seed
//   npx tsx scripts/seed-degree-tier-qa-2026-08-18.ts <user-id> --cleanup
//
// `shape` is `uniform` (exhausts degree 2 at answer 30 — use ~27 answers to land just short of
// the boundary and drive the transition by hand in the browser) or `front-loaded` (one of the
// four shapes that NEVER exhausts degree 2 within 90 answers — see deferred-work.md — used to
// confirm the base-rung / no-checkpoint behaviour is what was reported, not a surprise).
//
// Same shape and the same two guards as scripts/seed-solver-crash-session.ts, which this
// follows deliberately rather than reinventing:
//   1. Refuses to run against Dan's own user id. His 71-answer log is the validated dataset.
//   2. Refuses to seed into an account that already has calibration answers.
// It writes via the service-key client (bypasses RLS), never authenticates as a user, and never
// handles credentials — the account owner signs in themselves in the browser.
//
// EXPLICIT answered_at TIMESTAMPS, not the column default: fetchPersistedAnswers orders by
// answered_at ascending, and a bulk insert can stamp every row with the same now(), leaving the
// replay order undefined — which would be a different answer log than the one simulated here.
//
// The oracle ground truths and the answering rule are copied from
// scripts/synthetic-calibration-oracles-2026-08-16.ts, so a seeded session is the same
// experiment the recon measured, not a similar one.

import { supabase } from './supabaseClient.js';
import { CalibrationSession } from '../src/lib/criteria-calibration/calibrationSession.js';
import { nextAction } from '../src/lib/criteria-calibration/elicitationDriver.js';
import type { ComparisonResult, Profile } from '../src/lib/criteria-calibration/preferenceGraph.js';

function resultToDb(result: ComparisonResult): 'a_preferred' | 'b_preferred' | 'equal' {
  if (result === 'A') return 'a_preferred';
  if (result === 'B') return 'b_preferred';
  return 'equal';
}

const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';
const TABLE = 'user_calibration_answers';
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];

const LINEAR_SHAPE = [0.25, 0.5, 0.75, 1.0];
const FRONT_LOADED_SHAPE = [0.75, 0.85, 0.93, 1.0];
const UNIFORM_MAX = [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6];
const VARIED_MAX = [0.3, 0.25, 0.2, 0.1, 0.1, 0.05];

function buildGroundTruth(criterionMax: number[], shape: number[]): number[][] {
  return criterionMax.map((max) => {
    const arr = new Array(6).fill(0);
    for (let level = 2; level <= 5; level++) arr[level] = max * shape[level - 2];
    return arr;
  });
}

const SHAPES: Record<string, number[][]> = {
  uniform: buildGroundTruth(UNIFORM_MAX, LINEAR_SHAPE),
  'front-loaded': buildGroundTruth(VARIED_MAX, FRONT_LOADED_SHAPE),
};

function scoreProfile(profile: Profile, gt: number[][]): number {
  let total = 0;
  for (const key of Object.keys(profile)) total += gt[Number(key)][profile[Number(key)]];
  return total;
}

function answerFor(a: Profile, b: Profile, gt: number[][]): ComparisonResult {
  const sa = scoreProfile(a, gt);
  const sb = scoreProfile(b, gt);
  if (Math.abs(sa - sb) < 1e-12) return 'equal';
  return sa > sb ? 'A' : 'B';
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

async function main() {
  const [, , userId, shapeOrFlag, countArg, flag] = process.argv;
  if (!userId)
    fail('Usage: seed-degree-tier-qa-2026-08-18.ts <user-id> <shape> <answers> [--seed]');
  if (userId === DAN_USER_ID)
    fail("Refusing to touch Dan's account — it holds the validated 71-answer log.");

  if (shapeOrFlag === '--cleanup') {
    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: 'exact' })
      .eq('user_id', userId);
    if (error) fail(error.message);
    console.log(`\n✓ Deleted ${count ?? 0} answer rows for ${userId}\n`);
    return;
  }

  const gt = SHAPES[shapeOrFlag];
  if (!gt) fail(`Unknown shape "${shapeOrFlag}". Known: ${Object.keys(SHAPES).join(', ')}`);
  const target = Number(countArg);
  if (!Number.isInteger(target) || target < 1) fail(`Invalid answer count "${countArg}"`);

  const { data: existing, error: existingError } = await supabase
    .from(TABLE)
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  if (existingError) fail(existingError.message);
  if ((existing ?? []).length > 0) {
    fail('That account already has calibration answers — refusing to append. Use --cleanup first.');
  }

  // Simulate first, report, and only then write. A dry run and a real run therefore produce
  // exactly the same log, and the operator sees where the session will land before anything
  // is persisted.
  const session = new CalibrationSession();
  const rows: { profile_a: Profile; profile_b: Profile; result: string }[] = [];
  let degree = 2;
  let stoppedAt = '';
  while (rows.length < target) {
    const action = nextAction(session, LEVELS_PER_CRITERION, degree);
    if (action.type === 'degree-exhausted') {
      if (!action.canEscalate) {
        stoppedAt = `terminal exhaustion at degree ${action.degree}`;
        break;
      }
      degree = action.nextDegree!;
      continue;
    }
    const result = answerFor(action.profileA, action.profileB, gt);
    session.recordAnswer(action.profileA, action.profileB, result);
    rows.push({
      profile_a: action.profileA,
      profile_b: action.profileB,
      result: resultToDb(result),
    });
  }

  const finalAction = nextAction(session, LEVELS_PER_CRITERION, degree);
  console.log(`\nShape: ${shapeOrFlag}`);
  console.log(`Answers simulated: ${rows.length}${stoppedAt ? ` (${stoppedAt})` : ''}`);
  console.log(`Current degree: ${degree}`);
  console.log(
    `Next action: ${finalAction.type}${finalAction.type === 'degree-exhausted' ? ` (${finalAction.reason}, canEscalate=${finalAction.canEscalate})` : ''}`
  );

  if (flag !== '--seed') {
    console.log('\nDry run — nothing written. Re-run with --seed to persist.\n');
    return;
  }

  const base = Date.now() - rows.length * 1000;
  const withTimestamps = rows.map((row, i) => ({
    user_id: userId,
    ...row,
    answered_at: new Date(base + i * 1000).toISOString(),
  }));
  const { error } = await supabase.from(TABLE).insert(withTimestamps);
  if (error) fail(error.message);
  console.log(`\n✓ Seeded ${withTimestamps.length} answers for ${userId}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
