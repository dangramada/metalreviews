-- aoty: the AOTY list's membership (docs/decisions/aoty/aoty-list-implementation.md).
-- Membership ONLY. Rank, score and year are never persisted: order is derived from the user's
-- current weights, year from albums.release_date. The composite FK makes AOTY a subset of
-- Contenders, and ON DELETE CASCADE means removing a Contender also drops its AOTY row.
-- Run this in the Supabase SQL editor.

create table aoty (
  user_id    uuid not null,
  album_id   uuid not null,
  created_at timestamptz default now(),
  primary key (user_id, album_id),
  foreign key (user_id, album_id) references contenders (user_id, album_id) on delete cascade
);

alter table aoty enable row level security;

create policy "Users can manage their own aoty"
  on aoty
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
