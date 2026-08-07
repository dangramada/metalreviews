# Skip non-review posts during ingest (roundups, retrospective columns)

**Date:** 2026-07-17
**Preceded by:** `docs/decisions/unknown-band-collision-audit.md` (read-only investigation this
fix implements). See that file for the full evidence trail — feed dumps, site-search recurrence
counts, and the `extractBandAlbum` dry-run classification.

## Problem

Angry Metal Guy's and The Progressive Subway's ingested RSS feeds are whole-site blog feeds, not
reviews-only feeds. Roundup posts ("Record(s) o' the Month", "Our `<Month>` Albums of the
Month!") and recurring retrospective columns ("Yer Metal Is Olde", "Lost in Time") get parsed by
`extractBandAlbum` the same as real reviews, producing garbage `band`/`album` values or falling
into the shared `Unknown Band | Unknown Album` collision sentinel (see
`album-identity-diagnosis.md` Finding 6 — not fixed here, only its most active contributor is
prevented from recurring).

## Decision

Detection switches from a phrase denylist to **RSS `<category>` tag checking**, per source, with
an explicit allowlist for one confirmed false-negative franchise.

- `isGenuineReview(item, source)` — checks `item.categories` (an array `rss-parser` already
  provides; previously unread by `scripts/ingest.ts`) for the source's review-category tag:
  - Angry Metal Guy: `Reviews` or `Review`
  - The Progressive Subway: `Album Reviews`
  - Metal Storm: no check — confirmed structurally review-only (its feed and the site's own
    paginated review index carry no roundup/list content). Adding a tag check for this source
    would be dead code.
- `isAllowlistedFranchise(item, source)` — checks for `Angry Metal Guy's Unsigned Band Rodeo`
  (AMG only). This is a genuine-review franchise filed under its own category instead of
  `Reviews`. Confirmed via the WordPress REST API (`wp-json/wp/v2/posts?slug=...&_embed`) across
  6 sampled Rodeo posts — the category taxonomy is consistently `Angry Metal Guy's Unsigned Band
  Rodeo` (straight apostrophe, no umlaut — the umlaut only appears in display titles/H1s, not the
  taxonomy name), while `Reviews`/`Review` is present only as a post *tag* on some (not all)
  Rodeo posts, never as the post's category. RSS `<category>` elements from WordPress include
  both taxonomies (categories and tags) undifferentiated, which is why checking for the category
  string against `item.categories` works even though it's technically a mixed category+tag list.
- Posts that fail both checks are skipped entirely (no `albums`/`reviews` row) and logged to a
  new `skipped_posts` table (`supabase/skipped_posts.sql`) for later manual review.

### Accepted content loss

Retrospective columns ("Yer Metal Is Olde", "Lost in Time") and the Rodeo franchise's sibling
"The Willowtip Files" are genuine reviews of old catalog, not new releases, and lack the review
tag. They are skipped like roundups, not allowlisted — a deliberate simplification, not an
oversight. Before this fix they were ingested with a franchise-prefix-polluted band field
(e.g. `"Yer Metal Is Olde: Stratovarius"`); after this fix they're skipped and logged instead.
This is a behavior change, understood and accepted per the brief.

The one franchise that *is* allowlisted (Unsigned Band Rodeo) still has its own known,
unfixed pollution: the band field reads `"AMG's Unsigned Band Rodeö: <Band>"` instead of
`"<Band>"`, because `extractBandAlbum` is untouched by this brief. A future brief could strip
this prefix the same way existing boilerplate (`" Review"`, `"Review: "`) is already stripped.

### Judgment call, not decided

The allowlist has exactly one confirmed entry. Other AMG franchises the audit flagged ("AMG Goes
Ranking", annual list posts) were not individually verified to the same depth and are *not*
allowlisted — they fall through to "skip" under the default logic. If a genuine-but-differently-
tagged franchise turns up later (visible via the `skipped_posts` log), add it then; do not add
speculative entries preemptively.

## What was NOT touched

- `extractBandAlbum` — untouched, this adds a pre-filter in front of it.
- `resolveAlbumIdentity`, MB lookup, score normalization, merge-guard logic.
- The `Unknown Band | Unknown Album` collision mechanism — this removes its most active known
  contributor (roundups/columns), but doesn't fix the sentinel itself.
- Multi-artist split releases — no parsing change.

## Implementation

`scripts/ingest.ts`:
- `REVIEW_CATEGORY_TAGS` / `ALLOWLISTED_FRANCHISE_CATEGORIES` — per-source config maps.
- `isGenuineReview`, `isAllowlistedFranchise`, `shouldSkipPost` (exported for tests).
- `logSkippedPost` — fire-and-forget insert into `skipped_posts`; wrapped in try/catch and never
  throws, matching the existing pattern of swallowing Supabase read/write failures elsewhere in
  this file. A logging failure must not block real review ingestion.
- Wired into `fetchAngryMetalGuy` and `fetchProgressiveSubway`, filtering `feed.items` before the
  existing `extractBandAlbum` map step. `fetchMetalStorm` unchanged.

Tests: `scripts/__tests__/ingest.test.ts` — roundup skipped, retrospective column skipped,
allowlisted Rodeo post NOT skipped, normal AMG/PS reviews NOT skipped, Metal Storm never skipped.

## Verification (live ingest run, post-ship)

Run `npm run ingest` and confirm:
- A known roundup post produces a `skipped_posts` row and no `albums`/`reviews` row.
- A known retrospective-column post is also skipped and logged.
- A known allowlisted Rodeo post still ingests normally (franchise-prefix pollution expected,
  not a regression).
- Normal reviews from all three sources continue to ingest unaffected.

## Addendum: AMG "Into the Obscure" denylist (2026-07-26)

### Problem

A retrospective-column post ("Into to the Obscure: Cianide – Death, Doom and Destruction") was
ingested as a normal scored review (blank artwork, no release date) instead of being skipped like
other retrospective columns. AMG's "Into the Obscure" column never carries a numeric score by
editorial convention, but this post was mistagged with **both** `Into the Obscure` and
`Review`/`Reviews` categories, so `isGenuineReview` passed it through — the original logic here is
allow-by-tag only and has no way to say "skip regardless of what else is tagged."

Checked 8 prior "Into the Obscure" posts via the WordPress REST API
(`wp-json/wp/v2/posts?slug=...&_embed`): none carried `Review`/`Reviews`, so all 8 were correctly
skipped historically. The Cianide post is the first known instance of AMG tagging this column with
the review tag — a mistagging, not a pattern change, but one that broke the allow-by-tag
assumption.

### Decision

Added a denylist check that runs before (and overrides) `isGenuineReview`/`isAllowlistedFranchise`:

- `DENYLISTED_FRANCHISE_CATEGORIES` (`scripts/ingest.ts`) — `Angry Metal Guy: ['Into the Obscure']`.
- `isDenylistedFranchise(item, source)` — same shape as `isGenuineReview`/`isAllowlistedFranchise`.
- `shouldSkipPost` now checks `isDenylistedFranchise` first and skips unconditionally on a match,
  before the allowlist/review-tag checks run. A stray `Review`/`Reviews` tag can no longer override
  a denylist match.

Deliberately a short, single-entry list, same convention as the allowlist — do not add speculative
entries; add a new one only when a similar mistagging is confirmed for another franchise.

**Scope:** Angry Metal Guy only. `isGenuineReview`, `isAllowlistedFranchise`, and the existing
Rodeo allowlist entry were not touched.

Tests added to `scripts/__tests__/ingest.test.ts`: the mistagged Into the Obscure case is skipped;
the Rodeo allowlist case still is not (confirms the denylist doesn't affect allowlist behavior).

### Manual data correction (same day)

The live Cianide row had already been ingested before the fix shipped. Corrected manually in
Supabase, following the same pattern as `stale-row-cleanup.md`:
- Logged to `skipped_posts` (reason `non_review_category`).
- Deleted the `reviews` row (`a0ee59d1-a7dd-4888-b691-848d24a446bc`).
- Deleted its `albums` row (`8ab3a8a1-c3a0-423d-b3c8-fd6f70b8abe3`) — confirmed no other review
  referenced that `album_id` before deleting, so nothing was orphaned.

No `skipped_posts` schema change. This was a one-off manual cleanup, not an automated backfill —
future mistagged posts of this kind will be caught at ingest time by the code fix above.

## Addendum: AMG "Stuck in the Filter" denylist + Rodeo allowlist→denylist move (2026-08-07)

### "Stuck in the Filter" — same mistagging pattern as Into the Obscure

Live post "Stuck in the Filter: May 2026's Angry Misses" was ingested as a normal review
(`score: null`, `mb_lookup_attempts: 0`) instead of being skipped. Diagnosed via a fresh-process
check importing `isGenuineReview`/`isDenylistedFranchise`/`shouldSkipPost` directly from the
on-disk `scripts/ingest.ts` against the live AMG feed: the post carries both `Reviews`/`Review`
and its franchise tags (`Stuck in the Filter`, `Stuck in the Filter 2026`) — same mistagging shape
as the Into the Obscure case above, and "Stuck in the Filter" was never added to the denylist.

Checked via WordPress REST API (`wp-json/wp/v2/posts?search=...&_embed`) across the May 2026 and
April 2026 editions: both carry the plain `Stuck in the Filter` tag (not just the dated
`Stuck in the Filter 2026` variant), and `isDenylistedFranchise` does exact-string `.includes()`
matching — so one denylist entry (`'Stuck in the Filter'`) is sufficient; no need for a second
entry covering the dated variant.

Added to `DENYLISTED_FRANCHISE_CATEGORIES['Angry Metal Guy']` in `scripts/ingest.ts` (commit
`f14d27c`). Test added to `scripts/__tests__/ingest.test.ts` mirroring the Into the Obscure case.

**A live regression happened between the fix committing and pushing:** the fix commit sat on
local `master` only, unpushed, when the scheduled GitHub Actions ingest workflow
(`.github/workflows/ingest.yml`) fired against the deployed Render service — still running the
pre-fix commit — and re-ingested the same post a second time. Confirmed via GitHub's public
Actions API (run `31135417218`, `event: schedule`, `head_sha` matching the pre-fix
`origin/master` HEAD) cross-referenced against a fresh Supabase query showing a new `albums` row
created 3 minutes after that run fired. The fix commit was pushed once this was confirmed. Worth
noting for future fixes: **commit-then-push should happen as one motion** for anything the
scheduled ingest cron could pick up in between, not treated as two independently-timed steps.

### "Unsigned Band Rodeo" — moved from allowlist to denylist

`ALLOWLISTED_FRANCHISE_CATEGORIES['Angry Metal Guy']` previously allowlisted
`"Angry Metal Guy's Unsigned Band Rodeo"` on the basis that individual editions are genuine
reviews with real scores. Revisited after a live search
(`https://www.angrymetalguy.com/?s=Rode%C3%B6`, 12 result pages) surfaced enough title-format
variance that no single robust extraction pattern is achievable:

- Standard format: `AMG's Unsigned Band Rodeö: <Band> – <Album>` — but album titles can
  themselves contain `:`, breaking naive delimiter-based splitting.
- Non-standard "special edition" titles that don't follow the band–album pattern at all, e.g.
  "The Graying of Dave the Red: Taking Megadeth's Last Stand to the Rodeö" and "Learning Senjutsu
  at the AMG Rodeö: Putting the New(ish) Iron Maiden Album Out to Pasture" — franchise name isn't
  even at the start, band/album aren't in a parseable position.
- Reviews are also collective (4-5 different writers, each giving their own qualitative verdict —
  "Mixed", "2.5/5.0", "Bad" — with no single aggregate numeric score), a second, separate problem
  beyond name extraction.

Given the format-inconsistency risk (any regex fix is likely to silently mis-extract on some
future edition) and the unresolved multi-score problem, denylisting is more consistent with how
Into the Obscure and Stuck in the Filter are already handled than investing in a fragile parser —
same tradeoff already accepted for "Yer Metal Is Olde" and PS's "Lost in Time" (see
`unknown-band-collision-audit.md`). Moved in `scripts/ingest.ts` (commit `0fb8410`): removed from
`ALLOWLISTED_FRANCHISE_CATEGORIES`, added to `DENYLISTED_FRANCHISE_CATEGORIES`. The old
allowlist-confirming test was repurposed into a denylist-confirming test; a second test using the
real live title shape ("Beware of Gods") was added.

**Scope:** Angry Metal Guy only, both changes. `isGenuineReview`, `isAllowlistedFranchise`,
`isDenylistedFranchise` function logic untouched — both are data-only moves within/into the
existing denylist map. `extractBandAlbum` itself untouched — if another franchise surfaces the
same title-pollution pattern in the future, that's a separate decision, not implied fixed here.

### Manual data correction (same session)

Three live bad rows corrected, same pattern as the Into the Obscure cleanup above — orphan-check
before delete, insert/confirm a `skipped_posts` row, delete `reviews` then `albums`, re-verify via
fresh lookup rather than the delete call's own reported count:

- "Stuck in the Filter: May 2026's Angry Misses" (the regression-created copy) — `reviews.id
  a14cff1d-e346-43ee-8e4c-0e4dfcf5589f`, `albums.id 476f15ec-c82e-41df-8b54-f366753686b5`. A
  `skipped_posts` row for this URL already existed from an earlier same-day cleanup pass; not
  duplicated.
- "AMG's Unsigned Band Rodeö: Beware of Gods" — `reviews.id
  ab4429d8-ef60-47ad-bfde-559d8ce53df1`, `albums.id 7f87eef1-3fd8-4bb1-bd69-ff7078308585`. No
  prior `skipped_posts` row existed (it was never skipped before — it was allowlisted); a fresh
  one was inserted.
- "Into to the Obscure: Cianide – Death, Doom and Destruction" — a **second**, differently-ID'd
  copy of the row already cleaned up in the 2026-07-26 addendum above (`reviews.id
  8753001c-cc67-42fc-bdb1-e30b5c6b6f84`, `albums.id 47c1e4b8-340e-4705-8e98-768aefb0bae0`,
  `mb_lookup_attempts: 16`). Its `skipped_posts` row from 2026-07-26 was already correct and
  covering; not duplicated. **How this second copy was created is not diagnosed — logged as open
  in `deferred-work.md`, not resolved by this cleanup.**

### Verification (fresh-process check, post-fix)

Imported `isGenuineReview`/`isAllowlistedFranchise`/`isDenylistedFranchise`/`shouldSkipPost`
directly from on-disk `scripts/ingest.ts` in a brand-new process against the live AMG feed:
- The live "Beware of Gods" Rodeo post now evaluates `shouldSkipPost: true`.
- The live "Stuck in the Filter" post still evaluates `shouldSkipPost: true` (no regression).
- A normal current AMG review ("Horrifier – Revelations of Gore") still evaluates
  `shouldSkipPost: false`.

A full `npm run ingest` was intentionally not run as part of this verification (would risk writing
unrelated new rows from whatever else is currently in the feed) — the fresh-process check above
was judged sufficient to confirm the logic.
