# Toast System v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the no-op `useFeedbackToast` stub with a real v3 implementation using `createToaster()`, and render `<Toaster>` once at the app root so all toast variants fire visually.

**Architecture:** The snippet-generated `src/components/ui/toaster.tsx` already exports the `toaster` singleton and `<Toaster>` component — no new infrastructure needed. `useFeedbackToast` is rebuilt as a plain function (no React hook calls) that delegates to `toaster.create()`. `<Toaster>` is added to `main.tsx`. The hook's external API (`showSuccess`/`showError`/`showAction`) is unchanged, so no call sites in `App.tsx` or `FavoritesPage.tsx` need editing.

**Tech Stack:** Chakra UI v3 (`createToaster`, `Toast.*` components), React, Vitest, `@testing-library/react`

---

### Task 1: Rewrite `useFeedbackToast.test.tsx` for v3

The existing test mocks `useToast` from Chakra — invalid in v3. Replace the entire file with a test that mocks the `toaster` module directly.

**Files:**
- Modify: `src/__tests__/useFeedbackToast.test.tsx`

- [ ] **Step 1: Replace the test file**

Replace the full contents of `src/__tests__/useFeedbackToast.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFeedbackToast } from '../hooks/useFeedbackToast';

const mockCreate = vi.fn();

vi.mock('../components/ui/toaster', () => ({
  toaster: { create: mockCreate },
}));

describe('useFeedbackToast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('showSuccess calls toaster.create with success type and 3000ms duration', () => {
    const { showSuccess } = useFeedbackToast();
    showSuccess('Added to favorites');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Added to favorites',
        type: 'success',
        duration: 3000,
        closable: true,
      })
    );
  });

  it('showError calls toaster.create with error type and 4000ms duration', () => {
    const { showError } = useFeedbackToast();
    showError('Could not save — try again');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Could not save — try again',
        type: 'error',
        duration: 4000,
        closable: true,
      })
    );
  });

  it('showAction calls toaster.create with info type, 6000ms duration, action, and dedup id', () => {
    const onClick = vi.fn();
    const { showAction } = useFeedbackToast();
    showAction('Log in to save favorites', { label: 'Log in', onClick });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Log in to save favorites',
        type: 'info',
        duration: 6000,
        closable: true,
        action: { label: 'Log in', onClick },
        id: 'action-Log in to save favorites',
      })
    );
  });
});
```

- [ ] **Step 2: Run the new tests — expect FAIL (hook is still a stub)**

```bash
npx vitest run src/__tests__/useFeedbackToast.test.tsx
```

Expected: 3 failures — `mockCreate` is never called because `useFeedbackToast` is still a no-op.

---

### Task 2: Implement `useFeedbackToast` using `toaster.create()`

**Files:**
- Modify: `src/hooks/useFeedbackToast.tsx`

- [ ] **Step 1: Replace the stub with the real implementation**

Replace the full contents of `src/hooks/useFeedbackToast.tsx` with:

```tsx
import { toaster } from '../components/ui/toaster';

export function useFeedbackToast() {
  function showSuccess(message: string) {
    toaster.create({ title: message, type: 'success', duration: 3000, closable: true });
  }

  function showError(message: string) {
    toaster.create({ title: message, type: 'error', duration: 4000, closable: true });
  }

  function showAction(message: string, action: { label: string; onClick: () => void }) {
    toaster.create({
      title: message,
      type: 'info',
      duration: 6000,
      closable: true,
      action,
      id: `action-${message}`,
    });
  }

  return { showSuccess, showError, showAction };
}
```

- [ ] **Step 2: Run the tests — expect PASS**

```bash
npx vitest run src/__tests__/useFeedbackToast.test.tsx
```

Expected: 3 passing tests.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFeedbackToast.tsx src/__tests__/useFeedbackToast.test.tsx
git commit -m "feat: rebuild useFeedbackToast on v3 toaster.create()"
```

---

### Task 3: Add `<Toaster>` to the app root

Without this, `toaster.create()` calls succeed silently but nothing renders on screen.

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add the `Toaster` import and render it inside `ChakraProvider`**

In `src/main.tsx`, add the import at the top (after the existing imports):

```tsx
import { Toaster } from './components/ui/toaster';
```

Then update the render tree — add `<Toaster />` as the first child of `<ChakraProvider value={system}>`:

```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChakraProvider value={system}>
      <Toaster />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ChakraProvider>
  </React.StrictMode>
);
```

- [ ] **Step 2: Run the full test suite — expect no regressions**

```bash
npx vitest run
```

Expected: all tests pass. If `ArtworkBlock.test.tsx` or `App.favorites.test.tsx` fail, check that their `useFeedbackToast` mocks still match the hook's module path (`'../hooks/useFeedbackToast'`) — those mocks are unaffected by this change and should pass unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: render <Toaster> at app root for v3 toast display"
```

---

### Task 4: Manual verification + migration plan update

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Trigger each toast variant and confirm visual display**

| Action | Expected toast |
|---|---|
| While logged in: click a heart to add a favorite | Green success toast: "Added to favorites" |
| While logged in: click a filled heart to remove | Green success toast: "Removed from favorites" |
| While logged out: click any heart | Info toast with "Log in" action button: "Log in to save favorites" |
| Trigger an error (e.g. network failure) | Red error toast |

The success and action variants are easy to trigger manually. For error variants, you can temporarily break the Supabase client key in `.env.local` or just trust the test coverage.

- [ ] **Step 3: Update `CLAUDE.md` — remove the toast stub gap**

In `CLAUDE.md`, find the "⚠️ In-flight: Chakra UI v2 → v3 migration" section. Remove this bullet from the "Known current gaps" list:

> `useFeedbackToast` is a no-op stub — toast feedback is silently broken app-wide (favorites toggle, refresh button, login-prompt toast) until the toast-rebuild step lands. Do NOT "fix" silent toast failures by patching call sites — the fix is the stubbed hook itself, tracked in the migration plan.

Also remove the corresponding note from the "Toast feedback convention" section:

> **⚠️ Currently stubbed — see "In-flight: Chakra v2→v3 migration" at the top of this file.**

Replace it with:

> **Rebuilt for Chakra v3 in Step 6.** `useFeedbackToast` now delegates to `toaster.create()` from `src/components/ui/toaster.tsx`. The `<Toaster>` component is rendered once at the app root in `main.tsx`.

- [ ] **Step 4: Update the migration plan — mark Step 6 complete**

In `docs/decisions/chakra-v3-migration-plan.md`, mark Step 6 as `✅ COMPLETE` and add a verification record:

```markdown
### Step 6 — Toast system — ✅ COMPLETE

**Verification record:**
- `useFeedbackToast` rebuilt using `toaster.create()` from the snippet-generated `src/components/ui/toaster.tsx`
- `<Toaster>` rendered once inside `<ChakraProvider>` in `main.tsx`
- All three variants (`showSuccess`, `showError`, `showAction`) covered by unit tests (grep-confirmed: `toaster.create` mock assertions pass)
- `showSuccess` and `showAction` variants manually verified visually in the running app (heart toggle while logged in; heart click while logged out)
- Full test suite green (`npx vitest run`)
- No call sites changed — external API preserved exactly
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/decisions/chakra-v3-migration-plan.md
git commit -m "docs: mark Step 6 complete, remove toast stub gap from CLAUDE.md"
```
