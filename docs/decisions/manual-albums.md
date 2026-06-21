# Session decisions — manual_albums table + MusicBrainz lookup endpoint (June 2026)

## What was built

- **`manual_albums` Supabase table** — schema and RLS for user-curated album entries
- **`scripts/musicbrainz.ts`** — shared MB lookup module extracted from `scripts/ingest.ts`
- **`POST /api/manual-album-lookup`** — server endpoint that validates a user's session JWT and returns MB enrichment data (no DB write)

## Schema

```sql
create table manual_albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  band text not null,
  album text not null,
  artwork_url text,
  genre text[] default '{}'::text[],
  release_date text,
  created_at timestamptz default now()
);
```

Full migration SQL in `supabase/manual_albums.sql`.

### `release_date` is `text`, not `date`

MusicBrainz returns partial dates (`"2024"`, `"2024-03"`, `"2024-03-15"`). A native `date` column cannot represent partial precision without fabricating a fake day/month. This matches the `reviews` table's existing `release_date text` convention.

### No `personal_score` column

Favorites/shortlist is "albums the user likes," not a scoring mechanism. Scoring is a distinct Phase 7 (AOTY) concept — deferred until that phase actually defines what the field means.

## RLS policy

```sql
alter table manual_albums enable row level security;

create policy "Users can manage their own manual albums"
  on manual_albums
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Single policy for all operations (`for all`), matching the pattern used for `favorites` (`auth.uid() = user_id`, no anonymous access).

## MusicBrainz lookup extraction

`fetchMusicBrainzData` was removed from `scripts/ingest.ts` and replaced by `lookupMusicBrainz` in `scripts/musicbrainz.ts`. The extracted function:

- Has the same three-step logic: release search (step A) → release detail + CAA in parallel (step B) → artist genre fallback (step C)
- Adds `releaseDate: string | null` extracted from `releases[0].date` in the step A search response (already present in MB search results, no extra request needed)
- Keeps the same `User-Agent` header and `sleep(1000)` rate-limit discipline between MB requests
- Both `ingest.ts` (existing scraper pipeline) and `server.ts` (the new endpoint) import from this shared module — no duplicated logic

## Endpoint auth: real user session JWT, not shared secret

`POST /api/manual-album-lookup` validates the caller's Supabase session via:

```ts
const { data: { user }, error } = await supabase.auth.getUser(token)
```

Where `supabase` is the service-role client from `scripts/supabaseClient.ts`. In Supabase JS v2, `auth.getUser(jwt)` sends the token to Supabase's `/auth/v1/user` endpoint regardless of the client's own key — it validates the user's JWT, not the service-role key. Returns `401` for missing/invalid tokens.

This is intentionally different from `POST /api/ingest`, which uses `INGEST_SECRET_TOKEN` (a shared server secret, never per-user). That pattern is inappropriate here because this endpoint represents a user action.

## No DB write server-side

The endpoint returns enrichment data (`artworkUrl`, `genre`, `releaseDate`) but does NOT insert into `manual_albums`. The client performs the insert directly via the Supabase browser client, protected by RLS — the same pattern used for `favorites` writes. The server's only job is the MB lookup, which requires a server (MB rate limits + required User-Agent header).

## Failed MB lookups

A no-match lookup returns `200` with nulls — not an error. The client proceeds to insert the row without enrichment. No retry mechanism was built; that's deferred until real-world failure frequency is observed.

## What NOT to change

- Do not merge `manual_albums` and `favorites` into a polymorphic table — two distinct tables was an explicit architectural decision.
- Do not change `release_date` to `date` type — partial MB dates break native `date` columns.
- Do not add `personal_score` — out of scope until Phase 7 defines it.
- `lookupMusicBrainz` in `musicbrainz.ts` is the single MB lookup implementation. Do not add a second implementation in `ingest.ts` or anywhere else.
- The endpoint does not insert rows. Do not add a DB write to it — client-side insert via RLS is the correct pattern.
