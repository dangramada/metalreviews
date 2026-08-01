# Session decisions — Album artwork (June 2026)

## What was built

- Album artwork is fetched during ingestion via **MusicBrainz** (release search) then **Cover Art Archive** (front image URL). Stored as `artworkUrl: string | null` on every review object.
- Artwork is displayed at the top of each card as a square block. Score badge moved from the card body into the artwork block, absolutely positioned bottom-right.
- Double-Positive detection and its UI (cyan border, star badge) were removed entirely. `isDoublePositive` is kept as an optional field in the type to avoid breaking existing JSON reads.

## Key patterns introduced

**`ArtworkBlock` component** (`src/App.tsx`): Extracted as a sibling function (not a separate file) so each card gets its own isolated `useState(false)` for `loaded` without prop-drilling a Map. Pattern to reuse if other per-card stateful UI is needed.

**Skeleton shimmer**: Uses Chakra's `<Skeleton>` as a `position="absolute"` overlay with `opacity={loaded ? 0 : 1}` and `transition="opacity 0.3s ease"`. Deliberately does **not** use Chakra's `isLoaded` prop — that would instantly remove the shimmer element, bypassing the CSS fade. `pointerEvents="none"` prevents the invisible skeleton from blocking clicks after load.

**Square artwork aspect ratio**: Uses `paddingBottom="100%"` on a `position="relative"` Box (not Chakra's `AspectRatio` component) so absolutely-positioned children (image, skeleton, score badge) all stack cleanly inside it.

**`overflow: 'hidden'` on cardStyle**: Required so the artwork image clips to the card's `borderRadius: 'lg'` at the top corners.

## Thumbnail URL transform (June 2026)

`artwork_url` is stored as the full-resolution CAA URL (e.g. `.../45148958831.jpg`). At render time, `ArtworkBlock` passes the URL through `toThumbnailUrl()` before setting `<img src>`, which inserts `-500` before the extension (→ `.../45148958831-500.jpg`). CAA pre-generates these thumbnails for every approved image; verified against 3 real releases from this project's data.

- `500` chosen over `1200`: card grid squares are small; no click-to-enlarge feature exists or is planned. Revisit only if one ships.
- Storage is **not** changed — no new DB column, no backfill. The transform is purely at render time.
- The `onError` fallback (`failed` state → placeholder) is the safety net for any release whose URL doesn't follow the convention (would 404 on the transformed URL). **Confirmed present** in `ArtworkBlock` as of June 2026.

## Load-failure fallback (June 2026)

`ArtworkBlock` holds a `failed: boolean` state (alongside `loaded`). `onError={() => setFailed(true)}` on the `<Image>` catches any load failure (CAA/archive.org 500s, 404s on non-standard thumbnail paths, etc.). When `failed` is true, the `<Image>` branch is not rendered (no broken img in DOM) and the `artworkUrl === null` placeholder (`♪ / No artwork found`) is shown instead. The skeleton shimmer is also resolved — the shimmer branch isn't rendered when `failed=true`, so it cannot animate indefinitely.

## MusicBrainz rate limiting

`fetchArtworkUrl` calls are **sequential** in `runIngestion` with a `sleep(1000)` between each one. MusicBrainz requires a max of 1 req/sec from a single client. The existing parallel RSS + rating fetches are unaffected. Required `User-Agent` header on every MB and CAA request: `MetalReviewsDashboard/1.0 (dan.gramada@gmail.com)`.

## CAA lookup: release-group first, release-level fallback (2026-07-30)

**Root cause found:** `scripts/musicbrainz.ts` took `releases[0].id` from the MB release
search (no relevance sort) and queried CAA at that single release's URL. MB often ties
multiple releases at score 100 in arbitrary order; if `releases[0]` happened to be a
pressing with no CAA-uploaded art (e.g. a vinyl/CD release with a sibling Digital Media
release that *does* have art), `artwork_url` was stored `null` even though art existed
for the album. Confirmed live on Immolation — *Descent*.

**Fix:** query CAA at the **release-group** level first (`GET
coverartarchive.org/release-group/{rg-id}`, using `release-group.id` already present on
the MB search response — no extra MB request or rate-limit cost), which surfaces art from
whichever release in the group has it. **Fall back to the release-level call**
(`/release/{mbid}`) only if the group lookup 404s/fails — CAA's own docs don't guarantee
group lookup succeeds whenever release-level would (it 404s if "the community have not
chosen an image to represent the release group"), so the fallback preserves prior
correctness for any edge case the group endpoint misses. Both endpoints return the same
response shape and the same release-level image URL format (`.../release/<mbid>/<file>.jpg`)
— confirmed live across 3 albums (Immolation, Opeth, Metallica), so no downstream
storage/rendering change was needed.

No backfill script: existing `artwork_url: null` rows are already retried on every ingest
run (see `genre-artwork-bugfixes.md`), so this self-heals on the next ingest pass.

## CAA request timeout (2026-08-01)

**Diagnostic finding:** after the release-group fix above, one album (Immolation —
*Descent*) still showed `artwork_url: null` after a backfill pass that correctly
populated its `genre`/`release_date` in the same run. Live-traced the cause: CAA's
`/release-group/{id}` and `/release/{mbid}` endpoints both **307-redirect through
`archive.org/download/mbid-.../index.json`** — not served directly by CAA's own host —
and archive.org's backing store was in a degraded state at the time (one request hung
indefinitely until killed manually; a second, unrelated release-group returned a `500`
from `nginx` after ~7s). Since `axios.get` had no `timeout` configured on either CAA
call, a hung/degraded response could block far longer than intended instead of failing
fast into the existing null/retry path. Confirmed this wasn't specific to one album —
the outage was on archive.org's side, affecting any CAA lookup at the time.

**Fix:** added `timeout: 8000` to both CAA calls (release-group primary + release-level
fallback). 8s chosen as long enough to tolerate normal network variance but short enough
not to meaningfully stall a full ingest run if several albums hit it in the same pass.
Verified the config actually fails fast: pointed the same axios options at a
simulated-hang endpoint (`httpbin.org/delay/30`) and confirmed it aborted at ~8.03s with
`ECONNABORTED`, rather than hanging.

MB calls (a different host, unaffected by this failure mode) were left untouched — no
shared axios instance exists in this file, each `axios.get` call configures its own
options independently, so this was a two-line, CAA-only change.

**Scope note:** this only makes failure detection faster — it does not change what
happens after a failure. `artwork_url` still ends up `null` and gets retried on the next
scheduled ingest run via the existing backfill logic; no retry-on-timeout loop was added.
