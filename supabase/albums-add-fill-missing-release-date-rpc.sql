-- Lets an authenticated user fill in a missing release_date on an existing albums row
-- (AddAlbumDrawer's existingMatch path — see docs/decisions/album-identity/
-- album-identity-frontend-favorites.md's dated summary at the top of that file).
--
-- Why an RPC instead of an UPDATE policy: a plain row-level policy
-- (`using (release_date is null)`) can only restrict which ROWS are writable, not which
-- COLUMNS. Any authenticated caller could still smuggle band/album/genre/artwork_url edits
-- into the same UPDATE request as long as the row's release_date happened to be null at the
-- time — these are shared catalog rows (reviewed, favorited by other users), not the
-- caller's own private data, so that's a real integrity gap, not a theoretical one. This RPC
-- is the only write path for this case instead: SECURITY DEFINER, touches release_date and
-- nothing else. No UPDATE policy is added on albums.
--
-- Silently no-ops (does not error) when the row's release_date is already set, so a
-- stale/duplicate call can never overwrite an existing value — matches the "fill a blank,
-- don't edit a value" intent.
--
-- search_path pinned to '' + every reference fully qualified (public.albums) — standard
-- SECURITY DEFINER hardening: an unqualified table name would otherwise resolve against
-- whatever search_path the CALLER's session has, not this function's, letting a caller who
-- controls an earlier schema on their own search_path redirect the write.
--
-- Run this in the Supabase SQL editor.

create or replace function public.fill_missing_release_date(
  p_album_id uuid,
  p_release_date text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.albums
  set release_date = p_release_date
  where id = p_album_id
    and release_date is null;
end;
$$;

revoke all on function public.fill_missing_release_date(uuid, text) from public;
grant execute on function public.fill_missing_release_date(uuid, text) to authenticated;

-- Manual verification (run in the Supabase SQL editor):
--
--   -- pick a real existing albums row with release_date null, or temporarily null one out:
--   -- update albums set release_date = null where id = '<some-id>';
--
--   select fill_missing_release_date('<some-id>'::uuid, '2019-05-10');
--   select release_date from albums where id = '<some-id>';
--   -- expect: '2019-05-10'
--
--   -- calling again with a different date must no-op, not overwrite:
--   select fill_missing_release_date('<some-id>'::uuid, '2020-01-01');
--   select release_date from albums where id = '<some-id>';
--   -- expect: still '2019-05-10'
