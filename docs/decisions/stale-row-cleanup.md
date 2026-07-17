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
