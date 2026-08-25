// Normalized coverage-width diagnostic (2026-08-25) — READ-ONLY analysis, no Supabase, no
// production module imported, no live constant changed.
//
// QUESTION (brief, 2026-08-25): `isDegreeCoverageComplete` calls a free (criterion, level)
// variable "covered" when its feasible width drops below an ABSOLUTE
// MAX_VALUE_RANGE_FOR_COVERAGE = 0.2 on a 0..1 scale. Four synthetic preference shapes
// (#2 single-dominant, #4 linear-control, #5 front-loaded, #6 back-loaded) reach touched = 24/24
// but never narrow = 24/24 inside 90 answers, so they never leave the base rung
// (criteria-calibration-degree-tiers-and-progress.md §2d). Is that because those shapes simply
// live on a different natural width SCALE — i.e. does a NORMALIZED width plus a threshold exist
// such that (a) the 8 healthy traces still complete at a comparable round, and (b) all 4 stuck
// traces complete within their existing 90 answers?
//
// This is the same shape of question as criteria-calibration-accuracy-threshold-recalibration.md
// §6 and criteria-calibration-escalation-signal-candidates.md §6 (Candidate A, rejected because
// absolute coverage width "is not comparable across users"); the relative/normalized direction
// was named there as unexplored. Answer format is theirs: a threshold-window table with
// magnitudes, and a binary verdict.
//
// INPUT: normalized-coverage-widths-2026-08-25.csv, emitted by
// scripts/degree-tier-recon-2026-08-18.ts under RECON_EMIT_WIDTHS=1 — the per-variable feasible
// widths of the same 12-trajectory evidence set used throughout this cluster (oracles #1..#10 +
// real sessions A70/B71). Re-simulated, not recovered from the point-vector CSVs, because a
// solved point vector cannot carry feasible ranges (see that script's header).
//
// CAUSALITY CAVEAT (this is why the table has a `valid` column): the coverage rule is causal —
// a threshold that ends degree 2 earlier changes every question asked afterwards. So
// post-processing the widths of the 0.2-generated run is EXACT only up to each trace's first
// real gate-driven boundary:
//   * the 4 stuck oracles never escalate, so all 90 of their rounds are exact;
//   * A70/B71 replay a FIXED human answer log, so the gate cannot perturb them either — exact
//     throughout;
//   * the 6 healthy oracles are exact up to and including their real degree-2 boundary round,
//     and any candidate completing later than that is marked needs-resimulation rather than
//     being reported as a number.
// Stage 3b (full re-simulation under the candidate rule) is only worth paying for on thresholds
// that survive stage 3a. If no threshold survives, there is nothing to re-simulate.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '../docs/decisions/criteria-calibration');
const WIDTHS_CSV = path.join(DOCS, 'normalized-coverage-widths-2026-08-25.csv');
const RECON_CSV = path.join(DOCS, 'degree-tier-recon-2026-08-18.csv');

// The live gate's constant, copied (not imported) so this analysis stays a frozen record of what
// 0.2 did on 2026-08-25 even if the production value later moves.
const ABSOLUTE_THRESHOLD = 0.2;
const FREE_VARIABLE_COUNT = 24;

const STUCK_TRACES = [
  '#2 single-dominant',
  '#4 linear-control',
  '#5 front-loaded',
  '#6 back-loaded',
];

interface WidthRow {
  trace: string;
  round: number;
  degree: number;
  criterion: number;
  level: number;
  width: number;
  touched: boolean;
}

function readCsv(file: string): string[][] {
  return fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((line) => line.split(','));
}

function loadWidths(): WidthRow[] {
  const [, ...rows] = readCsv(WIDTHS_CSV);
  return rows.map((r) => ({
    trace: r[0],
    round: Number(r[1]),
    degree: Number(r[2]),
    criterion: Number(r[3]),
    level: Number(r[4]),
    width: Number(r[5]),
    touched: r[6] === '1',
  }));
}

/** The committed recon's own boundary rounds — the record this analysis must reproduce. */
interface ReconBoundary {
  trace: string;
  round: number;
  degree: number;
  reason: string;
}
function loadReconBoundaries(): ReconBoundary[] {
  const [header, ...rows] = readCsv(RECON_CSV);
  const iTrace = header.indexOf('trace');
  const iRound = header.indexOf('round');
  const iDegree = header.indexOf('degree');
  const iIsB = header.indexOf('is_boundary');
  const iReason = header.indexOf('boundary_reason');
  return rows
    .filter((r) => r[iIsB] === '1')
    .map((r) => ({
      trace: r[iTrace],
      round: Number(r[iRound]),
      degree: Number(r[iDegree]),
      reason: r[iReason],
    }));
}

// ---------------------------------------------------------------------------------------
// Per-trace, per-degree round index: round -> the 24 variable widths at that round.
// ---------------------------------------------------------------------------------------
type RoundVars = Map<number, WidthRow[]>; // round -> rows
interface Segment {
  trace: string;
  degree: number;
  rounds: number[]; // ascending
  byRound: RoundVars;
}

function buildSegments(rows: WidthRow[]): Segment[] {
  const map = new Map<string, Segment>();
  for (const r of rows) {
    const key = `${r.trace}||${r.degree}`;
    let seg = map.get(key);
    if (!seg) {
      seg = { trace: r.trace, degree: r.degree, rounds: [], byRound: new Map() };
      map.set(key, seg);
    }
    let bucket = seg.byRound.get(r.round);
    if (!bucket) {
      bucket = [];
      seg.byRound.set(r.round, bucket);
      seg.rounds.push(r.round);
    }
    bucket.push(r);
  }
  for (const seg of map.values()) seg.rounds.sort((a, b) => a - b);
  return [...map.values()];
}

const varKey = (r: { criterion: number; level: number }) => `${r.criterion}:${r.level}`;

/**
 * Width of each variable at the first round of THIS SEGMENT where it was touched at this degree.
 * Degree-scoped on purpose: the live gate's touch test is degree-scoped (the 2026-08-11 fix), so
 * "first touch" has to mean first touch at the degree being judged, or the denominator would be
 * borrowed from a degree whose coverage is not in question. For the four stuck traces this
 * distinction is moot — their whole 90 rounds are degree 2.
 */
function widthAtFirstTouch(seg: Segment): Map<string, number> {
  const out = new Map<string, number>();
  for (const round of seg.rounds) {
    for (const r of seg.byRound.get(round)!) {
      if (!r.touched) continue;
      if (!out.has(varKey(r))) out.set(varKey(r), r.width);
    }
  }
  return out;
}

type Candidate = 'absolute' | 'C1' | 'C2';

/** First round in this segment at which all 24 free variables are covered under the given rule,
 *  or null if never within the segment. */
function completionRound(
  seg: Segment,
  candidate: Candidate,
  threshold: number,
  firstTouch: Map<string, number>
): number | null {
  for (const round of seg.rounds) {
    const rows = seg.byRound.get(round)!;
    if (rows.length !== FREE_VARIABLE_COUNT) {
      throw new Error(
        `${seg.trace} d${seg.degree} r${round}: ${rows.length} variables, expected 24`
      );
    }
    // C2's denominator: the mean width across every variable touched AT THIS DEGREE this round.
    // Deliberately NOT "touched and not yet finished" — that reference is circular (which
    // variables count as finished is exactly what the threshold decides). The fixed-point
    // variant is C2b, run only if C2 shows signal.
    let denomC2 = 0;
    if (candidate === 'C2') {
      const touchedWidths = rows.filter((r) => r.touched).map((r) => r.width);
      if (touchedWidths.length === 0) continue;
      denomC2 = touchedWidths.reduce((a, b) => a + b, 0) / touchedWidths.length;
      if (denomC2 <= 0) continue; // fully pinned model: nothing to normalise against
    }
    let allCovered = true;
    for (const r of rows) {
      if (!r.touched) {
        allCovered = false;
        break;
      }
      let value: number;
      if (candidate === 'absolute') value = r.width;
      else if (candidate === 'C1') {
        const w0 = firstTouch.get(varKey(r));
        // A variable whose width was already 0 at first touch is trivially determined; treat it
        // as covered rather than dividing by zero.
        if (w0 === undefined || w0 <= 0) continue;
        value = r.width / w0;
      } else {
        value = r.width / denomC2;
      }
      if (!(value < threshold)) {
        allCovered = false;
        break;
      }
    }
    if (allCovered) return round;
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------
const rows = loadWidths();
const segments = buildSegments(rows);
const firstTouchBySeg = new Map<Segment, Map<string, number>>();
for (const seg of segments) firstTouchBySeg.set(seg, widthAtFirstTouch(seg));

const traces = [...new Set(rows.map((r) => r.trace))];
const lines: string[] = [];
const say = (s = '') => {
  lines.push(s);
  console.log(s);
};

// --- Section 2: coherence check against the committed record -----------------------------
say('## Coherence check — absolute 0.2 recomputed from the width CSV');
say();
const reconBoundaries = loadReconBoundaries();
const gateDriven = reconBoundaries.filter((b) => b.reason === 'coverage-complete');
say(
  `committed recon: ${reconBoundaries.length} boundaries, ${gateDriven.length} coverage-complete, ` +
    `${reconBoundaries.filter((b) => b.reason === 'pool-empty').length} pool-empty`
);
let mismatches = 0;
for (const b of gateDriven) {
  const seg = segments.find((s) => s.trace === b.trace && s.degree === b.degree);
  if (!seg) {
    say(`MISMATCH ${b.trace} d${b.degree}: no width rows`);
    mismatches++;
    continue;
  }
  const got = completionRound(seg, 'absolute', ABSOLUTE_THRESHOLD, firstTouchBySeg.get(seg)!);
  if (got !== b.round) {
    say(`MISMATCH ${b.trace} d${b.degree}: recon r${b.round}, recomputed ${got}`);
    mismatches++;
  }
}
say(
  mismatches === 0
    ? `ALL ${gateDriven.length} coverage-complete boundaries reproduce exactly.`
    : `${mismatches} MISMATCHES`
);
if (mismatches > 0) {
  fs.writeFileSync(
    path.join(DOCS, 'normalized-coverage-diagnostic-output-2026-08-25.txt'),
    lines.join('\n') + '\n'
  );
  throw new Error(
    'Coherence check failed — replay is not faithful; stopping before any conclusion.'
  );
}

// Reference round per trace at degree 2 under the live absolute gate (the "today" column).
const degree2 = (trace: string) => segments.find((s) => s.trace === trace && s.degree === 2)!;
const absoluteRef = new Map<string, number | null>();
/** absoluteRef is keyed by every trace, so a miss is a bug, not a legitimate absent value. */
const refFor = (trace: string): number | null => {
  if (!absoluteRef.has(trace)) throw new Error(`no absolute reference for ${trace}`);
  return absoluteRef.get(trace)!;
};
for (const trace of traces) {
  const seg = degree2(trace);
  absoluteRef.set(
    trace,
    completionRound(seg, 'absolute', ABSOLUTE_THRESHOLD, firstTouchBySeg.get(seg)!)
  );
}
say();
say('Degree-2 completion under the live absolute gate (reference column):');
for (const trace of traces) {
  const seg = degree2(trace);
  say(
    `  ${trace.padEnd(30)} rounds ${seg.rounds[0]}..${seg.rounds[seg.rounds.length - 1]}  ` +
      `absolute-0.2 completes at ${absoluteRef.get(trace) ?? 'never'}`
  );
}

// --- Section 3: threshold grids -----------------------------------------------------------
interface GridCell {
  candidate: Candidate;
  threshold: number;
  perTrace: Map<string, number | null>;
  stuckComplete: number;
  healthyComplete: number;
  worstEarly: number; // max (ref - candidate) over healthy traces, answers earlier than today
  needsResim: string[];
}

function runGrid(candidate: Candidate, thresholds: number[]): GridCell[] {
  const cells: GridCell[] = [];
  for (const threshold of thresholds) {
    const perTrace = new Map<string, number | null>();
    const needsResim: string[] = [];
    for (const trace of traces) {
      const seg = degree2(trace);
      const got = completionRound(seg, candidate, threshold, firstTouchBySeg.get(seg)!);
      perTrace.set(trace, got);
      // Validity of post-processing (see header): exact for the 4 stuck traces and for the two
      // real sessions; for the healthy oracles, only up to their real boundary round.
      const ref = refFor(trace);
      const isRealSession = trace === 'A70' || trace === 'B71';
      const isStuck = STUCK_TRACES.includes(trace);
      if (!isRealSession && !isStuck && ref !== null && got !== null && got > ref) {
        needsResim.push(trace);
      }
    }
    const stuckComplete = STUCK_TRACES.filter((t) => perTrace.get(t) !== null).length;
    const healthy = traces.filter((t) => !STUCK_TRACES.includes(t));
    const healthyComplete = healthy.filter((t) => perTrace.get(t) !== null).length;
    let worstEarly = 0;
    for (const t of healthy) {
      const ref = refFor(t);
      const got = perTrace.get(t) ?? null;
      if (ref !== null && got !== null) worstEarly = Math.max(worstEarly, ref - got);
    }
    cells.push({
      candidate,
      threshold,
      perTrace,
      stuckComplete,
      healthyComplete,
      worstEarly,
      needsResim,
    });
  }
  return cells;
}

const gridC1 = Array.from({ length: 49 }, (_, i) => Number(((i + 1) * 0.02).toFixed(2)));
// C2's grid runs to 5.00, past the brief's 2.00: the diagnostic below shows the stuck traces
// carry a worst-variable ratio of up to 4.66, so stopping at 2.00 would report "never" without
// saying how far away "ever" actually is. The extra range is reporting, not hope — see §6.
const gridC2 = Array.from({ length: 100 }, (_, i) => Number(((i + 1) * 0.05).toFixed(2)));

const csv = [
  'candidate,threshold,' +
    traces.join(',') +
    ',stuck_complete,healthy_complete,worst_early,needs_resim',
];
const allCells: GridCell[] = [];
for (const [candidate, grid] of [
  ['C1', gridC1],
  ['C2', gridC2],
] as [Candidate, number[]][]) {
  const cells = runGrid(candidate, grid);
  allCells.push(...cells);
  say();
  say(
    `## ${candidate} threshold grid (degree 2; "never" = not complete within the trace's rounds)`
  );
  say();
  say('| threshold | ' + traces.join(' | ') + ' | stuck 4 | healthy 8 | worst early |');
  say('| --- |' + traces.map(() => ' --- |').join('') + ' --- | --- | --- |');
  for (const c of cells) {
    const cellStrs = traces.map((t) => {
      const v = c.perTrace.get(t) ?? null;
      if (v === null) return 'never';
      const ref = refFor(t);
      if (ref === null || STUCK_TRACES.includes(t)) return `${v}`;
      const d = v - ref;
      return d === 0 ? `${v}` : `${v} (${d > 0 ? '+' : ''}${d})`;
    });
    say(
      `| ${c.threshold.toFixed(2)} | ${cellStrs.join(' | ')} | ${c.stuckComplete}/4 | ${c.healthyComplete}/8 | ${c.worstEarly} |`
    );
    csv.push(
      [
        candidate,
        c.threshold.toFixed(2),
        ...traces.map((t) => c.perTrace.get(t) ?? ''),
        c.stuckComplete,
        c.healthyComplete,
        c.worstEarly,
        c.needsResim.join(' '),
      ].join(',')
    );
  }
}

// --- Section 4: the window --------------------------------------------------------------
say();
say('## Threshold window');
say();
for (const tolerance of [0, 5, 10, 20]) {
  const surviving = allCells.filter(
    (c) => c.stuckComplete === 4 && c.healthyComplete === 8 && c.worstEarly <= tolerance
  );
  say(
    `tolerance "healthy trace may complete at most ${tolerance} answers earlier than today": ` +
      (surviving.length === 0
        ? 'EMPTY'
        : surviving.map((c) => `${c.candidate}@${c.threshold.toFixed(2)}`).join(', '))
  );
}
say();
say(
  'thresholds where all 4 stuck traces complete at all (ignoring the healthy side entirely): ' +
    (() => {
      const s = allCells.filter((c) => c.stuckComplete === 4);
      return s.length === 0
        ? 'NONE'
        : s.map((c) => `${c.candidate}@${c.threshold.toFixed(2)}`).join(', ');
    })()
);
say(
  'thresholds where all 8 healthy traces still complete: ' +
    (() => {
      const s = allCells.filter((c) => c.healthyComplete === 8);
      return s.length === 0
        ? 'NONE'
        : `${s.length} cells, ` +
            s.map((c) => `${c.candidate}@${c.threshold.toFixed(2)}`).join(', ');
    })()
);

// --- Section 6: why — the structure behind the empty window ------------------------------
say();
say("## Per-trace structure at each trace's last degree-2 round");
say();
say(
  '| trace | last round | touched 24/24 at | mean width | vars with C1 >= 0.98 | max C1 | max C2 | widest variable |'
);
say('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const trace of traces) {
  const seg = degree2(trace);
  const firstTouch = firstTouchBySeg.get(seg)!;
  const last = seg.rounds[seg.rounds.length - 1];
  const rowsAtLast = seg.byRound.get(last)!;
  const touchedWidths = rowsAtLast.filter((r) => r.touched).map((r) => r.width);
  const mean = touchedWidths.reduce((a, b) => a + b, 0) / touchedWidths.length;
  let maxC1 = 0;
  let stubborn = 0;
  let maxC2 = 0;
  let widest = rowsAtLast[0];
  for (const r of rowsAtLast) {
    const w0 = firstTouch.get(varKey(r));
    if (w0 !== undefined && w0 > 0) {
      const c1 = r.width / w0;
      maxC1 = Math.max(maxC1, c1);
      if (c1 >= 0.98) stubborn++;
    }
    maxC2 = Math.max(maxC2, r.width / mean);
    if (r.width > widest.width) widest = r;
  }
  const w0w = firstTouch.get(varKey(widest));
  // The round at which the degree-scoped touch test alone is satisfied — i.e. what the gate
  // would fire on if the width test were removed entirely. Reported because both candidates'
  // "unblocking" thresholds converge on exactly this round (see §6): a normalisation loose
  // enough to free the four stuck shapes has stopped measuring width at all.
  let touched24: number | string = 'never';
  for (const r of seg.rounds) {
    if (seg.byRound.get(r)!.every((v) => v.touched)) {
      touched24 = r;
      break;
    }
  }
  say(
    `| ${trace} | ${last} | ${touched24} | ${mean.toFixed(3)} | ${stubborn}/24 | ${maxC1.toFixed(3)} | ${maxC2.toFixed(2)} | ` +
      `c${widest.criterion}L${widest.level} w=${widest.width.toFixed(3)} (w at first touch ${w0w === undefined ? 'n/a' : w0w.toFixed(3)}) |`
  );
}

say();
say('Degenerate-threshold check — completion round under a threshold high enough that the width');
say('test can never fail (C1 > 1 accepts any variable that has not WIDENED since first touch;');
say("C2 at the stuck traces' own worst ratio, 3.35), vs the touched-only round:");
say();
say('| trace | touched 24/24 | C1 @ 1.01 | C2 @ 3.35 | absolute 0.2 (today) |');
say('| --- | --- | --- | --- | --- |');
for (const trace of traces) {
  const seg = degree2(trace);
  const ft = firstTouchBySeg.get(seg)!;
  let touched24: number | string = 'never';
  for (const r of seg.rounds) {
    if (seg.byRound.get(r)!.every((v) => v.touched)) {
      touched24 = r;
      break;
    }
  }
  say(
    `| ${trace} | ${touched24} | ${completionRound(seg, 'C1', 1.01, ft) ?? 'never'} | ` +
      `${completionRound(seg, 'C2', 3.35, ft) ?? 'never'} | ${absoluteRef.get(trace) ?? 'never'} |`
  );
}

fs.writeFileSync(
  path.join(DOCS, 'normalized-coverage-threshold-window-2026-08-25.csv'),
  csv.join('\n') + '\n'
);
fs.writeFileSync(
  path.join(DOCS, 'normalized-coverage-diagnostic-output-2026-08-25.txt'),
  lines.join('\n') + '\n'
);
