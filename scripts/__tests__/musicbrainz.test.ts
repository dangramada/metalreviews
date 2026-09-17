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
