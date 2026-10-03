# Initial-load efficiency: AOTY / Contenders (2026-10-03)

Branch `perf/initial-load` (from `master` `98d75c8`, baseline 122 files / 986 tests). One concern:
fewer and earlier requests on `/aoty` and `/aoty/contenders`. No user-visible behavior change.

## Findings (from the 2026-10-03 read-only diagnostic)

- `AuthProvider` called `setUser(session?.user)` on every auth event. supabase-js emits
  `INITIAL_SESSION` on subscribe (and `TOKEN_REFRESHED` later) with a freshly parsed `User`, so
  `user` got a new reference. Six effects depend on `user`; the two hooks on these pages
  (`useCalibrationGate`, `useAlbumRatingsSummary`) refired: status, weights, answers, ratings,
  weights, albums-by-id. The old comment saying the callback does not fire on initial load was wrong.
- `useAotyList` reads `aoty`, then `contenders.in(ids)`. `ContendersPage` waited on both but only
  needs the ids.
- `AddToContendersPicker` was always mounted, so `useFavoritesList` fetched on every page load for
  a closed drawer.

## What changed

1. `AuthContext.tsx`: `keepIfSameUser` keeps the previous `User` reference unless `id` or `email`
   changed. Chosen over per-consumer `user.id` deps because every consumer reads only `id` and
   `email` (grep: 27 `user.id`, 1 `user.email`) and one change covers all six dependent effects.
2. `useAotyList`: new `aotyIds` (Set) and `idsLoading`, set after the first request and kept in step
   by `addLocal`/`removeLocal`. `loading`, `items`, generation counter, silent refetch and error
   behavior are unchanged. `ContendersPage` filters on `aotyIds` and gates on
   `contendersLoading || idsLoading`. A failed ids fetch gives `idsLoading=false`, empty set, so
   Contenders shows all candidates and does not stay in loading (hook test plus page test).
   The `ContendersPage` test mock of the hook gained the two new fields.
3. `AddToContendersPicker`: the drawer uses `lazyMount unmountOnExit` and the panel (with
   `useFavoritesList`) is a child of `DrawerContent`, so it mounts on open and unmounts after the
   drawer's own exit animation. Consequences: favorites refetch on each open, and the selection
   resets on close (the explicit reset was removed; content is untouched during the exit
   animation). Loading state inside the drawer already existed and is kept. Hidden set (albums in
   Contenders or AOTY) is unchanged.

Tests: 998/998 (+12), `tsc -b` clean. The exit-animation test stubs `getComputedStyle` to report an
animation and was checked to fail when the stub is off.

## Before / after

Baseline browser numbers were not available when work started, so the precondition was waived by
the owner. Measured figures are **not yet recorded**.

| Metric (production build, Slow 4G, cache off) | Before       | After        |
| --------------------------------------------- | ------------ | ------------ |
| `/aoty/contenders` first row, Network finish  | not measured | not measured |
| `/aoty` first row, Network finish             | not measured | not measured |

Static estimate from the code path (not a measurement): requests per load on `/aoty/contenders`
16 -> 9, on `/aoty` 15 -> 9 (third round of 6 removed; the picker's favorites fetch removed).
Item 2 changes timing only, not count.

Measure: `npx vite build --outDir /tmp/slant-dist && npx vite preview --outDir /tmp/slant-dist --port 4173`,
log in, Slow 4G, cache disabled, record first row and Network finish, count fetch/XHR rows. Check
out `master` for the "before" build.

## Left out (see `deferred-work.md`, 2026-10-03 perf pass)

Artwork loading, virtualization, bundle/route splitting, albums-by-id embed, weights
de-duplication, StrictMode and dev-only slowness.
