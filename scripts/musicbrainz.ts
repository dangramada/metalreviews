import axios from 'axios';

const MB_USER_AGENT = 'MetalReviewsDashboard/1.0 (dan.gramada@gmail.com)';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface MusicBrainzData {
  artworkUrl: string | null;
  genres: string[];
  releaseDate: string | null;
}

/**
 * Look up artwork, genres, and release date for a given band + album from MusicBrainz
 * and Cover Art Archive. Returns nulls/empty array for any field that cannot be found.
 *
 * Rate-limit discipline: up to 4 sequential MB requests per call (search, detail,
 * artist search, artist detail), each separated by a 1 req/sec sleep.
 */
export async function lookupMusicBrainz(band: string, album: string): Promise<MusicBrainzData> {
  try {
    // Strip review-site title noise that may have leaked through:
    // AMG albums can end with " Review" / " EP Review"; PS bands can start with "Review: "
    const bandForSearch = band.replace(/^Review:\s*/i, '').trim() || band;
    const albumForSearch = album.replace(/\s+(EP\s+)?Review$/i, '').trim() || album;

    // Step A: search for the release to get its MBID and release date
    const mbSearch = await axios.get('https://musicbrainz.org/ws/2/release/', {
      params: {
        query: `artist:"${bandForSearch}" AND release:"${albumForSearch}"`,
        fmt: 'json',
      },
      headers: { 'User-Agent': MB_USER_AGENT },
    });
    const releases: any[] = mbSearch.data?.releases ?? [];
    if (releases.length === 0) return { artworkUrl: null, genres: [], releaseDate: null };

    const mbid: string = releases[0].id;
    // MB search results include the date field directly — text, may be partial ("2024", "2024-03")
    const releaseDate: string | null = releases[0].date ?? null;

    // MB rate limit: 1 req/sec between requests
    await sleep(1000);

    // Step B: fetch release detail (genres) and Cover Art Archive in parallel.
    // Only release detail hits MB; CAA is a separate host with no shared rate-limit.
    const [releaseRes, caaRes] = await Promise.allSettled([
      axios.get(`https://musicbrainz.org/ws/2/release/${mbid}`, {
        params: { inc: 'genres', fmt: 'json' },
        headers: { 'User-Agent': MB_USER_AGENT },
      }),
      axios.get(`https://coverartarchive.org/release/${mbid}`, {
        headers: { 'User-Agent': MB_USER_AGENT },
      }),
    ]);

    let artworkUrl: string | null = null;
    if (caaRes.status === 'fulfilled') {
      const images: any[] = caaRes.value.data?.images ?? [];
      const front = images.find((img: any) => img.front === true);
      artworkUrl = front?.image ?? null;
    }

    let releaseGenres: Array<{ name: string; count: number }> = [];
    if (releaseRes.status === 'fulfilled') {
      releaseGenres = releaseRes.value.data?.genres ?? [];
    }
    let topGenres = [...releaseGenres]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((g: { name: string }) => g.name);

    // Step C: artist-level genre fallback when the release has no genre tags.
    // Wrapped in its own try/catch so a network failure here doesn't discard
    // the artworkUrl and releaseDate already resolved above.
    if (topGenres.length === 0) {
      try {
        await sleep(1000);
        const artistSearch = await axios.get('https://musicbrainz.org/ws/2/artist/', {
          params: { query: `artist:"${band}"`, fmt: 'json', limit: 1 },
          headers: { 'User-Agent': MB_USER_AGENT },
        });
        const artists: any[] = artistSearch.data?.artists ?? [];
        if (artists.length > 0) {
          const artistMbid: string = artists[0].id;
          await sleep(1000);
          const artistRes = await axios.get(`https://musicbrainz.org/ws/2/artist/${artistMbid}`, {
            params: { inc: 'genres', fmt: 'json' },
            headers: { 'User-Agent': MB_USER_AGENT },
          });
          const artistGenres: Array<{ name: string; count: number }> =
            artistRes.data?.genres ?? [];
          topGenres = [...artistGenres]
            .sort((a, b) => b.count - a.count)
            .slice(0, 3)
            .map((g: { name: string }) => g.name);
        }
      } catch {
        // Artist fallback failed — artworkUrl and releaseDate are still returned
      }
    }

    return { artworkUrl, genres: topGenres, releaseDate };
  } catch {
    return { artworkUrl: null, genres: [], releaseDate: null };
  }
}
