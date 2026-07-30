import { describe, expect, it } from 'vitest';
import { computeScore, rankAlbum } from '../lib/album-rating/scoreAndRank';

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
