// src/__tests__/listenLinks.test.ts
import { describe, it, expect } from 'vitest';
import { buildListenUrl, LISTEN_PLATFORMS } from '../listenLinks';

describe('buildListenUrl', () => {
  it('builds a Bandcamp search URL with encoded band + album', () => {
    expect(buildListenUrl('bandcamp', 'Opeth', 'Blackwater Park')).toBe(
      'https://bandcamp.com/search?q=Opeth%20Blackwater%20Park'
    );
  });

  it('builds a Spotify search URL with encoded band + album', () => {
    expect(buildListenUrl('spotify', 'Opeth', 'Blackwater Park')).toBe(
      'https://open.spotify.com/search/Opeth%20Blackwater%20Park'
    );
  });

  it('builds a YouTube Music search URL with encoded band + album', () => {
    expect(buildListenUrl('youtubeMusic', 'Opeth', 'Blackwater Park')).toBe(
      'https://music.youtube.com/search?q=Opeth%20Blackwater%20Park'
    );
  });

  it('builds a Deezer search URL with encoded band + album', () => {
    expect(buildListenUrl('deezer', 'Opeth', 'Blackwater Park')).toBe(
      'https://www.deezer.com/search/Opeth%20Blackwater%20Park'
    );
  });

  it('encodes special characters (&, /, ?) in band or album names', () => {
    const url = buildListenUrl('bandcamp', 'AC/DC', 'Ride On?');
    expect(url).toBe('https://bandcamp.com/search?q=AC%2FDC%20Ride%20On%3F');
  });

  it('lists all four platforms with Bandcamp first, per product priority', () => {
    expect(LISTEN_PLATFORMS.map((p) => p.id)).toEqual([
      'bandcamp',
      'spotify',
      'youtubeMusic',
      'deezer',
    ]);
  });
});
