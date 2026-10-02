-- contenders-backfill: one-off backfill for "a scored album auto-enters Contenders"
-- (docs/decisions/aoty/aoty-list-implementation.md, "Contenders backfill"). The rule is
-- app-level auto-add on the first full rating (isFirstFullRating, AlbumRatingPage.handlePick);
-- albums fully rated before it shipped, or whose fire-and-forget add failed, were never added.
-- Run manually in the Supabase SQL editor. Idempotent (on conflict do nothing), insert-only,
-- all users, no deletes.
--
-- "Fully rated" = rated on every row of `criteria` (count derived, not hardcoded 6).
-- created_at = max(album_criteria_ratings.updated_at) per (user, album), i.e. when the album
-- became fully rated, so Contenders ordering stays meaningful.
--
-- Caveat: cannot tell albums a user deliberately removed from Contenders (or scored out of
-- curiosity) from ones never added -- they all come back. Remove again by hand; the app-level
-- rule only fires on the first full rating, so it won't re-add them.
--
-- ROLLBACK (after commit): run STEP 1 first and save its album_id list per user. Then
--   delete from contenders where user_id = '<user_id>' and album_id in ('<id>', ...);
-- for each user's listed keys. Safe w.r.t. aoty: the inserted rows are new, so no aoty row
-- references them and the on-delete-cascade has nothing to remove. Do NOT delete by
-- created_at (backfilled values are historical, not "now").
--
-- Expected on the live project at 2026-10-01: contenders 6 -> exactly 21, missing 15 -> 0.
-- Any other result: the script raises and the whole transaction rolls back; stop and investigate.

-- STEP 1: before (run on its own first; save the album_id list for rollback)
select r.user_id, r.album_id
from album_criteria_ratings r
left join contenders c using (user_id, album_id)
where c.album_id is null
group by r.user_id, r.album_id
having count(*) = (select count(*) from criteria)
order by r.user_id, r.album_id;

select count(*) as contenders_before from contenders;

-- STEP 2: backfill (transaction; aborts and rolls back on any count mismatch)
begin;

insert into contenders (user_id, album_id, created_at)
select user_id, album_id, max(updated_at)
from album_criteria_ratings
group by user_id, album_id
having count(*) = (select count(*) from criteria)
on conflict (user_id, album_id) do nothing;

do $$
declare
  contenders_after int;
  missing_after int;
begin
  select count(*) into contenders_after from contenders;
  select count(*) into missing_after from (
    select r.user_id, r.album_id
    from album_criteria_ratings r
    left join contenders c using (user_id, album_id)
    where c.album_id is null
    group by r.user_id, r.album_id
    having count(*) = (select count(*) from criteria)
  ) m;
  raise notice 'contenders_after=%, missing_after=%', contenders_after, missing_after;
  if contenders_after <> 21 or missing_after <> 0 then
    raise exception 'Unexpected result (contenders=%, missing=%) -- rolled back', contenders_after, missing_after;
  end if;
end $$;

commit;
