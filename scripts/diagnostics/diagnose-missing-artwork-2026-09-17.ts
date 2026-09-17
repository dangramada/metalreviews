// One-off diagnostic (read-only, writes nothing to `albums`): runs the live MusicBrainz/CAA
// lookup for every album currently missing artwork_url, and reports what actually happens —
// instead of guessing from band/album names, which turned out wrong twice in a row during
// manual triage (see chat: "Ravaged by the Yeti" and "Nine Inch Noize [Collaboration]" are
// both real releases that MB search simply failed to match).
//
// Usage: npx tsx scripts/diagnostics/diagnose-missing-artwork-2026-09-17.ts
// Output: a table printed to stdout + a CSV written to
//   docs/data/missing-artwork/diagnose-missing-artwork-2026-09-17-output.csv
//
// Safe to re-run: read-only against `albums`, and every MB/CAA call already goes through the
// same rate-limited lookupMusicBrainz() used in production, so this respects MB's 1 req/sec
// etiquette automatically (up to 3 sequential MB requests per album, ~47 albums -> a few minutes).

import { supabase } from '../supabaseClient';
import { lookupMusicBrainz } from '../musicbrainz';
import { writeFileSync } from 'fs';
import axios from 'axios';

const MB_USER_AGENT = 'SlantTake/1.0 (dan.gramada@gmail.com)';

// Mirrors the *relaxed* picker we discussed (front:true if present, else any approved image).
// Deliberately re-implemented here, separate from musicbrainz.ts's current front-only picker,
// so this diagnostic can tell "no artwork exists at all" apart from "artwork exists but the
// current shipped filter misses it" — that distinction is the whole point of this pass.
function pickArtworkRelaxed(images: any[]): string | null {
  const front = images.find((img: any) => img.front === true);
  if (front) return front.image;
  const approved = images.find((img: any) => img.approved === true);
  return approved?.image ?? null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// MB has been observed 503-ing intermittently under this session's cumulative request volume
// (confirmed live: back-to-back calls for different albums returned status:'error' then 'ok').
// lookupMusicBrainz's status field (Concern A) distinguishes a genuine empty search from a
// request failure, but this diagnostic originally didn't consume it — treating both as
// identical "not found" contaminated the first 2026-09-17 re-run with false negatives. Retry
// once with extra backoff before accepting an 'error' as a real result.
async function lookupWithRetry(band: string, album: string) {
  const first = await lookupMusicBrainz(band, album);
  if (first.status !== 'error') return first;
  await sleep(5000);
  return lookupMusicBrainz(band, album);
}

// Full sweep: enumerate every release in the group (one extra MB request, rate-limited),
// then check each release individually on CAA with the relaxed picker. This is deliberately
// more thorough than the shipped code — it's what tells us whether issue #2 (arbitrary
// releases[0] pick) and issue #1 (front:true-only filter) are hiding real artwork that a
// smarter lookup would find. Returns { found, releasesChecked } for visibility into cost.
async function checkRelaxedArtworkAcrossGroup(
  releaseGroupId: string | null
): Promise<{ found: boolean; releasesChecked: number }> {
  if (!releaseGroupId) return { found: false, releasesChecked: 0 };

  let releaseIds: string[] = [];
  try {
    await sleep(1000); // MB rate limit — this is an extra MB request beyond lookupMusicBrainz's own
    const res = await axios.get(`https://musicbrainz.org/ws/2/release-group/${releaseGroupId}`, {
      params: { inc: 'releases', fmt: 'json' },
      headers: { 'User-Agent': MB_USER_AGENT },
    });
    releaseIds = (res.data?.releases ?? []).map((r: any) => r.id).filter(Boolean);
  } catch {
    return { found: false, releasesChecked: 0 };
  }

  for (const releaseId of releaseIds) {
    try {
      const caaRes = await axios.get(`https://coverartarchive.org/release/${releaseId}`, {
        headers: { 'User-Agent': MB_USER_AGENT },
        timeout: 8000,
      });
      const images: any[] = caaRes.data?.images ?? [];
      if (pickArtworkRelaxed(images)) return { found: true, releasesChecked: releaseIds.length };
    } catch {
      // this release has no CAA entry — try the next one
    }
  }
  return { found: false, releasesChecked: releaseIds.length };
}

type Row = {
  id: string;
  band: string;
  album: string;
  artwork_url: string | null;
  mb_release_group_id: string | null;
  created_at: string;
};

type DiagnosisRow = Row & {
  mbStatus: 'ok' | 'not_found' | 'error';
  liveFoundReleaseGroup: boolean;
  foundByShippedFilter: boolean; // current front:true-only logic in musicbrainz.ts
  foundByRelaxedFilter: boolean; // relaxed filter, swept across every release in the group
  releasesInGroup: number;
  liveGenres: string;
  verdict: string;
};

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function classify(
  mbStatus: 'ok' | 'not_found' | 'error',
  liveFoundReleaseGroup: boolean,
  foundByShippedFilter: boolean,
  foundByRelaxedFilter: boolean
): string {
  if (mbStatus === 'error') {
    return 'MB request error even after retry — transient failure, not a real verdict, re-run later';
  }
  if (foundByShippedFilter) {
    return 'Already fixable today — shipped code should have found this (re-check for a transient failure)';
  }
  if (foundByRelaxedFilter) {
    return 'FIX CONFIRMED: relaxed filter finds artwork the shipped front:true filter misses';
  }
  if (liveFoundReleaseGroup) {
    return 'MB knows the release, but genuinely no approved artwork on CAA for any release in the group';
  }
  return 'MB search found nothing at all — needs manual look (too new / typo / not on MB / title has noise)';
}

async function main() {
  const { data, error } = await supabase
    .from('albums')
    .select('id, band, album, artwork_url, mb_release_group_id, created_at')
    .is('artwork_url', null);
  if (error) throw error;

  const rows = data as Row[];
  console.log(`Diagnosing ${rows.length} albums with artwork_url IS NULL...\n`);

  const results: DiagnosisRow[] = [];

  for (const [i, row] of rows.entries()) {
    process.stdout.write(`[${i + 1}/${rows.length}] ${row.band} — ${row.album} ... `);
    const mb = await lookupWithRetry(row.band, row.album);
    const liveFoundReleaseGroup = !!mb.releaseGroupId;
    const foundByShippedFilter = !!mb.artworkUrl;

    // Only worth the extra requests when the shipped filter already failed but we do have
    // a release-group to search within — otherwise there's nothing to sweep.
    let foundByRelaxedFilter = false;
    let releasesInGroup = 0;
    if (mb.status !== 'error' && !foundByShippedFilter && liveFoundReleaseGroup) {
      const sweep = await checkRelaxedArtworkAcrossGroup(mb.releaseGroupId);
      foundByRelaxedFilter = sweep.found;
      releasesInGroup = sweep.releasesChecked;
    }

    const verdict = classify(mb.status, liveFoundReleaseGroup, foundByShippedFilter, foundByRelaxedFilter);
    console.log(verdict);

    results.push({
      ...row,
      mbStatus: mb.status,
      liveFoundReleaseGroup,
      foundByShippedFilter,
      foundByRelaxedFilter,
      releasesInGroup,
      liveGenres: mb.genres.join('; '),
      verdict,
    });
  }

  // Summary counts
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  console.log('\n--- Summary ---');
  for (const [verdict, count] of Object.entries(counts)) {
    console.log(`${count}\t${verdict}`);
  }

  // CSV output
  const header = [
    'id',
    'band',
    'album',
    'created_at',
    'db_had_release_group',
    'db_had_artwork',
    'mb_status',
    'live_found_release_group',
    'found_by_shipped_filter',
    'found_by_relaxed_filter',
    'releases_in_group_checked',
    'live_genres',
    'verdict',
  ];
  const lines = [header.join(',')];
  for (const r of results) {
    lines.push(
      [
        r.id,
        csvEscape(r.band),
        csvEscape(r.album),
        r.created_at,
        String(!!r.mb_release_group_id),
        String(!!r.artwork_url),
        r.mbStatus,
        String(r.liveFoundReleaseGroup),
        String(r.foundByShippedFilter),
        String(r.foundByRelaxedFilter),
        String(r.releasesInGroup),
        csvEscape(r.liveGenres),
        csvEscape(r.verdict),
      ].join(',')
    );
  }
  const outPath = 'docs/data/missing-artwork/diagnose-missing-artwork-2026-09-17-output.csv';
  writeFileSync(outPath, lines.join('\n'));
  console.log(`\nFull results written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
