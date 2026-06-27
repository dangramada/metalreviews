# Session decisions — Phase 6: Favorites + Toast Convention (June 2026)

## What was built

- **`useFeedbackToast`** (`src/hooks/useFeedbackToast.tsx`) — wraps Chakra's `useToast` into three named methods: `showSuccess`, `showError`, `showAction`. This is now the only `useToast` call site in the codebase. All CRUD toasts go through it.

- **Favorites** — per-user heart toggle on each review card, stored in a Supabase `favorites` table with RLS. Hearts use `FaHeart`/`FaRegHeart` from `react-icons/fa`.

- **Favorites filter** — "Favorites only" Switch in the counter row (logged-in users only). Filters the in-memory reviews array against `favoritedIds`.

## Key decisions

### useFeedbackToast API shape — three named methods

Chose `showSuccess`, `showError`, `showAction` over a single `show({ variant })` call. Three named methods make each call site immediately readable and TypeScript autocomplete guides correct usage. The `action` variant renders a custom JSX toast (Chakra `render` prop) so a login button can live inside the toast body.

### Logged-out heart click — action toast, no redirect

Logged-out visitors who click a heart see an action toast ("Log in to save favorites") with a "Log in" button. They stay on the page. Hard redirect was rejected: it interrupts the browse experience for something the user may not intend to act on immediately.

### No optimistic update on heart toggle

The heart icon and success toast fire together only after the Supabase write confirms. If the write fails, the heart stays in its previous state and an error toast fires. Optimistic update was rejected: for a non-realtime app, a brief delay is acceptable and avoids the need for rollback logic.

### Favorites state in App.tsx, not a new context

`favoritedIds` and `showFavoritesOnly` live in `App.tsx` state (not a new context) because everything that reads or writes them is already inside App's render tree. `AuthContext` exists because `Header` and auth forms live outside App's tree — favorites doesn't have that problem.

### favorites table uses composite primary key

`PRIMARY KEY (user_id, review_id)` means insert-on-duplicate is a no-op at the DB level, and the RLS policy (`auth.uid() = user_id`) eliminates the need for client-side user_id filters on select queries (though the delete path still passes user_id for defense-in-depth).

## What NOT to change

- The `useFeedbackToast` hook is the single toast call site. Do not add `useToast` calls elsewhere.
- `favoritedIds` is a `Set<string>` updated immutably (always `new Set(prev)`). Do not mutate in place.
- The hydration effect has a stale-closure guard (`let cancelled = false`). Do not remove it.

---

## Follow-up — "Favorites only" toggle removed (2026-06-26)

The "Favorites only" Switch in the counter row was removed from `src/App.tsx`. The `showFavoritesOnly` state, its setter, the filter pipeline step, and the `{user && <FormControl>…</FormControl>}` JSX block are all gone. The `Switch`, `FormLabel`, and `FormControl` Chakra imports were removed too.

**Why:** The dedicated `/favorites` route (Phase 7) made the toggle redundant. The toggle also never included manually-added albums (only `reviews` table rows), while the `/favorites` page covers all three sources via `useFavoritesList`. The only thing the toggle uniquely offered — seeing favorited albums alongside critic score badges — was judged not worth the UI clutter.

**What was NOT removed:** `favoritedIds` (the `Set<string>`), its hydration effect, and the heart toggle on cards are all intact. They are still needed for heart fill state on the review grid.

**Revert point:** git tag `pre-remove-favorites-toggle` captures the commit immediately before removal. To restore just the App.tsx changes: `git checkout pre-remove-favorites-toggle -- src/App.tsx`.
