# Album-identity frontend update — /favorites (July 2026)

> **PARTIALLY SUPERSEDED by `album-identity-visibility-and-duplicate-fix.md`.** The single
> "already in your collection" notice described below was later split into two cases based on
> whether the current user had already favorited the album. The duplicate-prevention matching
> logic itself (`findExistingAlbum`) is unchanged and still accurate.

Implements the last of the four-session plan in `album-identity-decisions.md` §"Where this
leaves the sequencing": re-plumbing `/favorites` onto the post-migration `albums`/`favorites`
schema, following the schema migration (`album-identity-migration.md`), the ingest-pipeline
update (`album-identity-ingest.md`), and the home-page update
(`album-identity-frontend-homepage.md`) — all of which left `/favorites` on the old,
pre-migration shape on purpose, as a known gap for this session to close.

## The bug

`useFavoritesList.ts` queried `.from('favorites').select('review_id')`, a column dropped by
the migration. Reproduced directly against the live database: Postgres error `42703 column
favorites.review_id does not exist`. The hook's own error handling caught it (no hard crash),
but `/favorites` showed nothing for every user.

## Step 0 orientation findings

- Confirmed live: `favorites` rows are exactly `{ user_id, created_at, album_id }` — matches
  the brief, not `review_id`.
- Confirmed via a live query that `favorites -> albums(...reviews(...))` embeds correctly:
  `albums` comes back as a single nested object (many-to-one FK), `reviews` as an array inside
  it (one-to-many) — a single query can replace the old three-step load.
- Confirmed, by reading every `.sql` file that has ever touched the `albums` table, that only
  `supabase/albums.sql` (the original migration) had added a policy, and it was select-only.
  No insert policy existed — this session's job per the brief.
- `lookupMusicBrainz()` (`scripts/musicbrainz.ts`) already returns `releaseGroupId`; the
  `/api/manual-album-lookup` endpoint just wasn't forwarding it. One-line addition.

## `useFavoritesList.ts` — single query, re-derived

Replaced the three-step load (`favorites.review_id` -> `manual_albums` -> `reviews` by id)
with one query:

```
supabase.from('favorites').select(
  'album_id, albums(id, band, album, artwork_url, release_date, genre, created_at, reviews(published_at))'
)
```

`manual_albums` as a separate concept is gone — reviewed and manually-added albums both live
in `albums` now, distinguished only by `created_by` (null for ingest, a user id for manual
adds), and neither `useFavoritesList` nor the row UI needs that distinction.

`FavoriteListItem` changed: `id` -> `albumId`, and the `type: 'review' | 'manual'`
discriminator is gone entirely (see below). `publishedAt` is still carried, for the same
year-fallback purpose as before, but is now computed as **the most recent attached review's
`published_at`** when an album has more than one review — mirroring the precedent already set
by `AlbumCard.publishedAt` in `src/dbMapping.ts` (the home-page session), rather than inventing
a different rule for this view. Falls back to `null` (not the album's `created_at`) when there
are zero reviews, since a null year-fallback here just means the item won't show under a
specific year filter until it has a real `release_date` — matching the pre-existing behavior
for date-less items, not a new gap.

## `type` discriminator — removed, not preserved

`favorites-view.md` already noted `item.type` was never rendered in the UI. Its only other use
was in `handleRemove` (`FavoritesPage.tsx`), branching between `favorites.delete()` for
`'review'` items and `manual_albums.delete()` for `'manual'` items. With both kinds of album
now living in `albums` and favorited via the same `favorites` row, that branch collapses to one
unconditional delete:

```ts
await supabase.from('favorites').delete().eq('user_id', user.id).eq('album_id', item.albumId);
```

Removing a favorite only ever deletes the `favorites` row — the underlying `albums` row
(reviewed or manually-added) is never touched by unfavoriting. There is no remaining use for a
per-item type discriminator, so it was dropped rather than kept for a distinction (`created_by`
null-or-not) that nothing currently reads.

## `AddAlbumDrawer` — insert target changed, plus new duplicate-prevention

### Insert target: `albums` + `favorites`, not `manual_albums`

`handleConfirm` now inserts into `albums` (with `created_by: user.id`, `mb_release_group_id`
and `norm_key` populated at insert time) then `favorites` (pointing at the new album's id),
replacing the single `manual_albums` insert. This needed a new RLS policy —
`supabase/albums-add-insert-policy.sql` — since the migration's `albums.sql` only added a
public-read policy:

```sql
create policy "Authenticated users can insert their own albums"
  on albums for insert
  to authenticated
  with check (created_by = auth.uid());
```

Matches `album-identity-decisions.md` §5: insert yes, update/delete no — no policy was added
for those, matching the decision that albums aren't user-editable once created.

### Duplicate-prevention (Layer 1, from `album-identity-decisions.md` §5)

The original `manual_albums` flow had **no** duplicate-prevention at all — a real gap the whole
album-identity restructure exists to close. This session closes it for the manual-add path:

`findExistingAlbum(releaseGroupId, band, album)` (exported from `FavoritesPage.tsx` for direct
unit testing) mirrors `resolveAlbumIdentity`'s matching order from `scripts/ingest.ts`:
`mb_release_group_id` checked first (only if the fresh MB lookup resolved one), `norm_key`
(reusing `computeNormKey()` from `scripts/normalizeKey.ts` — not reimplemented) as the fallback,
checked only when the id lookup found nothing. Both checks query `albums` directly from the
browser client — no server-side change needed for the match check itself, since `albums` has
had a public-read policy since the migration.

Runs automatically right after a successful MB lookup (`handleLookup`), before the user even
sees the preview. When a match is found:

- The preview shows the **existing** album's real stored data (band/album/artwork/genre/date),
  not the fresh MB lookup result — more honest, since the point is "here's what's already in
  your collection," and its stored canonical strings may differ slightly from what MB just
  returned or what the user typed.
- A notice renders above the preview: "This album is already in your collection — confirming
  will add it to your favorites without creating a duplicate entry." Chosen over silently
  treating it as a fresh add, so the user isn't surprised later to find only one album
  represented despite two "adds."
- The release-date manual-entry input is suppressed (the existing album's data is used as-is).
- `handleConfirm` skips the `albums` insert entirely and only inserts into `favorites`, pointing
  at the existing album's id.

Live-verified end-to-end against the real Supabase project (both directions):

- Searching "Mortiis" / "Ghosts of Europa" (an existing, ingest-created, already-favorited
  album) correctly showed the "already in your collection" notice with the real stored
  artwork/genre/date — cancelled without writing, no duplicate created.
- Searching "Blind Guardian" / "Imaginations from the Other Side" (genuinely new) showed no
  match, allowed a normal add. Confirming created a real `albums` row (`created_by` = the
  user's id, `norm_key` computed correctly, `mb_release_group_id` null this time — MB's search
  response didn't resolve one for this query, an expected occasional gap per
  `album-identity-ingest.md`'s coverage-gap note, not a bug) and a real `favorites` row —
  confirmed via a direct service-role query (count went from 5 to 6). The success toast fired,
  the drawer closed, and the year dropdown auto-switched to 2009 (the album's real release
  year), all matching pre-existing behavior.
- Re-searching the same "Blind Guardian" / "Imaginations from the Other Side" immediately after
  correctly matched the **just-created** album via the **norm_key fallback** (since its
  `mb_release_group_id` was null) — confirming the fallback path works against freshly-created
  data, not only pre-existing ingest rows.

### A debugging note worth recording

Early in live verification, clicking Confirm appeared to do nothing at all — no toast, no
error, no network entry in the browser tool's own request log. This was **not** a bug in the
click handling: the browser tool's network log only captures same-origin/document-level
requests, not the cross-origin `fetch` calls `supabase-js` makes directly to
`*.supabase.co`. Monkey-patching `window.fetch` from within the page (temporarily, for this
debugging session only) surfaced the real response: `403 / 42501 row-level security policy
violation`, which was simply the new insert policy not yet having been run in Supabase at that
point. Once run, the same flow succeeded immediately. Noted here so a future session doesn't
waste time assuming a silent failure means broken client code — check the actual HTTP response
before assuming the request layer is at fault.

## Definition of done — status

- [x] Step 0 orientation reported before proceeding, including the RLS policy check (confirmed
      absent by reading every `.sql` file touching `albums`, not assumed from docs)
- [x] `/favorites` loads correctly for a real logged-in user, no console errors, no `42703` —
      live-verified against the real Supabase project
- [x] Preserved UX behaviors verified live: year dropdown (including auto-switch on add),
      artwork thumbnails + ♪ fallback, `RequireAuth` redirect for logged-out users, draft
      persistence across a full page reload, discard-confirmation dialog
- [x] `AddAlbumDrawer` preserved behaviors verified live: year-mismatch notice, no-match-allowed
      add, draft persistence
- [x] Duplicate-prevention on manual add implemented and live-verified both directions (existing
      ingest album matched by norm_key; freshly-created manual album matched by norm_key on a
      second lookup)
- [x] `type` discriminator's fate decided and stated: removed, not preserved — its only
      non-UI use (delete-target routing) collapsed to a single unconditional path once both
      album kinds share one table and one favorites row shape
- [x] Full test suite green: 155/155 (`useFavoritesList.test.ts` and `FavoritesPage.test.tsx`
      rewritten for the new shapes; new `findExistingAlbum.test.ts` covering all four
      match/no-match branches)
- [x] `npx tsc --noEmit` clean; no new lint errors (one new warning, same
      `react-refresh/only-export-components` category already present elsewhere in the
      codebase for non-component exports, from exporting `findExistingAlbum` for testing)
- [x] This doc; pointers appended to `favorites-view.md` and `manual-albums.md`; `CLAUDE.md`
      index updated
- [x] Continued on `album-identity-migration` branch, confirmed still not merged to `master`

## What this session did NOT do

- Did not touch the home page, `src/dbMapping.ts`, or the multi-source display work — separate,
  already done.
- Did not add a `personal_score` field or anything AOTY-related.
- Did not change any RLS policy beyond the one new `albums` insert policy strictly required for
  the new insert target — no update/delete policy added, matching the decision that albums
  aren't user-editable once created.
- Did not build admin merge tooling — still deferred, per `album-identity-decisions.md` §5
  Layer 2, unchanged.
