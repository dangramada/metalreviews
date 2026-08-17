-- Drops Brief 3's duration-based auto-escalation signal from the database (2026-08-17).
-- Run this in the Supabase SQL editor, after
-- user_calibration_status-add-answer-count-guard.sql.
--
-- Context: the signal it backed has been retired outright, not replaced by another signal.
-- `rankingStabilitySignal.ts` / `rankingTestSet.ts` / `useRankingTestSetRatings.ts` are
-- deleted; degree escalation is now gated by explicit user-facing checkpoints at the Medium/
-- High/Very High accuracy tiers instead of by an automatic stop detector. Full rationale:
-- docs/decisions/criteria-calibration/criteria-calibration-tiered-checkpoints.md, and
-- criteria-calibration-escalation-signal-candidates.md for why every mathematical signal
-- variant was rejected first.
--
-- This also RETIRES, rather than fixes, the write-race tracked in
-- docs/decisions/criteria-calibration/criteria-calibration-weights-write-race.md. That race
-- was scoped exactly to last_eligible_top10 / last_change_answer_index and the previous_
-- triple — the answer-count guard deliberately did not extend to them (see that migration's
-- header). Dropping the columns removes the only fields the RPC wrote without an ordering
-- guard, so every surviving field (tier, accuracy_value, answer_count) is guarded. There is
-- no unguarded write left to race.
--
-- IRREVERSIBLE for the stored values: the seven columns' data is discarded. That is
-- intentional and safe — every one of them was input to a signal that no longer exists, none
-- is read by any surviving code path, and none can be re-derived from (or is needed to
-- re-derive) the answer log, which remains the single source of truth for a resumed session.
-- Roll back by restoring the prior migration's function definition and re-adding the columns
-- as nullable; sessions would resume with an empty window, exactly as a first-ever session
-- did.
--
-- Function stays SECURITY INVOKER (the default, unchanged from every prior version) — RLS
-- still applies exactly as before.

-- Idempotent throughout (if exists / or replace) — safe to re-run.

-- Drop the old 11-parameter signature explicitly. `create or replace function` does NOT
-- replace a function with a different parameter list — it would create an OVERLOAD, leaving
-- both callable, and PostgREST would then have to disambiguate by the argument names the
-- client happens to send. Dropping first is what makes the four-parameter version the only
-- one that exists.
drop function if exists upsert_calibration_status(uuid, text, double precision, integer, jsonb, integer, boolean, jsonb, integer, boolean, boolean);

create or replace function upsert_calibration_status(
  p_user_id uuid,
  p_tier text,
  p_accuracy_value double precision,
  p_answer_count integer
) returns void as $$
begin
  insert into user_calibration_status (user_id, tier, accuracy_value, answer_count)
  values (p_user_id, p_tier, p_accuracy_value, p_answer_count)
  on conflict (user_id) do update set
    -- Unchanged from the answer-count-guard migration: only adopt the incoming tier/
    -- accuracy_value when the incoming write is not older than what's stored. See that
    -- migration's header for why the comparison is `>=` and not `>`.
    tier = case when excluded.answer_count >= user_calibration_status.answer_count
                 then excluded.tier else user_calibration_status.tier end,
    accuracy_value = case when excluded.answer_count >= user_calibration_status.answer_count
                           then excluded.accuracy_value else user_calibration_status.accuracy_value end,
    answer_count = greatest(user_calibration_status.answer_count, excluded.answer_count);
end;
$$ language plpgsql;

-- Columns dropped only after the function above no longer references them, so a partially
-- applied run can never leave a live function selecting a column that's gone.
alter table user_calibration_status
  drop column if exists last_eligible_top10,
  drop column if exists last_change_answer_index,
  drop column if exists fired,
  drop column if exists previous_last_eligible_top10,
  drop column if exists previous_last_change_answer_index,
  drop column if exists previous_fired,
  drop column if exists last_commit_changed_window;

-- Manual verification (run in the Supabase SQL editor — runs as a superuser role there, so
-- this scratch user_id doesn't need a real auth.users row or RLS bypass). Same out-of-order
-- scenario the answer-count-guard migration verified, re-checked against the narrowed
-- signature:
--
--   -- the LATER commit (answer_count=10) lands FIRST
--   select upsert_calibration_status(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'high', 0.92, 10
--   );
--   -- the EARLIER commit (answer_count=9, stale) lands SECOND -- this is the race
--   select upsert_calibration_status(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'medium', 0.70, 9
--   );
--   select accuracy_value, tier, answer_count from user_calibration_status
--     where user_id = '00000000-0000-0000-0000-000000000000';
--   -- expect: accuracy_value = 0.92, tier = 'high', answer_count = 10
--
--   -- confirm exactly one overload survives (expect a single row):
--   select oid::regprocedure from pg_proc where proname = 'upsert_calibration_status';
--
--   -- cleanup:
--   -- delete from user_calibration_status where user_id = '00000000-0000-0000-0000-000000000000';
