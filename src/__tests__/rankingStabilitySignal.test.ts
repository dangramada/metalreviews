import { describe, it, expect } from 'vitest';
import {
  toFlatWeights,
  computeTop10Set,
  advanceStabilityWindow,
  advancePersistedStabilityWindow,
  seedWindowHistoryOnResume,
  popWindowHistory,
  INITIAL_STABILITY_WINDOW_STATE,
  INITIAL_PERSISTED_STABILITY_WINDOW,
  type StabilityWindowState,
  type PersistedStabilityWindow,
} from '../lib/criteria-calibration/rankingStabilitySignal';
import type { LevelValue } from '../lib/criteria-calibration/solver';
import type { CriterionLevelRating } from '../lib/album-rating/scoreAndRank';
import { PASS4_RANKING_STABILITY_CHECKPOINTS } from '../lib/criteria-calibration/fixtures';

describe('toFlatWeights', () => {
  it('flattens values[c][level].point into flat triples, including level 1 at value 0', () => {
    const values: LevelValue[][] = [
      [
        { point: 0, min: 0, max: 0 }, // index 0 unused (levels are 1-based)
        { point: 0, min: 0, max: 0 }, // level 1
        { point: 0.3, min: 0.25, max: 0.35 }, // level 2
      ],
    ];
    const flat = toFlatWeights(values);
    expect(flat).toEqual([
      { criterionId: 0, level: 1, value: 0 },
      { criterionId: 0, level: 2, value: 0.3 },
    ]);
  });
});

describe('computeTop10Set', () => {
  function makeRatings(criterionId: number, level: number): CriterionLevelRating[] {
    return [{ criterionId, level }];
  }

  it('returns the top 10 albumIds by score, tie-broken by albumId ascending', () => {
    const ratingsByAlbum = new Map<string, CriterionLevelRating[]>();
    // 12 albums, single criterion each, distinct levels 1-12 capped by weight table below —
    // use levels 1-5 repeating so some scores tie deliberately.
    const levels = [5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 5, 4];
    levels.forEach((level, i) => {
      ratingsByAlbum.set(`album-${String(i).padStart(2, '0')}`, makeRatings(0, level));
    });
    const weights = [
      { criterionId: 0, level: 1, value: 0 },
      { criterionId: 0, level: 2, value: 0.2 },
      { criterionId: 0, level: 3, value: 0.4 },
      { criterionId: 0, level: 4, value: 0.6 },
      { criterionId: 0, level: 5, value: 0.8 },
    ];

    const top10 = computeTop10Set(ratingsByAlbum, weights);
    expect(top10).not.toBeNull();
    expect(top10!.size).toBe(10);
    // The two level-1 albums (lowest score) must be excluded from the top 10 of 12.
    expect(top10!.has('album-08')).toBe(false);
    expect(top10!.has('album-09')).toBe(false);
    // A level-5 tie (album-00, album-01, album-10) must all be included — ties don't cause
    // arbitrary exclusion, only the true lowest scores are cut.
    expect(top10!.has('album-00')).toBe(true);
    expect(top10!.has('album-01')).toBe(true);
    expect(top10!.has('album-10')).toBe(true);
  });

  it('returns null if a rating references a (criterion, level) the weights do not cover', () => {
    const ratingsByAlbum = new Map<string, CriterionLevelRating[]>([
      ['album-x', [{ criterionId: 0, level: 3 }]],
    ]);
    const weights = [{ criterionId: 0, level: 1, value: 0 }]; // level 3 missing
    expect(computeTop10Set(ratingsByAlbum, weights)).toBeNull();
  });
});

describe('advanceStabilityWindow', () => {
  function set(...ids: string[]): Set<string> {
    return new Set(ids);
  }

  it('never fires if tier never reaches High (insufficient-only session)', () => {
    let state = INITIAL_STABILITY_WINDOW_STATE;
    // Even a perfectly stable top-10 set across many checkpoints must not fire while every
    // checkpoint is insufficient-tier — insufficient checkpoints are skipped entirely, never
    // counted as eligible.
    for (let i = 0; i < 10; i++) {
      state = advanceStabilityWindow(state, 'insufficient', set('a', 'b', 'c'));
    }
    expect(state.fired).toBe(false);
    expect(state.consecutiveMatchRun).toBe(0);
  });

  it('drop-below-High-then-return: an insufficient dip is skipped, not a reset', () => {
    // This exact sequence (High -> insufficient -> High) was never exercised by Pass 4's real
    // 71-answer trace — tier never dropped back below High once reached there. This test only
    // confirms the implementation behaves sensibly (matches the spec's stated rule) rather
    // than crashing or silently misbehaving on a case with no real precedent.
    let state: StabilityWindowState = INITIAL_STABILITY_WINDOW_STATE;
    state = advanceStabilityWindow(state, 'high', set('a', 'b', 'c')); // anchor, run=0
    state = advanceStabilityWindow(state, 'high', set('a', 'b', 'c')); // matches anchor, run=1
    expect(state.fired).toBe(false);

    // Dip below High: skipped entirely — does not reset the run, does not become the new
    // "previous" checkpoint.
    state = advanceStabilityWindow(state, 'insufficient', set('x', 'y', 'z'));
    expect(state.consecutiveMatchRun).toBe(1);
    expect(state.lastEligibleTop10).toEqual(set('a', 'b', 'c'));

    // Tier returns to High with the SAME set as before the dip: this must be compared against
    // the pre-dip eligible checkpoint (not the insufficient one), completing the run.
    state = advanceStabilityWindow(state, 'high', set('a', 'b', 'c'));
    expect(state.fired).toBe(true);
  });

  it('drop-below-High-then-return with a CHANGED set: resets the run, does not fire', () => {
    let state: StabilityWindowState = INITIAL_STABILITY_WINDOW_STATE;
    state = advanceStabilityWindow(state, 'high', set('a', 'b', 'c'));
    state = advanceStabilityWindow(state, 'high', set('a', 'b', 'c')); // run=1
    state = advanceStabilityWindow(state, 'insufficient', set('x', 'y', 'z')); // skipped
    // Returns to High but with a DIFFERENT set than the pre-dip anchor — no match, run resets.
    state = advanceStabilityWindow(state, 'high', set('a', 'b', 'd'));
    expect(state.fired).toBe(false);
    expect(state.consecutiveMatchRun).toBe(0);
  });

  it('is terminal once fired: a later changed set does not un-fire it', () => {
    let state: StabilityWindowState = INITIAL_STABILITY_WINDOW_STATE;
    state = advanceStabilityWindow(state, 'high', set('a', 'b', 'c')); // anchor, run=0
    state = advanceStabilityWindow(state, 'high', set('a', 'b', 'c')); // matches, run=1
    state = advanceStabilityWindow(state, 'high', set('a', 'b', 'c')); // matches, run=2 -> fires
    expect(state.fired).toBe(true);
    state = advanceStabilityWindow(state, 'high', set('completely', 'different', 'set'));
    expect(state.fired).toBe(true);
  });

  it('reproduces Pass 4: tier-gated K=2 fires at exactly n=39 on the real frozen trace, not before', () => {
    let state: StabilityWindowState = INITIAL_STABILITY_WINDOW_STATE;
    let firedAt: number | null = null;
    for (const checkpoint of PASS4_RANKING_STABILITY_CHECKPOINTS) {
      const wasFired = state.fired;
      state = advanceStabilityWindow(state, checkpoint.tier, new Set(checkpoint.top10));
      if (!wasFired && state.fired) firedAt = checkpoint.answerCount;
    }
    expect(firedAt).toBe(39);
    // Once fired, stays fired through the rest of the real trace (n=42..69) — no reversal
    // recorded in Pass 4's data.
    expect(state.fired).toBe(true);
  });
});

describe('advancePersistedStabilityWindow', () => {
  function set(...ids: string[]): Set<string> {
    return new Set(ids);
  }

  it('a no-op commit (insufficient tier) leaves previous untouched and marks lastCommitChangedWindow false', () => {
    const afterRealChange: PersistedStabilityWindow = {
      current: { lastEligibleTop10: set('a'), consecutiveMatchRun: 1, fired: false },
      previous: { lastEligibleTop10: null, consecutiveMatchRun: 0, fired: false },
      lastCommitChangedWindow: true,
    };
    // advanceStabilityWindow returns the SAME reference for an insufficient-tier commit —
    // exactly what a no-op commit produces in the real driver loop.
    const noOpNext = advanceStabilityWindow(afterRealChange.current, 'insufficient', set('z'));
    const result = advancePersistedStabilityWindow(afterRealChange, noOpNext);

    expect(result.current).toBe(afterRealChange.current);
    expect(result.previous).toBe(afterRealChange.previous); // untouched, not re-snapshotted
    expect(result.lastCommitChangedWindow).toBe(false);
  });

  it('a real change snapshots the PRIOR current into previous and marks lastCommitChangedWindow true', () => {
    const before: PersistedStabilityWindow = {
      current: { lastEligibleTop10: set('a'), consecutiveMatchRun: 0, fired: false },
      previous: INITIAL_STABILITY_WINDOW_STATE,
      lastCommitChangedWindow: true,
    };
    const nextCurrent = advanceStabilityWindow(before.current, 'high', set('a')); // matches -> run=1, real change
    const result = advancePersistedStabilityWindow(before, nextCurrent);

    expect(result.current).toBe(nextCurrent);
    expect(result.previous).toBe(before.current); // snapshotted
    expect(result.lastCommitChangedWindow).toBe(true);
  });
});

describe('seedWindowHistoryOnResume', () => {
  it('seeds a single entry when the last commit did not change the window', () => {
    const persisted: PersistedStabilityWindow = {
      current: { lastEligibleTop10: new Set(['a']), consecutiveMatchRun: 2, fired: true },
      previous: { lastEligibleTop10: null, consecutiveMatchRun: 0, fired: false },
      lastCommitChangedWindow: false,
    };
    expect(seedWindowHistoryOnResume(persisted)).toEqual([persisted.current]);
  });

  it('seeds two entries, oldest first, when the last commit DID change the window', () => {
    const persisted: PersistedStabilityWindow = {
      current: { lastEligibleTop10: new Set(['a']), consecutiveMatchRun: 2, fired: true },
      previous: { lastEligibleTop10: new Set(['a']), consecutiveMatchRun: 1, fired: false },
      lastCommitChangedWindow: true,
    };
    expect(seedWindowHistoryOnResume(persisted)).toEqual([persisted.previous, persisted.current]);
  });
});

describe('popWindowHistory', () => {
  const a: StabilityWindowState = {
    lastEligibleTop10: new Set(['a']),
    consecutiveMatchRun: 0,
    fired: false,
  };
  const b: StabilityWindowState = {
    lastEligibleTop10: new Set(['b']),
    consecutiveMatchRun: 1,
    fired: false,
  };

  it('pops the top entry and reports the next one down', () => {
    const result = popWindowHistory([a, b]);
    expect(result.current).toBe(a);
    expect(result.next).toEqual([a]);
  });

  it('clamps at a single remaining entry rather than emptying out', () => {
    const result = popWindowHistory([a]);
    expect(result.current).toBe(a);
    expect(result.next).toEqual([a]);
  });
});

// ---------------------------------------------------------------------------------------
// Resume + Undo integration: simulates a real driver-paced trajectory end to end (advancing
// the window forward exactly as CriteriaCalibrationPage.tsx will), persisting via
// advancePersistedStabilityWindow at each step the way upsertWeightsAndStatus will, then
// exercises resume (seedWindowHistoryOnResume) + Undo (popWindowHistory) against it —
// checked against a TRUE value obtained by re-running advanceStabilityWindow fresh over the
// truncated checkpoint list, which is the ground truth a full (expensive, not viable) replay
// would produce.
// ---------------------------------------------------------------------------------------
describe('resume + Undo integration', () => {
  function set(...ids: string[]): Set<string> {
    return new Set(ids);
  }

  /** Replays `checkpoints` from scratch — the ground-truth value, only usable in tests since
   *  the real app can't afford to do this at resume time (see rankingStabilitySignal.ts's
   *  header on the LP-solve cost this would require in production). */
  function trueWindowAfter(
    checkpoints: { tier: 'insufficient' | 'high' | 'veryHigh'; top10: Set<string> }[]
  ): StabilityWindowState {
    let state = INITIAL_STABILITY_WINDOW_STATE;
    for (const cp of checkpoints) state = advanceStabilityWindow(state, cp.tier, cp.top10);
    return state;
  }

  /** Drives the full checkpoint list forward through both advanceStabilityWindow and
   *  advancePersistedStabilityWindow, returning the final PersistedStabilityWindow — what
   *  would actually get written to the DB after the real session ends. */
  function persistThroughSession(
    checkpoints: { tier: 'insufficient' | 'high' | 'veryHigh'; top10: Set<string> }[]
  ): PersistedStabilityWindow {
    let persisted = INITIAL_PERSISTED_STABILITY_WINDOW;
    for (const cp of checkpoints) {
      const next = advanceStabilityWindow(persisted.current, cp.tier, cp.top10);
      persisted = advancePersistedStabilityWindow(persisted, next);
    }
    return persisted;
  }

  it('a single post-resume Undo is exactly correct (1-entry seed: last commit was a no-op)', () => {
    // Fires at checkpoint 3 (0-indexed 2), then a 4th checkpoint is a genuine no-op (already
    // fired) — realistic "gate-only-the-jump" shape: eligible commits keep happening after
    // firing.
    const checkpoints: { tier: 'high'; top10: Set<string> }[] = [
      { tier: 'high', top10: set('a') }, // seed
      { tier: 'high', top10: set('a') }, // match, run=1
      { tier: 'high', top10: set('a') }, // match, run=2 -> FIRES
      { tier: 'high', top10: set('z') }, // no-op (already fired) despite a different set
    ];
    const persisted = persistThroughSession(checkpoints);
    expect(persisted.lastCommitChangedWindow).toBe(false); // confirms the 1-entry-seed branch

    const seed = seedWindowHistoryOnResume(persisted);
    const { current: afterOneUndo } = popWindowHistory(seed);

    const trueAtNMinus1 = trueWindowAfter(checkpoints.slice(0, 3));
    expect(afterOneUndo).toEqual(trueAtNMinus1);
    expect(afterOneUndo.fired).toBe(true);
  });

  it('a single post-resume Undo is exactly correct (2-entry seed: last commit WAS the change)', () => {
    const checkpoints: { tier: 'high'; top10: Set<string> }[] = [
      { tier: 'high', top10: set('a') }, // seed
      { tier: 'high', top10: set('a') }, // match, run=1
      { tier: 'high', top10: set('a') }, // match, run=2 -> FIRES (this is the last commit)
    ];
    const persisted = persistThroughSession(checkpoints);
    expect(persisted.lastCommitChangedWindow).toBe(true); // confirms the 2-entry-seed branch

    const seed = seedWindowHistoryOnResume(persisted);
    const { current: afterOneUndo } = popWindowHistory(seed);

    const trueAtNMinus1 = trueWindowAfter(checkpoints.slice(0, 2));
    expect(afterOneUndo).toEqual(trueAtNMinus1);
    expect(afterOneUndo.fired).toBe(false); // correctly un-fired: we undid the exact firing commit
  });

  it('two consecutive Undos with zero intervening commits: fired-boolean mismatch case (accepted gap, SAFE direction)', () => {
    // Constructed so the true trajectory fires at checkpoint 3, then checkpoint 4 is a no-op
    // (already fired) with a DIFFERENT top10 set — exactly the "gate-only-the-jump" shape
    // where firing happens and the user keeps answering afterward. Resume happens after
    // checkpoint 4; the user immediately Undoes twice with no new answer in between.
    const checkpoints: { tier: 'high'; top10: Set<string> }[] = [
      { tier: 'high', top10: set('a') }, // cp1: seed, run=0
      { tier: 'high', top10: set('a') }, // cp2: match, run=1
      { tier: 'high', top10: set('a') }, // cp3: match, run=2 -> FIRES
      { tier: 'high', top10: set('z') }, // cp4: no-op (already fired)
    ];
    const persisted = persistThroughSession(checkpoints);
    expect(persisted.lastCommitChangedWindow).toBe(false); // 1-entry seed, per the case above

    const seed = seedWindowHistoryOnResume(persisted);
    const { next: afterFirstPop, current: afterFirstUndo } = popWindowHistory(seed);
    // First Undo (removing cp4) is exactly correct, per the case above.
    expect(afterFirstUndo).toEqual(trueWindowAfter(checkpoints.slice(0, 3)));
    expect(afterFirstUndo.fired).toBe(true);

    // Second Undo (removing cp3 too — the ACTUAL firing commit — with zero new commits since
    // the first Undo): no third level of history exists, so this clamps rather than rolling
    // back further.
    const { current: afterSecondUndo } = popWindowHistory(afterFirstPop);
    const trueTwoBack = trueWindowAfter(checkpoints.slice(0, 2)); // cp1, cp2 only: run=1, NOT fired

    // The computed value does NOT match the true two-undos-back state...
    expect(afterSecondUndo).not.toEqual(trueTwoBack);
    // ...and the true state has fired: false (we undid past the actual firing commit)...
    expect(trueTwoBack.fired).toBe(false);
    // ...while the computed (clamped) value is STUCK at fired: true — the safe direction: the
    // app stays MORE conservative (manual/stopped) than the strict truth requires, it never
    // shows fired: false when the true state is fired: true (which would be the dangerous
    // direction — auto-escalation wrongly resuming). Confirmed here explicitly rather than
    // just asserted as a general claim.
    expect(afterSecondUndo.fired).toBe(true);
  });

  it('two consecutive Undos with zero intervening commits: run-count-only mismatch case (no fired involved at all)', () => {
    // A different shape from the case above: three REAL changes in a row (reset, build,
    // fire), so the seed is 2 entries wide, and the second Undo's staleness shows up as an
    // inflated consecutiveMatchRun rather than touching `fired` (both sides agree fired must
    // still be false at 2-undos-back, since firing only just happened at the very last
    // commit).
    const checkpoints: { tier: 'high'; top10: Set<string> }[] = [
      { tier: 'high', top10: set('a') }, // cp1: seed, run=0
      { tier: 'high', top10: set('b') }, // cp2: mismatch vs a -> run=0 (still a real change: set differs)
      { tier: 'high', top10: set('b') }, // cp3: match vs b -> run=1
      { tier: 'high', top10: set('b') }, // cp4: match vs b -> run=2 -> FIRES
    ];
    const persisted = persistThroughSession(checkpoints);
    expect(persisted.lastCommitChangedWindow).toBe(true); // 2-entry seed

    const seed = seedWindowHistoryOnResume(persisted);
    const { next: afterFirstPop, current: afterFirstUndo } = popWindowHistory(seed);
    expect(afterFirstUndo).toEqual(trueWindowAfter(checkpoints.slice(0, 3)));
    expect(afterFirstUndo.fired).toBe(false);

    const { current: afterSecondUndo } = popWindowHistory(afterFirstPop);
    const trueTwoBack = trueWindowAfter(checkpoints.slice(0, 2)); // cp1, cp2: run=0, fired=false

    expect(afterSecondUndo).not.toEqual(trueTwoBack); // stale (run=1 vs true run=0)
    expect(afterSecondUndo.fired).toBe(false);
    expect(trueTwoBack.fired).toBe(false); // both agree on fired here — only run-count drifts
    expect(afterSecondUndo.consecutiveMatchRun).toBeGreaterThanOrEqual(
      trueTwoBack.consecutiveMatchRun
    );
  });
});
