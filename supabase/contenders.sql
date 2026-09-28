-- contenders: the AOTY hub's intermediate candidate pool (docs/decisions/aoty-hub-population.md).
-- One row per (user, album) the user has put forward as a contender — distinct from `favorites`
-- (loose, low-intent) and from "has been scored" (album_criteria_ratings having 6 rows). Neither
-- is reused as a proxy per that doc's explicit decision. Per-user private state, same shape as
-- `favorites` (a join row keyed by user_id + album_id) — plain client insert/delete, RLS-scoped,
-- no RPC needed (the RPC on `albums` exists only because that table is a shared catalog row;
-- this one isn't). Run this in the Supabase SQL editor.
--
-- Already run: Dan ran this against the live project on 2026-09-28, before the frontend code
-- in this branch was written — confirmed via a read-only query against the table. Kept here as
-- the durable schema record, same as every other file in this directory.
--
-- PK note: `primary key (user_id, album_id)` assumes one global Contenders pool per user. The
-- discovery docs flag a possible future "list" entity (year/genre-scoped lists) that must not be
-- architecturally blocked — this PK doesn't block it, but isn't free either: adding list support
-- later means widening this to `(user_id, list_id, album_id)`, a live PK change, not just a
-- column add. Deliberately not pre-built here (v1 ships a single hardcoded-scope list, per that
-- doc) — flagging so it isn't a surprise later.

create table contenders (
  user_id    uuid references auth.users(id) not null,
  album_id   uuid references albums(id) not null,
  created_at timestamptz default now(),
  primary key (user_id, album_id)
);

alter table contenders enable row level security;

create policy "Users can manage their own contenders"
  on contenders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
