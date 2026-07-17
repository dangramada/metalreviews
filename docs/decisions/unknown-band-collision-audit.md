# `Unknown Band` collision + parse-failure audit (read-only)

**Date:** 2026-07-17 (revised twice same day — see §4, added after the initial pass under-scoped
Angry Metal Guy's non-review content; see §5, a further correction after §3–4 misclassified two
of the "franchise-prefix pollution" columns)
**Scope:** Findings only, per the brief. No code changes, no fixes, no schema changes. This is
the audit that precedes (and informs) a future roundup-skip fix session — deliberately kept
separate, per project convention (one concern per session).

**Question under investigation:** `docs/decisions/album-identity-diagnosis.md` (Finding 6)
flagged `Unknown Band | Unknown Album` as a standing collision channel — every unparseable title
from any source overwrites whatever currently occupies that slot. That diagnosis predates the
album-identity migration. This session asks: does the collision still exist post-migration, what
does it currently hold, and what is the actual population of things that fail (or nearly fail) to
parse — not just the roundup posts already known about.

---

## 1. Current `Unknown Band | Unknown Album` occupant — confirmed, still a live collision channel

Queried the live `albums` and `reviews` tables directly (read-only `select`, Supabase service
key). Post-migration, the sentinel still collides the same way: `norm_key` is computed from the
literal strings `"Unknown Band"` / `"Unknown Album"` (via `computeNormKey`), so it is identical
for every parse failure regardless of source, and `albums` still has an `id` uniqueness
constraint on that key. The collision is structurally unchanged by the migration — it moved from
`reviews.id` (pre-migration) to `albums.id`/`norm_key` (post-migration), but the mechanism is the
same: one album row, at most one review per source, permanently overwritten by whatever the next
parse failure is.

Current occupant (single row, single review):

```
albums:  id=ec4e4739-ede6-4b82-a401-58e28082e1f7  band="Unknown Band"  album="Unknown Album"
         norm_key="unknown band__unknown album"  mb_release_group_id=null
         created_at=2026-07-13T09:32:35Z

reviews: source="The Progressive Subway"  score=""  mb_lookup_attempts=5
         published_at=2026-07-13T14:00:00Z
         url=https://theprogressivesubway.com/2026/07/13/our-june-2026-albums-of-the-month/...
```

This is **The Progressive Subway's "Our June 2026 Albums of the Month!"** roundup post — a real
instance of the already-known roundup category, just a title *phrasing* not previously quoted
verbatim in chat ("Our `<Month>` `<Year>` Albums of the Month!", not literally "Albums of the
Month"). `mb_lookup_attempts` is already at 5 (the pipeline's retry cap), so the backfill pass has
been repeatedly and unsurprisingly failing to resolve "Unknown Band" against MusicBrainz.

**Pre-collision history is not recoverable.** Confirmed rather than assumed: `git log --all
--oneline -- reviews.json` and a full-history filename search both return nothing — `reviews.json`
was never committed, exactly as `album-identity-diagnosis.md` stated. There is no artifact
anywhere in this repo that could reveal what the sentinel held before 2026-07-13. Total table
counts at time of audit: 148 albums, 147 reviews.

## 2. Recurring roundup/list-post phrases

The live RSS feeds only carry a short recent window (AMG and PS: ~10 items, roughly one week;
Metal Storm: 20 items, roughly one month) — far short of "a few months." To get real recurrence
counts and dates, this session supplemented the live RSS scan with each site's own search page
(read-only page fetches, same as reading any other web page). Both figures are reported below:
what actually appeared in the live RSS window scanned, and what the site's own archive confirms
as the full recurring pattern.

| Phrase | Source | Cadence confirmed via site search | Seen in this session's RSS window |
|---|---|---|---|
| "Record(s) o' the Month – `<Month>` `<Year>`" | Angry Metal Guy | Monthly, ≥17 search-result pages (≈170 instances), back to at least May 2025 | Yes — 1 instance ("April 2026", 2026-07-14) |
| "Stuck in the Filter: `<Month>` `<Year>`'s Angry Misses" | Angry Metal Guy | Monthly, ≥6 search-result pages (≈55 instances), back to at least June 2025 | No — most recent instance (2026-07-02) had already scrolled out of the live feed by the time of this scan |
| "Our `<Month>` `<Year>` Albums of the Month!" | The Progressive Subway | Monthly, confirmed 10 consecutive months back to August 2025 | Yes — 1 instance ("Our June 2026...", 2026-07-13) — this is the current sentinel occupant |
| "Yer Metal Is Olde: `<Band>` – `<Album>`" | Angry Metal Guy | Not a roundup (see §3) — recurring column, ≥13 search-result pages (≈120+ instances), back to at least Nov 2024 | Yes — 1 instance ("Stratovarius – Episode", 2026-07-12) |
| "Lost in Time: `<Band>` – `<Album>`" | The Progressive Subway | Not a roundup (see §3) — recurring column, 10 confirmed instances, back to at least March 2025 | Yes — 1 instance ("Exotic Animal Petting Zoo – Tree of Tongues", 2026-07-17) — **not previously identified in this thread** |
| "Stuck in the Filter" search on The Progressive Subway | — | Zero results — this phrase belongs to AMG, not PS. Worth correcting: the brief's framing implied it might be a PS phrase; it isn't. | — |

**Metal Storm:** zero roundup/list-shaped titles found, and none expected structurally. The scraped
feed (`metalstorm.net/rss/reviews.xml`) and the site's own paginated review index
(`metalstorm.net/pub/reviews.php`, 197 pages) are both a *reviews-only* listing — Metal Storm
publishes news/roundups on a separate part of the site that this pipeline never touches. This is a
structural property of the source, not an artifact of the short scan window — worth treating as
confirmed-clean rather than merely "none seen yet."

No roundup/list phrase beyond the ones already known ("Records o' the Month", "Albums of the
Month", "Stuck in the Filter") was found. The two recurring **columns** below are a distinct
category — not roundups — and are new to this investigation.

## 3. `extractBandAlbum` dry-run — every title in the scanned window, classified

Ran the pipeline's actual `extractBandAlbum` logic (copied verbatim, not reimplemented) against
every item in the live RSS window, with each source's real boilerplate-stripping applied first
(AMG: strip trailing `" Review"`/`" EP Review"`; PS: strip leading `"Review: "`; Metal Storm: no
stripping, matching production). Dry run only — nothing written to Supabase or `reviews.json`.

**Angry Metal Guy (10 items, 2026-07-11 to 2026-07-17):**

| Title | Parsed band / album | Classification |
|---|---|---|
| Record(s) o' the Month – April 2026 | "Record(s) o' the Month" / "April 2026" | Roundup/list post (known) |
| Yer Metal Is Olde: Stratovarius – Episode | "Yer Metal Is Olde: Stratovarius" / "Episode" | ~~Genuine parse issue — franchise-prefix pollution on a real review~~ — **reclassified in §5: this is a non-review retrospective column (old-album coverage), same bucket as roundup/list posts, not a corrupted new-release review.** |
| (other 8 items) | clean band/album pairs | No issue |

**The Progressive Subway (10 items, 2026-07-08 to 2026-07-17):**

| Title | Parsed band / album | Classification |
|---|---|---|
| Our June 2026 Albums of the Month! | "Unknown Band" / "Unknown Album" | **Sentinel — roundup post (known category), currently occupying the collision slot** |
| Lost in Time: Exotic Animal Petting Zoo – Tree of Tongues | "Lost in Time: Exotic Animal Petting Zoo" / "Tree of Tongues" | ~~Genuine parse issue — franchise-prefix pollution on a real review~~ — **reclassified in §5: three other "Lost in Time" instances checked directly (Metallica 1991, Anathallo 2006, Watchtower 1985) are all old-album retrospectives, never new-release coverage. This is a non-review retrospective column, same bucket as roundup/list posts, not a corrupted new-release review.** |
| (other 8 items) | clean band/album pairs | No issue |

**Metal Storm (20 items, 2026-06-14 to 2026-07-15):** all 20 items parsed cleanly to a correct
band/album pair. No sentinels, no roundups, no suspiciously long fields, no franchise-prefix
pollution. Nothing flagged.

**No multi-artist split-release titles** (the already-understood, explicitly-out-of-scope
"Sunthema" case) appeared in this window on any source, so there's nothing new to report there.

### Summary by category (per the brief's four buckets)

1. **Roundup/list post:** 2 confirmed in-window (AMG "Record(s) o' the Month", PS "Our ... Albums
   of the Month!"), plus AMG's "Stuck in the Filter" confirmed recurring via site search but not
   present in this narrow live window. All known already.
2. **Multi-artist split release:** none seen this session; out of scope regardless.
3. **Genuine parse failure on a real single-album review:** **0 confirmed as of §5.** AMG's "Yer
   Metal Is Olde" and PS's "Lost in Time" were originally placed in this bucket, but §5 confirms
   both are non-review retrospective columns (old-album coverage, same as "Record(s) o' the
   Month") — reclassified into bucket 1. The one confirmed genuine case of band-field pollution
   on an actual new-release review is AMG's "AMG's Unsigned Band Rodeö" (§4/§5) — a real review
   with a real score, whose band field is polluted by the franchise prefix. That is the sole
   confirmed instance of this bucket as of this document.
4. **Unclear / needs a human look:** none — everything in the scanned window classified cleanly
   into one of the above.

## 4. Correction: Angry Metal Guy's non-review population is much larger than §2–3 captured

The initial pass searched only for the three phrases named in the brief plus whatever the
narrow live RSS window happened to surface, and concluded AMG had one extra franchise
("Yer Metal Is Olde") beyond the three known roundups. That conclusion was wrong — it was an
artifact of a too-narrow search, not a property of the site. Re-checking against AMG's own
category archive shows the general `/feed/` RSS this pipeline ingests is a **whole-site blog
feed**, not a reviews feed: AMG's "Blog Posts" category archive alone runs to 77 pages
(~770 posts) of news bulletins, obituaries, cruise recaps, and list/ranking franchises,
all mixed into the same feed as actual album reviews. The three phrases named in the brief were
representative examples, not an exhaustive list, and framing the problem as "skip these three
phrases" understates its shape.

Additional recurring franchises confirmed via site search, all producing a `band`/`album` pair
through `extractBandAlbum` (some sentinel, most a plausible-looking-but-wrong pair):

| Phrase | Confirmed instances | Parsed as | Category |
|---|---|---|---|
| "AMG's Unsigned Band Rodeö: `<Band>` – `<Album>`" | ≥12 search-result pages (≈110+), back to at least Dec 2024 | Franchise name folds into `band` (e.g. `"AMG's Unsigned Band Rodeö: Blindfolded"` / `"What Seeps through Threads"`) | **Genuine parse issue — franchise-prefix pollution on a real, current-release review, confirmed in §5** (not a non-review franchise — this is the one case in this document where the album/score/band are all real and current, just mis-identified). **False-negative risk for any category-tag-based detection** (§5): it lacks the `Reviews` tag exactly like the non-review franchises do, so it needs its own explicit allowlist, not a blanket "no tag → skip" rule. |
| "AMG Goes Ranking – `<Band>`" | ≥2 search-result pages (≈20), back to at least Nov 2023 | `band="AMG Goes Ranking"`, `album="<a real band's name>"` | Non-review — discography-ranking post, not a single-album review. The parse produces a plausible-looking pair (a real band name lands in the `album` field) rather than an obvious sentinel or garbage string, so nothing about the stored row looks wrong on inspection. Not independently re-verified against the live post text this pass (§5) — flagged as still needing that check before being relied on. |
| "The Willowtip Files: `<Band>` – `<Album>`" | Already noted once in `album-identity-diagnosis.md` Finding 6; re-confirmed live, at least 1 instance in the archive scan (2026-06-21) | Franchise name folds into `band` | **Non-review retrospective column, confirmed in §5** (label-history feature reviewing a 2004 album from a "2001–2006" retrospective piece) — same bucket as "Yer Metal Is Olde"/"Lost in Time", not franchise-prefix pollution on a real new-release review. |
| "`<Descriptive title>`: AMG `<...>`" (e.g. "Madness on the High Seas: AMG Elders Brave 70000 Tons of Metal") | Irregular/annual, not a fixed monthly cadence — one-off event recaps | Colon delimiter still fires, produces a plausible-but-wrong pair | Non-review blog post, roundup-adjacent |
| "Who Are These Clowns and Where Did They Put My Flesh Stapler? The AMG Staff Pick Their Top Ten(ish) of 2025" / "Have a Merry Little AMG Christmas..." | Annual (year-end list, Christmas post) — one each per year | **No delimiter character present at all** → sentinel (`Unknown Band`/`Unknown Album`) | Roundup/list post — a second, independently-occurring source of sentinel collisions beyond the monthly ones in §1–2 |
| "EP/Split/Single Roundup of `<Year>`, Part `<N>`" | Annual, multi-part | Colon absent, dash absent in the sampled titles → likely sentinel (not individually re-verified against the live parser) | Roundup/list post |

**A previously-unexamined signal exists directly in the RSS data and was not used by this
audit's classification, nor by the live pipeline:** every genuine single-album review item in
AMG's feed carries `<category>Reviews</category>` and `<category>Review</category>` XML tags
(confirmed by inspecting the raw feed XML). Every one of the non-review franchise/ranking/list
posts sampled above — "Record(s) o' the Month", "Yer Metal Is Olde", "AMG's Unsigned Band
Rodeö", "AMG Goes Ranking" — carries neither tag; only its own franchise-specific category
(e.g. `<category>Yer Metal Is Olde</category>`). `extractBandAlbum` and the pipeline as a whole
currently only ever look at `item.title`; `item.categories` is fetched by `rss-parser` (it's
standard RSS) but never read anywhere in `scripts/ingest.ts`. This is reported here as a fact
about what data is available in the feed, not as a recommendation — per the brief, no fix
approach is being proposed in this session.

**Update: The Progressive Subway carries the equivalent signal too, now checked.** Direct
inspection of PS's raw feed XML (`/tmp/ps.xml`, the same feed pulled for §2–3) shows every
standard "Review: " item tagged `<category>Album Reviews</category>`, while "Lost in Time:
Exotic Animal Petting Zoo – Tree of Tongues" carries `<category>Lost in Time</category>` (no
`Album Reviews`), and "Our June 2026 Albums of the Month!" carries `<category>Front-Page
Post</category>` / `<category>Reports from the Underground</category>` / `<category>Albums of
the Month</category>` (also no `Album Reviews`). So PS has the same *kind* of binary signal as
AMG — literal tag differs (`Album Reviews` vs. AMG's `Reviews`/`Review`), but both sites
reliably tag genuine album-review posts and omit the tag on franchise/roundup posts. As with
AMG, `scripts/ingest.ts` never reads `item.categories` for PS either. Metal Storm's feed was
not checked for an equivalent tag — its feed is already structurally review-only (§2), so the
question doesn't have the same relevance there.

One classification nuance worth being precise about: "Lost in Time" (like AMG's "Yer Metal Is
Olde") is *not a review* only in the site's own categorical sense — it is excluded from the
`Album Reviews`/`Reviews` taxonomy. The writing itself is genuine album criticism (confirmed
earlier in this audit: a real critical analysis of Exotic Animal Petting Zoo's *Tree of
Tongues*, not a list or roundup). The distinction matters for a future fix: filtering on the
review-category tag would correctly exclude "Lost in Time" from being treated as a normal
review ingestion, but the album being discussed is real, so simply discarding the item (as a
roundup-skip fix would for "Albums of the Month") would silently drop a genuine review rather
than avoid a non-review post — a different consequence than skipping an actual roundup, and a
reason this case may need different handling than the pure-roundup cases in a future session.

**Net correction to §2's conclusion:** "no roundup/list phrase beyond the ones already known was
found" should be read as false for Angry Metal Guy specifically — the real population is at
least six distinct recurring non-review franchises (three named in the brief, three more found
here), plus irregular one-off blog content, all flowing through the same feed as reviews. The
Progressive Subway conclusion in §2–3 (limited to "Albums of the Month" / "Lost in Time") was
reached the same narrow way (short RSS window plus only the phrases named in the brief) and
should be treated as provisional, not exhaustive, for the same reason — a PS-side deep-dive
equivalent to this section (checking PS's own category archive/search the way AMG's was
checked above) has not been done. The Metal Storm conclusion (clean) rests on a different,
stronger basis — its feed is structurally review-only (§2) — so it is not subject to the same
caveat. This correction re-checked AMG because that's where the user flagged specific missed
titles ("amg", "Rodeö"); PS's category-tag signal was checked as a direct follow-up to that
same prompt, but a full site-search-based census of PS's own franchise/column names (the kind
of AMG-only pass done above) has not been done, so PS may still hold undiscovered non-review
franchises the way AMG did.

## 5. Correction: two franchises were misclassified as "corrupted reviews" — they are non-review retrospective content

§3–4 classified "Yer Metal Is Olde" (AMG) and "Lost in Time" (PS) as "genuine parse issue —
franchise-prefix pollution": the framing was that these are real single-album reviews whose
band field gets polluted by the column name. That framing was checked directly against the
actual posts and is wrong in a way that matters. Corrected below, with the evidence.

**"Yer Metal Is Olde" is not new-release coverage — confirmed by re-reading the actual post.**
"Yer Metal Is Olde: Stratovarius – Episode" (fetched directly,
`angrymetalguy.com/yer-metal-is-olde-stratovarius-episode/`) reviews *Episode*, a Stratovarius
album from the mid-1990s (the piece explicitly discusses the 1994–1998 run and Stratovarius's
"classic lineup" era) — not a new release. Categories on the post: `YER METAL IS OLDE, POWER
METAL, PROGRESSIVE METAL` — no `Reviews`/`Review` tag, confirming §4's category-signal finding.
This is a retrospective column, structurally and editorially the same kind of thing as "Record(s)
o' the Month" or "AMG Goes Ranking": non-review content about old catalog, not a corrupted
instance of the site's actual new-release review pipeline.

**"Lost in Time" is the same pattern — confirmed across three separate instances.** Directly
checked three different "Lost in Time" posts:

- "Lost in Time: Metallica – Metallica" — reviews the 1991 "Black Album," explicitly framed as
  retrospective.
- "Lost in Time: Anathallo – Floating World (20th Anniversary)" — reviews a 2006 album,
  explicitly an anniversary piece.
- "Lost in Time: Watchtower – Energetic Disassembly" — reviews a 1985 album.

Every instance checked is an old-album retrospective, never new-release coverage — consistent
with the column's own stated premise ("albums that have faded from mainstream attention," per
the earlier search-page summary in §2). This was not a one-off misparse of an otherwise-normal
review; it is what the column always is.

**"The Willowtip Files" is the same pattern too — checked for the first time this pass.** The
one confirmed instance ("The Willowtip Files: Commit Suicide – Synthetics") explicitly frames
itself as a look back at a record label's catalog "between 2001–2006," reviewing a 2004 album
released over two decades before the post. Categories: `BLOG POSTS, THE WILLOWTIP FILES, DEATH
METAL` — no `Reviews` tag. §4 had already flagged this phrase but not yet verified its
review-or-not status; now verified as the same non-review retrospective bucket as the two
above.

**Net reclassification:** "Yer Metal Is Olde," "Lost in Time," and "The Willowtip Files" move
from *"genuine parse failure on a real single-album review"* (§3's bucket 3 — implying these are
otherwise-legitimate new reviews whose identity gets corrupted) to the *same bucket as the
roundup/list posts* (§3's bucket 1 — non-review content that happens to produce a
plausible-looking `band`/`album` pair instead of an obvious sentinel). The mechanical outcome in
`extractBandAlbum` is unchanged (band field still gets polluted with the column name); what
changes is the classification of *what kind of problem this is* — not review-identity corruption,
but non-review content being ingested as if it were a review, same as "Record(s) o' the Month."

**Counter-example — do not treat "missing `Reviews` category tag" as a blanket non-review
signal.** "AMG's Unsigned Band Rodeö: Blindfolded – What Seeps through Threads" was checked
directly: it reviews *What Seeps through Threads*, released July 1, 2025, by the confirmed
current, active, unsigned band Blindfolded — a genuine new-release review, with real numeric
scores from two different staff writers (`4.0/5.0` and a second unscored-but-narrative verdict).
Its categories: `ANGRY METAL GUY'S UNSIGNED BAND RODEO, DEATH METAL` — **no `Reviews`/`Review`
tag**, the same absence seen on the three non-review columns above. So "Rodeö" is a real review
that would be a false negative for any detection rule built on "has the `Reviews` category tag."
It needs to be recognized as a genuine review, not lumped in with the skip-worthy franchises —
its `band`/`album` field still gets polluted by the franchise prefix (`"AMG's Unsigned Band
Rodeö: Blindfolded"` as the band), which is a real, separate identity-corruption problem (§3's
original bucket 3, correctly), but the post itself must not be discarded by any future roundup-
skip logic.

**Still unverified, flagged explicitly per this correction's own logic:** "AMG Goes Ranking" (§4)
was already assessed as non-review (a discography-ranking post, not a single-album review) from
its own content description — that assessment still stands and needs no change here. The annual
list/Christmas posts (§4) were already classified as roundup/list (they hit the sentinel outright,
with no band/album pair produced at all) — no change needed there either, since sentinel output
makes their non-review status unambiguous regardless of category tags. No other named AMG
franchise in this document has had its review-or-not status independently confirmed beyond what's
listed above — per this correction's own finding (Rodeö), the presence or absence of a `Reviews`
category tag is suggestive but not sufficient on its own, and any future detection rule would need
per-franchise verification, not a blanket tag check.

## What this session did not do

- No changes to `extractBandAlbum`, ingest pipeline, scraper modules, or schema.
- No fix for the roundup-post problem (separate, already-drafted brief).
- No fix proposed for any newly-found non-review franchise (AMG "Yer Metal Is Olde"/"The
  Willowtip Files"/"AMG Goes Ranking", PS "Lost in Time") or for the one confirmed genuine
  franchise-prefix-polluted review (AMG "AMG's Unsigned Band Rodeö", §5) — all surfaced as
  findings only, per the brief's explicit instruction not to propose solutions in this session.
- No attempt to recover data lost to prior `Unknown Band` collisions — confirmed unrecoverable
  (§1), not attempted.
- All Supabase and RSS access was read-only; two temporary local dry-run scripts were used during
  this session and deleted before it ended — nothing was left in the working tree.

## §6 — Follow-up: stale rows cleaned up (2026-07-17, after this audit + the ingest fix)

Once `docs/decisions/roundup-skip-fix.md` shipped and was verified against a live ingest run, the
3 pre-fix stale `reviews`/`albums` rows this audit found (including the `Unknown Band | Unknown
Album` sentinel in §1) were migrated into `skipped_posts` and deleted. Full details:
`docs/decisions/stale-row-cleanup.md`. The sentinel's `norm_key` is no longer occupied — a future
parse failure will create a fresh `Unknown Band | Unknown Album` row rather than colliding with
this one, though the underlying collision mechanism itself is still not fixed (see "What NOT to
touch" below, unchanged).

## Method notes

- Live-table reads: read-only `select` queries against Supabase via the project's existing
  service-key client (`scripts/supabaseClient.ts`), run from a temporary local script, deleted
  after use.
- RSS feeds fetched live via `curl` (AMG, Metal Storm direct; PS required following a 301
  redirect) and parsed with the project's own `rss-parser` dependency.
- `extractBandAlbum` was copied verbatim from `scripts/ingest.ts` (not exported, so a dry-run
  script had to duplicate it rather than import it) — confirmed byte-for-byte identical to the
  live function before running.
- Historical recurrence counts beyond the live RSS window came from each site's own on-site
  search (`angrymetalguy.com/?s=...`, `theprogressivesubway.com/?s=...`), read the same way a
  browser would; AMG blocks plain `curl`/fetch requests (Cloudflare), so those pages were read via
  a browser tool instead, consistent with the workaround already documented in
  `album-identity-diagnosis.md`.
