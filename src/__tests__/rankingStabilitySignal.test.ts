import { describe, it, expect } from 'vitest';
import {
  toFlatWeights,
  computeTop10Set,
  advanceStabilityWindow,
  INITIAL_STABILITY_WINDOW_STATE,
  type StabilityWindowState,
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
