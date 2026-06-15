# Brainstorming: Metal Reviews Aggregator

## 1. Goal & Requirements

We want to build a "Metal Reviews Aggregator" with:

- **Data Ingestion Layer**:
  - RSS parser for "Angry Metal Guy" and "The Progressive Subway".
  - HTML scraper using `axios` and `cheerio` for non-RSS sites: "SputnikMusic" (`https://www.sputnikmusic.com/newreviews.php`) and "Metal Storm" (`https://metalstorm.net/pub/reviews.php`).
  - Normalization of all reviews into a unified `MetalReview` TypeScript interface.
- **Storage & Caching**:
  - No database. Store reviews in a local `reviews.json` (or similar) file.
  - A sync mechanism (like a local Node script or an automated cache wrapper).
- **Frontend UI (Chakra UI)**:
  - Responsive grid dashboard displaying the latest reviews.
  - High visual hierarchy for Band Name, Source (with brand-specific colors), and Score.
  - Interactive source filters.
  - "Double-Positive" highlight: visually indicate (e.g. glowing border) if the same album appears on _both_ AMG and The Progressive Subway within the same week.
  - Direct external links when clicking a review card.

## 2. Constraints & Assumptions

- Environment: Local Windows workspace, run with Node.js & Vite dev server.
- Technology: TypeScript, React, Chakra UI v2.
- Since Vite is a frontend builder, the ingestion script needs to run as a Node script or via a server middleware. We'll write it as a Node CLI script (`npm run ingest`) that writes the output to `public/reviews.json`.

## 3. Risks & Edge Cases

- **Scraping block/rate limits**: SputnikMusic and Metal Storm might block requests. We need request headers (User-Agent) and proper timeout handling.
- **Title Parsing**: Extracting `[Band] - [Album]` from freeform blog post titles via RegEx can be brittle.
- **Double-Positive Match**: Matching album/band names that are slightly different (e.g., spelling, capitalization, special characters). We should normalize strings (lowercase, strip accents, strip non-alphanumeric characters) when comparing.

## 4. Proposed Architectural Approaches

### Approach A: Standalone Node Ingest Script + Vite Public Output (Recommended)

- **Design**:
  - We write a TypeScript Node script (e.g. `scripts/ingest.ts`) that runs via `tsx` or `ts-node` (using standard packages we'll install like `rss-parser`, `axios`, `cheerio`).
  - The script fetches reviews, normalizes them, filters duplicates/matches, and writes `public/reviews.json`.
  - The Vite React application simply fetches `/reviews.json` using standard React hooks/state on mount.
- **Pros**:
  - Extremely simple and decoupled.
  - Zero server overhead or runtime database/scraping lag on frontend page loads.
  - Easy to set up a Windows task scheduler, a cron job, or just run `npm run ingest` before launching.
- **Cons**:
  - The user has to manually trigger the ingestion or set up a scheduler/cron to update the JSON.

### Approach B: Express Backend API Server

- **Design**:
  - Create a lightweight Express backend in parallel to the Vite frontend.
  - The Express server exposes a `/api/reviews` endpoint. It performs caching (using a 12-hour memory cache) and does live fetching on demand if the cache is expired.
- **Pros**:
  - Always up to date, fetches automatically without cron setup.
- **Cons**:
  - Slows down initial page loads when cache expires (fetches 4 websites in sequence).
  - More complex setup: needs running both Express and Vite simultaneously.

---
