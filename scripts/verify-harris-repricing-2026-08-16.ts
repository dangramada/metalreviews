// READ-ONLY. Re-solves Dan's real 71-answer calibration log under the shipped Harris ratio
// test and measures how far the resulting point estimate sits from the weights currently
// stored in `user_criterion_weights` — i.e. how much this change actually re-prices real
// data, as opposed to the synthetic 154/181-prefix figure the diagnostic reported.
//
// Why this number is needed: criteria-calibration-eps-ratio-test-diagnostic.md established
// that the Chebyshev optimum is massively degenerate (mean optimal radius ~1.5e-7), so many
// points attain the identical optimum and the pivoting rule silently picks among them.
// Production's stored weights are therefore already one arbitrary pick — but "arbitrary" is
// not the same as "small", and Dan's own account is the only real data affected.
//
// SAFETY: every query below is a .select(). Nothing writes, upserts, deletes or RPCs. The
// client is scripts/supabaseClient.ts (service key, same as every other committed diagnostic
// script here) — the key bypasses RLS to READ, it does not make this script mutating.
//
// Run:  npx tsx scripts/verify-harris-repricing-2026-08-16.ts
import { supabase } from './supabaseClient.js';
import { solveValues, type SolverAnswer } from '../src/lib/criteria-calibration/solver.js';
import type { Profile } from '../src/lib/criteria-calibration/preferenceGraph.js';

const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];

interface AnswerRow {
  id: string;
  profile_a: Profile;
  profile_b: Profile;
  result: 'A' | 'B' | 'equal';
  answered_at: string;
}
interface WeightRow {
  criterion_id: number;
  level: number;
  value: number;
}

async function main() {
  const { data: answerRows, error: answersError } = await supabase
    .from('user_calibration_answers')
    .select('id, profile_a, profile_b, result, answered_at')
    .eq('user_id', DAN_USER_ID)
    .order('answered_at', { ascending: true });
  if (answersError) throw answersError;
  const answers = (answerRows ?? []) as AnswerRow[];
  console.log(`answers in live log: ${answers.length}`);

  const { data: weightRows, error: weightsError } = await supabase
    .from('user_criterion_weights')
    .select('criterion_id, level, value')
    .eq('user_id', DAN_USER_ID);
  if (weightsError) throw weightsError;
  const stored = (weightRows ?? []) as WeightRow[];
  console.log(`stored weight rows: ${stored.length}`);

  const solverAnswers: SolverAnswer[] = answers.map((r) => ({
    profileA: r.profile_a,
    profileB: r.profile_b,
    result: r.result,
  }));

  // 1. Does the full log solve cleanly under Harris?
  let solved: ReturnType<typeof solveValues>;
  try {
    solved = solveValues({ levelsPerCriterion: LEVELS_PER_CRITERION, answers: solverAnswers });
    console.log(`\nfull log (n=${solverAnswers.length}): SOLVES CLEANLY`);
    console.log(`  totalSlack = ${solved.totalSlack.toFixed(9)}`);
  } catch (e) {
    console.log(`\nfull log (n=${solverAnswers.length}): THROWS — ${(e as Error).message}`);
    return;
  }

  // 2. Every prefix, so a mid-session breakdown can't hide behind a clean final solve.
  let prefixFailures = 0;
  for (let n = 1; n <= solverAnswers.length; n++) {
    try {
      solveValues({
        levelsPerCriterion: LEVELS_PER_CRITERION,
        answers: solverAnswers.slice(0, n),
      });
    } catch (e) {
      prefixFailures++;
      console.log(`  prefix n=${n} THROWS — ${(e as Error).message.slice(0, 120)}`);
    }
  }
  console.log(`  all ${solverAnswers.length} prefixes: ${prefixFailures} failures`);

  // 3. Repricing magnitude vs. what is stored right now.
  const storedByKey = new Map(stored.map((r) => [`${r.criterion_id}:${r.level}`, r.value]));
  let maxAbsDelta = 0;
  let maxKey = '';
  const deltas: number[] = [];
  const lines: string[] = [];
  for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
    for (let level = 1; level <= LEVELS_PER_CRITERION[c]; level++) {
      const key = `${c}:${level}`;
      const before = storedByKey.get(key);
      if (before === undefined) {
        lines.push(`  ${key}: (no stored row)`);
        continue;
      }
      const after = solved.values[c][level].point;
      const delta = after - before;
      deltas.push(Math.abs(delta));
      if (Math.abs(delta) > maxAbsDelta) {
        maxAbsDelta = Math.abs(delta);
        maxKey = key;
      }
      lines.push(
        `  c${c} L${level}: stored=${before.toFixed(6)}  harris=${after.toFixed(6)}  delta=${delta >= 0 ? '+' : ''}${delta.toFixed(6)}`
      );
    }
  }
  deltas.sort((a, b) => a - b);
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : NaN;
  const mean = deltas.length ? deltas.reduce((s, v) => s + v, 0) / deltas.length : NaN;

  console.log('\nper-variable movement (stored -> Harris):');
  for (const l of lines) console.log(l);
  console.log(
    `\nrepricing magnitude over ${deltas.length} variables: max=${maxAbsDelta.toFixed(6)} (${maxKey})  median=${median.toFixed(6)}  mean=${mean.toFixed(6)}`
  );

  // The normalization sum is the one thing that must NOT move — it is a property of the
  // model, not of which tied point the solver reports.
  const normSum = solved.values.reduce(
    (sum, vals, c) => sum + vals[LEVELS_PER_CRITERION[c]].point,
    0
  );
  const storedNormSum = LEVELS_PER_CRITERION.reduce(
    (sum, top, c) => sum + (storedByKey.get(`${c}:${top}`) ?? 0),
    0
  );
  console.log(
    `normalization sum: stored=${storedNormSum.toFixed(9)}  harris=${normSum.toFixed(9)}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
