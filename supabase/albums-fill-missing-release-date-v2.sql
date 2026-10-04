-- fill_missing_release_date v2: authenticated-only, validated, returns the stored date.
--
-- APPLY THIS BEFORE DEPLOYING THE APP CODE that reads the return value (the Contenders
-- "Add release date" dialog). The client also tolerates the old `void` return (treats it as
-- "unknown", refetches), so a wrong order degrades safely, but run this first.
--
-- Why (found 2026-10-04, see docs/decisions/aoty/aoty-list-implementation.md):
--   1. EXPOSURE: the v1 file ran `revoke all ... from public; grant execute ... to
--      authenticated`, but Supabase's default privileges had already granted EXECUTE to `anon`
--      explicitly, and revoking from PUBLIC does not remove a role-specific grant. A no-op call
--      with only the public key and a random uuid returned HTTP 204, i.e. an unauthenticated
--      caller could fill any NULL-dated album with arbitrary text (the function is SECURITY
--      DEFINER and had no auth.uid() check). This version revokes from anon explicitly and
--      refuses when auth.uid() is null.
--   2. NO VALIDATION: v1 stored any text ('abc', '3036-06-26' is already in the catalog).
--      This version accepts only YYYY, YYYY-MM, YYYY-MM-DD with a real month/day, year
--      1900 .. (current year + 1), the range derived from now(), never hardcoded.
--   3. NO SIGNAL: v1 returned void, so a caller that lost a race (or hit an already-dated album)
--      could not tell. This version returns the stored date after the call: the newly set one, or
--      the pre-existing one when the album was already dated; NULL when the album does not exist.
--
-- Fill NULL only: an existing date is never overwritten. The albums table is a shared catalog,
-- so a date stored here applies to every user who has the album, and no app path edits it
-- afterwards. First writer wins; the UPDATE's row lock makes a concurrent second caller re-check
-- `release_date is null`, update nothing, and read back the first caller's date.
--
-- search_path is pinned to '' and tables are schema-qualified (SECURITY DEFINER hardening).
-- now(), make_date(), extract() resolve through pg_catalog, which is always searched.
--
-- The client twin of these rules is parseReleaseDate (src/lib/aoty/releaseDate.ts).
-- src/__tests__/releaseDateSql.test.ts reads the sample lists below and the regex literal in the
-- function body, and fails if the two validators disagree. Keep them in sync. Samples are
-- judged as of 2026 (valid years 1900..2027); '' stands for the empty string.
--
--   accept: 1900 1984 2024 2027 2024-03 1900-01 2027-12 2024-03-15 2024-02-29 1900-02-28 1900-01-01 2027-12-31
--   reject-format: '' abc 2024abc 12ab 24 20245 2024-3 2024-03-5 2024-13 2024-00 2024-03-00 2024-03-32 2024/03/15 2024-03-15T00:00:00Z 2024-03-
--   reject-range: 0000 1899 1899-12-31 2028 3036 3036-06-26
--   reject-date: 2024-02-30 2023-02-29 2024-04-31 1900-02-29
--
-- Run this in the Supabase SQL editor.
--
-- BEFORE / AFTER CHECKS (run in the SQL editor; they use a rolled-back transaction so no data
-- is left changed):
--
--   -- BEFORE (v1): expect proacl to list anon=X and prorettype void
--   select proacl, prorettype::regtype from pg_proc
--    where proname = 'fill_missing_release_date' and pronamespace = 'public'::regnamespace;
--
--   -- AFTER: expect proacl WITHOUT anon (postgres, authenticated, service_role only) and text
--   select proacl, prorettype::regtype from pg_proc
--    where proname = 'fill_missing_release_date' and pronamespace = 'public'::regnamespace;
--
--   -- AFTER, from outside (public key, no login). Expect an error (401/403 or 42501), NOT 204:
--   --   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/rest/v1/rpc/fill_missing_release_date" \
--   --     -H "apikey: $PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
--   --     -d '{"p_album_id":"00000000-0000-0000-0000-000000000000","p_release_date":"2000-01-01"}'
--
--   -- AFTER, behaviour (the SQL editor runs as postgres, so fake a login for the transaction):
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
--     select public.fill_missing_release_date('00000000-0000-0000-0000-000000000000', '2000-01-01');
--     -- expect: NULL (no such album, nothing written)
--     select public.fill_missing_release_date(
--       (select id from public.albums where release_date is null limit 1), '3036-01-01');
--     -- expect: ERROR 22023 (year out of range)
--   rollback;

drop function if exists public.fill_missing_release_date(uuid, text);

create function public.fill_missing_release_date(
  p_album_id uuid,
  p_release_date text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year int;
  v_month int;
  v_day int;
  v_max_year int := extract(year from now())::int + 1;
  v_stored text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_release_date is null
     or p_release_date !~ '^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$' then
    raise exception 'invalid release date format' using errcode = '22023';
  end if;

  v_year := substr(p_release_date, 1, 4)::int;
  if v_year < 1900 or v_year > v_max_year then
    raise exception 'release year out of range' using errcode = '22023';
  end if;

  -- Real day-of-month (rejects 2024-02-30, 2023-02-29, 2024-04-31): compare against the last day
  -- of that month.
  if length(p_release_date) = 10 then
    v_month := substr(p_release_date, 6, 2)::int;
    v_day := substr(p_release_date, 9, 2)::int;
    if v_day > extract(day from (make_date(v_year, v_month, 1) + interval '1 month' - interval '1 day'))::int then
      raise exception 'invalid calendar date' using errcode = '22023';
    end if;
  end if;

  update public.albums
     set release_date = p_release_date
   where id = p_album_id
     and release_date is null
  returning release_date into v_stored;

  -- Nothing updated: already dated (return the existing date) or no such album (returns NULL).
  if v_stored is null then
    select a.release_date into v_stored from public.albums a where a.id = p_album_id;
  end if;

  return v_stored;
end;
$$;

revoke execute on function public.fill_missing_release_date(uuid, text) from public, anon;
grant execute on function public.fill_missing_release_date(uuid, text) to authenticated;
