# Session decisions — Manual refresh / Express server (June 2026)

> Note: the polling target and reload mechanism described here were later updated — see `docs/decisions/supabase-migration.md` ("Refresh button polling — Phase 3") and `docs/decisions/render-deployment.md` ("Ingest endpoint auth") for the current behaviour. This file documents the original implementation and the styling patterns, which are still current.

## What was built

- **`server.ts`** (project root): Express server on port 3001. Serves `public/` as static files and exposes one endpoint: `POST /api/ingest`.
- **`scripts/ingest-cli.ts`**: Thin entry point that imports `runIngestion` and owns the cron schedule + immediate startup run. This is what `npm run ingest` executes.
- **`scripts/ingest.ts`**: `runIngestion()` is now `export`ed and contains no top-level side effects — safe to import from `server.ts` without triggering a cron or an ingest on import.
- **Vite proxy**: `/api` is proxied to `http://localhost:3001` in `vite.config.ts`, so the frontend uses relative `/api/ingest` with no hardcoded localhost URLs.
- **`concurrently`**: `npm run dev` runs `vite` and `tsx server.ts` together in one terminal.
- **Refresh button** in `src/App.tsx`: added to the right end of the controls bar.

## `POST /api/ingest` behaviour (original)

- Returns **202 Accepted** immediately with `{ status: "running" }` — ingest runs in the background.
- Returns **409 Conflict** with `{ status: "busy", message: "Ingest already running" }` if a run is in progress. Tracked via a simple `let ingesting = false` flag in `server.ts`.
- Ingest is **not triggered automatically** when the server starts — only on button click or `npm run ingest`.

## Refresh button states and polling (original — see supabase-migration.md for current)

- `refreshState`: `'idle' | 'loading' | 'success' | 'error'` — local state in `App`.
- On 202: polls `GET /reviews.json` every 3 seconds. Compares `Math.max(...publishedAt)` snapshot taken before the POST against the new data. When a newer date appears, updates React state and sets `'success'` for 3 seconds then resets.
- On 409: shows a Chakra `useToast` warning, stays `'idle'`.
- On network error: sets `'error'` for 3 seconds then resets.

## Controls bar styling pattern (still current)

A shared `controlStyle` const is defined in the `App` component body (alongside `cardStyle`) and spread onto the Input and all Selects (Sort, Source, Score):

```ts
const controlStyle = {
  size: 'md',
  variant: 'outline',
  bg: 'surface.card',
  color: 'text.primary',
  borderColor: 'border.default',
} as const;
```

The Refresh button does **not** spread `controlStyle` — it is fully explicit. Reason: Chakra v2's `variant="outline"` conflicts with explicit `bg` overrides, causing the border to not contain its content. The button uses `border="1px solid"` + `borderColor` directly, with no `variant` prop, and `flexShrink={0}` to prevent flex compression.

Both `<Select>` controls use `sx={{ '& option': { background: '#1a202c' } }}` to override the native browser white dropdown background on Windows.
