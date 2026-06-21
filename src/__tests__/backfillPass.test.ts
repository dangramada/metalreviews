import { describe, it, expect } from 'vitest';
import { selectBackfillCandidates } from '../../scripts/ingest';
import type { MetalReview } from '../types';

const NOW = new Date('2026-06-21T12:00:00.000Z');
const RECENT = '2026-06-18T00:00:00.000Z'; // 3 days ago — within 14-day window
const OLD = '2026-06-01T00:00:00.000Z';    // 20 days ago — outside 14-day window

const base: MetalReview = {
  id: 'abc',
  source: 'Angry Metal Guy',
  band: 'Malist',
  album: 'Eternal Echo of the Fall',
  genre: ['black metal'],
  score: '8/10',
  normalizedScore: 80,
  summary: 'A cold, bleak record.',
  url: 'https://example.com/review',
  publishedAt: OLD,
  publishedDate: '01 Jun 2026',
  artworkUrl: 'https://cdn.example.com/art.jpg',
  releaseDate: null, // incomplete — missing releaseDate
};

const complete: MetalReview = {
  ...base,
  id: 'complete',
  artworkUrl: 'https://cdn.example.com/art.jpg',
  genre: ['black metal'],
  releaseDate: '2026-06-12',
};

describe('selectBackfillCandidates', () => {
  it('includes an incomplete row under the cap', () => {
    const result = selectBackfillCandidates(
      [base],
      new Set(),
      new Map([['abc', 2]]),
      NOW
    );
    expect(result.map((r) => r.id)).toContain('abc');
  });

  it('excludes a row past the cap: attempts >= 5 AND age > 14 days', () => {
    const result = selectBackfillCandidates(
      [base], // publishedAt = OLD (20 days ago)
      new Set(),
      new Map([['abc', 5]]),
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it('includes a row with attempts >= 5 but age <= 14 days (age is the binding constraint)', () => {
    const recent = { ...base, id: 'recent', publishedAt: RECENT };
    const result = selectBackfillCandidates(
      [recent],
      new Set(),
      new Map([['recent', 5]]),
      NOW
    );
    expect(result.map((r) => r.id)).toContain('recent');
  });

  it('includes a row older than 14 days but attempts < 5', () => {
    const result = selectBackfillCandidates(
      [base], // OLD, but only 4 attempts
      new Set(),
      new Map([['abc', 4]]),
      NOW
    );
    expect(result.map((r) => r.id)).toContain('abc');
  });

  it('excludes a row where all three MB fields are present', () => {
    const result = selectBackfillCandidates(
      [complete],
      new Set(),
      new Map([['complete', 0]]),
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it('excludes a row already present in finalIds (covered by RSS loop this run)', () => {
    const result = selectBackfillCandidates(
      [base],
      new Set(['abc']),
      new Map([['abc', 0]]),
      NOW
    );
    expect(result).toHaveLength(0);
  });

  it('treats a missing attempts entry as 0 (new row never retried)', () => {
    const result = selectBackfillCandidates(
      [base],
      new Set(),
      new Map(), // no entry for 'abc'
      NOW
    );
    expect(result.map((r) => r.id)).toContain('abc');
  });

  it('includes a row missing artworkUrl even when genre and releaseDate are present', () => {
    const noArtwork = { ...base, id: 'no-art', artworkUrl: null, releaseDate: '2026-06-12' };
    const result = selectBackfillCandidates(
      [noArtwork],
      new Set(),
      new Map([['no-art', 0]]),
      NOW
    );
    expect(result.map((r) => r.id)).toContain('no-art');
  });

  it('includes a row missing genre even when artworkUrl and releaseDate are present', () => {
    const noGenre = { ...base, id: 'no-genre', genre: [], releaseDate: '2026-06-12' };
    const result = selectBackfillCandidates(
      [noGenre],
      new Set(),
      new Map([['no-genre', 0]]),
      NOW
    );
    expect(result.map((r) => r.id)).toContain('no-genre');
  });
});
