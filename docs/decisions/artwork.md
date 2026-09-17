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

## `lookupMusicBrainz` status field: not_found vs error (2026-09-17, Concern A)

**Root cause found:** a 2026-09-17 diagnostic pass (`scripts/diagnose-missing-artwork-2026-09-17.ts`
— full findings in the session brief, not committed to this repo) found 70 `albums` rows with
`artwork_url IS NULL`. Of the 57 where a fresh MB search found nothing, 10 previously had a
`mb_release_group_id` already stored — meaning a past ingest run *had* resolved them, which
means the "nothing found" result on this run is far more likely a transient failure (timeout,
rate-limit, network hiccup) than the release having vanished from MusicBrainz. Before this fix,
`lookupMusicBrainz`'s outer `try { ... } catch { return { artworkUrl: null, ... } }` in
`scripts/musicbrainz.ts` returned the exact same null/empty shape for a genuine zero-result
search as for a thrown network/HTTP error — nothing downstream could tell them apart.

**Why this mattered:** `selectAlbumBackfillCandidates` (`scripts/ingest.ts`) stops retrying an
album once an attached review has `mb_lookup_attempts >= 5` and is more than 14 days old. A run
of bad luck with transient errors burned through that budget exactly as fast as genuine
"not on MB" results — and once burned, the album was never looked at again even if it was a
real, findable release the whole time.

**Fix:** `MusicBrainzData` now carries `status: 'ok' | 'not_found' | 'error'` alongside the
existing fields — `'not_found'` for a confirmed empty release search, `'error'` for the outer
catch (request/network failure), `'ok'` on success. In the backfill loop
(`scripts/ingest.ts`), `mb_lookup_attempts` only increments when `status !== 'error'`:

```ts
mb_lookup_attempts: (rv.mb_lookup_attempts ?? 0) + (mbData.status === 'error' ? 0 : 1),
```

A transient failure no longer consumes the same 5-attempt/14-day budget as a confirmed
"not on MB" result — the album stays eligible for retry on the next run regardless of how many
times it previously errored. The RSS ingest loop was untouched — it already never increments
`mb_lookup_attempts` (see the existing comment at its write site).

**What NOT to change without re-reading this:** don't add retry/backoff logic inside
`lookupMusicBrainz` itself as an extension of this fix — that's a separate, larger design
decision (explicitly out of scope for this pass, see the session brief). This fix only stops
conflating errors with empty results; it does not change *when* or *how often* a retry happens
beyond the one-line budget change above.

**Scope note:** this pass did not touch the artwork-picker `front:true`-only filter, MB search
query normalization, or the exhausted-rows backfill script — those are separate concerns (B, C,
D) from the same 2026-09-17 diagnostic, each its own branch/session.

## Artwork picker: front-preferred, approved-fallback (2026-09-17, Concern B)

**Root cause found:** both CAA lookups in `lookupMusicBrainz` (release-group primary, release-
level fallback) did `images.find((img) => img.front === true)` and nothing else. An image can
be `approved: true` on CAA without being tagged `front: true` — confirmed live on MBID
`d13afb14-38d0-452b-b986-e3003c385856`. The 2026-09-17 diagnostic found 2 of 70 affected rows
(Raphael Weinroth-Browne — *Empyrean*; slq — *Crown Shyness*) had real, approved artwork that
the front-only filter was silently discarding.

**Fix:** extracted a shared `pickArtwork(images)` helper (prefers `front: true`, falls back to
the first `approved: true` image) and applied it at both CAA call sites, removing the
duplicated filter logic.

**Live verification (2026-09-17, post-fix):**
- `slq — Crown Shyness` — **confirmed fixed.** `lookupMusicBrainz` now returns a real
  `artworkUrl` (`https://coverartarchive.org/release/1a8800a9-.../45538565449.jpg`).
- `Raphael Weinroth-Browne — Empyrean` — **still returns `artworkUrl: null`,** but not because
  the picker fix failed: MB's release search for this album returns 3 releases with no
  relevance sort, and `releases[0]` resolves to `0a1681b0-95e1-4fca-a683-a072fed8c0f6` (no CAA
  entry at all — confirmed 404), not `d13afb14-38d0-452b-b986-e3003c385856` (the MBID with the
  approved image the diagnostic found). This is the separate, already-flagged "`releases[0]`
  arbitrary pick" issue — explicitly out of scope for both Concern A and B (see the session
  brief's scope boundary) and unaffected by this fix. This row will need that separate,
  larger change to `lookupMusicBrainz`'s Step A before it resolves.

MB was also observed 503-ing intermittently during this verification (one clean pass out of
three attempts) — consistent with Concern A's premise that MB failures are transient, not
"release doesn't exist."
