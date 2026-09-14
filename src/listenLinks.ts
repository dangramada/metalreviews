// src/listenLinks.ts
//
// Generates search-result URLs for the "Listen" chip on the album card. No API/exact-match
// link is feasible at our scale (MusicBrainz coverage tested near-zero, Spotify API now
// requires the developer's own Premium subscription, Bandcamp has no public search API) —
// see docs/decisions/streaming-links--concept-draft.md and streaming-links--competitor-analysis.md.
// These are plain search-result links built from data already on `albums` (band + album),
// not verified matches — never claim otherwise in UI copy.

export type ListenPlatform = 'bandcamp' | 'spotify' | 'youtubeMusic' | 'deezer';

// Order here is product priority for this genre (Bandcamp first) and doubles as the
// MenuItem render order — see the brief.
export const LISTEN_PLATFORMS: { id: ListenPlatform; label: string }[] = [
  { id: 'bandcamp', label: 'Bandcamp' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'youtubeMusic', label: 'YouTube Music' },
  { id: 'deezer', label: 'Deezer' },
];

export function buildListenUrl(platform: ListenPlatform, band: string, album: string): string {
  const query = `${band} ${album}`;
  const encoded = encodeURIComponent(query);

  switch (platform) {
    case 'bandcamp':
      return `https://bandcamp.com/search?q=${encoded}`;
    case 'spotify':
      return `https://open.spotify.com/search/${encoded}`;
    case 'youtubeMusic':
      return `https://music.youtube.com/search?q=${encoded}`;
    case 'deezer':
      return `https://www.deezer.com/search/${encoded}`;
  }
}
