// One-off diagnostic (read-only, writes nothing to Supabase): for every album currently in the
// catalog, re-runs lookupMusicBrainz's Step A search live and flags any (band, album) pair whose
// search matches more than one distinct MusicBrainz release-group. Confirms the Khemmis
// same-title-different-release collision (self-titled 2013 EP vs. self-titled 2026 album) is a
// general class of bug, not a one-off — see the session brief for full context. No fix here.
//
// primary-type/first-release-date per candidate release-group are read off the release search
// response itself (release-group embed + release `date`) rather than a separate release-group
// fetch — keeps this to 1 MB request per album, same as the real Step A call.
//
// Usage: npx tsx scripts/diagnostics/diagnose-release-group-collision-2026-09-18.ts

import axios from 'axios';
import fs from 'fs';
import { supabase } from '../supabaseClient';

const MB_USER_AGENT = 'SlantTake/1.0 (dan.gramada@gmail.com)';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface AlbumRow {
  id: string;
  band: string;
  album: string;
  mb_release_group_id: string | null;
}

interface CandidateGroup {
  releaseGroupId: string;
  primaryType: string | null;
  earliestDate: string | null;
}

interface FlaggedRow {
  band: string;
  album: string;
  storedReleaseGroupId: string | null;
  candidates: CandidateGroup[];
}

// MB returned 503s at a ~35% rate under plain 1 req/sec on the first run (Khemmis itself hit
// one) — high enough to silently undercount collisions, so transient 503s get a few retries
// with backoff rather than being counted as a permanent error.
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

async function searchCandidates(band: string, album: string): Promise<CandidateGroup[]> {
  // Same title-noise stripping as lookupMusicBrainz's Step A.
  const bandForSearch = band.replace(/^Review:\s*/i, '').trim() || band;
  const albumForSearch = album.replace(/\s+(EP\s+)?Review$/i, '').trim() || album;

  const data = await fetchWithRetry('https://musicbrainz.org/ws/2/release/', {
    query: `artist:"${bandForSearch}" AND release:"${albumForSearch}"`,
    fmt: 'json',
  });
  const releases: any[] = data?.releases ?? [];

  const groups = new Map<string, CandidateGroup>();
  for (const r of releases) {
    const rg = r['release-group'];
    if (!rg?.id) continue;
    const existing = groups.get(rg.id);
    const date: string | null = r.date ?? null;
    if (!existing) {
      groups.set(rg.id, { releaseGroupId: rg.id, primaryType: rg['primary-type'] ?? null, earliestDate: date });
    } else if (date && (!existing.earliestDate || date < existing.earliestDate)) {
      existing.earliestDate = date;
    }
  }
  return [...groups.values()];
}

async function main() {
  const { data, error } = await supabase.from('albums').select('id, band, album, mb_release_group_id');
  if (error) throw error;
  const albums = data as AlbumRow[];

  console.log(`Re-checking Step A search for ${albums.length} albums (1 req/sec, MB rate limit)...\n`);

  const flagged: FlaggedRow[] = [];
  let errors = 0;

  for (let i = 0; i < albums.length; i++) {
    const a = albums[i];
    try {
      const candidates = await searchCandidates(a.band, a.album);
      if (candidates.length > 1) {
        flagged.push({ band: a.band, album: a.album, storedReleaseGroupId: a.mb_release_group_id, candidates });
        console.log(`[${i + 1}/${albums.length}] FLAGGED: ${a.band} — ${a.album} (${candidates.length} release-groups)`);
      } else {
        console.log(`[${i + 1}/${albums.length}] ok: ${a.band} — ${a.album}`);
      }
    } catch (e) {
      errors++;
      console.log(`[${i + 1}/${albums.length}] ERROR: ${a.band} — ${a.album}: ${(e as Error).message}`);
    }
    if (i < albums.length - 1) await sleep(1000);
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total albums checked: ${albums.length}`);
  console.log(`Request errors (skipped, not counted as flagged): ${errors}`);
  console.log(`Flagged (>1 distinct release-group matched): ${flagged.length}\n`);

  const khemmisFlagged = flagged.some((f) => f.band.toLowerCase() === 'khemmis' && f.album.toLowerCase() === 'khemmis');
  console.log(`Khemmis validation check: ${khemmisFlagged ? 'PASS — Khemmis is in the flagged list' : 'FAIL — Khemmis NOT flagged, diagnostic may be broken'}\n`);

  console.log('--- Flagged detail ---');
  for (const f of flagged) {
    console.log(`\n${f.band} — ${f.album}`);
    console.log(`  currently stored mb_release_group_id: ${f.storedReleaseGroupId ?? '(none)'}`);
    for (const c of f.candidates) {
      const stored = c.releaseGroupId === f.storedReleaseGroupId ? '  <- currently stored' : '';
      console.log(`    ${c.releaseGroupId}  type=${c.primaryType ?? 'unknown'}  earliest-date=${c.earliestDate ?? 'unknown'}${stored}`);
    }
  }

  const outPath = 'docs/data/album-identity/release-group-collision-2026-09-18-output.json';
  fs.mkdirSync('docs/data/album-identity', { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ totalChecked: albums.length, errors, flaggedCount: flagged.length, flagged }, null, 2));
  console.log(`\nFull output written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
