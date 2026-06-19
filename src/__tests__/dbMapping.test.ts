import { describe, it, expect } from 'vitest';
import { fromDbRow } from '../dbMapping';
import type { DbRow } from '../dbMapping';

const row: DbRow = {
  id: 'abc123',
  band: 'Opeth',
  album: 'Blackwater Park',
  source: 'Angry Metal Guy',
  score: '9/10',
  normalized_score: 90,
  summary: 'A landmark album.',
  url: 'https://example.com/review',
  published_at: '2024-01-15T00:00:00.000Z',
  published_date: '15 Jan 2024',
  artwork_url: 'https://cdn.example.com/art.jpg',
  genre: ['progressive metal', 'death metal'],
};

describe('fromDbRow', () => {
  it('maps all snake_case fields to camelCase', () => {
    const review = fromDbRow(row);
    expect(review.id).toBe('abc123');
    expect(review.normalizedScore).toBe(90);
    expect(review.publishedAt).toBe('2024-01-15T00:00:00.000Z');
    expect(review.publishedDate).toBe('15 Jan 2024');
    expect(review.artworkUrl).toBe('https://cdn.example.com/art.jpg');
    expect(review.genre).toEqual(['progressive metal', 'death metal']);
  });

  it('fills nullable fields with safe defaults', () => {
    const sparse: DbRow = {
      ...row,
      score: null,
      normalized_score: null,
      summary: null,
      url: null,
      published_at: null,
      published_date: null,
      artwork_url: null,
      genre: null,
    };
    const review = fromDbRow(sparse);
    expect(review.score).toBe('');
    expect(review.normalizedScore).toBe(0);
    expect(review.summary).toBe('');
    expect(review.url).toBe('');
    expect(review.genre).toEqual([]);
    expect(review.artworkUrl).toBeNull();
  });

  it('sets publishedAt to current time when published_at is null', () => {
    const before = Date.now();
    const review = fromDbRow({ ...row, published_at: null });
    const after = Date.now();
    const reviewTime = new Date(review.publishedAt).getTime();
    expect(reviewTime).toBeGreaterThanOrEqual(before);
    expect(reviewTime).toBeLessThanOrEqual(after);
  });
});
