# Session decisions — Supabase migration (June 2026)

Covers two sessions: the ingest pipeline migration (Phase 2) and the frontend migration (Phase 3). Merged here since they're one continuous migration story.

## Phase 2 — Ingest pipeline → Supabase

### What was built

The ingest pipeline's write target moved from `public/reviews.json` to a Supabase Postgres table called `reviews`.

### New files

- **`scripts/supabaseClient.ts`**: Exports a single `supabase` client using `SUPABASE_URL` + `SUPABASE_SECRET_KEY` from `.env` (loaded via `dotenv/config`). Uses the service key, which bypasses RLS — **never import this in frontend code**.
- **`scripts/seed-from-json.ts`**: One-time migration script that read `public/reviews.json` and upserted all 53 records into Supabase. Safe to re-run (upserts on `id`). Keep in repo for reference; not needed again unless the table is reset.

### Supabase table schema

```sql
create table reviews (
  id text primary key,
  band text not null,
  album text not null,
  source text not null,
  score text,
  normalized_score numeric,  -- numeric (not integer) to preserve fractional values e.g. 83.33
  summary text,
  url text,
  published_at timestamptz,
  published_date text,       -- formatted display string e.g. "14 Jun 2026", derived from published_at
  artwork_url text,
  genre text[] default '{}'::text[]
);
```

### camelCase ↔ snake_case mapping

Postgres uses snake_case; `MetalReview` uses camelCase. Two explicit mapping functions handle the boundary — do not use a generic string converter:

- **`fromDbRow(row: DbRow): MetalReview`** — lives in `src/dbMapping.ts` (shared). Used by ingest (reading back rows) and frontend (mapping query results). Fills nullable DB fields with safe defaults (`''`, `0`, `[]`).
- **`toDbRow(r: MetalReview): DbRow`** — lives in `scripts/ingest.ts` (server-only). Maps before upsert. Drops fields not in the schema (`rating`, `isDoublePositive`).

`DbRow` is defined and exported from `src/dbMapping.ts`; `scripts/ingest.ts` re-exports it for backward compat.

Affected field mappings:
| `MetalReview` | DB column |
|---|---|
| `normalizedScore` | `normalized_score` |
| `publishedAt` | `published_at` |
| `publishedDate` | `published_date` |
| `artworkUrl` | `artwork_url` |

### applyMergeGuard (extracted pure function)

The merge guard logic was extracted from the inline block in `runIngestion()` into `export function applyMergeGuard(existingById, freshReviews): MetalReview[]`. It is:

- **Pure** — no I/O, no side effects, operates entirely on in-memory maps
- **Tested** — 8 unit tests in `src/__tests__/mergeGuard.test.ts`
- **Exported** — importable without triggering any ingest side effects

Guard rules (unchanged from the JSON era — see `docs/decisions/persistent-history-superseded.md`):
- `artworkUrl`: use fresh if non-null; otherwise keep existing; otherwise null
- `genre`: use fresh if non-empty; otherwise keep existing; otherwise `[]`
- Existing rows not in fresh results are preserved in output
- Output sorted by `publishedAt` descending

### How runIngestion() works now

1. `SELECT *` from Supabase → `existingReviews` (non-fatal on failure, falls back to `[]`)
2. Build `existingById`, `ratingAlreadyFetched`, `mbAlreadyFetched` skip-sets from existing rows
3. Fetch RSS feeds + ratings + MusicBrainz data (unchanged)
4. `applyMergeGuard(existingById, final)` → `output`
5. `UPSERT output.map(toDbRow)` with `onConflict: 'id'` — throws on error (fatal)

### Refresh button polling (current behaviour)

The refresh button polls `GET /api/ingest/status` every 2 seconds. When the server returns `{ status: "idle" }`, the ingest is complete. The button then queries Supabase directly to reload the card grid. If the reload fails, the button shows the error state instead of a false success checkmark.

(Compare to the original polling approach in `docs/decisions/refresh-button.md`, which polled `GET /reviews.json` directly — that target no longer exists.)

## Phase 3 — Frontend → Supabase

### What was built

The frontend was migrated from reading `public/reviews.json` to querying Supabase directly. `public/reviews.json` has been deleted.

### New files

- **`src/supabaseClient.ts`**: Frontend-only Supabase client. Uses `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable/anon key — safe to bundle in the browser). Throws a clear error at module load time if either env var is missing. Never import `scripts/supabaseClient.ts` in frontend code — that holds the service key.
- **`src/dbMapping.ts`**: Shared `DbRow` type and `fromDbRow` function. Extracted from `scripts/ingest.ts` so both the ingest pipeline and the frontend use the same mapping without duplicating it.

### Key patterns

**Two Supabase clients, separate purposes:**
| File | Key | Who uses it |
|---|---|---|
| `scripts/supabaseClient.ts` | `SUPABASE_SECRET_KEY` (service key, bypasses RLS) | Ingest pipeline only |
| `src/supabaseClient.ts` | `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) | Frontend only |

**Single mapping layer in `src/dbMapping.ts`:** `fromDbRow` lives here; `scripts/ingest.ts` imports it and re-exports `DbRow` for backward compat. `toDbRow` stays in `scripts/ingest.ts` (server-only write path).

**Initial load (`useEffect` in `App.tsx`):**
```ts
supabase.from('reviews').select('*').order('published_at', { ascending: false })
  .then(({ data, error }) => {
    if (error) { console.warn(...); }
    else { setReviews((data as DbRow[]).map(fromDbRow)); }
    setLoading(false);
  })
  .catch((e) => { console.warn(...); setLoading(false); }); // network-level failures
```
`.catch()` is required — the Supabase client resolves DB errors as `{ data: null, error }` but rejects on true network failures (DNS, TLS). Without `.catch`, a network failure leaves the spinner running forever.

**Refresh reload:** After polling confirms `status === 'idle'`, does the same Supabase query. Shows `'error'` state (not `'success'`) if the reload itself fails, so the user knows the display wasn't updated.

### env vars

```
SUPABASE_URL=...                   # used by scripts/supabaseClient.ts (dotenv)
SUPABASE_SECRET_KEY=...            # used by scripts/supabaseClient.ts (dotenv)
VITE_SUPABASE_URL=...              # used by src/supabaseClient.ts (import.meta.env)
VITE_SUPABASE_PUBLISHABLE_KEY=...  # used by src/supabaseClient.ts (import.meta.env)
```

Vite only exposes env vars prefixed `VITE_` to browser code. A missing prefix fails silently (the value is `undefined`) — the guard in `src/supabaseClient.ts` catches this at module load time.
