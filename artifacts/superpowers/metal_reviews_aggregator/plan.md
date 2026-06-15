# Plan: Metal Reviews Aggregator Implementation

We will implement a standalone, automated ingestion script in TypeScript (`scripts/ingest.ts`) that fetches RSS feeds and scrapes HTML reviews, normalizes the data, detects "Double-Positive" albums, and writes them to `public/reviews.json`. Then, we will build a responsive and highly-interactive dashboard in `src/App.tsx` using Chakra UI v2 that fetches this data, allows searching, sorting, and filtering, and highlights recommended albums with a glowing neon card border.

## Scope

- **In**:
  - Ingest script using `rss-parser`, `axios`, and `cheerio` parsing AMG, Progressive Subway, SputnikMusic, and Metal Storm.
  - Normalization of all metadata, dates, and scores (normalized to a 0-100 scale).
  - Identification of weekly double-positive releases (AMG & Progressive Subway).
  - Responsive, dark-themed Chakra UI v2 dashboard.
  - Search, source filter badges, and sorting capabilities (by date or normalized score).
  - Vitest unit tests verifying the parsing and normalization logic.
- **Out**:
  - Persistent database storage (PostgreSQL/MongoDB) - all cached in local JSON.
  - Backend API server (Express/Fastify) - static JSON loading on frontend.

## Action Items

- [ ] **Step 1**: Install required dependencies (`rss-parser`, `axios`, `cheerio`, `tsx`, and any necessary typings).
- [ ] **Step 2**: Create the scraper script structure at `scripts/ingest.ts` and set up an npm script `"ingest": "tsx scripts/ingest.ts"`.
- [ ] **Step 3**: Implement parsing logic for the RSS feeds (Angry Metal Guy and The Progressive Subway) and HTML scrapers (SputnikMusic and Metal Storm).
- [ ] **Step 4**: Implement the normalizer utility to standardize dates, scores, and clean band/album title strings.
- [ ] **Step 5**: Implement the double-positive matching logic (reviewed on both AMG & Progressive Subway in a 14-day window).
- [ ] **Step 6**: Implement automated unit tests in `src/tests/ingest.test.ts` to verify parsing and matching logic.
- [ ] **Step 7**: Implement the frontend components in `src/App.tsx` including the glassmorphism layout, search bar, sort dropdown, and source badges.
- [ ] **Step 8**: Implement the Glowing Double-Positive card highlight visual effect and external click links.
- [ ] **Step 9**: Verify end-to-end flow: run the ingestion script, check the generated `public/reviews.json`, verify all tests pass, and run the Vite dev server to verify UI functionality and responsiveness.

## Open Questions

- None (all initial requirements and normalization parameters are clarified).
