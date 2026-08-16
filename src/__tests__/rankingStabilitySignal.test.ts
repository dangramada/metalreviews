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
    // 10 albums (clears the TOP_N floor below) so this exercises the unscoreable-rating path
    // specifically, not the size guard.
    const ratingsByAlbum = new Map<string, CriterionLevelRating[]>();
    for (let i = 0; i < 9; i++) {
      ratingsByAlbum.set(`album-${i}`, makeRatings(0, 1));
    }
    ratingsByAlbum.set('album-x', [{ criterionId: 0, level: 3 }]); // level 3 missing below
    const weights = [{ criterionId: 0, level: 1, value: 0 }];
    expect(computeTop10Set(ratingsByAlbum, weights)).toBeNull();
  });

  it('returns null when ratingsByAlbum is empty, rather than a vacuous empty Set', () => {
    // The per-user-scoping finding: an RLS-scoped fetch returning zero rows for a non-owning
    // account must not be indistinguishable from "top 10 is genuinely empty" — see
    // docs/decisions/criteria-calibration/criteria-calibration-duration-based-window-fix.md.
    const ratingsByAlbum = new Map<string, CriterionLevelRating[]>();
    const weights = [{ criterionId: 0, level: 1, value: 0 }];
    expect(computeTop10Set(ratingsByAlbum, weights)).toBeNull();
  });

  it('returns null when fewer than TOP_N (10) albums have ratings, not just when empty', () => {
    const ratingsByAlbum = new Map<string, CriterionLevelRating[]>();
    for (let i = 0; i < 9; i++) {
      ratingsByAlbum.set(`album-${i}`, makeRatings(0, 1));
    }
    const weights = [{ criterionId: 0, level: 1, value: 0 }];
    expect(computeTop10Set(ratingsByAlbum, weights)).toBeNull();
  });
});

describe('advanceStabilityWindow', () => {
  function set(...ids: string[]): Set<string> {
    return new Set(ids);
  }

  it('never fires if tier never reaches High (insufficient-only session)', () => {
    let state = INITIAL_STABILITY_WINDOW_STATE;
    // Even a perfectly stable top-10 set across many real answers must not fire while every
    // checkpoint is insufficient-tier — insufficient checkpoints are skipped entirely, never
    // counted as eligible, regardless of how large the real-answer span grows.
    for (let i = 1; i <= 20; i++) {
      state = advanceStabilityWindow(state, i, 'insufficient', set('a', 'b', 'c'));
    }
    expect(state.fired).toBe(false);
    expect(state.lastChangeAnswerIndex).toBe(0);
  });

  it('drop-below-High-then-return: an insufficient dip is skipped, does not reset the span or become the comparison anchor', () => {
    // This exact sequence (High -> insufficient -> High) was never exercised by Pass 4's real
    // 71-answer trace — tier never dropped back below High once reached there. This test only
    // confirms the implementation behaves sensibly (matches the spec's stated rule) rather
    // than crashing or silently misbehaving on a case with no real precedent.
    let state: StabilityWindowState = INITIAL_STABILITY_WINDOW_STATE;
    state = advanceStabilityWindow(state, 1, 'high', set('a', 'b', 'c')); // anchor
    expect(state.fired).toBe(false);

    // Dip below High: skipped entirely — must not update lastEligibleTop10/lastChangeAnswerIndex,
    // even with a totally different top-10 set.
    state = advanceStabilityWindow(state, 2, 'insufficient', set('x', 'y', 'z'));
    expect(state.lastChangeAnswerIndex).toBe(1);
    expect(state.lastEligibleTop10).toEqual(set('a', 'b', 'c'));

    // Tier returns to High, 12 real answers after the anchor, with the SAME set as before the
    // dip: compared against the pre-dip eligible checkpoint (not the insufficient one) — the
    // dip must not count toward or reset the span.
    state = advanceStabilityWindow(state, 13, 'high', set('a', 'b', 'c'));
    expect(state.fired).toBe(true); // 13 - 1 = 12
  });

  it('drop-below-High-then-return with a CHANGED set: registers a new change, does not fire', () => {
    let state: StabilityWindowState = INITIAL_STABILITY_WINDOW_STATE;
    state = advanceStabilityWindow(state, 1, 'high', set('a', 'b', 'c')); // anchor
    state = advanceStabilityWindow(state, 2, 'insufficient', set('x', 'y', 'z')); // skipped
    // Returns to High but with a DIFFERENT set than the pre-dip anchor — a real change, even
    // though the span since the anchor would otherwise have been enough to fire.
    state = advanceStabilityWindow(state, 13, 'high', set('a', 'b', 'd'));
    expect(state.fired).toBe(false);
    expect(state.lastChangeAnswerIndex).toBe(13);
  });

  it('is terminal once fired: a later changed set does not un-fire it', () => {
    let state: StabilityWindowState = INITIAL_STABILITY_WINDOW_STATE;
    state = advanceStabilityWindow(state, 1, 'high', set('a', 'b', 'c')); // anchor
    state = advanceStabilityWindow(state, 13, 'high', set('a', 'b', 'c')); // 13-1=12 -> fires
    expect(state.fired).toBe(true);
    state = advanceStabilityWindow(state, 14, 'high', set('completely', 'different', 'set'));
    expect(state.fired).toBe(true);
  });
});

describe('advancePersistedStabilityWindow', () => {
  function set(...ids: string[]): Set<string> {
    return new Set(ids);
  }

  it('a no-op commit (insufficient tier) leaves previous untouched and marks lastCommitChangedWindow false', () => {
    const afterRealChange: PersistedStabilityWindow = {
      current: { lastEligibleTop10: set('a'), lastChangeAnswerIndex: 1, fired: false },
      previous: { lastEligibleTop10: null, lastChangeAnswerIndex: 0, fired: false },
      lastCommitChangedWindow: true,
    };
    // advanceStabilityWindow returns the SAME reference for an insufficient-tier commit —
    // exactly what a no-op commit produces in the real driver loop.
    const noOpNext = advanceStabilityWindow(afterRealChange.current, 2, 'insufficient', set('z'));
    const result = advancePersistedStabilityWindow(afterRealChange, noOpNext);

    expect(result.current).toBe(afterRealChange.current);
    expect(result.previous).toBe(afterRealChange.previous); // untouched, not re-snapshotted
    expect(result.lastCommitChangedWindow).toBe(false);
  });

  it('a real change snapshots the PRIOR current into previous and marks lastCommitChangedWindow true', () => {
    const before: PersistedStabilityWindow = {
      current: { lastEligibleTop10: set('a'), lastChangeAnswerIndex: 1, fired: false },
      previous: INITIAL_STABILITY_WINDOW_STATE,
      lastCommitChangedWindow: true,
    };
    // Matches the anchor's set, so lastChangeAnswerIndex doesn't move — but advanceStabilityWindow
    // still returns a FRESH object (see its own header), so this still counts as "changed" by
    // advancePersistedStabilityWindow's reference-equality check.
    const nextCurrent = advanceStabilityWindow(before.current, 2, 'high', set('a'));
    const result = advancePersistedStabilityWindow(before, nextCurrent);

    expect(result.current).toBe(nextCurrent);
    expect(result.previous).toBe(before.current); // snapshotted
    expect(result.lastCommitChangedWindow).toBe(true);
  });
});

describe('seedWindowHistoryOnResume', () => {
  it('seeds a single entry when the last commit did not change the window', () => {
    const persisted: PersistedStabilityWindow = {
      current: { lastEligibleTop10: new Set(['a']), lastChangeAnswerIndex: 1, fired: true },
      previous: { lastEligibleTop10: null, lastChangeAnswerIndex: 0, fired: false },
      lastCommitChangedWindow: false,
    };
    expect(seedWindowHistoryOnResume(persisted)).toEqual([persisted.current]);
  });

  it('seeds two entries, oldest first, when the last commit DID change the window', () => {
    const persisted: PersistedStabilityWindow = {
      current: { lastEligibleTop10: new Set(['a']), lastChangeAnswerIndex: 1, fired: true },
      previous: { lastEligibleTop10: new Set(['a']), lastChangeAnswerIndex: 1, fired: false },
      lastCommitChangedWindow: true,
    };
    expect(seedWindowHistoryOnResume(persisted)).toEqual([persisted.previous, persisted.current]);
  });
});

describe('popWindowHistory', () => {
  const a: StabilityWindowState = {
    lastEligibleTop10: new Set(['a']),
    lastChangeAnswerIndex: 1,
    fired: false,
  };
  const b: StabilityWindowState = {
    lastEligibleTop10: new Set(['b']),
    lastChangeAnswerIndex: 5,
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

  interface Checkpoint {
    answerIndex: number;
    tier: 'insufficient' | 'high' | 'veryHigh';
    top10: Set<string>;
  }

  /** Replays `checkpoints` from scratch — the ground-truth value, only usable in tests since
   *  the real app can't afford to do this at resume time (see rankingStabilitySignal.ts's
   *  header on the LP-solve cost this would require in production). */
  function trueWindowAfter(checkpoints: Checkpoint[]): StabilityWindowState {
    let state = INITIAL_STABILITY_WINDOW_STATE;
    for (const cp of checkpoints) {
      state = advanceStabilityWindow(state, cp.answerIndex, cp.tier, cp.top10);
    }
    return state;
  }

  /** Drives the full checkpoint list forward through both advanceStabilityWindow and
   *  advancePersistedStabilityWindow, returning the final PersistedStabilityWindow — what
   *  would actually get written to the DB after the real session ends. */
  function persistThroughSession(checkpoints: Checkpoint[]): PersistedStabilityWindow {
    let persisted = INITIAL_PERSISTED_STABILITY_WINDOW;
    for (const cp of checkpoints) {
      const next = advanceStabilityWindow(persisted.current, cp.answerIndex, cp.tier, cp.top10);
      persisted = advancePersistedStabilityWindow(persisted, next);
    }
    return persisted;
  }

  it('a single post-resume Undo is exactly correct (1-entry seed: last commit was a no-op)', () => {
    // Fires 12 real answers after the anchor, then a 3rd checkpoint is a genuine no-op
    // (already fired) — realistic "gate-only-the-jump" shape: eligible commits keep happening
    // after firing.
    const checkpoints: Checkpoint[] = [
      { answerIndex: 1, tier: 'high', top10: set('a') }, // anchor
      { answerIndex: 13, tier: 'high', top10: set('a') }, // matches, 13-1=12 -> FIRES
      { answerIndex: 14, tier: 'high', top10: set('z') }, // no-op (already fired) despite a different set
    ];
    const persisted = persistThroughSession(checkpoints);
    expect(persisted.lastCommitChangedWindow).toBe(false); // confirms the 1-entry-seed branch

    const seed = seedWindowHistoryOnResume(persisted);
    const { current: afterOneUndo } = popWindowHistory(seed);

    const trueAtNMinus1 = trueWindowAfter(checkpoints.slice(0, 2));
    expect(afterOneUndo).toEqual(trueAtNMinus1);
    expect(afterOneUndo.fired).toBe(true);
  });

  it('a single post-resume Undo is exactly correct (2-entry seed: last commit WAS the change)', () => {
    const checkpoints: Checkpoint[] = [
      { answerIndex: 1, tier: 'high', top10: set('a') }, // anchor
      { answerIndex: 13, tier: 'high', top10: set('a') }, // matches, 13-1=12 -> FIRES (last commit)
    ];
    const persisted = persistThroughSession(checkpoints);
    expect(persisted.lastCommitChangedWindow).toBe(true); // confirms the 2-entry-seed branch

    const seed = seedWindowHistoryOnResume(persisted);
    const { current: afterOneUndo } = popWindowHistory(seed);

    const trueAtNMinus1 = trueWindowAfter(checkpoints.slice(0, 1));
    expect(afterOneUndo).toEqual(trueAtNMinus1);
    expect(afterOneUndo.fired).toBe(false); // correctly un-fired: we undid the exact firing commit
  });

  it('two consecutive Undos with zero intervening commits: fired-boolean mismatch case (accepted gap, SAFE direction)', () => {
    // Constructed so the true trajectory fires at checkpoint 2, then checkpoint 3 is a no-op
    // (already fired) with a DIFFERENT top10 set — exactly the "gate-only-the-jump" shape
    // where firing happens and the user keeps answering afterward. Resume happens after
    // checkpoint 3; the user immediately Undoes twice with no new answer in between.
    const checkpoints: Checkpoint[] = [
      { answerIndex: 1, tier: 'high', top10: set('a') }, // cp1: anchor
      { answerIndex: 13, tier: 'high', top10: set('a') }, // cp2: 13-1=12 -> FIRES
      { answerIndex: 14, tier: 'high', top10: set('z') }, // cp3: no-op (already fired)
    ];
    const persisted = persistThroughSession(checkpoints);
    expect(persisted.lastCommitChangedWindow).toBe(false); // 1-entry seed, per the case above

    const seed = seedWindowHistoryOnResume(persisted);
    const { next: afterFirstPop, current: afterFirstUndo } = popWindowHistory(seed);
    // First Undo (removing cp3) is exactly correct, per the case above.
    expect(afterFirstUndo).toEqual(trueWindowAfter(checkpoints.slice(0, 2)));
    expect(afterFirstUndo.fired).toBe(true);

    // Second Undo (removing cp2 too — the ACTUAL firing commit — with zero new commits since
    // the first Undo): no third level of history exists, so this clamps rather than rolling
    // back further.
    const { current: afterSecondUndo } = popWindowHistory(afterFirstPop);
    const trueTwoBack = trueWindowAfter(checkpoints.slice(0, 1)); // cp1 only: anchor, NOT fired

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

  it('two consecutive Undos with zero intervening commits: lastChangeAnswerIndex mismatch, safe direction (re-derived for the duration-based shape, not assumed)', () => {
    // A different shape from the fired-mismatch case above: three REAL changes in a row (each
    // top-10 set differs from the one before it), so the seed is 2 entries wide, and the
    // second Undo's staleness shows up as an inflated lastChangeAnswerIndex rather than
    // touching `fired` (both sides agree fired must still be false at 2-undos-back, since
    // firing only just happened at the very last commit).
    //
    // Supersedes the old K=2-shape test that exercised the equivalent gap on
    // consecutiveMatchRun — that field always incremented by exactly 1 per additional real
    // match, so ANY 2-undo gap necessarily showed a numeric mismatch. lastChangeAnswerIndex is
    // "sticky" (it only moves on an ACTUAL top-10 change, not on every real answer), so proving
    // a mismatch here needs multiple real changes close together — a genuinely different
    // scenario, not a mechanical rename of the old one.
    const checkpoints: Checkpoint[] = [
      { answerIndex: 1, tier: 'high', top10: set('a') }, // cp1: anchor, lastChangeAnswerIndex=1
      { answerIndex: 2, tier: 'high', top10: set('b') }, // cp2: mismatch vs a -> real change, index=2
      { answerIndex: 3, tier: 'high', top10: set('c') }, // cp3: mismatch vs b -> real change, index=3
      { answerIndex: 15, tier: 'high', top10: set('c') }, // cp4: matches c, 15-3=12 -> FIRES
    ];
    const persisted = persistThroughSession(checkpoints);
    expect(persisted.lastCommitChangedWindow).toBe(true); // 2-entry seed (fired flipped on cp4)

    const seed = seedWindowHistoryOnResume(persisted);
    const { next: afterFirstPop, current: afterFirstUndo } = popWindowHistory(seed);
    expect(afterFirstUndo).toEqual(trueWindowAfter(checkpoints.slice(0, 3)));
    expect(afterFirstUndo.fired).toBe(false);
    expect(afterFirstUndo.lastChangeAnswerIndex).toBe(3); // cp3 was itself the last real change

    const { current: afterSecondUndo } = popWindowHistory(afterFirstPop);
    const trueTwoBack = trueWindowAfter(checkpoints.slice(0, 2)); // cp1, cp2: lastChangeAnswerIndex=2

    expect(afterSecondUndo).not.toEqual(trueTwoBack); // stale: clamp is stuck at cp3's state
    expect(afterSecondUndo.fired).toBe(false);
    expect(trueTwoBack.fired).toBe(false); // both agree on fired here — only the index drifts
    expect(afterSecondUndo.lastChangeAnswerIndex).not.toBe(trueTwoBack.lastChangeAnswerIndex);
    // Safe direction, re-derived (not assumed) for this shape: lastChangeAnswerIndex is
    // monotonically non-decreasing along the true trajectory (a real change only ever sets it
    // to the CURRENT, strictly larger index — see advanceStabilityWindow), so the clamp can
    // only be stuck at a state whose lastChangeAnswerIndex is >= the true deeper state's —
    // i.e. it can only make the window look LESS recently changed than truth requires (safer),
    // never MORE recently changed than truth (which would manufacture spurious stability).
    expect(afterSecondUndo.lastChangeAnswerIndex).toBeGreaterThan(
      trueTwoBack.lastChangeAnswerIndex
    );
  });

  it('Undo removing the actual answer that caused the last change, then continuing, exactly reproduces a session that never had that answer — never manufactures an early fire', () => {
    // "Detour" scenario: the user sits at the anchor ('a'), then answers a comparison that
    // genuinely disrupts the top-10 set ('b' — a real, registered change), immediately regrets
    // it and hits Undo, then answers a DIFFERENT real question that happens to land back on
    // the anchor's set. This is exactly the case flagged as worth checking rather than assumed
    // safe: could Undo leave `lastChangeAnswerIndex` stuck referencing the removed detour,
    // making the window look more settled than the edited history honestly supports (a
    // false-early fire on continued replay)?
    const preDetour: Checkpoint[] = [{ answerIndex: 1, tier: 'high', top10: set('a') }]; // anchor
    const detourAnswer: Checkpoint = { answerIndex: 2, tier: 'high', top10: set('b') }; // real change, soon regretted
    const replacementAnswer: Checkpoint = { answerIndex: 2, tier: 'high', top10: set('a') }; // re-answered at the same (post-undo) index, lands back on the anchor's set

    // Live session: answer #1, then the detour (#2, registers a real change to 'b'), then
    // immediately Undo it.
    const persistedThroughDetour = persistThroughSession([...preDetour, detourAnswer]);
    expect(persistedThroughDetour.lastCommitChangedWindow).toBe(true); // the detour WAS the change-causing commit
    const seed = seedWindowHistoryOnResume(persistedThroughDetour);
    const { current: revertedCurrent } = popWindowHistory(seed);
    // Single-Undo exactness (proven in the cases above) already guarantees this equals the
    // pre-detour truth — confirmed concretely here too, not just relied on.
    expect(revertedCurrent).toEqual(trueWindowAfter(preDetour));

    // User answers again — a genuinely different comparison, which happens to land back on
    // 'a'. Since the detour was fully REMOVED (not just hidden), this becomes real answer #2
    // again, not #3.
    const afterReplay = advanceStabilityWindow(
      revertedCurrent,
      replacementAnswer.answerIndex,
      replacementAnswer.tier,
      replacementAnswer.top10
    );

    // Ground truth: a session that never had the detour at all, going straight from #1 to this
    // same real answer #2.
    const cleanBaseline = trueWindowAfter([...preDetour, replacementAnswer]);

    expect(afterReplay).toEqual(cleanBaseline); // byte-for-byte identical to honest history —
    // not just "delayed", but EXACT: there is no separate stale-bookkeeping failure mode to
    // characterize here, because the reverted state IS the true state of the edited history.
    expect(afterReplay.lastChangeAnswerIndex).toBe(1); // NOT stuck at the undone detour's index (2)

    // Contrast, to show the comparison the other direction: if the detour had instead been
    // KEPT as real, permanent history (no Undo) and this same replacement answer arrived as a
    // genuinely later real answer, reverting 'b' back to 'a' is ITSELF a second real change
    // (relative to the kept 'b' checkpoint) — lastChangeAnswerIndex jumps to that later index
    // instead of staying at 1, requiring MORE real-answer evidence before firing than the
    // honest/undone path needs. Undo can only remove disruptive evidence the edited history no
    // longer contains — it never invents settledness beyond what the edited log honestly shows.
    const keptDetourState = advanceStabilityWindow(
      trueWindowAfter([...preDetour, detourAnswer]),
      3,
      'high',
      set('a') // reverts back to 'a', but relative to the KEPT 'b' checkpoint this IS a change
    );
    expect(keptDetourState.lastChangeAnswerIndex).toBe(3);
    expect(keptDetourState.lastChangeAnswerIndex).toBeGreaterThan(
      afterReplay.lastChangeAnswerIndex
    );
  });
});
