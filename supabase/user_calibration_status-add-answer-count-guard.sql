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
-- >= not > : NOT because of the stability-window fields (see below — this guard doesn't
-- touch them at all, so a `>=`-vs-`>` choice here can't affect their completeness either
-- way; an earlier version of this comment incorrectly attributed the choice to that
-- mechanism). The real reason: accuracy_value/tier are pure functions of the answer list
-- content, so two writes landing at the SAME answer_count (e.g. Undo immediately followed by
-- Redo of the exact same answer) always compute identical values for these two fields —
-- content-tie-safe regardless of which lands last. But answer_count can also tie via two
-- DIFFERENT answer-list states reaching the same length (Undo, then a *different* real
-- answer than the one undone) — a strict `>` would reject BOTH writes at that count after
-- the first one lands (excluded.answer_count > stored is false on every subsequent write at
-- that same count, forever), permanently freezing the field at whichever write happened to
-- land first, even if a later write at the same count is the one that actually reflects the
-- current DB state. `>=` avoids that freeze: a tie always adopts the incoming write, which
-- reproduces today's pre-fix "last write wins" behavior on ties specifically (not a
-- regression) while still fully blocking a genuinely older/smaller answer_count from ever
-- overwriting a newer/larger one, which is the actual race this fixes.
--
-- Deliberately scoped to accuracy_value/tier/answer_count only. last_eligible_top10 and
-- last_change_answer_index keep the existing plain excluded.* overwrite, completely
-- unaffected by this migration's guard either way. IMPORTANT, re-verified 2026-08-15 (see
-- criteria-calibration-weights-write-race.md's dated addendum and
-- scripts/verify-write-race-guard.ts's check #4): the "staleness here only delays firing,
-- never falsely un-fires" argument from the prior two migrations' headers does NOT cleanly
-- cover these two fields for the specific mechanism found this session. A write computed
-- before the RANKING_TEST_SET ratings fetch resolved (commitComputation.ts's
-- ratingsByAlbum-null skip) carries the client's PRIOR window state; if that write's HTTP
-- response resolves at the DB *after* a later write (e.g. an Undo+Redo of the same commit,
-- computed once ratings had resolved) already advanced last_eligible_top10/
-- last_change_answer_index forward, the stale write silently overwrites them backward —
-- confirmed live: last_change_answer_index regressed from 11 to 4 in the verification
-- script's check #4. A regressed (smaller) last_change_answer_index makes a later resumed
-- session compute a LARGER apparent stability span than the true trajectory, which could
-- fire the auto-escalation signal EARLIER than it should, not just later. This is a real,
-- pre-existing gap (not introduced or worsened by this migration — these fields were always
-- unguarded), left unfixed here because it was out of scope for the accuracy_value/tier bug
-- this migration addresses; tracked as a new, distinct item in deferred-work.md. fired's
-- existing OR-guard is unchanged and still fully protects fired specifically from regressing
-- true -> false, independent of this gap.
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
