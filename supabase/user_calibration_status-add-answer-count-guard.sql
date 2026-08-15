-- Closes the write-race documented in
-- docs/decisions/criteria-calibration-weights-write-race.md (see that file's 2026-08-15
-- correction note for what this fix is and isn't responding to: the specific 92.04%/n=69
-- incident used as motivating evidence did NOT hold up under re-verification, but the RPC's
-- structural lack of an ordering guard on accuracy_value/tier is real and independent of
-- that incident). Run this in the Supabase SQL editor, after
-- user_calibration_status-rename-duration-window.sql.
--
-- Adds `answer_count` (the real-answer index the write was computed against, i.e.
-- answers.length at commit time — a different quantity from last_change_answer_index,
-- which only tracks the stability window's own last-change point, not every commit).
-- `upsertWeightsAndStatus` calls fire un-awaited on every commit and can resolve out of
-- order at the database; accuracy_value/tier previously had no protection at all (unlike
-- `fired`, which already has its own one-way OR-guard — see
-- user_calibration_status-add-stability-window.sql's header for that precedent). This
-- migration applies the same "guard inside the upsert's on-conflict clause" approach: only
-- adopt the incoming accuracy_value/tier/answer_count when the incoming write's
-- answer_count is >= the row's current answer_count.
--
-- >= not > : a real current flow (Undo immediately followed by Redo landing back on the
-- exact same answer_count, with the async RANKING_TEST_SET ratings fetch resolving in
-- between) can legitimately re-fire a write at an unchanged answer_count carrying a more
-- complete stability-window computation than the first write at that count did (see
-- computeStabilityWindowUpdate's ratingsByAlbum-null skip in commitComputation.ts). A
-- strict `>` would silently drop that second, more-complete write. `>=` keeps today's
-- existing "last write wins" behavior on a true tie (harmless — accuracy_value/tier are
-- pure functions of the answer list, so two writes at the same answer_count should already
-- compute identical values for those two fields) while still fully blocking a genuinely
-- older/smaller answer_count from ever overwriting a newer/larger one, which is the actual
-- race this fixes.
--
-- Deliberately scoped to accuracy_value/tier/answer_count only. last_eligible_top10 and
-- last_change_answer_index keep the existing plain excluded.* overwrite — their own
-- staleness is already documented (in the prior two migrations' headers) as safe-direction/
-- delay-only, not a correctness risk, so widening the guard to them is out of scope here.
-- fired's existing OR-guard is unchanged.
--
-- Function is SECURITY INVOKER (the default, unchanged from every prior version) — RLS
-- still applies exactly as before.

-- Idempotent throughout (if not exists / or replace) — safe to re-run if a prior attempt
-- partially applied (e.g. the function create succeeding before a later statement in the
-- same script failed).
alter table user_calibration_status
  add column if not exists answer_count integer not null default 0;

-- Backfill existing rows (Dan's real account + the disposable QA test account, the only two
-- that exist) to their true current answer count, so the guard reflects real state
-- immediately rather than waiting for the next commit to establish a baseline. Harmless to
-- re-run.
update user_calibration_status s
set answer_count = coalesce(
  (select count(*) from user_calibration_answers a where a.user_id = s.user_id),
  0
);

drop function if exists upsert_calibration_status(uuid, text, double precision, jsonb, integer, boolean, jsonb, integer, boolean, boolean);
drop function if exists upsert_calibration_status(uuid, text, double precision, integer, jsonb, integer, boolean, jsonb, integer, boolean, boolean);

create or replace function upsert_calibration_status(
  p_user_id uuid,
  p_tier text,
  p_accuracy_value double precision,
  p_answer_count integer,
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
    user_id, tier, accuracy_value, answer_count,
    last_eligible_top10, last_change_answer_index, fired,
    previous_last_eligible_top10, previous_last_change_answer_index, previous_fired,
    last_commit_changed_window
  )
  values (
    p_user_id, p_tier, p_accuracy_value, p_answer_count,
    p_last_eligible_top10, p_last_change_answer_index, p_fired,
    p_previous_last_eligible_top10, p_previous_last_change_answer_index, p_previous_fired,
    p_last_commit_changed_window
  )
  on conflict (user_id) do update set
    tier = case when excluded.answer_count >= user_calibration_status.answer_count
                 then excluded.tier else user_calibration_status.tier end,
    accuracy_value = case when excluded.answer_count >= user_calibration_status.answer_count
                           then excluded.accuracy_value else user_calibration_status.accuracy_value end,
    answer_count = greatest(user_calibration_status.answer_count, excluded.answer_count),
    last_eligible_top10 = excluded.last_eligible_top10,
    last_change_answer_index = excluded.last_change_answer_index,
    fired = user_calibration_status.fired or excluded.fired,
    previous_last_eligible_top10 = excluded.previous_last_eligible_top10,
    previous_last_change_answer_index = excluded.previous_last_change_answer_index,
    previous_fired = excluded.previous_fired,
    last_commit_changed_window = excluded.last_commit_changed_window;
end;
$$ language plpgsql;

-- Manual verification (run in the Supabase SQL editor — runs as a superuser role there, so
-- this scratch user_id doesn't need a real auth.users row or RLS bypass). Simulates two
-- out-of-order writes landing in the "wrong" order and confirms accuracy_value/tier cannot
-- regress:
--
--   -- the LATER commit (answer_count=10) lands FIRST
--   select upsert_calibration_status(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'high', 0.92, 10,
--     '["a","b"]'::jsonb, 2, false, null, 0, false, false
--   );
--   -- the EARLIER commit (answer_count=9, stale) lands SECOND -- this is the race
--   select upsert_calibration_status(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'medium', 0.70, 9,
--     '["a"]'::jsonb, 1, false, null, 0, false, false
--   );
--   select accuracy_value, tier, answer_count from user_calibration_status
--     where user_id = '00000000-0000-0000-0000-000000000000';
--   -- expect: accuracy_value = 0.92, tier = 'high', answer_count = 10
--   -- (the stale answer_count=9 write must not regress any of the three)
--
--   -- cleanup:
--   -- delete from user_calibration_status where user_id = '00000000-0000-0000-0000-000000000000';
