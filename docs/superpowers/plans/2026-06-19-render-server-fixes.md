# Render Server Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `server.ts` for Render deployment with three independent fixes: dynamic port binding, production static file serving, and an auth guard on the ingest endpoint.

**Architecture:** All changes are confined to `server.ts` and a new test file. A small `isAuthorized` helper is extracted to keep the auth logic unit-testable without adding `supertest`. CLAUDE.md is updated to document the Phase 5 admin-gating note.

**Tech Stack:** Express 5, Vitest, TypeScript, tsx

---

## Files Changed

| File | Action |
|---|---|
| `server.ts` | Modify — port binding, static dir, auth guard |
| `src/__tests__/serverAuth.test.ts` | Create — unit tests for `isAuthorized` |
| `CLAUDE.md` | Modify — Phase 5 admin-gating note |

---

### Task 1: Dynamic port binding

**Files:**
- Modify: `server.ts:32`

- [ ] **Step 1: Change the hardcoded port to read `process.env.PORT`**

Replace the final line of `server.ts`:

```ts
// Before
app.listen(3001, () => console.log('Server listening on http://localhost:3001'));

// After
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
```

- [ ] **Step 2: Verify local dev still works**

Run: `npm run server`
Expected: `Server listening on port 3001` in the terminal. Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "fix: read PORT env var with 3001 fallback for Render deployment"
```

---

### Task 2: Serve production build from `dist/`

**Files:**
- Modify: `server.ts:8`

**Context:** `vite build` outputs to `dist/` (default, not overridden in `vite.config.ts`). In dev, Vite's own dev server handles the frontend — Express only receives `/api` requests via the Vite proxy. In production, Express is the only process, so it must serve `dist/`. The old `public/` path is a leftover from before the Supabase migration; the `public/reviews.json` file was deleted in Phase 3.

App.tsx has no router (confirmed in CLAUDE.md: "No routing, no server-side state"), so no wildcard `index.html` fallback is needed — `express.static` serves `dist/index.html` automatically for `/` requests via its default `index: true` option.

- [ ] **Step 1: Change the static file directory from `public` to `dist`**

Replace line 8 in `server.ts`:

```ts
// Before
app.use(express.static(path.resolve(process.cwd(), 'public')));

// After
app.use(express.static(path.resolve(process.cwd(), 'dist')));
```

- [ ] **Step 2: Build and verify**

Run:
```bash
npm run build
npm run server
```

Open `http://localhost:3001` in a browser.
Expected: The React app loads and shows the metal reviews card grid (pulls from Supabase). No 404 on the root route.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "fix: serve dist/ in production instead of public/ (Render deployment)"
```

---

### Task 3: Auth guard on `POST /api/ingest`

**Files:**
- Modify: `server.ts`
- Create: `src/__tests__/serverAuth.test.ts`

**Context:** The ingest endpoint will be reachable on a public Render URL. A shared-secret header check is "good enough for now" because the deployed URL isn't publicly shared yet. A proper admin-gating solution (auth-aware, server-only secret) is deferred to Phase 5 — this is noted in CLAUDE.md and in a comment in the code.

`supertest` is not installed. To keep the auth logic testable with Vitest alone, extract it as a pure exported helper function `isAuthorized`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/serverAuth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isAuthorized } from '../../server.js';

describe('isAuthorized', () => {
  it('returns true when token matches secret', () => {
    expect(isAuthorized('my-secret', 'my-secret')).toBe(true);
  });

  it('returns false when token header is missing', () => {
    expect(isAuthorized(undefined, 'my-secret')).toBe(false);
  });

  it('returns false when token header is an empty string', () => {
    expect(isAuthorized('', 'my-secret')).toBe(false);
  });

  it('returns false when token does not match secret', () => {
    expect(isAuthorized('wrong-token', 'my-secret')).toBe(false);
  });

  it('returns false when INGEST_SECRET_TOKEN env var is not set', () => {
    expect(isAuthorized('any-token', undefined)).toBe(false);
  });

  it('returns false when both token and secret are undefined', () => {
    expect(isAuthorized(undefined, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/serverAuth.test.ts`
Expected: FAIL — `isAuthorized` not exported from `server.js`

- [ ] **Step 3: Add `isAuthorized` export and auth guard to `server.ts`**

Add the exported helper just below the `let ingesting = false;` line, and add the guard at the top of the `POST /api/ingest` handler:

```ts
// Pure helper — exported for unit testing only.
// PHASE 5 NOTE: this token check is intentionally weak. Once auth ships,
// replace this with a server-side session check so the secret never needs
// to be sent from the browser (it can't be kept secret via VITE_ env vars).
export function isAuthorized(
  token: string | string[] | undefined,
  secret: string | undefined
): boolean {
  if (!token || !secret) return false;
  return token === secret;
}

// ...existing route handlers below...
app.post('/api/ingest', (req, res) => {
  const token = req.headers['x-ingest-token'];
  if (!isAuthorized(token, process.env.INGEST_SECRET_TOKEN)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (ingesting) {
    res.status(409).json({ status: 'busy', message: 'Ingest already running' });
    return;
  }
  ingesting = true;
  res.status(202).json({ status: 'running' });
  runIngestion()
    .catch((e) => console.error('Ingest error:', e))
    .finally(() => {
      ingesting = false;
    });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/serverAuth.test.ts`
Expected: 6 tests pass

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: All pre-existing tests still pass alongside the 6 new ones

- [ ] **Step 6: Commit**

```bash
git add server.ts src/__tests__/serverAuth.test.ts
git commit -m "feat: guard POST /api/ingest with X-Ingest-Token header check"
```

---

### Task 4: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Phase 5 admin-gating note to the Supabase section of CLAUDE.md**

Find the section `## Session decisions — Supabase migration (June 2026)` → subsection `### POST /api/ingest behaviour` and add a new subsection after it:

```markdown
### Phase 5 — admin-gating (deferred, not shipped)

`POST /api/ingest` is guarded by an `X-Ingest-Token` header check using `INGEST_SECRET_TOKEN` (set in Render's dashboard). This is "good enough for now" only because the Render URL is not publicly shared.

**Known limitation:** the refresh button's frontend code also needs to send this header. There is no secure way to do this via a `VITE_`-prefixed env var — the value is visible in the browser's network tab. Proper admin-gating (where the secret never leaves the server and the button only renders for one authenticated user) is deferred to Phase 5, once auth is in place. See `server.ts` `isAuthorized` for the comment.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note Phase 5 admin-gating as unfinished business in CLAUDE.md"
```

---

## Self-Review

**Spec coverage:**
- ✅ `process.env.PORT || 3001` — Task 1
- ✅ Local dev stays on 3001 — Task 1 verify step
- ✅ `dist/` served in production — Task 2
- ✅ No wildcard fallback needed (no router) — Task 2 context note
- ✅ `X-Ingest-Token` / `INGEST_SECRET_TOKEN` guard — Task 3
- ✅ 401 on missing/wrong token — Task 3 tests + implementation
- ✅ Normal operation when token is correct — Task 3 implementation (guard passes through to existing logic)
- ✅ CLAUDE.md Phase 5 note — Task 4
- ✅ Code comment noting limitation — Task 3 Step 3 (PHASE 5 NOTE comment)
- ✅ `.puppeteerrc.cjs` confirmed missing — flagged in session, not in scope

**Placeholder scan:** No TBDs, no "implement later", no "handle edge cases". All code blocks are complete.

**Type consistency:** `isAuthorized(token: string | string[] | undefined, secret: string | undefined): boolean` — matches Express's `req.headers['x-ingest-token']` type (`string | string[] | undefined`) and `process.env.INGEST_SECRET_TOKEN` type (`string | undefined`). Consistent across test file and implementation.
