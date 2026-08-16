// Level B — closed-loop: re-run the 10 synthetic oracles from
// scripts/synthetic-calibration-oracles-2026-08-16.ts through the REAL elicitation stack
// (nextAction -> CalibrationSession -> computeCommitState) under each candidate ratio rule.
//
// This is the test the replay sweep cannot substitute for: changing the ratio test changes
// the solved values, which changes which question the driver offers next, which changes the
// whole answer log. "Does oracle #1 still crash at n=79" is only answerable by re-running the
// loop, not by replaying a captured log.
//
// Oracle specs, ground-truth shapes, seeds, the shared 13-album synthetic ratings set and the
// round cap are copied verbatim from that script so the runs are comparable to its published
// 2026-08-16 numbers.
import * as fs from 'node:fs';
import { describe, it } from 'vitest';
import { setRatioRule, type RatioRuleConfig } from './simplexLab.js';

import { CalibrationSession } from '../../src/lib/criteria-calibration/calibrationSession.js';
import {
  nextAction,
  type DriverAction,
} from '../../src/lib/criteria-calibration/elicitationDriver.js';
import {
  solveValues,
  type SolverAnswer,
  type ValueSolverResult,
} from '../../src/lib/criteria-calibration/solver.js';
import {
  computeCommitState,
  type StabilityWindowContext,
} from '../../src/lib/criteria-calibration/commitComputation.js';
import {
  INITIAL_PERSISTED_STABILITY_WINDOW,
  type PersistedStabilityWindow,
} from '../../src/lib/criteria-calibration/rankingStabilitySignal.js';
import type { CriteriaCatalog } from '../../src/lib/criteria-calibration/criteriaCatalog.js';
import type {
  ComparisonResult,
  Profile,
} from '../../src/lib/criteria-calibration/preferenceGraph.js';
import type { CriterionLevelRating } from '../../src/lib/album-rating/scoreAndRank.js';
import {
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
} from '../../src/lib/criteria-calibration/fixtures.js';

const OUT = new URL('./out/', import.meta.url).pathname;

const NUM_CRITERIA = 6;
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];
const STARTING_DEGREE = 2;
const MAX_ROUNDS = Number(process.env.LAB_ORACLE_ROUNDS ?? 90);
const MAX_WALL_MS = 600_000;

const catalog: CriteriaCatalog = { entries: [], levelsPerCriterion: LEVELS_PER_CRITERION };

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

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

interface OracleSpec {
  id: number;
  name: string;
  gt: GroundTruth;
  noiseRate?: number;
  capDegreeAt2?: boolean;
}

function buildSyntheticRatingsSet(): Map<string, CriterionLevelRating[]> {
  const rng = createRng(20260816);
  const map = new Map<string, CriterionLevelRating[]>();
  for (let i = 0; i < 13; i++) {
    const ratings: CriterionLevelRating[] = [];
    for (let c = 0; c < NUM_CRITERIA; c++) {
      ratings.push({ criterionId: c, level: 1 + Math.floor(rng() * LEVELS_PER_CRITERION[c]) });
    }
    map.set(`synthetic-album-${i}`, ratings);
  }
  return map;
}
const RATINGS_BY_ALBUM = buildSyntheticRatingsSet();

function scoreProfileGT(profile: Profile, gt: GroundTruth): number {
  let total = 0;
  for (const key of Object.keys(profile)) total += gt[Number(key)][profile[Number(key)]];
  return total;
}
function trueAnswer(a: Profile, b: Profile, gt: GroundTruth): ComparisonResult {
  const sa = scoreProfileGT(a, gt);
  const sb = scoreProfileGT(b, gt);
  if (Math.abs(sa - sb) < 1e-12) return 'equal';
  return sa > sb ? 'A' : 'B';
}
function toSolverAnswers(session: CalibrationSession): SolverAnswer[] {
  return session.fullLog.map((e) => ({
    profileA: e.profileA,
    profileB: e.profileB,
    result: e.result,
  }));
}

interface OracleRunResult {
  spec: OracleSpec;
  stopReason: string;
  totalRounds: number;
  wallMs: number;
  crash?: string;
  maxAbsErr: number;
  rmse: number;
  degreesVisited: number[];
}

function runOracle(spec: OracleSpec): OracleRunResult {
  const start = Date.now();
  const session = new CalibrationSession();
  let degree = STARTING_DEGREE;
  let persisted: PersistedStabilityWindow = INITIAL_PERSISTED_STABILITY_WINDOW;
  const degreesVisited = new Set<number>();
  let round = 0;
  let stopReason = 'unknown';
  let finalSolved: ValueSolverResult = solveValues({
    levelsPerCriterion: LEVELS_PER_CRITERION,
    answers: [],
  });
  const noiseRng = spec.noiseRate ? createRng(9000 + spec.id) : undefined;
  let crash: string | undefined;

  try {
    while (round < MAX_ROUNDS) {
      if (Date.now() - start > MAX_WALL_MS) {
        stopReason = 'wall-clock-cap-hit';
        break;
      }
      const action: DriverAction = nextAction(session, LEVELS_PER_CRITERION, degree);
      if (action.type === 'ask') {
        degreesVisited.add(action.degree);
        let result = trueAnswer(action.profileA, action.profileB, spec.gt);
        if (spec.noiseRate && noiseRng!() < spec.noiseRate) {
          const choices: ComparisonResult[] = ['A', 'B', 'equal'];
          result = choices[Math.floor(noiseRng!() * 3)];
        }
        session.recordAnswer(action.profileA, action.profileB, result);
        round++;
        const stabilityContext: StabilityWindowContext = {
          previous: persisted,
          ratingsByAlbum: RATINGS_BY_ALBUM,
        };
        const commit = computeCommitState(catalog, toSolverAnswers(session), stabilityContext);
        persisted = commit.stabilityWindow ?? persisted;
        finalSolved = commit.solved;
      } else {
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
    crash = err instanceof Error ? err.message : String(err);
    stopReason = 'solver-crash';
  }
  if (stopReason === 'unknown') stopReason = 'round-cap-hit';

  let maxAbsErr = 0;
  let sumSq = 0;
  let n = 0;
  for (let c = 0; c < NUM_CRITERIA; c++) {
    for (let level = 2; level <= LEVELS_PER_CRITERION[c]; level++) {
      const err = Math.abs((finalSolved.values[c][level]?.point ?? 0) - spec.gt[c][level]);
      maxAbsErr = Math.max(maxAbsErr, err);
      sumSq += err * err;
      n++;
    }
  }
  return {
    spec,
    stopReason,
    totalRounds: round,
    wallMs: Date.now() - start,
    crash,
    maxAbsErr,
    rmse: Math.sqrt(sumSq / n),
    degreesVisited: Array.from(degreesVisited).sort((a, b) => a - b),
  };
}

const ALL_RULES: RatioRuleConfig[] = [
  { name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'magnitude-tiebreak', pivotFloor: 1e-7, delta: 1e-9 },
  { name: 'harris', pivotFloor: 1e-7, delta: 1e-8 },
];
// LAB_RULES filters by name, same convention as adversarial.labtest.ts (added 2026-08-16).
// Its real use is the no-alias production run under lab.prod.vitest.config.ts, where
// setRatioRule is inert and running all three would just re-run the shipped rule 3x at ~8
// minutes each.
const RULES = process.env.LAB_RULES
  ? ALL_RULES.filter((r) => process.env.LAB_RULES!.split(',').includes(r.name))
  : ALL_RULES;
const label = (r: RatioRuleConfig) => (r.name === 'harris' ? `harris(d=${r.delta})` : r.name);

describe('Level B — closed-loop oracles', () => {
  it('re-runs all 10 oracles per rule', () => {
    // Oracle #10's ground truth is derived from the real production session via solveValues,
    // so it must be built under BASELINE — otherwise each rule would be scored against a
    // different target and the recovery numbers would not be comparable across rules.
    setRatioRule({ name: 'baseline', pivotFloor: 1e-7, delta: 1e-9 });
    const realSolved = solveValues({
      levelsPerCriterion: REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
      answers: REAL_PRODUCTION_SESSION_ANSWERS,
    });
    const danGT: GroundTruth = realSolved.values.map((per) => per.map((v) => (v ? v.point : 0)));

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
      { id: 10, name: 'dan-approximation', gt: danGT },
    ];

    const out: string[] = [`MAX_ROUNDS=${MAX_ROUNDS}`];
    for (const rule of RULES) {
      out.push(`\n--- ${label(rule)} ---`);
      let crashes = 0;
      for (const spec of ORACLES) {
        setRatioRule(rule);
        const r = runOracle(spec);
        if (r.crash) crashes++;
        out.push(
          `  #${String(r.spec.id).padStart(2)} ${r.spec.name.padEnd(26)} stop=${r.stopReason.padEnd(34)} ` +
            `rounds=${String(r.totalRounds).padStart(3)} degrees=${r.degreesVisited.join('/')} ` +
            `maxAbsErr=${r.maxAbsErr.toFixed(4)} rmse=${r.rmse.toFixed(4)} wallMs=${r.wallMs}`
        );
        if (r.crash) out.push(`      CRASH: ${r.crash.slice(0, 180)}`);
        fs.writeFileSync(`${OUT}out-oracles.txt`, out.join('\n') + '\n');
      }
      out.push(`  => crashes: ${crashes}/10`);
      fs.writeFileSync(`${OUT}out-oracles.txt`, out.join('\n') + '\n');
    }
    fs.writeFileSync(`${OUT}out-oracles.txt`, out.join('\n') + '\n');
  });
});
