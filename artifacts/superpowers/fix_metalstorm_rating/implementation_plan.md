# Plan: Fix Metal Storm Rating

## Approach
Use Puppeteer to bypass Cloudflare's 403 response on Metal Storm review pages, load the page, and extract the user rating using Cheerio.

## Scope
- In:
  - Add Puppeteer fetching for Metal Storm reviews in `scripts/ingest.ts`.
  - Parse `span.bold` within `div.album-rating` for user ratings.
  - Retain decimal scores as-is (e.g. 7.3/10).
  - Add unit tests.
- Out:
  - Re-styling the frontend or changing parsing for other sites.

## Action Items
1. [ ] Create unit tests for parsing Metal Storm ratings in `src/__tests__/metalstorm.test.js`.
2. [ ] Modify `scripts/ingest.ts` to implement a Puppeteer browser manager to fetch review URLs.
3. [ ] Parse the user score correctly from the HTML.
4. [ ] Validate that the parser handles decimal scores correctly.
5. [ ] Run `npm run ingest` to confirm the full ingestion flow.

## Verification
- Run vitest on `src/__tests__/metalstorm.test.js`
- Run `npm run ingest`
