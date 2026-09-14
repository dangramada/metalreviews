import { useEffect, useState } from 'react';

// Throwaway dev-only page for the MusicBrainz streaming-link coverage spike
// (spike/musicbrainz-streaming-links, not merged to master). Reads the static JSON the
// diagnostic script (scripts/musicbrainz-streaming-coverage-2026-09-14.ts) writes to
// public/dev-musicbrainz-streaming-coverage.json. No design-system polish — this is a dev
// tool, deleted along with this route once the spike is reviewed.

type CoverageStatus = 'found' | 'no_match' | 'no_mbid_stored' | 'error';

interface CoverageResult {
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

interface CoverageData {
  generatedAt: string;
  summary: { total: number; linkFound: number; noMatch: number; noMbidStored: number; error: number };
  albums: CoverageResult[];
}

const STATUS_LABEL: Record<CoverageStatus, string> = {
  found: 'Found',
  no_match: 'No match',
  no_mbid_stored: 'No MBID stored',
  error: 'Error',
};

export function DevMusicBrainzStreamingCoverage() {
  const [data, setData] = useState<CoverageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/dev-musicbrainz-streaming-coverage.json')
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (loadError) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        Failed to load coverage data: {loadError}. Run
        `npx tsx scripts/musicbrainz-streaming-coverage-2026-09-14.ts` first.
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: 24, fontFamily: 'monospace' }}>Loading…</div>;
  }

  const { summary, albums } = data;

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', fontSize: 14 }}>
      <h1 style={{ fontSize: 18 }}>MusicBrainz streaming link coverage</h1>
      <p>Generated {new Date(data.generatedAt).toLocaleString()}</p>
      <p style={{ fontWeight: 'bold' }}>
        {summary.linkFound} of {summary.total} albums have a direct link
      </p>
      <p>
        {summary.noMatch} no match &middot; {summary.noMbidStored} no MBID stored &middot;{' '}
        {summary.error} errored
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 16 }}>
        <thead>
          <tr>
            {['Artist — Album', 'MBID', 'Status', 'Detail'].map((h) => (
              <th
                key={h}
                style={{ textAlign: 'left', borderBottom: '2px solid #ccc', padding: '4px 8px' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {albums.map((row) => (
            <tr key={row.albumId} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px 8px' }}>
                {row.band} — {row.album}
              </td>
              <td style={{ padding: '4px 8px' }}>{row.mbid ?? '—'}</td>
              <td style={{ padding: '4px 8px' }}>{STATUS_LABEL[row.status]}</td>
              <td style={{ padding: '4px 8px' }}>
                {row.status === 'found' && row.url && (
                  <>
                    [{row.relationType}]{' '}
                    <a href={row.url} target="_blank" rel="noreferrer">
                      {row.url}
                    </a>
                  </>
                )}
                {row.status === 'error' && row.error}
                {(row.status === 'no_match' || row.status === 'no_mbid_stored') && row.fallbackSearch && (
                  <>
                    <a href={row.fallbackSearch.bandcamp} target="_blank" rel="noreferrer">
                      Bandcamp search
                    </a>{' '}
                    &middot;{' '}
                    <a href={row.fallbackSearch.spotify} target="_blank" rel="noreferrer">
                      Spotify search
                    </a>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
