// Synthetic calibration oracles — read-only diagnostic (2026-08-16).
//
// Follows the two-phase-simplex-rewrite.md / dominance-filter.md precedent: oracle-driven
// diagnostics with KNOWN ground truth, so solver output can be checked against a known
// correct answer, not just internal consistency. Ten synthetic 6-criterion oracles each
// drive the REAL adaptive elicitation flow (nextAction() from elicitationDriver.ts, exactly
// as CriteriaCalibrationPage.tsx does) — answers are generated live, in response to whatever
// candidate pair the driver actually offers, from a fixed known ground-truth weight/level
// vector, NOT a pre-scripted answer sequence. No production files are imported for anything
// other than read-only calls; nothing here writes to Supabase or touches application state.
//
// Output: docs/decisions/criteria-calibration/synthetic-oracle-trajectories-2026-08-16.csv
// (one row per real answer, all 10 oracles) plus a findings summary printed to stdout, which
// backs docs/decisions/criteria-calibration/criteria-calibration-synthetic-oracles.md.
//
// AMENDED 2026-08-17: the retired auto-escalation signal's columns were stripped when that
// signal was deleted (see criteria-calibration-tiered-checkpoints.md) — the `fired` CSV
// column, the fired-transition/post-fired-plateau stdout sections, and the synthetic
// 13-album "RANKING_TEST_SET" that existed only to feed the top-10 comparison. Everything
// else is unchanged, so re-running this reproduces the committed CSV's surviving columns
// exactly. NOTE the committed CSV still has its original header including `fired`; it is the
// 2026-08-16 record and was deliberately not regenerated. The tier-crossing report retained
// below is now the directly relevant output, since accuracy tiers are what gate the
// replacement flow's checkpoints.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CalibrationSession } from '../src/lib/criteria-calibration/calibrationSession.js';
import {
  nextAction,
  type DriverAction,
} from '../src/lib/criteria-calibration/elicitationDriver.js';
import {
  solveValues,
  type SolverAnswer,
  type ValueSolverResult,
} from '../src/lib/criteria-calibration/solver.js';
import { computeCommitState } from '../src/lib/criteria-calibration/commitComputation.js';
import {
  solverAccuracyTier,
  SCORE_SPREAD_HIGH_THRESHOLD,
  SCORE_SPREAD_VERY_HIGH_THRESHOLD,
} from '../src/lib/criteria-calibration/accuracyTiers.js';
import type { CriteriaCatalog } from '../src/lib/criteria-calibration/criteriaCatalog.js';
import type { ComparisonResult, Profile } from '../src/lib/criteria-calibration/preferenceGraph.js';
import {
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
} from '../src/lib/criteria-calibration/fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NUM_CRITERIA = 6;
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];
const STARTING_DEGREE = 2;
// Compute-informed cap, not a product-behavior assumption: computeCommitState's cost grows
// steeply with n (documented O(n^2)-ish in scoreSpreadAccuracy.ts's header, confirmed live
// here — commit cost went from ~5ms at n=1 to ~3s at n=73 during a timing pilot run), and
// nextAction() independently re-solves the same answer log once per question (documented,
// unfixed duplicate-solve — see deferred-work.md's "nextAction and computeCommitState each
// run their own solveValues" entry). 90 real answers keeps total 10-oracle wall time in the
// few-tens-of-minutes range; it is NOT expected to be enough for every oracle to reach true
// degree/coverage exhaustion (degree can go up to 6) — this is itself a reportable finding,
// not just a technical limitation, since Dan's own real sessions (33/70/71 answers) never
// reached full exhaustion either.
const MAX_ROUNDS = process.env.ORACLE_MAX_ROUNDS ? Number(process.env.ORACLE_MAX_ROUNDS) : 90;
const MAX_WALL_MS = 180_000; // per-oracle wall-clock safety cap (3 min)
const ORACLE_FILTER = process.env.ORACLE_ONLY
  ? process.env.ORACLE_ONLY.split(',').map(Number)
  : null;

const catalog: CriteriaCatalog = { entries: [], levelsPerCriterion: LEVELS_PER_CRITERION };

// ---------------------------------------------------------------------------------------
// Deterministic RNG (same LCG shape used throughout src/lib/criteria-calibration/*.ts)
// ---------------------------------------------------------------------------------------
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------
// Ground truth: values[c][level], level 1..5 (level 1 always 0), best-level values sum to 1.
// ---------------------------------------------------------------------------------------
type GroundTruth = number[][]; // [criterion][level], index 0 unused

const LINEAR_SHAPE = [0.25, 0.5, 0.75, 1.0]; // fraction of criterion max at levels 2,3,4,5
const FRONT_LOADED_SHAPE = [0.75, 0.85, 0.93, 1.0]; // big 1->2 jump, flat 2-5
const BACK_LOADED_SHAPE = [0.07, 0.15, 0.25, 1.0]; // flat 2-4, big jump 4->5

function buildGroundTruth(criterionMax: number[], shape: number[]): GroundTruth {
  return criterionMax.map((max) => {
    const arr = new Array(6).fill(0);
    for (let level = 2; level <= 5; level++) arr[level] = max * shape[level - 2];
    return arr;
  });
}

function groundTruthFromSolved(solved: ValueSolverResult): GroundTruth {
  return solved.values.map((perLevel) => perLevel.map((v) => (v ? v.point : 0)));
}

const UNIFORM_MAX = [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6];
const DOMINANT_MAX = [0.7, 0.06, 0.06, 0.06, 0.06, 0.06];
const ZERO_CRIT5_MAX = [0.2, 0.2, 0.2, 0.2, 0.2, 0.0];
const VARIED_MAX = [0.3, 0.25, 0.2, 0.1, 0.1, 0.05];
const NEAR_TIED_MAX = [0.2, 0.19, 0.18, 0.17, 0.15, 0.11];

// Oracle #10's ground truth is derived below, once, from the real production session.
const realSessionSolved = solveValues({
  levelsPerCriterion: REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
  answers: REAL_PRODUCTION_SESSION_ANSWERS,
});

interface OracleSpec {
  id: number;
  name: string;
  gt: GroundTruth;
  noiseRate?: number;
  capDegreeAt2?: boolean;
}

const ORACLES: OracleSpec[] = [
  { id: 1, name: 'uniform', gt: buildGroundTruth(UNIFORM_MAX, LINEAR_SHAPE) },
  { id: 2, name: 'single-dominant', gt: buildGroundTruth(DOMINANT_MAX, LINEAR_SHAPE) },
  { id: 3, name: 'zero-weight-criterion', gt: buildGroundTruth(ZERO_CRIT5_MAX, LINEAR_SHAPE) },
  { id: 4, name: 'linear-control', gt: buildGroundTruth(VARIED_MAX, LINEAR_SHAPE) },
  { id: 5, name: 'front-loaded', gt: buildGroundTruth(VARIED_MAX, FRONT_LOADED_SHAPE) },
  { id: 6, name: 'back-loaded', gt: buildGroundTruth(VARIED_MAX, BACK_LOADED_SHAPE) },
  { id: 7, name: 'near-tied', gt: buildGroundTruth(NEAR_TIED_MAX, LINEAR_SHAPE) },
  { id: 8, name: 'noisy', gt: buildGroundTruth(UNIFORM_MAX, LINEAR_SHAPE), noiseRate: 0.12 },
  {
    id: 9,
    name: 'short-session-degree2-cap',
    gt: buildGroundTruth(UNIFORM_MAX, LINEAR_SHAPE),
    capDegreeAt2: true,
  },
  { id: 10, name: 'dan-approximation', gt: groundTruthFromSolved(realSessionSolved) },
];

// ---------------------------------------------------------------------------------------
// Oracle answering
// ---------------------------------------------------------------------------------------
function scoreProfileGT(profile: Profile, gt: GroundTruth): number {
  let total = 0;
  for (const key of Object.keys(profile)) {
    const c = Number(key);
    const level = profile[c];
    total += gt[c][level];
  }
  return total;
}

function trueAnswer(profileA: Profile, profileB: Profile, gt: GroundTruth): ComparisonResult {
  const a = scoreProfileGT(profileA, gt);
  const b = scoreProfileGT(profileB, gt);
  if (Math.abs(a - b) < 1e-12) return 'equal';
  return a > b ? 'A' : 'B';
}

function toSolverAnswers(session: CalibrationSession): SolverAnswer[] {
  return session.fullLog.map((e) => ({
    profileA: e.profileA,
    profileB: e.profileB,
    result: e.result,
  }));
}

// ---------------------------------------------------------------------------------------
// Per-round record + per-oracle driver loop
// ---------------------------------------------------------------------------------------
interface RoundRecord {
  oracleId: number;
  oracleName: string;
  round: number; // real-answer index (1-based), matches production's answers.length
  degree: number;
  progressPct: number;
  accuracy: number;
  tier: string;
  avgCoverageWidth: number;
  maxCoverageWidth: number;
  totalSlack: number;
  noisyFlip: boolean;
}

interface OracleRunResult {
  spec: OracleSpec;
  rows: RoundRecord[];
  finalSolved: ValueSolverResult;
  stopReason: string;
  totalRounds: number;
  wallMs: number;
  degreesVisited: number[];
  solverCrash?: string;
}

function runOracle(spec: OracleSpec): OracleRunResult {
  const start = Date.now();
  const session = new CalibrationSession();
  let degree = STARTING_DEGREE;
  const rows: RoundRecord[] = [];
  const degreesVisited = new Set<number>();
  let round = 0;
  let stopReason = 'unknown';
  let finalSolved: ValueSolverResult = solveValues({
    levelsPerCriterion: LEVELS_PER_CRITERION,
    answers: [],
  });
  const noiseRng = spec.noiseRate ? createRng(9000 + spec.id) : undefined;
  let solverCrash: string | undefined;

  try {
    while (round < MAX_ROUNDS) {
      if (Date.now() - start > MAX_WALL_MS) {
        stopReason = 'wall-clock-cap-hit';
        break;
      }
      const roundLoopStart = Date.now();
      const action: DriverAction = nextAction(session, LEVELS_PER_CRITERION, degree);
      if (process.env.ORACLE_DEBUG) {
        process.stderr.write(
          `  nextAction took ${Date.now() - roundLoopStart}ms (round=${round}, degree=${degree}, type=${action.type})\n`
        );
      }

      if (action.type === 'ask') {
        degreesVisited.add(action.degree);
        let result = trueAnswer(action.profileA, action.profileB, spec.gt);
        let noisyFlip = false;
        if (spec.noiseRate && noiseRng!() < spec.noiseRate) {
          const choices: ComparisonResult[] = ['A', 'B', 'equal'];
          result = choices[Math.floor(noiseRng!() * 3)];
          noisyFlip = true;
        }
        session.recordAnswer(action.profileA, action.profileB, result);
        round++;

        const tRoundStart = Date.now();
        const answers = toSolverAnswers(session);
        const commit = computeCommitState(catalog, answers);
        if (process.env.ORACLE_DEBUG) {
          process.stderr.write(
            `    round ${round} commit took ${Date.now() - tRoundStart}ms (nextAction+answer took ${tRoundStart - roundLoopStart}ms)\n`
          );
        }
        finalSolved = commit.solved;

        const widths: number[] = [];
        for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
          for (let lvl = 2; lvl <= LEVELS_PER_CRITERION[c]; lvl++) {
            const v = commit.solved.values[c][lvl];
            widths.push(v.max - v.min);
          }
        }
        const avgWidth = widths.reduce((s, w) => s + w, 0) / widths.length;
        const maxWidth = Math.max(...widths);

        rows.push({
          oracleId: spec.id,
          oracleName: spec.name,
          round,
          degree: action.degree,
          progressPct: Math.round(commit.accuracy * 100),
          accuracy: commit.accuracy,
          tier: solverAccuracyTier(commit.accuracy),
          avgCoverageWidth: avgWidth,
          maxCoverageWidth: maxWidth,
          totalSlack: commit.solved.totalSlack,
          noisyFlip,
        });
      } else {
        // degree-exhausted
        if (spec.capDegreeAt2 && action.degree === 2) {
          stopReason = `degree2-cap:${action.reason}`;
          break;
        }
        if (action.canEscalate) {
          degree = action.nextDegree!;
          continue;
        }
        stopReason = `natural-exhaustion:${action.reason}`;
        break;
      }
    }
  } catch (err) {
    solverCrash = err instanceof Error ? err.message : String(err);
    stopReason = 'solver-crash';
    process.stderr.write(
      `  [oracle ${spec.id} ${spec.name}] SOLVER CRASH at round ${round}: ${solverCrash}\n`
    );
  }
  if (stopReason === 'unknown') stopReason = 'round-cap-hit';

  return {
    spec,
    rows,
    finalSolved,
    stopReason,
    totalRounds: round,
    wallMs: Date.now() - start,
    degreesVisited: Array.from(degreesVisited).sort((a, b) => a - b),
    solverCrash,
  };
}

// ---------------------------------------------------------------------------------------
// Run all 10 oracles
// ---------------------------------------------------------------------------------------
function main() {
  const results: OracleRunResult[] = [];
  const oraclesToRun = ORACLE_FILTER
    ? ORACLES.filter((o) => ORACLE_FILTER.includes(o.id))
    : ORACLES;
  for (const spec of oraclesToRun) {
    process.stderr.write(`[oracle ${spec.id} ${spec.name}] starting...\n`);
    const result = runOracle(spec);
    results.push(result);
    process.stderr.write(
      `[oracle ${spec.id} ${spec.name}] done: rounds=${result.totalRounds} stop=${result.stopReason} wallMs=${result.wallMs} degrees=${result.degreesVisited.join(',')}\n`
    );
  }

  // -------------------------------------------------------------------------------------
  // CSV output
  // -------------------------------------------------------------------------------------
  const csvLines: string[] = [
    'oracle_id,oracle_name,round,degree,progress_pct,accuracy,tier,avg_coverage_width,max_coverage_width,total_slack,noisy_flip',
  ];
  for (const r of results) {
    for (const row of r.rows) {
      csvLines.push(
        [
          row.oracleId,
          row.oracleName,
          row.round,
          row.degree,
          row.progressPct,
          row.accuracy.toFixed(6),
          row.tier,
          row.avgCoverageWidth.toFixed(6),
          row.maxCoverageWidth.toFixed(6),
          row.totalSlack.toFixed(6),
          row.noisyFlip,
        ].join(',')
      );
    }
  }
  const csvPath = path.resolve(
    __dirname,
    '../docs/decisions/criteria-calibration/synthetic-oracle-trajectories-2026-08-16.csv'
  );
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n');
  process.stderr.write(`\nCSV written: ${csvPath} (${csvLines.length - 1} rows)\n`);

  // -------------------------------------------------------------------------------------
  // Findings summary (printed to stdout — captured for the decision doc)
  // -------------------------------------------------------------------------------------
  console.log('\n=== SUMMARY ===\n');

  for (const r of results) {
    console.log(`--- Oracle #${r.spec.id} ${r.spec.name} ---`);
    console.log(`  stopReason=${r.stopReason} totalRounds=${r.totalRounds} wallMs=${r.wallMs}`);
    if (r.solverCrash) console.log(`  SOLVER_CRASH: ${r.solverCrash}`);
    console.log(`  degreesVisited=${r.degreesVisited.join(',')}`);

    // Ground-truth recovery
    let maxAbsErr = 0;
    let sumSqErr = 0;
    let n = 0;
    const perCriterionWeightErr: number[] = [];
    for (let c = 0; c < NUM_CRITERIA; c++) {
      let critMax = 0;
      for (let level = 2; level <= LEVELS_PER_CRITERION[c]; level++) {
        const solvedV = r.finalSolved.values[c][level]?.point ?? 0;
        const gtV = r.spec.gt[c][level];
        const err = Math.abs(solvedV - gtV);
        maxAbsErr = Math.max(maxAbsErr, err);
        sumSqErr += err * err;
        n++;
        if (level === 5) critMax = err;
      }
      perCriterionWeightErr.push(critMax);
    }
    const rmse = Math.sqrt(sumSqErr / n);
    console.log(`  groundTruthRecovery: maxAbsErr=${maxAbsErr.toFixed(5)} rmse=${rmse.toFixed(5)}`);
    console.log(
      `  perCriterionBestLevelErr=[${perCriterionWeightErr.map((e) => e.toFixed(4)).join(', ')}]`
    );
    console.log(
      `  solvedBestLevelValues=[${r.finalSolved.values.map((v) => v[v.length - 1]?.point.toFixed(4)).join(', ')}]`
    );
    console.log(`  gtBestLevelValues=[${r.spec.gt.map((v) => v[5].toFixed(4)).join(', ')}]`);

    // Oracle #3-specific: criterion 5 (zero weight) shape
    if (r.spec.id === 3) {
      console.log(
        `  criterion5FullShape (solved)=[${r.finalSolved.values[5]
          .slice(1)
          .map((v) => v.point.toFixed(5))
          .join(', ')}]`
      );
      console.log(
        `  criterion5FullShape (min/max)=[${r.finalSolved.values[5]
          .slice(1)
          .map((v) => `${v.min.toFixed(4)}-${v.max.toFixed(4)}`)
          .join(', ')}]`
      );
    }

    // Oracle #4/5/6: full shape of criterion 0 for plateau comparison
    if ([4, 5, 6].includes(r.spec.id)) {
      console.log(
        `  criterion0FullShape (solved)=[${r.finalSolved.values[0]
          .slice(1)
          .map((v) => v.point.toFixed(5))
          .join(', ')}]`
      );
      console.log(
        `  criterion0FullShape (gt)=[${r.spec.gt[0]
          .slice(1)
          .map((v) => v.toFixed(5))
          .join(', ')}]`
      );
    }

    // Tier-crossing rounds
    const firstHigh = r.rows.find((row) => row.accuracy >= SCORE_SPREAD_HIGH_THRESHOLD);
    const firstVeryHigh = r.rows.find((row) => row.accuracy >= SCORE_SPREAD_VERY_HIGH_THRESHOLD);
    console.log(
      `  tierCrossing: high@round=${firstHigh?.round ?? 'never'} veryHigh@round=${firstVeryHigh?.round ?? 'never'}`
    );

    // Monotonicity check
    const violations: { round: number; prev: number; next: number }[] = [];
    for (let i = 1; i < r.rows.length; i++) {
      const prev = r.rows[i - 1].accuracy;
      const next = r.rows[i].accuracy;
      if (next < prev - 1e-9) {
        violations.push({ round: r.rows[i].round, prev, next });
      }
    }
    console.log(`  monotonicityViolations=${violations.length}`);
    if (violations.length > 0) {
      console.log(
        `    examples: ${violations
          .slice(0, 5)
          .map((v) => `round${v.round}: ${v.prev.toFixed(4)}->${v.next.toFixed(4)}`)
          .join(' | ')}`
      );
    }

    // Progress% jump check (degree-2-only oracle #9, but computed for all for comparison)
    let maxProgressJump = 0;
    let maxProgressJumpRound = 0;
    for (let i = 1; i < r.rows.length; i++) {
      const jump = Math.abs(r.rows[i].progressPct - r.rows[i - 1].progressPct);
      if (jump > maxProgressJump) {
        maxProgressJump = jump;
        maxProgressJumpRound = r.rows[i].round;
      }
    }
    console.log(`  maxProgressPctJump=${maxProgressJump} at round=${maxProgressJumpRound}`);

    console.log('');
  }

  console.log('=== DONE ===');
}

main();
