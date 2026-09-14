import { useEffect, useState } from 'react';

// Throwaway dev-only page for the MusicBrainz streaming-link coverage spike
// (spike/musicbrainz-streaming-links, not merged to master). Reads the static JSON the
// diagnostic scripts write to public/dev-musicbrainz-streaming-coverage.json:
// scripts/musicbrainz-streaming-coverage-2026-09-14.ts (MB url-rels coverage), then
// scripts/musicbrainz-streaming-fallback-links-2026-09-14.ts (adds fallback_links + verified).
// No design-system polish — this is a dev tool, deleted along with this route once the spike
// is reviewed.

type CoverageStatus = 'found' | 'no_match' | 'no_mbid_stored' | 'error';
type VerifiedState = 'not_checked' | 'correct' | 'wrong';
type Platform = 'bandcamp' | 'spotify' | 'youtubeMusic';

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'bandcamp', label: 'Bandcamp' },
  { key: 'spotify', label: 'Spotify' },
  { key: 'youtubeMusic', label: 'YouTube Music' },
];

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

interface CoverageResult {
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

const VERIFIED_COLOR: Record<VerifiedState, string> = {
  not_checked: '#999',
  correct: '#1a7f37',
  wrong: '#cf222e',
};

const STORAGE_KEY = 'mb-streaming-verification-v1';

type VerificationOverrides = Record<string, Partial<VerifiedBlock>>;

function loadOverrides(): VerificationOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as VerificationOverrides) : {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides: VerificationOverrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // localStorage unavailable — marks just won't persist across reloads this session
  }
}

function VerifyToggle({
  value,
  onChange,
}: {
  value: VerifiedState;
  onChange: (next: VerifiedState) => void;
}) {
  const options: { state: VerifiedState; symbol: string }[] = [
    { state: 'correct', symbol: '✓' },
    { state: 'wrong', symbol: '✗' },
    { state: 'not_checked', symbol: '—' },
  ];
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      {options.map((opt) => (
        <button
          key={opt.state}
          onClick={() => onChange(opt.state)}
          style={{
            width: 22,
            height: 22,
            lineHeight: '20px',
            padding: 0,
            border: `1px solid ${value === opt.state ? VERIFIED_COLOR[opt.state] : '#ccc'}`,
            background: value === opt.state ? VERIFIED_COLOR[opt.state] : 'white',
            color: value === opt.state ? 'white' : '#333',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
          title={opt.state}
        >
          {opt.symbol}
        </button>
      ))}
    </span>
  );
}

export function DevMusicBrainzStreamingCoverage() {
  const [data, setData] = useState<CoverageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<VerificationOverrides>({});

  useEffect(() => {
    setOverrides(loadOverrides());
    fetch('/dev-musicbrainz-streaming-coverage.json')
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  const setVerified = (albumId: string, platform: Platform, state: VerifiedState) => {
    setOverrides((prev) => {
      const next = { ...prev, [albumId]: { ...prev[albumId], [platform]: state } };
      saveOverrides(next);
      return next;
    });
  };

  const resetMarks = () => {
    localStorage.removeItem(STORAGE_KEY);
    setOverrides({});
  };

  const verifiedFor = (row: CoverageResult, platform: Platform): VerifiedState =>
    overrides[row.albumId]?.[platform] ?? row.verified[platform];

  const downloadJson = () => {
    if (!data) return;
    const merged: CoverageData = {
      ...data,
      albums: data.albums.map((row) => ({
        ...row,
        verified: {
          bandcamp: verifiedFor(row, 'bandcamp'),
          spotify: verifiedFor(row, 'spotify'),
          youtubeMusic: verifiedFor(row, 'youtubeMusic'),
        },
      })),
    };
    const blob = new Blob([JSON.stringify(merged, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coverage-2026-09-14-verified.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadError) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        Failed to load coverage data: {loadError}. Run
        `npx tsx scripts/musicbrainz-streaming-coverage-2026-09-14.ts` then
        `npx tsx scripts/musicbrainz-streaming-fallback-links-2026-09-14.ts` first.
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
      <p style={{ display: 'flex', gap: 12 }}>
        <button onClick={downloadJson}>Download verification JSON</button>
        <button onClick={resetMarks}>Reset my marks</button>
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 16 }}>
        <thead>
          <tr>
            {['Artist — Album', 'MBID', 'Status', 'Detail', ...PLATFORMS.map((p) => p.label)].map((h) => (
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
              </td>
              {PLATFORMS.map((p) => (
                <td key={p.key} style={{ padding: '4px 8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    <a href={row.fallback_links[p.key]} target="_blank" rel="noreferrer">
                      search
                    </a>
                    <VerifyToggle
                      value={verifiedFor(row, p.key)}
                      onChange={(state) => setVerified(row.albumId, p.key, state)}
                    />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
