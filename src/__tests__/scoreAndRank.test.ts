import { describe, expect, it } from 'vitest';
import {
  compareAotyOrder,
  computeScore,
  criterionContributions,
  criterionImportanceOrder,
  rankAlbum,
  type AotyCandidate,
} from '../lib/album-rating/scoreAndRank';

describe('computeScore', () => {
  const weights = [
    { criterionId: 0, level: 3, value: 0.1 },
    { criterionId: 1, level: 5, value: 0.25 },
    { criterionId: 2, level: 1, value: 0.02 },
  ];

  it('sums the value for each rated (criterion, level) pair', () => {
    const score = computeScore(
      [
        { criterionId: 0, level: 3 },
        { criterionId: 1, level: 5 },
        { criterionId: 2, level: 1 },
      ],
      weights
    );
    expect(score).toBeCloseTo(0.37, 10);
  });

  it('returns null when a (criterion, level) value is missing rather than throwing', () => {
    const score = computeScore(
      [
        { criterionId: 0, level: 3 },
        { criterionId: 1, level: 4 }, // no weight for level 4
      ],
      weights
    );
    expect(score).toBeNull();
  });
});

describe('rankAlbum', () => {
  const scored = [
    { albumId: 'a', score: 0.8 },
    { albumId: 'b', score: 0.95 },
    { albumId: 'c', score: 0.5 },
  ];

  it('ranks descending by score', () => {
    expect(rankAlbum('b', scored)).toBe(1);
    expect(rankAlbum('a', scored)).toBe(2);
    expect(rankAlbum('c', scored)).toBe(3);
  });

  it('breaks exact ties deterministically by albumId', () => {
    const tied = [
      { albumId: 'zzz', score: 0.5 },
      { albumId: 'aaa', score: 0.5 },
    ];
    expect(rankAlbum('aaa', tied)).toBe(1);
    expect(rankAlbum('zzz', tied)).toBe(2);
  });

  it('returns 0 when the album is not present in the scored list', () => {
    expect(rankAlbum('missing', scored)).toBe(0);
  });
});

describe('criterionContributions', () => {
  it('returns the per-criterion values, or null when a weight is missing', () => {
    const w = [{ criterionId: 0, level: 1, value: 0.2 }];
    expect(criterionContributions([{ criterionId: 0, level: 1 }], w)).toEqual(new Map([[0, 0.2]]));
    expect(criterionContributions([{ criterionId: 1, level: 1 }], w)).toBeNull();
  });
});

describe('criterionImportanceOrder', () => {
  it('orders by weight spread descending, then criterion id ascending', () => {
    const w = [
      { criterionId: 2, level: 1, value: 0 },
      { criterionId: 2, level: 2, value: 0.3 },
      { criterionId: 0, level: 1, value: 0 },
      { criterionId: 0, level: 2, value: 0.1 },
      { criterionId: 1, level: 1, value: 0.5 },
      { criterionId: 1, level: 2, value: 0.6 },
    ];
    expect(criterionImportanceOrder(w)).toEqual([2, 0, 1]);
  });

  it('breaks an equal spread by criterion id', () => {
    const w = [
      { criterionId: 3, level: 1, value: 0 },
      { criterionId: 3, level: 2, value: 0.2 },
      { criterionId: 1, level: 1, value: 0 },
      { criterionId: 1, level: 2, value: 0.2 },
    ];
    expect(criterionImportanceOrder(w)).toEqual([1, 3]);
  });
});

// Synthetic values only. Score gaps: ~5e-8 and ~8e-8 tie at 6 decimals, ~1e-4 does not, and a
// ~2e-10 gap that straddles a rounding boundary still orders by score.
describe('compareAotyOrder', () => {
  const mk = (
    albumId: string,
    score: number,
    contrib: [number, number][] = [],
    band = 'Band',
    album = albumId
  ): AotyCandidate => ({ albumId, band, album, score, contributions: new Map(contrib) });
  const sortIds = (list: AotyCandidate[], order = [0, 1]) =>
    [...list].sort(compareAotyOrder(order)).map((c) => c.albumId);

  it('orders distinct scores descending', () => {
    expect(sortIds([mk('a', 0.5), mk('b', 0.7), mk('c', 0.6)])).toEqual(['b', 'c', 'a']);
  });

  it('treats a ~1e-4 gap as a real difference', () => {
    expect(sortIds([mk('a', 0.7), mk('b', 0.7001)])).toEqual(['b', 'a']);
  });

  it.each([5e-8, 8e-8])('treats a %s gap as a tie and falls to the criterion tie-break', (gap) => {
    const hi = mk('hi', 0.7 + gap, [[0, 0.1]]);
    const lo = mk('lo', 0.7, [[0, 0.3]]);
    expect(sortIds([hi, lo])).toEqual(['lo', 'hi']);
  });

  it('orders by score when a ~2e-10 gap crosses a rounding boundary', () => {
    const above = mk('above', 0.7000005 + 1e-10, [[0, 0.1]]);
    const below = mk('below', 0.7000005 - 1e-10, [[0, 0.9]]);
    expect(sortIds([below, above])).toEqual(['above', 'below']);
  });

  it('falls to the next criterion when the first is tied after rounding', () => {
    const a = mk('a', 0.7, [
      [0, 0.2],
      [1, 0.1],
    ]);
    const b = mk('b', 0.7, [
      [0, 0.2 + 5e-8],
      [1, 0.3],
    ]);
    expect(sortIds([a, b])).toEqual(['b', 'a']);
  });

  it('falls to band, then album, then albumId when everything else ties', () => {
    expect(sortIds([mk('x', 0.7, [], 'Zed'), mk('y', 0.7, [], 'Abe')])).toEqual(['y', 'x']);
    expect(sortIds([mk('x', 0.7, [], 'Same', 'B'), mk('y', 0.7, [], 'Same', 'A')])).toEqual([
      'y',
      'x',
    ]);
    expect(sortIds([mk('2', 0.7), mk('1', 0.7)])).toEqual(['1', '2']);
  });

  it('gives the same order for every input permutation', () => {
    const list = [
      mk('a', 0.7, [[0, 0.1]]),
      mk('b', 0.7 + 5e-8, [[0, 0.3]]),
      mk('c', 0.7001),
      mk('d', 0.5, [], 'A'),
      mk('e', 0.5, [], 'B'),
    ];
    const expected = sortIds(list);
    for (const p of [
      [4, 3, 2, 1, 0],
      [2, 0, 4, 1, 3],
      [1, 3, 0, 2, 4],
    ]) {
      expect(sortIds(p.map((i) => list[i]))).toEqual(expected);
    }
  });
});
