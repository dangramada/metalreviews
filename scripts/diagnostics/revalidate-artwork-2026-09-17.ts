// Manual, on-demand artwork-rot check: `isAlbumEnriched()` in ingest.ts treats any non-null
// `artwork_url` as permanently done, so a CAA image removed after ingest (confirmed live for
// Sigh — Goh-Ka, 2026-09-17: 404 at both full-res and the -500 thumbnail) stays dead forever
// with no organic self-healing path. This script finds and clears those rows so the existing
// pipeline (isAlbumEnriched -> selectAlbumBackfillCandidates -> lookupMusicBrainz tiers 1-3)
// picks them up fresh on the next ingest run.
//
// Deliberately NOT scheduled or wired into ingest-cli.ts — CAA image removal is rare enough
// (reverted edits, rights issues, community cleanup) that it doesn't warrant a cron job. Run by
// hand, occasionally. See docs/decisions/artwork.md for the dated section this brief adds.
//
// Follows the report-then-apply convention from
// scripts/migrations/2026-07-album-identity-backfill-albums.ts.
//
// Usage:
//   npx tsx scripts/diagnostics/revalidate-artwork-2026-09-17.ts --report
//   npx tsx scripts/diagnostics/revalidate-artwork-2026-09-17.ts --apply

import axios from 'axios';
import { supabase } from '../supabaseClient';
import type { AlbumRow } from '../ingest';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Same 8000ms CAA timeout as musicbrainz.ts's CAA calls — CAA responses redirect through
// archive.org, which has been observed to hang indefinitely during a degraded state rather
// than failing fast (docs/decisions/artwork.md, "CAA request timeout", 2026-08-01).
async function checkUrlAlive(url: string): Promise<boolean> {
  try {
    const res = await axios.get(url, { timeout: 8000, validateStatus: () => true });
    if (res.status < 200 || res.status >= 300) return false;
    const contentType = res.headers['content-type'] ?? '';
    return contentType.startsWith('image/');
  } catch {
    // Any network failure (timeout, DNS, connection refused) counts as dead on this attempt,
    // same as a bad status or wrong content-type — all three feed the same retry-once path.
    return false;
  }
}

async function checkArtworkWithRetry(url: string): Promise<boolean> {
  if (await checkUrlAlive(url)) return true;
  await sleep(5000);
  return checkUrlAlive(url);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== '--report' && mode !== '--apply') {
    console.error(
      'Usage: npx tsx scripts/diagnostics/revalidate-artwork-2026-09-17.ts --report|--apply'
    );
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('albums')
    .select('id, band, album, norm_key, mb_release_group_id, artwork_url, genre, release_date')
    .not('artwork_url', 'is', null);
  if (error) throw error;
  const rows = data as AlbumRow[];

  console.log(`${mode === '--report' ? 'REPORT (no writes)' : 'APPLY (will write to albums)'}\n`);

  const toApply: AlbumRow[] = [];

  for (const row of rows) {
    const alive = await checkArtworkWithRetry(row.artwork_url!);
    if (alive) {
      console.log(`OK    ${row.band} — ${row.album}`);
      continue;
    }

    console.log(`DEAD  ${row.band} — ${row.album}: ${row.artwork_url} (confirmed after retry)`);
    toApply.push({ ...row, artwork_url: null });
  }

  console.log(`\n${toApply.length} of ${rows.length} row(s) have dead artwork.`);

  if (mode === '--apply' && toApply.length > 0) {
    const { error: upsertError } = await supabase
      .from('albums')
      .upsert(toApply, { onConflict: 'id' });
    if (upsertError) throw upsertError;
    console.log(`\nReset artwork_url to null on ${toApply.length} row(s).`);
  } else if (mode === '--report') {
    console.log('\nRe-run with --apply to write these changes.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
