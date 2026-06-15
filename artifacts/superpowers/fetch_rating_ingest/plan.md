# Implementation Plan - Ingest-Time Rating Scraper & Dashboard Loader

This plan outlines moving Angry Metal Guy rating scraping to the ingestion phase to avoid browser CORS issues, and adding a Chakra UI Spinner loader to the dashboard.

## Proposed Changes

### Ingestion Script

#### [MODIFY] [ingest.ts](file:///j:/Scraper/scripts/ingest.ts)

- Import `extractRating` from `../src/scraper/angrymetal.js`.
- Add a helper function `fetchAngryMetalGuyRating(reviewUrl: string)` to download review HTML and extract ratings.
- Update `fetchAngryMetalGuy` to fetch ratings concurrently and map them to `score` (e.g. `8.5/10`).

### Dashboard Component

#### [MODIFY] [App.tsx](file:///j:/Scraper/src/App.tsx)

- Import `Spinner` and `Link` from `@chakra-ui/react`.
- Add `loading` state to `App`.
- Simplify `useEffect` to fetch `/reviews.json` once, set `reviews` directly, and set `loading` to `false` (removing all client-side parsing code, concurrency limits, and fetch code).
- Render `Spinner` when `loading` is true, otherwise render the `SimpleGrid` of reviews.
- Render the `rev.score` in the card rating badge instead of `rev.rating`.
- Wrap each card `Box` in a Chakra UI `<Link href={rev.url} isExternal _hover={{ textDecoration: 'none' }}>` component so clicking any card opens the original review in a new tab.

## Verification Plan

### Automated Tests

- Run `npm run test` to verify Vitest tests still pass.

### Manual Verification

- Run `npm run ingest` to populate `public/reviews.json` with the newly scraped Angry Metal Guy ratings.
- Start the dev server (`npm run dev`) and verify that:
  - A loading spinner is shown initially.
  - Reviews cards are loaded and displayed.
  - Rating badges (e.g. `8.5/10`) are shown for Angry Metal Guy cards.
