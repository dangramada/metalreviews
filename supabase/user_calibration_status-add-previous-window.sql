-- Closes the "second consecutive Undo immediately after resume" gap left by
-- user_calibration_status-add-stability-window.sql. Run this in the Supabase SQL editor,
-- after that migration.
--
-- Adds:
--   previous_last_eligible_top10, previous_consecutive_match_run, previous_fired
--     -- a full mirror triple of the existing last_eligible_top10/consecutive_match_run/
--     fired columns, holding the StabilityWindowState as it was immediately BEFORE the most
--     recent commit that actually changed the window (i.e. before applying whatever produced
--     the CURRENT last_eligible_top10/consecutive_match_run/fired). Written only on commits
--     where advanceStabilityWindow actually changed the state -- a no-op commit (insufficient
--     tier, or already fired) leaves this triple untouched, so it always reflects "state
--     before the LAST real change", however many no-op commits have happened since.
--   last_commit_changed_window
--     -- boolean, overwritten on EVERY commit (unlike the triple above): true iff the most
--     recently committed answer was itself the one that changed the window. This is what lets
--     a resumed session correctly gate a single post-resume Undo -- roll back to the
--     previous_* triple only when the answer being undone was actually the change-causing one,
--     not on every Undo unconditionally (which would wrongly un-fire a signal that fired
--     several no-op commits ago). See rankingStabilitySignal.ts's seedWindowHistoryOnResume
--     and its test file for the full reasoning, including the accepted (proven safe-direction)
--     gap at 2+ consecutive Undos with zero intervening commits.
--
-- previous_fired does not need the same OR-guard `fired` has: it is mathematically always
-- false (advanceStabilityWindow's terminal guard means no "change" can ever be recorded once
-- fired is already true, so a pre-change snapshot can never itself be post-fire) -- there is
-- no true value it could race away from. previous_consecutive_match_run/
-- previous_last_eligible_top10/last_commit_changed_window follow the same non-guarded
-- convention as consecutive_match_run/last_eligible_top10 already do: staleness under the
-- documented, still-unfixed write race only ever delays or under-corrects a later resume's
-- rollback decision, confined to the safe direction (see the test file) -- it never causes a
-- false un-fire, so it doesn't need the atomic guard `fired` needed.

alter table user_calibration_status
  add column previous_last_eligible_top10 jsonb,
  add column previous_consecutive_match_run integer not null default 0,
  add column previous_fired boolean not null default false,
  add column last_commit_changed_window boolean not null default false;

drop function if exists upsert_calibration_status(uuid, text, double precision, jsonb, integer, boolean);

create or replace function upsert_calibration_status(
  p_user_id uuid,
  p_tier text,
  p_accuracy_value double precision,
  p_last_eligible_top10 jsonb,
  p_consecutive_match_run integer,
  p_fired boolean,
  p_previous_last_eligible_top10 jsonb,
  p_previous_consecutive_match_run integer,
  p_previous_fired boolean,
  p_last_commit_changed_window boolean
) returns void as $$
begin
  insert into user_calibration_status (
    user_id, tier, accuracy_value,
    last_eligible_top10, consecutive_match_run, fired,
    previous_last_eligible_top10, previous_consecutive_match_run, previous_fired,
    last_commit_changed_window
  )
  values (
    p_user_id, p_tier, p_accuracy_value,
    p_last_eligible_top10, p_consecutive_match_run, p_fired,
    p_previous_last_eligible_top10, p_previous_consecutive_match_run, p_previous_fired,
    p_last_commit_changed_window
  )
  on conflict (user_id) do update set
    tier = excluded.tier,
    accuracy_value = excluded.accuracy_value,
    last_eligible_top10 = excluded.last_eligible_top10,
    consecutive_match_run = excluded.consecutive_match_run,
    fired = user_calibration_status.fired or excluded.fired,
    previous_last_eligible_top10 = excluded.previous_last_eligible_top10,
    previous_consecutive_match_run = excluded.previous_consecutive_match_run,
    previous_fired = excluded.previous_fired,
    last_commit_changed_window = excluded.last_commit_changed_window;
end;
$$ language plpgsql;
