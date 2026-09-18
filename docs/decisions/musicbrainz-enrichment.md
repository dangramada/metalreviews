# MusicBrainz enrichment (current state)

Consolidates `artwork.md`, `genre-data.md`, `genre-artwork-bugfixes.md`, and `release-date.md`
into one current-truth reference. Those four files are not deleted — they're the detailed
session-by-session record of how each mechanism below was arrived at (live-confirmed bugs,
rejected alternatives, exact verification steps) and remain the place to look for that level of
detail. This file exists so a future session (or Claude Code) can read one document and know
what's true today, instead of reconstructing it from four files' worth of "superseded by ___"
cross-references. See "History" at the bottom for the condensed timeline; see "Archived source
files" for what to do with the four originals.

Read this file before touching `scripts/musicbrainz.ts` or the MB/CAA fetch logic in
`scripts/ingest.ts`.

## The pipeline (`lookupMusicBrainz`, `scripts/musicbrainz.ts`)

```
Step A: GET /ws/2/release/?query=artist:"{band}" AND release:"{album}"&fmt=json
        → releases[0].id                    (mbid)
        → releases[0]['release-group'].id   (releaseGroupId)
        → releases[0]['artist-credit'][0].artist.id (artistMbid)

Step B (parallel):
  - GET /ws/2/release/{mbid}?inc=genres&fmt=json   → release.date, release.genres
  - GET coverartarchive.org/release-group/{releaseGroupId}  → artwork, tier 1
    (falls back to /release/{mbid} if the group lookup 404s  → artwork, tier 2)

Shared release-group detail fetch (reached if artwork tiers 1–2 both found nothing, OR
release.date is empty — fetched at most once, cached, regardless of how many fields need it):
  - GET /ws/2/release-group/{releaseGroupId}?inc=releases&fmt=json
    → releases[]              → artwork tier 3: sweep up to 10 siblings' CAA entries, first hit wins
    → first-release-date      → release-date fallback when release.date is empty

Step C (only if release.genres is empty):
  - GET /ws/2/artist/{artistMbid}?inc=genres&fmt=json  → artist.genres, fallback source
```

Up to 4 sequential MB requests per album lookup (Step A, Step B's release detail, Step C, the
shared release-group detail fetch), each separated by the mandatory 1 req/sec sleep. CAA calls
don't share MB's rate limit.

In `lookupMusicBrainz`, this is a single fetch into a plain cached variable (`releaseGroupDetail`),
gated on whichever field needs it first (`!artworkUrl || !releaseDate`) — both artwork tier 3 and
the release-date fallback then read from that same variable. No memoization wrapper is needed:
both consumers are sequential `await`s in one linear function, never concurrent.

## The one root cause behind most of this file

MB's release search (Step A) has no relevance sort, and the code always takes `releases[0]`.
That pick can be an arbitrary pressing — a regional edition, a promo, a bare-bones digital
listing — that's missing data a sibling release in the same release-group actually has. This one
fact explains three separate symptoms that were, for a while, investigated and fixed as if
unrelated:

- Artwork missing even though CAA has real, approved art for the release-group
- Genre tags empty even though the release-group/artist has them
- Release date null even though the album's release-group has a known `first-release-date`

## Current decisions, per field

### Artwork — release-group-first, tier-3 sibling sweep (shipped)

CAA is queried at the release-group level first, not the release level — CAA surfaces whichever
release in the group actually has approved art, sidestepping the arbitrary-pressing problem for
free (CAA isn't subject to MB's rate limit, so this cost nothing extra). If that 404s, tier 2
retries at the release level. If both fail, tier 3 sweeps up to 10 sibling releases in the
group. `pickArtwork()` prefers `front: true`, falls back to any `approved: true` image.

### Genre — release-level primary, artist-level fallback (shipped); tags rejected

Release-level `genres` (from Step B) sorted by count, top 3. When empty — which is the large
majority case: 97% empty on a 35-album live sample — Step C falls back to the artist's genres,
reusing the artist MBID already resolved in Step A (no second search; a name-only artist search
was tried first and rejected — it picked wrong-artist matches on relevance score with no
disambiguation, confirmed live on W.M.D. vs. a same-named chiptune project).

Rejected: release-group `tags` as an additional fallback source. Tested live against 35 albums:
only 10/31 matched albums had any tags at all, and of the 13 albums with zero genre data
anywhere (release + artist both empty), tags rescued only 2. Not enough yield to justify the
junk-tag filtering it would need (50% of albums with any tags had junk — German chart-site
artifacts).

Rejected (2026-09-18): release-group `genres` (`inc=genres`, distinct from `tags`) as a third
fallback tier, evaluated as part of the unified release-group fetch design below. Tested live
against all 62 catalog albums with release- and artist-level genre both confirmed empty and a
known release-group id: rescued only 5/62 (8%) — worse yield than the already-rejected `tags`
(15%), so not worth adding. Script: `scripts/diagnostics/diagnose-release-group-genre-yield-2026-09-18.ts`;
data: `docs/data/musicbrainz-enrichment/release-group-genre-yield-2026-09-18-output.csv`.

Known accepted limitation, not fixed: multi-artist-credit releases (e.g. a split album) only get
genres for `artist-credit[0]`, the first-billed artist.

### Release date — release-level primary, release-group fallback added 2026-09-18

Release-level `release.date` (same Step B call as genres) is the primary source, kept as `text`
(not a Postgres `date`) because MB returns partial precision (`"2024"`, `"2024-03"`,
`"2024-03-15"`). A `releaseDatePrecision()` helper (0=null, 1=year, 2=year-month, 3=full) governs
the merge guard: a fresher but coarser value never overwrites a more precise stored one — this is
intentionally different from artwork/genre's simpler "fresh-if-non-null" merge rule.

Shipped 2026-09-18: when `release.date` is empty, fall back to the release-group's
`first-release-date`, read off the same shared `releaseGroupDetail` fetch artwork tier 3 uses
(`GET /ws/2/release-group/{releaseGroupId}?inc=releases&fmt=json` — `first-release-date` is
a base-response field, present regardless of the `inc=releases` param, so no second request is
needed to get both). Confirmed live on Chelsea Grin's self-titled EP: neither matching release in
Step A's search response carries a `date` field at all, while the release-group carries
`first-release-date: "2008-07-27"`. This is the same "arbitrary pressing" root cause as
artwork/genre, just previously unaddressed for date specifically.

(An earlier version of this section described the fallback as already shipped before the code
existed — that was written ahead of the actual implementation during discovery. The design and
code landed together in this same pass, unified with artwork tier 3 behind one shared
release-group fetch rather than each field making its own — see "The pipeline" above.)

Reconciles a prior decision, doesn't contradict it. `release-date.md`'s June 2026 "What NOT to
change" section says: "Do not use release-group `first-release-date` — the existing
release-level call is sufficient for new-release reviews." That was scoped to newly-released
albums, where MB indexes the specific pressing quickly. The gap this fixes is different:
back-catalogue / retrospective reviews (e.g. MetalStorm reviewing an old EP), where the matched
release may never get a community-contributed date at all. Both are true in their own scope —
recorded here explicitly so a future session doesn't read the old line as a blanket rule.

Precision interaction: `first-release-date` is sometimes year-only even when a full date exists
on some sibling release. Run it through the same `releaseDatePrecision()` merge guard as
everything else — never let it overwrite a more precise value already resolved from Step B or a
previous ingest run.

### Type (Album / EP / Compilation / Live) — not yet captured, available for free

The release-group fetch added above also returns `primary-type` in the same response (confirmed:
Chelsea Grin → `"EP"`). Not currently stored anywhere. Flagged here because it's a candidate
input for the separate, not-yet-speced "flag retrospective/back-catalogue reviews" work — a type
check could complement or replace date-diffing for AOTY eligibility. Not designed or decided;
just noting it falls out of a fetch this doc already commits to making.

## Related mechanism — don't reinvent for future retrospective-review work

`manual-albums.md` already has a `getReleaseYear()` helper (`src/App.tsx`) and a soft
year-mismatch notice pattern (AddAlbumDrawer: warns when MB's resolved year differs from the
selected dropdown year, non-blocking). Any future "this review is for an old album" detection
should reuse `getReleaseYear()` rather than writing new date-diff logic — the derivation and edge
cases (partial dates, null handling) are already solved there.

## Rate-limit budget note

The shared release-group fetch now triggers on either artwork tiers 1–2 failing OR
`release.date` being empty — a broader condition than the old artwork-only Tier 3 gate, so it
fires on more rows (any row missing either field, not just artwork). It's still capped at one
request per `lookupMusicBrainz` call regardless of how many fields need it, so the added volume
is bounded the same way it always was — worth watching if ingest starts hitting rate-limit
friction, but not a blocker.

## What NOT to change

- Don't apply the artwork/genre "fresh-if-non-null" merge pattern to `releaseDate` — it must
  stay precision-aware.
- Don't reintroduce a name-only artist search for genre fallback — reuse the artist MBID from
  Step A.
- Don't re-propose `tags` as a genre fallback without new evidence — already tested and rejected
  with real numbers (see above).
- Don't re-propose release-group `genres` as a genre fallback either — tested and rejected with
  real numbers (8% yield, worse than `tags`' already-rejected 15% — see above).
- Don't treat the old `release-date.md` "no release-group" line as still-universal — it's
  correctly scoped to new releases, not retrospective ones.
- Don't give artwork tier 3 and the release-date fallback their own separate release-group
  fetches — they must share the single cached `releaseGroupDetail` fetch. Re-splitting them
  reintroduces the "up to one more request per field" cost this design specifically avoided.
- Don't reintroduce a memoized-Promise wrapper for the release-group fetch — both consumers are
  sequential `await`s in one linear function, never concurrent, so a plain cached variable is
  sufficient and was chosen over a Promise-caching closure after code review (2026-09-18).

## History (condensed)

- June 2026 — Genre lookup (two-level) and release-date field shipped. Source badge relocated
  onto artwork block.
- 2026-07-17 — Genre fallback fixed: artist MBID reused from Step A instead of a fresh
  name-only artist search (was matching wrong same-named artists). `tags`-as-fallback
  investigated on 35 live albums and rejected (see evidence above).
- 2026-09-05 — Documentation governance rule written (two-layer ownership, indexing).
- 2026-09-17 — Artwork Concern E: `releases[0]` arbitrary-pick problem identified and fixed for
  artwork via release-group-first + tier-3 sibling sweep. Same root cause left unaddressed for
  date/genre at the time.
- 2026-09-18 — Same root cause fixed for release date: release-group `first-release-date`
  fallback, prompted by a MetalStorm retrospective-review-detection discussion. This file
  written to consolidate artwork/genre-data/genre-artwork-bugfixes/release-date into one
  current-state reference.
- 2026-09-18 (later same day) — Unified the release-group fallback: artwork tier 3 and the
  release-date fallback now share one release-group fetch (a plain cached variable, not a
  memoized-Promise wrapper — code review flagged the wrapper as solving a concurrency problem
  that doesn't exist here) instead of each field growing its own ad hoc release-group request
  (the date fallback added earlier this day was documented but not yet actually implemented —
  landed here). Live-diagnosed and rejected release-group `genres` as a third genre-fallback
  tier (8% yield on 62 confirmed-empty albums, worse than `tags`' already-rejected 15%). 52/52
  files, 401/401 tests, `tsc` clean.

## Archived source files

`artwork.md`, `genre-data.md`, `genre-artwork-bugfixes.md`, `release-date.md` keep their full
session-by-session detail (live verification steps, exact test counts, rejected-alternative
reasoning) and are not deleted. Recommended treatment, applied in this same commit:

1. A one-line banner at the top of each of the four files:
   `> Current state consolidated into musicbrainz-enrichment.md — this file kept for
   historical/session detail only.`
2. `CLAUDE.md`'s "Past decisions" index: `musicbrainz-enrichment.md` added as the primary entry
   for MB/CAA logic, the four existing entries' descriptions shortened to make clear they're
   historical detail, not the current-state read.
3. `architecture.md`'s pointer updated to point at this file instead of the four originals.
