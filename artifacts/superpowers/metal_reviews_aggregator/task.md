# Task Checklist: Metal Reviews Aggregator

- [x] **Step 1**: Install required dependencies (`rss-parser`, `axios`, `cheerio`, `tsx`, and any necessary typings).
- [ ] **Step 2**: Create the scraper script structure at `scripts/ingest.ts` and set up an npm script `"ingest": "tsx scripts/ingest.ts"`.
- [ ] **Step 3**: Implement parsing logic for the RSS feeds (Angry Metal Guy and The Progressive Subway) and HTML scrapers (SputnikMusic and Metal Storm).
- [ ] **Step 4**: Implement the normalizer utility to standardize dates, scores, and clean band/album title strings.
- [ ] **Step 5**: Implement the double-positive matching logic (reviewed on both AMG & Progressive Subway in a 14-day window).
- [ ] **Step 6**: Implement automated unit tests in `src/tests/ingest.test.ts` to verify parsing and matching logic.
- [ ] **Step 7**: Implement the frontend components in `src/App.tsx` including the glassmorphism layout, search bar, sort dropdown, and source badges.
- [ ] **Step 8**: Implement the Glowing Double-Positive card highlight visual effect and external click links.
- [ ] **Step 9**: Verify end-to-end flow: run the ingestion script, check the generated `public/reviews.json`, verify all tests pass, and run the Vite dev server to verify UI functionality and responsiveness.
