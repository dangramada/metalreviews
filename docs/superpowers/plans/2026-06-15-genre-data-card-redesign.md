# Genre Data + Card Badge Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate `genre` on every review via MusicBrainz, move the source badge onto artwork (top-left), and replace it in the card body with purple genre tags.

**Architecture:** Extend the existing MusicBrainz call in `scripts/ingest.ts` (rename `fetchArtworkUrl` → `fetchMusicBrainzData`) to also fetch genres using `inc=genres` on the release lookup, with an artist-level fallback when releases have none. On the frontend, add the source badge inside `ArtworkBlock` (absolutely positioned, top-left) and render Chakra `<Tag>` genre pills in the card body where the source badge used to live.

**Tech Stack:** TypeScript, Node.js, axios (MusicBrainz + CAA requests), React, Chakra UI v2 (`Tag`, `Wrap`, `WrapItem`)

---

## File Map

| File                | Change                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`      | Add `genre: string[]` to `MetalReview`                                                                                                 |
| `scripts/ingest.ts` | Rename `fetchArtworkUrl` → `fetchMusicBrainzData`, extend with genre logic; update `runIngestion` skip set and review assembly         |
| `src/App.tsx`       | Add `Tag`, `Wrap`, `WrapItem` imports; add source badge in `ArtworkBlock`; replace card-body source `<Badge>` with genre `<Tag>` pills |
| `CLAUDE.md`         | Document session decisions                                                                                                             |

---

### Task 1: Add `genre` to `MetalReview` type

**Files:**

- Modify: `src/types.ts`

- [ ] **Step 1: Add the field**

Replace the current `MetalReview` interface in `src/types.ts` with:

```ts
export interface MetalReview {
  id: string; // Unique hash of band + album
  source: string; // "Angry Metal Guy" | "The Progressive Subway" | "SputnikMusic" | "Metal Storm"
  band: string;
  album: string;
  genre: string[]; // Top-3 genres from MusicBrainz ([] when unknown)
  rating?: string; // Normalised rating e.g., "8.5/10"
  score: string; // e.g., "3.5/5.0", "8/10", "4.2", "8.3"
  normalizedScore: number; // 0 to 100 for unified sorting
  summary: string; // Brief excerpt/tagline
  url: string; // Direct link to the source
  publishedAt: string; // ISO string date representation
  publishedDate: string; // Formatted display date (dd MMM yyyy)
  artworkUrl: string | null;
  isDoublePositive?: boolean;
}
```

- [ ] **Step 2: Verify type-check passes**

```bash
npm run type-check
```

Expected: no errors. (The `RawReview` interface in `ingest.ts` already has `genre: string[]`, and `App.tsx`'s local `Review` interface already has `genre: string[]`, so this change aligns all three.)

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add genre field to MetalReview type"
```

---

### Task 2: Rename `fetchArtworkUrl` → `fetchMusicBrainzData` with genre support

**Files:**

- Modify: `scripts/ingest.ts` (the `fetchArtworkUrl` function only — `runIngestion` is changed in Task 3)

The current function makes two requests:

1. MB search → MBID
2. Cover Art Archive → artwork URL

The new function makes up to four MB requests (search, release detail, optional artist search, optional artist detail) plus one CAA request. Each pair of back-to-back MB requests has a `sleep(1000)` between them.

- [ ] **Step 1: Replace `fetchArtworkUrl` with `fetchMusicBrainzData`**

In `scripts/ingest.ts`, delete the existing `fetchArtworkUrl` function (lines 274–293) and insert:

```ts
async function fetchMusicBrainzData(
  band: string,
  album: string
): Promise<{ artworkUrl: string | null; genres: string[] }> {
  try {
    // Step A: search for the release to get its MBID
    const mbSearch = await axios.get('https://musicbrainz.org/ws/2/release/', {
      params: { query: `artist:${band}+release:${album}`, fmt: 'json' },
      headers: { 'User-Agent': 'MetalReviewsDashboard/1.0 (dan.gramada@gmail.com)' },
    });
    const releases: any[] = mbSearch.data?.releases ?? [];
    if (releases.length === 0) return { artworkUrl: null, genres: [] };

    const mbid: string = releases[0].id;

    // MB rate limit: 1 req/sec — must sleep before the next MB request.
    await sleep(1000);

    // Step B: fetch release detail (genres) and Cover Art Archive in parallel.
    // Only the release detail hits MB; CAA is a separate host, no rate-limit conflict.
    const [releaseRes, caaRes] = await Promise.allSettled([
      axios.get(`https://musicbrainz.org/ws/2/release/${mbid}`, {
        params: { inc: 'genres', fmt: 'json' },
        headers: { 'User-Agent': 'MetalReviewsDashboard/1.0 (dan.gramada@gmail.com)' },
      }),
      axios.get(`https://coverartarchive.org/release/${mbid}`, {
        headers: { 'User-Agent': 'MetalReviewsDashboard/1.0 (dan.gramada@gmail.com)' },
      }),
    ]);

    // Extract artwork URL from CAA response (null on failure or no front image)
    let artworkUrl: string | null = null;
    if (caaRes.status === 'fulfilled') {
      const images: any[] = caaRes.value.data?.images ?? [];
      const front = images.find((img: any) => img.front === true);
      artworkUrl = front?.image ?? null;
    }

    // Extract genres from MB release detail, sorted by vote count descending, top 3
    let releaseGenres: Array<{ name: string; count: number }> = [];
    if (releaseRes.status === 'fulfilled') {
      releaseGenres = releaseRes.value.data?.genres ?? [];
    }
    let topGenres = releaseGenres
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((g) => g.name);

    // Step C: artist-level fallback when the release has no genre tags.
    // Two more MB requests — each preceded by a sleep to stay within rate limit.
    if (topGenres.length === 0) {
      await sleep(1000);
      const artistSearch = await axios.get('https://musicbrainz.org/ws/2/artist/', {
        params: { query: `artist:"${band}"`, fmt: 'json', limit: 1 },
        headers: { 'User-Agent': 'MetalReviewsDashboard/1.0 (dan.gramada@gmail.com)' },
      });
      const artists: any[] = artistSearch.data?.artists ?? [];
      if (artists.length > 0) {
        const artistMbid: string = artists[0].id;
        await sleep(1000);
        const artistRes = await axios.get(`https://musicbrainz.org/ws/2/artist/${artistMbid}`, {
          params: { inc: 'genres', fmt: 'json' },
          headers: { 'User-Agent': 'MetalReviewsDashboard/1.0 (dan.gramada@gmail.com)' },
        });
        const artistGenres: Array<{ name: string; count: number }> = artistRes.data?.genres ?? [];
        topGenres = artistGenres
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map((g) => g.name);
      }
    }

    return { artworkUrl, genres: topGenres };
  } catch {
    return { artworkUrl: null, genres: [] };
  }
}
```

- [ ] **Step 2: Verify type-check passes**

```bash
npm run type-check
```

Expected: errors because `runIngestion` still calls `fetchArtworkUrl` (fixed in Task 3) — that's fine for now, or you can check only the function itself compiles. Move on to Task 3 immediately.

---

### Task 3: Update `runIngestion` — skip logic, MB call, genre assembly

**Files:**

- Modify: `scripts/ingest.ts` (the `runIngestion` function)

Three changes:

1. Rename `artworkAlreadyFetched` → `mbAlreadyFetched` and widen the skip condition to require BOTH artwork AND genre to be present.
2. Replace the `fetchArtworkUrl` call with `fetchMusicBrainzData`, capturing both `artworkUrl` and `genres`.
3. Add `genre` to the `final.push({...})` object.

- [ ] **Step 1: Update the skip set declaration**

In `runIngestion`, find this block (around lines 324–327):

```ts
// Reviews with artworkUrl defined (including null from a failed lookup) don't need
// another MusicBrainz call. undefined means the field was never attempted.
const artworkAlreadyFetched = new Set(
  existingReviews.filter((r) => r.artworkUrl !== undefined).map((r) => r.id)
);
```

Replace with:

```ts
// Skip the MusicBrainz lookup only when BOTH artwork and genres are already stored.
// Array.isArray distinguishes "genre was fetched (even if empty)" from "review was
// saved before genre support was added (field absent from JSON)".
const mbAlreadyFetched = new Set(
  existingReviews
    .filter((r) => r.artworkUrl !== undefined && Array.isArray(r.genre))
    .map((r) => r.id)
);
```

- [ ] **Step 2: Update the fetch / reuse block inside the `for` loop**

Find this block (around lines 349–356):

```ts
let artworkUrl: string | null;
if (artworkAlreadyFetched.has(id)) {
  // Reuse stored artwork URL — avoids a MusicBrainz + Cover Art Archive round-trip.
  // MusicBrainz enforces 1 req/sec; skipping known reviews keeps warm runs fast.
  artworkUrl = existingById.get(id)?.artworkUrl ?? null;
} else {
  artworkUrl = await fetchArtworkUrl(band, album);
  await sleep(1000); // MusicBrainz rate limit: max 1 req/sec
}
```

Replace with:

```ts
let artworkUrl: string | null;
let genres: string[];
if (mbAlreadyFetched.has(id)) {
  // Both artwork and genres are already stored — reuse them.
  // MusicBrainz enforces 1 req/sec; skipping known reviews keeps warm runs fast.
  artworkUrl = existingById.get(id)?.artworkUrl ?? null;
  genres = existingById.get(id)?.genre ?? [];
} else {
  const mbData = await fetchMusicBrainzData(band, album);
  artworkUrl = mbData.artworkUrl;
  genres = mbData.genres;
  await sleep(1000); // MB rate limit: gap between the last request in this review and the first of the next
}
```

- [ ] **Step 3: Add `genre` to the `final.push` object**

Find this block (around lines 357–369):

```ts
final.push({
  id,
  source: r.source,
  band,
  album,
  score: r.score,
  normalizedScore: normalizeScore(r.score),
  summary: r.summary,
  url: r.url,
  publishedAt: r.publishedAt as unknown as string,
  publishedDate,
  artworkUrl,
});
```

Replace with:

```ts
final.push({
  id,
  source: r.source,
  band,
  album,
  genre: genres,
  score: r.score,
  normalizedScore: normalizeScore(r.score),
  summary: r.summary,
  url: r.url,
  publishedAt: r.publishedAt as unknown as string,
  publishedDate,
  artworkUrl,
});
```

- [ ] **Step 4: Verify type-check passes**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest.ts
git commit -m "feat: fetch genres from MusicBrainz during ingest (release + artist fallback)"
```

---

### Task 4: Frontend — add source badge to `ArtworkBlock`

**Files:**

- Modify: `src/App.tsx`

The source badge moves from the card body into `ArtworkBlock`, absolutely positioned at top-left — mirroring the score badge at bottom-right.

`ArtworkBlock` currently receives `{ rev: Review }`. No prop changes needed — `rev.source` is already available.

- [ ] **Step 1: Add the source badge inside `ArtworkBlock`**

Find the score badge block inside `ArtworkBlock` (the `{rev.score && rev.score !== '' && ...}` block, around lines 141–156). Insert the source badge **before** it, inside the same parent `<Box position="relative" ...>`:

```tsx
{
  /* Source badge — top-left corner of the artwork square.
          Uses accent.border (teal.500) bg and accent.text (teal.300) text from theme.
          maxW prevents overflow on narrow cards. */
}
<Box
  position="absolute"
  top={2}
  left={2}
  bg="accent.border"
  color="accent.text"
  fontSize="xs"
  fontWeight="semibold"
  px={2}
  py="2px"
  borderRadius="badge"
  maxW="calc(100% - 16px)"
  overflow="hidden"
  textOverflow="ellipsis"
  whiteSpace="nowrap"
>
  {rev.source}
</Box>;
```

The full updated `ArtworkBlock` return block (for reference — paste the source badge before the score badge, after the skeleton/placeholder block):

```tsx
<Box position="relative" paddingBottom="100%" bg="surface.darkest">
  {rev.artworkUrl ? (
    <>
      <Image
        src={rev.artworkUrl}
        alt={`${rev.band} – ${rev.album}`}
        objectFit="cover"
        w="100%"
        h="100%"
        position="absolute"
        top={0}
        left={0}
        onLoad={() => setLoaded(true)}
      />
      <Skeleton
        position="absolute"
        top={0}
        left={0}
        w="100%"
        h="100%"
        opacity={loaded ? 0 : 1}
        transition="opacity 0.3s ease"
        pointerEvents="none"
      />
    </>
  ) : (
    <Flex
      position="absolute"
      top={0}
      left={0}
      w="100%"
      h="100%"
      direction="column"
      align="center"
      justify="center"
    >
      <Text fontSize="3xl" color="text.muted">
        ♪
      </Text>
      <Text fontSize="xs" color="text.muted">
        No artwork found
      </Text>
    </Flex>
  )}

  {/* Source badge — top-left */}
  <Box
    position="absolute"
    top={2}
    left={2}
    bg="accent.border"
    color="accent.text"
    fontSize="xs"
    fontWeight="semibold"
    px={2}
    py="2px"
    borderRadius="badge"
    maxW="calc(100% - 16px)"
    overflow="hidden"
    textOverflow="ellipsis"
    whiteSpace="nowrap"
  >
    {rev.source}
  </Box>

  {/* Score badge — bottom-right (unchanged) */}
  {rev.score && rev.score !== '' && (
    <Box
      position="absolute"
      bottom="2"
      right="2"
      bg="brand.score"
      color="brand.scoreText"
      borderRadius="badge"
      px={2}
      py={1}
      fontSize="xs"
      fontWeight="bold"
    >
      {rev.score}
    </Box>
  )}
</Box>
```

- [ ] **Step 2: Verify type-check**

```bash
npm run type-check
```

Expected: no errors (no new props, no type changes).

---

### Task 5: Frontend — add genre tags, remove source badge from card body

**Files:**

- Modify: `src/App.tsx`

Two sub-steps: (a) add `Tag`, `Wrap`, `WrapItem` to Chakra imports; (b) update the card body JSX.

- [ ] **Step 1: Add `Tag`, `Wrap`, `WrapItem` to Chakra imports**

Find the existing Chakra import block (lines 21–39). Add `Tag`, `Wrap`, `WrapItem` to the destructure list:

```tsx
import {
  Box,
  Button,
  Heading,
  Text,
  VStack,
  Container,
  Input,
  Select,
  SimpleGrid,
  Badge, // can remain (not removing the import even though Badge is no longer used in JSX, to avoid import churn — or remove it if preferred)
  Flex,
  Spacer,
  Spinner,
  Link,
  Image,
  Skeleton,
  Tag,
  Wrap,
  WrapItem,
  useToast,
} from '@chakra-ui/react';
```

(Remove `Badge` from the import if you want to keep imports clean — the only usage will be gone after Step 2.)

- [ ] **Step 2: Remove source badge from card body, add genre tags**

Find the card body section (inside the `filtered.map(...)` block, around lines 454–469):

```tsx
<Box p={4}>
  <Heading size="md" mb={2}>
    {rev.band || 'Unknown Band'} – {rev.album || 'Untitled Album'}
  </Heading>
  <Flex align="center" mb={2}>
    <Badge>{rev.source}</Badge>
  </Flex>
  <Text fontSize="sm" color="text.dim" mb={2}>
    {rev.publishedDate}
  </Text>
  {/* noOfLines={3} truncates long summaries with an ellipsis */}
  <Text fontSize="sm" color="text.dim" noOfLines={3}>
    {rev.summary || 'No summary available.'}
  </Text>
</Box>
```

Replace with:

```tsx
<Box p={4}>
  <Heading size="md" mb={2}>
    {rev.band || 'Unknown Band'} – {rev.album || 'Untitled Album'}
  </Heading>
  {/* Genre tags — only rendered when genre data is available */}
  {rev.genre.length > 0 && (
    <Wrap spacing={1} mb={1}>
      {rev.genre.map((g) => (
        <WrapItem key={g}>
          <Tag size="sm" bg="whiteAlpha.100" color="purple.300" borderRadius="badge">
            {g}
          </Tag>
        </WrapItem>
      ))}
    </Wrap>
  )}
  <Text fontSize="sm" color="text.dim" mb={2}>
    {rev.publishedDate}
  </Text>
  <Text fontSize="sm" color="text.dim" noOfLines={3}>
    {rev.summary || 'No summary available.'}
  </Text>
</Box>
```

- [ ] **Step 3: Update the `Review` interface comment for `genre`**

Find:

```ts
  genre: string[];           // Always [] — genre extraction is not yet implemented
```

Replace with:

```ts
  genre: string[];           // Top-3 genres from MusicBrainz ([] when unknown)
```

- [ ] **Step 4: Verify type-check**

```bash
npm run type-check
```

Expected: no errors. If `Badge` was left in the import but has no JSX usage, TypeScript won't error (it's not an unused-import TS error by default), but you may get an ESLint warning — remove it if lint fails.

- [ ] **Step 5: Verify lint**

```bash
npm run lint
```

Fix any issues (most likely unused `Badge` import if it was left in).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: source badge on artwork top-left, genre tags in card body"
```

---

### Task 6: Verify search filter works with genre data

**Files:**

- Read: `src/App.tsx` (filter logic, no changes expected)

The current filter in `App.tsx` already handles genres:

```ts
    .filter((r) => {
      const term = search.toLowerCase();
      return (
        r.band.toLowerCase().includes(term) ||
        r.album.toLowerCase().includes(term) ||
        (r.genre ?? []).some((g) => g.toLowerCase().includes(term))
      );
    })
```

The `?? []` guard handles undefined (for old reviews.json entries without a genre field). Once genre is populated, typing "progressive" or "doom" into the search box will filter cards correctly.

- [ ] **Step 1: Confirm no code change needed**

Read the filter block in `src/App.tsx`. Confirm `(r.genre ?? []).some(...)` is present. If it's missing or broken, fix it to:

```ts
(r.genre ?? []).some((g) => g.toLowerCase().includes(term));
```

No commit needed if the code is already correct.

---

### Task 7: Update `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Append session decisions section**

At the end of `CLAUDE.md`, add:

```markdown
## Session decisions — Genre data + card badge redesign (June 2026)

### What was built

- Genre data is now fetched during ingest via MusicBrainz and stored as `genre: string[]` on every `MetalReview`.
- Source badge moved from the card body onto the artwork block (top-left, absolutely positioned).
- Genre tags added to the card body where the source badge previously lived.

### Genre lookup (two-level)

1. **Release level:** after fetching the MBID via search, call `GET /ws/2/release/{mbid}?inc=genres&fmt=json`. Sort `release.genres` by `count` descending, take top 3.
2. **Artist fallback:** if the release returns 0 genres, call `GET /ws/2/artist/?query=artist:"{band}"&fmt=json&limit=1` → get artist MBID → `GET /ws/2/artist/{artist-mbid}?inc=genres&fmt=json` → take top 3 from `artist.genres`.

### Rate limiting

`fetchMusicBrainzData` includes internal `sleep(1000)` calls between each pair of back-to-back MB requests. `runIngestion` adds one more `sleep(1000)` after each `fetchMusicBrainzData` call (gap between reviews). The artist fallback adds two extra MB calls with two extra internal sleeps.

### Skip logic

`mbAlreadyFetched` replaces the old `artworkAlreadyFetched` set. A review is skipped only when BOTH `artworkUrl !== undefined` AND `Array.isArray(r.genre)` — ensuring reviews from before genre support was added are re-fetched once.

### Source badge styling

- Component: `ArtworkBlock` (`src/App.tsx`)
- Position: `position="absolute"` `top={2}` `left={2}`
- Colors: `bg="accent.border"` (teal.500) / `color="accent.text"` (teal.300) — from theme semanticTokens
- Shape: `borderRadius="badge"` (4px from theme radii), `fontSize="xs"`, `fontWeight="semibold"`
- Overflow: `maxW="calc(100% - 16px)"` + `overflow="hidden"` + `textOverflow="ellipsis"` + `whiteSpace="nowrap"`

### Genre tag styling

- Components: Chakra `<Tag size="sm">` inside `<Wrap spacing={1}>` / `<WrapItem>`
- Colors: `bg="whiteAlpha.100"` / `color="purple.300"` — no hardcoded hex
- Shape: `borderRadius="badge"` (4px)
- Conditional: only rendered when `rev.genre.length > 0`

### Card body order post-redesign

1. Band – Album title
2. Genre tags (Wrap of Tag, purple) — new
3. Date (text.dim)
4. Summary excerpt (text.dim)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record genre data + card redesign session decisions"
```

---

## Self-Review

### Spec coverage check

| Spec requirement                                                                | Task                                  |
| ------------------------------------------------------------------------------- | ------------------------------------- |
| `inc=genres` on MB release lookup                                               | Task 2                                |
| Sort by count, top 3                                                            | Task 2                                |
| Artist-level fallback when release genres = 0                                   | Task 2                                |
| `sleep(1000)` between each MB pair                                              | Task 2                                |
| `sleep(1000)` after artist fallback                                             | Task 2                                |
| User-Agent on all MB requests                                                   | Task 2 (all axios calls include it)   |
| `genre: string[]` on MetalReview                                                | Task 1                                |
| Set `genre` in review assembly                                                  | Task 3                                |
| Skip logic: only skip if both artwork AND genre present                         | Task 3                                |
| Source badge: top-left on artwork, `accent.border`/`accent.text`, `radii.badge` | Task 4                                |
| Score badge: unchanged                                                          | Task 4 (not touched)                  |
| Genre tags: `whiteAlpha.100`/`purple.300`/`radii.badge`, Chakra Tag sm          | Task 5                                |
| No empty space when genre = []                                                  | Task 5 (`rev.genre.length > 0` guard) |
| Search by genre works                                                           | Task 6                                |
| No hardcoded hex                                                                | Tasks 4+5 (all theme tokens)          |
| No new npm dependencies                                                         | No new imports                        |
| `npm run type-check` passes                                                     | Each task                             |
| CLAUDE.md updated                                                               | Task 7                                |

### Placeholder scan

No TBD, TODO, or vague steps found.

### Type consistency

- `fetchMusicBrainzData` returns `{ artworkUrl: string | null; genres: string[] }` — used as `mbData.artworkUrl` and `mbData.genres` in Task 3.
- `genre: genres` in `final.push` matches `genre: string[]` on `MetalReview`.
- `rev.genre` in `App.tsx` matches `genre: string[]` on `Review` (already correct) and now on `MetalReview`.
- `mbAlreadyFetched` replaces all references to `artworkAlreadyFetched` in Task 3 — no stale name.
