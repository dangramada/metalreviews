// Shared test/debug fixture for the preference graph. Not part of the production module —
// imported only by unit tests and the debug script, so the notation-driven, self-consistent
// fixture-building logic doesn't get duplicated between the two.
//
// The round-count shape (20 rounds at degree 2, 7 at degree 3, 2 at degree 4, 2 at degree 5)
// mirrors a real historical elicitation session's shape. That session used a 5-criterion
// model; here it's used purely to exercise the algorithm's correctness against a realistic
// degree ramp, generated against the current 6-criterion/5-level production shape — it is
// NOT real production data.

import type { ComparisonResult, Profile } from './preferenceGraph.js';
import { profileDegree, profileFromNotation, profileKey } from './preferenceGraph.js';

export interface HistoricalRound {
  degree: number;
  profileA: Profile;
  profileB: Profile;
  result: ComparisonResult;
}

export interface FixtureConfig {
  numCriteria: number;
  levelsPerCriterion: number;
  /** Round count per degree, processed in ascending degree order (the elicitation ramp). */
  roundsByDegree: Record<number, number>;
  /**
   * Distinct-profile pool size per degree. Rounds within a degree draw both profiles from
   * this pool (with replacement across rounds), so profiles repeat across rounds — that
   * repetition is what creates genuine transitive chains for the closure to exploit.
   */
  poolSizeByDegree: Record<number, number>;
  seed?: number;
}

export const DEFAULT_FIXTURE_CONFIG: FixtureConfig = {
  numCriteria: 6,
  levelsPerCriterion: 5,
  roundsByDegree: { 2: 20, 3: 7, 4: 2, 5: 2 },
  poolSizeByDegree: { 2: 8, 3: 6, 4: 5, 5: 4 },
  seed: 42,
};

/** Small deterministic PRNG (LCG) so the fixture is reproducible across runs. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomProfile(
  rng: () => number,
  degree: number,
  numCriteria: number,
  levelsPerCriterion: number
): Profile {
  const indices = Array.from({ length: numCriteria }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const chosen = indices.slice(0, degree);
  const profile: Record<number, number> = {};
  for (const idx of chosen) {
    profile[idx] = 1 + Math.floor(rng() * levelsPerCriterion);
  }
  return profile;
}

/** Ground truth for the fixture: sum of assigned levels. Total-ordered, so comparisons
 * generated from it are guaranteed internally consistent (never contradictory) regardless
 * of which criteria happen to be present on either side. */
function profileValue(profile: Profile): number {
  return Object.values(profile).reduce((sum, level) => sum + level, 0);
}

function buildPool(
  rng: () => number,
  degree: number,
  size: number,
  numCriteria: number,
  levelsPerCriterion: number
): Profile[] {
  const pool: Profile[] = [];
  const seenKeys = new Set<string>();
  let attempts = 0;
  while (pool.length < size && attempts < size * 50) {
    attempts++;
    const candidate = randomProfile(rng, degree, numCriteria, levelsPerCriterion);
    const key = profileKey(candidate);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    pool.push(candidate);
  }
  return pool;
}

export function buildHistoricalFixture(
  config: FixtureConfig = DEFAULT_FIXTURE_CONFIG
): HistoricalRound[] {
  const rng = createRng(config.seed ?? 42);
  const rounds: HistoricalRound[] = [];

  const degrees = Object.keys(config.roundsByDegree)
    .map(Number)
    .sort((a, b) => a - b);

  for (const degree of degrees) {
    const roundCount = config.roundsByDegree[degree];
    const poolSize = config.poolSizeByDegree[degree] ?? Math.max(4, degree + 2);
    const pool = buildPool(rng, degree, poolSize, config.numCriteria, config.levelsPerCriterion);

    for (let i = 0; i < roundCount; i++) {
      const a = pool[Math.floor(rng() * pool.length)];
      let b = pool[Math.floor(rng() * pool.length)];
      let guard = 0;
      while (profileKey(a) === profileKey(b) && guard < 20) {
        b = pool[Math.floor(rng() * pool.length)];
        guard++;
      }

      const valueA = profileValue(a);
      const valueB = profileValue(b);
      let result: ComparisonResult;
      if (valueA === valueB) result = 'equal';
      else result = valueA > valueB ? 'A' : 'B';

      rounds.push({ degree: profileDegree(a), profileA: a, profileB: b, result });
    }
  }

  return rounds;
}

// ---------------------------------------------------------------------------------------
// Real historical session (part 2 acceptance fixture) — an actual complete 1000minds-style
// export supplied by Dan, NOT synthetic. Criterion order for this fixture (fixed, one
// character position each, per the part-2 brief): Musical innovation, Emotional
// impact/atmosphere, Instrumental+Vocal performance, Album coherence, Versatility — an
// earlier 5-criterion version of the model, distinct from part 1's current 6-criterion
// production domain. Do not map this onto the 6 production criteria; it exists purely as
// a real, complete correctness fixture for the solver.
//
// Session ran two sittings: 18 July 22:00-22:33, resumed 22 July 20:49-20:51 (reproduced
// below via `sessionGapAfterRound`, in case a future consumer cares about the timing gap;
// order alone is sufficient for solver correctness).
// ---------------------------------------------------------------------------------------

export const REAL_SESSION_LEVELS_PER_CRITERION = [5, 5, 5, 5, 5];

/** Round index (1-based) after which the two-day gap occurred; rounds 1-29 were 18 July, 30-31 were 22 July. */
export const REAL_SESSION_GAP_AFTER_ROUND = 29;

export interface RealSessionRound {
  profileA: Profile;
  profileB: Profile;
  result: ComparisonResult;
}

// [leftNotation, rightNotation, operator] — operator names the preferred side:
// '>' = left preferred, '<' = right preferred, '=' = indifferent.
const REAL_SESSION_RAW: [string, string, '>' | '<' | '='][] = [
  ['1-5--', '3-3--', '<'],
  ['3---3', '5---1', '>'],
  ['3-5--', '5-3--', '>'],
  ['-51--', '-15--', '>'],
  ['5--1-', '1--5-', '='],
  ['--5-1', '--1-3', '<'],
  ['31---', '13---', '='],
  ['-35--', '-51--', '>'],
  ['-33--', '-51--', '>'],
  ['--15-', '--33-', '<'],
  ['--1-5', '--3-3', '<'],
  ['--5-3', '--3-5', '>'],
  ['5---3', '3---5', '>'],
  ['-53--', '-35--', '>'],
  ['-3-3-', '-5-1-', '>'],
  ['-15--', '-31--', '='],
  ['--35-', '--53-', '>'],
  ['-3-5-', '-5-3-', '<'],
  ['-1--5', '-5--1', '='],
  ['--31-', '--13-', '>'],
  ['--331', '--115', '>'],
  ['1--33', '5--51', '<'],
  ['5-3-5', '3-5-3', '>'],
  ['--313', '--135', '='],
  ['-5-33', '-3-55', '>'],
  ['51-5-', '15-3-', '='],
  ['-333-', '-515-', '>'],
  ['-3331', '-5115', '>'],
  ['3-315', '5-133', '>'],
  ['11333', '33511', '<'],
  ['55115', '33331', '<'],
];

// ---------------------------------------------------------------------------------------
// n=42 numerical-blowup regression fixture (Big-M -> two-phase simplex rewrite, 2026-08-09,
// see docs/decisions/two-phase-simplex-rewrite.md). Regenerated deterministically by
// driving `nextAction` for 42 rounds against the REAL_SESSION_* value table as a
// complete-ground-truth oracle (identical method to elicitationDriver.test.ts's
// "oracle-based simulation" describe block) — NOT hand-authored, NOT the 31-answer
// REAL_SESSION_RAW sequence. Confirmed (before the two-phase rewrite) to reproduce the
// diagnostic's failure: totalSlack === 0 (fully consistent, so genuinely feasible) but
// computeChebyshevCenter's Big-M solveLP call returned `feasible: true` with `point`
// values up to ~1.16e14 — garbage silently reported as valid. Uses
// REAL_SESSION_LEVELS_PER_CRITERION (5 criteria, 5 levels each) since it was generated
// against that fixture's oracle.
// ---------------------------------------------------------------------------------------

export const N42_REPRO_LEVELS_PER_CRITERION = REAL_SESSION_LEVELS_PER_CRITERION;

export const N42_REPRO_ANSWERS: RealSessionRound[] = [
  { profileA: { 0: 5, 1: 1 }, profileB: { 0: 1, 1: 5 }, result: 'B' },
  { profileA: { 0: 5, 2: 1 }, profileB: { 0: 1, 2: 5 }, result: 'A' },
  { profileA: { 0: 5, 3: 1 }, profileB: { 0: 1, 3: 5 }, result: 'equal' },
  { profileA: { 0: 5, 4: 1 }, profileB: { 0: 1, 4: 5 }, result: 'B' },
  { profileA: { 1: 5, 2: 1 }, profileB: { 1: 1, 2: 5 }, result: 'A' },
  { profileA: { 1: 5, 3: 1 }, profileB: { 1: 1, 3: 5 }, result: 'A' },
  { profileA: { 1: 5, 4: 1 }, profileB: { 1: 1, 4: 5 }, result: 'equal' },
  { profileA: { 2: 5, 3: 1 }, profileB: { 2: 1, 3: 5 }, result: 'B' },
  { profileA: { 2: 5, 4: 1 }, profileB: { 2: 1, 4: 5 }, result: 'B' },
  { profileA: { 3: 5, 4: 1 }, profileB: { 3: 1, 4: 5 }, result: 'B' },
  { profileA: { 1: 3, 4: 3 }, profileB: { 1: 2, 4: 4 }, result: 'A' },
  { profileA: { 0: 4, 4: 2 }, profileB: { 0: 3, 4: 3 }, result: 'B' },
  { profileA: { 1: 4, 4: 3 }, profileB: { 1: 3, 4: 4 }, result: 'A' },
  { profileA: { 0: 3, 1: 4 }, profileB: { 0: 2, 1: 5 }, result: 'A' },
  { profileA: { 0: 3, 3: 3 }, profileB: { 0: 4, 3: 2 }, result: 'A' },
  { profileA: { 3: 4, 4: 4 }, profileB: { 3: 3, 4: 5 }, result: 'A' },
  { profileA: { 0: 4, 3: 4 }, profileB: { 0: 3, 3: 5 }, result: 'equal' },
  { profileA: { 0: 4, 2: 5 }, profileB: { 0: 5, 2: 4 }, result: 'equal' },
  { profileA: { 0: 3, 2: 5 }, profileB: { 0: 4, 2: 4 }, result: 'B' },
  { profileA: { 1: 4, 4: 2 }, profileB: { 1: 2, 4: 4 }, result: 'A' },
  { profileA: { 0: 5, 2: 2 }, profileB: { 0: 4, 2: 3 }, result: 'B' },
  { profileA: { 0: 2, 2: 1 }, profileB: { 0: 1, 2: 2 }, result: 'A' },
  { profileA: { 0: 3, 4: 1 }, profileB: { 0: 2, 4: 2 }, result: 'B' },
  { profileA: { 1: 4, 4: 4 }, profileB: { 1: 5, 4: 3 }, result: 'B' },
  { profileA: { 0: 4, 3: 2 }, profileB: { 0: 2, 3: 4 }, result: 'B' },
  { profileA: { 1: 1, 3: 4 }, profileB: { 1: 2, 3: 3 }, result: 'B' },
  { profileA: { 0: 3, 3: 2 }, profileB: { 0: 1, 3: 4 }, result: 'A' },
  { profileA: { 0: 2, 3: 3 }, profileB: { 0: 4, 3: 2 }, result: 'B' },
  { profileA: { 1: 3, 2: 2 }, profileB: { 1: 2, 2: 4 }, result: 'equal' },
  { profileA: { 2: 2, 4: 3 }, profileB: { 2: 1, 4: 4 }, result: 'A' },
  { profileA: { 0: 4, 1: 1 }, profileB: { 0: 1, 1: 4 }, result: 'B' },
  { profileA: { 0: 5, 3: 4 }, profileB: { 0: 3, 3: 5 }, result: 'equal' },
  { profileA: { 0: 3, 3: 1 }, profileB: { 0: 1, 3: 4 }, result: 'equal' },
  { profileA: { 0: 5, 2: 2 }, profileB: { 0: 3, 2: 5 }, result: 'B' },
  { profileA: { 1: 2, 3: 5 }, profileB: { 1: 4, 3: 3 }, result: 'B' },
  { profileA: { 0: 4, 2: 1 }, profileB: { 0: 2, 2: 4 }, result: 'B' },
  { profileA: { 2: 3, 4: 2 }, profileB: { 2: 1, 4: 3 }, result: 'A' },
  { profileA: { 1: 2, 2: 3 }, profileB: { 1: 3, 2: 2 }, result: 'B' },
  { profileA: { 1: 2, 4: 4 }, profileB: { 1: 3, 4: 2 }, result: 'A' },
  { profileA: { 0: 2, 4: 5 }, profileB: { 0: 4, 4: 2 }, result: 'A' },
  { profileA: { 1: 4, 3: 2 }, profileB: { 1: 5, 3: 1 }, result: 'A' },
  { profileA: { 2: 1, 3: 4 }, profileB: { 2: 3, 3: 2 }, result: 'B' },
];

export function buildRealSessionAnswers(): RealSessionRound[] {
  return REAL_SESSION_RAW.map(([leftNotation, rightNotation, op]) => {
    const profileA = profileFromNotation(leftNotation);
    const profileB = profileFromNotation(rightNotation);
    const result: ComparisonResult = op === '>' ? 'A' : op === '<' ? 'B' : 'equal';
    return { profileA, profileB, result };
  });
}

/** Expected per-level values from the real export, index 0 unused, index = level (1-based). */
export const REAL_SESSION_EXPECTED_VALUES: number[][] = [
  [0, 0, 0.111299038, 0.173111428, 0.182876617, 0.18591551], // Musical innovation
  [0, 0, 0.096976027, 0.173111428, 0.210710272, 0.227528776], // Emotional impact / atmosphere
  [0, 0, 0.095524564, 0.153905306, 0.168553069, 0.173111428], // Instrumental + Vocal performance
  [0, 0, 0.081165604, 0.144302244, 0.17409873, 0.18591551], // Album coherence
  [0, 0, 0.142965436, 0.217925715, 0.225249603, 0.227528776], // Versatility
];

export interface RealSessionAlbum {
  name: string;
  levels: Profile; // all 5 criteria present
  expectedScore: number;
}

export const REAL_SESSION_ALBUMS: RealSessionAlbum[] = [
  {
    name: 'Shepherds of Cassini',
    levels: { 0: 4, 1: 5, 2: 4, 3: 3, 4: 4 },
    expectedScore: 0.9485103,
  },
  { name: 'Gazpacho', levels: { 0: 3, 1: 5, 2: 3, 3: 4, 4: 3 }, expectedScore: 0.94657 },
  {
    name: 'Sumac, Moor Mother',
    levels: { 0: 5, 1: 3, 2: 4, 3: 5, 4: 5 },
    expectedScore: 0.9410243,
  },
  { name: 'Cradle Of Filth', levels: { 0: 4, 1: 3, 2: 3, 3: 5, 4: 4 }, expectedScore: 0.9210585 },
  { name: 'Deafheaven', levels: { 0: 5, 1: 3, 2: 4, 3: 3, 4: 4 }, expectedScore: 0.8971319 },
  { name: 'Dormant Ordeal', levels: { 0: 4, 1: 4, 2: 5, 3: 2, 4: 5 }, expectedScore: 0.8753927 },
  { name: 'Novembers Doom', levels: { 0: 4, 1: 3, 2: 5, 3: 2, 4: 4 }, expectedScore: 0.8355147 },
  { name: 'Völur & Cares', levels: { 0: 3, 1: 4, 2: 4, 3: 1, 4: 4 }, expectedScore: 0.7776244 },
  { name: 'Paradise Lost', levels: { 0: 2, 1: 2, 2: 3, 3: 4, 4: 5 }, expectedScore: 0.7638079 },
  { name: 'Fleshvessel', levels: { 0: 3, 1: 2, 2: 2, 3: 2, 4: 5 }, expectedScore: 0.6743064 },
  { name: 'Haimad', levels: { 0: 3, 1: 4, 2: 2, 3: 4, 4: 1 }, expectedScore: 0.653445 },
  { name: 'Blackbride', levels: { 0: 1, 1: 4, 2: 2, 3: 5, 4: 2 }, expectedScore: 0.6351158 },
  { name: 'In Mourning', levels: { 0: 1, 1: 5, 2: 5, 3: 1, 4: 3 }, expectedScore: 0.6185659 },
  { name: 'Flummox', levels: { 0: 1, 1: 4, 2: 4, 3: 2, 4: 2 }, expectedScore: 0.6033944 },
  { name: 'Dissona', levels: { 0: 4, 1: 2, 2: 1, 3: 3, 4: 2 }, expectedScore: 0.5671203 },
  { name: 'Psychonaut', levels: { 0: 2, 1: 1, 2: 3, 3: 3, 4: 2 }, expectedScore: 0.552472 },
  {
    name: 'An Abstract Illusion',
    levels: { 0: 1, 1: 3, 2: 5, 3: 1, 4: 2 },
    expectedScore: 0.4891883,
  },
  { name: 'Steven Wilson', levels: { 0: 1, 1: 2, 2: 5, 3: 2, 4: 1 }, expectedScore: 0.3512531 },
  {
    name: 'Pillars of Cacophony',
    levels: { 0: 1, 1: 2, 2: 4, 3: 1, 4: 1 },
    expectedScore: 0.2655291,
  },
];

// ---------------------------------------------------------------------------------------
// Real production session (joint-point-estimate fix, 2026-08-09) — Dan's own account
// (eec42cd4-e714-46a2-ad9c-35714a1d3a2c), pulled read-only from user_calibration_answers on
// the current 6-criteria/5-level production model. This is the sparse 33-answer session
// documented in docs/decisions/deferred-work.md (the levels-2-5-flatness diagnostic) and in
// docs/decisions/criteria-calibration-joint-point-estimate.md (the 1.308 normalization-sum
// bug this fixture regression-tests). Single-user project, Dan's own data — fine to embed
// directly per his explicit sign-off, no separate anonymization needed.
// ---------------------------------------------------------------------------------------

export const REAL_PRODUCTION_SESSION_LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];

export const REAL_PRODUCTION_SESSION_ANSWERS: RealSessionRound[] = [
  { profileA: { 0: 5, 1: 1 }, profileB: { 0: 1, 1: 5 }, result: 'A' },
  { profileA: { 0: 5, 2: 1 }, profileB: { 0: 1, 2: 5 }, result: 'A' },
  { profileA: { 0: 5, 3: 1 }, profileB: { 0: 1, 3: 5 }, result: 'A' },
  { profileA: { 0: 5, 4: 1 }, profileB: { 0: 1, 4: 5 }, result: 'A' },
  { profileA: { 0: 5, 5: 1 }, profileB: { 0: 1, 5: 5 }, result: 'A' },
  { profileA: { 1: 5, 2: 1 }, profileB: { 1: 1, 2: 5 }, result: 'A' },
  { profileA: { 1: 5, 3: 1 }, profileB: { 1: 1, 3: 5 }, result: 'A' },
  { profileA: { 1: 5, 4: 1 }, profileB: { 1: 1, 4: 5 }, result: 'A' },
  { profileA: { 1: 5, 5: 1 }, profileB: { 1: 1, 5: 5 }, result: 'A' },
  { profileA: { 2: 5, 3: 1 }, profileB: { 2: 1, 3: 5 }, result: 'A' },
  { profileA: { 2: 5, 4: 1 }, profileB: { 2: 1, 4: 5 }, result: 'A' },
  { profileA: { 2: 5, 5: 1 }, profileB: { 2: 1, 5: 5 }, result: 'A' },
  { profileA: { 3: 5, 4: 1 }, profileB: { 3: 1, 4: 5 }, result: 'A' },
  { profileA: { 3: 5, 5: 1 }, profileB: { 3: 1, 5: 5 }, result: 'A' },
  { profileA: { 4: 5, 5: 1 }, profileB: { 4: 1, 5: 5 }, result: 'A' },
  { profileA: { 0: 4, 4: 3 }, profileB: { 0: 2, 4: 3 }, result: 'A' },
  { profileA: { 0: 5, 2: 3 }, profileB: { 0: 5, 2: 4 }, result: 'B' },
  { profileA: { 0: 4, 3: 4 }, profileB: { 0: 2, 3: 5 }, result: 'A' },
  { profileA: { 1: 4, 5: 3 }, profileB: { 1: 2, 5: 5 }, result: 'A' },
  { profileA: { 3: 2, 5: 5 }, profileB: { 3: 4, 5: 4 }, result: 'B' },
  { profileA: { 0: 3, 3: 2 }, profileB: { 0: 2, 3: 3 }, result: 'B' },
  { profileA: { 0: 4, 3: 2 }, profileB: { 0: 2, 3: 4 }, result: 'B' },
  { profileA: { 1: 2, 4: 5 }, profileB: { 1: 3, 4: 3 }, result: 'B' },
  { profileA: { 1: 3, 2: 2 }, profileB: { 1: 2, 2: 4 }, result: 'B' },
  { profileA: { 1: 5, 2: 2 }, profileB: { 1: 3, 2: 4 }, result: 'A' },
  { profileA: { 0: 2, 3: 3 }, profileB: { 0: 4, 3: 2 }, result: 'A' },
  { profileA: { 3: 3, 4: 3 }, profileB: { 3: 5, 4: 2 }, result: 'A' },
  { profileA: { 3: 5, 5: 4 }, profileB: { 3: 3, 5: 5 }, result: 'A' },
  { profileA: { 1: 4, 4: 3 }, profileB: { 1: 5, 4: 2 }, result: 'A' },
  { profileA: { 1: 3, 2: 5 }, profileB: { 1: 4, 2: 2 }, result: 'B' },
  { profileA: { 2: 3, 4: 4 }, profileB: { 2: 4, 4: 2 }, result: 'A' },
  { profileA: { 1: 2, 5: 5 }, profileB: { 1: 3, 5: 4 }, result: 'B' },
  { profileA: { 0: 2, 5: 5 }, profileB: { 0: 4, 5: 2 }, result: 'B' },
];

// ---------------------------------------------------------------------------------------
// Degree-escalation anomaly regression fixture (2026-08-11) — Dan's own account
// (eec42cd4-e714-46a2-ad9c-35714a1d3a2c), pulled read-only from user_calibration_answers:
// the live, active ranking-stability test session (post-Brief-1-reset, in progress). Frozen
// snapshot at 31 answers, matching the session's state after Dan's Undo — same convention as
// REAL_PRODUCTION_SESSION_ANSWERS above (hardcoded, not regenerated). This is the session
// that surfaced the isDegreeCoverageComplete degree-scoping bug: elicitationDriver.test.ts's
// degree-escalation regression test adds ONE supplemental answer on top of this fixture (the
// actual next degree-2 question the driver itself offers at this state — not fabricated) to
// reach the 32-answer coverage-complete moment Dan actually hit. Pre-fix, that moment made
// nextAction report degree-exhausted/coverage-complete simultaneously at every degree from 2
// through 6 (confirmed via a live diagnostic replay, not asserted); the fix scopes touch
// counts to the degree being checked — see docs/decisions/criteria-calibration-degree-scoped-coverage-fix.md.
// ---------------------------------------------------------------------------------------

export const DEGREE_ANOMALY_SESSION_LEVELS_PER_CRITERION = [5, 5, 5, 5, 5, 5];

export const DEGREE_ANOMALY_SESSION_ANSWERS: RealSessionRound[] = [
  { profileA: { 0: 5, 1: 1 }, profileB: { 0: 1, 1: 5 }, result: 'B' },
  { profileA: { 0: 5, 2: 1 }, profileB: { 0: 1, 2: 5 }, result: 'equal' },
  { profileA: { 0: 5, 3: 1 }, profileB: { 0: 1, 3: 5 }, result: 'A' },
  { profileA: { 0: 5, 4: 1 }, profileB: { 0: 1, 4: 5 }, result: 'equal' },
  { profileA: { 0: 5, 5: 1 }, profileB: { 0: 1, 5: 5 }, result: 'A' },
  { profileA: { 1: 5, 2: 1 }, profileB: { 1: 1, 2: 5 }, result: 'A' },
  { profileA: { 1: 5, 3: 1 }, profileB: { 1: 1, 3: 5 }, result: 'A' },
  { profileA: { 1: 5, 4: 1 }, profileB: { 1: 1, 4: 5 }, result: 'equal' },
  { profileA: { 1: 5, 5: 1 }, profileB: { 1: 1, 5: 5 }, result: 'B' },
  { profileA: { 2: 5, 3: 1 }, profileB: { 2: 1, 3: 5 }, result: 'A' },
  { profileA: { 2: 5, 4: 1 }, profileB: { 2: 1, 4: 5 }, result: 'B' },
  { profileA: { 2: 5, 5: 1 }, profileB: { 2: 1, 5: 5 }, result: 'equal' },
  { profileA: { 3: 5, 4: 1 }, profileB: { 3: 1, 4: 5 }, result: 'B' },
  { profileA: { 3: 5, 5: 1 }, profileB: { 3: 1, 5: 5 }, result: 'B' },
  { profileA: { 4: 5, 5: 1 }, profileB: { 4: 1, 5: 5 }, result: 'B' },
  { profileA: { 1: 4, 5: 3 }, profileB: { 1: 3, 5: 4 }, result: 'A' },
  { profileA: { 4: 4, 5: 2 }, profileB: { 4: 2, 5: 4 }, result: 'B' },
  { profileA: { 4: 3, 5: 2 }, profileB: { 4: 2, 5: 3 }, result: 'equal' },
  { profileA: { 2: 3, 4: 4 }, profileB: { 2: 4, 4: 3 }, result: 'B' },
  { profileA: { 0: 3, 3: 3 }, profileB: { 0: 4, 3: 2 }, result: 'B' },
  { profileA: { 1: 2, 5: 5 }, profileB: { 1: 3, 5: 4 }, result: 'B' },
  { profileA: { 0: 3, 1: 4 }, profileB: { 0: 2, 1: 5 }, result: 'A' },
  { profileA: { 0: 3, 2: 3 }, profileB: { 0: 2, 2: 4 }, result: 'A' },
  { profileA: { 0: 4, 1: 2 }, profileB: { 0: 2, 1: 4 }, result: 'B' },
  { profileA: { 4: 4, 5: 1 }, profileB: { 4: 2, 5: 3 }, result: 'B' },
  { profileA: { 1: 2, 2: 1 }, profileB: { 1: 1, 2: 2 }, result: 'B' },
  { profileA: { 1: 1, 5: 5 }, profileB: { 1: 4, 5: 2 }, result: 'B' },
  { profileA: { 4: 2, 5: 4 }, profileB: { 4: 1, 5: 5 }, result: 'A' },
  { profileA: { 2: 4, 4: 4 }, profileB: { 2: 5, 4: 3 }, result: 'A' },
  { profileA: { 0: 4, 4: 2 }, profileB: { 0: 3, 4: 3 }, result: 'A' },
  { profileA: { 2: 2, 3: 2 }, profileB: { 2: 1, 3: 3 }, result: 'A' },
];

// ---------------------------------------------------------------------------------------
// Pass 4 ranking-stability fixture (Brief 3, rankingStabilitySignal.ts) — Dan's own account,
// 71-answer session, 2026-08-10 through 2026-08-12. Frozen directly from the raw
// `docs/decisions/backups/ranking-stability-log-2026-08-1{0,1,2}.jsonl` snapshots (gitignored,
// not committed — this export is the committed record of them), same convention as
// REAL_PRODUCTION_SESSION_ANSWERS above. Each entry is one logged checkpoint: `answerCount`,
// the accuracy tier at that checkpoint (thresholds from accuracyTiers.ts, applied at
// extraction time), and the top-10 albumId set (by score, from RANKING_TEST_SET's 13 albums)
// at that checkpoint. `n=54` and `n=57` are excluded — both are silent pre-Dantzig
// Chebyshev-center degradations (all-13-albums-tied / accuracy=0), documented and root-caused
// in docs/decisions/criteria-calibration-ranking-stability-analysis.md's Pass 1 and Pass 3
// "second discard" note; not real signal, and the bug that produced them no longer exists
// post-Dantzig-fix (see criteria-calibration-dantzig-fix.md).
//
// This is the exact data backing Pass 4's original result: tier-gated K=2 fired at n=39.
// HISTORICAL ONLY as of the duration-based window replacing K=2 (see
// docs/decisions/criteria-calibration-fine-grained-firing-instability.md) — this fixture's
// every-3rd-sample retrospective granularity is exactly what that finding showed is
// unreliable for verifying a firing point (Pass 4's own n=39 estimate turned out to differ
// from the real fine-grained result), so rankingStabilitySignal.test.ts no longer asserts an
// exact firing point against it. Kept as the evidentiary record backing
// criteria-calibration-ranking-stability-analysis.md, same convention as
// REAL_PRODUCTION_SESSION_ANSWERS above.
// ---------------------------------------------------------------------------------------

export interface RankingStabilityCheckpoint {
  answerCount: number;
  tier: 'insufficient' | 'high' | 'veryHigh';
  top10: string[];
}

export const PASS4_RANKING_STABILITY_CHECKPOINTS: RankingStabilityCheckpoint[] = [
  {
    answerCount: 3,
    tier: 'insufficient',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '2cb7d5e6-de25-45f7-9e35-f64c8fd41321',
    ],
  },
  {
    answerCount: 6,
    tier: 'insufficient',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '2cb7d5e6-de25-45f7-9e35-f64c8fd41321',
    ],
  },
  {
    answerCount: 9,
    tier: 'insufficient',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '2cb7d5e6-de25-45f7-9e35-f64c8fd41321',
    ],
  },
  {
    answerCount: 12,
    tier: 'insufficient',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '2cb7d5e6-de25-45f7-9e35-f64c8fd41321',
    ],
  },
  {
    answerCount: 15,
    tier: 'insufficient',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '2cb7d5e6-de25-45f7-9e35-f64c8fd41321',
    ],
  },
  {
    answerCount: 18,
    tier: 'insufficient',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '2cb7d5e6-de25-45f7-9e35-f64c8fd41321',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
    ],
  },
  {
    answerCount: 21,
    tier: 'insufficient',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '2cb7d5e6-de25-45f7-9e35-f64c8fd41321',
    ],
  },
  {
    answerCount: 24,
    tier: 'insufficient',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '9867b457-c406-4955-8576-b692a26555f0',
      '2cb7d5e6-de25-45f7-9e35-f64c8fd41321',
    ],
  },
  {
    answerCount: 27,
    tier: 'high',
    top10: [
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  {
    answerCount: 30,
    tier: 'high',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '2cb7d5e6-de25-45f7-9e35-f64c8fd41321',
    ],
  },
  {
    answerCount: 33,
    tier: 'high',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  {
    answerCount: 36,
    tier: 'high',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '9867b457-c406-4955-8576-b692a26555f0',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
    ],
  },
  {
    answerCount: 39,
    tier: 'high',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  {
    answerCount: 42,
    tier: 'high',
    top10: [
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  {
    answerCount: 45,
    tier: 'high',
    top10: [
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  {
    answerCount: 48,
    tier: 'high',
    top10: [
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  {
    answerCount: 51,
    tier: 'high',
    top10: [
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  // n=54, n=57 excluded — see header note.
  {
    answerCount: 60,
    tier: 'veryHigh',
    top10: [
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  {
    answerCount: 63,
    tier: 'veryHigh',
    top10: [
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  {
    answerCount: 66,
    tier: 'veryHigh',
    top10: [
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
  {
    answerCount: 69,
    tier: 'veryHigh',
    top10: [
      '29fd11cd-a3cf-4ead-a1d7-311dd6b8e0cf',
      '8107a1c4-56f7-481c-87ad-c3025320316e',
      '28d4eb6e-90da-46f4-a0f0-3d3343a49ba3',
      'e44ffad1-8763-48b6-819d-5d2c6df576c6',
      '74f55ca7-59df-45e6-9b98-ddd52bd27669',
      '2af5876e-26eb-4fdf-910f-dc48657c5959',
      '315c9dd2-fbc9-4c8c-bc7c-a4a37614dc84',
      '422f34a7-7ed9-4d62-a5df-8da3ca6e25e3',
      'f53bda1f-a118-4ee7-be66-69a82b211914',
      '9867b457-c406-4955-8576-b692a26555f0',
    ],
  },
];
