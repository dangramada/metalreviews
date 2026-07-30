-- user_calibration_status: one row per user, the current accuracy tier + raw metric value.
-- Per-user, RLS-scoped to the owning user. Run this in the Supabase SQL editor.
-- Prerequisite: none (no FK to criteria/criteria_levels needed here).
--
-- Tier labels ('none' | 'medium' | 'high' | 'very_high') are snake_case for SQL convention;
-- the app layer (src/lib/criteria-calibration/accuracyTiers.ts) uses camelCase
-- ('insufficient' | 'high' | 'veryHigh') for its own solver-only tier, plus a separate
-- boolean isMediumTierReached() -- there is no single TS export with all four labels, so
-- whatever computes a row here must translate between the two.
--
-- IMPORTANT application-layer rule (not enforced by this schema -- a plain check
-- constraint can't express a cross-column-family invariant like this, since
-- isMediumTierReached() depends on live graph state, not just this table's own columns):
-- a tier of 'high' or 'very_high' must ALSO require isMediumTierReached() to be true, not
-- just solverAccuracyTier() on its own. Concretely: tier = 'high' only when Medium is
-- reached AND solverAccuracyTier() === 'high' (same pattern for 'very_high'). Without this,
-- a user could reach a high solver-accuracy value via degree-3+ answers while having
-- skipped a degree-2 pair entirely, contradicting Medium being the documented floor tier.
-- Whatever writes this table (brief 5+) must compute the tier with this combined rule, not
-- solverAccuracyTier() alone.
--
-- Also worth flagging for whoever wires this up: computeSolverAccuracy has a confirmed
-- structural blind spot for degree-3+ ranking improvements (see
-- docs/decisions/criteria-calibration-engine.md, "Part 4 finding") -- this doesn't change
-- anything about this table (tier/accuracy_value stay generic columns regardless of how the
-- metric is eventually computed), but 'high'/'very_high' values written by the CURRENT
-- metric logic should not yet be treated as meaningful; that's a separate, already-flagged
-- open item, not something this migration fixes.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create table user_calibration_status (
  user_id uuid primary key references auth.users(id),
  tier text not null check (tier in ('none', 'medium', 'high', 'very_high')),
  accuracy_value double precision not null,
  updated_at timestamptz not null default now()
);

alter table user_calibration_status enable row level security;

create policy "Users can manage their own calibration status"
  on user_calibration_status
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger set_user_calibration_status_updated_at
  before update on user_calibration_status
  for each row execute function set_updated_at();
