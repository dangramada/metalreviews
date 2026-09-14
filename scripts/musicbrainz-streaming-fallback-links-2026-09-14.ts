// Second pass of the MusicBrainz streaming-link spike (spike/musicbrainz-streaming-links).
// Adds fallback search links (Bandcamp / Spotify / YouTube Music) to every album already
// pulled by scripts/musicbrainz-streaming-coverage-2026-09-14.ts, plus a `verified` field
// Dan fills in by hand via the dev UI — there's no public search API to check these against,
// and scraping search-result HTML to auto-verify would be fragile/ToS-risky for a one-time
// 50-album sanity check. No Supabase call, no MusicBrainz call, no network at all — reads the
// existing coverage JSON from disk and rewrites it in place. No production code touched.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type CoverageStatus = 'found' | 'no_match' | 'no_mbid_stored' | 'error';
type VerifiedState = 'not_checked' | 'correct' | 'wrong';

interface FallbackLinks {
  bandcamp: string;
  spotify: string;
  youtubeMusic: string;
}

interface VerifiedBlock {
  bandcamp: VerifiedState;
  spotify: VerifiedState;
  youtubeMusic: VerifiedState;
}

interface CoverageResultV1 {
  albumId: string;
  band: string;
  album: string;
  mbid: string | null;
  status: CoverageStatus;
  relationType: string | null;
  url: string | null;
  fallbackSearch: { bandcamp: string; spotify: string } | null;
  error: string | null;
}

interface CoverageResultV2 {
  albumId: string;
  band: string;
  album: string;
  mbid: string | null;
  status: CoverageStatus;
  relationType: string | null;
  url: string | null;
  fallback_links: FallbackLinks;
  verified: VerifiedBlock;
  error: string | null;
}

interface CoverageDataV1 {
  generatedAt: string;
  summary: { total: number; linkFound: number; noMatch: number; noMbidStored: number; error: number };
  albums: CoverageResultV1[];
}

interface CoverageDataV2 {
  generatedAt: string;
  summary: { total: number; linkFound: number; noMatch: number; noMbidStored: number; error: number };
  albums: CoverageResultV2[];
}

function fallbackLinks(band: string, album: string): FallbackLinks {
  const q = encodeURIComponent(`${band} ${album}`);
  return {
    bandcamp: `https://bandcamp.com/search?q=${q}`,
    spotify: `https://open.spotify.com/search/${q}`,
    youtubeMusic: `https://music.youtube.com/search?q=${q}`,
  };
}

function main() {
  const docsDataPath = path.resolve(
    __dirname,
    '../docs/data/musicbrainz-streaming-spike/coverage-2026-09-14.json'
  );
  const raw = fs.readFileSync(docsDataPath, 'utf-8');
  const input = JSON.parse(raw) as CoverageDataV1;

  const output: CoverageDataV2 = {
    generatedAt: input.generatedAt,
    summary: input.summary,
    albums: input.albums.map((row) => ({
      albumId: row.albumId,
      band: row.band,
      album: row.album,
      mbid: row.mbid,
      status: row.status,
      relationType: row.relationType,
      url: row.url,
      fallback_links: fallbackLinks(row.band, row.album),
      verified: { bandcamp: 'not_checked', spotify: 'not_checked', youtubeMusic: 'not_checked' },
      error: row.error,
    })),
  };

  fs.writeFileSync(docsDataPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${docsDataPath}`);

  const publicPath = path.resolve(__dirname, '../public/dev-musicbrainz-streaming-coverage.json');
  fs.writeFileSync(publicPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${publicPath}`);

  console.log(`Added fallback_links (bandcamp/spotify/youtubeMusic) to all ${output.albums.length} albums.`);
}

main();
