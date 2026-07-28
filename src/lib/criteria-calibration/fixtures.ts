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
