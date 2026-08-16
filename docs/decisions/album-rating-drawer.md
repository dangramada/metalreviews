# Album rating drawer — Criteria Calibration part 6: gate + drawer + score/rank

Branch: `album-rating-drawer`, branched from `master` after merging
`criteria-calibration-wiring` (parts 5a+5b) — that branch was not yet merged when this
session started; step 0 merged it (`--no-ff`, tag `pre-album-rating-drawer-merge`) before
branching. Scope: let a user rate a favorited album against the 6 criteria and see a rank
badge, using the calibration weights persisted by part 5b. No engine/schema/Calibration UI
files touched — only reads `user_criterion_weights`/`user_calibration_status`, writes to
`album_criteria_ratings` (schema already existed from part 3).

## Part A — the gate

`src/hooks/useCalibrationGate.ts` fetches the current user's `user_calibration_status.tier`
(`.maybeSingle()` — no row is treated the same as `'none'`). Gate passes for
`'medium' | 'high' | 'very_high'`. `FavoritesPage.handleRate` checks this before opening the
drawer; when blocked, shows a `DialogRoot` (same primitive `AddAlbumDrawer` already uses for
its discard-confirm) with copy pointing at `/criteria-calibration`. New copy, flagged for
review at plan time: title "Calibrate your criteria first", body explaining why, "Go to
calibration" / "Not now" buttons. Verified live: blocked correctly for a fresh account
(`tier === 'none'`), navigated correctly on "Go to calibration".

## Part B — the rating drawer

`src/components/album-rating/AlbumRatingDrawer.tsx` — one row per criterion (from
`useCriteriaCatalog`, reused from part 5a), each a `RadioCardRoot`/`RadioCardItem` (an
existing but previously-unused UI wrapper at `src/components/ui/radio-card.tsx`) with the 5
levels. Direct level-picker, not the Calibration UI's pairwise `ComparisonRow`/`OptionCard` —
structurally different, so a new component rather than a reuse.

**Progressive save** (not save-on-completion): every pick immediately `upsert`s one row to
`album_criteria_ratings` on the table's own composite PK
`(user_id, album_id, criterion_id)`. Chosen because save-on-completion would silently lose
progress on an accidental close, and because 5b already established "save every real answer
as it happens" as this feature area's persistence convention. Verified live: closing and
reopening the drawer mid-session re-fetches and pre-selects existing picks; a fresh
`performance.getEntriesByType('resource')` check showed both the fetch-on-open and the
`on_conflict=user_id,album_id,criterion_id` upsert firing per pick.

An album is **evaluated** once `ratings.size === 6` — computed client-side, no schema flag.
At that point the drawer body swaps to a confirmation view (score, rank, all 6 picks) — the
only place the full breakdown is shown, per the brief's display split.

## Part C — score and rank

`src/lib/album-rating/scoreAndRank.ts` — `computeScore` sums `user_criterion_weights.value`
for the 6 rated (criterion, level) pairs, returning `null` (not throwing) on a missing
lookup. `rankAlbum` sorts descending by score, tie-break by `albumId` string compare.
`src/hooks/useAlbumRatingsSummary.ts` fetches all fully-rated albums for the user, joins
`albums.release_date` (via the existing `getReleaseYear` helper), and computes a
`Map<albumId, {score, rank}>` per release year.

**Rank recalculation is lifted and shared, not per-card**: `useAlbumRatingsSummary` is called
once in `FavoritesPage`, and the resulting map is passed down to every
`FavoriteListItemRow`. `AlbumRatingDrawer` takes `onRatingChange`, fired after every
successful save, wired to the summary's `refetch()`. Verified live: rating a second album in
the same year immediately flipped the *first* album's rank badge in the background list,
with no reload — confirming edits propagate across cards, not just the one being edited.

**Favorites card**: `rankBadge` (new `theme.ts` export, inline-chip style matching
`genreBadge`, on the accent palette) shows only `#N`, no score/breakdown. Rate control is a
`FaSlidersH` icon button next to the existing remove (trash) button — `FaStar` was the first
instinct but was rejected: the dashboard `AlbumCard` (`src/App.tsx`) already uses
`FaHeart`/`FaRegHeart` as the favorite-toggle, and a star sitting right next to genre badges
on the same row would read as a second, confusing favorite marker.

### Finding: the solver's normalization claim doesn't hold on real data — display clamped

`solver.ts`'s header comment claims "the best-level values across all criteria sum to
exactly 1." Verified live against a real account's persisted `user_criterion_weights`
(Medium tier, 15 degree-2 answers) rather than assumed: **the level-5 values summed to
1.308**, and a real rating (4/4/3/4/3/3 across the 6 criteria) computed a raw score of 122%.

Root cause: each `LevelValue.point` is the midpoint of an *independently* solved min/max
range for that one (criterion, level) — normalization is enforced *within* each individual
LP solve, but nothing re-enforces it *jointly* across the resulting midpoints, so their sum
isn't guaranteed to equal 1. It is worse the more under-determined the session is, making
Medium-tier-only (the feature's actual minimum gate) close to the worst case.

**Related to, but distinct from, `criteria-calibration/criteria-calibration-engine.md`'s "Part 4 finding"**: both
trace to the same root methodology — solving each free (criterion, level) variable via its
own separate LP rather than jointly — but they hit different downstream consumers. Part 4's
finding is about `computeSolverAccuracy` averaging independent *feasible-range widths*,
which feeds the accuracy-tier display (Low/Medium/High) and was found to be blind to real
degree-3+ ranking improvement. This finding is about the independent range *midpoints*
(`LevelValue.point`) themselves, which feed the score shown here — a different symptom of
the same "solve-each-axis-separately" under-determination, not a re-discovery of Part 4's
exact issue. Flagging the cross-reference so a future session doesn't re-investigate the same
under-determination a third time as if it were new.

**Decision (confirmed with Dan)**: clamp the *displayed* percentage to 100
(`Math.min(100, ...)`) rather than showing a number that can exceed 100%, and leave a
comment pointing at this doc. Ranking is unaffected — it only compares raw (unclamped) sums
within a year, so relative order is still consistent even though the absolute score is
inflated. A real fix (jointly re-normalizing the point estimates, or reporting the phase-1
solution instead of independent per-value midpoints) is out of scope for this session —
`solver.ts` is a locked engine file — and is added to `deferred-work.md`.

**New display caveat introduced by the clamp itself**: the clamp trades one distortion for
another at the top end specifically. Before clamping, an inflated raw score at least
preserved *relative* differences (a 95%-raw and a 122%-raw album showed as visibly
different numbers). After clamping, any two albums whose raw scores both exceed 100% will
display identically as "100%", even though a properly-normalized solver might have shown
them as, say, 95% and 100% — a real quality difference the clamp now hides at exactly the
high-scoring end where a user is most likely to be comparing top albums. Rank order still
reflects the real (unclamped) difference between them — only the displayed percentage
compresses it. Not fixed here (same locked-file constraint as above), but worth knowing this
is a second, clamp-introduced caveat on top of the original inflation, not just a rounding
quirk.

### Related finding: Medium tier can't distinguish middle levels, so exact score ties are common

Observed live, not just theoretically: rating two different albums 4/4/3/4/3/3 and
2/2/2/2/2/2 produced the *same* raw score. Checking the fetched weights explains why — for
every criterion, `value(level 2) === value(level 3) === value(level 4)` exactly, only level
5 differs from them. Medium tier's degree-2 questions only ever compare each criterion's
*extreme* levels (1 vs 5 — visible directly in the calibration UI's question cards), so
levels 2–4 are never directly probed and the LP has no basis to differentiate them; they
land on the same midpoint under monotonicity alone. This means the deterministic
`albumId`-based tie-break in `rankAlbum` — written defensively for an assumed-rare edge case
("ties are unlikely with real-valued scores") — is actually doing real, load-bearing work at
Medium tier, not handling a corner case. Not a bug to fix here (consistent with the engine's
already-documented under-determination scope), but worth knowing: rank ordering among
Medium-tier-only users will often reduce to something close to "who favorited first," not a
real preference signal, until a user answers degree-3+ questions. Noted for
`deferred-work.md` alongside the normalization finding, not fixed in this session.

## Files

New: `src/hooks/useCalibrationGate.ts`, `src/hooks/useAlbumRatingsSummary.ts`,
`src/components/album-rating/AlbumRatingDrawer.tsx`, `src/lib/album-rating/scoreAndRank.ts`,
`src/__tests__/scoreAndRank.test.ts`. Modified: `src/FavoritesPage.tsx` (rank badge + rate
control on `FavoriteListItemRow`, gate/drawer wiring in `FavoritesPage`),
`src/theme.ts` (`rankBadge` export), `src/__tests__/FavoritesPage.test.tsx` (stubbed the two
new calibration tables so the pre-existing Add Album tests don't need to know about part 6).

## Not touched

Nothing under `criteria-calibration/` (engine, UI components, schema). No Ranked Albums hub,
year selector, or shareable output page — deferred pending their own Concept Draft pass, per
the brief. No batch-rating flow.

## Manual verification

Live against the dev server + real Supabase data, logged in as Dan: completed a real
15-question Medium-tier calibration session from `/favorites`'s gate dialog; confirmed the
gate blocks pre-calibration and passes post-Medium; rated "Black Sites – For Eternity" across
all 6 criteria, confirmed each pick's upsert fired (`on_conflict=user_id,album_id,criterion_id`)
via `performance.getEntriesByType('resource')`; closed and reopened the drawer, confirmed all
6 picks pre-filled from persisted rows; discovered and fixed the >100% display bug (above);
rated a second album ("TodoMal – Graveyards of Joy") and confirmed both albums' rank badges
updated live, matching hand-verified tie-break-by-`albumId` ordering given their (surprising
but correctly explained, see above) exactly-tied raw scores.

## Definition of done — status

All eight DoD items from the brief met, with one addition beyond scope: gate blocks/passes
correctly; drawer sets all 6 criteria from real catalog data; score (clamped, with root cause
documented) and rank computed and verified against real persisted data; Favorites badge shows
rank only; new copy flagged (gate dialog text, rate-control icon/aria-labels, rank badge
format); manually verified live end-to-end; no `criteria-calibration/` files touched; single
feature commit + this doc in a separate commit, matching prior parts' convention. The >100%
display bug was found and fixed *during* this session's own verification step, not deferred —
consistent with the brief's explicit instruction to verify the normalization claim rather
than assume it.
