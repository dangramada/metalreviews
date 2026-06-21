-- manual_albums table: user-curated album entries not sourced from review RSS feeds.
-- Run this in the Supabase SQL editor.
-- See docs/decisions/manual-albums.md for full rationale.

create table manual_albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  band text not null,
  album text not null,
  artwork_url text,
  genre text[] default '{}'::text[],
  release_date text,  -- text, not date: MB returns partial dates ("2024", "2024-03", "2024-03-15")
  created_at timestamptz default now()
);

alter table manual_albums enable row level security;

-- Single policy covers all operations: SELECT, INSERT, UPDATE, DELETE.
-- Matches the favorites table's RLS pattern (auth.uid() = user_id).
create policy "Users can manage their own manual albums"
  on manual_albums
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
