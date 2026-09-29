import { describe, expect, it } from 'vitest';
import { isFirstFullRating } from '../AlbumRatingPage';

describe('isFirstFullRating', () => {
  it('is true on the transition into fully-rated (5 -> 6)', () => {
    expect(isFirstFullRating(5, 6)).toBe(true);
  });

  it('is false editing an already-fully-rated album (6 -> 6)', () => {
    expect(isFirstFullRating(6, 6)).toBe(false);
  });

  it('is false for any non-completing edit (4 -> 5)', () => {
    expect(isFirstFullRating(4, 5)).toBe(false);
  });

  it('is false at zero ratings (0 -> 1)', () => {
    expect(isFirstFullRating(0, 1)).toBe(false);
  });
});
