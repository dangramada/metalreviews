# Supabase Ingest Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `public/reviews.json` as the ingest write target with a Supabase Postgres table called `reviews`, preserving the existing merge guard that prevents artwork/genre regressions.

**Architecture:** Add `@supabase/supabase-js` + `dotenv`; create a thin `scripts/supabaseClient.ts` module that exports a service-key client; modify `runIngestion()` to read existing rows from Supabase instead of the JSON file and upsert merged results back instead of writing the file. The merge guard logic (never regress `artworkUrl` from string→null or `genre` from non-empty→empty) is extracted into a pure, testable `applyMergeGuard` function before the I/O swap.

**Tech Stack:** `@supabase/supabase-js` v2, `dotenv`, Vitest (existing), TypeScript / tsx

---

## File Map

| Action | Path                               | Responsibility                                      |
| ------ | ---------------------------------- | --------------------------------------------------- |
| Create | `scripts/supabaseClient.ts`        | Build and export the Supabase service-key client    |
| Create | `src/__tests__/mergeGuard.test.ts` | Unit tests for merge guard pure function            |
| Modify | `scripts/ingest.ts`                | Extract merge guard; swap file I/O for Supabase I/O |
| Modify | `package.json`                     | Add `@supabase/supabase-js` + `dotenv` deps         |

---

## Task 1: Install dependencies

**Files:**

- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the packages**

```bash
npm install @supabase/supabase-js dotenv
```

- [ ] **Step 2: Verify they appear in package.json `dependencies`**

```bash
node -e "const p = require('./package.json'); console.log(p.dependencies['@supabase/supabase-js'], p.dependencies['dotenv'])"
```

Expected: two semver strings printed, not `undefined`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @supabase/supabase-js and dotenv deps"
```

---

## Task 2: Create the Supabase client module

**Files:**

- Create: `scripts/supabaseClient.ts`

- [ ] **Step 1: Write the file**

```typescript
// scripts/supabaseClient.ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import type { MetalReview } from '../src/types';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables. ' +
      'Add them to .env in the project root.'
  );
}

// Service key bypasses RLS — only use in server-side / ingest code, never in the frontend.
export const supabase = createClient<{ public: { Tables: { reviews: { Row: MetalReview } } } }>(
  url,
  key
);
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to the new file).

- [ ] **Step 3: Commit**

```bash
git add scripts/supabaseClient.ts
git commit -m "feat: add Supabase service-key client module"
```

---

## Task 3: Extract applyMergeGuard and write unit tests

The merge guard logic currently lives inline inside `runIngestion()` at lines 467–480 of `scripts/ingest.ts`. Extracting it as a pure function makes it testable without touching Supabase.

**Files:**

- Modify: `scripts/ingest.ts` (extract function, export it)
- Create: `src/__tests__/mergeGuard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/mergeGuard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyMergeGuard } from '../../scripts/ingest';
import type { MetalReview } from '../types';

const base: MetalReview = {
  id: 'abc',
  source: 'Angry Metal Guy',
  band: 'Opeth',
  album: 'Blackwater Park',
  genre: ['progressive metal', 'death metal'],
  score: '9/10',
  normalizedScore: 90,
  summary: 'Great album',
  url: 'https://example.com',
  publishedAt: '2024-01-01T00:00:00.000Z',
  publishedDate: '01 Jan 2024',
  artworkUrl: 'https://cdn.example.com/art.jpg',
};

describe('applyMergeGuard', () => {
  it('uses fresh artworkUrl when it is a non-null string', () => {
    const fresh = { ...base, artworkUrl: 'https://new.example.com/art.jpg' };
    const existing = new Map([['abc', { ...base, artworkUrl: 'https://old.example.com/art.jpg' }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.artworkUrl).toBe('https://new.example.com/art.jpg');
  });

  it('keeps existing artworkUrl when fresh artworkUrl is null', () => {
    const fresh = { ...base, artworkUrl: null };
    const existing = new Map([['abc', { ...base, artworkUrl: 'https://old.example.com/art.jpg' }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.artworkUrl).toBe('https://old.example.com/art.jpg');
  });

  it('uses null artworkUrl when fresh is null and there is no existing row', () => {
    const fresh = { ...base, id: 'new-id', artworkUrl: null };
    const existing = new Map<string, MetalReview>();
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.artworkUrl).toBeNull();
  });

  it('uses fresh genre when it is non-empty', () => {
    const fresh = { ...base, genre: ['doom metal'] };
    const existing = new Map([['abc', { ...base, genre: ['progressive metal'] }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.genre).toEqual(['doom metal']);
  });

  it('keeps existing genre when fresh genre is empty', () => {
    const fresh = { ...base, genre: [] };
    const existing = new Map([['abc', { ...base, genre: ['progressive metal', 'death metal'] }]]);
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.genre).toEqual(['progressive metal', 'death metal']);
  });

  it('uses empty genre when fresh is empty and there is no existing row', () => {
    const fresh = { ...base, id: 'new-id', genre: [] };
    const existing = new Map<string, MetalReview>();
    const [result] = applyMergeGuard(existing, [fresh]);
    expect(result.genre).toEqual([]);
  });

  it('preserves existing rows not present in fresh results', () => {
    const oldReview = { ...base, id: 'old-only', band: 'Candlemass', album: 'Epicus' };
    const fresh = [{ ...base, id: 'fresh-only', band: 'Paradise Lost', album: 'Gothic' }];
    const existing = new Map([['old-only', oldReview]]);
    const result = applyMergeGuard(existing, fresh);
    expect(result.some((r) => r.id === 'old-only')).toBe(true);
    expect(result.some((r) => r.id === 'fresh-only')).toBe(true);
  });

  it('sorts output by publishedAt descending', () => {
    const older = { ...base, id: 'older', publishedAt: '2024-01-01T00:00:00.000Z' };
    const newer = { ...base, id: 'newer', publishedAt: '2024-06-01T00:00:00.000Z' };
    const result = applyMergeGuard(new Map(), [older, newer]);
    expect(result[0].id).toBe('newer');
    expect(result[1].id).toBe('older');
  });
});
```

- [ ] **Step 2: Run tests — expect failures (applyMergeGuard not exported yet)**

```bash
npx vitest run src/__tests__/mergeGuard.test.ts
```

Expected: FAIL with "applyMergeGuard is not a function" or similar import error.

- [ ] **Step 3: Extract applyMergeGuard from runIngestion() in scripts/ingest.ts**

Find the current inline merge block in `runIngestion()` (approximately lines 462–480):

```typescript
// Merge fresh results into the existing map — upsert by id ...
const merged = new Map(existingById);
for (const review of final) {
  const existing = merged.get(review.id);
  merged.set(review.id, {
    ...existing,
    ...review,
    artworkUrl: review.artworkUrl ?? existing?.artworkUrl ?? null,
    genre: review.genre && review.genre.length > 0 ? review.genre : (existing?.genre ?? []),
  });
}
const output = Array.from(merged.values()).sort(
  (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
);
```

Replace the whole block (both the merge loop and the output sort) with a call to the new function, and add the function definition above `runIngestion`:

```typescript
export function applyMergeGuard(
  existingById: Map<string, MetalReview>,
  freshReviews: MetalReview[]
): MetalReview[] {
  const merged = new Map(existingById);
  for (const review of freshReviews) {
    const existing = merged.get(review.id);
    merged.set(review.id, {
      ...existing,
      ...review,
      artworkUrl: review.artworkUrl ?? existing?.artworkUrl ?? null,
      genre: review.genre && review.genre.length > 0 ? review.genre : (existing?.genre ?? []),
    });
  }
  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}
```

And in `runIngestion()`, replace the extracted block with:

```typescript
const output = applyMergeGuard(merged, final);
```

Wait — `merged` was previously built as `new Map(existingById)` before the loop. Now that the loop is inside `applyMergeGuard`, pass `existingById` directly:

```typescript
const output = applyMergeGuard(existingById, final);
```

The `const merged = new Map(existingById)` line and the for-loop and the `const output = ...` sort line are all replaced by this single line.

- [ ] **Step 4: Run tests — expect all to pass**

```bash
npx vitest run src/__tests__/mergeGuard.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/ingest.ts src/__tests__/mergeGuard.test.ts
git commit -m "refactor: extract applyMergeGuard as testable pure function, add unit tests"
```

---

## Task 4: Replace file read with Supabase select

**Files:**

- Modify: `scripts/ingest.ts`

The current `runIngestion()` opens with:

```typescript
const outPath = path.resolve(process.cwd(), 'public', 'reviews.json');
await fs.mkdir(path.dirname(outPath), { recursive: true });

let existingReviews: MetalReview[] = [];
try {
  const raw = await fs.readFile(outPath, 'utf-8');
  existingReviews = JSON.parse(raw);
} catch {
  // file missing or invalid JSON — start fresh
}
```

- [ ] **Step 1: Add Supabase client import at the top of scripts/ingest.ts**

Add this import alongside the existing imports (after the existing `import` block):

```typescript
import { supabase } from './supabaseClient';
```

- [ ] **Step 2: Replace the file-read block**

Remove:

```typescript
const outPath = path.resolve(process.cwd(), 'public', 'reviews.json');
await fs.mkdir(path.dirname(outPath), { recursive: true });

let existingReviews: MetalReview[] = [];
try {
  const raw = await fs.readFile(outPath, 'utf-8');
  existingReviews = JSON.parse(raw);
} catch {
  // file missing or invalid JSON — start fresh
}
```

Replace with:

```typescript
// Fetch all existing rows from Supabase to build skip-sets and the merge map.
// A read failure is non-fatal — we start fresh rather than aborting the entire run.
let existingReviews: MetalReview[] = [];
try {
  const { data, error } = await supabase.from('reviews').select('*');
  if (error) throw error;
  existingReviews = data ?? [];
} catch (e) {
  console.warn('Failed to fetch existing reviews from Supabase, starting fresh:', e);
}
```

- [ ] **Step 3: Remove unused imports**

The `import { promises as fs } from 'fs'` and `import path from 'path'` imports are now unused. Remove them. Keep all other imports.

- [ ] **Step 4: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest.ts
git commit -m "feat: read existing reviews from Supabase instead of reviews.json"
```

---

## Task 5: Replace file write with Supabase upsert

**Files:**

- Modify: `scripts/ingest.ts`

The current `runIngestion()` ends with:

```typescript
await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');
console.log('✅ Ingestion completed, written', output.length, 'reviews to', outPath);
```

- [ ] **Step 1: Replace the file-write with a Supabase upsert**

Remove the `fs.writeFile` call and the log line. Replace with:

```typescript
const { error: upsertError } = await supabase.from('reviews').upsert(output, { onConflict: 'id' });
if (upsertError) {
  throw new Error(`Failed to upsert reviews to Supabase: ${upsertError.message}`);
}
console.log('✅ Ingestion completed, upserted', output.length, 'reviews to Supabase');
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass. (Tests don't hit Supabase — they only test extractors and the pure merge guard function.)

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest.ts
git commit -m "feat: upsert reviews to Supabase instead of writing reviews.json"
```

---

## Task 6: Manual acceptance test

**No code changes in this task — verify correctness of the full pipeline.**

- [ ] **Step 1: Run ingest once**

```bash
npm run ingest
```

Wait for completion (it will make MusicBrainz calls with 1-second sleeps — expect several minutes). Watch for the `✅ Ingestion completed, upserted N reviews to Supabase` log line. Any `Failed to upsert` error is a failure.

- [ ] **Step 2: Note artworkUrl and genre values for a few known reviews**

In Supabase Studio (or `psql`), run:

```sql
SELECT id, band, album, "artworkUrl", genre
FROM reviews
WHERE "artworkUrl" IS NOT NULL
  AND genre != '{}'
LIMIT 5;
```

Record the results (id, artworkUrl, genre) for 5 reviews.

- [ ] **Step 3: Run ingest a second time**

```bash
npm run ingest
```

Wait for completion again.

- [ ] **Step 4: Verify no regression**

Re-run the same SQL. Compare results to Step 2.

- Assert: `artworkUrl` values are identical between run 1 and run 2 for the same IDs. No row should have `artworkUrl` regressed from a string to NULL.
- Assert: `genre` values are identical between run 1 and run 2 for the same IDs. No row should have `genre` regressed from a non-empty array to `{}`.

If both assertions hold, the merge guard is working correctly through Supabase.

- [ ] **Step 5: Final commit (if any cleanup needed)**

If any lint/format issues were introduced, fix and commit:

```bash
npm run lint:fix
npm run format
git add -A
git commit -m "chore: lint and format after Supabase migration"
```

---

## Self-Review

### Spec coverage

| Requirement                                                 | Covered by                                     |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Install @supabase/supabase-js                               | Task 1                                         |
| Supabase client using SUPABASE_URL + SUPABASE_SECRET_KEY    | Task 2                                         |
| Service key (bypasses RLS)                                  | Task 2 — documented in comment                 |
| Replace fs.writeFile with Supabase write                    | Task 5                                         |
| Pre-fetch existing rows for merge guard                     | Task 4 — fetched upfront, same map used        |
| artworkUrl merge guard: prefer fresh, fall back to existing | Task 3 — tested, logic preserved               |
| genre merge guard: prefer non-empty, fall back to existing  | Task 3 — tested, logic preserved               |
| Use .upsert with onConflict: 'id'                           | Task 5                                         |
| No blind upsert without pre-fetch                           | Task 4 reads first, Task 5 merges then upserts |
| RSS fetching, rating extraction, MB calls unchanged         | Not touched                                    |
| computeId() unchanged                                       | Not touched                                    |
| Frontend unchanged                                          | Not touched                                    |
| server.ts unchanged                                         | Not touched                                    |
| Acceptance test (2 consecutive runs, no regression)         | Task 6                                         |

### Placeholder scan

No TBDs, no "handle appropriately", no missing code blocks.

### Type consistency

- `applyMergeGuard(existingById: Map<string, MetalReview>, freshReviews: MetalReview[]): MetalReview[]` — used consistently in Task 3 definition and Task 3 call site.
- Supabase `from('reviews').select('*')` returns rows typed as `MetalReview` via the generic on `createClient` in Task 2. If Supabase returns snake_case column names (because Postgres lowercases unquoted identifiers), a runtime type mismatch will surface in Task 6 Step 1 — fix by aliasing columns in the select or renaming them in the Supabase schema editor to match the camelCase field names in `MetalReview`.
