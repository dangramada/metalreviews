-- user_criterion_weights: one row per (user, criterion, level), storing the derived
-- preference value from the Criteria Calibration engine (src/lib/criteria-calibration/
-- solver.ts's LevelValue.point). Per-user, RLS-scoped to the owning user. Run this in the
-- Supabase SQL editor. Prerequisite: criteria.sql already run (criteria_levels FK below).
--
-- RLS pattern mirrors manual_albums.sql exactly: a single "for all" policy
-- (auth.uid() = user_id) covering select/insert/update/delete, rather than separate
-- per-operation policies.
--
-- updated_at + trigger: no existing convention for this exists elsewhere in the repo
-- (checked -- zero `updated_at` columns anywhere before this migration), so this is a new,
-- minimal default: a shared `set_updated_at()` trigger function, defined identically in
-- every migration file that needs it so each file stays independently runnable in any order.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table user_criterion_weights (
  user_id uuid references auth.users(id) not null,
  criterion_id smallint not null,
  level smallint not null,
  value double precision not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, criterion_id, level),
  foreign key (criterion_id, level) references criteria_levels(criterion_id, level)
);

alter table user_criterion_weights enable row level security;

create policy "Users can manage their own criterion weights"
  on user_criterion_weights
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger set_user_criterion_weights_updated_at
  before update on user_criterion_weights
  for each row execute function set_updated_at();
