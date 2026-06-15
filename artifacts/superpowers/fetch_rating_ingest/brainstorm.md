# Brainstorming: Ingest-Time Rating Scraper & Dashboard Loader

## Goal

- Solve the issue where Angry Metal Guy ratings are not displayed due to CORS restrictions preventing client-side fetching from the browser.
- Implement backend (ingest-time) rating extraction for Angry Metal Guy reviews, similar to Metal Storm.
- Add a loading spinner (`Spinner` from Chakra UI) in the dashboard while reviews are fetching from `reviews.json`.

## Constraints & Risks

- **CORS Limitations**: The browser cannot fetch HTML directly from `angrymetalguy.com`. Ingestion must run on the backend.
- **Performance**: Pre-scraping during ingestion makes the client-side load instantly.
- **Ingestion Time**: Scraping every review in the feed takes a few seconds. We must handle fetch failures gracefully.

## Approaches

### Move Rating Scraper to Ingest Script (Recommended)

By fetching the review page and calling `extractRating` in `scripts/ingest.ts`, the rating is stored directly in `public/reviews.json` as the `score` field.

- **Pros**: Completely circumvents CORS issues. UI is fast and simple, needing no client-side fetches.
- **Cons**: slightly increases ingestion execution time (few seconds), which is perfectly fine for a scheduled/background cron job.

### Use a CORS Proxy

Route client-side fetches through a CORS proxy (e.g. cors-anywhere).

- **Pros**: Keeps rating extraction on the client side.
- **Cons**: CORS proxies are unreliable, rate-limited, and introduce external dependencies/security concerns.

We choose the **Ingest-Time Rating Scraper** approach.
