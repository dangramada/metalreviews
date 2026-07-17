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
