-- One-off: merge duplicate album 87e01f15 ("A Dark Poem, Pt. III: ...", no MB data) into
-- winner 9fac6737 ("A Dark Poem Part III: ...", mb_release_group_id 0b443f13-...).
-- Run in the Supabase SQL editor.
--
-- !! Run ONLY after the Pt./Part title-retry fix is deployed on Render. Otherwise the next
-- !! ingest does not resolve the "Pt." title, finds no norm_key match, and recreates the "Pt." row.
--
-- Evidence this is written against (scripts/ingest.ts, supabase/*.sql):
--  * reviews are upserted with onConflict 'id' (PK) — NOT url and NOT (album_id, source).
--    unique(album_id, source) is a plain constraint (reviews-finalize.sql); no unique on url.
--  * ingest finds an existing review via `${album_id}::${source}` of the RESOLVED album. When a
--    review's resolved album changes it is therefore NOT moved: a NEW review row is inserted under
--    the new album and the old row stays on the old album (duplicated).
--  => if an ingest ran between the fix deploy and this script, 9fac6737 may already hold a
--     Progressive Subway review (url = the loser's). Step 1 handles both cases.
--
-- Referencing tables (supabase/*.sql): reviews, favorites, contenders, aoty (composite FK to
-- contenders, on delete cascade, no on-update cascade), album_criteria_ratings.
-- Live count at write time: only reviews had rows for these two albums; the rest handle drift.
--
-- Final line is ROLLBACK. Read the previews, then change it to COMMIT and re-run to apply.

begin;

-- ---- PREVIEW (before) ----
select 'album' as what, id::text, band, album, mb_release_group_id from albums
  where id in ('87e01f15-69f8-40a8-8805-4b9c75aa958f', '9fac6737-84ed-46c2-8144-87e923d9b784');
select 'review' as what, id::text, album_id::text, source, url from reviews
  where album_id in ('87e01f15-69f8-40a8-8805-4b9c75aa958f', '9fac6737-84ed-46c2-8144-87e923d9b784');
select 'favorites' as what, count(*) from favorites where album_id = '87e01f15-69f8-40a8-8805-4b9c75aa958f';
select 'contenders' as what, count(*) from contenders where album_id = '87e01f15-69f8-40a8-8805-4b9c75aa958f';
select 'aoty' as what, count(*) from aoty where album_id = '87e01f15-69f8-40a8-8805-4b9c75aa958f';
select 'ratings' as what, count(*) from album_criteria_ratings where album_id = '87e01f15-69f8-40a8-8805-4b9c75aa958f';

do $$
declare
  loser  constant uuid := '87e01f15-69f8-40a8-8805-4b9c75aa958f';
  winner constant uuid := '9fac6737-84ed-46c2-8144-87e923d9b784';
  r record;
  w_url text;
begin
  -- 1. reviews: move each loser review; if the winner already has one for that source, delete
  --    the loser's only when the url matches, otherwise abort for manual inspection.
  for r in select id, source, url from reviews where album_id = loser loop
    select url into w_url from reviews where album_id = winner and source = r.source;
    if not found then
      update reviews set album_id = winner where id = r.id;
    elsif w_url is not distinct from r.url then
      delete from reviews where id = r.id;
    else
      raise exception 'Winner already has a % review with a different url (% vs %) — resolve manually',
        r.source, w_url, r.url;
    end if;
  end loop;

  -- 2. favorites: no unique constraint, plain reassign.
  update favorites set album_id = winner where album_id = loser;

  -- 3. album_criteria_ratings: PK (user_id, album_id, criterion_id) — drop loser rows the user
  --    already has on the winner, move the rest.
  delete from album_criteria_ratings l
    using album_criteria_ratings w
    where l.album_id = loser and w.album_id = winner
      and w.user_id = l.user_id and w.criterion_id = l.criterion_id;
  update album_criteria_ratings set album_id = winner where album_id = loser;

  -- 4. contenders/aoty: aoty's composite FK has no on-update cascade, so re-create instead of
  --    updating in place, children (aoty) first.
  insert into contenders (user_id, album_id, created_at)
    select user_id, winner, created_at from contenders where album_id = loser
    on conflict (user_id, album_id) do nothing;
  insert into aoty (user_id, album_id, created_at)
    select user_id, winner, created_at from aoty where album_id = loser
    on conflict (user_id, album_id) do nothing;
  delete from aoty where album_id = loser;
  delete from contenders where album_id = loser;

  -- 5. the loser album itself (fails loudly on any FK we missed).
  delete from albums where id = loser;
end $$;

-- ---- PREVIEW (after) ----
select 'album' as what, id::text, band, album, mb_release_group_id from albums
  where id in ('87e01f15-69f8-40a8-8805-4b9c75aa958f', '9fac6737-84ed-46c2-8144-87e923d9b784');
select 'review' as what, id::text, album_id::text, source, url from reviews
  where album_id in ('87e01f15-69f8-40a8-8805-4b9c75aa958f', '9fac6737-84ed-46c2-8144-87e923d9b784');

rollback; -- change to COMMIT once the previews look right
