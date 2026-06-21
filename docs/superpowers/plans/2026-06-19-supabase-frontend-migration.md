# Frontend Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `fetch('/reviews.json')` with Supabase queries in `App.tsx` so the frontend reads live data from the same Postgres table the ingest pipeline writes to, and fix the refresh button's post-ingest reload.

**Architecture:** Extract the existing `fromDbRow` / `DbRow` mapping from `scripts/ingest.ts` into `src/dbMapping.ts` (shared boundary layer), create a frontend Supabase client using `VITE_` env vars, then update both the initial load and the refresh polling in `App.tsx` to call Supabase directly. The polling detection mechanism (via `/api/ingest/status`) is already correct and stays untouched; only the final data reload changes.

**Tech Stack:** React, `@supabase/supabase-js` (already installed), Vite (`import.meta.env` for env vars), TypeScript, Vitest

---

## File Map

| Action | File                              | Responsibility                                                                               |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Create | `src/dbMapping.ts`                | `DbRow` type + `fromDbRow()` — the single source of truth for snake_case → camelCase mapping |
| Modify | `scripts/ingest.ts`               | Remove local `DbRow`/`fromDbRow`, import from `src/dbMapping.ts`                             |
| Create | `src/supabaseClient.ts`           | Frontend-only Supabase client using `import.meta.env.VITE_*`                                 |
| Modify | `src/App.tsx`                     | Replace `fetch('/reviews.json')` with Supabase query in initial load and refresh reload      |
| Create | `src/__tests__/dbMapping.test.ts` | Unit tests for `fromDbRow` (pure function, easy to verify)                                   |

---

## Task 1: Extract DbRow / fromDbRow into src/dbMapping.ts

**Files:**

- Create: `src/dbMapping.ts`
- Test: `src/__tests__/dbMapping.test.ts`

The `fromDbRow` function currently lives in `scripts/ingest.ts` (line 45) and is not exported. The frontend needs the same mapping. Keeping a single copy in `src/dbMapping.ts` prevents the two codepaths from drifting silently.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/dbMapping.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { fromDbRow } from '../dbMapping';
import type { DbRow } from '../dbMapping';

const row: DbRow = {
  id: 'abc123',
  band: 'Opeth',
  album: 'Blackwater Park',
  source: 'Angry Metal Guy',
  score: '9/10',
  normalized_score: 90,
  summary: 'A landmark album.',
  url: 'https://example.com/review',
  published_at: '2024-01-15T00:00:00.000Z',
  published_date: '15 Jan 2024',
  artwork_url: 'https://cdn.example.com/art.jpg',
  genre: ['progressive metal', 'death metal'],
};

describe('fromDbRow', () => {
  it('maps all snake_case fields to camelCase', () => {
    const review = fromDbRow(row);
    expect(review.id).toBe('abc123');
    expect(review.normalizedScore).toBe(90);
    expect(review.publishedAt).toBe('2024-01-15T00:00:00.000Z');
    expect(review.publishedDate).toBe('15 Jan 2024');
    expect(review.artworkUrl).toBe('https://cdn.example.com/art.jpg');
    expect(review.genre).toEqual(['progressive metal', 'death metal']);
  });

  it('fills nullable fields with safe defaults', () => {
    const sparse: DbRow = {
      ...row,
      score: null,
      normalized_score: null,
      summary: null,
      url: null,
      published_at: null,
      published_date: null,
      artwork_url: null,
      genre: null,
    };
    const review = fromDbRow(sparse);
    expect(review.score).toBe('');
    expect(review.normalizedScore).toBe(0);
    expect(review.summary).toBe('');
    expect(review.url).toBe('');
    expect(review.genre).toEqual([]);
    expect(review.artworkUrl).toBeNull();
  });

  it('sets publishedAt to current time when published_at is null', () => {
    const before = Date.now();
    const review = fromDbRow({ ...row, published_at: null });
    const after = Date.now();
    const reviewTime = new Date(review.publishedAt).getTime();
    expect(reviewTime).toBeGreaterThanOrEqual(before);
    expect(reviewTime).toBeLessThanOrEqual(after);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails (file doesn't exist yet)**

```bash
npx vitest run src/__tests__/dbMapping.test.ts
```

Expected: FAIL — `Cannot find module '../dbMapping'`

- [ ] **Step 3: Create src/dbMapping.ts**

```typescript
// src/dbMapping.ts
//
// Shared boundary layer between Postgres (snake_case) and the app's MetalReview type (camelCase).
// Used by: scripts/ingest.ts (reading existing rows from Supabase before merge)
//          src/App.tsx (mapping query results before touching React state)
//
// Never import dotenv or server-only deps here — this file runs in both Node and browser.

import type { MetalReview } from './types';

// Mirrors the exact column names and types in the Supabase `reviews` table.
export type DbRow = {
  id: string;
  band: string;
  album: string;
  source: string;
  score: string | null;
  normalized_score: number | null;
  summary: string | null;
  url: string | null;
  published_at: string | null;
  published_date: string | null;
  artwork_url: string | null;
  genre: string[] | null;
};

export function fromDbRow(row: DbRow): MetalReview {
  return {
    id: row.id,
    band: row.band,
    album: row.album,
    source: row.source,
    score: row.score ?? '',
    normalizedScore: row.normalized_score ?? 0,
    summary: row.summary ?? '',
    url: row.url ?? '',
    publishedAt: row.published_at ?? new Date().toISOString(),
    publishedDate: row.published_date ?? '',
    artworkUrl: row.artwork_url,
    genre: row.genre ?? [],
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/__tests__/dbMapping.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/dbMapping.ts src/__tests__/dbMapping.test.ts
git commit -m "feat: extract fromDbRow/DbRow into shared src/dbMapping.ts"
```

---

## Task 2: Update scripts/ingest.ts to import from src/dbMapping.ts

**Files:**

- Modify: `scripts/ingest.ts`

Remove the local `DbRow` type and `fromDbRow` function (lines 13–60) and replace them with imports from `src/dbMapping.ts`. `toDbRow` stays in `ingest.ts` since only the ingest script writes to the DB.

- [ ] **Step 1: Update imports in scripts/ingest.ts**

At the top of `scripts/ingest.ts`, add:

```typescript
import { fromDbRow, type DbRow } from '../src/dbMapping';
```

- [ ] **Step 2: Remove the local DbRow type and fromDbRow function**

Delete lines 13–60 in `scripts/ingest.ts` (the `export type DbRow = { ... }` block and `function fromDbRow(...): MetalReview { ... }` block). The `toDbRow` function (currently right after `fromDbRow`) stays.

After deletion, the top of the file should flow:

```typescript
import RSSParser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';
import cron from 'node-cron';
import puppeteer from 'puppeteer';
import { MetalReview } from '../src/types';
import { fromDbRow, type DbRow } from '../src/dbMapping';
import { extractRating } from '../src/scraper/angrymetal.js';
import { extractRating as extractPSRating } from '../src/scraper/progressivesubway';
import { extractRating as extractMSRating } from '../src/scraper/metalstorm';
import { supabase } from './supabaseClient';

export type { DbRow };  // re-export so existing consumers (seed script etc.) don't break

export function toDbRow(r: MetalReview): DbRow {
  // ... (unchanged)
```

- [ ] **Step 3: Run all tests to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests PASS (mergeGuard tests import `applyMergeGuard` from `scripts/ingest.ts` which is still there)

- [ ] **Step 4: TypeScript check**

```bash
npm run type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest.ts
git commit -m "refactor: import fromDbRow/DbRow from src/dbMapping instead of local definition"
```

---

## Task 3: Create the frontend Supabase client

**Files:**

- Create: `src/supabaseClient.ts`

This is a separate client from `scripts/supabaseClient.ts`. It uses the **publishable** (anon) key — safe to expose in browser bundles. Vite only injects env vars prefixed `VITE_` into browser code; the values already exist in `.env`.

- [ ] **Step 1: Create src/supabaseClient.ts**

```typescript
// src/supabaseClient.ts
//
// Frontend-only Supabase client. Uses the publishable (anon) key — safe to bundle
// into browser code. Vite exposes these via import.meta.env at build time.
//
// Do NOT use the secret key (SUPABASE_SECRET_KEY) here — it bypasses RLS and
// must never ship to the browser. That key lives in scripts/supabaseClient.ts only.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  // This fires at module load time in development — catches a missing VITE_ prefix
  // silently producing `undefined` rather than waiting for the first query to fail.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. ' +
      'Check that both are set in .env and prefixed with VITE_.'
  );
}

export const supabase = createClient(url, key);
```

- [ ] **Step 2: TypeScript check**

```bash
npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/supabaseClient.ts
git commit -m "feat: add frontend Supabase client using VITE_ env vars"
```

---

## Task 4: Replace initial data load in App.tsx with Supabase query

**Files:**

- Modify: `src/App.tsx`

The `useEffect` on mount (lines 291–304) currently does `fetch('/reviews.json')`. Replace it with a Supabase `.select('*')` query. Apply `fromDbRow` immediately so the rest of `App.tsx` — all filtering, sorting, and rendering — is completely untouched.

- [ ] **Step 1: Add imports at the top of src/App.tsx**

After the existing imports block, add:

```typescript
import { supabase } from './supabaseClient';
import { fromDbRow } from './dbMapping';
import type { DbRow } from './dbMapping';
```

- [ ] **Step 2: Replace the useEffect data load**

Find the `useEffect` block (starts around line 291):

```typescript
useEffect(() => {
  fetch('/reviews.json')
    .then((r) => r.json())
    .then((data) => {
      setReviews(data);
      setLoading(false);
    })
    .catch((e) => {
      console.warn('Failed to load reviews', e);
      setLoading(false);
    });
}, []);
```

Replace with:

```typescript
useEffect(() => {
  supabase
    .from('reviews')
    .select('*')
    .order('published_at', { ascending: false })
    .then(({ data, error }) => {
      if (error) {
        console.warn('Failed to load reviews from Supabase', error);
      } else {
        setReviews((data as DbRow[]).map(fromDbRow));
      }
      setLoading(false);
    });
}, []);
```

- [ ] **Step 3: TypeScript check**

```bash
npm run type-check
```

Expected: no errors

- [ ] **Step 4: Smoke test — start dev server and confirm cards load**

```bash
npm run dev
```

Open http://localhost:5173 in a browser. Verify:

- Spinner shows briefly, then cards appear
- Band names, album titles, artwork, genre tags, and scores display correctly
- No console errors about `VITE_SUPABASE_URL` or undefined

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: load reviews from Supabase instead of reviews.json on initial mount"
```

---

## Task 5: Fix refresh polling — reload from Supabase after ingest completes

**Files:**

- Modify: `src/App.tsx`

The polling loop already correctly detects ingest completion via `GET /api/ingest/status`. The broken part is what happens when `status === 'idle'`: it currently does `fetch('/reviews.json')` to reload data. Replace that one reload with the same Supabase query used in Task 4.

Find this block inside `handleRefresh` (the `if (status === 'idle')` branch, around lines 264–271):

```typescript
if (status === 'idle') {
  // Ingest is done — fetch the latest reviews.json once and reload the card grid.
  clearInterval(pollId);
  const data: Review[] = await fetch('/reviews.json').then((r) => r.json());
  setReviews(data);
  setRefreshState('success');
  setTimeout(() => setRefreshState('idle'), 3000);
}
```

- [ ] **Step 1: Replace the reviews.json reload with a Supabase query**

```typescript
if (status === 'idle') {
  clearInterval(pollId);
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .order('published_at', { ascending: false });
  if (!error && data) {
    setReviews((data as DbRow[]).map(fromDbRow));
  }
  setRefreshState('success');
  setTimeout(() => setRefreshState('idle'), 3000);
}
```

- [ ] **Step 2: TypeScript check**

```bash
npm run type-check
```

Expected: no errors

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 4: End-to-end test of refresh button**

With `npm run dev` running:

1. Open http://localhost:5173 and note the current number of reviews displayed.
2. Click the Refresh button — it should show "Refreshing…" with a spinner.
3. Wait for the ingest to complete (can take a few minutes due to MusicBrainz rate limiting). The server terminal will print `✅ Ingestion completed`.
4. The button should switch to "Done" with a checkmark, then reset to "Refresh" after 3 seconds.
5. The card grid should update with any new reviews without a page reload.
6. No spinner stuck — if the button stays on "Refreshing…" beyond 5 minutes, something went wrong.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "fix: reload reviews from Supabase after ingest completes (closes refresh button broken state)"
```

---

## Task 6: Optional cleanup — delete public/reviews.json

**Files:**

- Delete: `public/reviews.json` (if it exists — check first)

Neither the ingest pipeline nor the frontend reads this file anymore. Deleting it removes the risk of confusion about which data source is authoritative.

- [ ] **Step 1: Check if the file exists**

```bash
ls public/reviews.json
```

If it exists, proceed. If not, skip this task.

- [ ] **Step 2: Delete the file**

```bash
git rm public/reviews.json
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove stale public/reviews.json (frontend now reads from Supabase)"
```

---

## Self-Review

### Spec coverage

| Spec requirement                                                      | Covered by                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| New frontend Supabase client using `VITE_` env vars                   | Task 3                                                 |
| Fail loudly on missing `VITE_` prefix                                 | Task 3 — `throw new Error(...)` at module load         |
| Replace initial `fetch('/reviews.json')` with Supabase `.select('*')` | Task 4                                                 |
| snake_case → camelCase mapping reused / not duplicated                | Tasks 1–2 (extracted into `src/dbMapping.ts`)          |
| Mapping applied before data touches React state                       | Task 4 — `.map(fromDbRow)` immediately on query result |
| All filter / sort / search logic untouched                            | Tasks 4–5 don't touch those lines                      |
| Fix refresh polling's final data reload                               | Task 5                                                 |
| No console errors about undefined env vars                            | Task 3 — guard throws at module load in dev            |
| Definition of done: app loads from Supabase                           | Task 4 step 4                                          |
| Definition of done: refresh button detects completion and updates UI  | Task 5 step 4                                          |

### Placeholder scan

No TBD, TODO, "implement later", or vague "add error handling" phrases. All code blocks are complete.

### Type consistency

- `DbRow` defined in `src/dbMapping.ts` — used in `scripts/ingest.ts`, `src/App.tsx`, and tests as `DbRow`
- `fromDbRow` defined in `src/dbMapping.ts` — imported by same files under same name
- `supabase` from `src/supabaseClient.ts` — imported in `src/App.tsx` only
- `Review` interface in `App.tsx` matches `MetalReview` fields used by `fromDbRow` output ✓
