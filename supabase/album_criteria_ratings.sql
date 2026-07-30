-- album_criteria_ratings: one row per (user, album, criterion) -- the level a user assigned
-- that album on that criterion. This is what the future rating drawer (brief 4 of the
-- original numbering, now later given the elicitation-driver renumbering) writes to.
-- Per-user, RLS-scoped to the owning user. Run this in the Supabase SQL editor.
-- Prerequisite: criteria.sql already run (criterion_id FK below); albums table must already
-- exist (confirmed by inspection: `albums`, uuid primary key -- see supabase/albums.sql and
-- favorites-add-album-id.sql's `album_id uuid references albums(id)`, not assumed).
--
-- updated_at + trigger included even though the brief didn't explicitly ask for it here --
-- a judgment call: a future rating-edit flow will need to know when a rating last changed,
-- and it costs nothing to add now rather than as a later migration.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table album_criteria_ratings (
  user_id uuid references auth.users(id) not null,
  album_id uuid references albums(id) not null,
  criterion_id smallint references criteria(id) not null,
  level smallint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, album_id, criterion_id)
);

alter table album_criteria_ratings enable row level security;

create policy "Users can manage their own album criteria ratings"
  on album_criteria_ratings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger set_album_criteria_ratings_updated_at
  before update on album_criteria_ratings
  for each row execute function set_updated_at();
