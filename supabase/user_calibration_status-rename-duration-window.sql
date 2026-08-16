-- Replaces the checkpoint-COUNT stability window (consecutive_match_run) with a
-- duration-based one (last_change_answer_index) on user_calibration_status. Run this in the
-- Supabase SQL editor, after user_calibration_status-add-previous-window.sql.
--
-- WHY: a fine-grained (every-real-answer) replay of Dan's real 70-answer session found the
-- old K=2 "2 consecutive tier-eligible checkpoints matched" window fires on a false positive
-- under production's real per-commit checking granularity — "2 consecutive checkpoints"
-- collapses to just 2 real answers of evidence, with no floor on how far apart those
-- checkpoints actually are. See docs/decisions/criteria-calibration/criteria-calibration-fine-grained-firing-instability.md
-- for the full finding (fired at n=28 on a near-tied top-10 boundary; the real settle point
-- was n=35) and its duration-based-fix follow-up doc for the R sweep that chose R=12.
--
-- In-place rename, not an additive column: both existing rows belong to Dan's own account and
-- the disposable QA test account (this branch has never shipped to real end users), so there
-- is no real production data to preserve under the old column name/semantics.
--
--   consecutive_match_run          -> last_change_answer_index
--   previous_consecutive_match_run -> previous_last_change_answer_index
--
-- New meaning (see rankingStabilitySignal.ts's StabilityWindowState doc comment): the
-- real-answer index (matching answers.length at commit time) at which last_eligible_top10
-- last changed at a tier-eligible checkpoint, or the index of the first-ever eligible
-- checkpoint (the anchor) if it hasn't changed since. `fired` becomes true once
-- (current real-answer index - last_change_answer_index) >= 12 (REQUIRED_ANSWER_SPAN,
-- provisional — see rankingStabilitySignal.ts).
--
-- `fired`'s atomic OR-guard, previous_fired's no-guard-needed reasoning, and every other
-- column here are UNCHANGED by this migration — see the prior two migrations' headers. The
-- monotonicity argument that made those safe transfers directly to
-- last_change_answer_index/previous_last_change_answer_index: a real change always sets
-- last_change_answer_index to the CURRENT (strictly larger) answer index, never resets it
-- backward, so it is monotonically non-decreasing along the true trajectory exactly like
-- `fired` is — re-derived, not assumed, in rankingStabilitySignal.test.ts's
-- "lastChangeAnswerIndex mismatch, safe direction" case.

alter table user_calibration_status
  rename column consecutive_match_run to last_change_answer_index;
alter table user_calibration_status
  rename column previous_consecutive_match_run to previous_last_change_answer_index;

drop function if exists upsert_calibration_status(uuid, text, double precision, jsonb, integer, boolean, jsonb, integer, boolean, boolean);

create function upsert_calibration_status(
  p_user_id uuid,
  p_tier text,
  p_accuracy_value double precision,
  p_last_eligible_top10 jsonb,
  p_last_change_answer_index integer,
  p_fired boolean,
  p_previous_last_eligible_top10 jsonb,
  p_previous_last_change_answer_index integer,
  p_previous_fired boolean,
  p_last_commit_changed_window boolean
) returns void as $$
begin
  insert into user_calibration_status (
    user_id, tier, accuracy_value,
    last_eligible_top10, last_change_answer_index, fired,
    previous_last_eligible_top10, previous_last_change_answer_index, previous_fired,
    last_commit_changed_window
  )
  values (
    p_user_id, p_tier, p_accuracy_value,
    p_last_eligible_top10, p_last_change_answer_index, p_fired,
    p_previous_last_eligible_top10, p_previous_last_change_answer_index, p_previous_fired,
    p_last_commit_changed_window
  )
  on conflict (user_id) do update set
    tier = excluded.tier,
    accuracy_value = excluded.accuracy_value,
    last_eligible_top10 = excluded.last_eligible_top10,
    last_change_answer_index = excluded.last_change_answer_index,
    fired = user_calibration_status.fired or excluded.fired,
    previous_last_eligible_top10 = excluded.previous_last_eligible_top10,
    previous_last_change_answer_index = excluded.previous_last_change_answer_index,
    previous_fired = excluded.previous_fired,
    last_commit_changed_window = excluded.last_commit_changed_window;
end;
$$ language plpgsql;
