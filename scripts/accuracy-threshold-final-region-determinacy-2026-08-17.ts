// Is the "final" ranking of a real session actually DETERMINED by the user's answers, or is
// it one arbitrarily tie-broken point among many equally valid ones? — read-only diagnostic
// (2026-08-17), companion to accuracy-threshold-recalibration-2026-08-17.ts.
//
// WHY THIS EXISTS. The recalibration analysis grades each round against the session's own
// final ranking ("top-10-changed-from-final"). That reference is derived by scoring profiles
// with the solved `.point` vector — the exact quantity `criteria-calibration-escalation-signal-candidates.md`
// §4 showed jitters under tie-break degeneracy (deferred-work.md item 5: the reported weights
// are one arbitrary pick among tied optima). If the final top-10 is not uniquely determined by
// the answer log, then "distance from final" is partly measuring the pivot rule, and any
// threshold fitted against it inherits that noise.
//
// THE TEST. `.point` jitter is a property of which optimal vertex the simplex reports. The
// FEASIBLE REGION is not — it is a property of the answers alone. So instead of asking "did
// the reported ranking move", ask the tie-break-independent question directly: at the final
// answer count, for each profile outside the reported top-10, could it still outrank the
// reported 10th place ANYWHERE in the feasible region? Concretely, maximise
// `score(challenger) - score(10th)` over the final LP region. If that max is > 0, the
// challenger's exclusion from the top-10 is not implied by the user's answers — the pivot rule
// chose it.
//
// Uses the same LP construction production uses (`buildValueLP`, solver.ts), not a
// reimplementation. No writes; A70 is replayed from the committed backup, B71 read-only from
// the live table.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { supabase } from './supabaseClient.js';
import { profileKey, type Profile } from '../src/lib/criteria-calibration/preferenceGraph.js';
import {
  buildValueLP,
  profileCoeffs,
  solveValues,
  type SolverAnswer,
} from '../src/lib/criteria-calibration/solver.js';
import { prepareLP, solveFromPrepared } from '../src/lib/criteria-calibration/simplex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];
const NUM_CRITERIA = 6;

// Same eval pool as the recalibration script — same seed, same construction, so the two
// diagnostics grade the same 200 profiles.
const EVAL_POOL_SIZE = 200;
const EVAL_POOL_SEED = 20260817;

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildEvalPool(): Profile[] {
  const rng = createRng(EVAL_POOL_SEED);
  const pool: Profile[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (pool.length < EVAL_POOL_SIZE && attempts < EVAL_POOL_SIZE * 100) {
    attempts++;
    const profile: Record<number, number> = {};
    for (let c = 0; c < NUM_CRITERIA; c++) {
      profile[c] = 1 + Math.floor(rng() * LEVELS_PER_CRITERION[c]);
    }
    const key = profileKey(profile);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(profile);
  }
  return pool;
}

type RawResult = 'a_preferred' | 'b_preferred' | 'equal';
function toComparisonResult(r: RawResult): 'A' | 'B' | 'equal' {
  if (r === 'a_preferred') return 'A';
  if (r === 'b_preferred') return 'B';
  return 'equal';
}

interface AnswerRow {
  profile_a: Profile;
  profile_b: Profile;
  result: RawResult;
}

function loadA70(): SolverAnswer[] {
  const file = path.resolve(
    __dirname,
    '../docs/decisions/backups/pre-reset-dan-account-2026-08-15.json'
  );
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    user_calibration_answers: (AnswerRow & { answered_at: string })[];
  };
  return [...parsed.user_calibration_answers]
    .sort((a, b) => a.answered_at.localeCompare(b.answered_at))
    .map((r) => ({
      profileA: r.profile_a,
      profileB: r.profile_b,
      result: toComparisonResult(r.result),
    }));
}

async function loadB71(): Promise<SolverAnswer[]> {
  const { data, error } = await supabase
    .from('user_calibration_answers')
    .select('profile_a, profile_b, result, answered_at')
    .eq('user_id', DAN_USER_ID)
    .order('answered_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as (AnswerRow & { answered_at: string })[]).map((r) => ({
    profileA: r.profile_a,
    profileB: r.profile_b,
    result: toComparisonResult(r.result),
  }));
}

function analyse(label: string, answers: SolverAnswer[], pool: Profile[]) {
  console.log(`\n=== ${label} (${answers.length} answers) ===`);

  const input = { levelsPerCriterion: LEVELS_PER_CRITERION, answers };
  const solved = solveValues(input);

  // Reported ranking, from the arbitrarily-chosen optimal vertex.
  const reportedScore = pool.map((p) => {
    let total = 0;
    for (const key of Object.keys(p)) total += solved.values[Number(key)][p[Number(key)]].point;
    return total;
  });
  const order = pool.map((_, i) => i).sort((a, b) => reportedScore[b] - reportedScore[a] || a - b);
  const top10 = order.slice(0, 10);
  const tenth = order[9];

  // Feasible region — built once, exactly as production does, then reused per objective.
  const lp = buildValueLP(input);
  const prep = prepareLP(lp.totalVars, lp.constraintsWithSlackCap);

  /** max of score(a) - score(b) over the feasible region. */
  function maxDiff(a: Profile, b: Profile): number {
    const ca = profileCoeffs(a, lp.varIndex, lp.totalVars);
    const cb = profileCoeffs(b, lp.varIndex, lp.totalVars);
    const diff = ca.map((v, i) => v - cb[i]);
    const res = solveFromPrepared(
      prep,
      diff.map((v) => -v)
    );
    if (!res.feasible) return Number.POSITIVE_INFINITY;
    return -res.objectiveValue;
  }

  // How many profiles OUTSIDE the reported top-10 could still beat the reported 10th place
  // somewhere in the feasible region? Each one is a top-10 slot the answers do not decide.
  const contenders: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (top10.includes(i)) continue;
    if (maxDiff(pool[i], pool[tenth]) > 1e-7) contenders.push(i);
  }

  // And within the reported top-10: how many adjacent pairs have an undetermined order?
  let undeterminedAdjacent = 0;
  for (let k = 0; k < 9; k++) {
    const hi = pool[top10[k]];
    const lo = pool[top10[k + 1]];
    // Order is determined only if the lower-ranked one can never beat the higher-ranked one.
    if (maxDiff(lo, hi) > 1e-7) undeterminedAdjacent++;
  }

  console.log(`  reported top-10 (pool indices): ${top10.join(', ')}`);
  console.log(
    `  profiles outside the reported top-10 that could still beat its 10th place: ${contenders.length} / ${
      pool.length - 10
    }`
  );
  console.log(
    `  adjacent pairs INSIDE the reported top-10 whose order is undetermined: ${undeterminedAdjacent} / 9`
  );
  console.log(
    `  --> the final top-10 is ${
      contenders.length === 0 && undeterminedAdjacent === 0
        ? 'UNIQUELY DETERMINED by the answers'
        : 'NOT uniquely determined — the pivot rule picked among feasible alternatives'
    }`
  );
  return { label, answers: answers.length, contenders: contenders.length, undeterminedAdjacent };
}

async function main() {
  const pool = buildEvalPool();
  console.log(`Eval pool: ${pool.length} complete profiles, seed ${EVAL_POOL_SEED}`);

  const results = [analyse('A70 (committed backup)', loadA70(), pool)];
  try {
    results.push(analyse('B71 (live, read-only)', await loadB71(), pool));
  } catch (err) {
    console.log(`\n!! B71 unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

  fs.writeFileSync(
    path.resolve(
      __dirname,
      '../docs/decisions/criteria-calibration/accuracy-threshold-final-region-determinacy-2026-08-17.json'
    ),
    JSON.stringify(results, null, 2) + '\n'
  );
  console.log('\n=== DONE ===');
}

main();
