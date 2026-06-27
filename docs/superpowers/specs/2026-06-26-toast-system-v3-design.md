# Toast System v3 Rebuild — Design Spec

**Date:** 2026-06-26  
**Branch:** chakra-v3-migration  
**Migration step:** Step 6 of 8

---

## Context

Chakra UI v3 removed `useToast`. Toasts are now managed via `createToaster()` (a singleton) and a `<Toaster>` component that must be rendered once at the app root. The `useFeedbackToast` hook has been a no-op stub since Step 1 of the migration — this step restores real toast feedback app-wide.

The snippet-generated `src/components/ui/toaster.tsx` already exists and exports the singleton `toaster` and the `<Toaster>` component. No new infrastructure needs to be created.

---

## Scope

Three files change. No call sites change — `useFeedbackToast`'s external API is preserved exactly.

---

## 1. `src/main.tsx`

Add `<Toaster />` inside `<ChakraProvider value={system}>`, as a sibling to `<AuthProvider>`. It renders into a `<Portal>` internally, so placement in the tree is not order-sensitive.

```tsx
<ChakraProvider value={system}>
  <Toaster />
  <AuthProvider>
    <RouterProvider router={router} />
  </AuthProvider>
</ChakraProvider>
```

Import `Toaster` from `./components/ui/toaster`.

**Constraint:** exactly one `<Toaster>` in the tree — duplicate renders cause duplicate toasts.

---

## 2. `src/hooks/useFeedbackToast.tsx`

Replace the no-op stub with a real implementation using `toaster.create()` from `../components/ui/toaster`.

### Variant mapping

| Method | `type` | `duration` | `closable` | extras |
|---|---|---|---|---|
| `showSuccess(msg)` | `'success'` | 3000 | true | — |
| `showError(msg)` | `'error'` | 4000 | true | — |
| `showAction(msg, { label, onClick })` | `'info'` | 6000 | true | `action: { label, onClick }`, `id: \`action-${msg}\`` |

The `id` on `showAction` prevents duplicate toasts when the user rapidly toggles a heart while logged out.

The hook becomes a plain function (no React hook calls), so it doesn't need to be called inside a component. This is intentional — it simplifies testing and is compatible with the existing call sites, which already call it inside components.

---

## 3. `src/__tests__/useFeedbackToast.test.tsx`

Complete rewrite. The existing test mocks `useToast` from Chakra (invalid in v3).

New approach: mock the toaster module directly.

```ts
vi.mock('../components/ui/toaster', () => ({
  toaster: { create: vi.fn() }
}))
```

Import `toaster` from `../components/ui/toaster` and assert `toaster.create` was called with the right shape for each variant. No `ChakraProvider` wrapper needed — the hook no longer calls any React hook.

### Test cases (one per variant)
1. `showSuccess` → `toaster.create` called with `type: 'success'`, `duration: 3000`, `closable: true`, `title: <msg>`
2. `showError` → `toaster.create` called with `type: 'error'`, `duration: 4000`, `closable: true`, `title: <msg>`
3. `showAction` → `toaster.create` called with `type: 'info'`, `duration: 6000`, `closable: true`, `action: { label, onClick }`, `id: 'action-<msg>'`

---

## Definition of done

- `useFeedbackToast` no longer a stub — `toaster.create` is called on each action
- `<Toaster>` rendered exactly once at the app root
- All three toast variants fire visually in the running app (manual trigger: add/remove a favorite while logged in for success/error; attempt a favorite while logged out for action)
- Full test suite passes (`npm run test`)
- `useFeedbackToast.test.tsx` tests pass with no Chakra mock hacks
