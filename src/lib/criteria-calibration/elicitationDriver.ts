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
import { solveValues, scoreProfile, type SolverAnswer } from './solver.js';
import { rankCandidatesByAmbiguity, type CandidatePair } from './questionOrdering.js';

export type DriverAction =
  | {
      type: 'ask';
      profileA: Profile;
      profileB: Profile;
      degree: number;
      reason: 'cold-start-coverage' | 'ambiguity-refinement';
    }
  | { type: 'degree-exhausted'; degree: number; canEscalate: boolean; nextDegree: number | null };

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

/** Exported for direct testing of the dominance filter — not used outside this module. */
export function generateCandidatesForSubset(
  subset: number[],
  levelsPerCriterion: number[]
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
      profileA[idx] = 1 + Math.floor(rng() * max);
      profileB[idx] = 1 + Math.floor(rng() * max);
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
  degree: number
): CandidatePair[] {
  const subsets = enumerateCriterionSubsets(levelsPerCriterion.length, degree);
  const pool: CandidatePair[] = [];
  for (const subset of subsets) {
    for (const candidate of generateCandidatesForSubset(subset, levelsPerCriterion)) {
      if (hasBeenAsked(session, candidate.profileA, candidate.profileB)) continue;
      if (session.graph.isImplied(candidate.profileA, candidate.profileB).implied) continue;
      pool.push(candidate);
    }
  }
  return pool;
}

/**
 * `rankCandidatesByAmbiguity` sorts smallest-gap (most ambiguous, most worth asking)
 * first. Exhaustion means even the BEST remaining candidate isn't ambiguous anymore — its
 * estimated gap exceeds this ceiling, on the normalized 0..1 value scale. Calibrated by
 * inspecting the actual gap distribution of a real candidate pool mid-simulation: gaps
 * cluster near-zero (genuinely ambiguous) and then jump to ~0.1+ (clearly resolved), with
 * little in between — 0.05 sits cleanly in that gap. Proposed judgment call, same status
 * as accuracyTiers.ts's tier thresholds: a reasonable, empirically-grounded default, not
 * independently validated against a second real session.
 *
 * Scope, as of 2026-08-08 (see docs/decisions/criteria-calibration-medium-gate-redesign.md):
 * this constant governs UX pacing only — when `nextAction` stops *offering* further
 * refinement questions at the current degree. It has no bearing on whether Medium tier is
 * granted; that's decided solely by `accuracyTiers.ts`'s `isMediumTierReached` against
 * live solver accuracy. Deliberately decoupled: this driver can legitimately decide
 * there's nothing left worth asking (every remaining candidate looks resolved) at a point
 * where solver accuracy still sits below the Medium threshold, and vice versa.
 */
const MAX_AMBIGUOUS_GAP = 0.05;

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

  const pool = buildRefinementCandidatePool(session, levelsPerCriterion, currentDegree);
  const nextDegree = currentDegree + 1;
  const canEscalate = nextDegree <= numCriteria;

  if (pool.length === 0) {
    return {
      type: 'degree-exhausted',
      degree: currentDegree,
      canEscalate,
      nextDegree: canEscalate ? nextDegree : null,
    };
  }

  const solved = solveValues({ levelsPerCriterion, answers: toSolverAnswers(session) });
  const ranked = rankCandidatesByAmbiguity(pool, solved.values);
  const top = ranked[0];
  const gap = Math.abs(
    scoreProfile(top.profileA, solved.values) - scoreProfile(top.profileB, solved.values)
  );

  if (gap > MAX_AMBIGUOUS_GAP) {
    return {
      type: 'degree-exhausted',
      degree: currentDegree,
      canEscalate,
      nextDegree: canEscalate ? nextDegree : null,
    };
  }

  return {
    type: 'ask',
    profileA: top.profileA,
    profileB: top.profileB,
    degree: currentDegree,
    reason: 'ambiguity-refinement',
  };
}
