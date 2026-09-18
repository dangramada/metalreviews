# Same-title release-group collision — diagnostic (read-only, no fix)

Confirms and scopes a bug class distinct from the already-known `releases[0]`-arbitrary-pick
problem (see `musicbrainz-enrichment.md`): that prior work assumed the worst case was an
arbitrary *pressing* of the same conceptual album. This diagnostic confirms the worse case —
`lookupMusicBrainz`'s Step A search (`artist:"{band}" AND release:"{album}"`) can match **two
genuinely different real works** that happen to share a title, and `releases[0]` picks one of
them with no way to tell it picked wrong.

Trigger case: Khemmis (band) has a self-titled 2013 EP and a self-titled 2026 full-length
(Nuclear Blast). Our catalog's Metal Storm review correctly links to the 2026 album's review
page, but the stored `albums` row's `release_date`/`genre`/`artwork_url` are the 2013 EP's.

This session ran the required diagnostic and answered the two follow-up questions. **No fix
applied.** The paused Metal Storm back-catalogue exclusion filter
(`metalstorm-backcatalogue-exclusion-brief.md`) stays paused — it trusts `release_date` as
ground truth, and this finding shows that trust doesn't hold for this class of row.

## Method

`scripts/diagnostics/diagnose-release-group-collision-2026-09-18.ts` (read-only): for all 320
`albums` rows, re-ran Step A's exact search live against MusicBrainz and grouped the matched
releases by `release-group` id. `primary-type` and an `earliest-date` are read off the release
search response itself (the embedded release-group + each release's own `date` field) rather
than a separate release-group fetch, so this stays at 1 MB request per album, matching the
real Step A call's rate-limit cost. Transient MB `503`s (about a third of requests on the first
pass) got a retry with backoff; one `socket hang up` on `Solothurn — High Priestess` was
re-checked manually afterward (1 release-group — not a collision). Full output:
`docs/data/album-identity/release-group-collision-2026-09-18-output.json`.

## Result

**29 of 320 albums (9%)** matched more than one distinct release-group. Khemmis is in the
list, confirming the diagnostic catches the known case.

Of the 29: **17** already have an `mb_release_group_id` stored (so the arbitrary-pick risk is
which of two *known* ids is attached); **12** have no stored release-group id at all — Khemmis
among them, see "Second question" below for why that matters more than it looks like it should.

Not all 29 are the same severity. Eyeballing candidate types/dates, most are an **Album +
same-titled promotional Single** released around the same time (e.g. Cancer Bats, Xandria,
Devil Master, The Hu, Beseech, Haken) — plausibly the same work's own lead single, not a
genuinely separate album. A smaller subset looks like **two substantively different works**
sharing a title (Khemmis: 2013 EP vs. 2026 album; Devin Townsend "The Moth": 2025 vs. 2026;
Wormwood "Å": 2017 album vs. 2026 EP; Moonspell "Far from God": 3-way Single/Album/EP split).
This distinction isn't scored or acted on here — flagged only for whoever scopes the eventual
fix, since "collapse Album+Single of the same title" and "disambiguate two real albums" are
different problems.

**Update after manual check (see "Follow-up" below): "two substantively different works"
describes the MB match, not the row's correctness.** Manually confirmed: Devin Townsend and
Wormwood's stored data is already correct (`releases[0]` happened to pick right); Khemmis is
broken on both artwork and date; Moonspell is broken on artwork only. Multiple real
release-groups matching is not the same claim as "this row is currently wrong" — treat the
table below as candidate multiplicity only, not a defect list, until each row gets the same
manual check.
different problems.

Full list (band — album | candidate release-group id | type | earliest-date | which one is
currently stored):

| Band — Album | Release-group id | Type | Earliest date | Stored? |
|---|---|---|---|---|
| Apogean — Waste Where Life Begins | e97ee56a-998e-4c9c-965f-56bb0537565d | Album | 2026-07-10 | |
| | aff8140c-fe51-4010-a838-4c3db402523e | Single | 2026-06-23 | |
| Solace — Fading Failing Ruin | ccf1ac3b-e1a2-47a8-ba60-6a7b04957799 | Album | unknown | ✓ |
| | 71dd843f-6cc3-4a24-a5c4-a7eaf3d193e1 | Album | unknown | |
| Sun Guts — Supervoid | 785a577d-27cd-49a3-b11c-d4feac933231 | Single | 2026-08-04 | |
| | e155310e-2880-4373-8fc4-cd1f6b485bb6 | Album | 2026-09-04 | |
| Dysgnostic — End Whispers | ffda8751-8281-4329-8c25-4a9d58fb1c01 | Album | 2026-07-10 | ✓ |
| | 5c50230c-fa86-49a0-b085-03ed95468ac5 | Single | 2026-04-13 | |
| **Khemmis — Khemmis** | 7e851452-2e24-4312-8fd5-fdf4c713f2fd | EP | 2013-11-14 | |
| | 66eda96e-276a-46b5-a4bf-46bb8b201b28 | Album | 2026-06-12 | |
| DevilDriver — Strike And Kill | cc42ec33-6000-4a13-990b-7b9443d3dae4 | Album | 2026-07-10 | ✓ |
| | 78c638ef-a000-402d-a70d-2555b65bc689 | Single | 2026-07-07 | |
| Moonspell — Far from God | a2b513aa-2567-4f10-b22e-8a39c395edb3 | Single | 2026-03-25 | |
| | aebc070b-e3a1-4042-8f93-da01fc26fda8 | Album | 2026-07-03 | |
| | 62882f57-c631-4752-814f-e907c0f0ad93 | EP | unknown | |
| Yes — Aurora | b72aec7b-8b63-4245-84d7-07d70fe683e0 | Single | 2026-04-10 | |
| | 96a132b5-1e90-4ac9-87cf-73d696fb7bc5 | Album | 2026-06-12 | |
| Shadowborne — Heaven's Falling | 9833ef34-3dfc-44f7-806c-4bbc88f3a7df | Single | 2026-04-29 | |
| | 84bf95c1-f2d4-4d6b-aafb-90d6c043a240 | Album | 2026-06-19 | |
| Devin Townsend — The Moth | d408e36a-7328-40eb-b373-eaa5caa98651 | Album | 2026-05-29 | |
| | e49834f8-d449-41b8-8a9b-e18f99a7b276 | Album | 2025-03-28 | |
| Elder — Through Zero | 15853898-04b7-4ecc-9207-ecb2263f8f00 | Single | unknown | |
| | 3fd4d36a-9fef-4bd0-b822-3eb14a150078 | Album | 2026-05-29 | |
| Electric Sun Defence — Estuary | b8e676b9-df71-41ff-b70a-219221babbd1 | Album | 2026-05-08 | |
| | 8fa7b92f-9757-404f-b286-4ff51667283b | Single | 2026-03-20 | |
| Black Veil Brides — Vindicate | aa7a72c4-c1ff-40b8-bfac-4c032dfdad5c | Single | 2026-03-19 | |
| | a6a02c12-2016-435c-ad3d-e7f999829eb8 | Album | 2026-05-08 | |
| Inferi — Heaven Wept | eacd8a95-7d10-4807-9121-0beba575ceb9 | Album | 2026-04-10 | |
| | 371af7ff-a57d-47f3-abf3-2df71a94ca65 | Single | 2026-02-27 | |
| Pro-Pain — Stone Cold Anger | 4dc826e6-f525-4bcb-81b9-4785967c4ab2 | Album | 2026-05-15 | |
| | 0380d0b3-282a-4259-bda4-9e732ad353d6 | Single | 2026-05-13 | |
| Stormhammer — Wrath of the Hammer | c3dbd44a-d841-433f-bbca-128f848dfc2a | Single | 2026-05-20 | |
| | 3239d455-98cf-49d1-8afc-ee844be18d26 | Album | 2026-07-17 | ✓ |
| Imperium — Exodus Unknown | f7e63139-db77-4c31-82d7-837d223dfbd1 | Album | unknown | ✓ |
| | 37fe0108-062f-4ece-bd35-b16eaca4e4fb | Album | 2026-07-16 | |
| Green Lung — Necropolitan | ebcd8232-4460-48d8-a744-37abb851f8fa | Album | 2026-09-11 | ✓ |
| | 48ee13ad-cd1f-48cb-a44e-e0f7087f01be | Single | unknown | |
| Haken — In a Fever Dream | 39a6e085-d1a6-46f0-8b45-bc6a0f77e0f6 | Single | 2026-05-21 | ✓ |
| | 44df52ad-cf1a-425f-8b27-583d60d851a9 | EP | 2026-07-17 | |
| Phase Meridian — Egregore | b6683647-058a-4223-8a77-f0550bc847d3 | Album | unknown | ✓ |
| | 94a8027f-0c41-43c0-9458-bdc62afc2846 | Single | 2026-01-15 | |
| Xandria — Eclipse | 60b2ebcc-118f-41ee-8012-d814a6ee4753 | Album | 2026-08-07 | ✓ |
| | a230527c-3d63-49d7-8f08-21ac2d203fa9 | Single | 2026-08-05 | |
| Opeth — Sorceress | 8902256f-d9f0-4043-a8f3-2412fb3d3db7 | Album | 2016-09-30 | ✓ |
| | 04aec7a5-7756-47ff-89e8-1bb3f40ae730 | Single | 2016-08-02 | |
| Tyraels Ascension — Grave Seeker | d47edda7-e42d-4ecc-aa05-c4eba0ecccdf | Album | unknown | |
| | d2077e8b-4121-4709-9e8b-61a6d164f44e | Album | unknown | ✓ |
| Wormwood — Å | 09d45c42-64fb-4741-b850-2d90830add02 | EP | 2026-08-07 | ✓ |
| | 094d9dda-12d8-43e8-bfa3-8ceef7be42c3 | Album | 2017-03-10 | |
| Cancer Bats — Give Me Dirt | 7fb3424d-975d-41f2-8559-6c0a6f631fc3 | Album | 2026-08-07 | |
| | 4c157c9f-12f4-4575-9db2-b2739e20a3e5 | Single | 2026-08-07 | ✓ |
| Beseech — Future Present Past | a06e5b6a-10a4-496b-8ee1-01552c9b77e9 | Album | 2026-08-28 | ✓ |
| | 07c86d04-b946-4948-a5fc-a8599c40f870 | Single | 2026-08-07 | |
| The Hu — Hun | 2c4307d0-0d42-4848-afad-ada40dad6f63 | Album | 2026-07-24 | ✓ |
| | a868a0b4-b300-490f-a89f-4a6886987f23 | EP | 2026-06-26 | |
| Devil Master — Bloody Dreams | 3e4b84ab-266d-4b64-b783-e472cb48e8b1 | EP | 2026-09-04 | ✓ |
| | a6d20910-bb0a-43de-a6df-482d52b9853e | EP | 2026-09-04 | |
| Flotsam and Jetsam — Rats in the Temple | 3df4f3a4-04c3-4f2d-8873-a72320c8720d | Single | 2026-05-27 | ✓ |
| | fe4f7edb-5ea6-4f53-9a9a-c62341694504 | Album | 2026-08-28 | |

## Follow-up: manual check on the 4 "genuinely different works" candidates (same session, later)

Dan manually checked the four pairs called out above as the sharper "two substantively
different works" subset (excluding the 3-way Moonspell split from that specific check for now).
Result: **Devin Townsend and Wormwood are both actually fine** (stored data already correct);
**Khemmis is broken on both artwork and date; Moonspell is broken on artwork only, date is
correct.** Raw data only, no correction applied to any row.

**Devin Townsend — "The Moth"**

| | release-group id | type | first-release-date |
|---|---|---|---|
| candidate 1 (= `releases[0]`, what ingest picked) | `d408e36a-7328-40eb-b373-eaa5caa98651` | Album | 2026-05-29 |
| candidate 2 | `e49834f8-d449-41b8-8a9b-e18f99a7b276` | Album | 2025-03-28 |

Stored `albums` row: `mb_release_group_id` null, `release_date` **2026-05-29**, `artworkUrl`
`https://coverartarchive.org/release/1012e967-edf0-4366-a444-894b029f3373/44575488810.jpg`,
`genres` `["progressive metal", "ambient", "metal"]`. Stored date matches candidate 1 —
`releases[0]`'s pick was the correct one.

**Wormwood — "Å"**

| | release-group id | type | first-release-date |
|---|---|---|---|
| candidate 1 (= `releases[0]`) | `09d45c42-64fb-4741-b850-2d90830add02` | EP | 2026-08-07 |
| candidate 2 | `094d9dda-12d8-43e8-bfa3-8ceef7be42c3` | Album | 2017-03-10 |

Stored `albums` row: `mb_release_group_id` **`09d45c42-64fb-4741-b850-2d90830add02`**
(matches candidate 1), `release_date` **2026-08-07**, `artworkUrl`
`https://coverartarchive.org/release/ee288dd6-4b48-4bfd-941f-7126fb61385b/45386765477.jpg`,
`genres` `["black metal", "folk metal", "melodic black metal"]`. Stored id and date both match
candidate 1 — again, `releases[0]`'s pick was correct.

**Why these two turned out fine — false positive vs. severity miscall:** in both cases the
underlying match is real, not MB conflating two editions of one work into two release-groups.
Devin Townsend's two candidates are both typed `Album` a year apart — MB genuinely holds two
distinct album-length release-groups under this title. Wormwood's are an EP (new) and an Album
(2017) — a different type and a 9-year date gap, clearly two distinct real releases, not
pressings of one. So this session's "genuinely different works" label was accurate as a
description of the MB data. What was wrong was treating that as equivalent to "confirmed
broken" — it isn't. `releases[0]` happened to land on the correct candidate for both, so
nothing is currently wrong on either row. The underlying risk this diagnostic set out to
describe (an arbitrary pick with no relevance sort) is still real and still present on both
rows going forward — it just hasn't materialized into a visible defect yet, the same
not-yet-triggered state as 27 of the other 27 non-Khemmis/Moonspell rows. This session's
severity write-up conflated "multiple real release-groups matched" with "currently showing
wrong data" — they aren't the same claim, and the table in the Result section above should be
read as "candidate multiplicity," not "confirmed-wrong," for any row without independent
manual confirmation like this one.

**Khemmis — "Khemmis"**

| | release-group id | type | first-release-date |
|---|---|---|---|
| candidate 1 (= `releases[0]`) | `7e851452-2e24-4312-8fd5-fdf4c713f2fd` | EP | 2013-11-14 |
| candidate 2 | `66eda96e-276a-46b5-a4bf-46bb8b201b28` | Album | 2026-06-12 |

Stored `albums` row: `mb_release_group_id` null, `release_date` **2013-11-14**, `artworkUrl`
`http://coverartarchive.org/release/61e93d23-96f9-4d65-93d0-30805996405d/20322177557.jpg`,
`genres` `["doom metal", "heavy metal"]`. Release `61e93d23-...` is the EP's own release (candidate
1) — both the stored artwork *and* the stored date trace back to the same single wrong
`releases[0]` pick, not two independent failures. Worth noting: this session's diagnostic
re-run, done live today, also put the EP first — the same pick the row was created with back
on 2026-07-13. Whatever makes `releases[0]` land on the EP appears stable across separate calls
for this query, not randomly different each time (still "no relevance sort," just apparently
consistent for this particular pair — not something to generalize to the other 28 without
checking each one).

**Moonspell — "Far from God"**

| | release-group id | type | first-release-date |
|---|---|---|---|
| candidate 1 (= `releases[0]`) | `a2b513aa-2567-4f10-b22e-8a39c395edb3` | Single | 2026-03-25 |
| candidate 2 | `aebc070b-e3a1-4042-8f93-da01fc26fda8` | Album | 2026-07-03 |
| candidate 3 | `62882f57-c631-4752-814f-e907c0f0ad93` | EP | unknown |

Stored `albums` row: `mb_release_group_id` null, `release_date` **2026-03-25**, `artworkUrl`
`https://coverartarchive.org/release/bde3df2f-7863-4e2e-9c40-721520044071/45130133813.jpg`,
`genres` `["gothic metal", "black metal", "metal"]`. `releases[0]` picked the Single
(candidate 1) — its date, 2026-03-25, is what's stored, and Dan confirmed that date is
correct; its artwork (the Single's own cover) is stored too, and Dan confirmed that's wrong
(the Album's actual cover is a different image).

**Hypothesis check — date-only validation wouldn't have caught this:** confirmed. The Single
and Album candidates are ~3.5 months apart (2026-03-25 vs. 2026-07-03) — close enough, and
plausible enough as "announcement/lead-single date" vs. "release date," that a date-based
sanity check has no clear signal to flag as wrong; the stored date is in fact the *correct*
one to show regardless of which release-group it came from. Artwork has no such ambiguity —
the Single's cover and the Album's cover are simply different images, so a wrong pick shows up
immediately and unambiguously there. This is the asymmetry: Khemmis fails on both fields
because both trace to one wrong pick with a 13-year gap that breaks either check; Moonspell
fails only on artwork because the picked release-group's date happens to double as the right
answer even though the release-group itself is the wrong one for artwork purposes.

### 2026-09-18 (later same day) — Khemmis and Moonspell corrected, step 1 of 2

Both confirmed-broken rows fixed. Scope: exactly these two rows — Devin Townsend, Wormwood,
and the other 25 flagged-but-unconfirmed pairs were **not** touched. `reviews` rows were not
touched (their `link`/score/summary were already correct).

- **Khemmis — Khemmis**: `mb_release_group_id` set to `66eda96e-276a-46b5-a4bf-46bb8b201b28`
  (the Album). `release_date` corrected to `2026-06-12`, `artwork_url` to
  `https://coverartarchive.org/release/dcff9543-d196-4413-932e-847399167755/44840182532.jpg`,
  `genre` to `["doom metal", "heavy metal"]`.
- **Moonspell — Far from God**: `mb_release_group_id` set to
  `aebc070b-e3a1-4042-8f93-da01fc26fda8` (the Album). `release_date` corrected to
  `2026-07-03` (unchanged — it was already correct), `artwork_url` to
  `https://coverartarchive.org/release/5c8f4bb2-559e-4693-9be7-d704faa87f35/44696803448.jpg`,
  `genre` to `["gothic metal", "black metal", "metal"]`.

Both re-fetched from Supabase post-write to confirm the new values stuck, and both spot-checked
live on the local dev server against the real Supabase data — cards now show the corrected
artwork, release date, and genre tags. No pre-existing row already held either release-group
id (checked before writing, and confirmed again after — the only match post-write is the row
itself). Full test suite (401/401) and `tsc -p tsconfig.app.json` (210 pre-existing errors,
identical count with the fix stashed and unstashed — this is the already-accepted
`npm run type-check` backlog from `deferred-work.md`, unaffected by this change) both checked
rather than assumed.

Method: added `lookupMusicBrainzByReleaseGroupId()` to `scripts/musicbrainz.ts` — same
artwork-tier-sweep/genre-fallback/date-fallback logic as `lookupMusicBrainz`'s Step B/C, but
entered from a known release-group id instead of Step A's ambiguous search. One bug caught and
fixed during this step: the first version of the correction script overwrote `genre` with
whatever the fresh lookup returned, including empty — the release representing each
release-group has no genre tags of its own, and the new function initially lacked the
artist-level genre fallback that `lookupMusicBrainz` has, so both rows briefly had `genre: []`
in Supabase before the fallback was added and both rows re-corrected. Caught by inspecting the
script's own before/after log output, not by the verification steps below (they only checked
release_date/artwork/id, per the original ask) — worth remembering that a copy-fix like this
needs the same non-regression discipline as `applyAlbumEnrichment`'s existing precision guard;
the corrected script now applies that same guard (never let an empty fresh genre list overwrite
a stored one).

One-off script: `scripts/diagnostics/fix-khemmis-moonspell-release-group-2026-09-18.ts`.

**Step 2 (the `isAlbumEnriched()` fix that lets a wrongly-enriched row silently block all
future re-checks) has not been started — waiting on go-ahead, per the sequencing this step was
scoped under.**

## Also-check question 1 — do existing docs already cover this?

Confirmed no. `album-identity-decisions.md` §4's dual-key strategy discusses collapsing
different *editions/pressings of the same conceptual album* (its own example: "Circadian
Promise" vs. "Circadian Promise (Deluxe Edition)") — not two conceptually different albums
sharing a title. `unknown-band-collision-audit.md` covers the `Unknown Band | Unknown Album`
sentinel collision and pre-migration key collisions — a different mechanism entirely. Neither
anticipates this scenario.

## Also-check question 2 — can this merge two conceptually different albums into one row?

**Yes, currently possible — confirmed by code reading, not yet observed live.** Two distinct
paths in `resolveAlbumIdentity` (`scripts/ingest.ts`):

1. **The already-enriched row silently short-circuits any future re-check.** `runIngestion`'s
   `needMbCall` (`ingest.ts:900`) skips the MusicBrainz call entirely once a `norm_key`-matched
   row is `isAlbumEnriched()` (has `artwork_url`, `genre`, and `release_date` all set) —
   regardless of whether `mb_release_group_id` is populated. **This is the actual live state of
   the Khemmis row today**: `mb_release_group_id` is `null`, but the row is fully enriched with
   the wrong (2013 EP) data. Any future review naming band="Khemmis", album="Khemmis" — from
   any of the three sources — will attach to this same wrong row via `norm_key` match alone,
   with MB never consulted again to catch the mismatch. No arbitrary-pick coincidence required；
   this path is deterministic given the current row state.
2. **The release-group-match path, contingent on `releases[0]`'s pick.** For a row that *does*
   have `mb_release_group_id` set (17 of the 29 flagged pairs), a future ingest's Step A search
   for the same band+album text could have its `releases[0]` land on that same stored id by
   chance (MB's search has no relevance sort, so which of the tied-score releases comes first
   isn't guaranteed stable). If it does, `albumByMbId` matches and `applyAlbumEnrichment` merges
   the new review's fields onto the existing row — attaching data for what could be a genuinely
   different work. If it lands on the *other*, not-yet-stored release-group instead, the
   `normKeyMatch && !normKeyMatch.mb_release_group_id` backfill guard (`ingest.ts:735`) is false
   (the row already has a different id set), so a **second** `albums` row gets created with the
   identical `norm_key` as the first — a duplicate-row outcome instead of a merge, but likewise
   unhandled today.

Neither path has been exercised live this session (no new review was ingested to trigger it) —
this is a code-reading conclusion, flagged per the brief, not a fix.

## Step 2a — blast-radius diagnostic before widening `isAlbumEnriched()` (2026-09-18, read-only)

Before scoping step 2b (adding `mb_release_group_id` to `isAlbumEnriched()`'s definition so a
wrongly-enriched row can't permanently block future re-checks — see the merge-risk analysis
above), ran the numbers on how many rows across the *whole* catalog (not just the 29 flagged)
that change would newly expose to a live MB re-fetch.

- **68 of 320 albums** are enriched by today's definition (artwork+genre+date all present) but
  have no `mb_release_group_id`. Script:
  `scripts/diagnostics/diagnose-isAlbumEnriched-widen-blast-radius-2026-09-18.ts`.
- **67 of those 68** are not excluded by the existing 5-attempt/14-day retry cap
  (`selectAlbumBackfillCandidates`) — only `Mork — Monolitt` is excluded (5 attempts, published
  2026-06-20). So 67 would become live backfill candidates on the very next ingest run after
  the widened definition ships.
- At MB's 1 req/sec limit, ~1–3.5 minutes total for 67 albums (1 sleep/album best case, up to 3
  if the release-group-detail and artist-genre fallbacks both fire). **Correction to the
  premise this diagnostic was asked to confirm: ingest is not manual-only.** Per
  `ingest-trigger-and-security.md`'s own summary (2026-07-21) and the live, unmodified
  `.github/workflows/ingest.yml`, a GitHub Actions schedule (`0 7,19 * * *` UTC) really does
  call `POST /api/ingest` twice daily in production. `server.ts`'s handler returns `202`
  immediately and runs `runIngestion()` in the background behind an `ingesting` lock, so the
  1–3.5 extra minutes lands inside whichever scheduled run first processes the backfill pass,
  not as a separate collision — negligible next to the 12-hour gap between runs, but the
  "manual-only absorbs this" framing in the original ask was wrong and worth correcting rather
  than silently assuming.
- **The "also confirm" guard question does NOT hold — flagging as a real blocker for step 2b's
  design, not a rubber stamp.** The backfill loop calls `lookupMusicBrainz()` — the same
  ambiguous Step A search that caused the Khemmis/Moonspell corruption in the first place — not
  `lookupMusicBrainzByReleaseGroupId()`. `applyAlbumEnrichment`'s guards (including the
  artwork/date fix from step 1) only protect against fresh data being *null* or *lower-
  precision*; they do nothing when fresh data is non-null, full-precision, and simply **wrong**
  because Step A picked a different real release-group than the one already correctly stored.
  The `mb_release_group_id` assignment right after `applyAlbumEnrichment` in the backfill loop
  (`if (mbData.releaseGroupId && !enriched.mb_release_group_id) ...`) has the same problem —
  it unconditionally accepts whatever Step A resolves, with nothing to detect an ambiguous
  match. **Concretely: 8 of the 67 sweep candidates are already-confirmed same-title
  collisions** (matched >1 release-group in the original 29-row diagnostic): Apogean, Yes,
  Devin Townsend, Elder, Electric Sun Defence, Black Veil Brides, Inferi, Pro-Pain. Of those,
  only Devin Townsend has been manually confirmed safe (step 1's follow-up); the other 7 are
  unconfirmed and would be blindly re-fetched by a naive widen-and-sweep, with a real chance of
  regressing a currently-correct row to wrong data with no guard to catch it. Step 2b's design
  needs to account for this — e.g. not re-running ambiguous Step A search for already-enriched
  rows at all, or holding/flagging any re-fetch that resolves >1 release-group instead of
  silently accepting `releases[0]` — rather than treating the widened `isAlbumEnriched()` alone
  as sufficient.

No code changed this step; no row touched.

## Step 2b-i — widen `isAlbumEnriched()`, excluding all 29 flagged pairs (2026-09-18)

Narrower than the original step 2 scope: only the rows with no known ambiguity go through the
widened definition's re-fetch path. All 29 flagged pairs — confirmed-broken, confirmed-safe,
or unverified alike — are excluded from the backfill loop and left untouched, pending 2b-ii.

**Reconciling the 12-vs-8 discrepancy (checked, not guessed):** both numbers were correct for
what they measured, at different points in time. 12 was a static count from the *frozen*
step-2a diagnostic JSON — all 29 flagged pairs whose `storedReleaseGroupId` field was null *at
diagnostic time* (before step 1's fix). 8 was a *live* count restricted to rows that are both
still missing `mb_release_group_id` *and* already `isAlbumEnriched()` under today's (pre-
widening) definition — the specific subset the widening would newly expose. Re-checked all 12
against live current data: 2 (Khemmis, Moonspell) now have an id — step 1's fix — so they no
longer belong in either "no id" count; 2 more (Sun Guts, Shadowborne) are not, and never were,
`isAlbumEnriched()` under today's narrower definition (each is missing genre independently of
any id) — they were already ordinary backfill candidates before this session touched anything,
so they don't belong in the "newly exposed by widening" count either. 12 − 2 − 2 = 8, exactly
matching step 2a's live figure. No number needed correcting.

**Change:**
- `isAlbumEnriched()` now also requires `mb_release_group_id` to be a string (not just
  artwork/genre/date).
- New exported constant `FLAGGED_SAME_TITLE_COLLISION_NORM_KEYS` — the 29 flagged pairs'
  `norm_key`s (matched by identity, not by current id, since which rows currently hold an id
  keeps changing as more get manually corrected).
- `selectAlbumBackfillCandidates()` takes a new optional `excludedNormKeys` parameter
  (defaults to empty, so all pre-existing callers/tests are unaffected) and filters any
  matching row out before the enrichment/retry-cap checks. `runIngestion()` passes
  `FLAGGED_SAME_TITLE_COLLISION_NORM_KEYS`.

**Verification (live data, read-only where noted):**
- 14/14 tests in `backfillPass.test.ts` (10 existing + 4 new: the widened-definition case, the
  in-set/not-in-set exclusion cases, and a sanity check that the constant holds all 29 including
  Khemmis and Moonspell). Full suite 409/409, `tsc` unchanged (210 pre-existing errors).
- Ran `selectAlbumBackfillCandidates()` against the real, current 320-album catalog (read-only —
  no write): 0 of the 29 flagged pairs appear in the candidate list, regardless of their current
  id/enrichment state — spot-checked Khemmis, Moonspell, Devin Townsend, Wormwood, Apogean, Yes
  individually, all correctly excluded. 122 non-flagged rows are missing `mb_release_group_id`
  and 122/122 are selected as candidates (this run simulated no prior attempt history, so none
  hit the retry cap — the cap logic itself is unit-tested separately and unchanged by this step).
- Dry-ran the unchanged backfill mechanism (`lookupMusicBrainz` + `applyAlbumEnrichment` + the id
  assignment) for one real non-flagged row (`TodoMal — Graveyards of Joy`) without writing to
  Supabase: resolved and would correctly populate `mb_release_group_id`, confirming the
  mechanism this step exposes those rows to actually works.

**Residual gap closed same day, same branch:** the main per-review resolution loop's
`needMbCall` check is now guarded too, reusing the identical
`FLAGGED_SAME_TITLE_COLLISION_NORM_KEYS` set — not a new mechanism. The decision logic was
pulled out of the inline loop into a new pure, exported `needsMbLookup(normKey, normKeyMatch)`
(same extraction pattern as `selectAlbumBackfillCandidates`) so the flagged-pair exclusion is
independently testable without mocking `runIngestion`'s network/Supabase calls. A flagged pair
now skips the MB call unconditionally — even with no existing row at all, and even when the
existing row isn't fully enriched — matching the backfill loop's treatment. **Both call sites
that can trigger Step A's ambiguous search are now guarded.** Verified: 5 new tests
(`needsMbLookup` — flagged pair with no row, flagged pair with a partially-enriched row,
non-flagged pair unaffected in both the "no row" and "not enriched" cases, non-flagged
fully-enriched row still skips as before). Full suite 414/414, `tsc` unchanged (210
pre-existing).

**2b-ii is still open** — what happens to the 29 excluded rows themselves (disambiguation
design, whether/how to resolve the 7 unconfirmed-ambiguous rows among them) is not decided.
This step and its follow-up only stop both re-fetch paths from silently re-processing them.

## Explicitly not done this session

- No fix to Step A's disambiguation logic.
- No resuming/merging of the Metal Storm back-catalogue exclusion filter — stays paused.
- No correction of the Khemmis row or any other flagged row.
- No resolution of the 29 flagged pairs (2b-ii) — this step only protects them from the
  widened `isAlbumEnriched()` net.
