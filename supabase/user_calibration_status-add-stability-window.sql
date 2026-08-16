-- Adds Brief 3's ranking-stability auto-escalation signal state to
-- user_calibration_status. Run this in the Supabase SQL editor, after
-- user_calibration_status.sql.
--
-- Three new columns, mirroring StabilityWindowState
-- (src/lib/criteria-calibration/rankingStabilitySignal.ts):
--   last_eligible_top10    -- jsonb array of <=10 albumIds, or null before the first
--                              tier-eligible checkpoint
--   consecutive_match_run  -- integer, run-length of consecutive checkpoint-to-predecessor
--                              MATCH EVENTS (see that module's own comment for why this is
--                              not simply "checkpoints compared")
--   fired                  -- boolean, ONE-WAY: true once Brief 3's K=2 signal has fired,
--                              never written back to false by normal traffic
--
-- WHY A DEDICATED RPC INSTEAD OF THE PLAIN .upsert() THIS TABLE ALREADY USES:
-- upsertWeightsAndStatus's writes are fired un-awaited on every commit and can resolve out
-- of order (docs/decisions/criteria-calibration/criteria-calibration-weights-write-race.md -- confirmed via git
-- log still unfixed as of this migration, diagnosed 2026-08-12, neither candidate fix
-- landed). For most columns here that only means transient staleness (a slightly-behind
-- accuracy_value self-corrects on the next commit). `fired` is different: it gates
-- automatic-vs-manual degree escalation, so a stale write landing last must never be
-- allowed to flip it from true back to false -- that would silently re-enable
-- auto-escalation after it had correctly stopped, which is the exact bug this whole signal
-- exists to prevent, arriving via the write-race side door instead. A plain upsert
-- (`... on conflict do update set fired = excluded.fired`) can't express "keep the old
-- value if it was already true" -- but `on conflict do update` CAN reference both
-- `excluded.*` (the incoming row) and the table's own current value, so
-- `fired = user_calibration_status.fired or excluded.fired` is expressed directly in the
-- upsert itself -- correct regardless of which of two concurrent writes actually lands
-- last, not an application-level read-then-write (which would just be the same race for
-- this one field).
--
-- Deliberately scoped to `fired` alone. consecutive_match_run/last_eligible_top10 keep
-- plain excluded.* overwrites, still subject to the broader unfixed race like every other
-- column here -- their staleness only delays the signal firing (re-observes a match event
-- it already had), it never falsely un-fires it, so it doesn't need the same guard.
--
-- Function is SECURITY INVOKER (the default -- deliberately not SECURITY DEFINER): it must
-- run with the calling client's own role so the existing RLS policy on this table
-- (`auth.uid() = user_id`) still applies exactly as it does for the plain .upsert() calls
-- elsewhere in this file's siblings. A SECURITY DEFINER function here would let any
-- authenticated caller write any other user's row by passing an arbitrary p_user_id.

alter table user_calibration_status
  add column last_eligible_top10 jsonb,
  add column consecutive_match_run integer not null default 0,
  add column fired boolean not null default false;

create or replace function upsert_calibration_status(
  p_user_id uuid,
  p_tier text,
  p_accuracy_value double precision,
  p_last_eligible_top10 jsonb,
  p_consecutive_match_run integer,
  p_fired boolean
) returns void as $$
begin
  insert into user_calibration_status (
    user_id, tier, accuracy_value, last_eligible_top10, consecutive_match_run, fired
  )
  values (
    p_user_id, p_tier, p_accuracy_value, p_last_eligible_top10, p_consecutive_match_run, p_fired
  )
  on conflict (user_id) do update set
    tier = excluded.tier,
    accuracy_value = excluded.accuracy_value,
    last_eligible_top10 = excluded.last_eligible_top10,
    consecutive_match_run = excluded.consecutive_match_run,
    fired = user_calibration_status.fired or excluded.fired;
end;
$$ language plpgsql;

-- Manual verification (run in the Supabase SQL editor -- it runs as a superuser role there,
-- so this scratch user_id doesn't need a real auth.users row or RLS bypass). Simulates two
-- out-of-order writes landing in the "wrong" order and confirms `fired` cannot regress:
--
--   -- the LATER commit (already fired) lands FIRST
--   select upsert_calibration_status(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'high', 0.92,
--     '["a","b"]'::jsonb, 2, true
--   );
--   -- the EARLIER commit (not yet fired) lands SECOND -- this is the race
--   select upsert_calibration_status(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'high', 0.90,
--     '["a"]'::jsonb, 1, false
--   );
--   select fired, accuracy_value from user_calibration_status
--     where user_id = '00000000-0000-0000-0000-000000000000';
--   -- expect: fired = true (the stale fired=false write must not regress it),
--   -- accuracy_value = 0.90 (unguarded columns DO still show the stale write landing last
--   -- -- this is the documented, still-open, out-of-scope-for-this-guard behavior)
--
--   -- cleanup:
--   -- delete from user_calibration_status where user_id = '00000000-0000-0000-0000-000000000000';
