// Read-only diagnostic spike: what fraction of recently-added albums have a MusicBrainz URL
// relationship pointing to a streaming/purchase source (Spotify, Bandcamp, YouTube, etc.)?
// Answers this before committing to building link enrichment into the ingest pipeline.
//
// Fully isolated from the ingest pipeline: own Supabase read (no writes to albums/reviews
// anywhere in this file), own MusicBrainz fetch/User-Agent/rate-limit (copied rather than
// imported from scripts/musicbrainz.ts). No production code touched or modified.
//
// See docs/decisions/ for context if this graduates from spike to real work — this file is not
// wired into npm scripts and is not meant to be kept long-term.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { supabase } from './supabaseClient.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MB_USER_AGENT = 'SlantTake/1.0 (dan.gramada@gmail.com)';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// albums.mb_release_group_id (supabase/albums.sql) stores a release-GROUP MBID, not a release
// MBID — confirmed in scripts/musicbrainz.ts, which captures it from
// releases[0]['release-group'].id. Release and release-group MBIDs are different MB entity
// namespaces, so GET /ws/2/release/{this id} would 404 every time. Only the release-group
// endpoint is queried here; there is no release-level MBID to fall back to.
const MB_RELEASE_GROUP_URL = (mbid: string) =>
  `https://musicbrainz.org/ws/2/release-group/${mbid}?inc=url-rels&fmt=json`;

// MB doesn't guarantee relation array order, so match by explicit priority rather than
// "first in the array" — an album with both a lower- and higher-priority relation must always
// report the higher-priority one.
const RELATION_PRIORITY = ['free streaming', 'streaming', 'purchase for download'] as const;
type RelationType = (typeof RELATION_PRIORITY)[number];

interface AlbumRow {
  id: string;
  band: string;
  album: string;
  mb_release_group_id: string | null;
  created_at: string;
}

interface MbRelation {
  type: string;
  url?: { resource?: string };
}

type CoverageStatus = 'found' | 'no_match' | 'no_mbid_stored' | 'error';

interface CoverageResult {
  albumId: string;
  band: string;
  album: string;
  mbid: string | null;
  status: CoverageStatus;
  relationType: RelationType | null;
  url: string | null;
  fallbackSearch: { bandcamp: string; spotify: string } | null;
  error: string | null;
}

function fallbackSearchUrls(band: string, album: string) {
  const q = encodeURIComponent(`${band} ${album}`);
  return {
    bandcamp: `https://bandcamp.com/search?q=${q}`,
    spotify: `https://open.spotify.com/search/${q}`,
  };
}

function pickHighestPriorityRelation(relations: MbRelation[]): { type: RelationType; url: string } | null {
  for (const type of RELATION_PRIORITY) {
    const match = relations.find((r) => r.type === type && r.url?.resource);
    if (match) return { type, url: match.url!.resource! };
  }
  return null;
}

async function checkAlbum(row: AlbumRow): Promise<CoverageResult> {
  const base = { albumId: row.id, band: row.band, album: row.album, mbid: row.mb_release_group_id };

  if (!row.mb_release_group_id) {
    return {
      ...base,
      status: 'no_mbid_stored',
      relationType: null,
      url: null,
      fallbackSearch: fallbackSearchUrls(row.band, row.album),
      error: null,
    };
  }

  try {
    const res = await axios.get(MB_RELEASE_GROUP_URL(row.mb_release_group_id), {
      headers: { 'User-Agent': MB_USER_AGENT },
      timeout: 10000,
    });
    const relations: MbRelation[] = res.data?.relations ?? [];
    const match = pickHighestPriorityRelation(relations);

    if (match) {
      return {
        ...base,
        status: 'found',
        relationType: match.type,
        url: match.url,
        fallbackSearch: null,
        error: null,
      };
    }
    return {
      ...base,
      status: 'no_match',
      relationType: null,
      url: null,
      fallbackSearch: fallbackSearchUrls(row.band, row.album),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ERROR: ${row.band} — ${row.album} (mbid ${row.mb_release_group_id}): ${message}`);
    return {
      ...base,
      status: 'error',
      relationType: null,
      url: null,
      fallbackSearch: fallbackSearchUrls(row.band, row.album),
      error: message,
    };
  }
}

async function main() {
  const { data: rows, error } = await supabase
    .from('albums')
    .select('id, band, album, mb_release_group_id, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const albums = (rows ?? []) as AlbumRow[];
  console.log(`Fetched ${albums.length} most recently added albums.`);

  const results: CoverageResult[] = [];
  for (const [i, row] of albums.entries()) {
    console.log(`[${i + 1}/${albums.length}] ${row.band} — ${row.album}`);
    results.push(await checkAlbum(row));
    // MB rate limit: 1 req/sec. Skip the sleep after albums with no MBID (no MB call made).
    if (row.mb_release_group_id && i < albums.length - 1) {
      await sleep(1000);
    }
  }

  const summary = {
    total: results.length,
    linkFound: results.filter((r) => r.status === 'found').length,
    noMatch: results.filter((r) => r.status === 'no_match').length,
    noMbidStored: results.filter((r) => r.status === 'no_mbid_stored').length,
    error: results.filter((r) => r.status === 'error').length,
  };

  console.log(
    `\n${summary.linkFound} of ${summary.total} albums have a direct link ` +
      `(${summary.noMatch} no match, ${summary.noMbidStored} no MBID stored, ${summary.error} errored)`
  );

  const output = { generatedAt: new Date().toISOString(), summary, albums: results };

  const docsDataDir = path.resolve(__dirname, '../docs/data/musicbrainz-streaming-spike');
  fs.mkdirSync(docsDataDir, { recursive: true });
  const docsDataPath = path.join(docsDataDir, 'coverage-2026-09-14.json');
  fs.writeFileSync(docsDataPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${docsDataPath}`);

  // Second copy purely so the throwaway dev route can fetch() it as a static public asset.
  // Deleted together with src/DevMusicBrainzStreamingCoverage.tsx once the spike is reviewed —
  // docs/data/ above is the durable record.
  const publicPath = path.resolve(__dirname, '../public/dev-musicbrainz-streaming-coverage.json');
  fs.writeFileSync(publicPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${publicPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
