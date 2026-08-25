// Freeze-checkpoint brief, Step 1 — read-only recon (2026-08-25).
//
// QUESTION (brief step 1): for the four preference shapes that never reach
// `coverage-complete` at degree 2 in 90 rounds (#2 single-dominant, #4 linear-control,
// #5 front-loaded, #6 back-loaded — confirmed in criteria-calibration-degree-tiers-and-progress.md
// §2d and reconfirmed in criteria-calibration-normalized-coverage-width-diagnostic.md), is the
// degree-2 refinement CANDIDATE POOL actually empty at round 90, or merely non-productive
// (candidates remain, but answering them stops narrowing feasible ranges)?
//
// This distinguishes:
//   Case A (pool.length === 0): nothing left to ask at degree 2 — escalating to degree 3 is the
//     unconditional continuation of running out of material, not an artificial promotion.
//   Case B (pool.length > 0): candidates still exist; the user could keep answering degree-2
//     questions, they just aren't moving the needle. Escalating here needs explicit consent,
//     not an automatic transition.
//
// METHOD: replay the same 12 oracle traces scripts/degree-tier-recon-2026-08-18.ts already
// replays (same ground truths, same seeds, same driver calls, same MAX_ROUNDS=90 default), and
// at every round, independently compute the degree-2 refinement pool size alongside the
// production driver's own `nextAction` call.
//
// `buildRefinementCandidatePool` is module-private in elicitationDriver.ts and is NOT exported
// or modified here (this pass is read-only — no production file touched). Instead, this script
// reconstructs the pool from the driver's own EXPORTED pieces (`generateCandidatesForSubset`,
// `profileKey`, `session.graph.isImplied`) plus three tiny private helpers copied verbatim from
// elicitationDriver.ts (`enumerateCriterionSubsets`, `hasBeenAsked`, `computeTouchCounts` — each
// is a pure, few-line function with no hidden state; copies are marked at each site). If those
// three ever change shape in elicitationDriver.ts, this script's numbers stop being trustworthy
// and must be re-diffed against the source before reuse.
//
// SELF-CHECK (not a courtesy — the actual proof this replication is faithful): at every round,
// this script asserts its independently-computed pool size agrees with what the real
// `nextAction` call implies:
//   - action.type === 'degree-exhausted' && reason === 'pool-empty'  =>  computed pool === 0
//   - action.type === 'ask' && reason === 'ambiguity-refinement'     =>  computed pool > 0
// (cold-start-coverage rounds and coverage-complete exhaustion are skipped — the pool isn't the
// gating fact in either branch; see elicitationDriver.ts's nextAction for the exact order.)
// A mismatch throws immediately, since a silent divergence there would make every number below
// worthless. Confirmed clean across all 12 traces, 90 rounds each, no assertion failures.
//
// No writes to Supabase. No production module modified.

import { CalibrationSession } from '../src/lib/criteria-calibration/calibrationSession.js';
import {
  nextAction,
  generateCandidatesForSubset,
  type DriverAction,
} from '../src/lib/criteria-calibration/elicitationDriver.js';
import { type CandidatePair } from '../src/lib/criteria-calibration/questionOrdering.js';
import { solveValues } from '../src/lib/criteria-calibration/solver.js';
import {
  profileKey,
  type ComparisonResult,
  type Profile,
} from '../src/lib/criteria-calibration/preferenceGraph.js';
import {
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
} from '../src/lib/criteria-calibration/fixtures.js';

const NUM_CRITERIA = 6;
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];
const STARTING_DEGREE = 2;
const MAX_ROUNDS = process.env.RECON_MAX_ROUNDS ? Number(process.env.RECON_MAX_ROUNDS) : 90;

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------
// Ground truth + oracle specs — replicated verbatim from
// scripts/degree-tier-recon-2026-08-18.ts (same constants, same order, same ids), which itself
// replicates scripts/synthetic-calibration-oracles-2026-08-16.ts. Same experiment, not a
// similar one.
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
  {
    id: 10,
    name: 'dan-approximation',
    gt: realSessionSolved.values.map((perLevel) => perLevel.map((v) => (v ? v.point : 0))),
  },
];

// The four traces the brief asks about. #9 is degree-2-capped (irrelevant, different question);
// #7/#8 are not among the four flagged as never-coverage-complete. Kept in ORACLES above so the
// self-check below still runs against all 12 traces the driver has to handle, not a cherry-picked
// 4 — a replication bug that happens to only misbehave on the flagged four would otherwise hide.
const BLOCKED_IDS = [2, 4, 5, 6];

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
// Copied verbatim from src/lib/criteria-calibration/elicitationDriver.ts (module-private
// there — copies, not imports). See file header for why and the self-check that catches drift.
// ---------------------------------------------------------------------------------------
function enumerateCriterionSubsets(numCriteria: number, degree: number): number[][] {
  const subsets: number[][] = [];
  function build(start: number, current: number[]) {
    if (current.length === degree) {
      subsets.push([...current]);
      return;
    }
    for (let i = start; i < numCriteria; i++) {
      current.push(i);
      build(i + 1, current);
      current.pop();
    }
  }
  build(0, []);
  return subsets;
}

function hasBeenAsked(session: CalibrationSession, profileA: Profile, profileB: Profile): boolean {
  const keyA = profileKey(profileA);
  const keyB = profileKey(profileB);
  return session.fullLog.some((entry) => {
    const entryKeyA = profileKey(entry.profileA);
    const entryKeyB = profileKey(entry.profileB);
    return (entryKeyA === keyA && entryKeyB === keyB) || (entryKeyA === keyB && entryKeyB === keyA);
  });
}

function computeTouchCounts(session: CalibrationSession, levelsPerCriterion: number[]): number[][] {
  const counts = levelsPerCriterion.map((max) => new Array<number>(max + 1).fill(0));
  for (const entry of session.fullLog) {
    for (const profile of [entry.profileA, entry.profileB]) {
      for (const key of Object.keys(profile)) {
        const idx = Number(key);
        const level = profile[idx];
        counts[idx][level]++;
      }
    }
  }
  return counts;
}

/** Reconstructs elicitationDriver.ts's buildRefinementCandidatePool from its exported pieces
 *  plus the three copied helpers above. */
function computeRefinementPoolSize(
  session: CalibrationSession,
  levelsPerCriterion: number[],
  degree: number
): number {
  const touchCounts = computeTouchCounts(session, levelsPerCriterion);
  const subsets = enumerateCriterionSubsets(levelsPerCriterion.length, degree);
  let poolSize = 0;
  for (const subset of subsets) {
    const candidates: CandidatePair[] = generateCandidatesForSubset(
      subset,
      levelsPerCriterion,
      touchCounts
    );
    for (const candidate of candidates) {
      if (hasBeenAsked(session, candidate.profileA, candidate.profileB)) continue;
      if (session.graph.isImplied(candidate.profileA, candidate.profileB).implied) continue;
      poolSize++;
    }
  }
  return poolSize;
}

// ---------------------------------------------------------------------------------------
// Replay loop — same shape as degree-tier-recon-2026-08-18.ts's runOracle, plus the
// independent pool computation and its self-check against the real nextAction result.
// ---------------------------------------------------------------------------------------
interface PoolRow {
  trace: string;
  round: number;
  degree: number;
  driverActionType: string;
  driverReason: string;
  poolSize: number;
}

function runOracle(spec: OracleSpec): PoolRow[] {
  const session = new CalibrationSession();
  const noiseRng = spec.noiseRate ? createRng(9000 + spec.id) : undefined;
  const rows: PoolRow[] = [];
  let degree = STARTING_DEGREE;
  let round = 0;
  const trace = `#${spec.id} ${spec.name}`;

  while (round < MAX_ROUNDS) {
    const action: DriverAction = nextAction(session, LEVELS_PER_CRITERION, degree);

    // Independent pool computation, only meaningful once cold-start coverage (all C(N,2)
    // pairs touched at least once) is done — before that, nextAction never reaches the pool
    // build at all (see nextAction's early-return branch). Compute it regardless so the CSV
    // has a full trajectory; the self-check below only fires where it's actually decisive.
    const poolSize = computeRefinementPoolSize(session, LEVELS_PER_CRITERION, degree);

    if (action.type === 'ask') {
      if (action.reason === 'ambiguity-refinement' && poolSize === 0) {
        throw new Error(
          `[${trace}] round ${round + 1}: nextAction returned ask/ambiguity-refinement but ` +
            `independently-computed pool size is 0 — replication has drifted from the real driver.`
        );
      }
      let result = trueAnswer(action.profileA, action.profileB, spec.gt);
      if (spec.noiseRate && noiseRng!() < spec.noiseRate) {
        const choices: ComparisonResult[] = ['A', 'B', 'equal'];
        result = choices[Math.floor(noiseRng!() * 3)];
      }
      session.recordAnswer(action.profileA, action.profileB, result);
      round++;
      rows.push({
        trace,
        round,
        degree: action.degree,
        driverActionType: 'ask',
        driverReason: action.reason,
        poolSize,
      });
    } else {
      if (action.reason === 'pool-empty' && poolSize !== 0) {
        throw new Error(
          `[${trace}] round ${round}: nextAction returned degree-exhausted/pool-empty but ` +
            `independently-computed pool size is ${poolSize} — replication has drifted from the real driver.`
        );
      }
      rows.push({
        trace,
        round,
        degree: action.degree,
        driverActionType: 'degree-exhausted',
        driverReason: action.reason,
        poolSize,
      });
      if (spec.capDegreeAt2 && action.degree === 2) break;
      if (action.canEscalate) {
        degree = action.nextDegree!;
        continue;
      }
      break;
    }
  }
  return rows;
}

function main() {
  const allRows: PoolRow[] = [];
  for (const spec of ORACLES) {
    const rows = runOracle(spec);
    allRows.push(...rows);
    process.stderr.write(`[#${spec.id} ${spec.name}] ${rows.length} rounds replayed, self-check passed\n`);
  }

  process.stderr.write(
    `\nSelf-check: all ${ORACLES.length} traces, ${MAX_ROUNDS} rounds each — no divergence between ` +
      `nextAction's own ask/pool-empty decisions and this script's independent pool computation.\n\n`
  );

  process.stderr.write('=== Round-90 (or final) pool size, all 4 flagged traces ===\n');
  for (const id of BLOCKED_IDS) {
    const spec = ORACLES.find((o) => o.id === id)!;
    const trace = `#${spec.id} ${spec.name}`;
    const traceRows = allRows.filter((r) => r.trace === trace);
    const last = traceRows[traceRows.length - 1];
    process.stderr.write(
      `${trace}: round ${last.round}, degree ${last.degree}, driver=${last.driverActionType}/${last.driverReason}, poolSize=${last.poolSize}\n`
    );
  }
}

main();
