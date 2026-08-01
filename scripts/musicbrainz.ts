import axios from 'axios';

// App name updated to SlantTake in design-system pass 5 (was MetalReviewsDashboard).
// MusicBrainz's API etiquette policy requires a descriptive User-Agent identifying the
// calling application; this string is never user-facing, just what MB's logs see.
const MB_USER_AGENT = 'SlantTake/1.0 (dan.gramada@gmail.com)';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface MusicBrainzData {
  artworkUrl: string | null;
  genres: string[];
  releaseDate: string | null;
  // Release-group MBID — the strong album-identity key (see docs/decisions/album-identity-decisions.md
  // §4). Comes free on the default release search response (no extra request/rate-limit cost).
  releaseGroupId: string | null;
}

/**
 * Look up artwork, genres, release date, and release-group id for a given band + album from
 * MusicBrainz and Cover Art Archive. Returns nulls/empty array for any field that cannot be found.
 *
 * Rate-limit discipline: up to 3 sequential MB requests per call (search, detail,
 * artist genre lookup), each separated by a 1 req/sec sleep.
 */
export async function lookupMusicBrainz(band: string, album: string): Promise<MusicBrainzData> {
  try {
    // Strip review-site title noise that may have leaked through:
    // AMG albums can end with " Review" / " EP Review"; PS bands can start with "Review: "
    const bandForSearch = band.replace(/^Review:\s*/i, '').trim() || band;
    const albumForSearch = album.replace(/\s+(EP\s+)?Review$/i, '').trim() || album;

    // Step A: search for the release to get its MBID, release-group id, and release date
    const mbSearch = await axios.get('https://musicbrainz.org/ws/2/release/', {
      params: {
        query: `artist:"${bandForSearch}" AND release:"${albumForSearch}"`,
        fmt: 'json',
      },
      headers: { 'User-Agent': MB_USER_AGENT },
    });
    const releases: any[] = mbSearch.data?.releases ?? [];
    if (releases.length === 0)
      return { artworkUrl: null, genres: [], releaseDate: null, releaseGroupId: null };

    const mbid: string = releases[0].id;
    const releaseGroupId: string | null = releases[0]['release-group']?.id ?? null;
    // Captured here (free, same response) so Step C can reuse the artist MB already
    // resolved by the release search instead of re-searching by name — see
    // docs/decisions/genre-data.md for the wrong-artist bug this avoids.
    const artistMbid: string | null = releases[0]['artist-credit']?.[0]?.artist?.id ?? null;

    // MB rate limit: 1 req/sec between requests
    await sleep(1000);

    // Step B: fetch release detail (genres + date) and Cover Art Archive in parallel.
    // Only release detail hits MB; CAA is a separate host with no shared rate-limit.
    // CAA is queried at the release-group level first (when we have a release-group id):
    // MB's release search has no relevance sort, so releases[0] above can be an arbitrary
    // pressing with no CAA-uploaded art even when a sibling release in the same group has
    // art. The release-group endpoint surfaces art from whichever release in the group
    // actually has it, and its image URLs are release-level CAA URLs (same shape as before —
    // confirmed live), so downstream storage/rendering of artworkUrl is unaffected.
    const caaUrl = releaseGroupId
      ? `https://coverartarchive.org/release-group/${releaseGroupId}`
      : `https://coverartarchive.org/release/${mbid}`;

    const [releaseRes, caaRes] = await Promise.allSettled([
      axios.get(`https://musicbrainz.org/ws/2/release/${mbid}`, {
        params: { inc: 'genres', fmt: 'json' },
        headers: { 'User-Agent': MB_USER_AGENT },
      }),
      // CAA responses redirect through archive.org, which has been observed to hang
      // indefinitely during an outage rather than erroring quickly (confirmed live —
      // docs/decisions/artwork.md). MB calls don't go through archive.org and haven't
      // shown this failure mode, so only the CAA leg gets an explicit timeout.
      axios.get(caaUrl, {
        headers: { 'User-Agent': MB_USER_AGENT },
        timeout: 8000,
      }),
    ]);

    let artworkUrl: string | null = null;
    if (caaRes.status === 'fulfilled') {
      const images: any[] = caaRes.value.data?.images ?? [];
      const front = images.find((img: any) => img.front === true);
      artworkUrl = front?.image ?? null;
    }

    // Fallback: CAA docs don't guarantee the release-group lookup succeeds whenever the
    // release-level one would (it 404s if the community hasn't picked a front image for the
    // group), so if the group lookup found nothing, retry at the release level before giving
    // up. CAA is unrelated to MB's rate limit, so this costs no extra MB request/sleep.
    if (!artworkUrl && releaseGroupId) {
      try {
        const releaseCaaRes = await axios.get(`https://coverartarchive.org/release/${mbid}`, {
          headers: { 'User-Agent': MB_USER_AGENT },
          timeout: 8000,
        });
        const images: any[] = releaseCaaRes.data?.images ?? [];
        const front = images.find((img: any) => img.front === true);
        artworkUrl = front?.image ?? null;
      } catch {
        // No art available at either the release-group or release level.
      }
    }

    // Date and genres both come from the release detail (more reliable than search result)
    let releaseDate: string | null = null;
    let releaseGenres: Array<{ name: string; count: number }> = [];
    if (releaseRes.status === 'fulfilled') {
      releaseDate = releaseRes.value.data?.date || null;
      releaseGenres = releaseRes.value.data?.genres ?? [];
    }
    let topGenres = [...releaseGenres]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((g: { name: string }) => g.name);

    // Step C: artist-level genre fallback when the release has no genre tags.
    // Wrapped in its own try/catch so a network failure here doesn't discard
    // the artworkUrl and releaseDate already resolved above.
    if (topGenres.length === 0 && artistMbid) {
      try {
        await sleep(1000);
        const artistRes = await axios.get(`https://musicbrainz.org/ws/2/artist/${artistMbid}`, {
          params: { inc: 'genres', fmt: 'json' },
          headers: { 'User-Agent': MB_USER_AGENT },
        });
        const artistGenres: Array<{ name: string; count: number }> = artistRes.data?.genres ?? [];
        topGenres = [...artistGenres]
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map((g: { name: string }) => g.name);
      } catch {
        // Artist fallback failed — artworkUrl and releaseDate are still returned
      }
    }

    return { artworkUrl, genres: topGenres, releaseDate, releaseGroupId };
  } catch {
    return { artworkUrl: null, genres: [], releaseDate: null, releaseGroupId: null };
  }
}
