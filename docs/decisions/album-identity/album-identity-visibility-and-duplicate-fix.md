# Home-page visibility filter + duplicate-check scope verification (July 2026)

Two independent, small fixes on top of the four-session album-identity restructure
(`album-identity-migration.md`, `album-identity-ingest.md`,
`album-identity-frontend-homepage.md`, `album-identity-frontend-favorites.md`).

## Item 1 — `findExistingAlbum()` scope: verified, not a bug; two match-found cases were conflated

### The scope question

The exact query `findExistingAlbum()` (`src/FavoritesPage.tsx`) runs, unchanged by this session:

```ts
supabase.from('albums').select(ALBUM_MATCH_SELECT).eq('mb_release_group_id', releaseGroupId).maybeSingle();
// falls back to:
supabase.from('albums').select(ALBUM_MATCH_SELECT).eq('norm_key', normKey).maybeSingle();
```

**Confirmed: no `created_by`, `user_id`, or any per-user scope anywhere in this chain.** It is a
single `.eq()` against a global column (`mb_release_group_id` or `norm_key`), checked against
every row in `albums` regardless of who created it or which source (ingest vs. any user's manual
add) touched it first. This was already correct — no fix needed to the query itself. Re-verified
with an explicit test (`src/__tests__/FavoritesPage.test.tsx`, "finds an existing album's row via
mb_release_group_id with no created_by/user_id scoping") asserting the `.eq()` spy is called
exactly once, with only the identity column — not chained with a second `.eq()` for any user
column.

### What *was* conflated: the two match-found outcomes

Before this session, any `existingMatch` (regardless of whether the current user already had it
favorited) took the same path: same notice copy ("already in your collection... will add it to
your favorites"), and `handleConfirm` always ran a `favorites` insert. Since `favorites` has no
unique constraint on `(user_id, album_id)` (by design — see
`supabase/favorites-drop-review-id.sql`), a user re-adding an album they'd already favorited
would silently create a second `favorites` row for the same album.

Fixed by threading `favoritedAlbumIds` (a `Set<string>` built from `useFavoritesList`'s
already-loaded, RLS-scoped `items` — no extra query) into `AddAlbumDrawer` as a prop:

- **Match found, not yet favorited by this user** (an ingest-reviewed album, or another user's
  manual add): no notice at all — the user doesn't need to know or care that the album row
  already existed in the app's data; the preview just shows the existing album's real info as
  usual. `handleConfirm` proceeds as before — `favorites` insert only, no new `albums` row.
- **Match found, already favorited by this user**: a notice reads "Already in your favorites".
  `handleConfirm` short-circuits before `setSaving`: no `albums` insert, no `favorites` insert,
  just a `showSuccess` acknowledgement, draft clear, and close — a genuine no-op rather than a
  silent duplicate insert or a surprise error.

Both branches covered in `FavoritesPage.test.tsx` (mocked `supabase.from`, mocked
`/api/manual-album-lookup` fetch, drives the real lookup → preview → confirm flow through
`FavoritesPage`, not just the drawer in isolation).

## Item 2 — home page showed every `albums` row, including zero-review manual adds

### The bug

`ALBUMS_WITH_REVIEWS_SELECT` (`src/App.tsx`) embedded `reviews` as a left join
(`reviews(...)`), so `albums` rows with zero attached reviews — e.g. manually-added albums from
`/favorites`'s `AddAlbumDrawer` — came back on the public, unauthenticated home page,
indistinguishable from actual critic-reviewed content. Confirmed live: "Blind Guardian –
Imaginations From The Other Side" (added during the `/favorites` session's live verification,
see `album-identity-frontend-favorites.md`) rendered as a full album-info-only card on `/`.

### The fix

Changed the embed to an inner join: `reviews!inner(...)`. PostgREST/Supabase only returns a
parent row when the inner-joined child has at least one match, so any `albums` row with zero
reviews is excluded at the database level — no client-side filtering, no `created_by` check
(irrelevant to this rule; it's purely "has reviews", so an ingest-created album with zero reviews
— shouldn't normally happen, but isn't special-cased either way — would be excluded the same as
a manual add). Both call sites (initial load, post-refresh reload) share the one constant, so
both are covered by the single change.

If a manually-added album later gets picked up by a real source (ingest's `resolveAlbumIdentity`
attaches a review to that existing row), it starts appearing on the home page automatically at
the next load — no special-casing needed, since the filter is re-evaluated fresh every query.

`/favorites` is untouched — `useFavoritesList`'s own separate query has no such filter and
correctly keeps showing manual adds regardless of review count.

The zero-review branch in the card-rendering logic (`AlbumCard` handling `reviews.length === 0`
as an album-info-only card, in `src/App.tsx`) is now unreachable via the home page's own query —
left in place rather than removed, since it's harmless and removing it wasn't asked for.

### Live verification

Ran the real dev server against the live Supabase project:

- Home page (`/`) loaded 135 reviews; no card for "Blind Guardian" or "Imaginations" anywhere in
  the rendered page text (the only occurrence of "Blind Guardian" was an unrelated mention inside
  another review's summary text, not an album card).
- Confirmed directly against the database (service-role query) that the album row still exists
  (`created_by` set, `reviews: []`) and still has a `favorites` row for the user who added it —
  i.e. it continues to exist and would still render on `/favorites` (that page's query is
  untouched by this session; not re-verified via UI login in this session, since no test
  credentials were available, but the query path itself was not modified).

New test added (`App.favorites.test.tsx`): asserts the `albums` query's `select()` string
contains `reviews!inner(`.

## Definition of done — status

- [x] Item 1: exact `findExistingAlbum()` query reported; confirmed already unscoped (no fix
      needed to the query); re-verified with an explicit test asserting no second `.eq()` /
      user-scoping column
- [x] Item 1: the two match-found cases distinguished — separate copy, and a genuine no-op
      (no insert at all) when the current user already has the album favorited
- [x] Item 2: home-page query filters to reviewed albums only (`reviews!inner`)
- [x] Item 2: verified live — Blind Guardian no longer appears on the home page; confirmed via
      direct DB query that the row (and its favorite) still exists, so `/favorites` (unmodified
      query) continues to show it
- [x] Full test suite green: 159/159
- [x] This doc; `CLAUDE.md` index updated

## What this session did NOT do

- Did not touch `/favorites`, `useFavoritesList`, or any part of `AddAlbumDrawer`'s insert logic
  beyond the notice-text/no-op change in Item 1.
- Did not build the live-autocomplete feature (separate, already-named follow-up).
- Did not remove or alter the Blind Guardian album/favorite row — it remains real data; only
  whether it appears on the dashboard changed, not whether it exists.
- Did not remove the now-unreachable zero-review card-rendering branch in `src/App.tsx` — kept
  as harmless defensive code, not in scope.

## Follow-up (July 2026, later the same month): "missing favorite" bug report — diagnosis was wrong, real cause found

A bug report came in: `/favorites` showed 5 albums but the user had 6 `favorites` rows, with the
suspected cause being that Item 2's `reviews!inner` fix (above) had somehow leaked from the
home-page query into `useFavoritesList`'s.

**That hypothesis was checked and is false.** `useFavoritesList.ts`'s `FAVORITES_SELECT` and
`App.tsx`'s `ALBUMS_WITH_REVIEWS_SELECT` are separate string constants — no shared query builder
or fragment. Confirmed three ways: (1) source inspection — no `!inner` anywhere in
`useFavoritesList.ts`; (2) `useFavoritesList.test.ts` already had a passing test for a zero-review
favorited album; (3) running `FAVORITES_SELECT` directly against the live Supabase project
(service-role, read-only) returned all 6 rows correctly, including a zero-review album with
`reviews: []`.

**The actual, unrelated causes (two of them):**

1. **Year-filter default, not a bug.** One of the 6 favorites was the Blind Guardian test album
   from `album-identity-frontend-favorites.md`'s live verification — zero reviews,
   `release_date: "2009"`. `/favorites` defaults its year dropdown to the current calendar year
   (2026 at the time), so that one album was filtered out of the *default* view (it was still
   loaded into `items`, just excluded from `filteredItems`; selecting "2009" or "All years" would
   have shown it). Not a data-loss bug — the year dropdown already lists every year present in
   `items`, computed before the year filter is applied.

2. **Real, permanent bug: 3 pre-migration `manual_albums` rows were never given a `favorites`
   row.** Before the album-identity migration, being in `manual_albums` was itself sufficient to
   appear on `/favorites` — no separate `favorites` row existed for those items. The migration's
   Step 2 (`2026-07-album-identity-backfill-albums.ts`, see `album-identity-migration.md`)
   correctly copied all 3 `manual_albums` rows (Neurosis – An Undying Love For A Burning World;
   W.M.D. – Against All Warnings; Green Carnation – A Dark Poem, Part II: Sanguis) into `albums`
   with `created_by` set, but no migration step ever created a corresponding `favorites` row for
   them. Since `/favorites` now reads exclusively through `favorites`, these 3 albums were
   permanently invisible from `/favorites` — confirmed live (all 3 resolved to real `albums` rows
   via `norm_key`, none had a matching `favorites` row for their owning user).

**Fix applied:** `scripts/migrations/2026-07-album-identity-backfill-favorites-from-manual-albums.ts`
— matches each `manual_albums` row to its `albums` row via `norm_key` (same key the original
backfill used) and inserts the missing `favorites` row, skipping any that already exist. Run
against the live project: 3 inserted, 0 skipped, 0 unmatched, final `favorites` count 9 (6 + 3).

**Cleanup:** per an explicit go-ahead, the Blind Guardian test album and its `favorites` row
(both artifacts of the earlier session's live verification, not real user data) were deleted from
the live project — final `favorites` count 8.

**Regression test added:** `useFavoritesList.test.ts` — "queries favorites with a plain
(non-inner) reviews embed, not excluding zero-review albums" — asserts the `favorites` select
string contains `reviews(` and does **not** contain `reviews!inner(`, mirroring the existing
`App.favorites.test.tsx` assertion that the home-page query *does* use `reviews!inner(`. This
guards specifically against the leak the (incorrect) bug report suspected, even though it turned
out not to be the actual cause this time.

**`manual_albums` dead-code check (separate ask):** confirmed dead in every live code path
(client, server, ingest) — the only remaining reference was the one-time, already-run
`2026-07-album-identity-backfill-albums.ts` (historical source data for the original migration)
plus a stale comment in `useFavoritesList.ts`. Real candidate for dropping the table entirely, but
that's a separate decision, not made in this session.

Full test suite green: 160/160 (159 + 1 new).
