# Session decisions — Release date (June 2026)

## What was built

Release date is now fetched from MusicBrainz during ingest and displayed on every card as the primary date, with the review (published) date relocated to a secondary position below the summary excerpt.

## Schema

```sql
alter table reviews add column release_date text;
```

Stored as `text`, not a Postgres `date` — MusicBrainz returns partial dates (`"2024"`, `"2024-03"`, `"2024-03-15"`) and a native `date` column cannot represent year-only or year-month values. Mirrors the existing `published_date` column's approach.

Existing rows have `release_date = null` and will be populated naturally on future ingest runs (no backfill script).

## Data source

`fetchMusicBrainzData` in `scripts/ingest.ts` reads `release.date` from the existing Step B release-level MB call (`GET /ws/2/release/{mbid}?inc=genres&fmt=json`). No new endpoint, no new `inc=` addition, no extra API call — `date` is already present on the base release object. Empty string is normalised to `null`.

## Skip logic (`mbAlreadyFetched`)

A row is skipped from MB re-fetch only when **all three** are true:

- `typeof r.artworkUrl === 'string'`
- `r.genre.length > 0`
- `typeof r.releaseDate === 'string'` ← added

Without this third condition, rows that already had artwork + genre would never receive a release date, because the MB call would never re-fire for them.

## Merge guard — precision-aware

`releaseDate` uses different logic from `artworkUrl` / `genre`. A `releaseDatePrecision()` helper ranks dates by specificity (0 = null, 1 = year-only, 2 = year-month, 3 = full date). The merge rule keeps whichever value is more precise:

```ts
releaseDate: releaseDatePrecision(fresh.releaseDate) >= releaseDatePrecision(existing.releaseDate)
  ? fresh.releaseDate
  : existing.releaseDate;
```

Do **not** apply the simpler "fresh if non-null, else existing" pattern used for `artworkUrl` — a coarser fresh value must not overwrite a finer stored one.

## Display — card layout

New card body order:

1. Band – Album heading
2. Genre tags
3. **Release date** — `Release date: {formatted}` at `fontSize="sm"`, `color="text.dim"`
4. Summary excerpt — `noOfLines={3}`, `fontSize="sm"`, `color="text.dim"`
5. **Review date** — relocated here at `fontSize="xs"`, `color="text.muted"` (gray.500, dimmer than text.dim gray.400)

## Formatter (`formatReleaseDate`)

Co-located in `src/App.tsx` above `ArtworkBlock`. Locale-independent manual formatting to guarantee "15 Mar 2024" style regardless of runtime locale:

| Input          | Output          |
| -------------- | --------------- |
| `"2024-03-15"` | `"15 Mar 2024"` |
| `"2024-03"`    | `"Mar 2024"`    |
| `"2024"`       | `"2024"`        |
| `null`         | `"—"`           |

## What NOT to change

- Do not use release-group `first-release-date` — the existing release-level call is sufficient for new-release reviews.
- Do not touch `artworkUrl` or `genre` merge guard rules.
- `manual_albums`, new routes, and the Drawer form are separate future briefs.

## Bug: MB fields frozen for reviews that age off the RSS feed (fixed June 2026)

### Root cause

`runIngestion()` only calls `lookupMusicBrainz()` for reviews currently present in `allRaw` (the live RSS fetch, typically the latest ~10–20 posts per source). Once a review ages out of the feed's rolling window, its MB fields (`artworkUrl`, `genre`, `releaseDate`) are frozen at whatever was stored on first ingest — `applyMergeGuard` correctly preserves the row, but nothing ever re-fetches it.

Confirmed case: `Malist – Eternal Echo of the Fall` had `release_date: null` in Supabase for days after MusicBrainz had indexed the date, because MB didn't have the date ready on the first ingest run and the review had already scrolled off the feed by the time MB caught up.

Note: the `mbAlreadyFetched` third condition (`typeof r.releaseDate === 'string'`) correctly excludes incomplete rows from the skip set, but only matters for rows still appearing in the current feed.

### Fix: backfill pass in `runIngestion()`

After the main `allRaw` enrichment loop, a second pass runs over existing rows that:

1. Are NOT already in `final` (not covered by the RSS loop this run)
2. Are missing at least one MB field: `!(typeof artworkUrl === 'string' && genre.length > 0 && typeof releaseDate === 'string')`
3. Are NOT past the retry cap (see below)

For each candidate, `lookupMusicBrainz()` is called and the result is pushed into `final[]`. `applyMergeGuard` then handles the merge as normal — the precision-aware `releaseDate` rule applies unchanged.

The filtering logic lives in `selectBackfillCandidates()` (exported from `scripts/ingest.ts` for testability).

### Retry cap: `mb_lookup_attempts` column

New column: `alter table reviews add column mb_lookup_attempts integer default 0;`

- Incremented by 1 each time the **backfill pass** retries a row, regardless of whether MB returned anything new.
- NOT incremented on the RSS-driven loop — that path is expected to succeed quickly on first ingest.
- A row is permanently excluded from the backfill when **both** conditions hold:
  - `mb_lookup_attempts >= 5`
  - `publishedAt < now - 14 days`

Rationale: one observed case (Malist) took ~6 days for MB to index a release date after review publication. 14 days is roughly double that as a safety margin. 5 attempts at twice-daily ingest ≈ 2.5 days of retries, so the age condition is the binding constraint in practice — the attempt count prevents runaway retries if ingest frequency changes.

`mb_lookup_attempts` is NOT mapped to `MetalReview` (the frontend never needs it). It lives in `DbRow` and is read/written in `runIngestion()` via a separate `mbAttemptsById: Map<string, number>` built from the raw Supabase response before `fromDbRow` discards the field.
