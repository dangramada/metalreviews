// Drives a Criteria Calibration session: decides what comparison to show next, whether
// degree-2 cold-start coverage is complete, and when the current degree has nothing left
// worth asking. Composes preferenceGraph.ts, solver.ts, questionOrdering.ts, and
// calibrationSession.ts as-is — none of their contracts change here. This module holds no
// session state of its own; every decision is derived live from the CalibrationSession
// passed in, so there is nothing to keep in sync or duplicate.
//
// Coverage requirement (degree 2): with N criteria there are exactly C(N,2) possible
// criteria pairs. Confirmed directly against PreferenceGraph (see
// elicitationDriver.test.ts's "closure never bridges..." test): answering one pair never
// implies anything about a different, disjoint pair, and even a different level
// combination within an ALREADY-answered pair isn't automatically implied by closure. So
// covering all C(N,2) pairs with at least one direct answer each is still asked first,
// unconditionally, as this driver's cold-start floor — but as of 2026-08-08 (see
// docs/decisions/criteria-calibration-medium-gate-redesign.md) this coverage is no longer
// what gates Medium tier; accuracyTiers.ts's `isMediumTierReached` now reads solver
// accuracy directly. Cold-start coverage remains here only to seed the solver with an
// initial answer per pair before the ambiguity-driven refinement phase (below) takes over.
//
// Degree escalation is never automatic: `nextAction` only ever signals
// `degree-exhausted` with `canEscalate`; the caller decides whether to actually move to
// degree+1 and call again.

import { profileKey, type Profile } from './preferenceGraph.js';
import type { CalibrationSession } from './calibrationSession.js';
import { solveValues, type LevelValue, type SolverAnswer } from './solver.js';
import { rankCandidatesByAmbiguity, type CandidatePair } from './questionOrdering.js';

export type DriverAction =
  | {
      type: 'ask';
      profileA: Profile;
      profileB: Profile;
      degree: number;
      reason: 'cold-start-coverage' | 'ambiguity-refinement';
    }
  | {
      type: 'degree-exhausted';
      degree: number;
      canEscalate: boolean;
      nextDegree: number | null;
      reason: 'pool-empty' | 'coverage-complete';
    };

/** All C(N,2) criteria-index pairs, generic over N. */
export function enumerateCriterionPairs(numCriteria: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < numCriteria; i++) {
    for (let j = i + 1; j < numCriteria; j++) pairs.push([i, j]);
  }
  return pairs;
}

/**
 * Cold-start rule for a criteria pair with zero prior information: the maximal-contrast
 * trade-off (best on one criterion + worst on the other, vs. the reverse). This is a
 * judgment call, not derived from Dan's real session (which used a different, undisclosed
 * pattern) — justification: with nothing yet known about the pair, this single probe
 * directly reveals which of the two criteria the user weighs more heavily, which is the
 * one thing a cold start most needs to resolve. Deterministic and generic — uses each
 * criterion's actual max level (levelsPerCriterion[c]), not a hardcoded 5.
 */
export function coldStartProfilesForPair(
  criterionA: number,
  criterionB: number,
  levelsPerCriterion: number[]
): CandidatePair {
  const maxA = levelsPerCriterion[criterionA];
  const maxB = levelsPerCriterion[criterionB];
  return {
    profileA: { [criterionA]: maxA, [criterionB]: 1 },
    profileB: { [criterionA]: 1, [criterionB]: maxB },
  };
}

/**
 * One canonical comparison per criteria pair — exactly what the cold-start rule asks
 * first for each pair (`isPairCovered`/`nextAction` below track this coverage directly via
 * `coldStartProfilesForPair`, not through this function). No longer consumed by
 * accuracyTiers.ts's `isMediumTierReached` (which reads solver accuracy directly as of
 * 2026-08-08) or by the UI's progress display (which also reads solver accuracy directly
 * as of 2026-08-09, see docs/decisions/criteria-calibration-medium-gate-redesign.md's
 * progress-ring-accuracy entry — the standalone `degree2CoveragePercent`/
 * `sessionProgress.ts` module it used to back was deleted then). Exported for
 * elicitationDriver.test.ts's own coverage-count assertions only at this point.
 */
export function buildCanonicalDegree2Pairs(levelsPerCriterion: number[]): CandidatePair[] {
  return enumerateCriterionPairs(levelsPerCriterion.length).map(([a, b]) =>
    coldStartProfilesForPair(a, b, levelsPerCriterion)
  );
}

function criteriaSetOf(profile: Profile): number[] {
  return Object.keys(profile)
    .map(Number)
    .sort((x, y) => x - y);
}

function isPairCovered(
  session: CalibrationSession,
  criterionA: number,
  criterionB: number
): boolean {
  const target = [criterionA, criterionB].sort((a, b) => a - b);
  return session.fullLog.some((entry) => {
    if (entry.degree !== 2) return false;
    const set = criteriaSetOf(entry.profileA);
    return set.length === 2 && set[0] === target[0] && set[1] === target[1];
  });
}

/**
 * Exact-match check against every answer ever logged (accepted into the graph or not).
 * This matters specifically because a contradiction-routed-around answer never becomes
 * `isImplied` — without this check the driver could re-offer the exact same rejected
 * question forever instead of moving on.
 */
function hasBeenAsked(session: CalibrationSession, profileA: Profile, profileB: Profile): boolean {
  const keyA = profileKey(profileA);
  const keyB = profileKey(profileB);
  return session.fullLog.some((entry) => {
    const entryKeyA = profileKey(entry.profileA);
    const entryKeyB = profileKey(entry.profileB);
    return (entryKeyA === keyA && entryKeyB === keyB) || (entryKeyA === keyB && entryKeyB === keyA);
  });
}

/**
 * All C(N, degree) criteria-index subsets. Tractable for the criteria counts this engine
 * targets (N=6 gives at most C(6,3)=20 subsets at any degree) — not capped, since the
 * combinatorics only matter at a scale well beyond what this feature operates at.
 */
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

/**
 * Small deterministic LCG, seeded per-subset so repeated driver calls regenerate the same
 * candidate set for a subset (which then shrinks as candidates get asked/filtered out)
 * rather than a fresh random set every call — no separate candidate cache needed.
 */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const CANDIDATES_PER_SUBSET = 6;

/**
 * True if, restricted to `subset`, one profile is weakly >= the other on every criterion
 * and strictly > on at least one — i.e. the pair offers no real trade-off. PAPRIKA's own
 * method only elicits undominated ("ambiguous") pairs; a dominated pair has an obvious
 * answer and wastes a question. Both profiles are always defined over exactly the same
 * `subset` here (see call site), so a single pass tracking which side ever strictly leads
 * is sufficient: both sides leading somewhere means genuinely incomparable (keep), only one
 * side ever leading means dominated (reject). The full-tie case (neither side ever leads)
 * is already caught by the caller's `keyA === keyB` check before this runs.
 */
function isDominatedPair(
  profileA: Record<number, number>,
  profileB: Record<number, number>,
  subset: number[]
): boolean {
  let sawAStrictlyGreater = false;
  let sawBStrictlyGreater = false;
  for (const idx of subset) {
    if (profileA[idx] > profileB[idx]) sawAStrictlyGreater = true;
    if (profileB[idx] > profileA[idx]) sawBStrictlyGreater = true;
  }
  return sawAStrictlyGreater !== sawBStrictlyGreater;
}

/**
 * Per-criterion, per-level count of how many times that (criterion, level) combination has
 * appeared in any logged answer so far (either side, any degree). Derived fresh from
 * `session.fullLog` on every call — same pattern as `isPairCovered`/`hasBeenAsked` above, no
 * new persisted state. Feeds `generateCandidatesForSubset`'s weighted level draw so
 * degree-2+ refinement pools stop sampling levels uniformly (which was landing most
 * candidates in the flat middle-level region after a cold start that only ever touches
 * level 1 and each criterion's max — see
 * docs/decisions/criteria-calibration-coverage-weighted-candidates.md).
 */
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

/**
 * Draws a weighted-random level in `1..max` for criterion `idx`, biased toward levels with
 * lower touch counts (`weight = 1 / (1 + touchCount)`). Falls back to a uniform draw when
 * `touchCounts` is omitted, so callers that don't care about coverage weighting (and the
 * existing dominance-filter tests) see unchanged behavior.
 */
function drawLevel(
  rng: () => number,
  idx: number,
  max: number,
  touchCounts: number[][] | undefined
): number {
  if (!touchCounts) return 1 + Math.floor(rng() * max);

  const weights: number[] = [];
  let totalWeight = 0;
  for (let level = 1; level <= max; level++) {
    const w = 1 / (1 + touchCounts[idx][level]);
    weights.push(w);
    totalWeight += w;
  }
  let draw = rng() * totalWeight;
  for (let level = 1; level <= max; level++) {
    draw -= weights[level - 1];
    if (draw <= 0) return level;
  }
  return max; // floating-point fallback, should be unreachable
}

/** Exported for direct testing of the dominance filter — not used outside this module. */
export function generateCandidatesForSubset(
  subset: number[],
  levelsPerCriterion: number[],
  touchCounts?: number[][]
): CandidatePair[] {
  const seed = subset.reduce((acc, idx) => acc * 31 + idx + 1, 7);
  const rng = createSeededRng(seed);
  const candidates: CandidatePair[] = [];
  const seenPairKeys = new Set<string>();
  let attempts = 0;

  while (candidates.length < CANDIDATES_PER_SUBSET && attempts < CANDIDATES_PER_SUBSET * 20) {
    attempts++;
    const profileA: Record<number, number> = {};
    const profileB: Record<number, number> = {};
    for (const idx of subset) {
      const max = levelsPerCriterion[idx];
      profileA[idx] = drawLevel(rng, idx, max, touchCounts);
      profileB[idx] = drawLevel(rng, idx, max, touchCounts);
    }
    const keyA = profileKey(profileA);
    const keyB = profileKey(profileB);
    if (keyA === keyB) continue;
    if (isDominatedPair(profileA, profileB, subset)) continue;
    const pairKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
    if (seenPairKeys.has(pairKey)) continue;
    seenPairKeys.add(pairKey);
    candidates.push({ profileA, profileB });
  }
  return candidates;
}

function buildRefinementCandidatePool(
  session: CalibrationSession,
  levelsPerCriterion: number[],
  degree: number,
  touchCounts: number[][]
): CandidatePair[] {
  const subsets = enumerateCriterionSubsets(levelsPerCriterion.length, degree);
  const pool: CandidatePair[] = [];
  for (const subset of subsets) {
    for (const candidate of generateCandidatesForSubset(subset, levelsPerCriterion, touchCounts)) {
      if (hasBeenAsked(session, candidate.profileA, candidate.profileB)) continue;
      if (session.graph.isImplied(candidate.profileA, candidate.profileB).implied) continue;
      pool.push(candidate);
    }
  }
  return pool;
}

/**
 * PROVISIONAL — same unvalidated-constant status as accuracyTiers.ts's SCORE_SPREAD_*
 * thresholds (see docs/decisions/deferred-work.md's "Score-spread accuracy thresholds"
 * entry, extended 2026-08-10 to cover this constant too). Calibrated against the
 * 2026-08-09 oracle-simulation trace: 0.3 was measured to cut off a real, still-substantial
 * accuracy gain (18% relative improvement between n=47 and n=63); 0.2 captures that gain;
 * nothing tighter (0.15/0.1/0.05) fired at all within 65 oracle steps, too conservative
 * given this LP's achievable precision. Do not tighten or loosen without the same planned
 * recalibration session.
 */
const MAX_VALUE_RANGE_FOR_COVERAGE = 0.2;

/**
 * A degree is exhausted (nothing left worth asking) once every free `(criterion, level)`
 * variable in the FULL model — not scoped to the current degree's criterion subsets — has
 * both been touched by at least one logged answer (`touchCounts[c][level] > 0`) and has a
 * narrow feasible range (`.max - .min < MAX_VALUE_RANGE_FOR_COVERAGE`). Scoped to the whole
 * model deliberately: a variable can go untouched or stay wide regardless of which degree
 * is currently active (subsets at every degree can touch it), so checking only the current
 * degree's own subsets would miss a variable a different degree already covers, or wrongly
 * credit one only some other degree happens to touch. Replaces the old gap-based
 * `MAX_AMBIGUOUS_GAP` check (2026-08-09 design checkpoint, see
 * docs/decisions/criteria-calibration-adaptive-degree-escalation.md): that rule inferred
 * "nothing left to learn" from candidate-pair score gaps, which stayed near-zero by
 * construction in real sessions regardless of whether the underlying variables were
 * actually determined — measured on both an oracle trace and a real 33-answer production
 * session to correctly track true information gain where the gap-based rule didn't.
 * Values/touchCounts are both computed fresh from `session.fullLog` on every call — no
 * state to keep in sync.
 */
function isDegreeCoverageComplete(
  levelsPerCriterion: number[],
  values: LevelValue[][],
  touchCounts: number[][]
): boolean {
  for (let c = 0; c < levelsPerCriterion.length; c++) {
    for (let level = 2; level <= levelsPerCriterion[c]; level++) {
      if (touchCounts[c][level] === 0) return false;
      const v = values[c][level];
      if (v.max - v.min >= MAX_VALUE_RANGE_FOR_COVERAGE) return false;
    }
  }
  return true;
}

function toSolverAnswers(session: CalibrationSession): SolverAnswer[] {
  return session.fullLog.map((entry) => ({
    profileA: entry.profileA,
    profileB: entry.profileB,
    result: entry.result,
  }));
}

/**
 * Decides the next elicitation action for a session at `currentDegree`. Never escalates
 * degree itself — a `degree-exhausted` result only signals that escalation is available;
 * the caller must explicitly act on it (and call again with `currentDegree + 1`).
 */
export function nextAction(
  session: CalibrationSession,
  levelsPerCriterion: number[],
  currentDegree: number
): DriverAction {
  const numCriteria = levelsPerCriterion.length;

  if (currentDegree === 2) {
    const uncoveredPair = enumerateCriterionPairs(numCriteria).find(
      ([a, b]) => !isPairCovered(session, a, b)
    );
    if (uncoveredPair) {
      const [a, b] = uncoveredPair;
      const { profileA, profileB } = coldStartProfilesForPair(a, b, levelsPerCriterion);
      return { type: 'ask', profileA, profileB, degree: 2, reason: 'cold-start-coverage' };
    }
  }

  const touchCounts = computeTouchCounts(session, levelsPerCriterion);
  const pool = buildRefinementCandidatePool(session, levelsPerCriterion, currentDegree, touchCounts);
  const nextDegree = currentDegree + 1;
  const canEscalate = nextDegree <= numCriteria;

  if (pool.length === 0) {
    return {
      type: 'degree-exhausted',
      degree: currentDegree,
      canEscalate,
      nextDegree: canEscalate ? nextDegree : null,
      reason: 'pool-empty',
    };
  }

  const solved = solveValues({ levelsPerCriterion, answers: toSolverAnswers(session) });

  if (isDegreeCoverageComplete(levelsPerCriterion, solved.values, touchCounts)) {
    return {
      type: 'degree-exhausted',
      degree: currentDegree,
      canEscalate,
      nextDegree: canEscalate ? nextDegree : null,
      reason: 'coverage-complete',
    };
  }

  const ranked = rankCandidatesByAmbiguity(pool, solved.values);
  const top = ranked[0];

  return {
    type: 'ask',
    profileA: top.profileA,
    profileB: top.profileB,
    degree: currentDegree,
    reason: 'ambiguity-refinement',
  };
}
