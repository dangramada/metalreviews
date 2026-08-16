# Session decisions — Phase 6: Favorites + Toast Convention (June 2026)

> **PARTIALLY SUPERSEDED by `album-identity/album-identity-visibility-and-duplicate-fix.md`.** The "composite
> primary key prevents duplicates at the DB level" claim below is stale — no DB-level duplicate
> guard currently exists on `favorites`. The rest of this doc (toast convention, favorites UX
> decisions) is still accurate.

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

## Follow-up — `favorites` no longer has a DB-level duplicate guard (2026-07, album-identity migration)

The "favorites table uses composite primary key" decision above (`PRIMARY KEY (user_id,
review_id)`) is **no longer accurate**. The album-identity migration dropped `review_id`
entirely in favor of `album_id` (`supabase/favorites-add-album-id.sql` +
`supabase/favorites-drop-review-id.sql`) — see `album-identity/album-identity-migration.md`. Critically, **no
replacement unique constraint was added** on `(user_id, album_id)`; the drop-review-id migration
explicitly deferred that ("out of scope; add one only if/when duplicate inserts become an
observed problem"). So the DB-level "insert-on-duplicate is a no-op" guarantee this section
describes does not currently exist for any code path.

This gap was closed at the **application layer**, not the DB layer: see
`album-identity/album-identity-visibility-and-duplicate-fix.md` — `AddAlbumDrawer`'s manual-add flow now checks
`favoritedAlbumIds` (from the current user's already-loaded favorites) before inserting, and
treats "already favorited" as a no-op client-side. The heart-toggle path on the home page
(`src/App.tsx`) doesn't have the same exposure in practice: it always deletes-then-inserts (or
vice versa) as an explicit user action against a specific known `album_id`, not a "does this
already exist" search, but it likewise no longer has any DB-level backstop against a
double-submit race. If that's ever observed as a real problem, the fix belongs at the DB layer
(a real unique constraint), not by re-adding more client-side checks.

## Follow-up — "Favorites only" toggle removed (2026-06-26)

The "Favorites only" Switch in the counter row was removed from `src/App.tsx`. The `showFavoritesOnly` state, its setter, the filter pipeline step, and the `{user && <FormControl>…</FormControl>}` JSX block are all gone. The `Switch`, `FormLabel`, and `FormControl` Chakra imports were removed too.

**Why:** The dedicated `/favorites` route (Phase 7) made the toggle redundant. The toggle also never included manually-added albums (only `reviews` table rows), while the `/favorites` page covers all three sources via `useFavoritesList`. The only thing the toggle uniquely offered — seeing favorited albums alongside critic score badges — was judged not worth the UI clutter.

**What was NOT removed:** `favoritedIds` (the `Set<string>`), its hydration effect, and the heart toggle on cards are all intact. They are still needed for heart fill state on the review grid.

**Revert point:** git tag `pre-remove-favorites-toggle` captures the commit immediately before removal. To restore just the App.tsx changes: `git checkout pre-remove-favorites-toggle -- src/App.tsx`.
