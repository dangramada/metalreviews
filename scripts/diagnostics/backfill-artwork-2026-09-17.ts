// One-off backfill for Concern D of the 2026-09-17 artwork/MB-enrichment diagnostic brief:
// applies fresh MB/CAA enrichment to the 5 albums the 2026-09-17 re-run of
// diagnose-missing-artwork-2026-09-17.ts (post Concern A+B fixes) classified as "Already
// fixable today" — rows that already exhausted the organic backfill retry cap
// (selectAlbumBackfillCandidates in ingest.ts) and won't be revisited by a scheduled run.
//
// Follows the report-then-apply convention from
// scripts/migrations/2026-07-album-identity-backfill-albums.ts: --report (default) prints
// what would change without writing; --apply performs the writes after Dan reviews --report's
// output. Each row is re-checked live at run time (not just trusted from the CSV) since MB has
// been intermittently 503-ing this session — a row could have flipped status since the
// diagnostic ran.
//
// Usage:
//   npx tsx scripts/diagnostics/backfill-artwork-2026-09-17.ts --report
//   npx tsx scripts/diagnostics/backfill-artwork-2026-09-17.ts --apply

import { supabase } from '../supabaseClient';
import { lookupMusicBrainz } from '../musicbrainz';
import { applyAlbumEnrichment, isAlbumEnriched, type AlbumRow } from '../ingest';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The rows diagnose-missing-artwork-2026-09-17.ts classified as "Already fixable today".
// Hardcoded rather than re-querying "artwork_url IS NULL" generically — this script is scoped
// to exactly the rows that diagnostic already confirmed, not a general sweep (that's what the
// diagnostic itself is for). The first 5 were from the initial clean 70-row re-run and applied
// 2026-09-17. The 6th (Bees Made Honey In The Vein Tree) surfaced from the follow-up 7-row
// error re-check (2 of 2 runs on that row found artwork cleanly) and is applied separately below.
const TARGET_ALBUM_IDS = [
  'abd104a7-17bc-4b5c-b124-d09bcc4d7f34', // Astral Alchemy — Weaving Chilling Magical Dreamworlds (applied)
  '6ccae594-c763-4f1b-85e6-a78024ed197d', // Sinamort — Breathing Cargo (applied)
  'f142f543-92f9-4518-a6ef-1b56b3a8414a', // Hours of Worship — Resignation (applied)
  '624cd022-9297-4845-a64e-f9347a821374', // slq — Crown Shyness (applied)
  'de5f4a5d-ade9-4f1f-840e-7881e8b6d2a8', // Xenith — To No Avail (applied)
  'c6c1937d-2332-4754-810d-b52c33f88b62', // Bees Made Honey In The Vein Tree — In Between Strides
];

async function lookupWithRetry(band: string, album: string) {
  const first = await lookupMusicBrainz(band, album);
  if (first.status !== 'error') return first;
  await sleep(5000);
  return lookupMusicBrainz(band, album);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== '--report' && mode !== '--apply') {
    console.error(
      'Usage: npx tsx scripts/diagnostics/backfill-artwork-2026-09-17.ts --report|--apply'
    );
    process.exit(1);
  }

  const { data, error } = await supabase
    .from('albums')
    .select('id, band, album, mb_release_group_id, norm_key, artwork_url, genre, release_date')
    .in('id', TARGET_ALBUM_IDS);
  if (error) throw error;
  const rows = data as AlbumRow[];

  console.log(`${mode === '--report' ? 'REPORT (no writes)' : 'APPLY (will write to albums)'}\n`);

  const toApply: AlbumRow[] = [];

  for (const row of rows) {
    if (isAlbumEnriched(row)) {
      console.log(`SKIP  ${row.band} — ${row.album}: already enriched (resolved organically since the diagnostic ran)`);
      continue;
    }

    const mb = await lookupWithRetry(row.band, row.album);
    if (mb.status === 'error') {
      console.log(`SKIP  ${row.band} — ${row.album}: MB request error even after retry, try again later`);
      await sleep(1000);
      continue;
    }
    if (!mb.artworkUrl) {
      console.log(`SKIP  ${row.band} — ${row.album}: no longer resolves artwork live (status flipped since the diagnostic ran)`);
      await sleep(1000);
      continue;
    }

    const enriched = applyAlbumEnrichment(row, mb);
    if (mb.releaseGroupId && !enriched.mb_release_group_id) {
      enriched.mb_release_group_id = mb.releaseGroupId;
    }

    console.log(`FIX   ${row.band} — ${row.album}`);
    console.log(`      artwork_url:  ${row.artwork_url ?? 'null'} -> ${enriched.artwork_url}`);
    console.log(`      genre:        ${JSON.stringify(row.genre)} -> ${JSON.stringify(enriched.genre)}`);
    console.log(`      release_date: ${row.release_date ?? 'null'} -> ${enriched.release_date ?? 'null'}`);
    console.log(`      mb_release_group_id: ${row.mb_release_group_id ?? 'null'} -> ${enriched.mb_release_group_id ?? 'null'}`);

    toApply.push(enriched);
    await sleep(1000); // MB rate limit
  }

  console.log(`\n${toApply.length} of ${rows.length} row(s) would be fixed.`);

  if (mode === '--apply' && toApply.length > 0) {
    const { error: upsertError } = await supabase
      .from('albums')
      .upsert(toApply, { onConflict: 'id' });
    if (upsertError) throw upsertError;
    console.log(`\nApplied ${toApply.length} update(s) to albums.`);
  } else if (mode === '--report') {
    console.log('\nRe-run with --apply to write these changes.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
