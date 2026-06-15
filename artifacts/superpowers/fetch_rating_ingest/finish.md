# Walkthrough - Ingest-Time Rating Scraper & Dashboard Loader

## What Was Done

### 1. Root Cause Found

Angry Metal Guy's WordPress site uses content-negotiation: when the `Accept` header is missing or generic, Cloudflare returns **ActivityPub JSON** instead of HTML — causing `data.length` to be `undefined` and all selector lookups to fail.

### 2. Scraper Fixed (`src/scraper/angrymetal.js`)

- **`normaliseRating`**: Updated to handle fractions with any denominator (e.g. `3.0/5.0` → `6.0`) instead of only `/10`.
- **New extraction strategy**: Added a regex pass over `*:contains('Rating:')` elements to capture `Rating: 3.0/5.0` inline text — which is how AMG actually embeds ratings.
- **RATING_MAP**: Updated to a 0–10 normalized scale (Iconic → 10, Excellent → 9, …, Unlistenable → 1).

### 3. Ingest Script (`scripts/ingest.ts`)

- Imported `extractRating` from `src/scraper/angrymetal.js`.
- Added `fetchAngryMetalGuyRating(url)` helper with correct `Accept: text/html` header to force HTML responses.
- `fetchAngryMetalGuy` now concurrently fetches each article URL and embeds the rating as `score` (e.g. `6/10`) directly in `public/reviews.json`.

### 4. Dashboard (`src/App.tsx`)

- **Removed** all client-side rating fetching, concurrency helpers, and duplicate function declarations.
- **Added** `loading` state + Chakra UI `<Spinner>` loader shown while `reviews.json` loads.
- **Wrapped** every review card in `<Link href={rev.url} isExternal>` — clicking any card opens the original review in a new tab.
- **Renders** `rev.score` badge (from JSON) instead of computing ratings client-side.

## Verification

- `npm run test` → **3/3 tests passing**
- `npm run build` → **Build succeeded** (no errors)
- `npm run ingest` → **40 reviews written** with correct scores (e.g. `6/10`, `4/10`)
