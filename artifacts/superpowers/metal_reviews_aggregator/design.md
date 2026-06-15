# Design Document: Metal Reviews Aggregator

**Date**: 2026-05-26  
**Status**: Approved  
**Architectural Choice**: Approach A (Standalone Node Ingest Script + Vite Frontend)

## 1. Goal & Requirements

We want to build a "Metal Reviews Aggregator" with:

- **Data Ingestion Layer**:
  - RSS parser for "Angry Metal Guy" and "The Progressive Subway".
  - HTML scraper using `axios` and `cheerio` for non-RSS sites: "SputnikMusic" and "Metal Storm".
  - Normalization of all reviews into a unified `MetalReview` TypeScript interface.
- **Storage & Caching**:
  - Store reviews in a local `reviews.json` file inside the `public/` directory.
  - A CLI sync command `npm run ingest` to run the ingestion script.
- **Frontend UI (Chakra UI)**:
  - Responsive grid dashboard displaying the latest reviews.
  - Interactive source filters, sorting by date and rating, and search functionality.
  - "Double-Positive" highlight: glowing neon border for albums reviewed on both AMG and The Progressive Subway.
  - Direct external links when clicking a review card.

## 2. Ingestion & Storage Architecture

A TypeScript Node script in `scripts/ingest.ts` will parse and scrape the following:

- **Angry Metal Guy** RSS feed: `https://www.angrymetalguy.com/feed/`
- **The Progressive Subway** RSS feed: `https://theprogressivesubway.com/feed`
- **SputnikMusic** Staff Reviews HTML: `https://www.sputnikmusic.com/newreviews.php`
- **Metal Storm** Latest Reviews HTML: `https://metalstorm.net/pub/reviews.php`

### TypeScript Interface: `MetalReview`

```typescript
export interface MetalReview {
  id: string; // Hash of normalized band + album
  source: string; // "Angry Metal Guy" | "The Progressive Subway" | "SputnikMusic" | "Metal Storm"
  band: string;
  album: string;
  genre: string[];
  score: string; // e.g., "3.5/5.0", "8/10", "4.2", "8.3"
  normalizedScore: number; // 0-100 score for unified sorting and color badges
  summary: string; // Brief excerpt/tagline
  url: string; // Direct link to the source
  publishedAt: string; // ISO string date
  isDoublePositive?: boolean; // Flagged if reviewed on both AMG & Progressive Subway
}
```

### Normalization Logic

- **Angry Metal Guy (1-5.0 scale)**: Ex. `3.5/5.0` -> `70`. If a review has "angry metal" or "guy" scores, we parse the rating from the post content (using RegEx like `(Rating:|Score:)\s*([0-5](?:\.[0-9])?)/5`).
- **The Progressive Subway (1-10 scale)**: Ex. `8/10` -> `80`.
- **SputnikMusic (1-5.0 scale)**: Ex. `4.2` -> `84`.
- **Metal Storm (1-10 scale)**: Ex. `8.3` -> `83`.

### Double-Positive Matching

Any reviews for the same band/album combination (normalized keys) reviewed on _both_ AMG and The Progressive Subway within a 14-day window will be marked as `isDoublePositive: true`.

---

## 3. Frontend Architecture (Chakra UI v2)

The frontend in `src/App.tsx` reads `public/reviews.json` on mount.

- **Filters & Sorting**:
  - Toggle-badges for each review source.
  - Search input matching band, album, or genre.
  - Sort by "Latest Date" or "Highest Rating".
- **Visual Hierarchy & Premium Design**:
  - Theme: Deep dark mode (`gray.950` background, glassmorphic cards).
  - Cards Grid: 1-col mobile, 2-col tablet, 3-to-4-col desktop.
  - Glowing Neon border animation for double-positive cards.
  - Custom source-branded colors for badges:
    - Angry Metal Guy: crimson red (`red.500`)
    - The Progressive Subway: rich purple (`purple.500`)
    - SputnikMusic: steel blue (`blue.500`)
    - Metal Storm: orange-gold (`amber.500` / `orange.400`)
- **Responsive Layout**: Perfect grid alignment using Chakra's `SimpleGrid`.

---

## 4. Verification & Testing

- Node Ingest Script: Run command manually (`npm run ingest`) and assert that `public/reviews.json` is created with valid data.
- Unit testing: Add unit tests in `src/tests/` to verify normalizer and scraping logic using `vitest`.
- Frontend integration: Load App and check UI components, search, sorting, and filter controls.
