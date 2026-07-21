# Ingest trigger decision + security audit record — June 2026

## Section 1 — Current state (verified)

Ingest runs in two ways today:

1. **Refresh button** — clicking the button in the UI POSTs to `/api/ingest`,
   authenticated via `X-Ingest-Token` header (token stored in env, injected into the
   browser bundle via `VITE_INGEST_SECRET_TOKEN`).
2. **`npm run ingest` locally** — runs `scripts/ingest-cli.ts`, which runs the
   scraper once immediately and starts a `node-cron` loop to re-run at 07:00 and
   19:00 daily for as long as the process stays alive.

**No scheduler is running in production — verified, not inferred.** Confirmed two
ways:

1. Code reading shows `scripts/ingest-cli.ts` contains real, functional `node-cron`
   wiring (`0 7,19 * * *`). This is **not** dead code — it works as written. But
   `ingest-cli.ts` is never the web-service entrypoint; `server.ts` is, via
   `npm run server` / `npm run dev`.
2. The Render dashboard was checked directly and shows exactly **one** service
   (`metalreviews`, type Web Service, Node runtime) — no Background Worker, no Cron
   Job service, nothing else. So the schedule has no process to run in.

This is a confirmed dashboard observation, not an absence-of-config-file inference.
`render.yaml` doesn't exist in the repo, but that alone wouldn't have proven it
(dashboard-configured services leave no repo trace), which is why the dashboard was
checked directly.

### Doc drift (known gap, now flagged)

`CLAUDE.md` (the ingest bullet in the Architecture section) previously stated that
`scripts/ingest.ts` "Schedules itself via `node-cron` to run at 07:00 and 19:00
daily," and the commands table described `npm run ingest` as "(also starts cron)."
`refresh-button.md` describes `ingest-cli.ts` as owning "the cron schedule."

**Precise correction:** these lines are not false about the code — the cron logic
genuinely exists in `ingest-cli.ts` and would fire correctly if that process ran
long-term. The drift is specifically that no production process ever starts
`ingest-cli.ts`, so the schedule never executes despite being real, correct code.
`CLAUDE.md` has been updated to reflect this (see Task 2 in the session that created
this doc); the main bodies of decision docs are append-only and have not been
rewritten.

---

## Section 2 — Security audit cross-check (June 2026)

A manual security audit was run and each finding verified against live code and full
git history. **Line numbers are omitted intentionally** — they drift as the codebase
evolves. Findings are described by concept and location so the record stays useful
after refactors.

| # | Finding | Original severity | Verified in code? | Notes |
|---|---------|------------------|-------------------|-------|
| 1 | `.env` file containing live Supabase URL, service-role key, ingest token, and Puppeteer path | Critical | **Downgraded → Low** | `git log --all --full-history -- .env` returned nothing. `.env` has never been committed; `.gitignore` covers it. No history scrub needed. **This is the headline audit result.** |
| 2 | `VITE_INGEST_SECRET_TOKEN` baked into browser bundle; sent as `X-Ingest-Token` from the refresh button | High | Yes | A code comment already flags this as a known temporary hack, acceptable while the Render deployment URL is private and not publicly advertised |
| 3 | Wildcard CORS — `app.use(cors())` with no origin restriction | Medium | Yes | No origin allowlist has ever been in the history |
| 4 | No `helmet` — missing standard security headers (CSP, HSTS, X-Frame-Options, etc.) | Medium | Yes | Never added |
| 5 | Scraped `summary` field stored and rendered without sanitisation | Medium (fragile) | Yes — currently safe | React renders it as text content, not HTML; no `dangerouslySetInnerHTML` anywhere in the codebase. Risk is a future refactor adding rich rendering that inherits unsanitised data. Not an active XSS vector today. |
| 6 | Service-role (RLS-bypassing) Supabase client imported in `server.ts` and used for `auth.getUser()` | Medium | Yes | Design-level blast-radius concern: service-role is only needed for `auth.getUser()` but the same client reference could be used for data operations. Not an active bug. |
| 7 | No rate limiting on any endpoint | Medium | Yes | Never added; affects both `/api/ingest` and `/api/manual-album-lookup` |
| 8 | Non-timing-safe token comparison (`===`) for `X-Ingest-Token` | Low | Yes | Low practical risk over HTTPS where timing attacks are noise; becomes moot if the endpoint is removed |
| 9 | Puppeteer launched without `--no-sandbox` flag | Low (reliability) | Yes | Primarily a reliability concern on Render's container environment, not a security issue. Silent failure mode: scraper runs but Metal Storm results are dropped. **Closed 2026-07-19**: diagnosed against real production Render logs (two ingest runs); no sandbox/permissions crash signature found. Observed Metal Storm failures in that window were plain navigation timeouts (distinct failure mode, unrelated to the sandbox flag), and ingestion completed successfully both times. No current evidence of this finding's described failure mode reproducing. Not a guarantee the underlying risk is impossible under different conditions — closing based on absence of evidence in logs checked, not a structural fix. |
| 10 | Band/album name interpolated directly into a MusicBrainz Lucene query without escaping or length cap | Low | Yes | Auth-gated (runs server-side during ingest, no user-controlled input path in normal flow); low impact, but Lucene special characters could cause malformed queries |
| 11 | Author contact email hardcoded in `scripts/musicbrainz.ts` as the MusicBrainz ToS `User-Agent` contact | Informational | Yes | MusicBrainz ToS requires a contact address; minor PII concern only if the repo goes public |

**Caveat:** this is a point-in-time record. Code changes after June 2026 may resolve
or introduce findings not listed here. Do not treat the table as a live security
posture — re-audit if the server layer changes substantially.

---

## Section 3 — The decision (DECIDED)

- The **refresh button will be removed**.
- Ingest will move to a **scheduled job** running independently of the web service.
- **Not yet implemented** — this is deferred work. This doc records the decision and
  the evidence behind it so neither has to be re-derived in the implementation
  session.

---

## Section 4 — Why removal simplifies security

Removing the browser-as-trigger **deletes** findings rather than hardening around
them:

- **Finding #2 disappears entirely.** No browser caller means no token in the bundle.
  `VITE_INGEST_SECRET_TOKEN` ceases to exist as a concept.
- **Finding #8 becomes moot.** Nothing is comparing the token, so timing-safety is
  irrelevant.
- **Half of Finding #1's rotation question evaporates.** The `INGEST_SECRET_TOKEN`
  env var is no longer needed; the Supabase keys remain and still warrant normal
  secret hygiene, but the attack surface shrinks.

This is strictly better than adding auth hardening to the current endpoint. The
correct tool for "a server-to-server secret" (Finding #2's replacement in the
external-scheduler approach) is a long random value in an `Authorization` header that
no browser ever sees — which is exactly what removing the button enables.

---

## Section 5 — Implementation fork (PARKED — do not decide here)

Three viable approaches for the implementation session to evaluate:

### Option A: In-process `node-cron`

The scheduling wiring already exists in `scripts/ingest-cli.ts` (`0 7,19 * * *`), so
it is tempting to just "turn it on" by deploying `ingest-cli.ts` as the service's
start command.

**Expected failure mode to verify at implementation time:** if that process is
deployed as a free-tier Render web service with no public HTTP traffic to keep it
awake, Render's free-tier spin-down after ~15 minutes idle would silently stop the
schedule from firing — `node-cron` only runs while its process is alive. This is a
well-understood Render characteristic but has **not been observed on this specific
setup** (no such process is deployed right now — confirmed via the dashboard check in
Section 1). Flag it at implementation time, don't assume it's safe, don't assume it's
broken.

### Option B: Render native Cron Job

A separate scheduled container that Render manages independently. Fires on a cron
schedule regardless of whether the web service is awake. Reliable.

**Cost caveat:** Render Cron Jobs are a **paid** service type. Confirm pricing on the
current/intended Render plan before committing to this approach.

### Option C: External scheduler → token-protected endpoint

Keep `/api/ingest`, but the only caller is a scheduler you control (GitHub Actions, a
separate cron service, a home server). A long random secret in an `Authorization`
header is the correct tool here — no browser ever sees it, so Finding #2 does not
recur.

**Trade-off:** keeps the endpoint alive (Findings #3, #4, #7 remain relevant for the
endpoint itself); slightly more moving parts than a self-contained Render job.

### Open question (parked)

Does Dan want *any* manual trigger capability, or is purely-scheduled acceptable?
Running `npm run ingest` locally is the zero-attack-surface option for one-off runs.
Decide in the implementation session.

---

## Section 6 — Cron-independent fixes (NOT TOUCHED)

**These findings are independent of the refresh-button removal** and must not get
swept into the "later" pile by association. `/api/manual-album-lookup` is a live,
authenticated user endpoint that persists regardless of what happens to the ingest
trigger.

### Cheap config — apply to the whole server (high value, low effort)
- **Finding #4** — add `helmet`. One `app.use(helmet())` call covers the whole server.
- **Finding #3** — lock CORS to the known origin(s) instead of wildcard.

### Endpoint-specific
- **Finding #7 (partial)** — rate-limit `/api/manual-album-lookup`. The ingest
  endpoint rate-limit question resolves with the trigger decision; this one does not.

### Post-launch hardening batch (lower urgency, higher effort)
- **Finding #5** — run scraped `summary` through `sanitize-html` at the ingest
  boundary so future rendering changes can't inherit raw HTML.
- **Finding #6** — split the Supabase client: use the anon/user client for
  `auth.getUser()` and reserve the service-role client for operations that actually
  require RLS bypass.
- **Finding #10** — escape Lucene special characters and add a length cap before
  interpolating band/album name into the MusicBrainz query.

---

## Section 7 — Implementation (2026-07-21)

Option C (Section 5) implemented as decided.

- **`.github/workflows/ingest.yml`**: `schedule: '0 7,19 * * *'` + `workflow_dispatch:
  {}`. Confirmed with Dan that the original 07:00/19:00 times were already intended
  as UTC, so no conversion was needed — the cron expression carries over unchanged
  from `ingest-cli.ts`'s `node-cron` wiring. The job step is a single `curl -X POST`
  to `https://metalreviews.onrender.com/api/ingest` with `--fail` (so a non-2xx
  response fails the Actions run visibly) and the secret passed via `env:` +
  `${INGEST_SECRET}` shell expansion, never interpolated into the command string or
  echoed in any step.
- **Header rename**: `/api/ingest` now reads `Authorization: Bearer <token>` instead
  of `X-Ingest-Token`. Decided without flagging back to Dan because
  `/api/manual-album-lookup` in the same `server.ts` already uses
  `Authorization: Bearer` for its (unrelated) Supabase-JWT check — reusing the header
  name keeps one auth convention in the file instead of two. `isAuthorized()`'s
  comparison logic is untouched; only the extraction changed.
- **Browser exposure removed**: `VITE_INGEST_SECRET_TOKEN` deleted from `src/App.tsx`
  (grepped first — its only other references were `server.ts`, which now no longer
  reads it either, and doc mentions in this file and `render-deployment.md`, left
  as historical record). Findings #2 and #8 (Section 2) are now closed — no browser
  caller exists, so nothing compares the token in a browser-observable path.
- **Refresh button removed**: `handleRefresh`, `refreshState`, the `/api/ingest/status`
  poll loop, and the associated toasts/icons removed from `src/App.tsx` per
  `docs/decisions/refresh-button.md`. No in-app manual trigger was built — decided
  against in Section 5's open question; `workflow_dispatch` in the Actions UI is the
  only manual-trigger path now.
- **Verification**: `tsc --noEmit` clean, 166/166 tests passing. Additionally
  live-verified the new auth mechanism itself end-to-end against a local
  `tsx server.ts` pointed at real production Supabase + real scraper sources:
  no-auth → 401, old `X-Ingest-Token` header → 401 (correctly rejected), correct
  `Authorization: Bearer <INGEST_SECRET_TOKEN>` → 202, and the run completed with
  "✅ Ingestion completed — upserted 23 album(s), 47 review(s)". This proves the
  code path GitHub Actions will call is correct. **What's still pending**: an
  actual GitHub Actions run (scheduled or `workflow_dispatch`) hitting the deployed
  `https://metalreviews.onrender.com/api/ingest`, which requires Dan to set
  `INGEST_SECRET` (GitHub) and `INGEST_SECRET_TOKEN` (Render) first — see
  `deferred-work.md`, not marked done until that specific run is confirmed.
  (Incidentally surfaced during this run, unrelated to auth: two pre-existing
  `skipped_posts` logging failures with Postgrest error `PGRST116` — flagged
  separately, not fixed here.)
- **Not touched**: Findings #3/#4/#7 (CORS/helmet/rate-limiting) — still open, tracked
  in Section 6. The Metal Storm timeout fix — untouched, separate work.
