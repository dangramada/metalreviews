# Session decisions — Album artwork (June 2026)

> Current state consolidated into musicbrainz-enrichment.md — this file kept for historical/session detail only.

## What was built

- Album artwork is fetched during ingestion via **MusicBrainz** (release search) then **Cover Art Archive** (front image URL). Stored as `artworkUrl: string | null` on every review object.
- Artwork is displayed at the top of each card as a square block. Score badge moved from the card body into the artwork block, absolutely positioned bottom-right.
- Double-Positive detection and its UI (cyan border, star badge) were removed entirely. `isDoublePositive` is kept as an optional field in the type to avoid breaking existing JSON reads.

## Key patterns introduced

**`ArtworkBlock` component** (`src/App.tsx`): Extracted as a sibling function (not a separate file) so each card gets its own isolated `useState(false)` for `loaded` without prop-drilling a Map. Pattern to reuse if other per-card stateful UI is needed.

**Skeleton shimmer**: Uses Chakra's `<Skeleton>` as a `position="absolute"` overlay with `opacity={loaded ? 0 : 1}` and `transition="opacity 0.3s ease"`. Deliberately does **not** use Chakra's `isLoaded` prop — that would instantly remove the shimmer element, bypassing the CSS fade. `pointerEvents="none"` prevents the invisible skeleton from blocking clicks after load.

**Square artwork aspect ratio**: Uses `paddingBottom="100%"` on a `position="relative"` Box (not Chakra's `AspectRatio` component) so absolutely-positioned children (image, skeleton, score badge) all stack cleanly inside it.

**`overflow: 'hidden'` on cardStyle**: Required so the artwork image clips to the card's `borderRadius: 'lg'` at the top corners.

## Thumbnail URL transform (June 2026)

`artwork_url` is stored as the full-resolution CAA URL (e.g. `.../45148958831.jpg`). At render time, `ArtworkBlock` passes the URL through `toThumbnailUrl()` before setting `<img src>`, which inserts `-500` before the extension (→ `.../45148958831-500.jpg`). CAA pre-generates these thumbnails for every approved image; verified against 3 real releases from this project's data.

- `500` chosen over `1200`: card grid squares are small; no click-to-enlarge feature exists or is planned. Revisit only if one ships.
- Storage is **not** changed — no new DB column, no backfill. The transform is purely at render time.
- The `onError` fallback (`failed` state → placeholder) is the safety net for any release whose URL doesn't follow the convention (would 404 on the transformed URL). **Confirmed present** in `ArtworkBlock` as of June 2026.

## Load-failure fallback (June 2026)

`ArtworkBlock` holds a `failed: boolean` state (alongside `loaded`). `onError={() => setFailed(true)}` on the `<Image>` catches any load failure (CAA/archive.org 500s, 404s on non-standard thumbnail paths, etc.). When `failed` is true, the `<Image>` branch is not rendered (no broken img in DOM) and the `artworkUrl === null` placeholder (`♪ / No artwork found`) is shown instead. The skeleton shimmer is also resolved — the shimmer branch isn't rendered when `failed=true`, so it cannot animate indefinitely.

## MusicBrainz rate limiting

`fetchArtworkUrl` calls are **sequential** in `runIngestion` with a `sleep(1000)` between each one. MusicBrainz requires a max of 1 req/sec from a single client. The existing parallel RSS + rating fetches are unaffected. Required `User-Agent` header on every MB and CAA request: `MetalReviewsDashboard/1.0 (dan.gramada@gmail.com)`.

## CAA lookup: release-group first, release-level fallback (2026-07-30)

**Root cause found:** `scripts/musicbrainz.ts` took `releases[0].id` from the MB release
search (no relevance sort) and queried CAA at that single release's URL. MB often ties
multiple releases at score 100 in arbitrary order; if `releases[0]` happened to be a
pressing with no CAA-uploaded art (e.g. a vinyl/CD release with a sibling Digital Media
release that *does* have art), `artwork_url` was stored `null` even though art existed
for the album. Confirmed live on Immolation — *Descent*.

**Fix:** query CAA at the **release-group** level first (`GET
coverartarchive.org/release-group/{rg-id}`, using `release-group.id` already present on
the MB search response — no extra MB request or rate-limit cost), which surfaces art from
whichever release in the group has it. **Fall back to the release-level call**
(`/release/{mbid}`) only if the group lookup 404s/fails — CAA's own docs don't guarantee
group lookup succeeds whenever release-level would (it 404s if "the community have not
chosen an image to represent the release group"), so the fallback preserves prior
correctness for any edge case the group endpoint misses. Both endpoints return the same
response shape and the same release-level image URL format (`.../release/<mbid>/<file>.jpg`)
— confirmed live across 3 albums (Immolation, Opeth, Metallica), so no downstream
storage/rendering change was needed.

No backfill script: existing `artwork_url: null` rows are already retried on every ingest
run (see `genre-artwork-bugfixes.md`), so this self-heals on the next ingest pass.

## CAA request timeout (2026-08-01)

**Diagnostic finding:** after the release-group fix above, one album (Immolation —
*Descent*) still showed `artwork_url: null` after a backfill pass that correctly
populated its `genre`/`release_date` in the same run. Live-traced the cause: CAA's
`/release-group/{id}` and `/release/{mbid}` endpoints both **307-redirect through
`archive.org/download/mbid-.../index.json`** — not served directly by CAA's own host —
and archive.org's backing store was in a degraded state at the time (one request hung
indefinitely until killed manually; a second, unrelated release-group returned a `500`
from `nginx` after ~7s). Since `axios.get` had no `timeout` configured on either CAA
call, a hung/degraded response could block far longer than intended instead of failing
fast into the existing null/retry path. Confirmed this wasn't specific to one album —
the outage was on archive.org's side, affecting any CAA lookup at the time.

**Fix:** added `timeout: 8000` to both CAA calls (release-group primary + release-level
fallback). 8s chosen as long enough to tolerate normal network variance but short enough
not to meaningfully stall a full ingest run if several albums hit it in the same pass.
Verified the config actually fails fast: pointed the same axios options at a
simulated-hang endpoint (`httpbin.org/delay/30`) and confirmed it aborted at ~8.03s with
`ECONNABORTED`, rather than hanging.

MB calls (a different host, unaffected by this failure mode) were left untouched — no
shared axios instance exists in this file, each `axios.get` call configures its own
options independently, so this was a two-line, CAA-only change.

**Scope note:** this only makes failure detection faster — it does not change what
happens after a failure. `artwork_url` still ends up `null` and gets retried on the next
scheduled ingest run via the existing backfill logic; no retry-on-timeout loop was added.

## `lookupMusicBrainz` status field: not_found vs error (2026-09-17, Concern A)

**Root cause found:** a 2026-09-17 diagnostic pass (`scripts/diagnose-missing-artwork-2026-09-17.ts`
— full findings in the session brief, not committed to this repo) found 70 `albums` rows with
`artwork_url IS NULL`. Of the 57 where a fresh MB search found nothing, 10 previously had a
`mb_release_group_id` already stored — meaning a past ingest run *had* resolved them, which
means the "nothing found" result on this run is far more likely a transient failure (timeout,
rate-limit, network hiccup) than the release having vanished from MusicBrainz. Before this fix,
`lookupMusicBrainz`'s outer `try { ... } catch { return { artworkUrl: null, ... } }` in
`scripts/musicbrainz.ts` returned the exact same null/empty shape for a genuine zero-result
search as for a thrown network/HTTP error — nothing downstream could tell them apart.

**Why this mattered:** `selectAlbumBackfillCandidates` (`scripts/ingest.ts`) stops retrying an
album once an attached review has `mb_lookup_attempts >= 5` and is more than 14 days old. A run
of bad luck with transient errors burned through that budget exactly as fast as genuine
"not on MB" results — and once burned, the album was never looked at again even if it was a
real, findable release the whole time.

**Fix:** `MusicBrainzData` now carries `status: 'ok' | 'not_found' | 'error'` alongside the
existing fields — `'not_found'` for a confirmed empty release search, `'error'` for the outer
catch (request/network failure), `'ok'` on success. In the backfill loop
(`scripts/ingest.ts`), `mb_lookup_attempts` only increments when `status !== 'error'`:

```ts
mb_lookup_attempts: (rv.mb_lookup_attempts ?? 0) + (mbData.status === 'error' ? 0 : 1),
```

A transient failure no longer consumes the same 5-attempt/14-day budget as a confirmed
"not on MB" result — the album stays eligible for retry on the next run regardless of how many
times it previously errored. The RSS ingest loop was untouched — it already never increments
`mb_lookup_attempts` (see the existing comment at its write site).

**What NOT to change without re-reading this:** don't add retry/backoff logic inside
`lookupMusicBrainz` itself as an extension of this fix — that's a separate, larger design
decision (explicitly out of scope for this pass, see the session brief). This fix only stops
conflating errors with empty results; it does not change *when* or *how often* a retry happens
beyond the one-line budget change above.

**Scope note:** this pass did not touch the artwork-picker `front:true`-only filter, MB search
query normalization, or the exhausted-rows backfill script — those are separate concerns (B, C,
D) from the same 2026-09-17 diagnostic, each its own branch/session.

## Artwork picker: front-preferred, approved-fallback (2026-09-17, Concern B)

**Root cause found:** both CAA lookups in `lookupMusicBrainz` (release-group primary, release-
level fallback) did `images.find((img) => img.front === true)` and nothing else. An image can
be `approved: true` on CAA without being tagged `front: true` — confirmed live on MBID
`d13afb14-38d0-452b-b986-e3003c385856`. The 2026-09-17 diagnostic found 2 of 70 affected rows
(Raphael Weinroth-Browne — *Empyrean*; slq — *Crown Shyness*) had real, approved artwork that
the front-only filter was silently discarding.

**Fix:** extracted a shared `pickArtwork(images)` helper (prefers `front: true`, falls back to
the first `approved: true` image) and applied it at both CAA call sites, removing the
duplicated filter logic.

**Live verification (2026-09-17, post-fix):**
- `slq — Crown Shyness` — **confirmed fixed.** `lookupMusicBrainz` now returns a real
  `artworkUrl` (`https://coverartarchive.org/release/1a8800a9-.../45538565449.jpg`).
- `Raphael Weinroth-Browne — Empyrean` — **still returns `artworkUrl: null`,** but not because
  the picker fix failed: MB's release search for this album returns 3 releases with no
  relevance sort, and `releases[0]` resolves to `0a1681b0-95e1-4fca-a683-a072fed8c0f6` (no CAA
  entry at all — confirmed 404), not `d13afb14-38d0-452b-b986-e3003c385856` (the MBID with the
  approved image the diagnostic found). This is the separate, already-flagged "`releases[0]`
  arbitrary pick" issue — explicitly out of scope for both Concern A and B (see the session
  brief's scope boundary) and unaffected by this fix. This row will need that separate,
  larger change to `lookupMusicBrainz`'s Step A before it resolves.

MB was also observed 503-ing intermittently during this verification (one clean pass out of
three attempts) — consistent with Concern A's premise that MB failures are transient, not
"release doesn't exist."

## Concern C — closed as a diagnostic finding, no code shipped (2026-09-17)

**Premise checked, didn't hold as a systemic bug.** The brief anticipated a scraper-level
title-noise bug analogous to AMG's " Review" / PS's "Review: " boilerplate — e.g. `[Collaboration]`,
`(OST)`, `(Volume II)`, `(EP)` suffixes breaking MB's exact-match search. Diagnostic (grep of
all four fetchers in `scripts/ingest.ts`, plus a live query of every `albums` row containing
`[` or `(`) found:

- None of the four fetchers (AMG, PS, Metal Storm, Sputnik) currently strip any bracket/paren
  suffix — only the existing " Review"/"Review: " precedent exists.
- Only 5 of 314 `albums` rows contain `[` or `(` at all. Of those, `(Volume II)`,
  `(On the Heights of Despair)`, and two non-Latin-script titles are genuine parts of the album
  title (round parens) — not artifacts, confirmed by inspection.
- The one square-bracket case — `Nine Inch Nails — Nine Inch Noize [Collaboration]` — is Metal
  Storm's **own displayed album title** on their review page (`metalstorm.net/pub/review.php?
  review_id=21268`), not scraper-injected noise. A live scan of Metal Storm's reviews index
  (30+ titles across the three most recent months) found **zero** other bracket-tagged titles —
  this looks like a one-off tag MS applied to this specific unusual release, not a recurring
  pattern.
- "Ravaged by the Yeti" (the brief's other wrong-guess example) has no bracket noise at all —
  its MB miss is unrelated to title noise, just a genuine "not_found" now correctly tracked via
  Concern A's `status` field.

**Decision (Dan, 2026-09-17):** don't write stripping logic for a pattern with exactly one
confirmed, non-recurring occurrence — the risk/reward doesn't justify it, and a hardcoded
single-tag allowlist would be speculative rather than evidence-based. Concern C is closed with
no code change. The one affected row (`Nine Inch Nails — Nine Inch Noize [Collaboration]`)
moves into Concern D's scope as a normal unresolved-artwork row (its `status` will read
`'not_found'` per Concern A, since MB's actual catalogued title is `Nine Inch Noize` without
the suffix) — no special-cased fix is planned for it.

**If this resurfaces:** if a future diagnostic finds a *second* square-bracket or MS-specific
title-tag case, re-open this with both data points before writing a stripping rule — one
occurrence was correctly judged insufficient evidence of a real pattern.

**Reconfirmed by Concern D's clean re-run (below):** `Nine Inch Nails — Nine Inch Noize
[Collaboration]` came back `status: 'not_found'`, not `'error'` — a genuine MB miss under
non-flaky conditions, not a transient-failure false negative. This closure stands.

## Concern D — exhausted-rows backfill (2026-09-17)

**First re-run was contaminated, root-caused, fixed.** The first post-A+B diagnostic re-run
(`scripts/diagnostics/diagnose-missing-artwork-2026-09-17.ts`) reported 0 "already fixable"
rows out of 70 — contradicted immediately by a manual live check showing `slq — Crown Shyness`
resolves. Root cause: MB was intermittently 503-ing under this session's cumulative request
volume (confirmed live: two back-to-back calls for different albums returned `status: 'error'`
then `'ok'`), and the diagnostic's `classify()` never read `lookupMusicBrainz`'s `status` field
(Concern A) — an `'error'` verdict looked identical to a genuine `'not_found'`. Fixed: added a
`lookupWithRetry` wrapper (one retry after a 5s backoff) and a distinct `'error'` verdict bucket
excluded from real conclusions, applied to both the CSV output and the summary counts.

**Clean re-run results (70 albums with `artwork_url IS NULL`):**

| Count | Verdict |
|---|---|
| 5 | Already fixable today — shipped code (post A+B) resolves these; stale stored state hadn't caught up |
| 22 | MB knows the release, genuinely no approved CAA art anywhere in the group |
| 36 | Genuine MB miss (`not_found`) |
| 7 | Still `error` even after retry — MB genuinely degraded during this run, not actionable yet |

Full row-level detail: `docs/data/missing-artwork/diagnose-missing-artwork-2026-09-17-output.csv`
(now includes an `mb_status` column).

**Backfill applied.** `scripts/diagnostics/backfill-artwork-2026-09-17.ts` (`--report` then
`--apply`, following the report-then-apply convention from
`scripts/migrations/2026-07-album-identity-backfill-albums.ts`) re-verified each of the 5
"already fixable" rows live at run time (not just trusted from the CSV, given MB's flakiness
this session) and wrote the resulting enrichment via the existing `applyAlbumEnrichment`. All 5
applied cleanly and confirmed live against Supabase:

- Astral Alchemy — *Weaving Chilling Magical Dreamworlds*: artwork + genre (`black metal`) +
  `mb_release_group_id`
- Sinamort — *Breathing Cargo*: artwork + genre (doom/metal/progressive metal) + release date
  (2026-06-15) + `mb_release_group_id`
- Hours of Worship — *Resignation*: artwork only (genre still empty on MB)
- slq — *Crown Shyness*: artwork only (genre still empty on MB)
- Xenith — *To No Avail*: artwork only (genre/date/MBID already present)

**Closing the 7 `error` rows (second pass, same day).** Per explicit instruction: never
classify an `error` row as `not_found` — that's the exact mistake this session already caught
once. Added `--ids=<comma-separated>` to the diagnostic script so a re-run could be scoped to
just these 7 instead of re-sweeping all 70 (cheaper, less MB load). Waited ~2 minutes before
retrying, to reduce the chance of hitting the same session-cumulative flakiness again.

*Bug found and fixed mid-pass:* the scoped `--ids` run's first execution wrote to the same
output path as a full sweep, silently overwriting the 70-row CSV with only 7 rows — the file
was restored from git history and the script fixed to write scoped runs to a separate
`-output-rescope.csv` file going forward.

*Two rows (TDW, Nirriti) gave conflicting results across repeated live checks* — resolved
cleanly on one attempt, `error` on another, for the same exact query. Rather than trust either
result alone, each was re-checked a third time and classified by majority of clean (non-error)
signal, on the reasoning that a successful MB response is real data while a request failure is
pure noise, not evidence of anything:

| Row | Attempts | Final classification |
|---|---|---|
| TDW — Bane of the Talebearer OST | ok/no-art, error, ok/no-art (tie-break) | no approved CAA art |
| Nirriti — Dhrupad Anutpada... | not_found, error, not_found (tie-break, exact title) | genuine `not_found` |
| Solothurn — High Priestess | ok/no-art, ok/no-art | no approved CAA art |
| Ruin and Reverie — The Seed of Chaos | not_found, not_found | genuine `not_found` |
| Aaron Myers-Brooks — Fictional Planetoids | not_found, not_found | genuine `not_found` |
| Die Entweihung — Worldwide Terror | not_found, not_found | genuine `not_found` |
| Bees Made Honey In The Vein Tree — In Between Strides | ok/artwork, ok/artwork | **new backfill candidate** |

All 7 resolved to a real classification — **none were left ambiguous or defaulted to
`not_found`/organic-retry**, since every row got at least one clean, trustworthy signal across
the attempts.

**Bees Made Honey In The Vein Tree backfilled too.** Added to
`backfill-artwork-2026-09-17.ts`'s target list, `--report`'d, then `--apply`'d — confirmed live:
artwork + genre (doom metal/psychedelic rock/stoner rock on the `--report` pass) +
`mb_release_group_id`. One data-quality observation, not actioned: the `--report` and `--apply`
runs (minutes apart) returned different `genre`/`release_date` for this same album (empty vs.
populated) despite both reading `status: 'ok'` — `lookupMusicBrainz`'s internal
`Promise.allSettled` for the release-detail sub-fetch can silently fail without flipping the
top-level `status` away from `'ok'`, since only the outer `try/catch` is tracked. `artwork_url`
itself was consistent both times. Not fixed in this pass (out of Concern D's scope, and a
narrower version of the same class of problem Concern A solved for the top-level call) — noted
here for future reference if it recurs.

**Counts at this point (revised below — see Concern D.1):**

| Count | Verdict |
|---|---|
| 6 | Backfilled — all applied and confirmed live in Supabase |
| 24 | MB knows the release, genuinely no approved CAA art anywhere in the group |
| 40 | Genuine MB miss (`not_found`) |
| 0 | Still `error` |

The 6 backfilled: Astral Alchemy, Sinamort, Hours of Worship, slq, Xenith, Bees Made Honey In
The Vein Tree.

**Not actioned — left for organic/manual handling:** the 40 genuine `not_found` rows each need
individual manual investigation (typo, too new for MB, genuinely unlisted) — out of scope for
an automated backfill.

## Concern D.1 — the "24 no-CAA-art" count wasn't verified, same bug at a second location

**Finding.** `Raphael Weinroth-Browne — Empyrean` gave different verdicts across two
diagnostic runs: pre-Concern-D-fix, `FIX CONFIRMED, releases_checked: 3`; the clean re-run
above, `genuinely no CAA art, releases_in_group_checked: 0`. A `0` here is not a true reading
of a 3-release group — it's the exact error/empty conflation Concern A fixed at the top level,
present again, unfixed, in `checkRelaxedArtworkAcrossGroup`'s own `inc=releases` MB request:
its `try/catch` returned `{ found: false, releasesChecked: 0 }` on any request failure,
indistinguishable from a genuine empty group. `lookupWithRetry` (added for Concern D) only
wrapped the top-level `lookupMusicBrainz` call — this second, separate MB request had no such
protection.

**Quantified exposure:** of the 24 "no approved CAA art" rows, 14 had the same suspicious
`releases_in_group_checked: 0` signature (the brief that flagged this counted 12; 14 is the
true count against live data at merge time — TDW and Solothurn had been re-added with this
exact signature by Concern D's second pass, after the brief's count was taken).

**Fix (diagnostic-script-only, no production code touched — see scope boundary below):**
extracted `fetchReleaseGroupIds()` with the same retry-after-5s-backoff discipline as
`lookupWithRetry`, returning `status: 'ok' | 'error'` so a request failure can no longer be
silently read as "0 releases." `checkRelaxedArtworkAcrossGroup` and `classify()` now propagate
this as a `sweep_status` column, with a new verdict bucket ("sweep errored, NOT confirmed")
distinct from a genuinely-verified "no CAA art."

**Re-verification of all 14 suspicious rows** (`--ids`, two passes with a pause between, same
discipline as Concern D's original 7 `error` rows):

| Outcome | Count | Rows |
|---|---|---|
| Confirmed genuine no-CAA-art (verified sweep, ≥1 release actually checked) | 8 | TDW, Solothurn, Imperium, Only Echoes, Utilize the Remains, Fane, Urakka, Grey Shores |
| **Flipped — real artwork confirmed by the sweep** | 1 | Raphael Weinroth-Browne — Empyrean |
| Still unresolved after 2 independent attempts each — left unresolved, not forced | 5 | A World Worth Burning, Volubilis, Coma Control, Lord Carrion, W.M.D. |

**Weinroth-Browne is confirmed but NOT backfilled in this pass.** Its relaxed-sweep artwork
lives on release `d13afb14-38d0-452b-b986-e3003c385856` — a *different* release than
`releases[0]` (production's arbitrary pick) resolves to. Re-verified live immediately before
any write: the shipped `lookupMusicBrainz` still returns `artworkUrl: null` for this album (its
`releases[0]` pick has no CAA entry at all). `backfill-artwork-2026-09-17.ts` only ever writes
what the shipped code path resolves — adding this row to its target list would be a guaranteed
no-op `SKIP`, and hand-writing the sweep-found URL directly would mean writing production data
from a code path production doesn't actually run, undocumented and unreproducible by any
scheduled ingest. Per this pass's explicit scope boundary (no production code changes — that's
Concern E's job), this row stays unapplied until Concern E ships the `releases[0]` fix, at
which point it should resolve automatically through the normal organic/backfill path.

**The 5 still-unresolved rows are intentionally left unclassified**, not defaulted to
`not_found` or "no CAA art" — per explicit instruction, an `error` is noise, not evidence, and
this session already corrected one false "no CAA art" (Weinroth-Browne) that resulted from
exactly that mistake. MB was measurably more degraded for these specific queries across both
attempts (a mix of top-level and sweep-level failures) than for the other 9 rows checked in the
same window. Re-check in a later, separate session.

**Corrected, true final counts (70 rows):**

| Count | Verdict |
|---|---|
| 6 | Backfilled — applied and confirmed live in Supabase |
| 1 | Confirmed real artwork exists, blocked on Concern E (`releases[0]` fix) — not yet applied |
| 18 | Confirmed genuine no-CAA-art (sweep actually verified, not just assumed) |
| 40 | Genuine MB miss (`not_found`) |
| 5 | Unresolved — MB request/sweep errored on repeated attempts, needs a later re-check |

Full row-level detail (final, merged twice — Concern D's backfill classifications and Concern
D.1's re-verified sweep results): `docs/data/missing-artwork/diagnose-missing-artwork-2026-09-17-output.csv`.
Intermediate rescope-run data (both D and D.1 passes) kept at
`docs/data/missing-artwork/diagnose-missing-artwork-2026-09-17-output-rescope.csv` as
supporting evidence, not as the source of truth.

**What NOT to do with the 5 unresolved rows:** don't re-run them in a tight loop hoping for a
clean pass — this session already made a very large number of MB requests today, which is the
suspected cause of the flakiness in the first place. Give it real time (a different session) or
production's own scheduled retry before checking again.

**Definition-of-done status: Concern D (including D.1) is complete.** Concerns A, B, D shipped;
Concern C closed as a diagnostic finding with no code change and reconfirmed twice on clean
data. The remaining open items from this entire brief are: the `releases[0]` arbitrary-pick
issue (Concern E, tracked in `docs/decisions/deferred-work.md`, now additionally motivated by
the confirmed Weinroth-Browne case), and the 5 rows left unresolved above (not a new tracked
item — just needs a later re-run of the existing diagnostic).

## Concern E — `releases[0]` arbitrary pick, tier-3 artwork fallback (2026-09-17)

**Root cause (already established by Concern B and reconfirmed by D.1):** MB's release
search (Step A, `scripts/musicbrainz.ts`) has no relevance sort, and the code always took
`releases[0]`. Across the full 70-row set, this was confirmed the *only* row where a full
release-by-release sweep finds real artwork shipped code can't reach — small, real, confirmed
hit rate 1-in-70, worth fixing properly without over-engineering it.

**Fix:** a third artwork tier, reached only when tiers 1 (release-group CAA) and 2
(`releases[0]`'s own CAA entry) both fail. Fetches the release group's full release list
(`GET /ws/2/release-group/{id}?inc=releases`, one extra MB request — the docstring's "up to 3"
becomes "up to 4"), checks up to 10 other releases individually on CAA with the existing
`pickArtwork()`, stops at the first hit. Reuses `pickArtwork()` as-is — no change to Concern B's
logic, no change to the `status: 'ok' | 'not_found' | 'error'` contract from Concern A.

**Two correctness requirements, both learned earlier this session:**

- The entire tier is wrapped in its own `try/catch`, isolated from the outer function's
  `catch`. A failure fetching the release list or checking one release's CAA entry cannot flip
  `status` away from `'ok'` after Step A/B already succeeded — verified by a dedicated test
  (tier-3's own MB request rejects; `status` stays `'ok'`, `genres`/`releaseDate`/
  `releaseGroupId` from Step A/B are all still returned intact).
- The `inc=releases` request's own failure is not treated the same as a genuine empty release
  list (Concern D.1's mistake, now avoided here too) — it's caught in its own inner
  `try/catch` and logged via `console.warn` so it stays observable/distinguishable, rather than
  silently collapsing into "0 other releases" the way the diagnostic script's pre-D.1 bug did.
  No full `status` enum needed for this internal detail (unlike Concern A's public contract) —
  the log is enough per the brief's own scoping.

**Cost bound:** capped at `MAX_TIER3_RELEASES_CHECKED = 10` additional releases, so a
reissue-heavy legacy artist's release group can't turn this into an unbounded sweep. `releases[0]`
itself is excluded from the tier-3 sweep (already checked in tier 2) — confirmed by a test that
counts exactly one CAA call against it total.

**Tests** (`scripts/__tests__/musicbrainz.test.ts`, 3 new): tier-3 finds artwork on a
non-`releases[0]` release when tiers 1–2 fail; tier-3's own release-list failure doesn't flip
`status` or discard already-resolved fields; the 10-release cap is respected (15 siblings
offered, exactly 10 CAA calls made). All pass; 52/52 files, 395/395 tests, `tsc` clean.

**Live-verified against Raphael Weinroth-Browne — Empyrean post-fix** (not trusted from unit
tests alone): `lookupMusicBrainz` now returns `artworkUrl` pointing at release
`d13afb14-38d0-452b-b986-e3003c385856` — the exact MBID Concern B's diagnostic identified as
holding the real, approved artwork, not the `releases[0]` pick
(`0a1681b0-95e1-4fca-a683-a072fed8c0f6`, no CAA entry). First live attempt hit the same
session-wide MB flakiness as everything else today (`status: 'error'`); a retry after a 60s
pause resolved cleanly.

**No backfill script written, deliberately.** Now that this album goes through the same
`lookupMusicBrainz` call as every other album, it resolves through the *existing* organic
ingest/backfill path (`selectAlbumBackfillCandidates` in `scripts/ingest.ts`) automatically on
the next run that revisits it — no special-case write needed, which is exactly why D.1 declined
to hand-write the URL directly.

**Definition-of-done: this brief (Concerns A–E) is now fully complete.** The only remaining
items are the 5 rows left unresolved by Concern D.1 (not a tracked gap — just needs a later
diagnostic re-run when MB isn't degraded) and confirming Weinroth-Browne resolves on the next
scheduled ingest run (read-only diagnostic check, not required before merge).

## Artwork rot: manual revalidation script (2026-09-17)

**Confirmed live:** Sigh — *Goh-Ka*'s stored `artwork_url` pointed at a CAA image that returns
`404` (both full-res and the `-500` thumbnail) — the image was removed from CAA sometime after
ingest stored the URL. `isAlbumEnriched()` in `ingest.ts` treats any non-null `artwork_url` as
permanently done, so a dead URL stays dead forever — neither the RSS loop nor
`selectAlbumBackfillCandidates` ever reconsiders a row once artwork is set.

**Fix: `scripts/diagnostics/revalidate-artwork-2026-09-17.ts`**, a standalone `--report`/
`--apply` script (same convention as `backfill-artwork-2026-09-17.ts`), run manually and
**deliberately not wired into `ingest-cli.ts` or any cron schedule** — CAA image removal is
rare enough (reverted edits, rights issues, community cleanup) that it doesn't warrant
scheduled infrastructure. Checks every `albums` row with a non-null `artwork_url` via `GET`
(CAA doesn't respond cleanly to `HEAD`), 8000ms timeout matching the existing CAA calls in
`musicbrainz.ts`, one retry after a 5s backoff before concluding "dead" (network error, bad
status, and non-image content-type all feed the same retry path). Confirmed-dead rows get
`artwork_url` reset to `null` only — `genre`, `release_date`, and `mb_release_group_id`
untouched. No new fetch logic: a reset row naturally re-enters the existing pipeline
(`isAlbumEnriched` → `false` → `selectAlbumBackfillCandidates` picks it up on the next ingest
run).

**Live-verified:** `--report` then `--apply` found 7 dead rows in the current 250-row artwork
set (Sigh, Sojourner, Left To Die, Ok Goodnight, Vision Divine, Oddland, Sworn) and reset all
7. A manually-triggered `npm run ingest` immediately after re-resolved fresh, live artwork for
5 of the 7 (including the target case, Sigh — *Goh-Ka*, now pointing at a different CAA image
id, confirmed `200` after CAA's redirect); the other 2 hit MB's `503 busy` response that
session and will pick up on a later run — expected, not a bug (same MB flakiness documented
elsewhere in this file).

**Note on retry noise:** two independent `--report` runs minutes apart returned 6 and 7 dead
rows respectively (one row flipped), consistent with CAA/archive.org's documented
intermittent-degradation behavior (see "CAA request timeout" above) rather than a script bug.
Not treated as a problem to over-engineer around — a false-dead reset is harmless by design
(the row just re-resolves, likely to the same image, on the next ingest run), so the brief's
single-retry policy was kept as specified rather than adding multi-run consensus checking.

**Forward-looking, not built now:** cross-referenced as the source doc for the previously
orphaned "Album data staleness / admin data-quality view" item in `deferred-work.md` — once
that view exists, a per-row "recheck this album's artwork" admin action is the natural
single-album version of this same logic, small enough to lift over without rework.
