# Phase 6 Design Spec — Favorites + Toast Convention

**Date:** 2026-06-20  
**Status:** Approved

---

## Overview

Two tightly coupled additions:

1. **`useFeedbackToast`** — a shared hook wrapping Chakra's `useToast` with the project's design tokens, establishing a single toast convention for all CRUD actions going forward.
2. **Favorites** — per-user heart toggle on each review card, stored in a Supabase `favorites` table with RLS, with a filter toggle in the counter row.

Everything stays inside `App.tsx` and its sibling functions. No new contexts or routes.

---

## 1. Database

```sql
create table favorites (
  user_id   uuid        references auth.users(id) not null,
  review_id text        references reviews(id)    not null,
  created_at timestamptz default now(),
  primary key (user_id, review_id)
);

alter table favorites enable row level security;

create policy "Users manage their own favorites"
on favorites for all
to authenticated
using  (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

No anon policy — logged-out visitors get zero access.

---

## 2. `useFeedbackToast` hook

**File:** `src/hooks/useFeedbackToast.ts` (new; creates `src/hooks/` directory)

### API

```ts
const { showSuccess, showError, showAction } = useFeedbackToast();
```

| Method        | Signature                                                                   | Chakra `status`   | Duration            | Notes                                               |
| ------------- | --------------------------------------------------------------------------- | ----------------- | ------------------- | --------------------------------------------------- |
| `showSuccess` | `(message: string) => void`                                                 | `success` (green) | 3 000 ms            | Closable                                            |
| `showError`   | `(message: string) => void`                                                 | `error` (red)     | 4 000 ms            | Closable                                            |
| `showAction`  | `(message: string, action: { label: string; onClick: () => void }) => void` | none              | `null` (persistent) | Custom `render` prop; button sits inside toast body |

All toasts: `position: 'bottom-right'`, `isClosable: true`.

The `showAction` toast uses a custom `render` so the button can be styled consistently with the rest of the app (`surface.card` background, `border.default` border). It does not use a Chakra `status` colour — it should look neutral and informational, not alarming.

### Migration of existing refresh-button toast

The inline `toast({...})` call in `App.tsx`'s `handleRefresh` (the 409 "already running" warning) is replaced with a call through `useFeedbackToast`. The exact variant (warning vs error) is decided during implementation when that code is open — it does not block this design.

---

## 3. Favorites state in `App.tsx`

### New state and hooks

```ts
const { user } = useAuth(); // App.tsx adds this import + call
const navigate = useNavigate(); // App.tsx adds this import + call (needed for action-toast button)
const { showSuccess, showError, showAction } = useFeedbackToast(); // replaces direct useToast() call
const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
```

### Hydration effect

```ts
useEffect(() => {
  if (!user) {
    setFavoritedIds(new Set());
    setShowFavoritesOnly(false);
    return;
  }
  supabase
    .from('favorites')
    .select('review_id')
    .then(({ data, error }) => {
      if (!error && data) {
        setFavoritedIds(new Set(data.map((row) => row.review_id)));
      }
    });
}, [user]);
```

RLS restricts the query to the signed-in user's own rows — no `eq('user_id', ...)` filter needed client-side.

### Toggle function

```ts
async function toggleFavorite(reviewId: string) {
  if (!user) {
    showAction('Log in to save favorites', { label: 'Log in', onClick: () => navigate('/login') });
    return;
  }
  const isFavorited = favoritedIds.has(reviewId);
  if (isFavorited) {
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('review_id', reviewId);
    if (error) {
      showError('Could not remove favorite — try again');
      return;
    }
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      next.delete(reviewId);
      return next;
    });
    showSuccess('Removed from favorites');
  } else {
    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: user.id, review_id: reviewId });
    if (error) {
      showError('Could not save favorite — try again');
      return;
    }
    setFavoritedIds((prev) => new Set(prev).add(reviewId));
    showSuccess('Added to favorites');
  }
}
```

**No optimistic update.** The heart icon and toast fire together only after the write confirms. The heart stays in its previous state while the request is in flight.

---

## 4. `ArtworkBlock` — heart icon

### New props

```ts
function ArtworkBlock({
  rev,
  isFavorited,
  onToggle,
}: {
  rev: Review;
  isFavorited: boolean;
  onToggle: () => void;
});
```

### Icon

`react-icons/fa` is added as a dependency:

- `FaHeart` — filled, `color="red.400"` when `isFavorited`
- `FaRegHeart` — outline, `color="whiteAlpha.700"` when not favorited

### Position

`position="absolute" top={2} right={2}` — the one open corner of the artwork square.

### Click handling

The card is wrapped in a Chakra `<Link isExternal>`. The heart must **not** propagate clicks to that link. Use a `<Box as="button">` with `onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}`.

Style the button to be transparent with a slight hover background so it's visible but doesn't look like a badge:

```
bg="blackAlpha.400"
borderRadius="full"
p={1}
_hover={{ bg: "blackAlpha.600" }}
```

---

## 5. Counter row layout change

The current `<Text>` for the review counter becomes a `<Flex justify="space-between" align="center">` row.

**Left side** — unchanged text logic:

- `{filtered.length} of {reviews.length} reviews` when filters are active
- `{reviews.length} reviews` otherwise

**Right side** — visible only when `user` is non-null:

```tsx
<FormControl display="flex" alignItems="center" gap={2}>
  <FormLabel htmlFor="favorites-toggle" mb={0} fontSize="sm" color="text.dim" cursor="pointer">
    Favorites only
  </FormLabel>
  <Switch
    id="favorites-toggle"
    isChecked={showFavoritesOnly}
    onChange={(e) => setShowFavoritesOnly(e.target.checked)}
    colorScheme="teal"
  />
</FormControl>
```

The switch is absent entirely (not just disabled) for logged-out visitors.

---

## 6. CLAUDE.md addition

A new section added to `CLAUDE.md`:

> **Toast feedback convention** — every CRUD action (create/update/delete) shows a toast via `useFeedbackToast()` from `src/hooks/useFeedbackToast.ts`. Logged-out attempts at gated actions show an action-toast with a login button (no hard redirect). See `docs/decisions/favorites.md` for full rationale.

A `docs/decisions/favorites.md` file is created as the post-implementation record (written after implementation, not before).

---

## What does NOT change

- Card layout (band/album heading, genre tags, date, summary)
- Source, score, search, and sort filtering
- Ingest pipeline and `/api/ingest`
- Any route other than `/` (no new routes)

---

## Definition of done

- [ ] Logged out: clicking a heart shows the login-action toast; visitor stays on the page; toast button navigates to `/login`
- [ ] Logged in, favoriting: success toast + filled heart after confirmed write; error toast + heart unchanged on failure
- [ ] Logged in, unfavoriting: success toast + outline heart after confirmed write; error toast + heart unchanged on failure
- [ ] Favorites-only switch visible when logged in, hidden when logged out
- [ ] Switch correctly filters the card grid against `favoritedIds`
- [ ] Refresh button's 409 toast goes through `useFeedbackToast`
- [ ] `useFeedbackToast` is the only `useToast` call site in the codebase
