// Empirical recalibration of the score-spread-accuracy tier thresholds — read-only
// diagnostic (2026-08-17).
//
// QUESTION: SCORE_SPREAD_MEDIUM/HIGH/VERY_HIGH_THRESHOLD (0.55 / 0.75 / 0.85,
// accuracyTiers.ts) are provisional and were never derived from what the metric is meant to
// guarantee — that the ranking is trustworthy enough to act on. Since
// criteria-calibration-tiered-checkpoints.md shipped, these constants are user-facing copy at
// every checkpoint, not just internal gating. Do they correspond to real ranking quality?
//
// METHOD: for each of 12 traces (10 synthetic oracles with KNOWN ground truth + 2 real
// sessions), compute the accuracy metric alongside an INDEPENDENT ranking-quality measure at
// every round, then ask which accuracy cutoffs reliably predict "the ranking is already
// close to its true/final form".
//
// DATA SOURCE — no re-simulation. The per-round solved value vectors already exist in the two
// committed post-Harris trajectory CSVs (see criteria-calibration-escalation-signal-candidates.md
// §2), whose `point_vec` column carries the full 24-value solved table per round. Every
// quantity this diagnostic needs is a pure offline function of those vectors plus ground
// truth, so re-running the (tens of minutes) oracle simulation would reproduce identical
// rows. Verified rather than assumed: oracle #9 was spot-re-run from the committed generator
// on 2026-08-17 and matched the committed CSV exactly on all 30 rounds across degree,
// accuracy, tier, and all three width columns.
//
// No writes. No production code modified — imported read-only.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { profileKey, type Profile } from '../src/lib/criteria-calibration/preferenceGraph.js';
import { solveValues, type ValueSolverResult } from '../src/lib/criteria-calibration/solver.js';
import { defaultSamplePairs } from '../src/lib/criteria-calibration/scoreSpreadAccuracy.js';
import {
  SCORE_SPREAD_MEDIUM_THRESHOLD,
  SCORE_SPREAD_HIGH_THRESHOLD,
  SCORE_SPREAD_VERY_HIGH_THRESHOLD,
} from '../src/lib/criteria-calibration/accuracyTiers.js';
import {
  REAL_PRODUCTION_SESSION_ANSWERS,
  REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION,
} from '../src/lib/criteria-calibration/fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '../docs/data/criteria-calibration');

const NUM_CRITERIA = 6;
const LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];

// ---------------------------------------------------------------------------------------
// Evaluation pool — DELIBERATELY INDEPENDENT of computeScoreSpreadAccuracy's own sample pool
// ---------------------------------------------------------------------------------------
// Circularity risk, raised before this diagnostic was written: if the pool we measure ranking
// quality on were the same pool the accuracy metric samples, accuracy would correlate with
// quality trivially — the metric would be graded on its own homework.
//
// Independence here is STRUCTURAL, not merely probabilistic:
//   - different seed (20260817 vs the metric's 20260809);
//   - different size (200 vs 15);
//   - different profile CLASS. The metric samples degree-2..4 PARTIAL profiles
//     (SAMPLE_DEGREES = [2,3,4] in scoreSpreadAccuracy.ts) — profiles that leave most criteria
//     unspecified. This pool is degree-6 COMPLETE profiles: every criterion specified, which
//     is what an actual album is. A complete profile can never equal a partial one (their
//     profileKey key-sets differ), so the intersection is empty by construction.
// assertPoolIndependence() below checks this empirically anyway rather than trusting the
// argument.
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

function assertPoolIndependence(evalPool: Profile[]): string {
  const metricKeys = new Set<string>();
  for (const [a, b] of defaultSamplePairs(LEVELS_PER_CRITERION)) {
    metricKeys.add(profileKey(a));
    metricKeys.add(profileKey(b));
  }
  const evalKeys = new Set(evalPool.map(profileKey));
  const overlap = [...evalKeys].filter((k) => metricKeys.has(k));
  if (overlap.length > 0) {
    throw new Error(
      `CIRCULARITY: ${overlap.length} eval profiles are in the accuracy metric's own sample pool`
    );
  }
  return `metric pool ${metricKeys.size} distinct profiles, eval pool ${evalKeys.size}, overlap 0`;
}

// ---------------------------------------------------------------------------------------
// Ground truth — replicated verbatim from scripts/synthetic-calibration-oracles-2026-08-16.ts
// ---------------------------------------------------------------------------------------
type GroundTruth = number[][]; // [criterion][level], index 0 and 1 unused/zero

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

const ORACLE_GT: Record<number, GroundTruth> = {
  1: buildGroundTruth(UNIFORM_MAX, LINEAR_SHAPE),
  2: buildGroundTruth(DOMINANT_MAX, LINEAR_SHAPE),
  3: buildGroundTruth(ZERO_CRIT5_MAX, LINEAR_SHAPE),
  4: buildGroundTruth(VARIED_MAX, LINEAR_SHAPE),
  5: buildGroundTruth(VARIED_MAX, FRONT_LOADED_SHAPE),
  6: buildGroundTruth(VARIED_MAX, BACK_LOADED_SHAPE),
  7: buildGroundTruth(NEAR_TIED_MAX, LINEAR_SHAPE),
  8: buildGroundTruth(UNIFORM_MAX, LINEAR_SHAPE),
  9: buildGroundTruth(UNIFORM_MAX, LINEAR_SHAPE),
  10: realSessionSolved.values.map((perLevel) => perLevel.map((v) => (v ? v.point : 0))),
};

// ---------------------------------------------------------------------------------------
// point_vec parsing — 24 values, criterion-major, levels 2..5 within each criterion
// ---------------------------------------------------------------------------------------
function parsePointVec(raw: string): number[][] {
  const flat = raw.trim().split(/\s+/).map(Number);
  if (flat.length !== 24) throw new Error(`expected 24 point_vec values, got ${flat.length}`);
  const values: number[][] = [];
  for (let c = 0; c < NUM_CRITERIA; c++) {
    const arr = new Array(6).fill(0);
    for (let level = 2; level <= 5; level++) arr[level] = flat[c * 4 + (level - 2)];
    values.push(arr);
  }
  return values;
}

/** Slot-order sanity check: solveValues enforces monotonicity within a criterion, so a
 *  criterion-major layout must produce non-decreasing runs of 4. A level-major layout would
 *  not. Run once over every parsed row rather than assuming the documented order. */
function checkSlotOrder(values: number[][]): boolean {
  for (const perLevel of values) {
    for (let level = 3; level <= 5; level++) {
      if (perLevel[level] < perLevel[level - 1] - 1e-6) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------
// Ranking measures
// ---------------------------------------------------------------------------------------
function scoreAll(values: number[][], pool: Profile[]): number[] {
  return pool.map((profile) => {
    let total = 0;
    for (const key of Object.keys(profile)) {
      const c = Number(key);
      total += values[c][profile[c]] ?? 0;
    }
    return total;
  });
}

const TIE_EPS = 1e-9;

/** Kendall's tau-b (tie-corrected). O(n^2) over the 200-profile pool = 19,900 pairs/round. */
function kendallTauB(x: number[], y: number[]): number {
  const n = x.length;
  let concordant = 0;
  let discordant = 0;
  let tiesX = 0;
  let tiesY = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j];
      const dy = y[i] - y[j];
      const xTied = Math.abs(dx) < TIE_EPS;
      const yTied = Math.abs(dy) < TIE_EPS;
      if (xTied && yTied) continue; // tied in both — excluded from all four counts
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
  if (denom === 0) return 0;
  return (concordant - discordant) / denom;
}

/** Top-10 by score. Ties broken by pool index — deterministic, and the tie-break choice is
 *  itself measured by the tail-churn analysis below rather than assumed harmless. */
function top10(scores: number[]): number[] {
  const idx = scores.map((_, i) => i);
  idx.sort((a, b) => scores[b] - scores[a] || a - b);
  return idx.slice(0, 10);
}

function rank(values: number[]): number[] {
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array(values.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && Math.abs(values[idx[j + 1]] - values[idx[i]]) < TIE_EPS) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = avg;
    i = j + 1;
  }
  return ranks;
}

/** Spearman rank correlation (tie-averaged ranks, Pearson over ranks). */
function spearman(x: number[], y: number[]): number {
  const rx = rank(x);
  const ry = rank(y);
  const n = rx.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

function symDiff(a: number[], b: number[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let d = 0;
  for (const v of sa) if (!sb.has(v)) d++;
  for (const v of sb) if (!sa.has(v)) d++;
  return d;
}

// ---------------------------------------------------------------------------------------
// Trace assembly
// ---------------------------------------------------------------------------------------
interface RoundQuality {
  round: number;
  accuracy: number;
  tier: string;
  degree: number;
  avgCoverageWidth: number;
  tauVsTrue: number | null; // oracles only
  symDiffVsTrue: number | null; // oracles only
  tauVsFinal: number;
  symDiffVsFinal: number;
  tauVsPrev: number | null; // round-to-round churn
  symDiffVsPrev: number | null;
}

interface Trace {
  id: string;
  kind: 'oracle' | 'real';
  rows: RoundQuality[];
}

function parseCsv(file: string): Record<string, string>[] {
  const text = fs.readFileSync(file, 'utf8').trim();
  const lines = text.split('\n');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const rec: Record<string, string> = {};
    header.forEach((h, i) => (rec[h] = cells[i]));
    return rec;
  });
}

function buildTrace(
  id: string,
  kind: 'oracle' | 'real',
  rows: Record<string, string>[],
  gt: GroundTruth | null,
  pool: Profile[],
  roundKey: string,
  slotOrderFailures: { count: number }
): Trace {
  const perRoundValues = rows.map((r) => {
    const v = parsePointVec(r.point_vec);
    if (!checkSlotOrder(v)) slotOrderFailures.count++;
    return v;
  });
  const perRoundScores = perRoundValues.map((v) => scoreAll(v, pool));
  const perRoundTop10 = perRoundScores.map(top10);

  const trueScores = gt ? scoreAll(gt, pool) : null;
  const trueTop10 = trueScores ? top10(trueScores) : null;

  const finalScores = perRoundScores[perRoundScores.length - 1];
  const finalTop10 = perRoundTop10[perRoundTop10.length - 1];

  const out: RoundQuality[] = rows.map((r, i) => ({
    round: Number(r[roundKey]),
    accuracy: Number(r.accuracy),
    tier: r.tier,
    degree: Number(r.degree),
    avgCoverageWidth: Number(r.avg_coverage_width),
    tauVsTrue: trueScores ? kendallTauB(perRoundScores[i], trueScores) : null,
    symDiffVsTrue: trueTop10 ? symDiff(perRoundTop10[i], trueTop10) : null,
    tauVsFinal: kendallTauB(perRoundScores[i], finalScores),
    symDiffVsFinal: symDiff(perRoundTop10[i], finalTop10),
    tauVsPrev: i === 0 ? null : kendallTauB(perRoundScores[i], perRoundScores[i - 1]),
    symDiffVsPrev: i === 0 ? null : symDiff(perRoundTop10[i], perRoundTop10[i - 1]),
  }));

  return { id, kind, rows: out };
}

// Published post-Harris settle points from criteria-calibration-escalation-signal-candidates.md
// §3 — "the last round at which the solved top-10 changed", measured there on the 13-album
// synthetic set / Dan's real rated albums, NOT on this diagnostic's 200-profile pool. Used as
// an external convergence reference so the tail-churn check is not circular.
const EXTERNAL_SETTLE: Record<string, number> = {
  '#1 uniform': 65,
  '#2 single-dominant': 29,
  '#3 zero-weight-criterion': 57,
  '#4 linear-control': 70,
  '#5 front-loaded': 37,
  '#6 back-loaded': 40,
  '#7 near-tied': 42,
  '#8 noisy': 36,
  '#9 short-session-degree2-cap': 24,
  '#10 dan-approximation': 27,
  A70: 39,
  B71: 46,
};

// ---------------------------------------------------------------------------------------
// Quality bars and threshold fitting
// ---------------------------------------------------------------------------------------
interface QualityBar {
  name: string;
  tier: 'medium' | 'high' | 'veryHigh';
  /** Met on this round? Oracle version (against true ranking). */
  metTrue: (r: RoundQuality) => boolean;
  /** Met on this round? Real-session version (against own final ranking). */
  metFinal: (r: RoundQuality) => boolean;
}

const BARS: QualityBar[] = [
  {
    name: 'tau>=0.80 (Medium-grade: broadly right order)',
    tier: 'medium',
    metTrue: (r) => (r.tauVsTrue ?? -1) >= 0.8,
    metFinal: (r) => r.tauVsFinal >= 0.8,
  },
  {
    name: 'tau>=0.90 (High-grade: close to true order)',
    tier: 'high',
    metTrue: (r) => (r.tauVsTrue ?? -1) >= 0.9,
    metFinal: (r) => r.tauVsFinal >= 0.9,
  },
  {
    name: 'tau>=0.95 (VeryHigh-grade: essentially final)',
    tier: 'veryHigh',
    metTrue: (r) => (r.tauVsTrue ?? -1) >= 0.95,
    metFinal: (r) => r.tauVsFinal >= 0.95,
  },
  {
    name: 'top10 symdiff<=4 (Medium-grade)',
    tier: 'medium',
    metTrue: (r) => (r.symDiffVsTrue ?? 99) <= 4,
    metFinal: (r) => r.symDiffVsFinal <= 4,
  },
  {
    name: 'top10 symdiff<=2 (High-grade, "within 1 swap")',
    tier: 'high',
    metTrue: (r) => (r.symDiffVsTrue ?? 99) <= 2,
    metFinal: (r) => r.symDiffVsFinal <= 2,
  },
  {
    name: 'top10 symdiff==0 (VeryHigh-grade, exact)',
    tier: 'veryHigh',
    metTrue: (r) => (r.symDiffVsTrue ?? 99) === 0,
    metFinal: (r) => r.symDiffVsFinal === 0,
  },
];

/** First round from which the bar is met AND never subsequently violated. Durability matters:
 *  a bar that is met transiently then lost is not a point a checkpoint should fire at. */
function firstDurableRound(trace: Trace, met: (r: RoundQuality) => boolean): number | null {
  let candidate: number | null = null;
  for (let i = trace.rows.length - 1; i >= 0; i--) {
    if (met(trace.rows[i])) candidate = trace.rows[i].round;
    else break;
  }
  return candidate;
}

/** First round at which accuracy >= T. */
function firstCross(trace: Trace, T: number): number | null {
  for (const r of trace.rows) if (r.accuracy >= T) return r.round;
  return null;
}

const GRID: number[] = [];
for (let t = 0.3; t <= 0.995; t += 0.005) GRID.push(Number(t.toFixed(3)));

interface TraceFit {
  traceId: string;
  durable: number | null;
  /** Smallest grid T whose first crossing is at or after `durable` (i.e. no false positive). */
  minSafeT: number | null;
  /** Largest grid T that still fires within the trace (i.e. not silent). */
  maxFiringT: number | null;
  crossAtCurrent: number | null; // where the CURRENT constant for this tier crosses
  currentIsSafe: boolean | null;
}

function fitTrace(trace: Trace, bar: QualityBar, currentT: number): TraceFit {
  const met = trace.kind === 'oracle' ? bar.metTrue : bar.metFinal;
  const durable = firstDurableRound(trace, met);
  let minSafeT: number | null = null;
  let maxFiringT: number | null = null;
  for (const T of GRID) {
    const cross = firstCross(trace, T);
    if (cross !== null) maxFiringT = T;
    if (durable !== null && cross !== null && cross >= durable && minSafeT === null) minSafeT = T;
  }
  const crossAtCurrent = firstCross(trace, currentT);
  return {
    traceId: trace.id,
    durable,
    minSafeT,
    maxFiringT,
    crossAtCurrent,
    currentIsSafe:
      durable === null ? null : crossAtCurrent === null ? true : crossAtCurrent >= durable,
  };
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------
function main() {
  const pool = buildEvalPool();
  const independence = assertPoolIndependence(pool);
  console.log('=== POOL INDEPENDENCE ===');
  console.log(`  ${independence}`);
  console.log(
    `  eval pool: ${pool.length} degree-${NUM_CRITERIA} COMPLETE profiles, seed ${EVAL_POOL_SEED}`
  );
  console.log(
    `  metric pool: 15 degree-2..4 PARTIAL profiles, seed 20260809 (scoreSpreadAccuracy.ts)\n`
  );

  const slotOrderFailures = { count: 0 };
  const traces: Trace[] = [];

  const oracleRows = parseCsv(
    path.join(DOCS, 'escalation-signal-oracle-trajectories-postharris-2026-08-16.csv')
  );
  const byOracle = new Map<string, Record<string, string>[]>();
  for (const r of oracleRows) {
    const key = `#${r.oracle_id} ${r.oracle_name}`;
    if (!byOracle.has(key)) byOracle.set(key, []);
    byOracle.get(key)!.push(r);
  }
  for (const [key, rows] of [...byOracle.entries()].sort(
    (a, b) => Number(a[1][0].oracle_id) - Number(b[1][0].oracle_id)
  )) {
    const id = Number(rows[0].oracle_id);
    traces.push(buildTrace(key, 'oracle', rows, ORACLE_GT[id], pool, 'round', slotOrderFailures));
  }

  const realRows = parseCsv(
    path.join(DOCS, 'escalation-signal-real-session-trajectories-2026-08-16.csv')
  );
  for (const session of ['A70', 'B71']) {
    const rows = realRows.filter((r) => r.session === session);
    traces.push(buildTrace(session, 'real', rows, null, pool, 'n', slotOrderFailures));
  }

  console.log('=== SLOT-ORDER SANITY ===');
  console.log(
    `  point_vec criterion-major monotonicity violations: ${slotOrderFailures.count} / ${
      oracleRows.length + realRows.length
    } rows\n`
  );

  // ---- Tail churn: is the ranking measure itself stable after convergence? ----
  // The convergence reference must be EXTERNAL to the pool being measured. Defining the tail
  // as "after the last 200-pool top-10 change" would make zero tail churn true by
  // construction. These `settle` values are the published ones from
  // criteria-calibration-escalation-signal-candidates.md §3 — computed post-Harris on the
  // 13-album synthetic set (oracles) / Dan's real rated albums (A70, B71), i.e. on a
  // different pool than the 200-profile one measured here.
  console.log('=== TAIL RANK-ORDER CHURN (tie-break degeneracy check) ===');
  console.log('  settleExt = published settle (escalation-signal doc §3), external to this pool.');
  console.log('  settle200 = last round the 200-pool top-10 changed (reported for comparison).');
  console.log(
    '  trace | rounds | settleExt | settle200 | tail n | tail max symdiff(prev) | tail median tau(prev) | tail min tau(prev)'
  );
  const churn: Record<string, unknown>[] = [];
  for (const t of traces) {
    let settle200 = t.rows[0].round;
    for (const r of t.rows) if ((r.symDiffVsPrev ?? 0) > 0) settle200 = r.round;
    const settle = EXTERNAL_SETTLE[t.id];
    const tail = t.rows.filter((r) => r.round > settle && r.symDiffVsPrev !== null);
    const taus = tail.map((r) => r.tauVsPrev!).sort((a, b) => a - b);
    const maxSym = tail.length ? Math.max(...tail.map((r) => r.symDiffVsPrev!)) : 0;
    const medTau = taus.length ? taus[Math.floor(taus.length / 2)] : 1;
    const minTau = taus.length ? taus[0] : 1;
    console.log(
      `  ${t.id.padEnd(30)} | ${String(t.rows.length).padStart(3)} | ${String(settle).padStart(3)} | ${String(
        settle200
      ).padStart(
        3
      )} | ${String(tail.length).padStart(3)} | ${String(maxSym).padStart(3)} | ${medTau.toFixed(
        4
      )} | ${minTau.toFixed(4)}`
    );
    churn.push({
      trace: t.id,
      rounds: t.rows.length,
      settleExt: settle,
      settle200,
      tailN: tail.length,
      tailMaxSymDiffPrev: maxSym,
      tailMedianTauPrev: medTau,
      tailMinTauPrev: minTau,
    });
  }
  console.log('');

  // ---- Ceiling check: the three oracles that never reach current-High ----
  console.log('=== ACCURACY CEILING vs RANKING QUALITY (task 4) ===');
  console.log(
    '  trace | maxAcc | round@maxAcc | tau@maxAcc | symdiff@maxAcc | finalTau | finalSymdiff | crossesHigh(0.75)'
  );
  for (const t of traces) {
    const best = t.rows.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
    const last = t.rows[t.rows.length - 1];
    const crossHigh = firstCross(t, SCORE_SPREAD_HIGH_THRESHOLD);
    console.log(
      `  ${t.id.padEnd(30)} | ${best.accuracy.toFixed(4)} | ${String(best.round).padStart(3)} | ${(
        best.tauVsTrue ?? best.tauVsFinal
      ).toFixed(4)} | ${String(best.symDiffVsTrue ?? best.symDiffVsFinal).padStart(2)} | ${(
        last.tauVsTrue ?? last.tauVsFinal
      ).toFixed(4)} | ${String(last.symDiffVsTrue ?? last.symDiffVsFinal).padStart(2)} | ${
        crossHigh ?? 'never'
      }`
    );
  }
  console.log('');

  // ---- Threshold fitting ----
  const currentFor = {
    medium: SCORE_SPREAD_MEDIUM_THRESHOLD,
    high: SCORE_SPREAD_HIGH_THRESHOLD,
    veryHigh: SCORE_SPREAD_VERY_HIGH_THRESHOLD,
  };
  const fitOut: Record<string, unknown>[] = [];
  for (const bar of BARS) {
    const currentT = currentFor[bar.tier];
    console.log(`=== BAR: ${bar.name}  (current ${bar.tier} constant = ${currentT}) ===`);
    console.log('  trace | durableRound | minSafeT | maxFiringT | cross@current | current safe?');
    const fits = traces.map((t) => fitTrace(t, bar, currentT));
    for (const f of fits) {
      console.log(
        `  ${f.traceId.padEnd(30)} | ${String(f.durable ?? 'never').padStart(5)} | ${
          f.minSafeT === null ? ' none' : f.minSafeT.toFixed(3)
        } | ${f.maxFiringT === null ? ' none' : f.maxFiringT.toFixed(3)} | ${String(
          f.crossAtCurrent ?? 'never'
        ).padStart(
          5
        )} | ${f.currentIsSafe === null ? 'n/a' : f.currentIsSafe ? 'yes' : 'NO — EARLY'}`
      );
      fitOut.push({ bar: bar.name, tier: bar.tier, currentT, ...f });
    }
    // Intersection of safe intervals: safe set for a trace is [minSafeT, 1]; the
    // intersection across traces is [max(minSafeT), 1]. A trace with minSafeT === null
    // (never durably meets the bar, or no T is safe) makes the intersection empty.
    const withDurable = fits.filter((f) => f.durable !== null);
    const unsafeTraces = withDurable.filter((f) => f.minSafeT === null);
    const safeLB = withDurable
      .filter((f) => f.minSafeT !== null)
      .reduce((m, f) => Math.max(m, f.minSafeT!), 0);
    // A T above every trace's maxFiringT is useless (silent everywhere it matters).
    const firingUB = Math.min(
      ...withDurable.filter((f) => f.maxFiringT !== null).map((f) => f.maxFiringT!)
    );
    console.log(
      `  --> traces reaching the bar: ${withDurable.length}/${traces.length}; ` +
        `no-safe-T traces: ${unsafeTraces.length}` +
        (unsafeTraces.length ? ` (${unsafeTraces.map((f) => f.traceId).join(', ')})` : '')
    );
    if (unsafeTraces.length === 0) {
      console.log(
        `  --> SAFE-T INTERSECTION: [${safeLB.toFixed(3)}, 1.0]; fires on every bar-reaching trace only up to T=${firingUB.toFixed(
          3
        )} --> usable window ${
          safeLB <= firingUB ? `[${safeLB.toFixed(3)}, ${firingUB.toFixed(3)}]` : 'EMPTY'
        }`
      );
    } else {
      console.log('  --> SAFE-T INTERSECTION: EMPTY (at least one trace has no safe T)');
    }
    console.log('');
  }

  // ---- Within-trace vs cross-trace correlation ----
  // The discriminating question behind every empty window above: is `accuracy` uncorrelated
  // with ranking quality outright, or is it well-behaved WITHIN a session and merely
  // incomparable ACROSS sessions? The second is the same failure Candidate A1 had (a quantity
  // with no common scale between users); the first would be a deeper defect in the metric.
  console.log('=== ACCURACY vs RANKING QUALITY: within-trace correlation ===');
  console.log('  trace | Spearman(acc, tauVsTrue) | Spearman(acc, tauVsFinal) | n');
  const withinRhos: number[] = [];
  for (const t of traces) {
    const acc = t.rows.map((r) => r.accuracy);
    const tauT = t.rows.map((r) => r.tauVsTrue);
    const tauF = t.rows.map((r) => r.tauVsFinal);
    const rhoTrue = tauT[0] === null ? null : spearman(acc, tauT as number[]);
    const rhoFinal = spearman(acc, tauF);
    if (rhoTrue !== null) withinRhos.push(rhoTrue);
    console.log(
      `  ${t.id.padEnd(30)} | ${rhoTrue === null ? '   n/a' : rhoTrue.toFixed(3).padStart(6)} | ${rhoFinal
        .toFixed(3)
        .padStart(6)} | ${t.rows.length}`
    );
  }
  const medWithin = [...withinRhos].sort((a, b) => a - b)[Math.floor(withinRhos.length / 2)];
  console.log(`  median within-trace Spearman(acc, tauVsTrue) = ${medWithin.toFixed(3)}\n`);

  // Cross-trace: pool every (accuracy, tau) point from every ORACLE trace (the ones with real
  // ground truth) and correlate. If within-trace rho is high but pooled rho collapses, the
  // metric measures progress but not level — exactly the incomparability problem.
  const pooledAcc: number[] = [];
  const pooledTau: number[] = [];
  for (const t of traces) {
    if (t.kind !== 'oracle') continue;
    for (const r of t.rows) {
      if (r.tauVsTrue === null) continue;
      pooledAcc.push(r.accuracy);
      pooledTau.push(r.tauVsTrue);
    }
  }
  console.log('=== ACCURACY vs RANKING QUALITY: pooled across oracles ===');
  console.log(
    `  Spearman(acc, tauVsTrue) over all ${pooledAcc.length} oracle rounds = ${spearman(
      pooledAcc,
      pooledTau
    ).toFixed(3)}\n`
  );

  // ---- What quality do the CURRENT constants actually buy? ----
  console.log('=== QUALITY AT THE CURRENT CONSTANTS (task 5) ===');
  for (const [tierName, T] of [
    ['Medium', SCORE_SPREAD_MEDIUM_THRESHOLD],
    ['High', SCORE_SPREAD_HIGH_THRESHOLD],
    ['VeryHigh', SCORE_SPREAD_VERY_HIGH_THRESHOLD],
  ] as [string, number][]) {
    console.log(`  --- ${tierName} (T=${T}) ---`);
    console.log('    trace | crossesAt | tauVsTrue there | symdiffVsTrue there | tauVsFinal there');
    const tausAtCross: number[] = [];
    for (const t of traces) {
      const cross = firstCross(t, T);
      if (cross === null) {
        console.log(`    ${t.id.padEnd(30)} | never`);
        continue;
      }
      const row = t.rows.find((r) => r.round === cross)!;
      if (row.tauVsTrue !== null) tausAtCross.push(row.tauVsTrue);
      console.log(
        `    ${t.id.padEnd(30)} | ${String(cross).padStart(3)} | ${(row.tauVsTrue ?? NaN)
          .toFixed(4)
          .padStart(
            7
          )} | ${String(row.symDiffVsTrue ?? '-').padStart(3)} | ${row.tauVsFinal.toFixed(4)}`
      );
    }
    if (tausAtCross.length) {
      const s = [...tausAtCross].sort((a, b) => a - b);
      console.log(
        `    --> tauVsTrue at crossing across oracles: min ${s[0].toFixed(3)}, median ${s[
          Math.floor(s.length / 2)
        ].toFixed(3)}, max ${s[s.length - 1].toFixed(3)}`
      );
    }
    console.log('');
  }

  // ---- Ground-truth determinacy: is the "true top-10" even well defined per oracle? ----
  // #2 was already flagged in the escalation-signal diagnostic as never reaching its true
  // top-10. #10's ground truth is itself a solved (and known-flat) real session, so its true
  // ordering may be heavily tied — in which case symdiff-vs-true measures tie-break luck.
  console.log('=== GROUND-TRUTH DETERMINACY per oracle (does a unique true top-10 exist?) ===');
  console.log('    oracle | distinct GT scores /200 | GT profiles tied at the top-10 boundary');
  for (const t of traces) {
    if (t.kind !== 'oracle') continue;
    const id = Number(t.id.match(/#(\d+)/)![1]);
    const gtScores = scoreAll(ORACLE_GT[id], pool);
    const distinct = new Set(gtScores.map((s) => s.toFixed(9))).size;
    const sorted = [...gtScores].sort((a, b) => b - a);
    const cutoff = sorted[9];
    const tiedAtBoundary = gtScores.filter((s) => Math.abs(s - cutoff) < TIE_EPS).length;
    console.log(
      `    ${t.id.padEnd(30)} | ${String(distinct).padStart(3)} | ${tiedAtBoundary}${
        tiedAtBoundary > 1 ? '  <-- true top-10 NOT unique' : ''
      }`
    );
  }
  console.log('');

  // ---- Derived CSV ----
  const csvLines = [
    'trace,kind,round,accuracy,tier,degree,avg_coverage_width,tau_vs_true,symdiff_vs_true,tau_vs_final,symdiff_vs_final,tau_vs_prev,symdiff_vs_prev',
  ];
  for (const t of traces) {
    for (const r of t.rows) {
      csvLines.push(
        [
          t.id,
          t.kind,
          r.round,
          r.accuracy.toFixed(6),
          r.tier,
          r.degree,
          r.avgCoverageWidth.toFixed(6),
          r.tauVsTrue === null ? '' : r.tauVsTrue.toFixed(6),
          r.symDiffVsTrue === null ? '' : r.symDiffVsTrue,
          r.tauVsFinal.toFixed(6),
          r.symDiffVsFinal,
          r.tauVsPrev === null ? '' : r.tauVsPrev.toFixed(6),
          r.symDiffVsPrev === null ? '' : r.symDiffVsPrev,
        ].join(',')
      );
    }
  }
  const outPath = path.join(DOCS, 'accuracy-threshold-recalibration-2026-08-17.csv');
  fs.writeFileSync(outPath, csvLines.join('\n') + '\n');
  console.log(`CSV written: ${outPath} (${csvLines.length - 1} rows)`);

  fs.writeFileSync(
    path.join(DOCS, 'accuracy-threshold-recalibration-fits-2026-08-17.json'),
    JSON.stringify({ churn, fits: fitOut }, null, 2) + '\n'
  );
  console.log('=== DONE ===');
}

main();
