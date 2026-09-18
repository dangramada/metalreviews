// One-off, read-only data pull (no correction) for the 25 same-title-collision pairs not yet
// manually verified (the 29 flagged by
// docs/decisions/album-identity/album-identity-same-title-release-group-collision.md minus the
// 4 already checked: Khemmis, Moonspell, Devin Townsend, Wormwood). For each pair: every
// candidate release-group's id/primary-type/first-release-date (the real MB field, fetched
// fresh here — the original diagnostic only recorded an earliest-observed-release-date proxy),
// which one releases[0] resolved to (reused from the frozen 2026-09-18 diagnostic JSON, not
// re-searched), and what's currently stored on the albums row (live query).
//
// Usage: npx tsx scripts/diagnostics/pull-remaining-25-collision-raw-data-2026-09-18.ts

import axios from 'axios';
import fs from 'fs';
import { supabase } from '../supabaseClient';

const MB_USER_AGENT = 'SlantTake/1.0 (dan.gramada@gmail.com)';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, params: Record<string, string>, retries = 4): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await axios.get(url, { params, headers: { 'User-Agent': MB_USER_AGENT } });
      return res.data;
    } catch (e: any) {
      if (attempt >= retries || e?.response?.status !== 503) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
}

async function main() {
  const flagged = JSON.parse(
    fs.readFileSync('docs/data/album-identity/release-group-collision-2026-09-18-output.json', 'utf-8')
  ).flagged;
  const verified = new Set(['khemmis|khemmis', 'moonspell|far from god', 'devin townsend|the moth', 'wormwood|å']);
  const remaining25 = flagged.filter(
    (f: any) => !verified.has(f.band.toLowerCase() + '|' + f.album.toLowerCase())
  );
  console.log(`Pulling raw data for ${remaining25.length} unverified pairs...\n`);

  const { data: albums, error } = await supabase
    .from('albums')
    .select('band, album, mb_release_group_id, artwork_url, genre, release_date');
  if (error) throw error;

  const results = [];
  for (const f of remaining25) {
    const album = albums.find(
      (a: any) => a.band.toLowerCase() === f.band.toLowerCase() && a.album.toLowerCase() === f.album.toLowerCase()
    );

    const candidatesWithFirstReleaseDate = [];
    for (const c of f.candidates) {
      let firstReleaseDate: string | null = null;
      try {
        const data = await fetchWithRetry(`https://musicbrainz.org/ws/2/release-group/${c.releaseGroupId}`, {
          fmt: 'json',
        });
        firstReleaseDate = data['first-release-date'] || null;
      } catch (e) {
        console.log(`  (fetch failed for ${c.releaseGroupId}: ${(e as Error).message})`);
      }
      candidatesWithFirstReleaseDate.push({ ...c, firstReleaseDate });
      await sleep(1000);
    }

    const result = {
      band: f.band,
      album: f.album,
      candidates: candidatesWithFirstReleaseDate,
      releasesZeroResolvesTo: f.candidates[0].releaseGroupId, // frozen JSON preserves releases[] order
      stored: album
        ? {
            mb_release_group_id: album.mb_release_group_id,
            release_date: album.release_date,
            artworkUrl: album.artwork_url,
            genres: album.genre,
          }
        : null,
    };
    results.push(result);

    console.log(`${f.band} — ${f.album}`);
    console.log(`  releases[0] resolves to: ${result.releasesZeroResolvesTo}`);
    for (const c of candidatesWithFirstReleaseDate) {
      console.log(`    ${c.releaseGroupId} | type=${c.primaryType ?? 'unknown'} | first-release-date=${c.firstReleaseDate ?? 'unknown'}`);
    }
    console.log(`  stored:`, result.stored);
    console.log('');
  }

  const outPath = 'docs/data/album-identity/remaining-25-collision-raw-data-2026-09-18.json';
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Full output written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
