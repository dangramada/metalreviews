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

## Follow-up — Metal Storm Puppeteer Chrome-not-found on Render (2026-07-01)

### Root cause (confirmed via Render production logs, not assumed)

Every Metal Storm review from 2026-06-28 onward silently got an empty score. Render logs showed the launch-level catch in `fetchMetalStorm()` (`scripts/ingest.ts`) firing every run with:

```
Could not find Chrome (ver. 148.0.7778.97)
```

checking cache path `/opt/render/project/src/.cache/puppeteer`. This is **not** the sandbox/permissions crash flagged as security-audit Finding #9 (`--no-sandbox`) — that mechanism is ruled out by this error text. It's also not a code regression: `scripts/ingest.ts`'s Metal Storm fetch path hasn't changed since the 2026-06-25 `waitForSelector` fix, and the bug reproduces on Render only, never locally.

The actual cause: `puppeteer` (the package that owns the Chrome-download postinstall step) sat in `devDependencies`. Render's build never ran that download, so the Chrome binary Puppeteer expects at launch was simply never present in the container — every launch call failed immediately, for every review, which is why the symptom looked systemic rather than flaky.

The cache path itself was already correct — `.puppeteerrc.cjs` (added in `366d1cd`) pins `cacheDirectory` to `<project-root>/.cache/puppeteer`, which both the install step and the runtime `puppeteer.launch()` call read via the same `getConfiguration()` resolution (confirmed by reading `node_modules/puppeteer/lib/cjs/puppeteer/getConfiguration.js`). So there was never a path mismatch — only a missing download.

### Fix applied

- Moved `puppeteer` from `devDependencies` to `dependencies` in `package.json`, so it installs regardless of any `--omit=dev`/production install flag Render's build may use.
- Added an explicit browser-install step to the `build` script: `"build": "npx puppeteer browsers install chrome && vite build"` — makes the Chrome download an explicit, visible part of the build rather than an implicit postinstall side effect.
- No Render dashboard build-command change is needed — the existing build command (whatever it is) already runs `npm run build`-equivalent tooling, and the install step now lives inside that script.
- `puppeteer.launch({ headless: true })` itself was left untouched — no `--no-sandbox`, no `executablePath` added.

### What remains deliberately untouched

- **`puppeteer-core` + `@sparticuz/chromium-min`**: still present in `devDependencies`, still unused. They're leftovers from an abandoned Vercel-migration plan (see `bkCLAUDE.md`, a stale pre-Render backup of this file). Swapping to them is a separate, deliberate future decision — not part of this fix.
- **Security audit Finding #9** (`--no-sandbox` not passed to `puppeteer.launch()`): still open, still a separate concern from this bug. This fix addresses "Chrome binary missing"; it does not address "Chrome crashes under Render's container sandbox," which remains an unconfirmed, deferred risk.

### Verification status

**Verified against a real Render deploy (2026-07-19).** Dan ran a live ingest on the deployed instance; all three sources (Angry Metal Guy, The Progressive Subway, Metal Storm) completed successfully with real scores returned — not just an absence-of-crash check. The `dependencies`/explicit-install-step fix is confirmed working in production.

This verifies only the "Chrome binary missing at build time" fix. It says nothing about Security Finding #9 (`--no-sandbox`), which is a separate, still-open concern — see that section below.

## Superseded (2026-07-21): ingest auth + Refresh button removed

The "Ingest endpoint auth" bullet, the env var table, and the "Admin-gating of the
Refresh button" section above describe the original `X-Ingest-Token` /
`VITE_INGEST_SECRET_TOKEN` / Refresh-button design. That design is gone —
`/api/ingest` now takes `Authorization: Bearer <token>`, called only by a GitHub
Actions schedule/`workflow_dispatch`, and the Refresh button no longer exists. See
`docs/decisions/ingest-trigger-and-security.md` Section 7 for the current design.
`INGEST_SECRET_TOKEN` (server-only) is the only ingest secret that still exists;
`VITE_INGEST_SECRET_TOKEN` is gone.
