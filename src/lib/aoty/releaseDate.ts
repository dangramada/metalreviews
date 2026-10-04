// Client twin of the SQL validation in supabase/albums-fill-missing-release-date-v2.sql.
// src/__tests__/releaseDateSql.test.ts fails if the two disagree. Accepts YYYY, YYYY-MM and
// YYYY-MM-DD (the shapes the catalog already holds) and returns the string as typed, trimmed:
// release_date is text, so there is no Date round-trip that could shift a day by timezone.

// Same pattern as the function body; the test pulls the literal out of the SQL file.
export const RELEASE_DATE_PATTERN = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

export const MIN_RELEASE_YEAR = 1900;

// Derived from the clock, never hardcoded: one year past today allows next year's announced
// releases.
export const maxReleaseYear = (now: Date = new Date()) => now.getFullYear() + 1;

export type ReleaseDateFailure = 'format' | 'range' | 'date';

export type ReleaseDateParse =
  | { ok: true; value: string; year: number }
  | { ok: false; reason: ReleaseDateFailure };

export function parseReleaseDate(input: string, now: Date = new Date()): ReleaseDateParse {
  const value = input.trim();
  if (!RELEASE_DATE_PATTERN.test(value)) return { ok: false, reason: 'format' };
  const year = Number(value.slice(0, 4));
  if (year < MIN_RELEASE_YEAR || year > maxReleaseYear(now)) return { ok: false, reason: 'range' };
  if (value.length === 10) {
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    // Day 0 of the next month is the last day of this one (month is 1-based here); UTC so the
    // local timezone cannot move it.
    if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return { ok: false, reason: 'date' };
  }
  return { ok: true, value, year };
}

export function releaseDateError(reason: ReleaseDateFailure, now: Date = new Date()): string {
  switch (reason) {
    case 'format':
      return 'Use a year, a year and month, or a full date, like 2024, 2024-03 or 2024-03-15.';
    case 'range':
      return `Enter a year between ${MIN_RELEASE_YEAR} and ${maxReleaseYear(now)}.`;
    case 'date':
      return 'That date does not exist.';
  }
}
