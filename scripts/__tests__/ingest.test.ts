import { describe, it, expect } from 'vitest';
import { isGenuineReview, isAllowlistedFranchise, shouldSkipPost } from '../ingest';

describe('shouldSkipPost — non-review post filtering', () => {
  it('skips an Angry Metal Guy roundup post (no Reviews/Review category)', () => {
    const item = {
      categories: ["Record o' the Month", '2026', 'At the Gates', "Record(s) o' the Month"],
    };
    expect(shouldSkipPost(item, 'Angry Metal Guy')).toBe(true);
  });

  it('skips a Progressive Subway retrospective column ("Lost in Time")', () => {
    const item = {
      categories: ['Lost in Time', '2012', 'mathcore', 'lost in time'],
    };
    expect(shouldSkipPost(item, 'The Progressive Subway')).toBe(true);
  });

  it('does NOT skip an allowlisted AMG Unsigned Band Rodeo post', () => {
    const item = {
      categories: [
        "Angry Metal Guy's Unsigned Band Rodeo",
        '2025',
        'Death Metal',
        'Review',
        'Reviews',
      ],
    };
    expect(isAllowlistedFranchise(item, 'Angry Metal Guy')).toBe(true);
    expect(shouldSkipPost(item, 'Angry Metal Guy')).toBe(false);
  });

  it('does NOT skip a normal Angry Metal Guy review', () => {
    const item = {
      categories: ['Reviews', '2026', 'Death Metal', 'Review'],
    };
    expect(isGenuineReview(item, 'Angry Metal Guy')).toBe(true);
    expect(shouldSkipPost(item, 'Angry Metal Guy')).toBe(false);
  });

  it('does NOT skip a normal Progressive Subway review', () => {
    const item = {
      categories: ['Album Reviews', '2026', 'progressive metal'],
    };
    expect(shouldSkipPost(item, 'The Progressive Subway')).toBe(false);
  });

  it('never skips Metal Storm items (no tag check configured for that source)', () => {
    const item = { categories: [] };
    expect(shouldSkipPost(item, 'Metal Storm')).toBe(false);
  });
});
