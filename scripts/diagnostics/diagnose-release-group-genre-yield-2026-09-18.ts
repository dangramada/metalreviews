// One-off diagnostic (read-only, writes nothing to `albums`): for every album whose stored
// genre is already empty (both Step B release-level and Step C artist-level fallback have
// already run and found nothing — see docs/decisions/musicbrainz-enrichment.md), checks
// whether the release-group's own `genres` field (inc=genres, distinct from the already-
// rejected `tags` field) would have rescued it. Answers the open question in the
// "MusicBrainz field-completion: unified release-group fallback" brief before deciding
// whether genre gets a third fallback tier.
//
// Usage: npx tsx scripts/diagnostics/diagnose-release-group-genre-yield-2026-09-18.ts
// Output: a table printed to stdout + a CSV written to
//   docs/data/musicbrainz-enrichment/release-group-genre-yield-2026-09-18-output.csv
//
// Safe to re-run: read-only against `albums`; one MB request per row (release-group,
// inc=genres), rate-limited at 1 req/sec same as production code.

import { supabase } from '../supabaseClient';
import { writeFileSync } from 'fs';
import axios from 'axios';

const MB_USER_AGENT = 'SlantTake/1.0 (dan.gramada@gmail.com)';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Row = {
  id: string;
  band: string;
  album: string;
  mb_release_group_id: string;
};

type ResultRow = Row & {
  status: 'ok' | 'error';
  genres: string;
};

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function fetchGenres(releaseGroupId: string) {
  const res = await axios.get(`https://musicbrainz.org/ws/2/release-group/${releaseGroupId}`, {
    params: { inc: 'genres', fmt: 'json' },
    headers: { 'User-Agent': MB_USER_AGENT },
  });
  const genres: Array<{ name: string; count: number }> = res.data?.genres ?? [];
  return genres
    .sort((a, b) => b.count - a.count)
    .map((g) => g.name)
    .join('; ');
}

async function main() {
  // Optional --ids=<comma-separated album ids> to retry just the rows that errored on a prior
  // run (MB observed 503-ing intermittently under sustained request volume — same failure mode
  // noted in diagnose-missing-artwork-2026-09-17.ts) instead of re-checking the full set.
  const idsArg = process.argv.find((a) => a.startsWith('--ids='));
  const idFilter = idsArg ? idsArg.slice('--ids='.length).split(',') : null;

  // Only rows where genre is already confirmed empty AND a release-group id is already known
  // (i.e. Step A/B/C already ran to completion for this row — an empty genre here means the
  // release+artist fallback genuinely found nothing, not that the lookup never happened).
  let query = supabase
    .from('albums')
    .select('id, band, album, mb_release_group_id')
    .filter('genre', 'eq', '{}')
    .not('mb_release_group_id', 'is', null);
  if (idFilter) query = query.in('id', idFilter);
  const { data, error } = await query;
  if (error) throw error;

  const rows = data as Row[];
  console.log(`Checking release-group genres for ${rows.length} zero-genre album(s)...\n`);

  const results: ResultRow[] = [];
  for (const [i, row] of rows.entries()) {
    process.stdout.write(`[${i + 1}/${rows.length}] ${row.band} — ${row.album} ... `);
    if (i > 0) await sleep(1500); // MB rate limit + extra headroom against observed 503s

    let names = '';
    let status: 'ok' | 'error' = 'error';
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(5000);
      try {
        names = await fetchGenres(row.mb_release_group_id);
        status = 'ok';
        break;
      } catch {
        // retry once, then fall through to reporting 'error'
      }
    }
    console.log(status === 'error' ? 'ERROR' : names || '(empty)');
    results.push({ ...row, status, genres: names });
  }

  const rescued = results.filter((r) => r.status === 'ok' && r.genres.length > 0);
  const errored = results.filter((r) => r.status === 'error');
  console.log('\n--- Summary ---');
  console.log(`Total checked: ${results.length}`);
  console.log(`Rescued by release-group genres: ${rescued.length}`);
  console.log(`Errors (excluded from yield calc): ${errored.length}`);
  const denom = results.length - errored.length;
  if (denom > 0) {
    console.log(`Yield: ${rescued.length}/${denom} (${((rescued.length / denom) * 100).toFixed(0)}%)`);
  }

  const header = ['id', 'band', 'album', 'mb_release_group_id', 'status', 'release_group_genres'];
  const lines = [header.join(',')];
  for (const r of results) {
    lines.push(
      [r.id, csvEscape(r.band), csvEscape(r.album), r.mb_release_group_id, r.status, csvEscape(r.genres)].join(',')
    );
  }
  const outPath = idFilter
    ? 'docs/data/musicbrainz-enrichment/release-group-genre-yield-2026-09-18-output-rescope.csv'
    : 'docs/data/musicbrainz-enrichment/release-group-genre-yield-2026-09-18-output.csv';
  writeFileSync(outPath, lines.join('\n'));
  console.log(`\nFull results written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
