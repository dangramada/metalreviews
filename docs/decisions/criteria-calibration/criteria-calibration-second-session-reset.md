# Criteria-calibration reset for a second validation session (2026-08-15)

Data operation, not a feature. Wiped Dan's completed 70-answer calibration session so a
second, independent session can be run — the prerequisite for revisiting the accuracy
thresholds and the `R = 12` stability window, both of which are currently calibrated against
a single real session (see `deferred-work.md`).

`album_criteria_ratings` was deliberately left untouched: the ratings are the *input* the new
session is validated against, and `RANKING_TEST_SET` was frozen from them.

## What was verified before deleting anything

1. **Identity.** `auth.users` id `eec42cd4-e714-46a2-ad9c-35714a1d3a2c` → `dan.gramada@gmail.com`,
   confirmed via the admin auth API. This is the id hardcoded throughout `docs/decisions/`
   as "Dan's account"; it had never actually been checked against the email before.
2. **`RANKING_TEST_SET` coverage.** All 13 albumIds have all 6 criteria rated for this account
   (78 rows), so `useRankingTestSetRatings` still returns a complete map post-reset — the
   Brief 3 auto-escalation signal keeps working.
3. **Fixture independence.** `REAL_PRODUCTION_SESSION_ANSWERS` and
   `DEGREE_ANOMALY_SESSION_ANSWERS` (`lib/criteria-calibration/fixtures.ts`), `DAN_58_ANSWERS`
   (`__tests__/fixtures/danSession.ts`) and `RANKING_TEST_SET` are all frozen literals. No test
   or script reads `user_calibration_answers` live — `persistence.test.ts` fully mocks
   `supabaseClient`. Deleting the table's rows cannot affect the suite. Confirmed: 297/297
   still pass post-reset.
4. **Backup.** `docs/decisions/backups/pre-reset-dan-account-2026-08-15.json` — 70 answers,
   30 weights, 1 status row. Not versioned: `docs/decisions/backups/` is gitignored
   (`.gitignore:16`), same convention as the `ranking-stability-log-*.jsonl` files that live
   in that directory. Referenced by path only, as those are.

## The delete-vs-upsert decision (the load-bearing part)

The pre-existing `scripts/archive-and-reset-calibration.ts` reset by **upserting**
`user_calibration_status` to `{tier:'none', accuracy_value:0}`. That was a complete reset when
written. **It no longer is**, and reusing it would have silently produced a half-reset account.

`supabase/user_calibration_status-add-answer-count-guard.sql` (added after that script) made
two fields deliberately non-decreasing:

- `answer_count = greatest(user_calibration_status.answer_count, excluded.answer_count)`
- `fired = user_calibration_status.fired or excluded.fired`

Those guards exist to defeat the out-of-order write race documented in
`criteria-calibration-weights-write-race.md` — they are correct and should stay. But they mean
**no upsert can ever clear either field.** An upsert-based "reset" would have left
`answer_count = 70` and any `fired` state intact under a `tier='none'` row, corrupting exactly
the stability-window signal the new session is meant to measure.

`DELETE` is therefore the only correct reset. It is also a state the code already handles:
`fetchPersistedStabilityWindow` (`persistence.ts:150`) returns
`INITIAL_PERSISTED_STABILITY_WINDOW` when `maybeSingle()` finds no row.

**`--reset` on the old script is now disabled** — it throws with a message pointing at the
replacement and exits non-zero, before touching the DB. `--export-only` is unaffected and
still safe. Left disabled rather than deleted so the reasoning stays discoverable at the
place someone would reach for the wrong tool.

## What was deleted

| Table | Before | After |
| --- | --- | --- |
| `user_calibration_answers` | 70 | 0 |
| `user_criterion_weights` | 30 | 0 |
| `user_calibration_status` | 1 | 0 |
| `album_criteria_ratings` | 80 | **80 (unchanged)** |

`user_criterion_weights` was not in the original brief; deleting it was an explicit decision
(Dan, 2026-08-15) on the grounds that an account showing 0% calibration while still scoring
albums with the finished session's weights is not a fresh state. Checked first that no
consumer breaks: the two readers outside the calibration flow — `AlbumRatingPage.tsx:102`
(radar tooltip) and `useAlbumRatingsSummary.ts:43` (score/rank badges) — both degrade
gracefully, since `computeScore` returns `null` on a missing weight and the album is skipped.
**Expected visible consequence:** score and rank badges are absent app-wide until the new
session's first commit repopulates the weights. That is inherent to the reset, not a bug.

## Fresh-state verification

- Resume degree resolves to `STARTING_DEGREE` (2) — `useCalibrationResume`'s reduce is seeded
  with it and folds over zero rows. Replayed against the live table.
- Status row is `null` → `INITIAL_PERSISTED_STABILITY_WINDOW`, so `fired`,
  `last_eligible_top10`, `last_change_answer_index`, `previous_*`,
  `last_commit_changed_window` and `answer_count` all start clean.
- `RANKING_TEST_SET` ratings intact: 78 rows, 13/13 fully rated.
- `tsc --noEmit` clean, `vitest` 297/297.

**Not verified:** the in-browser "0% progress, no resume state" check. The page is behind auth
and the session couldn't sign in. The DB state and the code path consuming it are both
verified, so this is expected to hold — but it is an inference, not an observation. Worth a
glance before starting the new session.

## Incidental finding, corrected

The audit initially flagged `useRankingTestSetRatings.ts:36` as a cross-user pollution risk
because it filters only on `album_id`, with no `user_id`. **That was wrong and is retracted:**
`album_criteria_ratings` has RLS enabled with `using (auth.uid() = user_id)`
(`album_criteria_ratings.sql:35-41`), so the frontend query is already per-user at the DB
layer — the existing `deferred-work.md` entry's "correctly RLS-scoped" wording was accurate.

What survives is narrower and logged as a sub-note under that entry: the scoping is *implicit*
and worth making explicit during the per-user rework. The genuinely important corollary is
that **service-key scripts bypass RLS**, so any script touching this table must filter on
`user_id` explicitly — both scripts added here do.

## Files

- `scripts/verify-pre-reset-step0.ts` — read-only audit + backup export
- `scripts/reset-calibration-2026-08-15.ts` — the reset, with before/after counts, an
  `album_criteria_ratings` invariant check, an other-users-unchanged guard, and the Step 2
  fresh-state checks
- `scripts/archive-and-reset-calibration.ts` — `--reset` disabled (throws)
