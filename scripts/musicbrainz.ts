import axios from 'axios';

// App name updated to SlantTake in design-system pass 5 (was MetalReviewsDashboard).
// MusicBrainz's API etiquette policy requires a descriptive User-Agent identifying the
// calling application; this string is never user-facing, just what MB's logs see.
const MB_USER_AGENT = 'SlantTake/1.0 (dan.gramada@gmail.com)';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// An image can be approved on CAA without being tagged front:true — front:true-only was
// missing real artwork for confirmed-approved images (e.g. MBID
// d13afb14-38d0-452b-b986-e3003c385856). Prefer front, fall back to the first approved image.
// See docs/decisions/artwork.md, Concern B.
function pickArtwork(images: any[]): string | null {
  const front = images.find((img: any) => img.front === true);
  if (front) return front.image;
  const approved = images.find((img: any) => img.approved === true);
  return approved?.image ?? null;
}

export interface MusicBrainzData {
  artworkUrl: string | null;
  genres: string[];
  releaseDate: string | null;
  // Release-group MBID — the strong album-identity key (see docs/decisions/album-identity/album-identity-decisions.md
  // §4). Comes free on the default release search response (no extra request/rate-limit cost).
  releaseGroupId: string | null;
  // Distinguishes a confirmed-empty MB search ('not_found') from a request/network failure
  // ('error') — both previously returned the identical null/empty shape, so a caller couldn't
  // tell "genuinely not on MB" from "transient failure, worth retrying without penalty". See
  // docs/decisions/artwork.md, Concern A.
  status: 'ok' | 'not_found' | 'error';
}

const MAX_TIER3_RELEASES_CHECKED = 10;

/**
 * Look up artwork, genres, release date, and release-group id for a given band + album from
 * MusicBrainz and Cover Art Archive. Returns nulls/empty array for any field that cannot be found.
 *
 * Rate-limit discipline: up to 4 sequential MB requests per call (search, detail,
 * artist genre lookup, tier-3 artwork sweep — the last one only reached when the
 * release-group and releases[0] CAA lookups both fail to find artwork), each separated by a
 * 1 req/sec sleep.
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
      return {
        artworkUrl: null,
        genres: [],
        releaseDate: null,
        releaseGroupId: null,
        status: 'not_found',
      };

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
      artworkUrl = pickArtwork(images);
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
        artworkUrl = pickArtwork(images);
      } catch {
        // No art available at either the release-group or release level.
      }
    }

    // Tier 3: releases[0] (Step A's pick) has no relevance sort behind it — it can be an
    // arbitrary pressing with no CAA art while a sibling release in the same group has real,
    // approved artwork. Confirmed live: Raphael Weinroth-Browne — Empyrean (see
    // docs/decisions/deferred-work.md). Sweeps up to MAX_TIER3_RELEASES_CHECKED other releases
    // in the group, reusing pickArtwork() as-is. Entirely isolated in its own try/catch — a
    // failure here must never flip status away from 'ok' after Step A/B already succeeded.
    if (!artworkUrl && releaseGroupId) {
      try {
        let otherReleaseIds: string[] = [];
        try {
          await sleep(1000); // MB rate limit — 4th MB request, only reached when tiers 1-2 fail
          const groupRes = await axios.get(
            `https://musicbrainz.org/ws/2/release-group/${releaseGroupId}`,
            { params: { inc: 'releases', fmt: 'json' }, headers: { 'User-Agent': MB_USER_AGENT } }
          );
          otherReleaseIds = (groupRes.data?.releases ?? [])
            .map((r: any) => r.id)
            .filter((id: string) => id && id !== mbid) // already checked in tier 2
            .slice(0, MAX_TIER3_RELEASES_CHECKED);
        } catch (e) {
          // A request failure here is NOT "this group has 0 other releases" — that conflation
          // is exactly the bug Concern D.1 found and fixed in the diagnostic script. Logged so
          // it's observable/distinguishable rather than silently identical to a genuine empty
          // list.
          console.warn(`Tier-3 release-group fetch failed for ${releaseGroupId}, skipping:`, e);
        }

        for (const releaseId of otherReleaseIds) {
          try {
            const caaRes = await axios.get(`https://coverartarchive.org/release/${releaseId}`, {
              headers: { 'User-Agent': MB_USER_AGENT },
              timeout: 8000,
            });
            const found = pickArtwork(caaRes.data?.images ?? []);
            if (found) {
              artworkUrl = found;
              break;
            }
          } catch {
            // this release has no CAA entry — try the next one
          }
        }
      } catch {
        // Outer isolation net — inner try/catches above should already handle everything, this
        // guarantees a bug in tier 3 can never reach the outer catch and flip status to 'error'.
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

    return { artworkUrl, genres: topGenres, releaseDate, releaseGroupId, status: 'ok' };
  } catch {
    return { artworkUrl: null, genres: [], releaseDate: null, releaseGroupId: null, status: 'error' };
  }
}
