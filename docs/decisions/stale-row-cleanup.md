# Cleanup: 4 pre-fix stale non-review rows

**Date:** 2026-07-17
**Follows:** `docs/decisions/unknown-band-collision-audit.md` (found these rows),
`docs/decisions/roundup-skip-fix.md` (the fix that prevents new occurrences; explicitly left
these existing rows untouched, deferring cleanup to this session).

## What this was

4 specific `reviews` rows, identified by the audit as non-review content (roundups, retrospective
columns) ingested before the skip fix shipped, were reviewed and migrated to `skipped_posts` /
deleted. **Deliberately narrow scope** — these 4 rows only, not a general sweep.

## Dry run

Before any write, queried each target row, its parent `albums` row, and a full reference count
(other `reviews` rows + `favorites` rows) against that `album_id`. Confirmed and reported to Dan
before proceeding — see conversation for the full dry-run output.

**Result: only 3 of the 4 listed rows actually existed.** The 4th (PS "Lost in Time: Exotic
Animal Petting Zoo – Tree of Tongues") had never been ingested — it was first seen by the feed
*after* the skip-fix shipped, so the fix caught it live (already logged to `skipped_posts` with
`reason='non_review_category'` during the fix's own verification pass). Nothing to clean up for
that one.

For each of the 3 that did exist, the parent `albums` row had exactly 1 review (itself) and 0
favorites — confirmed safe to delete both, no orphaning risk. This included the `Unknown Band |
Unknown Album` sentinel (`album_id=ec4e4739-ede6-4b82-a401-58e28082e1f7`) — its review count was
exactly 1 as expected, no surprise second occupant.

## Migration performed

For each of the 3 rows:
1. Inserted into `skipped_posts` with `reason='backfilled_non_review_cleanup'` (distinct from
   `'non_review_category'`, which is reserved for the live ingest-fix path — these two reasons
   distinguish manually-migrated backfill rows from ones the running fix catches in real time).
2. Deleted the `reviews` row.
3. Re-checked the parent `albums` row for remaining references (0 reviews, 0 favorites in all 3
   cases) and deleted it.

| Row | `album_id` | Outcome |
|---|---|---|
| PS "Our June 2026 Albums of the Month!" (the sentinel) | `ec4e4739-ede6-4b82-a401-58e28082e1f7` | review + album deleted |
| AMG "Yer Metal Is Olde: Stratovarius – Episode" | `44712edc-72f6-49b9-a184-169e637ca027` | review + album deleted |
| AMG "Record(s) o' the Month – April 2026" | `0fcf7622-41ce-496a-b239-c728194e2d22` | review + album deleted |
| PS "Lost in Time: Exotic Animal Petting Zoo" | — | no row existed, no action taken |

One implementation snag during the run: the first pass checked `favorites` for an `id` column
(matching a pattern used elsewhere), but `favorites` has no `id` column — it's keyed by
`(user_id, album_id, created_at)`. The 3 review deletions had already succeeded by that point;
the album-deletion step was re-run afterward querying `favorites.user_id` instead, with no
further issues.

## Row counts

| | Before | After |
|---|---|---|
| `albums` | 149 | 146 |
| `reviews` | 148 | 145 |
| `skipped_posts` | 8 (duplicated 4 from an earlier verification pass, see roundup-skip-fix.md) | 11 |

## What was NOT touched

- No other `reviews`/`albums` rows beyond these 3 — no broader sweep.
- No changes to `extractBandAlbum`, the ingest pipeline, or the skip-detection logic.
- No changes to `skipped_posts`'s schema.
- No attempt to recover what the `Unknown Band | Unknown Album` sentinel held before 2026-07-13 —
  confirmed unrecoverable by the audit, unchanged here. The sentinel's `norm_key` is simply free
  again for a future parse failure to occupy; the underlying collision mechanism (one row per
  norm_key, silently overwritten) is not fixed by this cleanup.

## Second cleanup pass (2026-07-17, later same day)

**Follows:** `unknown-band-collision-audit.md` §7 (regression diagnosis — a stale, long-lived
local `tsx server.ts` process, running since before the skip-fix commit, executed pre-fix ingest
code via the local Refresh button at `2026-07-17T20:11:51 UTC`, recreating rows for posts the fix
should have skipped). Root cause confirmed as a one-time operational fluke, not a code defect —
the current code, run fresh, correctly skips all of these posts. No code change was made or
needed; this is the same category of cleanup as the pass above, applied to a second, separate
batch of rows with different IDs.

**Scope grew from 3 to 4 mid-session.** The cleanup brief initially listed only the same 3 posts
as the first pass (this time with new IDs from the regression run). It explicitly assumed "Lost
in Time: Exotic Animal Petting Zoo – Tree of Tongues" was clean — reasoning that the *first*
cleanup pass had found no row for it (caught live by the fix before it ever got one, see the "no
row existed" entry above). The confirmation check for this second pass found that assumption no
longer held: the regression run had *also* created a live `reviews` row for "Lost in Time"
(`id=d86002a6-fb67-498b-ab1c-4c59e3334606`), with no accompanying `skipped_posts` log at the
regression timestamp — same pattern as the other 3, and consistent with `unknown-band-collision-
audit.md` §7 Finding 4, which had already identified this as a 4th affected row from the same
batch. Flagged back to Dan per the brief's explicit instruction rather than assumed clean; Dan
confirmed to include it. All 4 rows were migrated together.

### Rows migrated (second pass)

| Row | New `reviews.id` (2026-07-17T20:11:51 UTC batch) | `album_id` | Outcome |
|---|---|---|---|
| PS "Our June 2026 Albums of the Month!" (sentinel) | `01b52b74-1d47-490a-85e3-e61ecc7080e4` | `53faf84b-14d9-4ae5-88d1-dab239ef20a5` | review + album deleted |
| AMG "Record(s) o' the Month – April 2026" | `fb3f1350-3666-4865-b213-50f7abe821bc` | `373c6393-7eb0-4d1b-950f-2f220aba60d1` | review + album deleted |
| AMG "Yer Metal Is Olde: Stratovarius – Episode" | `fa559cc1-f700-4423-a650-bdc251043918` | `01e05c7b-6cc3-469f-a188-6535c2ffe88c` | review + album deleted |
| PS "Lost in Time: Exotic Animal Petting Zoo – Tree of Tongues" | `d86002a6-fb67-498b-ab1c-4c59e3334606` | `83143e09-3a77-4e79-87ea-2f4a6b955ea5` | review + album deleted |

Same procedure as the first pass: confirmed each row's existence/title/URL and each parent
album's reference count (exactly 1 review, 0 favorites, in all 4 cases — no accidental favoriting
occurred in the interim) before writing. All 4 inserted into `skipped_posts` with
`reason='backfilled_non_review_cleanup'` (same reason value as the first pass — same category of
action, a second occurrence), then their `reviews` and `albums` rows deleted.

### Row counts (second pass)

| | Before | After |
|---|---|---|
| `albums` | 150 | 146 |
| `reviews` | 149 | 145 |
| `skipped_posts` | 11 | 15 |

Combined across both cleanup passes on 2026-07-17: `albums` and `reviews` are both back to 146 /
145 — the same counts the first pass left them at — confirming this second batch was purely
additive noise from the regression and is now fully reconciled back to the pre-regression state.

### What was NOT touched (second pass)

- No other rows beyond these 4 — no broader sweep beyond what
  `unknown-band-collision-audit.md` §7's exhaustive sweep (every URL ever logged to
  `skipped_posts`, cross-checked against `reviews`) had already confirmed was the complete set.
- No code changes — root cause was the stale local process, not the skip-detection logic, which
  was re-verified live and correct before this cleanup began.
- The stale `tsx server.ts` process itself was not restarted or killed as part of this session —
  it was still running at the time of this cleanup. Restarting it is an operational step for Dan,
  not a data-cleanup action.

## Third cleanup pass (2026-07-20)

**Follows:** a diagnosis session (2026-07-19) that found 4 *different* stale non-review
`reviews` rows while investigating an unrelated score-collapse bug — different album/month
values from either prior pass, confirmed not previously handled. Diagnosis confirmed all 4
`published_at` dates predate the skip-fix's 2026-07-17 ship date, so this is the same category
of incomplete-backfill cleanup as the first two passes, not a live gap in the fix. None of the 4
appeared in `skipped_posts` beforehand.

### Rows migrated (third pass)

| Row | `reviews.id` | `album_id` | `published_at` | Outcome |
|---|---|---|---|---|
| AMG "Yer Metal is Olde: Warning" – *Watching from a Distance* | `eWVybWV0YWxpc29sZGU6d2FybmluZ193YXRjaGluZ2Zyb21hZGlzdGFuY2U=` | `656d9f7f-0907-4ada-b474-7cecf53ad836` | 2026-06-12 | review + album deleted |
| AMG "The Willowtip Files: Commit Suicide" – *Synthetics* | `dGhld2lsbG93dGlwZmlsZXM6Y29tbWl0c3VpY2lkZV9zeW50aGV0aWNz` | `7447ce84-2427-42a0-9382-eb3d7b68142f` | 2026-06-21 | review + album deleted |
| AMG "Stuck in the Filter" – *April 2026's Angry Misses* | `c3R1Y2tpbnRoZWZpbHRlcl9hcHJpbDIwMjbigJlzYW5ncnltaXNzZXM=` | `cb1f7633-db18-4d46-aa6b-d8536d822452` | 2026-07-02 | review + album deleted |
| AMG "Record(s) o' the Month" – *March 2026* | `cmVjb3JkKHMpb+KAmXRoZW1vbnRoX21hcmNoMjAyNg==` | `d6e43476-2a07-42cd-a672-1c610499aaac` | 2026-06-13 | review + album deleted |

Same procedure as the prior two passes: dry run confirmed each row's existence and each parent
album's reference count (exactly 1 review, 0 favorites, in all 4 cases) before writing, reported
to Dan, and only proceeded on explicit confirmation. Each row inserted into `skipped_posts` with
`reason='backfilled_non_review_cleanup'`, then its `reviews` and `albums` rows deleted; the
`albums` reference count was re-checked immediately after each `reviews` delete (not assumed from
the dry run) before the `albums` delete ran.

### Row counts (third pass)

| | Before | After |
|---|---|---|
| `albums` | 151 | 147 |
| `reviews` | 151 | 147 |
| `skipped_posts` | 4 (post-dedup, see below) | 8 |

### What was NOT touched (third pass)

- No other rows beyond these 4 — no broader sweep.
- No changes to `extractBandAlbum`, `resolveAlbumIdentity`, or the skip-detection logic.

## Separate: `skipped_posts` backfill dedup (2026-07-20)

In the same investigation, `logSkippedPost` was found to have no dedup check before insert —
every `npm run ingest` run unconditionally re-logged every non-review post still present in the
RSS feed's current window, even if already logged on a prior run. This had produced 40 rows in
`skipped_posts` from just 12 manual ingest runs across the 2026-07-17 and 2026-07-19 debugging
sessions (4 distinct URLs, up to 12 duplicate rows each) — confirmed to be normal repeated manual
`npm run ingest` invocations, not a rogue or scheduled process.

The ingest-side fix (a `url`-based existence check in `logSkippedPost` before insert, covered by
`scripts/__tests__/logSkippedPost.test.ts`) stops new duplicates going forward and is tracked in
`docs/decisions/deferred-work.md` rather than a standalone doc, per explicit direction. Separately,
the 40 pre-existing duplicate rows were backfill-deduped: for each of the 4 duplicated URLs, the
earliest row (the original live-fix catch, `reason='non_review_category'`) was kept and all later
duplicate rows — including the `reason='backfilled_non_review_cleanup'` rows written by the second
cleanup pass above — were deleted. Confirmed via dry run and reported before any write.

`skipped_posts`: 40 → 4 (one row per distinct URL, verified by a post-delete scan).
