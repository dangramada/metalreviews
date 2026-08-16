// Score-spread accuracy: an alternative to `computeSolverAccuracy` (accuracyTiers.ts),
// which averages independent per-(criterion, level) feasible-range widths and was found
// (see docs/decisions/criteria-calibration/criteria-calibration-engine.md's "Part 4 finding") to be blind to
// real ranking improvement from degree-3+ answers — a degree-3 comparison's LP constraint
// ties three free variables together, narrowing a *combination* of them without
// necessarily narrowing any single axis, which an independent per-axis metric can't see.
//
// This metric instead measures, for a sample of profile pairs, how much
// `scoreProfile(A) - scoreProfile(B)` could still vary across the current feasible LP
// region (two extra `solveLP` calls per pair — max and min of that linear combination,
// built against the exact same constraint set `solveValues` itself uses, via
// `buildValueLP`/`profileCoeffs` in solver.ts). A narrow range across the sample means the
// model is genuinely determined for ranking purposes; a wide range means it isn't — which
// is a more direct proxy for "will this change the album ranking" than any single value's
// own range.
//
// Confirmed via a throwaway measurement script (2026-08-09, not committed) against both
// the oracle simulation (synthetic ground truth) and Dan's real 6-criteria production
// session: this metric moves meaningfully through the exact window
// (Q10 -> ~Q29 in the oracle sim) where `computeSolverAccuracy` stays nearly flat despite
// real rank displacement improving, and does not collapse to near-zero early the way a
// raw Chebyshev inscribed radius did (also tested, rejected the same day — saturates on
// the single tightest constraint anywhere in the whole polytope, no discriminative signal).
//
// Sampling is a FIXED, seeded synthetic pool — not the live, adaptive candidate pool
// `elicitationDriver.ts`/`questionOrdering.ts` generates for question selection. Reusing
// that pool would make this metric's own denominator drift for reasons unrelated to actual
// model determinacy (touch-count weighting, dominance filtering, degree escalation are all
// choices about what's worth *asking*, not what best *measures* current state), and would
// entangle two modules that are deliberately independent. A fixed pool, degree-mixed 2-4
// like `fixtures.ts`'s `buildHistoricalFixture`, is a pure function of `levelsPerCriterion`
// alone — identical and cacheable across every session with the same criteria shape.

import { profileKey, type Profile } from './preferenceGraph.js';
import { prepareLP, solveFromPrepared, type PreparedLP } from './simplex.js';
import { buildValueLP, profileCoeffs, type ValueSolverInput } from './solver.js';

const SAMPLE_POOL_SIZE = 15;
const SAMPLE_DEGREES = [2, 3, 4];

/** Small deterministic LCG — same pattern as fixtures.ts's createRng, so the sample pool
 *  is reproducible across runs/environments, not just within one process. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomProfile(rng: () => number, degree: number, levelsPerCriterion: number[]): Profile {
  const numCriteria = levelsPerCriterion.length;
  const indices = Array.from({ length: numCriteria }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const chosen = indices.slice(0, Math.min(degree, numCriteria));
  const profile: Record<number, number> = {};
  for (const idx of chosen) {
    profile[idx] = 1 + Math.floor(rng() * levelsPerCriterion[idx]);
  }
  return profile;
}

/**
 * Fixed, seeded 15-profile pool for a given `levelsPerCriterion` shape, degree-mixed 2-4.
 * Pure function of `levelsPerCriterion` alone (seed is a constant) — memoized so repeated
 * calls for the same shape (the common case: one criteria catalog per deployment) don't
 * regenerate it.
 */
const poolCache = new Map<string, Profile[]>();

function buildSamplePool(levelsPerCriterion: number[]): Profile[] {
  const cacheKey = levelsPerCriterion.join(',');
  const cached = poolCache.get(cacheKey);
  if (cached) return cached;

  const rng = createRng(20260809);
  const pool: Profile[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  while (pool.length < SAMPLE_POOL_SIZE && attempts < SAMPLE_POOL_SIZE * 50) {
    attempts++;
    const degree = SAMPLE_DEGREES[Math.floor(rng() * SAMPLE_DEGREES.length)];
    const candidate = randomProfile(rng, degree, levelsPerCriterion);
    const key = profileKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(candidate);
  }

  poolCache.set(cacheKey, pool);
  return pool;
}

/**
 * All C(pool, 2) pairs from the fixed sample pool for this `levelsPerCriterion` shape.
 * Exported for direct testing (structural cost-regression: pair count should stay at
 * C(15,2)=105 barring a deliberate pool-size change) and as the default sample for
 * `computeScoreSpreadAccuracy`.
 */
export function defaultSamplePairs(levelsPerCriterion: number[]): [Profile, Profile][] {
  const pool = buildSamplePool(levelsPerCriterion);
  const pairs: [Profile, Profile][] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      pairs.push([pool[i], pool[j]]);
    }
  }
  return pairs;
}

/** Max - min of `scoreProfile(A) - scoreProfile(B)` over the LP's feasible region — two
 *  Phase 2 solves against the constraint set the caller already prepared once. */
function scoreDiffRangeWidth(
  lp: ReturnType<typeof buildValueLP>,
  prep: PreparedLP,
  profileA: Profile,
  profileB: Profile
): number {
  const coeffsA = profileCoeffs(profileA, lp.varIndex, lp.totalVars);
  const coeffsB = profileCoeffs(profileB, lp.varIndex, lp.totalVars);
  const diff = coeffsA.map((v, i) => v - coeffsB[i]);

  const maxResult = solveFromPrepared(
    prep,
    diff.map((v) => -v) // maximize diff == minimize -diff
  );
  const minResult = solveFromPrepared(prep, diff);

  // Both solves are against the same always-feasible region buildValueLP already
  // established (see its own infeasibility check) — a solve failing here would indicate a
  // solver bug, not a legitimately unscoreable pair, so treat as maximally uncertain
  // rather than throwing and taking down the whole accuracy computation over one pair.
  if (!maxResult.feasible || !minResult.feasible) return 2;

  return -maxResult.objectiveValue - minResult.objectiveValue;
}

/**
 * Score-spread accuracy: `1 - avg(range width) / 2`, clamped to [0,1]. Range width for a
 * single pair lives in [0,2] since each `scoreProfile` value lives in [0,1] (normalization
 * constraint), so this stays on the same 0-1 scale `computeSolverAccuracy` used, even
 * though the two aren't numerically comparable value-for-value (see module header).
 *
 * `samplePairs` defaults to `defaultSamplePairs(input.levelsPerCriterion)` — the fixed
 * seeded pool, not session-adaptive. Cost is `2 * samplePairs.length` Phase 2 solves, plus
 * `buildValueLP`'s phase-1 solve and one `prepareLP` over the resulting constraint set.
 *
 * All `2 * samplePairs.length` solves share one constraint set and differ only in objective,
 * so Phase 1 is prepared ONCE here and reused (see simplex.ts's `PreparedLP`). Before that
 * (2026-08-15) each solve redid it, which was ~79% of the work and made this scale ~O(n^2)
 * in answer count. Measured at the default 105 pairs on a 6x5 catalog: 23ms at n=10 and
 * 872ms at n=59 before, 6ms and 197ms after — superseding the "~16-120ms" figure this
 * comment used to quote, which was measured 2026-08-09 at much lower answer counts and had
 * become badly stale. Still a per-commit computation, not a per-render one.
 */
export function computeScoreSpreadAccuracy(
  input: ValueSolverInput,
  samplePairs?: readonly [Profile, Profile][]
): number {
  const pairs = samplePairs ?? defaultSamplePairs(input.levelsPerCriterion);
  if (pairs.length === 0) return 1;

  const lp = buildValueLP(input);
  const prep = prepareLP(lp.totalVars, lp.constraintsWithSlackCap);
  const widths = pairs.map(([a, b]) => scoreDiffRangeWidth(lp, prep, a, b));
  const avgWidth = widths.reduce((sum, w) => sum + w, 0) / widths.length;
  return Math.max(0, 1 - avgWidth / 2);
}
