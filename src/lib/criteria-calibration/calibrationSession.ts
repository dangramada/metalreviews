// Orchestration layer between the strict preference graph (part 1) and the slack-tolerant
// value solver (part 2, solver.ts). The strict graph's throwing behavior is unchanged and
// must never surface to an end user as a blocking error — real users give mildly
// inconsistent answers sometimes. So every recorded answer is checked with
// `wouldContradict` first: if it would contradict the graph's closure, it's routed around
// the graph (not inserted), but it is ALWAYS appended to the full answer log regardless.
// That full log — not the strict graph — is what feeds the solver, since absorbing
// inconsistency statistically is the solver's job, not the graph's. The graph exists only
// to power `isImplied`-based question-skipping during elicitation.

import {
  PreferenceGraph,
  profileDegree,
  type ComparisonResult,
  type Profile,
  type PreferenceGraphConfig,
} from './preferenceGraph.js';

export interface LoggedAnswer {
  profileA: Profile;
  profileB: Profile;
  result: ComparisonResult;
  degree: number;
  timestamp?: number;
  /** False if this answer would have contradicted the strict graph's closure and was routed around it. */
  insertedIntoGraph: boolean;
}

export class CalibrationSession {
  readonly graph: PreferenceGraph;
  private readonly log: LoggedAnswer[] = [];

  constructor(config?: PreferenceGraphConfig) {
    this.graph = new PreferenceGraph(config);
  }

  /**
   * Records one answer. Cross-degree behavior is unchanged from part 1: comparing
   * profiles of different degrees is always an error, since a single comparison round is
   * always within one degree — that check happens before the contradiction check.
   */
  recordAnswer(
    profileA: Profile,
    profileB: Profile,
    result: ComparisonResult,
    timestamp?: number
  ): LoggedAnswer {
    const degreeA = profileDegree(profileA);
    const degreeB = profileDegree(profileB);
    if (degreeA !== degreeB) {
      throw new Error(
        `Cannot record an answer comparing profiles of different degrees (${degreeA} vs ${degreeB}).`
      );
    }

    const contradicts = this.graph.wouldContradict(profileA, profileB, result);
    if (!contradicts) {
      this.graph.insertAnswer(profileA, profileB, result);
    }

    const entry: LoggedAnswer = {
      profileA,
      profileB,
      result,
      degree: degreeA,
      timestamp,
      insertedIntoGraph: !contradicts,
    };
    this.log.push(entry);
    return entry;
  }

  get fullLog(): readonly LoggedAnswer[] {
    return this.log;
  }
}
