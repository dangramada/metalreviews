-- user_calibration_answers: the raw trade-off answer log per user -- every answer, in
-- order, so the solver can be re-run later without asking the user to redo the whole
-- session. Per-user, RLS-scoped to the owning user. Run this in the Supabase SQL editor.
--
-- profile_a / profile_b are jsonb, matching the notation used throughout
-- src/lib/criteria-calibration/preferenceGraph.ts: a partial mapping of criterion index to
-- level, e.g. {"0": 3, "2": 5} meaning criterion 0 at level 3, criterion 2 at level 5.
-- Deliberately NOT normalized into rows (one row per criterion/level) -- a profile is a
-- single comparison-card unit, not independently queryable per criterion.
--
-- Append-only log: no updated_at, since an answer is never edited in place, only ever
-- appended. (An "edit past calibration answers" feature is a known future possibility --
-- see the brief this table was specified in -- but this table isn't designed against it;
-- that would most likely mean inserting a superseding row, not mutating this one.)

create table user_calibration_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  profile_a jsonb not null,
  profile_b jsonb not null,
  result text not null check (result in ('a_preferred', 'b_preferred', 'equal')),
  answered_at timestamptz not null default now()
);

alter table user_calibration_answers enable row level security;

create policy "Users can manage their own calibration answers"
  on user_calibration_answers
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
