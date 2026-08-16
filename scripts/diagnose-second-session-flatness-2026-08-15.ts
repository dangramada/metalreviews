// Read-only diagnostic: does the levels-2-5 point-estimate flatness found on the first real
// session (2026-08-09, REAL_PRODUCTION_SESSION_ANSWERS / 33 answers) reproduce on the second,
// independent real session (Dan's account, 71 answers, 2026-08-15, post-reset)?
//
// Per docs/decisions/criteria-calibration/criteria-calibration-coverage-weighted-candidates.md's original trace,
// fetches the live user_calibration_answers log (now holding the second session, since the
// first was deleted by the 2026-08-15 reset — see
// docs/decisions/criteria-calibration/criteria-calibration-second-session-reset.md)
// and replays solveValues at checkpoints every ~10 answers plus the final state, reporting
// solved.values[criterion][level].point at each checkpoint.
//
// No writes. No production code touched or modified — only imported as-is.

import { supabase } from './supabaseClient.js';
import { profileKey, type Profile } from '../src/lib/criteria-calibration/preferenceGraph.js';
import { solveValues, type SolverAnswer } from '../src/lib/criteria-calibration/solver.js';

const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];

interface AnswerRow {
  id: string;
  profile_a: Profile;
  profile_b: Profile;
  result: 'a_preferred' | 'b_preferred' | 'equal';
  answered_at: string;
}

function toComparisonResult(r: AnswerRow['result']): 'A' | 'B' | 'equal' {
  if (r === 'a_preferred') return 'A';
  if (r === 'b_preferred') return 'B';
  return 'equal';
}

function fmt(v: number): string {
  return v.toFixed(4);
}

async function main() {
  const { data: rows, error } = await supabase
    .from('user_calibration_answers')
    .select('id, profile_a, profile_b, result, answered_at')
    .eq('user_id', DAN_USER_ID)
    .order('answered_at', { ascending: true });
  if (error) throw new Error(error.message);
  const answers = (rows ?? []) as AnswerRow[];
  console.log(`Fetched ${answers.length} answers (chronological by answered_at).`);
  console.log(
    `(sanity: profileKey unused directly here, imported to confirm module resolves — ${profileKey({}) ? '' : 'ok'})`
  );

  const checkpoints: number[] = [10, 20, 28, 29, 40, 49, 50, 60, 70, 71];

  const solverAnswersFull: SolverAnswer[] = [];

  for (const checkpointN of checkpoints) {
    solverAnswersFull.length = 0;
    for (let i = 0; i < checkpointN; i++) {
      const row = answers[i];
      solverAnswersFull.push({
        profileA: row.profile_a,
        profileB: row.profile_b,
        result: toComparisonResult(row.result),
      });
    }

    const solved = solveValues({
      levelsPerCriterion: LEVELS_PER_CRITERION,
      answers: solverAnswersFull,
    });

    console.log(`\n=== Checkpoint n=${checkpointN} (totalSlack=${solved.totalSlack.toFixed(6)}) ===`);
    for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
      const levels = solved.values[c];
      const pts = [];
      for (let lvl = 1; lvl <= LEVELS_PER_CRITERION[c]; lvl++) {
        pts.push(fmt(levels[lvl].point));
      }
      console.log(`  criterion ${c}: [${pts.join(', ')}]`);
    }
  }

  // --- Criterion-5-style zero-weight check at final state ---
  const finalSolved = solveValues({
    levelsPerCriterion: LEVELS_PER_CRITERION,
    answers: solverAnswersFull,
  });
  console.log('\n=== Zero-weight check (final state) ===');
  for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
    const levels = finalSolved.values[c];
    const maxPoint = Math.max(
      ...Array.from({ length: LEVELS_PER_CRITERION[c] }, (_, i) => levels[i + 1].point)
    );
    const flag = maxPoint < 0.001 ? '  <-- ZERO-WEIGHT CRITERION' : '';
    console.log(`  criterion ${c}: max point across all levels = ${fmt(maxPoint)}${flag}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
