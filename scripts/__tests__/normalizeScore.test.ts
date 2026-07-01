import { describe, it, expect } from 'vitest';
import { normalizeScore } from '../ingest';

describe('normalizeScore sanity guard', () => {
  it('normalizes a clean X/10 score', () => {
    expect(normalizeScore('8.5/10')).toBe(85);
  });

  it('normalizes a clean percentage score', () => {
    expect(normalizeScore('72%')).toBe(72);
  });

  it('normalizes a clean bare number (assumed out of 10)', () => {
    expect(normalizeScore('7')).toBe(70);
  });

  it('treats an empty raw score as "no score" (0), not a failure', () => {
    expect(normalizeScore('')).toBe(0);
  });

  it('rejects a footnote-polluted score with excess decimal precision', () => {
    // Real-world corrupted value seen in production: (8.5/109)*10 stored as this string.
    expect(normalizeScore('0.7798165137614679/10')).toBeNull();
  });

  it('rejects a slash score whose computed result falls outside 0-100', () => {
    expect(normalizeScore('8.5/0')).toBeNull();
  });

  it('rejects a bare number with excess decimal precision', () => {
    expect(normalizeScore('8.59')).toBeNull();
  });

  it('rejects an out-of-range percentage', () => {
    expect(normalizeScore('150%')).toBeNull();
  });
});
