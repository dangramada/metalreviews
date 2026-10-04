import { describe, it, expect } from 'vitest';
import {
  parseReleaseDate,
  maxReleaseYear,
  releaseDateError,
  RELEASE_DATE_PATTERN,
} from '../lib/aoty/releaseDate';

const NOW = new Date(2026, 9, 4);

describe('parseReleaseDate', () => {
  it.each([
    '2024',
    '2024-03',
    '2024-03-15',
    '1900',
    '1900-01-01',
    '2027',
    '2027-12-31',
    '2024-02-29',
  ])('accepts %s and keeps it as typed', (v) => {
    expect(parseReleaseDate(v, NOW)).toEqual({ ok: true, value: v, year: Number(v.slice(0, 4)) });
  });

  it('trims surrounding whitespace only', () => {
    expect(parseReleaseDate('  2024-03 ', NOW)).toEqual({ ok: true, value: '2024-03', year: 2024 });
    expect(parseReleaseDate('2024 03', NOW)).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects the 3036 case and the years either side of the range', () => {
    expect(parseReleaseDate('3036-06-26', NOW)).toEqual({ ok: false, reason: 'range' });
    expect(parseReleaseDate('1899', NOW)).toEqual({ ok: false, reason: 'range' });
    expect(parseReleaseDate('2028', NOW)).toEqual({ ok: false, reason: 'range' });
  });

  it('derives the upper bound from the clock, not a constant', () => {
    expect(maxReleaseYear(NOW)).toBe(2027);
    expect(parseReleaseDate('2028', new Date(2027, 0, 1)).ok).toBe(true);
    expect(parseReleaseDate('2029', new Date(2027, 0, 1)).ok).toBe(false);
  });

  it('checks the real day of the month, including leap years', () => {
    expect(parseReleaseDate('2024-02-30', NOW)).toEqual({ ok: false, reason: 'date' });
    expect(parseReleaseDate('2023-02-29', NOW)).toEqual({ ok: false, reason: 'date' });
    expect(parseReleaseDate('1900-02-29', NOW)).toEqual({ ok: false, reason: 'date' });
    expect(parseReleaseDate('2024-04-31', NOW)).toEqual({ ok: false, reason: 'date' });
    expect(parseReleaseDate('2024-12-31', NOW).ok).toBe(true);
  });

  it('does not let the timezone move a day (no Date parsing of the string)', () => {
    const r = parseReleaseDate('2024-03-31', NOW);
    expect(r.ok && r.value).toBe('2024-03-31');
  });

  it('exposes the same pattern for the SQL comparison test', () => {
    expect(RELEASE_DATE_PATTERN.test('2024-03')).toBe(true);
  });
});

describe('releaseDateError', () => {
  it('has copy for each failure, with the derived upper year and no dashes', () => {
    expect(releaseDateError('range', NOW)).toBe('Enter a year between 1900 and 2027.');
    for (const r of ['format', 'range', 'date'] as const) {
      expect(releaseDateError(r, NOW)).not.toMatch(/[—–]/);
    }
  });
});
