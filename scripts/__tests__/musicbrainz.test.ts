import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { lookupMusicBrainz } from '../musicbrainz';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

describe('lookupMusicBrainz — Step C artist genre fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses the artist-credit MBID from Step A instead of running a name search', async () => {
    mockedAxios.get.mockImplementation((url: string, config?: any) => {
      if (url === 'https://musicbrainz.org/ws/2/release/' && config?.params?.query) {
        // Step A: release search — artist-credit carries the correct artist MBID
        return Promise.resolve({
          data: {
            releases: [
              {
                id: 'release-mbid',
                'release-group': { id: 'rg-mbid' },
                'artist-credit': [{ artist: { id: 'correct-artist-mbid' } }],
              },
            ],
          },
        });
      }
      if (url === 'https://musicbrainz.org/ws/2/release/release-mbid') {
        // Step B: release detail — no genres, forcing the Step C fallback
        return Promise.resolve({ data: { date: '2020-01-01', genres: [] } });
      }
      if (url === 'https://coverartarchive.org/release/release-mbid') {
        return Promise.resolve({ data: { images: [] } });
      }
      if (url === 'https://musicbrainz.org/ws/2/artist/correct-artist-mbid') {
        // Step C: direct genre lookup by the reused artist MBID
        return Promise.resolve({
          data: {
            genres: [
              { name: 'thrash metal', count: 10 },
              { name: 'speed metal', count: 3 },
            ],
          },
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    const result = await lookupMusicBrainz('W.M.D.', 'Against All Warnings');

    expect(result.genres).toEqual(['thrash metal', 'speed metal']);

    // No name-based artist search (a call to the artist collection endpoint with a
    // `query` param) should ever occur — Step C must go straight to /artist/{id}.
    const artistSearchCalls = mockedAxios.get.mock.calls.filter(
      ([url, config]: [string, any]) =>
        url === 'https://musicbrainz.org/ws/2/artist/' && config?.params?.query
    );
    expect(artistSearchCalls).toHaveLength(0);

    // Confirm the direct lookup was made against the reused artist MBID.
    const directLookupCalls = mockedAxios.get.mock.calls.filter(
      ([url]: [string]) => url === 'https://musicbrainz.org/ws/2/artist/correct-artist-mbid'
    );
    expect(directLookupCalls).toHaveLength(1);
  });
});

describe('lookupMusicBrainz — status field (Concern A: not_found vs error)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns status "not_found" when the release search finds nothing', async () => {
    mockedAxios.get.mockResolvedValue({ data: { releases: [] } });

    const result = await lookupMusicBrainz('Nonexistent Band', 'Nonexistent Album');

    expect(result.status).toBe('not_found');
    expect(result).toEqual({
      artworkUrl: null,
      genres: [],
      releaseDate: null,
      releaseGroupId: null,
      status: 'not_found',
    });
  });

  it('returns status "error" when the search request itself fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network timeout'));

    const result = await lookupMusicBrainz('Some Band', 'Some Album');

    expect(result.status).toBe('error');
    expect(result).toEqual({
      artworkUrl: null,
      genres: [],
      releaseDate: null,
      releaseGroupId: null,
      status: 'error',
    });
  });

  it('returns status "ok" on a successful lookup', async () => {
    mockedAxios.get.mockImplementation((url: string, config?: any) => {
      if (url === 'https://musicbrainz.org/ws/2/release/' && config?.params?.query) {
        return Promise.resolve({
          data: {
            releases: [
              {
                id: 'release-mbid',
                'release-group': { id: 'rg-mbid' },
                'artist-credit': [{ artist: { id: 'artist-mbid' } }],
              },
            ],
          },
        });
      }
      if (url === 'https://musicbrainz.org/ws/2/release/release-mbid') {
        return Promise.resolve({
          data: { date: '2020-01-01', genres: [{ name: 'doom metal', count: 5 }] },
        });
      }
      if (url === 'https://coverartarchive.org/release-group/rg-mbid') {
        return Promise.resolve({ data: { images: [{ front: true, image: 'art.jpg' }] } });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    const result = await lookupMusicBrainz('Some Band', 'Some Album');

    expect(result.status).toBe('ok');
    expect(result.artworkUrl).toBe('art.jpg');
  });
});

describe('lookupMusicBrainz — artwork picker (Concern B: front-preferred, approved-fallback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockSearchAndCaa(images: any[]) {
    mockedAxios.get.mockImplementation((url: string, config?: any) => {
      if (url === 'https://musicbrainz.org/ws/2/release/' && config?.params?.query) {
        return Promise.resolve({
          data: {
            releases: [
              {
                id: 'release-mbid',
                'release-group': { id: 'rg-mbid' },
                'artist-credit': [{ artist: { id: 'artist-mbid' } }],
              },
            ],
          },
        });
      }
      if (url === 'https://musicbrainz.org/ws/2/release/release-mbid') {
        return Promise.resolve({ data: { date: '2020-01-01', genres: [] } });
      }
      if (url === 'https://coverartarchive.org/release-group/rg-mbid') {
        return Promise.resolve({ data: { images } });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
  }

  it('still prefers a front:true image over an approved-but-not-front one', async () => {
    mockSearchAndCaa([
      { front: false, approved: true, image: 'approved-non-front.jpg' },
      { front: true, approved: true, image: 'front.jpg' },
    ]);

    const result = await lookupMusicBrainz('Some Band', 'Some Album');

    expect(result.artworkUrl).toBe('front.jpg');
  });

  it('falls back to an approved:true image when no front:true image exists', async () => {
    mockSearchAndCaa([{ front: false, approved: true, image: 'approved-non-front.jpg' }]);

    const result = await lookupMusicBrainz('Some Band', 'Some Album');

    expect(result.artworkUrl).toBe('approved-non-front.jpg');
  });

  it('returns null artworkUrl when no image is front or approved', async () => {
    mockSearchAndCaa([{ front: false, approved: false, image: 'unapproved.jpg' }]);

    const result = await lookupMusicBrainz('Some Band', 'Some Album');

    expect(result.artworkUrl).toBeNull();
  });

  it('returns null artworkUrl when there are no images at all', async () => {
    mockSearchAndCaa([]);

    const result = await lookupMusicBrainz('Some Band', 'Some Album');

    expect(result.artworkUrl).toBeNull();
  });
});

describe('lookupMusicBrainz — tier-3 releases[0] fallback (Concern E)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finds artwork on a non-releases[0] release when tiers 1-2 both fail', async () => {
    mockedAxios.get.mockImplementation((url: string, config?: any) => {
      if (url === 'https://musicbrainz.org/ws/2/release/' && config?.params?.query) {
        return Promise.resolve({
          data: {
            releases: [
              {
                id: 'release-0-no-art',
                'release-group': { id: 'rg-mbid' },
                'artist-credit': [{ artist: { id: 'artist-mbid' } }],
              },
            ],
          },
        });
      }
      if (url === 'https://musicbrainz.org/ws/2/release/release-0-no-art') {
        return Promise.resolve({ data: { date: '2020-01-01', genres: [{ name: 'doom metal', count: 1 }] } });
      }
      // Tier 1: release-group CAA lookup — no art
      if (url === 'https://coverartarchive.org/release-group/rg-mbid') {
        return Promise.reject({ response: { status: 404 } });
      }
      // Tier 2: releases[0]'s own CAA lookup — no art either
      if (url === 'https://coverartarchive.org/release/release-0-no-art') {
        return Promise.reject({ response: { status: 404 } });
      }
      // Tier 3: sweep the rest of the release group
      if (
        url === 'https://musicbrainz.org/ws/2/release-group/rg-mbid' &&
        config?.params?.inc === 'releases'
      ) {
        return Promise.resolve({
          data: { releases: [{ id: 'release-0-no-art' }, { id: 'release-1-has-art' }] },
        });
      }
      if (url === 'https://coverartarchive.org/release/release-1-has-art') {
        return Promise.resolve({ data: { images: [{ front: true, image: 'tier3-art.jpg' }] } });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    const result = await lookupMusicBrainz('Some Band', 'Some Album');

    expect(result.artworkUrl).toBe('tier3-art.jpg');
    expect(result.status).toBe('ok');

    // releases[0] must not be re-checked on CAA in tier 3 (already checked in tier 2)
    const release0CaaCalls = mockedAxios.get.mock.calls.filter(
      ([url]: [string]) => url === 'https://coverartarchive.org/release/release-0-no-art'
    );
    expect(release0CaaCalls).toHaveLength(1);
  });

  it('does not flip status to error when tier-3s own release-list fetch fails', async () => {
    mockedAxios.get.mockImplementation((url: string, config?: any) => {
      if (url === 'https://musicbrainz.org/ws/2/release/' && config?.params?.query) {
        return Promise.resolve({
          data: {
            releases: [
              {
                id: 'release-0-no-art',
                'release-group': { id: 'rg-mbid' },
                'artist-credit': [{ artist: { id: 'artist-mbid' } }],
              },
            ],
          },
        });
      }
      if (url === 'https://musicbrainz.org/ws/2/release/release-0-no-art') {
        return Promise.resolve({ data: { date: '2020-01-01', genres: [{ name: 'doom metal', count: 1 }] } });
      }
      if (url === 'https://coverartarchive.org/release-group/rg-mbid') {
        return Promise.reject({ response: { status: 404 } });
      }
      if (url === 'https://coverartarchive.org/release/release-0-no-art') {
        return Promise.reject({ response: { status: 404 } });
      }
      // Tier 3's own MB request fails (network/rate-limit) — not a genuine empty list.
      if (
        url === 'https://musicbrainz.org/ws/2/release-group/rg-mbid' &&
        config?.params?.inc === 'releases'
      ) {
        return Promise.reject(new Error('network timeout'));
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await lookupMusicBrainz('Some Band', 'Some Album');

    expect(result.status).toBe('ok');
    expect(result.artworkUrl).toBeNull();
    expect(result.releaseDate).toBe('2020-01-01');
    expect(result.genres).toEqual(['doom metal']);
    expect(result.releaseGroupId).toBe('rg-mbid');
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('caps the number of additional releases checked in tier 3', async () => {
    const manyReleases = Array.from({ length: 15 }, (_, i) => ({ id: `sibling-${i}` }));
    let siblingCaaCallCount = 0;

    mockedAxios.get.mockImplementation((url: string, config?: any) => {
      if (url === 'https://musicbrainz.org/ws/2/release/' && config?.params?.query) {
        return Promise.resolve({
          data: {
            releases: [
              {
                id: 'release-0-no-art',
                'release-group': { id: 'rg-mbid' },
                'artist-credit': [{ artist: { id: 'artist-mbid' } }],
              },
            ],
          },
        });
      }
      if (url === 'https://musicbrainz.org/ws/2/release/release-0-no-art') {
        return Promise.resolve({ data: { date: null, genres: [] } });
      }
      if (url === 'https://coverartarchive.org/release-group/rg-mbid') {
        return Promise.reject({ response: { status: 404 } });
      }
      if (url === 'https://coverartarchive.org/release/release-0-no-art') {
        return Promise.reject({ response: { status: 404 } });
      }
      if (
        url === 'https://musicbrainz.org/ws/2/release-group/rg-mbid' &&
        config?.params?.inc === 'releases'
      ) {
        return Promise.resolve({ data: { releases: [{ id: 'release-0-no-art' }, ...manyReleases] } });
      }
      if (url.startsWith('https://coverartarchive.org/release/sibling-')) {
        siblingCaaCallCount++;
        return Promise.reject({ response: { status: 404 } }); // none of the siblings have art
      }
      if (url === 'https://musicbrainz.org/ws/2/artist/artist-mbid') {
        return Promise.resolve({ data: { genres: [] } });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });

    const result = await lookupMusicBrainz('Some Band', 'Some Album');

    expect(result.artworkUrl).toBeNull();
    expect(siblingCaaCallCount).toBe(10);
  });
});
