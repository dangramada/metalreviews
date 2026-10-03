// One-off repair for albums whose stored CAA artwork_url is dead (revalidate-artwork-2026-09-17
// --report, 2026-10-03: 5 of 288). Re-points each at the CURRENT front image of its own
// release group (`mb_release_group_id` is already stored) — no MusicBrainz search, so none of
// the Step A same-title ambiguity. Needed because Green Lung is in the flagged set, whose
// guards (ingest.ts needsMbLookup / selectAlbumBackfillCandidates) block every re-resolve
// path, and Exploring Birdsong is capped out by mb_lookup_attempts, so nulling their URLs
// would strand them. See docs/decisions/musicbrainz-enrichment.md (2026-10-03 section).
//
// Writes albums.artwork_url ONLY, per row, via .update().eq('id'). Never touches genre,
// release_date or mb_release_group_id.
//
// Usage:
//   npx tsx scripts/diagnostics/refresh-dead-artwork-2026-10-03.ts --report [--only=<norm_key>[,<norm_key>]]
//   npx tsx scripts/diagnostics/refresh-dead-artwork-2026-10-03.ts --apply --only=<norm_key>[,<norm_key>]
// --apply refuses to run without --only; rows outside --only are skipped even if DEAD.

import axios from 'axios';
import { supabase } from '../supabaseClient';
// FLAGGED_SAME_TITLE_COLLISION_NORM_KEYS in ingest.ts is the source of truth; used here for the
// report's "flagged" column only — nothing in this script's logic branches on it.
import { FLAGGED_SAME_TITLE_COLLISION_NORM_KEYS } from '../ingest';
import { pickArtwork } from '../musicbrainz';
import { probeUrl } from './checkUrlAlive';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Anything not listed here is never read or written.
const ALLOWLIST = [
  'flame__ignis draconis daemonicus',
  'black sites__for eternity',
  'green lung__necropolitan',
  'exploring birdsong__every house we built',
  'fen__elemental part one mourning earth',
];

// Same transform as toThumbnailUrl() in src/App.tsx (inlined — importing App.tsx pulls in React).
const thumb500 = (url: string) => url.replace(/\.(jpg|jpeg|png)$/i, '-500.$1');

const isImage = (p: { status: number | null; contentType: string }) =>
  p.status !== null && p.status >= 200 && p.status < 300 && p.contentType.startsWith('image/');

// CAA can generate thumbnails lazily, so one 404 on the -500 gets a single delayed retry.
async function probeThumb(url: string) {
  let p = await probeUrl(url);
  if (p.status === 404) {
    await sleep(5000);
    p = await probeUrl(url);
  }
  return p;
}

type OldUrlState = 'DEAD' | 'INDETERMINATE' | 'ALIVE';

// Stricter than revalidate's "dead" (which counts any non-2xx, incl. 5xx/timeouts): a 5xx or no
// response from archive.org says nothing about whether the image still exists (Flame / Exploring
// Birdsong / Black Sites, 2026-10-03). DEAD needs full-res AND -500 both 404/410 on two probes
// spaced apart; any 2xx image/* on any probe is ALIVE; everything else is INDETERMINATE.
async function classifyOldUrl(url: string): Promise<{ state: OldUrlState; statuses: string }> {
  const probes: Array<{ status: number | null; contentType: string }> = [];
  for (let i = 0; i < 2; i++) {
    if (i > 0) await sleep(5000);
    probes.push(await probeUrl(url), await probeUrl(thumb500(url)));
  }
  const statuses = probes.map((p) => p.status ?? 'none').join(',');
  if (probes.some(isImage)) return { state: 'ALIVE', statuses };
  if (probes.every((p) => p.status === 404 || p.status === 410)) return { state: 'DEAD', statuses };
  return { state: 'INDETERMINATE', statuses };
}

interface Row {
  id: string;
  band: string;
  album: string;
  norm_key: string;
  mb_release_group_id: string | null;
  artwork_url: string | null;
}

interface Result {
  row: Row;
  flagged: boolean;
  oldState: OldUrlState | null;
  oldStatuses: string;
  newUrl: string | null;
  sourceRelease: string | null;
  fullStatus: number | null;
  thumbStatus: number | null;
  refusal: string | null;
}

async function evaluate(row: Row): Promise<Result> {
  const r: Result = {
    row,
    flagged: FLAGGED_SAME_TITLE_COLLISION_NORM_KEYS.has(row.norm_key),
    oldState: null,
    oldStatuses: '',
    newUrl: null,
    sourceRelease: null,
    fullStatus: null,
    thumbStatus: null,
    refusal: null,
  };

  if (!row.artwork_url) {
    r.refusal = 'artwork_url already null';
    return r;
  }
  const old = await classifyOldUrl(row.artwork_url);
  r.oldState = old.state;
  r.oldStatuses = old.statuses;
  if (old.state !== 'DEAD') {
    r.refusal = 'skipped: old URL not confirmed dead';
    return r;
  }
  if (!row.mb_release_group_id) {
    r.refusal = 'no mb_release_group_id';
    return r;
  }

  try {
    const res = await axios.get(
      `https://coverartarchive.org/release-group/${row.mb_release_group_id}`,
      { timeout: 8000, validateStatus: () => true }
    );
    if (res.status !== 200) {
      r.refusal = `release-group lookup returned ${res.status}`;
      return r;
    }
    r.newUrl = pickArtwork(res.data?.images ?? []);
  } catch {
    r.refusal = 'release-group lookup failed (network)';
    return r;
  }
  if (!r.newUrl) {
    r.refusal = 'no usable image on release group';
    return r;
  }

  r.sourceRelease = r.newUrl.match(/\/release\/([0-9a-f-]{36})\//)?.[1] ?? null;
  const full = await probeUrl(r.newUrl);
  const thumb = await probeThumb(thumb500(r.newUrl));
  r.fullStatus = full.status;
  r.thumbStatus = thumb.status;
  if (!isImage(full)) r.refusal = `new full-res failed (${full.status}, ${full.contentType})`;
  else if (!isImage(thumb)) r.refusal = `new -500 failed (${thumb.status}, ${thumb.contentType})`;
  return r;
}

async function main() {
  const mode = process.argv[2];
  const usage =
    'Usage: npx tsx scripts/diagnostics/refresh-dead-artwork-2026-10-03.ts ' +
    '--report [--only=<norm_key>,...] | --apply --only=<norm_key>,...';
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',') : null;
  if (
    (mode !== '--report' && mode !== '--apply') ||
    (mode === '--apply' && !only) ||
    (onlyArg && process.argv.length > 4)
  ) {
    console.error(usage);
    process.exit(1);
  }
  const unknown = (only ?? []).filter((k) => !ALLOWLIST.includes(k));
  if (unknown.length > 0) {
    console.error(`Unknown norm_key(s) not in allowlist: ${unknown.join(' | ')}`);
    process.exit(1);
  }
  const targets = only ?? ALLOWLIST;

  const { data, error } = await supabase
    .from('albums')
    .select('id, band, album, norm_key, mb_release_group_id, artwork_url')
    .in('norm_key', targets);
  if (error) throw error;
  const rows = data as Row[];
  for (const k of targets) {
    if (!rows.some((r) => r.norm_key === k)) console.log(`MISSING from DB: ${k}`);
  }

  console.log(`${mode === '--report' ? 'REPORT (no writes)' : 'APPLY'}\n`);
  let applied = 0;
  let refused = 0;
  for (const row of rows) {
    // --apply re-runs the full evaluation, so "old still dead" and "new passes both checks"
    // are verified at write time, not trusted from an earlier --report.
    const r = await evaluate(row);
    console.log(`${row.band} — ${row.album}`);
    console.log(`  flagged:        ${r.flagged ? 'yes' : 'no'}`);
    console.log(`  old URL:        ${row.artwork_url}`);
    console.log(`  old URL state:  ${r.oldState} (full,-500,full,-500 = ${r.oldStatuses})`);
    console.log(`  new URL:        ${r.newUrl ?? '—'}`);
    console.log(`  source release: ${r.sourceRelease ?? '—'}`);
    console.log(`  new full-res:   ${r.fullStatus ?? '—'}   new -500: ${r.thumbStatus ?? '—'}`);

    if (r.refusal || !r.newUrl) {
      refused++;
      console.log(`  → ${r.refusal?.startsWith('skipped') ? '' : 'REFUSED: '}${r.refusal}\n`);
      continue;
    }
    if (mode === '--apply') {
      const { error: upErr } = await supabase
        .from('albums')
        .update({ artwork_url: r.newUrl })
        .eq('id', row.id);
      if (upErr) throw upErr;
      applied++;
      console.log('  → APPLIED\n');
    } else {
      console.log('  → would apply\n');
    }
  }
  console.log(
    mode === '--apply'
      ? `${applied} applied, ${refused} refused.`
      : `${rows.length - refused} would apply, ${refused} would be refused. Re-run with --apply to write.\n` +
          `Note: revalidate-artwork-2026-09-17's "dead" count includes 5xx/no-response; DEAD here means 404/410 only.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
