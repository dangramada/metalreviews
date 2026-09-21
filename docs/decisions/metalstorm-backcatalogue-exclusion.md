# Metal Storm back-catalogue exclusion

## The problem

Metal Storm reviews albums well after their actual release — unlike Angry Metal Guy, The
Progressive Subway, and Sputnik, whose coverage runs close to simultaneous with release. Its
RSS feed mixes brand-new reviews in with reviews of years-old back-catalogue albums, and this
site's ingest pipeline scrapes every review the same way regardless of how old the reviewed
album actually is. The result: a "Newest" home page sorted by review-publish date can surface
a review of a 1984 or 2007 album right alongside 2026 releases, with nothing to tell them apart
— stale content presented as if it were new.

## The rule

Computed in `src/App.tsx`'s `filterMetalStormBackCatalogue()`, applied to the Supabase response
right after fetch, before `.map(fromAlbumWithReviews)`:

> A review is hidden if `source === 'Metal Storm'` **and** `release_date` is non-null **and**
> `published_at` is non-null **and** the gap between them exceeds 365 days.

(Originally shipped as a calendar-year comparison — `getReleaseYear(release_date) !==
<current year>` — replaced 2026-09-21; see "2026-09-21 fix" below. The rest of this doc's
rationale about *why* a Metal Storm review goes stale still applies; only the threshold
mechanism changed.)

Only the Metal Storm review on an album is hidden — not the whole album. If the same album also
has an Angry Metal Guy or Progressive Subway review, that review still shows; the card simply
degrades from multi-source to single-source instead of disappearing. An album loses its
attached Metal Storm review this way is untouched. This is why the filter runs on each album's
*nested* `reviews` array rather than pre-filtering rows out of the query — it needs to preserve
whatever other sources are still attached.

`release_date` `null` stays visible — fail-safe, unchanged from every other null-date handling
in this app. A never-enriched album (MusicBrainz lookup pending or failed) shouldn't be
penalized twice by also losing its review.

## Design rationale

- **Why per-review, not per-album:** an album can have up to three reviews (one per source). A
  Metal Storm back-catalogue review says nothing about whether the *album*'s AMG or PS coverage
  is also stale — those sources don't have this problem, so only the specific offending review
  is removed.
- **Why computed at fetch time, not a stored flag:** a stored "is_back_catalogue" column would
  need a migration and a backfill script, and would go stale the moment a `release_date` gets
  corrected upstream (MusicBrainz re-enrichment, or a manual same-title-collision fix — see
  below). Computing it in-memory on every load means that case self-corrects automatically, with
  no backfill ever required — **retroactive by construction**. (The gap rule's own two inputs,
  `release_date` and `published_at`, don't change with the passage of time the way the original
  calendar-year comparison did — see "2026-09-21 fix" below — so this is no longer also buying
  immunity from a `now`-rollover cliff; it's still the right call for the upstream-correction
  case alone.) The tradeoff is a small amount of repeated computation on every page load,
  which is negligible against a home-page dataset in the low hundreds of rows.
- **Why `/favorites` is untouched:** `useFavoritesList` has its own separate query
  (`favorites -> albums(...reviews(...))`) and doesn't share this code path. Favoriting is a
  personal action independent of how "new" a review is — a user who favorited an album via its
  Metal Storm review should still see that review on their favorites list regardless of the
  album's age. Confirmed by reading the hook directly: no `release_date`/`getReleaseYear`
  reference anywhere in it.

## Why this was paused, and why it's safe now

This filter was designed and approved earlier in the same session it's now shipped in, then
paused before implementation: a live screenshot of the Khemmis album surfaced the same-title
release-group collision bug (`docs/decisions/album-identity/album-identity-same-title-release-
group-collision.md`) — Khemmis's `release_date` was showing `2013-11-14` because Step A's
ambiguous MusicBrainz search had attached a 2013 EP's data to a review of the real 2026 album.
Since this filter trusts `release_date` as ground truth, a wrong `release_date` could make a
genuinely new review look like back-catalogue and disappear — the exact failure mode this
filter exists to avoid, just self-inflicted instead of Metal-Storm-caused. Implementation was
paused pending that diagnostic.

That diagnostic is now closed (29/29 same-title-collision pairs accounted for — 9 corrected, 6
confirmed-safe-and-protected, 8 artwork-matched, 5 ambiguous-no-defect, 1 untouched). A fresh
cross-check confirmed **zero overlap** between the 29 flagged pairs and this filter's affected
rows — Khemmis itself was the only pair that had actually touched this filter's hidden-list,
and it's now corrected. Safe to implement.

## Current live count (re-run fresh at implementation time, 2026-09-18 — do not reuse older figures)

```
Total Metal Storm reviews: 78
release_date null (shown, fail-safe): 6
release_date = current year 2026 (shown): 66
release_date = non-current year (hidden): 6
```

Hidden reviews, all single-source (no other source has reviewed these albums, so each hidden
review takes its whole album row down with it — confirmed live, not assumed):

- Chelsea Grin — Chelsea Grin (2008)
- Conducting From The Grave — Revenants (2010)
- Arizmenda — Stillbirth In The Temple Of Venus (2015)
- Samhain — Initium (1984)
- The Black Dahlia Murder — Deflorate (2009)
- The Black Dahlia Murder — Nocturnal (2007)

This is down from an original count of 7 (the diagnostic that first surfaced this problem) —
Khemmis dropped off the list after its same-title-collision correction, confirming this
filter's own retroactive-by-construction claim before it even shipped: fixing the underlying
`release_date` was enough on its own, no filter-side change needed.

## Verification

- New unit test file `src/__tests__/metalStormBackCatalogue.test.ts` (8 tests): the required
  multi-source-degrade case (AMG + excluded Metal Storm → renders single-source, not
  multi-source with a gap — bridges through `fromAlbumWithReviews` to confirm the actual
  render-decision data, not just the filter's own output shape), null-date fail-safe,
  current-year keep, non-current-year drop, source-specificity (rule never applies to non-
  Metal-Storm reviews), whole-row drop when the only review is excluded, and a
  no-over-filtering guard (a genuine multi-source current-year album stays multi-source).
  Also covers the zero-review-row edge case directly (a row that arrives with no reviews at
  all must pass through unchanged, not get caught by the "drop if empty" step meant only for
  rows this filter actually emptied) — this one wasn't in the original spec; it surfaced as a
  real regression against `App.favorites.test.tsx`'s existing zero-review-branch test during
  implementation and is now guarded against explicitly.
- Full suite: 409/409 (401 existing + 8 new). `tsc -p tsconfig.app.json`: 210 pre-existing
  errors, confirmed identical with the change stashed (via `git stash -u`, including the new
  untracked test file) and unstashed.
- Live-verified against the real dataset: all 6 currently-hidden albums confirmed absent from
  the rendered home page; a currently-visible 2026 Metal Storm review (Khemmis) confirmed still
  showing; no new console errors introduced.

## 2026-09-21 fix: calendar-year cliff → release-to-review gap

The original calendar-year rule tied "is this back-catalogue" to *today's* date rather than the
album's actual age: every review of a late-in-the-year album would have silently disappeared the
moment the calendar rolled over (e.g. every 2026 review vanishing on 2027-01-01), with nothing in
the underlying data having changed. Bug, not intended behavior — caught before it could actually
fire (no calendar boundary had been crossed yet since this filter shipped 2026-09-18).

Fix: replaced the calendar-year comparison with a direct gap check between the album's
`release_date` and *that specific review's own* `published_at` (already present per-review on
`NestedReviewRow`, no schema change) — hide only if the gap exceeds 365 days. This also removes
the `now` parameter from `filterMetalStormBackCatalogue()` entirely: the result is now fixed by
the row's own two dates, never affected by when the page happens to load. `getReleaseYear()` is
unchanged and still used elsewhere (`FavoritesPage.tsx`, `useAlbumRatingsSummary.ts`).

Both fail-safes stay: `release_date` null shows (unchanged), and `published_at` null now gets the
same treatment (gap can't be computed, so don't hide) — previously moot since only `release_date`
was consulted.

**Verification:**
- `src/__tests__/metalStormBackCatalogue.test.ts` rewritten from calendar-year mocking (a fixed
  `NOW_2026` injected date) to gap-based cases — this also means the suite no longer needs any
  date-freezing at all. 10 tests: the required multi-source-degrade case, within-12-months keep,
  null-`release_date` fail-safe, null-`published_at` fail-safe (new), over-12-months drop,
  source-specificity, whole-row drop, multi-source no-over-filtering, and — the case this fix
  exists for — a same-January release-and-review pair confirmed still visible regardless of how
  late in the year "today" is (gap is release→review, never review→today).
- New read-only diagnostic `scripts/diagnostics/verify-metalstorm-gap-rule-2026-09-21.ts`
  compares both rules against every real Metal Storm row: 0 rows where the two rules' verdicts
  differ (expected, since no calendar boundary has been crossed since this filter shipped), 8
  hidden under the new rule (up from 6 on 2026-09-18 — 2 more Metal Storm back-catalogue reviews
  ingested since, both with multi-year gaps, not a fix-caused change). All 6 originally-flagged
  albums (Chelsea Grin, Conducting From The Grave, Arizmenda, Samhain, The Black Dahlia Murder
  x2) confirmed still hidden — their gaps are thousands of days, nowhere near the 365-day line.
- Full suite: 448/448 (446 existing + 2 net new). `tsc --noEmit`: clean.

## What NOT to change

- Don't move this filter to be a stored column/flag — the whole point is that it never needs a
  backfill. See "Why computed at fetch time" above.
- Don't apply the gap rule to any source besides Metal Storm — AMG/PS/Sputnik don't have this
  back-catalogue problem, and applying the rule broadly would start hiding recently-published
  reviews of older reissues/deluxe editions on those sources for no reason.
- Don't reintroduce a `now`/calendar-year dependency into this filter — that's the exact bug the
  2026-09-21 fix above removed. The gap must stay release_date → published_at, never anything →
  today.
- Don't drop an album row just because it currently has zero reviews on load — only drop it
  when this specific filter is what took it from ≥1 review down to zero. `AlbumCard`'s
  zero-review branch is unreachable via the real query (`reviews!inner`) but is still exercised
  directly by tests as shared plumbing (see `dbMapping.ts`) — this filter must never be the
  reason that branch becomes unreachable in tests too.
