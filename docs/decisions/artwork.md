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
