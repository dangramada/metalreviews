import { describe, it, expect } from 'vitest';
import { applyMergeGuard } from '../../scripts/ingest';
import type { MetalReview } from '../types';

const base: MetalReview = {
  id: 'abc',
  source: 'Angry Metal Guy',
  band: 'Opeth',
  album: 'Blackwater Park',
  genre: ['progressive metal', 'death metal'],
  score: '9/10',
  normalizedScore: 90,
  summary: 'Great album',
  url: 'https://example.com',
  publishedAt: '2024-01-01T00:00:00.000Z',
  publishedDate: '01 Jan 2024',
  artworkUrl: 'https://cdn.example.com/art.jpg',
  releaseDate: null,
};

describe('applyMergeGuard', () => {
  it('uses fresh artworkUrl when it is a non-null string', () => {
    const fresh = { ...base, artworkUrl: 'https://new.example.com/art.jpg' };
    const existing = new Map([['abc', { ...base, artworkUrl: 'https://old.example.com/art.jpg' }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.artworkUrl).toBe('https://new.example.com/art.jpg');
  });

  it('keeps existing artworkUrl when fresh artworkUrl is null', () => {
    const fresh = { ...base, artworkUrl: null };
    const existing = new Map([['abc', { ...base, artworkUrl: 'https://old.example.com/art.jpg' }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.artworkUrl).toBe('https://old.example.com/art.jpg');
  });

  it('uses null artworkUrl when fresh is null and there is no existing row', () => {
    const fresh = { ...base, id: 'new-id', artworkUrl: null };
    const existing = new Map<string, MetalReview>();
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.artworkUrl).toBeNull();
  });

  it('uses fresh genre when it is non-empty', () => {
    const fresh = { ...base, genre: ['doom metal'] };
    const existing = new Map([['abc', { ...base, genre: ['progressive metal'] }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.genre).toEqual(['doom metal']);
  });

  it('keeps existing genre when fresh genre is empty', () => {
    const fresh = { ...base, genre: [] };
    const existing = new Map([['abc', { ...base, genre: ['progressive metal', 'death metal'] }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.genre).toEqual(['progressive metal', 'death metal']);
  });

  it('uses empty genre when fresh is empty and there is no existing row', () => {
    const fresh = { ...base, id: 'new-id', genre: [] };
    const existing = new Map<string, MetalReview>();
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.genre).toEqual([]);
  });

  it('preserves existing rows not present in fresh results', () => {
    const oldReview = { ...base, id: 'old-only', band: 'Candlemass', album: 'Epicus' };
    const fresh = [{ ...base, id: 'fresh-only', band: 'Paradise Lost', album: 'Gothic' }];
    const existing = new Map([['old-only', oldReview]]);
    const result = applyMergeGuard(existing, fresh);
    expect(result.some((r) => r.id === 'old-only')).toBe(true);
    expect(result.some((r) => r.id === 'fresh-only')).toBe(true);
  });

  it('uses fresh releaseDate when it is more precise than existing (full overwrites year-only)', () => {
    const fresh = { ...base, releaseDate: '2024-03-15' };
    const existing = new Map([['abc', { ...base, releaseDate: '2024' }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.releaseDate).toBe('2024-03-15');
  });

  it('keeps existing releaseDate when fresh is less precise (year-only does NOT overwrite full date)', () => {
    const fresh = { ...base, releaseDate: '2024' };
    const existing = new Map([['abc', { ...base, releaseDate: '2024-03-15' }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.releaseDate).toBe('2024-03-15');
  });

  it('keeps existing releaseDate when fresh is null', () => {
    const fresh = { ...base, releaseDate: null };
    const existing = new Map([['abc', { ...base, releaseDate: '2024-03-15' }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.releaseDate).toBe('2024-03-15');
  });

  it('stays null when both fresh and existing releaseDate are null', () => {
    const fresh = { ...base, releaseDate: null };
    const existing = new Map([['abc', { ...base, releaseDate: null }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.releaseDate).toBeNull();
  });

  it('sorts output by publishedAt descending', () => {
    const older = { ...base, id: 'older', publishedAt: '2024-01-01T00:00:00.000Z' };
    const newer = { ...base, id: 'newer', publishedAt: '2024-06-01T00:00:00.000Z' };
    const result = applyMergeGuard(new Map(), [older, newer]);
    expect(result[0].id).toBe('newer');
    expect(result[1].id).toBe('older');
  });
});
