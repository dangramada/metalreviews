// Criteria Calibration preference graph.
//
// A "profile" is a partial assignment of a level to a subset of N generic criteria
// (see Profile below). Users compare two profiles of the SAME degree (same number of
// criteria varied) and the result — a strict preference or an equivalence — is recorded
// here. After each insertion we compute the transitive closure so that future comparisons
// already implied by past answers can be skipped by the (future, not-yet-built)
// question-selection logic.
//
// Scope of this module, deliberately:
//   - Same-degree transitive closure is fully and correctly implemented: if A>B and B>C
//     are both known at degree D, isImplied(A, C) at degree D will report it, and an
//     equivalence (A≡B) correctly folds into the same closure (a preference over one side
//     of an equivalence transfers to the other side).
//   - Cross-degree closure (e.g. a degree-3 answer implying something about a degree-2
//     profile, or vice versa) is NOT implemented. isImplied() always returns
//     `{ implied: false }` when the two profiles being compared are of different degrees.
//     This is an intentional scope boundary for this pass, not an oversight — see the
//     project brief for "Criteria Calibration engine, part 1". A future pass may add this
//     as an optimization; it is not required for correctness of the same-degree guarantee.
//   - This module is generic over N criteria and M levels per criterion. It does not
//     hardcode the current production shape (6 criteria x 5 levels). `numCriteria` /
//     `levelsPerCriterion` are only used for optional profile validation, never for the
//     graph algorithm itself, which works purely off whatever criterion indices/levels
//     appear in the profiles it's given.

/**
 * A profile is a partial mapping from criterion index (0-based) to the level (1-based)
 * assigned to that criterion on this comparison card. Criteria absent from the card are
 * simply absent keys — that's what makes it a "profile" at a given degree rather than a
 * full N-criterion record. `Object.keys(profile).length` is the profile's degree.
 */
export type Profile = Readonly<Record<number, number>>;

export type ComparisonResult = 'A' | 'B' | 'equal';

export type ImpliedResult =
  | { implied: false }
  | { implied: true; equal: true }
  | { implied: true; equal: false; winner: 'A' | 'B' };

export interface PreferenceGraphConfig {
  /** Optional, for profile validation only — the closure algorithm doesn't need these. */
  numCriteria?: number;
  levelsPerCriterion?: number;
}

export function profileDegree(profile: Profile): number {
  return Object.keys(profile).length;
}

/**
 * Infers the degree a session should be at from its answer log: the highest degree any
 * answered profile reaches, or `startingDegree` if the log is empty/all lower. Same formula
 * useCalibrationResume.ts uses to derive degree on mount from a resumed answer log — reused
 * here (not reinvented) so CriteriaCalibrationPage's Undo/Redo can re-derive degree from a
 * post-mutation answer log the same way a fresh page load does.
 */
export function inferDegreeFromAnswers(
  answers: readonly { profileA: Profile }[],
  startingDegree: number
): number {
  return answers.reduce((max, a) => Math.max(max, profileDegree(a.profileA)), startingDegree);
}

/**
 * Canonical string key for a profile, stable regardless of key insertion order, so
 * profiles can be used as Map/Set members by value.
 */
export function profileKey(profile: Profile): string {
  return Object.keys(profile)
    .map(Number)
    .sort((a, b) => a - b)
    .map((idx) => `${idx}:${profile[idx]}`)
    .join(',');
}

/**
 * Parses the project's reference notation into a Profile: one character per criterion
 * position, `-` for absent, a digit for the assigned level. E.g. "1-5---" with criteria
 * in the project's fixed 6-criterion order means criterion 0 (Musical innovation) = 1 and
 * criterion 2 (Instrumental + Vocal performance) = 5, with the other four absent.
 */
export function profileFromNotation(notation: string): Profile {
  const profile: Record<number, number> = {};
  for (let i = 0; i < notation.length; i++) {
    const ch = notation[i];
    if (ch === '-') continue;
    const level = Number(ch);
    if (!Number.isInteger(level) || level < 1) {
      throw new Error(`Invalid level character "${ch}" at position ${i} in notation "${notation}"`);
    }
    profile[i] = level;
  }
  return profile;
}

function validateProfile(profile: Profile, config?: PreferenceGraphConfig): void {
  if (!config) return;
  for (const key of Object.keys(profile)) {
    const idx = Number(key);
    const level = profile[idx];
    if (config.numCriteria !== undefined && (idx < 0 || idx >= config.numCriteria)) {
      throw new Error(
        `Criterion index ${idx} is out of range for numCriteria=${config.numCriteria}`
      );
    }
    if (
      config.levelsPerCriterion !== undefined &&
      (level < 1 || level > config.levelsPerCriterion)
    ) {
      throw new Error(
        `Level ${level} is out of range for levelsPerCriterion=${config.levelsPerCriterion}`
      );
    }
  }
}

/**
 * Per-degree union-find + directed edge graph. Equivalences merge profile keys into an
 * equivalence class (union-find); strict preferences are directed edges between class
 * representatives. Keeping preferences on representatives (rather than raw profile keys)
 * is what makes "A≡B, B>C" correctly imply "A>C" for free.
 */
class DegreeState {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();
  private readonly edges = new Map<string, Set<string>>();

  has(key: string): boolean {
    return this.parent.has(key);
  }

  ensure(key: string): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
  }

  find(key: string): string {
    const parent = this.parent.get(key);
    if (parent === undefined) {
      throw new Error(`Unknown profile key: ${key}`);
    }
    if (parent === key) return key;
    const root = this.find(parent);
    this.parent.set(key, root); // path compression
    return root;
  }

  /** Merges the equivalence classes of two representatives, migrating any edges. */
  union(keyA: string, keyB: string): void {
    const rootA = this.find(keyA);
    const rootB = this.find(keyB);
    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA)!;
    const rankB = this.rank.get(rootB)!;
    let survivor: string;
    let absorbed: string;
    if (rankA < rankB) {
      survivor = rootB;
      absorbed = rootA;
    } else if (rankA > rankB) {
      survivor = rootA;
      absorbed = rootB;
    } else {
      survivor = rootA;
      absorbed = rootB;
      this.rank.set(rootA, rankA + 1);
    }
    this.parent.set(absorbed, survivor);

    // Migrate outgoing edges from the absorbed representative onto the survivor.
    const absorbedOut = this.edges.get(absorbed);
    if (absorbedOut) {
      const survivorOut = this.edges.get(survivor) ?? new Set<string>();
      for (const target of absorbedOut) {
        survivorOut.add(target === absorbed ? survivor : target);
      }
      this.edges.set(survivor, survivorOut);
      this.edges.delete(absorbed);
    }
    // Migrate incoming edges: anything pointing at the absorbed representative now
    // points at the survivor instead.
    for (const targets of this.edges.values()) {
      if (targets.has(absorbed)) {
        targets.delete(absorbed);
        if (targets !== this.edges.get(survivor)) targets.add(survivor);
      }
    }
  }

  addEdge(winnerRep: string, loserRep: string): void {
    const set = this.edges.get(winnerRep) ?? new Set<string>();
    set.add(loserRep);
    this.edges.set(winnerRep, set);
  }

  /**
   * Whether `fromRep` transitively beats `toRep` via directed edges. Small BFS recomputed
   * on demand rather than an incrementally-maintained closure — graphs in this domain
   * (per-degree, per-user) are small enough that this is simpler and just as fast in
   * practice.
   */
  reaches(fromRep: string, toRep: string): boolean {
    if (fromRep === toRep) return false;
    const visited = new Set<string>([fromRep]);
    const queue = [fromRep];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const targets = this.edges.get(current);
      if (!targets) continue;
      for (const target of targets) {
        if (target === toRep) return true;
        if (!visited.has(target)) {
          visited.add(target);
          queue.push(target);
        }
      }
    }
    return false;
  }
}

export class PreferenceGraph {
  private readonly degrees = new Map<number, DegreeState>();

  constructor(private readonly config?: PreferenceGraphConfig) {}

  private getOrCreateDegree(degree: number): DegreeState {
    let state = this.degrees.get(degree);
    if (!state) {
      state = new DegreeState();
      this.degrees.set(degree, state);
    }
    return state;
  }

  /**
   * Shared contradiction check used by both the throwing `insertAnswer` and the
   * non-throwing `wouldContradict`. Assumes both keys are already registered in `state`
   * (callers must `ensure()` first, or otherwise confirm `state.has(key)`).
   */
  private detectContradiction(
    state: DegreeState,
    keyA: string,
    keyB: string,
    result: ComparisonResult
  ): boolean {
    const repA = state.find(keyA);
    const repB = state.find(keyB);

    if (result === 'equal') {
      if (repA === repB) return false; // already equal, not a contradiction
      return state.reaches(repA, repB) || state.reaches(repB, repA);
    }

    const repW = result === 'A' ? repA : repB;
    const repL = result === 'A' ? repB : repA;
    if (repW === repL) return true; // can't prefer a profile over one already known equal to it
    return state.reaches(repL, repW); // cycle: loser already strictly precedes winner
  }

  /**
   * Records a new answer and folds it into that degree's transitive closure. Throws if
   * the two profiles are not the same degree (a single comparison round is always within
   * one degree), or if the answer contradicts what's already implied — the graph never
   * silently accepts a cycle.
   */
  insertAnswer(profileA: Profile, profileB: Profile, result: ComparisonResult): void {
    validateProfile(profileA, this.config);
    validateProfile(profileB, this.config);

    const degreeA = profileDegree(profileA);
    const degreeB = profileDegree(profileB);
    if (degreeA !== degreeB) {
      throw new Error(
        `Cannot compare profiles of different degrees (${degreeA} vs ${degreeB}); a comparison round is always within a single degree.`
      );
    }

    const state = this.getOrCreateDegree(degreeA);
    const keyA = profileKey(profileA);
    const keyB = profileKey(profileB);
    state.ensure(keyA);
    state.ensure(keyB);

    if (this.detectContradiction(state, keyA, keyB, result)) {
      throw new Error(
        `Contradiction at degree ${degreeA}: this answer conflicts with a relationship already implied by prior answers at this degree.`
      );
    }

    if (result === 'equal') {
      const repA = state.find(keyA);
      const repB = state.find(keyB);
      if (repA !== repB) state.union(repA, repB);
      return;
    }

    const winnerKey = result === 'A' ? keyA : keyB;
    const loserKey = result === 'A' ? keyB : keyA;
    state.addEdge(state.find(winnerKey), state.find(loserKey));
  }

  /**
   * Non-throwing counterpart to `insertAnswer`'s contradiction check. Real users give
   * mildly inconsistent answers sometimes — that's normal, not corrupted data — so
   * callers that need to route around a contradiction (rather than treat it as fatal)
   * should check this first instead of using exceptions as control flow. Returns false
   * (not a contradiction) for cross-degree pairs or profiles never seen at this degree,
   * since there is nothing yet to conflict with.
   */
  wouldContradict(profileA: Profile, profileB: Profile, result: ComparisonResult): boolean {
    const degreeA = profileDegree(profileA);
    const degreeB = profileDegree(profileB);
    if (degreeA !== degreeB) return false;

    const state = this.degrees.get(degreeA);
    if (!state) return false;

    const keyA = profileKey(profileA);
    const keyB = profileKey(profileB);
    if (!state.has(keyA) || !state.has(keyB)) return false;

    return this.detectContradiction(state, keyA, keyB, result);
  }

  /**
   * Whether the relationship between profileA and profileB is already determined by the
   * current same-degree closure. Cross-degree pairs always return `{ implied: false }` —
   * see the module header comment on why that's an intentional scope boundary here.
   */
  isImplied(profileA: Profile, profileB: Profile): ImpliedResult {
    const degreeA = profileDegree(profileA);
    const degreeB = profileDegree(profileB);
    if (degreeA !== degreeB) return { implied: false };

    const state = this.degrees.get(degreeA);
    if (!state) return { implied: false };

    const keyA = profileKey(profileA);
    const keyB = profileKey(profileB);
    if (!state.has(keyA) || !state.has(keyB)) return { implied: false };

    const repA = state.find(keyA);
    const repB = state.find(keyB);
    if (repA === repB) return { implied: true, equal: true };
    if (state.reaches(repA, repB)) return { implied: true, equal: false, winner: 'A' };
    if (state.reaches(repB, repA)) return { implied: true, equal: false, winner: 'B' };
    return { implied: false };
  }
}
