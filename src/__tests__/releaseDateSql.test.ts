import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseReleaseDate } from '../lib/aoty/releaseDate';

// Keeps parseReleaseDate and the validation in fill_missing_release_date (v2) from drifting.
// The samples live in the SQL file's header and the regex literal in its body; this reads both
// from the file, so editing either side alone fails here.
const sql = readFileSync(
  resolve(__dirname, '../../supabase/albums-fill-missing-release-date-v2.sql'),
  'utf8'
);

function samples(kind: string): string[] {
  const line = sql.split('\n').find((l) => l.startsWith(`--   ${kind}:`));
  if (!line) throw new Error(`no ${kind} sample line in the SQL header`);
  return line
    .slice(line.indexOf(':') + 1)
    .trim()
    .split(/\s+/)
    .map((t) => (t === "''" ? '' : t));
}

// Postgres ARE and JS agree on this pattern's syntax (anchors, \d, groups, classes).
const sqlRegex = (() => {
  const m = sql.match(/p_release_date !~ '([^']+)'/);
  if (!m) throw new Error('regex literal not found in the SQL body');
  return new RegExp(m[1]);
})();

// The header's samples are judged as of 2026 (valid years 1900..2027).
const NOW = new Date(2026, 9, 4);

describe('parseReleaseDate and fill_missing_release_date v2 agree', () => {
  it('has samples to compare', () => {
    expect(samples('accept').length).toBeGreaterThan(5);
    expect(samples('reject-format').length).toBeGreaterThan(5);
    expect(samples('reject-range').length).toBeGreaterThan(3);
    expect(samples('reject-date').length).toBeGreaterThan(2);
  });

  it.each(samples('accept'))('accept %s: parser ok and SQL regex matches', (s) => {
    expect(parseReleaseDate(s, NOW).ok).toBe(true);
    expect(sqlRegex.test(s)).toBe(true);
  });

  it.each(samples('reject-format'))('reject-format %j: parser and SQL regex both reject', (s) => {
    expect(parseReleaseDate(s, NOW)).toEqual({ ok: false, reason: 'format' });
    expect(sqlRegex.test(s)).toBe(false);
  });

  // The SQL regex only checks shape, so range and calendar failures must pass it and be caught by
  // the later checks, on both sides.
  it.each(samples('reject-range'))(
    'reject-range %s: parser rejects on range, regex passes',
    (s) => {
      expect(parseReleaseDate(s, NOW)).toEqual({ ok: false, reason: 'range' });
      expect(sqlRegex.test(s)).toBe(true);
    }
  );

  it.each(samples('reject-date'))(
    'reject-date %s: parser rejects on the calendar, regex passes',
    (s) => {
      expect(parseReleaseDate(s, NOW)).toEqual({ ok: false, reason: 'date' });
      expect(sqlRegex.test(s)).toBe(true);
    }
  );

  it('SQL range bound is derived from now(), not hardcoded', () => {
    expect(sql).toMatch(/extract\(year from now\(\)\)::int \+ 1/);
    expect(sql).toMatch(/v_year < 1900/);
  });

  it('SQL is authenticated-only and revokes anon', () => {
    expect(sql).toMatch(/auth\.uid\(\) is null/);
    expect(sql).toMatch(
      /revoke execute on function public\.fill_missing_release_date\(uuid, text\) from public, anon;/
    );
    expect(sql).toMatch(
      /grant execute on function public\.fill_missing_release_date\(uuid, text\) to authenticated;/
    );
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).toMatch(/returns text/);
  });
});
