import { describe, it, expect } from 'vitest';
import {
  isGenuineReview,
  isAllowlistedFranchise,
  isDenylistedFranchise,
  shouldSkipPost,
} from '../ingest';

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

  it('skips an AMG Unsigned Band Rodeo post even when tagged Review/Reviews (denylisted for title-format/multi-score inconsistency)', () => {
    const item = {
      categories: [
        "Angry Metal Guy's Unsigned Band Rodeo",
        '2025',
        'Death Metal',
        'Review',
        'Reviews',
      ],
    };
    expect(isAllowlistedFranchise(item, 'Angry Metal Guy')).toBe(false);
    expect(isDenylistedFranchise(item, 'Angry Metal Guy')).toBe(true);
    expect(shouldSkipPost(item, 'Angry Metal Guy')).toBe(true);
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

  it('skips an AMG "Into the Obscure" post even when mistagged with Review/Reviews', () => {
    const item = {
      categories: ['Into the Obscure', '1997', 'Death Metal', 'Review', 'Reviews'],
    };
    expect(isGenuineReview(item, 'Angry Metal Guy')).toBe(true);
    expect(isDenylistedFranchise(item, 'Angry Metal Guy')).toBe(true);
    expect(shouldSkipPost(item, 'Angry Metal Guy')).toBe(true);
  });

  it('skips a realistic AMG Unsigned Band Rodeo post title ("Beware of Gods")', () => {
    const item = {
      categories: [
        "Angry Metal Guy's Unsigned Band Rodeo",
        '2026',
        'Death Metal',
        'Review',
        'Reviews',
      ],
      title:
        'AMG’s Unsigned Band Rodeö: Beware of Gods – Upon Whom The Last Light Descends III: Behead The Oracle',
    };
    expect(isDenylistedFranchise(item, 'Angry Metal Guy')).toBe(true);
    expect(shouldSkipPost(item, 'Angry Metal Guy')).toBe(true);
  });

  it('skips an AMG "Stuck in the Filter" post even when mistagged with Review/Reviews', () => {
    const item = {
      categories: ['Reviews', 'Stuck in the Filter', 'Death Metal', 'Review', 'Stuck in the Filter 2026'],
    };
    expect(isGenuineReview(item, 'Angry Metal Guy')).toBe(true);
    expect(isDenylistedFranchise(item, 'Angry Metal Guy')).toBe(true);
    expect(shouldSkipPost(item, 'Angry Metal Guy')).toBe(true);
  });
});
