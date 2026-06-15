# Implementation Plan - Fix The Progressive Subway Ratings

## Goal

Extract ratings correctly for The Progressive Subway reviews in the ingestion script.

## Background Context

Currently, the ingestion script tries to extract scores for The Progressive Subway from `item.content` in the RSS feed using a generic regex. However, `item.content` only contains a short teaser paragraph without the rating. The full article content containing the "Final verdict" is located in the `<content:encoded>` element, mapped by the parser to `item['content:encoded']`. Additionally, the score might be represented numerically (e.g., "7.5/10") or using specific textual descriptors (e.g., "Exemplary", "Sublime").

## Proposed Changes

### 1. New Scraper Module

Create a new file `src/scraper/progressivesubway.ts` (or `.js`) to handle Progressive Subway rating extraction.

- Define `RATING_MAP` for Progressive Subway:
  - Sublime: 10
  - Mind-blowing: 9
  - Exemplary: 8
  - Noteworthy: 7
  - Satisfactory: 6
  - Unremarkable: 5
  - Weak: 4
  - Bad: 3
  - Awful: 2
  - Abysmal: 1
- Implement `extractRating(html)`:
  - Load HTML/content with `cheerio`.
  - Search for "Final verdict" text / tags.
  - Parse numeric ratings like `X/10` or word ratings based on `RATING_MAP`.
  - If numeric, return it normalized out of 10. If word, return the map value.

### 2. Update Ingest Script (`scripts/ingest.ts`)

- Import `extractRating` from the new `progressivesubway` scraper.
- Update `fetchProgressiveSubway()`:
  - Try to extract rating from `item['content:encoded']`.
  - If not found, fetch the page HTML from `item.link` and run `extractRating` (same fallback mechanism as Angry Metal Guy).
  - Format the final score string (e.g., `rating/10` or empty if not found).

### 3. Add Tests

Create `src/__tests__/progressivesubway.test.js` to verify:

- Extraction of numeric ratings (e.g., `Final verdict: 7.5/10`).
- Extraction of word ratings (e.g., `Final verdict: Exemplary`).
- Fallback logic.

## Verification Plan

### Automated Tests

- Run `npm run test` or `npx vitest src/__tests__/progressivesubway.test.js` to ensure the scraper logic functions perfectly.
- Run `npm run type-check` to ensure no TypeScript compilation issues.

### Manual Verification

- Run `npm run ingest` and inspect the generated `public/reviews.json` to verify that The Progressive Subway reviews now have correct scores populated.
