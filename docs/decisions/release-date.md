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
releaseDate:
  releaseDatePrecision(fresh.releaseDate) >= releaseDatePrecision(existing.releaseDate)
    ? fresh.releaseDate
    : existing.releaseDate
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

| Input | Output |
|---|---|
| `"2024-03-15"` | `"15 Mar 2024"` |
| `"2024-03"` | `"Mar 2024"` |
| `"2024"` | `"2024"` |
| `null` | `"—"` |

## What NOT to change

- Do not use release-group `first-release-date` — the existing release-level call is sufficient for new-release reviews.
- Do not write a backfill/migration script for the ~53 existing rows.
- Do not touch `artworkUrl` or `genre` merge guard rules.
- `manual_albums`, new routes, and the Drawer form are separate future briefs.
