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
