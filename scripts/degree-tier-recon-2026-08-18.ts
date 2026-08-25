// Degree-tied accuracy tiers + per-degree progress bar — read-only recon (2026-08-18).
//
// QUESTION 1 (brief step 1a): if the user-facing accuracy TIER is assigned by which degree of
// trade-off has been exhausted (1000minds' own documented model — "Medium: at least all
// 2-attribute trade-offs answered", see criteria-calibration-1000minds-comparative-research.md)
// rather than by crossing a fixed score-spread-accuracy threshold, does real ranking quality
// separate cleanly at degree boundaries? The threshold-based assignment was shown not to
// generalize (criteria-calibration-accuracy-threshold-recalibration.md: six quality bars, six
// empty threshold windows).
//
// QUESTION 2 (brief step 1c): how does the proposed progress bar
// `(degree - 2) * 20 + (coverageCount / 24) * 20` actually behave over a real session — where
// does it stall, where does it dip, how uneven is the pacing across degrees?
//
// METHOD: re-simulate rather than post-process. The committed trajectory CSVs
// (escalation-signal-oracle-trajectories-postharris-2026-08-16.csv and its real-session
// sibling, both on the still-unmerged criteria-calibration-accuracy-threshold-recalibration
// branch) carry per-round solved point vectors but NOT the per-round feasible-range widths
// per variable, and the per-degree coverage COUNT that the progress bar needs cannot be
// recovered from a point vector. So the ten oracles are replayed against the real driver,
// exactly as scripts/synthetic-calibration-oracles-2026-08-16.ts does, with the oracle specs
// and answering rule copied verbatim from it (cited at each site below) so the replay is the
// same experiment, not a similar one.
//
// COST CONTROL: the committed generator calls computeCommitState (score-spread accuracy, ~100
// LP solves) EVERY round, which is what makes it a tens-of-minutes run. Ranking quality here
// only needs the solved point vector (one solve per round, which the coverage counts need
// anyway), and score-spread accuracy is only needed AT degree-exhaustion boundaries — which is
// what the tier assignment under test keys on. So accuracy is computed at boundaries and at
// each trace's final round only.
//
// REPRODUCTION CHECK: set RECON_COMPARE_CSV to a copy of
// accuracy-threshold-recalibration-2026-08-17.csv and the script asserts its own per-round
// `degree` column, and its boundary accuracy values, match that committed record. A divergence
// means this replay is not the same experiment and every number below is suspect.
//
// No writes to Supabase. No production module modified — all imported read-only. A70 is
// replayed from the committed backup; B71 needs the live DB and is included only when
// RECON_INCLUDE_B71=1 and service-key env vars are present (read-only select).

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
import { computeScoreSpreadAccuracy } from '../src/lib/criteria-calibration/scoreSpreadAccuracy.js';
import {
  profileKey,
  profileDegree,
  type ComparisonResult,
  type Profile,
} from '../src/lib/criteria-calibration/preferenceGraph.js';
import {
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
} from '../src/lib/criteria-calibration/fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '../docs/decisions/criteria-calibration');

const NUM_CRITERIA = 6;
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];
const STARTING_DEGREE = 2;
const MAX_ROUNDS = process.env.RECON_MAX_ROUNDS ? Number(process.env.RECON_MAX_ROUNDS) : 90;
const ORACLE_FILTER = process.env.RECON_ONLY ? process.env.RECON_ONLY.split(',').map(Number) : null;

// ADDED 2026-08-25 (criteria-calibration-normalized-coverage-width-diagnostic): opt-in emission
// of the PER-VARIABLE feasible widths this script already computes but previously only ever
// aggregated into covered/touched/narrow/softFill. The normalized-coverage-width diagnostic
// needs each variable's own width trajectory (its width at first touch, and the round-by-round
// mean across touched variables), neither of which is recoverable from the aggregates.
//
// Strictly additive: when unset, this script's behaviour and its
// degree-tier-recon-2026-08-18.csv output are byte-identical to before (verified with `diff`).
// When set, a SECOND csv is written alongside it; the first is untouched either way.
const EMIT_WIDTHS = process.env.RECON_EMIT_WIDTHS === '1';

// The progress bar's within-degree denominator: every FREE (criterion, level) variable, i.e.
// levels 2..max for each criterion. 24 for the production 6x5 shape. Derived, not hardcoded,
// so a catalog change can't silently desynchronise the bar from the coverage gate.
const FREE_VARIABLE_COUNT = LEVELS_PER_CRITERION.reduce((n, max) => n + (max - 1), 0);

// Copied from elicitationDriver.ts (not imported — it is a module-private constant there).
// If it ever changes there, this recon's coverage counts stop matching the real gate.
const MAX_VALUE_RANGE_FOR_COVERAGE = 0.2;

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------
// Evaluation pool — identical construction to accuracy-threshold-recalibration-2026-08-17.ts
// (200 degree-6 COMPLETE profiles, seed 20260817), deliberately disjoint from
// computeScoreSpreadAccuracy's own degree-2..4 partial sample pool. See that script's header
// for the circularity argument; the disjointness is structural (complete vs partial profiles
// can never share a profileKey).
// ---------------------------------------------------------------------------------------
const EVAL_POOL_SIZE = 200;
const EVAL_POOL_SEED = 20260817;

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

// ---------------------------------------------------------------------------------------
// Ground truth + oracle specs — replicated verbatim from
// scripts/synthetic-calibration-oracles-2026-08-16.ts (same constants, same order, same ids).
// ---------------------------------------------------------------------------------------
type GroundTruth = number[][];

const LINEAR_SHAPE = [0.25, 0.5, 0.75, 1.0];
const FRONT_LOADED_SHAPE = [0.75, 0.85, 0.93, 1.0];
const BACK_LOADED_SHAPE = [0.07, 0.15, 0.25, 1.0];

function buildGroundTruth(criterionMax: number[], shape: number[]): GroundTruth {
  return criterionMax.map((max) => {
    const arr = new Array(6).fill(0);
    for (let level = 2; level <= 5; level++) arr[level] = max * shape[level - 2];
    return arr;
  });
}

const UNIFORM_MAX = [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6];
const DOMINANT_MAX = [0.7, 0.06, 0.06, 0.06, 0.06, 0.06];
const ZERO_CRIT5_MAX = [0.2, 0.2, 0.2, 0.2, 0.2, 0.0];
const VARIED_MAX = [0.3, 0.25, 0.2, 0.1, 0.1, 0.05];
const NEAR_TIED_MAX = [0.2, 0.19, 0.18, 0.17, 0.15, 0.11];

const realSessionSolved: ValueSolverResult = solveValues({
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
  {
    id: 10,
    name: 'dan-approximation',
    gt: realSessionSolved.values.map((perLevel) => perLevel.map((v) => (v ? v.point : 0))),
  },
];

function scoreProfileGT(profile: Profile, gt: GroundTruth): number {
  let total = 0;
  for (const key of Object.keys(profile)) total += gt[Number(key)][profile[Number(key)]];
  return total;
}

function trueAnswer(profileA: Profile, profileB: Profile, gt: GroundTruth): ComparisonResult {
  const a = scoreProfileGT(profileA, gt);
  const b = scoreProfileGT(profileB, gt);
  if (Math.abs(a - b) < 1e-12) return 'equal';
  return a > b ? 'A' : 'B';
}

// ---------------------------------------------------------------------------------------
// Quality measure: Kendall's tau-b (ties are pervasive in these ground truths — see the
// recalibration report's §3c, where oracle #1 has only 15 distinct true scores across 200
// profiles, so tau-a would be meaningless).
// ---------------------------------------------------------------------------------------
function kendallTauB(x: number[], y: number[]): number {
  let concordant = 0;
  let discordant = 0;
  let tiesX = 0;
  let tiesY = 0;
  const EPS = 1e-12;
  for (let i = 0; i < x.length; i++) {
    for (let j = i + 1; j < x.length; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const tx = Math.abs(dx) < EPS;
      const ty = Math.abs(dy) < EPS;
      if (tx && ty) continue;
      if (tx) {
        tiesX++;
        continue;
      }
      if (ty) {
        tiesY++;
        continue;
      }
      if (dx * dy > 0) concordant++;
      else discordant++;
    }
  }
  const n0 = concordant + discordant;
  const denom = Math.sqrt((n0 + tiesX) * (n0 + tiesY));
  return denom === 0 ? 0 : (concordant - discordant) / denom;
}

/**
 * The recalibration report's own tau-b, reproduced EXACTLY as
 * accuracy-threshold-recalibration-2026-08-17.ts computes it, purely so this recon's numbers
 * can be checked against that committed CSV row-for-row.
 *
 * It differs from textbook tau-b above: pairs tied on BOTH sides are excluded from the tie
 * counts but still included in `n0 = n(n-1)/2`, which inflates the denominator and biases the
 * coefficient slightly toward zero (~0.01-0.02 on these traces — measured, see the write-up).
 * The bias is uniform across rounds and traces, so it changes no ordering and none of that
 * report's conclusions; it is reported here only to make the cross-check exact rather than
 * approximate. Textbook tau-b is the primary measure in this pass.
 */
function kendallTauBAsPublished(x: number[], y: number[]): number {
  const n = x.length;
  let concordant = 0;
  let discordant = 0;
  let tiesX = 0;
  let tiesY = 0;
  const EPS = 1e-12;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const xTied = Math.abs(dx) < EPS;
      const yTied = Math.abs(dy) < EPS;
      if (xTied && yTied) continue;
      if (xTied) {
        tiesX++;
        continue;
      }
      if (yTied) {
        tiesY++;
        continue;
      }
      if (dx * dy > 0) concordant++;
      else discordant++;
    }
  }
  const n0 = (n * (n - 1)) / 2;
  const denom = Math.sqrt((n0 - tiesX) * (n0 - tiesY));
  return denom === 0 ? 0 : (concordant - discordant) / denom;
}

function scorePool(pool: Profile[], values: number[][]): number[] {
  return pool.map((p) => {
    let total = 0;
    for (const key of Object.keys(p)) total += values[Number(key)][p[Number(key)]];
    return total;
  });
}

// ---------------------------------------------------------------------------------------
// Coverage counting — mirrors elicitationDriver.ts's isDegreeCoverageComplete gate exactly:
// a free (criterion, level) variable counts as covered when it has been TOUCHED by an answer
// logged AT THE CURRENT DEGREE (degree-scoped, per the 2026-08-11 fix) AND its feasible range
// is narrower than MAX_VALUE_RANGE_FOR_COVERAGE (computed globally over the whole log, since
// range-narrowing is genuine cross-degree evidence). The two sub-counts are reported
// separately because they behave very differently — see the write-up.
// ---------------------------------------------------------------------------------------
interface CoverageCounts {
  covered: number;
  touched: number;
  narrow: number;
  /**
   * A CONTINUOUS surrogate for the same gate, measured here as a candidate within-degree fill
   * for the progress bar (the brief specifies the discrete `covered / 24`; this exists to say
   * with numbers what the discrete version costs). Per free variable:
   *   touched ? clamp01((1 - width) / (1 - MAX_VALUE_RANGE_FOR_COVERAGE)) : 0
   * so a variable at the gate's own width (0.2) contributes exactly 1, a fully undetermined one
   * (width 1) contributes 0, and the mean reaches 1.0 exactly when isDegreeCoverageComplete
   * would return true. Same gate, same constant, no new threshold — just read continuously
   * instead of as a step.
   */
  softFill: number;
  /** Per free (criterion, level) variable, this round: its feasible width and whether it was
   *  touched AT THE CURRENT DEGREE. Populated only under RECON_EMIT_WIDTHS (see above) — the
   *  aggregates are what the original recon reports, and building this array unconditionally
   *  would allocate 24 objects per round for nothing on the default path. */
  perVariable: VariableWidth[] | null;
}

interface VariableWidth {
  criterion: number;
  level: number;
  width: number;
  touchedAtDegree: boolean;
}

function coverageCounts(
  log: readonly { profileA: Profile; profileB: Profile; degree: number }[],
  values: { min: number; max: number }[][],
  degree: number
): CoverageCounts {
  const touchedAtDegree = LEVELS_PER_CRITERION.map((max) =>
    new Array<boolean>(max + 1).fill(false)
  );
  for (const entry of log) {
    if (entry.degree !== degree) continue;
    for (const profile of [entry.profileA, entry.profileB]) {
      for (const key of Object.keys(profile))
        touchedAtDegree[Number(key)][profile[Number(key)]] = true;
    }
  }
  let covered = 0;
  let touched = 0;
  let narrow = 0;
  let softTotal = 0;
  const perVariable: VariableWidth[] | null = EMIT_WIDTHS ? [] : null;
  for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
    for (let level = 2; level <= LEVELS_PER_CRITERION[c]; level++) {
      const isTouched = touchedAtDegree[c][level];
      const v = values[c][level];
      const isNarrow = v.max - v.min < MAX_VALUE_RANGE_FOR_COVERAGE;
      perVariable?.push({
        criterion: c,
        level,
        width: v.max - v.min,
        touchedAtDegree: isTouched,
      });
      if (isTouched) touched++;
      if (isNarrow) narrow++;
      if (isTouched && isNarrow) covered++;
      if (isTouched) {
        const width = v.max - v.min;
        const soft = (1 - width) / (1 - MAX_VALUE_RANGE_FOR_COVERAGE);
        softTotal += Math.max(0, Math.min(1, soft));
      }
    }
  }
  return { covered, touched, narrow, softFill: softTotal / FREE_VARIABLE_COUNT, perVariable };
}

// ---------------------------------------------------------------------------------------
// Per-round record
// ---------------------------------------------------------------------------------------
interface RoundRecord {
  trace: string;
  round: number;
  degree: number;
  covered: number;
  touched: number;
  narrow: number;
  softFill: number;
  maxWidth: number;
  tauVsTrue: number | null;
  tauVsTruePublished: number | null;
  accuracy: number | null; // boundary + final rounds only (cost)
  isBoundary: boolean; // this round is the last one at its degree (degree exhausted after it)
  boundaryReason: string | null;
  /** RECON_EMIT_WIDTHS only — see EMIT_WIDTHS above. */
  perVariable: VariableWidth[] | null;
}

const evalPool = buildEvalPool();

/** Score-spread accuracy for a session's full log — the live production metric
 *  (computeScoreSpreadAccuracy, ~100 LP solves), called only where the tier decision needs
 *  it: degree-exhaustion boundaries and each trace's final round. */
function accuracyFor(session: CalibrationSession): number {
  return computeScoreSpreadAccuracy({
    levelsPerCriterion: LEVELS_PER_CRITERION,
    answers: session.fullLog.map((e) => ({
      profileA: e.profileA,
      profileB: e.profileB,
      result: e.result,
    })),
  });
}

function tauAgainst(
  values: ValueSolverResult['values'],
  truthScores: number[] | null
): { tau: number | null; published: number | null } {
  if (!truthScores) return { tau: null, published: null };
  const point = values.map((perLevel) => perLevel.map((v) => (v ? v.point : 0)));
  const scores = scorePool(evalPool, point);
  return {
    tau: kendallTauB(scores, truthScores),
    published: kendallTauBAsPublished(scores, truthScores),
  };
}

// ---------------------------------------------------------------------------------------
// Oracle replay — same loop shape as the committed generator (nextAction -> answer -> record,
// auto-escalating on degree-exhausted), minus the per-round score-spread accuracy.
// ---------------------------------------------------------------------------------------
function runOracle(spec: OracleSpec): RoundRecord[] {
  const session = new CalibrationSession();
  const truthScores = scorePool(evalPool, spec.gt);
  const noiseRng = spec.noiseRate ? createRng(9000 + spec.id) : undefined;
  const rows: RoundRecord[] = [];
  let degree = STARTING_DEGREE;
  let round = 0;
  const trace = `#${spec.id} ${spec.name}`;

  while (round < MAX_ROUNDS) {
    const action: DriverAction = nextAction(session, LEVELS_PER_CRITERION, degree);
    if (action.type === 'ask') {
      let result = trueAnswer(action.profileA, action.profileB, spec.gt);
      if (spec.noiseRate && noiseRng!() < spec.noiseRate) {
        const choices: ComparisonResult[] = ['A', 'B', 'equal'];
        result = choices[Math.floor(noiseRng!() * 3)];
      }
      session.recordAnswer(action.profileA, action.profileB, result);
      round++;

      const answers: SolverAnswer[] = session.fullLog.map((e) => ({
        profileA: e.profileA,
        profileB: e.profileB,
        result: e.result,
      }));
      const solved = solveValues({ levelsPerCriterion: LEVELS_PER_CRITERION, answers });
      const counts = coverageCounts(session.fullLog, solved.values, action.degree);
      let maxWidth = 0;
      for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
        for (let lvl = 2; lvl <= LEVELS_PER_CRITERION[c]; lvl++) {
          const v = solved.values[c][lvl];
          maxWidth = Math.max(maxWidth, v.max - v.min);
        }
      }
      rows.push({
        trace,
        round,
        degree: action.degree,
        covered: counts.covered,
        touched: counts.touched,
        narrow: counts.narrow,
        softFill: counts.softFill,
        maxWidth,
        tauVsTrue: tauAgainst(solved.values, truthScores).tau,
        tauVsTruePublished: tauAgainst(solved.values, truthScores).published,
        accuracy: null,
        isBoundary: false,
        boundaryReason: null,
        perVariable: counts.perVariable,
      });
    } else {
      // degree-exhausted: mark the round that produced it, then escalate (or stop).
      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        last.isBoundary = true;
        last.boundaryReason = action.reason;
        last.accuracy = accuracyFor(session);
      }
      if (spec.capDegreeAt2 && action.degree === 2) break;
      if (action.canEscalate) {
        degree = action.nextDegree!;
        continue;
      }
      break;
    }
  }
  if (rows.length > 0 && rows[rows.length - 1].accuracy === null) {
    rows[rows.length - 1].accuracy = accuracyFor(session);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------
// Real sessions: fixed answer logs, replayed prefix by prefix. Degree comes from each
// answer's own profile degree (the same derivation useCalibrationResume uses), and a boundary
// is where the next answer's degree is higher — the real session's own escalation points.
// ---------------------------------------------------------------------------------------
type RawResult = 'a_preferred' | 'b_preferred' | 'equal';
function toComparisonResult(r: RawResult): ComparisonResult {
  if (r === 'a_preferred') return 'A';
  if (r === 'b_preferred') return 'B';
  return 'equal';
}

interface AnswerRow {
  profile_a: Profile;
  profile_b: Profile;
  result: RawResult;
  answered_at: string;
}

function loadA70(): SolverAnswer[] {
  const file = path.resolve(
    __dirname,
    '../docs/decisions/backups/pre-reset-dan-account-2026-08-15.json'
  );
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    user_calibration_answers: AnswerRow[];
  };
  return [...parsed.user_calibration_answers]
    .sort((a, b) => a.answered_at.localeCompare(b.answered_at))
    .map((r) => ({
      profileA: r.profile_a,
      profileB: r.profile_b,
      result: toComparisonResult(r.result),
    }));
}

function runRealSession(trace: string, answers: SolverAnswer[]): RoundRecord[] {
  const session = new CalibrationSession();
  const rows: RoundRecord[] = [];
  // No ground truth for a real session. The recalibration report showed A70's final ranking is
  // NOT uniquely determined (25 challengers could still enter its top-10), so "tau vs final" is
  // partly a pivot-rule artifact there and is reported for shape only; B71's final IS determined.
  const finalSolved = solveValues({ levelsPerCriterion: LEVELS_PER_CRITERION, answers });
  const finalScores = scorePool(
    evalPool,
    finalSolved.values.map((perLevel) => perLevel.map((v) => (v ? v.point : 0)))
  );

  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    session.recordAnswer(a.profileA, a.profileB, a.result);
    const prefix = answers.slice(0, i + 1);
    const solved = solveValues({ levelsPerCriterion: LEVELS_PER_CRITERION, answers: prefix });
    const degree = profileDegree(a.profileA);
    const counts = coverageCounts(session.fullLog, solved.values, degree);
    let maxWidth = 0;
    for (let c = 0; c < LEVELS_PER_CRITERION.length; c++) {
      for (let lvl = 2; lvl <= LEVELS_PER_CRITERION[c]; lvl++) {
        const v = solved.values[c][lvl];
        maxWidth = Math.max(maxWidth, v.max - v.min);
      }
    }
    const nextDegree = i + 1 < answers.length ? profileDegree(answers[i + 1].profileA) : degree;
    rows.push({
      trace,
      round: i + 1,
      degree,
      covered: counts.covered,
      touched: counts.touched,
      narrow: counts.narrow,
      softFill: counts.softFill,
      maxWidth,
      tauVsTrue: tauAgainst(solved.values, finalScores).tau,
      tauVsTruePublished: tauAgainst(solved.values, finalScores).published,
      accuracy: null,
      isBoundary: nextDegree > degree,
      boundaryReason: nextDegree > degree ? 'session-escalated' : null,
      perVariable: counts.perVariable,
    });
    if (nextDegree > degree || i === answers.length - 1) {
      rows[rows.length - 1].accuracy = computeScoreSpreadAccuracy({
        levelsPerCriterion: LEVELS_PER_CRITERION,
        answers: prefix,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------
async function main() {
  const all: RoundRecord[] = [];
  const oraclesToRun = ORACLE_FILTER
    ? ORACLES.filter((o) => ORACLE_FILTER.includes(o.id))
    : ORACLES;

  for (const spec of oraclesToRun) {
    const t0 = Date.now();
    const rows = runOracle(spec);
    all.push(...rows);
    process.stderr.write(
      `[#${spec.id} ${spec.name}] ${rows.length} rounds, degrees ${[...new Set(rows.map((r) => r.degree))].join(',')}, ${Date.now() - t0}ms\n`
    );
  }

  if (!ORACLE_FILTER) {
    const t0 = Date.now();
    const a70 = runRealSession('A70', loadA70());
    all.push(...a70);
    process.stderr.write(`[A70] ${a70.length} rounds, ${Date.now() - t0}ms\n`);

    if (process.env.RECON_INCLUDE_B71 === '1') {
      const { supabase } = await import('./supabaseClient.js');
      // Same id the 2026-08-17 determinacy script used; read-only select, no writes.
      const DAN_USER_ID = 'eec42cd4-e714-46a2-ad9c-35714a1d3a2c';
      const { data, error } = await supabase
        .from('user_calibration_answers')
        .select('profile_a, profile_b, result, answered_at')
        .eq('user_id', DAN_USER_ID)
        .order('answered_at', { ascending: true });
      if (error) throw new Error(error.message);
      const b71 = runRealSession(
        'B71',
        ((data ?? []) as AnswerRow[]).map((r) => ({
          profileA: r.profile_a,
          profileB: r.profile_b,
          result: toComparisonResult(r.result),
        }))
      );
      all.push(...b71);
      process.stderr.write(`[B71] ${b71.length} rounds\n`);
    }
  }

  // Score-spread accuracy at boundary + final rounds only.
  const byTrace = new Map<string, RoundRecord[]>();
  for (const r of all) {
    if (!byTrace.has(r.trace)) byTrace.set(r.trace, []);
    byTrace.get(r.trace)!.push(r);
  }
  const csv = [
    'trace,round,degree,covered,touched,narrow,soft_fill,max_width,tau,tau_published,accuracy,is_boundary,boundary_reason,progress_pct',
  ];
  for (const [, rows] of byTrace) {
    for (const r of rows) {
      const progress = (r.degree - STARTING_DEGREE) * 20 + (r.covered / FREE_VARIABLE_COUNT) * 20;
      csv.push(
        [
          r.trace,
          r.round,
          r.degree,
          r.covered,
          r.touched,
          r.narrow,
          r.softFill.toFixed(6),
          r.maxWidth.toFixed(6),
          r.tauVsTrue === null ? '' : r.tauVsTrue.toFixed(6),
          r.tauVsTruePublished === null ? '' : r.tauVsTruePublished.toFixed(6),
          r.accuracy === null ? '' : r.accuracy.toFixed(6),
          r.isBoundary ? 1 : 0,
          r.boundaryReason ?? '',
          progress.toFixed(2),
        ].join(',')
      );
    }
  }
  const outPath = path.join(DOCS, 'degree-tier-recon-2026-08-18.csv');
  fs.writeFileSync(outPath, csv.join('\n') + '\n');
  process.stderr.write(`CSV written: ${outPath} (${csv.length - 1} rows)\n`);

  if (EMIT_WIDTHS) {
    const widthCsv = ['trace,round,degree,criterion,level,width,touched_at_degree'];
    for (const [, rows] of byTrace) {
      for (const r of rows) {
        for (const v of r.perVariable ?? []) {
          widthCsv.push(
            [
              r.trace,
              r.round,
              r.degree,
              v.criterion,
              v.level,
              v.width.toFixed(9),
              v.touchedAtDegree ? 1 : 0,
            ].join(',')
          );
        }
      }
    }
    const widthPath = path.join(DOCS, 'normalized-coverage-widths-2026-08-25.csv');
    fs.writeFileSync(widthPath, widthCsv.join('\n') + '\n');
    process.stderr.write(`Width CSV written: ${widthPath} (${widthCsv.length - 1} rows)\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
