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
import { profileDegree, profileKey } from './preferenceGraph.js';

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
