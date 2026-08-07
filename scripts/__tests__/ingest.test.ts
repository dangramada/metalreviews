import { describe, it, expect, vi } from 'vitest';
import {
  isGenuineReview,
  isAllowlistedFranchise,
  isDenylistedFranchise,
  shouldSkipPost,
  filterAlreadySkipped,
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

// Safety net covering the 2026-08-07 stale-deploy regression: a post whose shouldSkipPost
// filtering was bypassed upstream (e.g. this process running old denylist code) but which
// already has a correct skipped_posts row from a different, up-to-date process — see
// docs/decisions/roundup-skip-fix.md's stale-deploy addendum.
describe('filterAlreadySkipped — skipped_posts safety net', () => {
  const makeRaw = (url: string) => ({
    source: 'Angry Metal Guy',
    band: 'Stuck in the Filter',
    album: "May 2026's Angry Misses",
    score: '',
    summary: '',
    url,
    publishedAt: new Date('2026-08-04T16:44:22Z'),
  });

  it('passes everything through when the skip set is empty', () => {
    const raw = [makeRaw('https://www.angrymetalguy.com/a/'), makeRaw('https://www.angrymetalguy.com/b/')];
    expect(filterAlreadySkipped(raw, new Set())).toEqual(raw);
  });

  it('filters out a raw review whose URL is already in skipped_posts, even though it reached allRaw', () => {
    // Simulates exactly the confirmed regression: shouldSkipPost (stale process) let it
    // through, but skipped_posts (logged by a correct process) already has this URL.
    const bad = makeRaw('https://www.angrymetalguy.com/stuck-in-the-filter-may-2026s-angry-misses/');
    const good = makeRaw('https://www.angrymetalguy.com/a-genuine-review/');
    const result = filterAlreadySkipped([bad, good], new Set([bad.url]));
    expect(result).toEqual([good]);
  });

  it('logs a distinguishable message when a match is filtered', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const bad = makeRaw('https://www.angrymetalguy.com/already-skipped/');
    filterAlreadySkipped([bad], new Set([bad.url]));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Safety-net skip'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(bad.url));
    logSpy.mockRestore();
  });

  it('does not log for URLs that pass through', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    filterAlreadySkipped([makeRaw('https://www.angrymetalguy.com/fine/')], new Set());
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
