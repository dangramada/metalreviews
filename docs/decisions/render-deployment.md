# Session decisions — Render deployment (June 2026)

## What was built

Four fixes for Render deployment:

1. **Dynamic port binding**: `const PORT = process.env.PORT || 3001` — Render injects `PORT`; falls back to 3001 for local dev.
2. **Production static serving**: Express now serves `dist/` (Vite build output) instead of `public/` (deleted during the Supabase frontend migration — see `docs/decisions/supabase-migration.md`).
3. **Ingest endpoint auth**: `POST /api/ingest` requires an `X-Ingest-Token` header matching `INGEST_SECRET_TOKEN`. Returns 401 otherwise. Logic lives in `export function isAuthorized()` in `server.ts` (exported pure function — no supertest needed for Vitest). The refresh button in `App.tsx` sends the header via `VITE_INGEST_SECRET_TOKEN`.
4. **Startup warning**: `server.ts` logs a `console.warn` at startup if `INGEST_SECRET_TOKEN` is unset, so a misconfigured deploy is immediately visible in Render logs.

## env vars

```
INGEST_SECRET_TOKEN=...           # server.ts — the shared secret, checked on every POST /api/ingest
VITE_INGEST_SECRET_TOKEN=...      # App.tsx (Vite) — must match INGEST_SECRET_TOKEN exactly
```

Both must be set in `.env` for local dev and in Render's dashboard for production. If `INGEST_SECRET_TOKEN` is missing on the server, the endpoint rejects all requests and logs a warning at startup.

## Admin-gating of the Refresh button (deferred)

The `VITE_INGEST_SECRET_TOKEN` value is bundled into the browser JS and visible in the network tab — it cannot truly be kept secret. This is acceptable while the Render URL is not publicly shared. Proper admin-gating (button only renders for an authenticated user; secret never leaves the server) is deferred. See the `isAuthorized` comment in `server.ts`.
