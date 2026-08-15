# Deferred / postponed work — consolidated tracker

This file is the single place to check for real, previously-decided future work that
has not yet been built or resolved. It does not replace the historical detail in
individual decision docs — those remain the source of truth for _why_ a decision was
made; this file exists so nothing gets lost across dozens of session-scoped "what this
session did NOT do" notes.

**Convention:** when a session identifies new deferred or postponed work, add it here
rather than only stating it inline in that session's own doc (see `CLAUDE.md`).

---

## A. Product features (named, not built)

- **A clear, accessible in-product explanation of how Criteria Calibration works —
  particularly why some users may see more questions than others — is deferred.**
  Confirmed with Dan (2026-08-13): no dedicated contradiction-detection/flagging UI is
  planned; behavior stays implicit (more questions when answers are less internally
  consistent, no explicit message). The explanation should cover this implicitly, without
  needing per-contradiction UI.
- **Sticky album-info (+ criterion-name row on Detail) for mobile album evaluation
  — stage 4b of the `mobile-album-evaluation-redesign` brief, deferred, needs its
  own branch.** Two approaches tried and reverted on that branch (not present in
  the merge to `master`):
  (a) internal scroll container with capped card height — rejected live, wasted
  screen space and clipped content (confirmed via screenshot, only 4/6 criteria
  rows visible before hitting an untuned `maxH` budget);
  (b) page-level sticky — technically simpler and preferred, but
  `MobileScreenTransition`'s horizontal slide uses `transform: translateX`,
  which creates a new containing block for descendants and is a known
  Safari/WebKit trouble spot for `position: sticky` (inconsistent — sometimes
  doesn't stick at all). Known fix if revisited: switch the track's horizontal
  animation from `x`/transform to `marginLeft` (0 -> -50%), which removes the
  containing-block effect; would need re-verification that this doesn't
  introduce jank (layout-property animation reflows every frame, unlike
  transform's GPU-composited path) and that sticky then works reliably in real
  Safari/iOS testing (emulated mobile viewports in Chrome DevTools don't
  exercise WebKit and don't prove anything here — this was tested for real in
  Safari desktop, not assumed).
  Also found and **not yet fixed**: `MobileScreenTransition`'s track is a flex
  row that sizes to its tallest child regardless of which panel is active — any
  future sticky work should keep the height-follows-active-panel fix
  (`animate={{ height }}` alongside `x`) that was part of this investigation,
  it's independent of the sticky question and still correct/needed.
  `album-rating-page.md` (stage 4a entries, same branch/file).
- **Retrofit the new `PageBreadcrumb` component onto other pages** — built reusable
  (`{label, to?}[]` API, `components/ui/breadcrumb.tsx`) during the AlbumRatingPage desktop
  redesign (2026-08-05) but only wired up there this session, per the brief's explicit scope
  limit. Favorites and Criteria Calibration are the next candidates, replacing their own
  back-link patterns. `album-rating-page.md`'s 2026-08-05 entry.
- **AOTY ranking session (Phase 7)** — the actual public-launch differentiator.
  Design discovery was paused mid-question in a design-discovery chat; not yet
  resumed. Route already reserved (`/aoty/:shareId`, see `auth-routing.md`). The Album
  Rating Page's `?from=aoty` back-destination currently falls back to `/favorites` with
  a `TODO` in `AlbumRatingPage.tsx`'s `resolveBackDestination()` — update that mapping
  once this route exists. `album-rating-page.md`.
- **Admin merge tooling for manual album dedup** — select two `albums` rows,
  reassign `reviews`/`favorites` foreign keys, delete the loser. Named only, not
  scheduled. `album-identity-decisions.md` §5 Layer 2.
- **Album data staleness / admin data-quality view** — surfaced 2026-07-17.
  **Could not locate a source doc for this.** Searched `docs/decisions/` and
  `CLAUDE.md`'s index for any "log-tags-decision-and-staleness-question" file or
  equivalent staleness/data-quality content and found nothing. Flagging as a named
  item with no confirmed home doc — if one exists outside `docs/decisions/`, it
  should be cross-referenced here instead of this note.
- **Live MusicBrainz autocomplete on `AddAlbumDrawer`** — debounced search-as-you-
  type, Layer 1 of the manual-add duplicate-prevention design. Named follow-up in
  `album-identity-decisions.md` §5 / `album-identity-frontend-favorites.md`.
- **Import tool** — text-paste MVP first. Richer follow-ups: Last.fm
  (`user.getTopAlbums`, time-scoped) and ListenBrainz (MBID-native). Spotify and
  YouTube Music ruled out (Spotify: extended-quota API access structurally
  unavailable to an individual developer; YouTube Music: no official API).
- **Bulk MusicBrainz ID backfill pass** — current backfill is opportunistic-only;
  already-enriched albums that never got an MB match can stay `mb_release_group_id
= null` indefinitely under the current design. `album-identity-ingest.md`.
- ~~**GitHub Actions cron for scheduled ingest**~~ — **DONE (2026-07-21)**.
  Implemented as `.github/workflows/ingest.yml` (`0 7,19 * * *` UTC +
  `workflow_dispatch`), calling `POST /api/ingest` with a server-only
  `Authorization: Bearer` secret. Live-verified via an actual `workflow_dispatch`
  run against production (`metalreviews.onrender.com`) — job completed green, the
  endpoint returned `202`, and `/api/ingest/status` confirmed the run finished.
  `node-cron` wiring in `scripts/ingest-cli.ts` is now genuinely dead code
  (superseded by the Actions workflow), not merely dormant. 60-day
  GitHub-inactivity caveat: accepted risk, unrelated to this item's completion.
  Full history: `ingest-trigger-and-security.md` Section 7.
- **Google/Facebook OAuth** — credentials not yet configured. Placeholder comment
  in `LoginPage.tsx` marks where the `supabase.auth.signInWithOAuth()` buttons go.
  `auth-routing.md`.
- **Resend SMTP (auth/email) — NOT YET UNBLOCKING PUBLIC LAUNCH.**
  Status: blocked on domain purchase. Currently in Resend sandbox mode
  (validation only).

  **The real constraint (corrected understanding, 2026-07-26):** Supabase
  Auth's default mailer does NOT just rate-limit at 2 emails/hour — it
  outright REJECTS delivery to any email address that is not a member of the
  Supabase project's organization team (`"Email address not authorized"`).
  This means anyone outside Dan's Supabase team — including a single friend
  invited to test the app — cannot currently receive a signup confirmation,
  password reset, or magic link email at all. This is a hard gate, not a
  throttle.

  **Why Resend sandbox mode doesn't fix this:** configuring any custom SMTP
  provider in Supabase (including Resend, even while Resend itself is in
  unverified/sandbox mode) satisfies Supabase's "custom SMTP configured"
  check and lifts Supabase's own team-only restriction. However, Resend's own
  sandbox restriction then applies: unverified Resend accounts can only send
  from `onboarding@resend.dev`, and only to the single email address used to
  sign up to Resend. Real users still can't receive email — the blocker just
  moves from Supabase's gate to Resend's gate.

  **What actually unblocks this:**
  1. Buy a domain (~$10-15/yr — Namecheap, Porkbun, Cloudflare, etc.)
  2. Verify the domain with Resend (SPF/DKIM DNS records, ~30-60 min
     propagation)
  3. Point Supabase custom SMTP config at the verified domain's Resend
     credentials

  Recommendation: use a subdomain for sending (e.g. `updates.slanttake.com`)
  rather than the root domain, per Resend's own guidance.

  **Current decision (as of 2026-07-26):** staying in Resend sandbox mode for
  now — no domain purchase yet. This lets Dan test the SMTP config and email
  templates end-to-end using his own Resend-registered email address.
  Sandbox mode does NOT allow sharing the app with even one friend for
  feedback — that requires either the full domain setup above, or (stopgap,
  not recommended) manually adding a tester's email to the Supabase org's
  Team settings, which grants dashboard access and isn't a real solution.

  **Revisit trigger:** before any public launch, and before sharing the app
  with anyone outside Dan himself for testing/feedback. Full corrected-finding
  writeup: `auth-email-smtp.md`.

- **Shareable AOTY page** (`/aoty/:shareId`) — route reserved (renamed from
  `/list/:shareId`), nothing built. `auth-routing.md`.
- ~~**Favorites row mobile redesign**~~ — **DONE**, `favorites-row-mobile-layout` branch (not
  yet merged, blocked on Dan's live visual confirmation). Both carry-over questions from the
  desktop pass are resolved: mobile drops `Tooltip` entirely (no touch/hover concern there;
  desktop's own `Tooltip` is still unaddressed), and real artwork was live-verified at both
  sizes. Full detail: `favorites-row-mobile-layout.md`.
- **Font-size token audit — hardcoded values across the codebase, some non-standard.** Surfaced
  2026-08-07: `FavoriteListItemRow`'s band/album typography is inline styles, not `theme.ts`
  tokens. Dan's explicit note: real, separate concern (many hardcoded font-size values app-wide),
  not to be fixed ad-hoc inside a component brief. Scope: audit all hardcoded font-size values
  codebase-wide, decide whether/how to consolidate into tokens. Not started.

## B. Known code/data gaps (accepted, not fixed)

- **Degree-2 flatness / degree-3-escalation stall confirmed to originate in
  `solveValues`' point-estimate assignment, not in candidate selection — open,
  2026-08-09.** `criteria-calibration-coverage-weighted-candidates` branch (merged)
  weighted degree-2+ refinement candidate sampling toward under-covered
  criterion/level combinations, on the hypothesis that uniform sampling was landing
  most candidates in a flat, uninformative region. Shipped (real, independent
  improvement — diversifies which combinations get asked about) but a read-only
  trace against Dan's real 33-answer production session confirmed it does **not**
  resolve the underlying stall: the solver's own `.point` values are already flat
  across levels 2-5 within a criterion regardless of which specific combination
  gets compared (e.g. criterion 0: `[0, 0.4995, 0.4996, 0.4996, 0.4996]` — one big
  jump 1->2, then flat). Weighting the draw away from level 1/max (already
  well-touched by cold start) pushes it toward levels 2-5 — precisely the region
  the solver already treats as flat — so the weighted pool samples _more_ into the
  flat region, not less. Fixing this requires changing how `solveValues` assigns
  point estimates within a criterion, not how candidates are chosen. **New finding
  surfaced by the same trace, possibly relevant to that upcoming solver-design
  decision:** criterion 5 received a solved weight of essentially zero across all 5
  levels (`[0, 0, 0, 0, 0]`) on this real session — flat at zero, not just flat
  among levels 2-5. Full trace output and reasoning: `docs/decisions/criteria-calibration-coverage-weighted-candidates.md`.
- **Criteria Calibration UI never displays the current `degree` anywhere —
  flagged 2026-08-11, not fixed.** Surfaced while diagnosing/fixing the
  degree-jump anomaly (`docs/decisions/criteria-calibration-degree-scoped-coverage-fix.md`):
  `ProgressHeader`/`RoundGaugeGroup` show round/progress/accuracy only. This is
  why repeated "you've resolved everything at this level of detail" screens
  during degree escalation were indistinguishable to Dan even after the
  underlying `isDegreeCoverageComplete` bug is fixed — clicking "Add more
  detail" now always asks a real question at a never-before-visited degree,
  but there's still no visible signal of which degree is currently active.
  Explicitly Dan's call whether/how to surface it (e.g. a small "Degree N"
  label near the round gauge) — not implemented, deferred per his own
  instruction when the fix brief was scoped.
- **`MobileRatingLayout`'s `revealed` gate race fix — not tested under a forced
  slow refetch.** Stage 4a revision 4 (2026-08-08, `mobile-album-evaluation-redesign`
  branch, `album-rating-page.md`'s dated stage-4a revision-4 entry) fixed a real bug
  where `RatingProgressBox`'s Rank/Score could permanently stick at "—" after the
  6th/final pick, by replacing a one-shot snapshot sync with a `revealed` boolean
  gate that re-arms on every pick (traced and confirmed at Dan's request:
  `setRevealed(false)` at `MobileRatingLayout.tsx:167` sits inside `handlePick`
  itself, not a one-time mount flip). Live-verified end to end against real
  Supabase data (0/6 -> 6/6, deliberate post-settle wait, Rank/Score correctly
  appeared) — but that test's `refetchRatingSummary()` may simply have resolved
  fast enough that the gate never had to bridge an actual gap; both a
  same-instant resolve and a genuinely-late resolve are consistent with the
  passing result. Proposed but not attempted: throttle network in the browser
  tool (if available) to force the refetch to resolve _after_ the slide settles,
  to get a harder guarantee than "verified under normal network conditions."
- **`skipped_posts.url` has no index.** Surfaced 2026-08-07 while adding the
  `filterAlreadySkipped` safety-net check (see `roundup-skip-fix.md`'s stale-deploy
  addendum). The new bulk check does one full-table `select('url')` per ingest run rather
  than a per-item query, so it doesn't strictly need an index yet, but the existing
  `logSkippedPost` dedup lookup (`.eq('url', url)`) is already unindexed too. Table is
  small (dozens of rows) — deliberately not built now, Dan's explicit call. Future
  hygiene: `create index skipped_posts_url_idx on skipped_posts (url);` as a `.sql` file
  for manual run, if the table grows enough to matter.
- **Multi-artist-credit genre gap (Sunn O))) & Boris style) — real but currently
  dormant, 0/128 live catalog matches.** `resolveAlbumIdentity`/Step C's
  artist-fallback only fetches genres for `artist-credit[0]`, ignoring
  additional credited artists on split/collab releases. Live scan (2026-07-19)
  of all 128 MB-matched releases found zero with `artist-credit.length > 1` —
  the doc's own illustrative example (Sunn O))) & Boris — Altar) doesn't even
  reach Step C in practice, since its release-level genres are already
  non-empty (Step A/B resolves it before the fallback ever fires). Confirmed
  via external MB check that genre overlap between co-credited artists is
  typically high (both drone/doom-adjacent for the Sunn O)))/Boris example),
  so a future fix would likely just be "merge genres across all credits."
  Fix cost is cheap and bounded (+1 MB call per extra artist, only for
  releases that both have multi-credit AND empty release-level genres) — but
  no live data currently exercises this path. Re-scan periodically (e.g. next
  time a split/collab review lands) rather than fixing speculatively.
  `genre-data.md` (original gap description, line 60).
- **Sunthema-style MB match-failure for concatenated multi-band splits — real,
  currently live, distinct from the artist-credit gap above.** Found
  2026-07-19 investigating "Deathspiral of Inherited Suffering, Elysian Blaze,
  Panegyrist, & Maerund – Sunthema" (The Progressive Subway, published
  2026-06-29): `mb_release_group_id: null`, `genre: []`, `artwork_url: null`,
  `release_date: null`, `mb_lookup_attempts: 5`. Confirmed live: MusicBrainz
  has no record of this release under any query shape tried — the full
  concatenated band string, each of the 4 band names individually paired with
  the release title, the release title alone, and a free-text search all
  returned 0 results. This is not an artist-credit-array problem (no release
  match means no `artist-credit` array ever gets inspected) — it's a
  different failure mode: obscure/DIY multi-band splits whose "band" field is
  a comma/ampersand-joined concatenation of N names may simply not be
  cataloged in MB under any name combination the current search logic tries.
  Practical cost: `mb_lookup_attempts` will likely keep incrementing
  indefinitely on future ingest runs for this album, spending real MB API
  calls (with rate-limit sleeps) against a query shape proven dead — worth
  considering a cap or a "give up after N attempts" rule at some point, though
  that's a separate design question from fixing the match itself. No fix
  attempted; discovery only.
- **AMG "Into the Obscure: Cianide" row recurred after its first cleanup —
  root cause unknown, open.** Found 2026-08-07. The Cianide post was first
  cleaned up 2026-07-26 (`reviews.id a0ee59d1-a7dd-4888-b691-848d24a446bc`,
  `albums.id 8ab3a8a1-c3a0-423d-b3c8-fd6f70b8abe3` — see
  `roundup-skip-fix.md`'s 2026-07-26 addendum), at which point the denylist fix
  should have prevented any further ingestion of it. A second, differently-ID'd
  copy was found live on 2026-08-07 (`reviews.id
8753001c-cc67-42fc-bdb1-e30b5c6b6f84`, `albums.id
47c1e4b8-340e-4705-8e98-768aefb0bae0`, `mb_lookup_attempts: 16` at time of
  discovery — notably higher than a single MB-lookup-retry pattern would
  predict) and deleted (see `roundup-skip-fix.md`'s 2026-08-07 addendum). A
  correct `skipped_posts` row for this URL has existed since 2026-07-26 the
  whole time, meaning the denylist check itself was never bypassed on the path
  that logs skips — so how a second `reviews`/`albums` row got created at all
  (which write path, when, why `mb_lookup_attempts` reached 16) was not
  diagnosed this session; it was deliberately deferred in favor of the
  higher-priority "Stuck in the Filter" regression investigation. Needs its own
  read-only diagnostic session before any further action.
- **`favorites.review_id` column — resolved, not open.** The original migration
  brief called for this to stay deferred pending Dan's go-ahead
  (`album-identity-migration.md`), but a later session confirmed via direct live
  query that the column is already gone (`favorites` rows are `{ user_id,
created_at, album_id }` only — `album-identity-ingest.md`), and
  `album-identity-frontend-homepage.md` explicitly logs the drop as "confirmed
  run." Listed here only so the now-superseded "not run yet" language in
  `album-identity-migration.md` isn't mistaken for current status.
- **`manual_albums` legacy table — resolved, not open.** Drop script
  (`supabase/manual_albums-drop.sql`) has been run against live Supabase; table
  physically dropped. Confirmed by Dan 2026-07-19. `manual-albums.md`,
  `album-identity-visibility-and-duplicate-fix.md`.
- **`scripts/seed-from-json.ts` — resolved, deleted.** Along with the
  `DbRow`/`fromDbRow()`/`toDbRow()` vestigial pre-migration mapping layer it
  was the sole consumer of, and `src/__tests__/dbMapping.test.ts` (an
  unanticipated second consumer, found via reference search before deletion,
  removed alongside since it only tested the removed code). `tsc --noEmit`
  clean, 164/164 tests passing post-deletion. `architecture.md`'s description
  of this relic is now historical only.
- **Security Finding #9 (`--no-sandbox` not passed to `puppeteer.launch()`)
  — closed, no current evidence.** Diagnosed 2026-07-19 against real Render
  production logs; no sandbox-crash signature found across runs checked.
  See `ingest-trigger-and-security.md` for full resolution note. Revisit only
  if a genuine sandbox-crash error signature appears in future logs.
- **Puppeteer `dependencies` fix (commit `a63fa62`) — resolved, not open.**
  Verified against a real Render deploy 2026-07-19: live ingest succeeded
  across all three sources with real scores returned. `render-deployment.md`.
- **Dropdown `<option>` white-background gap — resolved, not open.** Fixed and
  verified in Step 5 of the Chakra v3 migration (`css: { '& option': {...} }`
  on `controlFieldStyle`, all 4 dropdowns confirmed dark by Dan).
  `chakra-v3-migration-plan.md`.
- **Menu whiteAlpha-flash CSS override — verified correct under v3, closed
  (2026-07-20).** Live-checked both `Menu` instances (`src/Header.tsx`)
  running `npm run dev`: desktop account `Menu.Trigger` Button and mobile
  hamburger `Menu.Trigger` IconButton both show `aria-expanded="true"` driving
  the `css` override to `bg: surface.raised` (`rgb(63, 63, 70)`) /
  `color: text.primary` (white), confirmed via computed styles — no bare
  Chakra whiteAlpha flash underneath. `Menu.Item`s (`Log out` on desktop;
  `Reviews`/`Favorites`/`Log out` on mobile) show the same `surface.raised`
  bg on `data-highlighted` (hover), also via computed styles, not just
  eyeballing. `header-redesign.md` line 71-74 and
  `chakra-v3-migration-plan.md` Step 5 can be considered fully closed.
- **Chakra v3 foundation audit** — eligible to start, explicitly left as Dan's
  call on timing. Not started. `chakra-v3-foundation-audit-brief.md`.
- **Possible footnote-digit score-corruption risk in Angry Metal Guy / Metal
  Storm extraction** — same bug class as the already-fixed Progressive Subway
  footnote bug. **This note already exists** — it was not lost. See
  `score-parsing-bugfixes.md`, section "AMG / Metal Storm risk (not fixed,
  follow-up only)": AMG's rating regex is structurally exposed to the identical
  bug; Metal Storm's narrower extractor is safer but not fully immune. No fix
  applied to either; flagged for a future session if observed in the wild.
- **SputnikMusic still blocked** — site blocks automated access, no workaround
  pursued. `docs/_specs/project_specification.md`.
- **`Unknown Band | Unknown Album` collision — fix + cleanup shipped and verified,
  2026-07-17. Underlying collision mechanism itself remains unresolved.**
  `computeNormKey("Unknown Band", "Unknown Album")` is identical for every
  `extractBandAlbum` parse failure regardless of source, so the `albums` table can only
  ever hold one such row at a time; each new failure silently overwrites the last. The
  non-review-post skip fix (RSS `<category>` tag detection, `unknown-band-collision-audit.md`
  §6 / `roundup-skip-fix.md`) now prevents the roundup/retrospective-column posts that were
  driving most occurrences from ever reaching `extractBandAlbum` — verified live: a new "Lost
  in Time" post was correctly skipped, zero `albums`/`reviews` rows created. A follow-up
  cleanup pass then migrated the 3 pre-existing stale rows (including the sentinel row itself,
  which held PS's "Our June 2026 Albums of the Month!") into `skipped_posts` and deleted their
  now-orphaned `albums` rows — `stale-row-cleanup.md`. Final counts: albums 149→146, reviews
  148→145, skipped_posts 8→11. **Real gap still open:** the collision mechanism itself — one
  row per `norm_key`, silently overwritten — is not removed. Any future parse failure not
  caught by this fix's non-review-post categories (a genuinely new, unanticipated title shape)
  would still silently overwrite whatever currently occupies that `norm_key` slot. Pre-2026-07-13
  history remains permanently unrecoverable (`reviews.json` never committed).
- **Recurring-column band-field pollution in `extractBandAlbum`, corrected 2026-07-17.**
  Two categories, confirmed distinct after an initial misclassification:
  - **Non-review retrospective columns** (same bucket as roundup/list posts, not
    corrupted reviews): AMG's "Yer Metal Is Olde" (~120+ instances since Nov 2024,
    confirmed old-album-only via direct post fetch — e.g. reviews Stratovarius's
    mid-90s _Episode_, not a new release) and AMG's "The Willowtip Files" (confirmed
    retrospective — reviews a 2004 album as part of a "label's 2001–2006" feature). PS's
    "Lost in Time" (10+ instances since Mar 2025) is the same pattern, confirmed across
    three separate instances (Metallica's 1991 _Black Album_, Anathallo's 2006 _Floating
    World_, Watchtower's 1985 _Energetic Disassembly_) — always an old-album
    retrospective, never new-release coverage.
  - **Genuine franchise-prefix pollution on a real, current review** — the one confirmed
    case is AMG's "AMG's Unsigned Band Rodeö" (~110+ instances since Dec 2024): checked
    directly, it reviews a real new release (Blindfolded's _What Seeps through Threads_,
    released July 2025) with real numeric scores, but its band field still ends up
    polluted with the franchise prefix (`"AMG's Unsigned Band Rodeö: Blindfolded"`
    instead of `"Blindfolded"`). This is the one case where the pollution actually
    corrupts a legitimate review's identity, not non-review content flowing through the
    review pipeline.
  - Neither category is a parse failure (no sentinel in either case) — both risk
    bad/failed MusicBrainz lookups and wrong-looking cards on the frontend, but for
    different underlying reasons (non-review content masquerading as a review, vs. a
    real review's identity getting the wrong band name). Surfaced as a finding only; no
    fix proposed or scheduled. `unknown-band-collision-audit.md` §5.
- **AMG's non-review content is much larger than "a few named roundup phrases" — scope
  correction (2026-07-17), fix shipped and verified the same day.** AMG's ingested feed is
  a whole-site blog feed (77-page / ~770-post "Blog Posts" category archive), not a reviews
  feed. Beyond the three originally-named roundups, the audit confirmed "AMG Goes Ranking",
  annual list posts, and other unnamed franchises could silently produce wrong or
  sentinel-colliding `band`/`album` pairs. The shipped fix (`roundup-skip-fix.md`,
  `unknown-band-collision-audit.md` §6) handles this generally via the RSS `<category>` tag
  signal identified here: genuine review items carry `Reviews`/`Review` (AMG) or `Album
Reviews` (PS) category tags that non-review posts don't, and `scripts/ingest.ts` now reads
  `item.categories` to check for them. The one confirmed false-negative franchise (AMG's
  "Unsigned Band Rodeö", a genuine review filed under its own category instead of `Reviews`)
  is allowlisted by name. Other named-but-unverified AMG franchises ("AMG Goes Ranking", the
  annual list posts) were deliberately **not** individually allowlisted — they fall through
  to "skip" under the fix's default logic, consistent with this entry's original finding,
  without needing per-franchise handling. Metal Storm's feed is already structurally
  review-only, so the question doesn't apply there. **What's still NOT done:** the Rodeö
  franchise's own band-field pollution (still reads `"AMG's Unsigned Band Rodeö: <Band>"`
  instead of `"<Band>"`) is unfixed and separately scoped — see the "Recurring-column
  band-field pollution" entry above. PS has not had the same AMG-depth site-search census
  done, so it may still hold undiscovered non-review franchises beyond the confirmed "Lost in
  Time"/"Albums of the Month" — if one surfaces (visible via the live `skipped_posts` log),
  it isn't automatically allowlisted; it would need the same individual-verification
  treatment Rodeö got before being added. `unknown-band-collision-audit.md` §4, §6;
  `stale-row-cleanup.md`.
- **4 historical `reviews` rows with `score: ''` / `normalized_score: 0`,
  non-review-post pollution — diagnosed and migrated, 2026-07-20.** Found while
  diagnosing the Metal-Storm-timeout score-collapse bug (2026-07-19). All 4
  were Angry Metal Guy, matching known non-review franchise patterns ("Yer
  Metal is Olde: Warning" / _Watching from a Distance_, "The Willowtip Files:
  Commit Suicide" / _Synthetics_, "Stuck in the Filter" / _April 2026's Angry
  Misses_, "Record(s) o' the Month" / _March 2026_). Diagnosis confirmed all 4
  `published_at` dates (2026-06-12 through 2026-07-02) predate the
  non-review-post skip-fix's ship date (2026-07-17) — not a live gap in the
  filter, simply outside the narrow scope of the prior two `stale-row-cleanup.md`
  passes. None appeared in `skipped_posts` already, ruling out a
  double-logging edge case. A third cleanup pass (same pattern as the prior
  two) then migrated all 4 into `skipped_posts`
  (`reason='backfilled_non_review_cleanup'`) and deleted the now-orphaned
  `reviews`/`albums` rows — see the appended entry in `stale-row-cleanup.md`.
  Final counts: albums 151→147, reviews 151→147. **Closed — no remaining
  action.**
  - Same investigation also found and fixed an adjacent, previously-unknown
    bug: `logSkippedPost` had no dedup check, so every `npm run ingest` run
    unconditionally re-logged every non-review post still in the RSS feed's
    current window, even if already logged. 40 rows had accumulated in
    `skipped_posts` from just 12 manual ingest runs across two debugging
    sessions (2026-07-17, 2026-07-19) — confirmed via timestamp analysis to be
    normal repeated manual runs, not a rogue/scheduled process. Fixed by
    adding a `url`-based existence check before insert in
    `scripts/ingest.ts`'s `logSkippedPost` (now exported, covered by
    `scripts/__tests__/logSkippedPost.test.ts`); the 40 pre-existing
    duplicates were then backfill-deduped (kept earliest row per URL) down to 4. `tsc --noEmit` clean, full test suite passing throughout. Not written
    up as a standalone decision doc — tracked here only, per explicit
    direction.
- **Score-collapse fix (normalizeScore null-handling) — shipped, live
  verification pending.** Root cause (Metal Storm navigation-timeout failures
  writing `normalized_score: 0` instead of `null`, silently averaged into
  frontend `averageScore`) diagnosed and fixed 2026-07-19. Fix is unit-verified
  (tsc clean, 167/167 tests) but has not yet been exercised against a real
  production Metal Storm timeout — no live ingest was run as part of the fix
  session. Close this out once a future ingest run naturally hits a Metal
  Storm navigation timeout and the resulting row is confirmed to have
  `normalized_score: null` (not `0`). Check via Supabase directly after any
  ingest run that logs a Metal Storm timeout error.
- **`docs/decisions/refresh-button.md` is stale and undated as such** — surfaced
  2026-07-25 (design-system pass 8's audit). The manual refresh button and
  `GET /api/ingest/status` it polled were both removed on 2026-07-21 when ingest
  moved to GitHub Actions cron (`ingest-trigger-and-security.md` Section 7), but
  `refresh-button.md` itself was never updated with a superseded-note, and its
  `CLAUDE.md` "Past decisions" index line still describes it as if the feature
  exists. A session that reads only the index line (not this tracker) could be
  misled into thinking a refresh button is still live. Fix is small: either
  prepend a dated superseded-note to `refresh-button.md` (same pattern used for
  `ingest-trigger-and-security.md`'s own summary block) or change its `CLAUDE.md`
  index line to say "historical, feature removed" — not done in this session,
  intentionally out of scope per the brief that surfaced it.

- **Solver point-estimate normalization doesn't jointly hold — fixed 2026-08-09.**
  Originally confirmed live 2026-07-30 (1.308 normalization sum on a real account, raw
  score 122%, display-clamped to 100% as a stopgap). Fixed on the
  `criteria-calibration-joint-point-estimate` branch: `LevelValue.point` now comes from a
  single joint Chebyshev-center LP solve rather than independent per-variable midpoints,
  so normalization holds exactly by construction (verified: real production account
  1.3077509833333332 → 1.0000000000000002). `computeSolverAccuracy` deliberately left
  unchanged (range-width method, per Dan's explicit scope call) — only the point used for
  scoring/ranking/candidate-ambiguity changed. Measured, not assumed: this fix does
  **not** move `nextAction`'s degree-3 escalation point on the same real data (top
  candidate gap ~0 either way) — the separate levels-2–5 flatness issue below is
  unaffected. Full detail: `criteria-calibration-joint-point-estimate.md`.
- **Medium tier can't distinguish middle levels — real ties, not a rare edge
  case.** Also found live 2026-07-30: Medium tier's degree-2 questions only ever
  compare each criterion's _extreme_ levels (1 vs 5), so levels 2–4 are never
  directly probed and land on identical solved values under monotonicity alone.
  Two differently-rated albums (4/4/3/4/3/3 vs 2/2/2/2/2/2) produced the exact
  same raw score. `rankAlbum`'s deterministic `albumId` tie-break — written
  defensively for an assumed-rare case — is therefore doing real, load-bearing
  work at Medium tier: rank ordering among Medium-tier-only users will often
  reduce to something close to insertion order, not a real preference signal,
  until a user answers degree-3+ questions. Not a bug (consistent with the
  engine's already-documented under-determination scope), but worth knowing
  before any UI presents rank as a meaningful signal on its own. `album-rating-drawer.md`.

- **Degree-2 refinement candidates rarely differentiate levels 2–5 — real
  session diagnosed 2026-08-09.** Read-only diagnostic (not fixed this session)
  of Dan's real 33-answer degree-2 session (`eec42cd4-...`) traced why
  `nextAction()` never reports `degree-exhausted`: after the 15-pair cold start
  (extreme 1-vs-5 probes per criterion), the solved model has learned "level 1
  is worse" per criterion but almost nothing distinguishing levels 2–5 from each
  other (solved step sizes ~0.0001–0.0002 between levels 2→3→4→5, vs.
  ~0.08–0.50 for the 1→2 step). Refinement candidates draw levels uniformly
  across 1–5, so most drawn pairs land in this flat, undifferentiated region and
  read as maximally ambiguous (gap ≈ 0), keeping `nextAction()` stuck offering
  more degree-2 questions instead of ever reporting the pool empty or a gap
  above `MAX_AMBIGUOUS_GAP`. Confirmed not a bug in the 2026-08-09 dominance
  filter (`criteria-calibration-dominance-filter.md`) — that filter changes
  candidate composition but doesn't cause or fix this; `totalSlack = 0`
  throughout confirms Dan's real answers are internally consistent, so this is
  under-determination, not noisy input. A synthetic continuation suggests
  several dozen to 70+ more real answers before this resolves on its own at
  Dan's observed (slow) convergence rate. Open question for a future session:
  should refinement candidate generation preferentially probe mid-levels
  (2–4) once the extremes are pinned, rather than drawing uniformly across
  1–5? No fix attempted this session (diagnostic was explicitly read-only).
- **`MAX_AMBIGUOUS_GAP = 0.05` (`elicitationDriver.ts`) may need to scale with
  criteria count — open question, not resolved.** Same 2026-08-09 diagnostic:
  under the additive model's normalization (best-level values summing to ~1
  across criteria), each criterion's average "budget" shrinks as criteria count
  grows (0.20 at 5 criteria vs. 0.167 at 6), so a genuine, resolved trade-off
  gap between two criteria is plausibly smaller on average at 6 criteria than
  at 5 — meaning a fixed 0.05 threshold could be effectively stricter (harder
  to clear) as criteria count increases. Dan's 6-criterion session data
  couldn't cleanly isolate this from the levels 2–5 flatness issue above (both
  push gaps toward 0 for unrelated reasons), so this remains unverified,
  provisional — same status as the other unvalidated accuracy thresholds in
  `accuracyTiers.ts`. Worth revisiting once a real 6-criterion session reaches
  much higher accuracy and the flatness issue above is no longer confounding
  the gap signal.

- **`simplex.ts`'s LP solver could silently return garbage values on degenerate
  input — fixed 2026-08-09.** Discovered live via a diagnostic that drove
  `nextAction` for 42 rounds against the `REAL_SESSION_*` (5-criterion) oracle:
  the pre-fix Big-M solver returned `feasible: true` with `values[c][level].point`
  up to ~1.16e14, despite `totalSlack === 0` (the data was fully consistent — a
  purely numerical failure, not a real infeasibility). Root cause: Big-M mixed a
  `1e7` penalty coefficient into the same objective row as the real O(1) costs,
  which wrecked the tableau's conditioning on this problem's highly degenerate
  constraint shape (many monotonicity/answer rows sharing structure); separately,
  the old feasibility check only verified artificials were out of the basis, never
  that the simplex loop actually reached optimality rather than exhausting
  `MAX_ITERATIONS`. Fixed by rewriting `solveLP` as two-phase simplex (Phase 1
  minimizes only the sum of artificials to establish feasibility, no Big-M
  anywhere; Phase 2 optimizes the real objective from that feasible basis), with
  both phases now propagating a `converged` flag so a run that hits the iteration
  cap without reaching optimality is reported `feasible: false` instead of
  silently returned as a solution. Bland's rule (already in place for
  anti-cycling) carried through unchanged into both phases. `solveLP`'s public
  signature/return shape is unchanged — `solveValues`/`computeChebyshevCenter`
  (its only callers, both in `solver.ts`) needed no changes. Verified: all 226
  pre-existing tests pass unchanged plus one new permanent regression test
  (`solver.test.ts`'s "n=42 numerical-blowup regression" block, fixture
  `N42_REPRO_ANSWERS` in `fixtures.ts`, regenerated deterministically the same way
  the diagnostic found it — driving `nextAction` against the `REAL_SESSION_*`
  oracle for 42 rounds); the same input now produces monotonic, exactly-normalized
  point values in the sane `[0, 0.5]` range instead of ~1e14. Full detail:
  `two-phase-simplex-rewrite.md`.

- ~~**Automatic degree escalation (replace manual gap-based `degree-exhausted`
  trigger)**~~ — **DONE (2026-08-10).** `nextAction`'s old `MAX_AMBIGUOUS_GAP` gap-based
  check (deleted, along with the constant itself — dead once its one call site was
  removed) is replaced by `isDegreeCoverageComplete` (`elicitationDriver.ts`): a degree is
  exhausted once every free `(criterion, level)` variable across the FULL model (not
  scoped per degree) is both touched (`computeTouchCounts`) and narrow
  (`.max - .min < MAX_VALUE_RANGE_FOR_COVERAGE`, provisional 0.2 — see the extended
  entry below). `rankCandidatesByAmbiguity`/`questionOrdering.ts` unchanged — it governs
  within-degree question ordering only, never escalation. The pre-existing pool-empty
  trigger stays fully independent (verified by its own regression test). Verified: oracle
  trace reaches `coverage-complete` at exactly n=63 (matches the design checkpoint's
  measurement); Dan's real 33-answer/6-criteria session correctly does NOT escalate
  (criteria 0-3 all still above the 0.2 width threshold, criterion-0/level-3 the single
  worst case at touchCount=1/width~0.9986; criterion 5 fully resolved, confirming it's a
  genuine low-weight preference, not a coverage gap, per the earlier criterion-5
  diagnostic). `tsc --noEmit` clean, 233/233 tests passing. Full design reasoning:
  `criteria-calibration-adaptive-degree-escalation.md`. **Still open, not resolved by this
  pass:** whether escalation should happen automatically without the "Add more detail"
  button click — explicitly Dan's call, deferred. Also still unfixed and unrelated: the LP
  solver throws "infeasible even with slack" after enough forced/synthetic answers past
  what's normally exercised (n=70 oracle trace / n=55 real-session-extended trace) — caps
  how far any future escalation-adjacent design can push before the solver needs its own
  hardening pass. **Root-caused 2026-08-12** — see the Dantzig stress-test entry below.
- **LP solver hardening — diagnosed 2026-08-12, implementation still outstanding.**
  Two read-only diagnostic passes established that the "infeasible even with slack" crash is
  numerical amplification from `simplex.ts`'s Bland's-rule pivoting selecting near-zero pivot
  elements, and that switching to Dantzig's rule eliminates it on all realistic data
  (0 failures across ~4000 solves, n=20…300, three data tracks; Bland fails 44/120 at n=59
  and 30/30 at n=150). Verdict was **GO** for a production implementation brief. Outstanding
  items, in priority order:
  Items 1 and 2 below **shipped 2026-08-12** on `criteria-calibration-dantzig-fix` (see
  `criteria-calibration-dantzig-fix.md`); items 3 and 4 remain open.
  1. ~~Implement pure Dantzig in `simplex.ts`~~ — **done 2026-08-12.** Both phases, plus the
     phase-1→phase-2 artificial cleanup switched to largest-magnitude selection.
  2. ~~Bland silently returning wrong weights~~ — **done 2026-08-12**, and it was worse than
     the 2/120 constraint-violating case originally flagged: confirmed read-only against the
     live DB that Dan's `user_criterion_weights` held **30 rows, all zero** (sum 0, not 1),
     because a failed Chebyshev-center solve was being swallowed into an all-zero point
     estimate and persisted. Closed by a post-solve feasibility guard in `solveLP` plus
     making the Chebyshev failure throw instead of degrading to zeros.
  3. **Still open — Dantzig is a mitigation, not a cure.** The root cause is the
     `EPS = 1e-9` ratio-test threshold admitting near-singular pivots; the smallest pivot
     element used is a perfect predictor of failure across every case tested. The 2026-08-12
     pass added detection (`nearSingularPivot` in `LPSolution.diagnostics`) but deliberately
     did NOT change the ratio test — the real fix is a Harris ratio test or periodic
     refactorization. See the separate all-'equal' entry below for what remains reachable.
  4. **Still open — `MAX_ITERATIONS = 2000` is safe now and not forever.** Dantzig first
     exceeds it at n≈300 and routinely by n≈400–600. Confirmed on the real implementation at
     n=59: worst per-solve pivot count under 600, Chebyshev LP 409 — >3x headroom, pinned by
     a test. Revisit alongside any auto-escalation work that lengthens sessions.
     A Dantzig-primary/Bland-fallback design was considered and **rejected** — reasoning
     recorded in the decision doc so it isn't re-proposed. Full detail, tables and method:
     `criteria-calibration-dantzig-stress-test.md`.
- **All-'equal'-heavy answer logs at high n can still fail the LP — NOT fixed, deliberately
  out of scope of the 2026-08-12 Dantzig pass.** On pathologically degenerate inputs — answer
  logs that are majority `'equal'` at n >= 100, or >30% self-contradictory at n >= 300 —
  Dantzig degrades the same way Bland did, via the same near-singular-pivot mechanism. What
  the Dantzig pass changed is that these now fail **loudly** (a thrown error naming the
  numerical cause) instead of returning silently-wrong weights, which was the bar that pass
  targeted. Making them not fail at all requires fixing item 3 above — the `EPS = 1e-9`
  admission itself — which is substantially larger work (Harris ratio test / refactorization)
  and needs its own brief. Practical exposure is low: Dan's real session runs ~12% `'equal'`
  with a low contradiction rate, and the measured breakdown boundary is around a 70% equal
  share at n=150. Relevant if auto-escalation ever pushes sessions into the hundreds, or if a
  user answers 'equal' very frequently. Measurements and the variable-separation sweep that
  established the boundary: `criteria-calibration-dantzig-stress-test.md`.
- **Score-spread accuracy thresholds (`SCORE_SPREAD_MEDIUM_THRESHOLD` /
  `SCORE_SPREAD_HIGH_THRESHOLD` / `SCORE_SPREAD_VERY_HIGH_THRESHOLD` in
  `accuracyTiers.ts`) are provisional — same unresolved status as the
  `computeSolverAccuracy`-era thresholds they replace.** Calibrated only against the
  2026-08-09 oracle-simulation trace (5-criterion synthetic ground truth) and Dan's
  real 6-criteria/33-answer production session (no ground truth there — checked only
  for "moves sensibly, doesn't saturate"). These numbers, and whether the score-spread
  metric itself needs further tuning (sample size, aggregation formula), should be
  revisited together with the already-flagged need for a second real calibration
  session on the current 6-criteria/5-level production model (see
  `criteria-calibration-engine.md`'s "Accuracy thresholds — explicitly not validated"
  section and the matching comment in `accuracyTiers.ts`) — one recalibration pass
  covering both, not two separate follow-ups. Do not tighten or loosen these
  constants without that session's data. Full detail:
  `criteria-calibration-score-spread-accuracy.md`.

  **Extended 2026-08-10:** same provisional status applies to
  **`MAX_VALUE_RANGE_FOR_COVERAGE = 0.2`** (`elicitationDriver.ts`), the coverage-based
  degree-escalation threshold that replaced the gap-based `MAX_AMBIGUOUS_GAP` check (see
  the "Automatic degree escalation" entry above). Calibrated only against the same
  2026-08-09 oracle trace: 0.3 was measured to cut off a real, still-substantial accuracy
  gain (18% relative improvement between n=47 and n=63); 0.2 captures it; nothing tighter
  (0.15/0.1/0.05) fired at all within 65 oracle steps. Not a separate follow-up — revisit
  together with the thresholds above in the same future recalibration session.

  **Extended 2026-08-14:** same provisional status applies to
  **`REQUIRED_ANSWER_SPAN = 12`** (`rankingStabilitySignal.ts`), the Brief 3
  auto-escalation stop signal's minimum real-answer span (replaces the original K=2
  checkpoint-count window — see `criteria-calibration-duration-based-window-fix.md`).
  Chosen from a 4-value sweep ({3, 6, 9, 12}) against Dan's single real 70-answer session:
  R=3 still false-fired, R=6/9/12 all held through the end of that trace; 12 was picked for
  margin beyond the single observed instability window, not as the bare minimum that
  cleared it. Revisit together with the thresholds above once a second real calibration
  session is available.

- **`RANKING_TEST_SET` (`src/lib/criteria-calibration/rankingTestSet.ts`) is
  currently a static, hardcoded list of Dan's own 13 albumIds — not per-user.**
  Surfaced 2026-08-14/15 while diagnosing why Brief 3's auto-escalation signal
  degrades to a bare "R real answers after tier-eligibility" timer on any
  account other than Dan's (`useRankingTestSetRatings.ts`'s query is correctly
  RLS-scoped to the current user, but the 13 albumIds themselves are frozen
  from Dan's own ratings, so every other account gets an empty ratings map —
  confirmed live on a disposable test account). This is a deferred multi-user
  limitation, not a permanent single-user-by-design decision — Dan confirmed
  (2026-08-14 chat session) the product will eventually be multi-user. Before multi-user launch, this
  needs to become per-user: each user's own already-rated albums, fetched
  dynamically at calibration time, instead of a shared fixed list. The
  2026-08-14 null-guard fix (`computeTop10Set` returning `null` below 10
  ratings) already correctly models the "new user hasn't rated enough albums
  yet" case this future design will hit constantly — no rework needed there,
  just the source of the ratings needs to become per-user. Full context:
  `criteria-calibration-duration-based-window-fix.md`,
  `criteria-calibration-ranking-stability-analysis.md`.
- ~~**`accuracy_value`/fresh-recompute discrepancy on Dan's real account**~~ — **NOT
  CONFIRMED, retracted.** Re-verified 2026-08-15 (`criteria-calibration-weights-write-race.md`'s
  dated correction section): a fresh `computeScoreSpreadAccuracy` recompute over the live
  70-answer log exactly matches (diff = 0) the stored `accuracy_value`, and no write or
  answer mutation has touched the account since the original 92.04% reading. The 0.99999
  figure doesn't reproduce and was most likely a bug in that session's own ad hoc check, not
  a real stored/fresh mismatch.
- ~~**`computeScoreSpreadAccuracy` scales superlinearly with answer count**~~ — **DONE
  (2026-08-15)**, on `criteria-calibration-lp-warm-start`. Diagnosis: call count is constant
  at 210, so the superlinearity was entirely per-solve cost (~O(n²): tableau grows in both
  dimensions per answer while pivot count grows too). All 210 solves shared one constraint set
  and differed only in objective, so tableau construction + Phase 1 — 79% of each solve's time,
  80% of its pivots — was identical work repeated 210 times. Fixed by splitting `solveLP` into
  `prepareLP` + `solveFromPrepared` and preparing once (`simplex.ts`); `solveValues`'s pass-2
  range solves share the same win. Warm-starting was the applicable mechanism of the two
  originally guessed. Per-question blocking time at n=59: 1881ms → 309ms (6.09×), bit-for-bit
  identical output verified over 2314 solves. Full detail:
  `criteria-calibration-lp-warm-start.md`.
- **Web Worker relocation for the per-commit LP computation — deliberately deferred, not
  rejected.** Was the second of the two candidate mechanisms for the item above; the
  diagnostic showed it addresses a different problem (hiding latency vs. removing work), so it
  was held back rather than bundled. Decision point: measure the post-warm-start per-question
  cost on Dan's actual hardware (~309ms at n=59 on the dev machine used for the fix) and
  decide whether that residual still warrants going off-thread. Note if revisited:
  `usePendingWritesGuard.ts`'s "Saving…"/pending-writes UI would need re-verification with the
  computation off the main thread. `criteria-calibration-lp-warm-start.md` §5.
- **`nextAction` and `computeCommitState` each run their own `solveValues` over the identical
  answer log, twice per question.** Found 2026-08-15 during the warm-start pass. Deduping
  needs an `elicitationDriver` API change to accept a pre-solved `ValueSolverResult`, which
  couples the driver to its caller's compute lifecycle; after the warm start the duplicate
  costs ~50ms at n=59 rather than ~200ms, so it was not worth the coupling in that pass.
  Revisit only if per-question cost becomes a problem again.
- **`computeScoreSpreadAccuracy` is still O(n²) after the warm start** — the pass removed a
  ~4× constant factor, not the complexity; the residual is 96% genuine Phase 2 pivoting.
  Around n≈120 per-question cost returns to what n=59 cost before the fix. No action needed
  now (real sessions don't reach that), but this is the known ceiling of the current approach
  — a genuine complexity fix would mean a different algorithm (revised simplex with a sparse
  factorization, or an LP library), which is a much larger change.
- ~~**Weights/status upsert had an unfixed write-race**~~ — **DONE**, fixed 2026-08-15 on
  `criteria-calibration-weights-write-race-fix`. `upsert_calibration_status`'s conflict
  clause now only adopts `accuracy_value`/`tier`/`answer_count` from a write whose
  `answer_count` is `>=` the row's current value (see
  `supabase/user_calibration_status-add-answer-count-guard.sql`), verified with a deliberate
  two-write race test. Note: the account-level 92.04%/n=69 "evidence" that originally
  motivated this diagnosis did not hold up under re-verification (see the item above and
  `criteria-calibration-weights-write-race.md`'s dated correction) — the fix ships anyway
  because the RPC's structural lack of a guard was real and independently confirmed by
  reading its code, regardless of that one account never having visibly hit it.
  `last_eligible_top10`/`last_change_answer_index`/the `previous_*` triple remain
  unguarded, deliberately in scope terms — but see the new item directly below for why their
  staleness is no longer simply "safe-direction/delay-only" as previously assumed.
  Full detail: `criteria-calibration-weights-write-race.md`.
- **CORRECTNESS RISK TO AN ALREADY-SHIPPED SIGNAL** (not routine cleanup — flagged distinctly
  from this section's other accepted-not-fixed items): **`last_eligible_top10`/
  `last_change_answer_index` can regress backward via the same write-race, and this can fire
  Brief 3's live auto-escalation signal EARLIER than the true trajectory warrants — not just
  later.** Confirmed live (not theoretical), though narrower in practice than the
  accuracy*value/tier race the 2026-08-15 fix closed — see the trigger-assessment note added
  to that fix's approval for the concentration (fresh, non-resumed sessions; needs an early
  Undo that revisits the same answer_count; needs a genuine HTTP response reordering, which is
  real for this whole class of un-awaited writes but not guaranteed on any given commit). No
  user-visible symptom and no self-correction if it happens — worth prioritizing over this
  section's other items precisely because it's silent. Surfaced 2026-08-15 while scoping the
  fix above, under direct
  challenge to the "staleness here only delays firing, never falsely un-fires" claim from
  the two prior migrations' headers (`user_calibration_status-add-stability-window.sql`,
  `-add-previous-window.sql`). Mechanism, reproduced live in
  `scripts/verify-write-race-guard.ts` check #4: `computeStabilityWindowUpdate`'s
  ratings-null skip (`commitComputation.ts`) means a write computed *before* the
  `RANKING_TEST_SET` ratings fetch resolves carries the client's prior (pre-advance) window
  state; if that write's HTTP response resolves at the DB *after* a later write (e.g. the
  same commit reached again via Undo+Redo, once ratings had resolved) already advanced
  `last_eligible_top10`/`last_change_answer_index` forward, the stale write silently
  overwrites them backward — `last_change_answer_index` regressed `11` → `4` in the
  reproduction. A regressed (smaller) `last_change_answer_index` makes a later resumed
  session compute a *larger* apparent stability span than the true trajectory, which can
  fire Brief 3's auto-escalation signal early. `fired` itself still can't regress
  true→false (its own OR-guard is unaffected), so this can't un-fire an already-correct
  stop — the risk is a premature *first* fire. Deliberately left unguarded in the
  2026-08-15 fix (out of scope for that pass's accuracy_value/tier target); a future fix
  would need the same `answer_count`-style guard extended to these two fields specifically
  (not a blanket widening — `previous*\*`/`last_commit_changed_window`may still be fine
unguarded, unexamined here). Full mechanism:`criteria-calibration-weights-write-race.md`'s
  "Fix implemented" section.
- **Refresh-during-write data loss is mitigated, not eliminated.** Same session/doc as above.
  `usePendingWritesGuard.ts`'s `beforeunload` warning only helps if the browser actually
  shows the native confirmation and the user heeds it — a forced close, crash, or a dismissed
  prompt can still silently drop an in-flight answer insert. Full elimination would need the
  `keepalive` fetch flag threaded through the Supabase client (non-trivial — no per-call fetch
  override currently exists in `supabaseClient.ts`), deferred as not urgent enough to justify
  that plumbing on top of the same pass's other fixes.

## C. Design/branding (open)

- **Criteria Calibration header layout** — needs a dedicated reorganization pass.
  Surfaced 2026-07-28 while building the Criteria Calibration screen UI (Phase 7);
  current `ProgressHeader` layout (Progress ring + Accuracy status centered,
  "Stop here" right, empty flex spacer left) works but wasn't given a real design
  pass — out of scope for that UI-only brief. `docs/decisions/criteria-calibration-ui.md`.
- **Logo** — T-ligature concept explored across five typefaces (Bebas Neue,
  Archivo Black, Playfair Display, Space Mono, Monoton); never approved. Known
  issue: the fused double-T reads as the Greek letter π.
- ~~**"Graded Slab" visual direction**~~ — **DONE.** Implemented as the
  Slant Take design system across 9 sequential passes (colors/fonts, radii,
  badge restructure, chrome polish, rename, footer, loading indicator,
  consistency/hover pass) — all ✅ Complete, verified. "Graded Slab" was the
  internal working name during exploration only; the shipped system is the
  Slant Take design system. Full detail: `slant-take-design-system.md`.
- **AOTY tab label** — still unnamed; blocked on the AOTY feature itself being
  built (section A).
- **Portable IA ideas** parked from the "Dossier/Photocopier Mono" exploration
  direction: a tagline under the logo, a "last ingest date" timestamp element.
- **Grid-vs-vintage-chart structural layout toggle** — explicitly parked as a
  later-stage exploration, unrevisited since.
- ~~**App still ships as "Metal Reviews", not "Slant Take"**~~ — **DONE (2026-07-25,
  design-system pass 5).** Header wordmark, `<title>`, and the `Header.test.tsx`
  assertions now all say "Slant Take". `package.json` needed no change — its `name`
  field was already `"scraper"`, never "Metal Reviews" in the first place (a pass-5
  audit finding; the original note above was wrong to list it as a target).
  Ship-now decision superseded the formal naming gates (friend test, domain check,
  trademark search) rather than waiting on them — gates were **not** completed, just
  superseded by a live-feedback strategy. Full detail: `naming-decisions.md`,
  `slant-take-design-system.md` pass 5.
  **Still open, not part of pass 5:** favicon (still a stale teal bar-chart icon,
  matches nothing in the current design system), and the domain/GitHub-repo/Render
  service name (all still literally "metalreviews" — infra-level, out of reach of a
  code change; listed for awareness in pass 5's report, not actioned).
- ~~**Card footer / ingest-timestamp line never built**~~ — **DONE (2026-07-25,
  design-system pass 8).** `src/Footer.tsx` built and wired into both `App.tsx` and
  `FavoritesPage.tsx`. Full detail: `slant-take-design-system.md` pass 8, this
  entry's original text preserved below for context.
  <details>Mockup `03-graded-slab-void-accent_1.html` has a page footer (mono,
  uppercase, `text.muted`) carrying "Last ingest &lt;date&gt;" on the left and a
  source list on the right. The app had no footer element at all, so pass 3's
  typography audit had nothing to fix. This overlapped the parked "last ingest date
  timestamp element" idea listed above under Portable IA — same feature. Pass 8
  found no "last ingest run" timestamp is persisted anywhere (the old
  `/api/ingest/status` endpoint only ever exposed an in-memory running/idle flag,
  removed along with the refresh button when ingest moved to GitHub Actions cron —
  see `ingest-trigger-and-security.md`), so it used "Last updated" sourced from the
  newest `publishedAt` across loaded albums/reviews instead, and replaced the
  mockup's source-count text with `Reviews`/`Favorites` nav links per Dan's brief.</details>
- **Favourite-heart button doesn't match the mockup** — surfaced 2026-07-25.
  Mockup has a flush 34×34 square at `top:0 right:0` with `bg-page` and 2px
  left+bottom rules, i.e. the same flush-corner treatment as the source badge and
  score slab. The app has an inset translucent circle (`blackAlpha.400`, inset at
  `top={2} right={2}`; the radius is already 0 after pass 2, but nothing else
  matches). Not a badge, so it was out of pass 3's scope — flagged, not touched.
  Small, self-contained follow-up that would complete the corner treatment.

> Note: none of the above design/branding items have a corresponding file in
> `docs/decisions/` or elsewhere in the repo — they exist only as prior chat
> history, which is not accessible from this session. Content above is taken
> directly from the brief for this task; nothing here has been independently
> verified against a design doc because none exists yet.

## D. Research findings not yet folded into a decision doc

- **Competitive analysis (AOTY.org / RateYourMusic / Letterboxd)** — real
  findings never written to `docs/decisions/`, logged here as reference material
  for whenever AOTY (Phase 7) design work resumes:
  - AOTY.org's 2026 changelog added a disambiguation patch after confirmed user
    confusion between three overlapping save mechanisms (Spin List, Library,
    Lists).
  - RYM's list-ranking UX is weak enough that a third-party TierMaker template
    exists specifically for RYM users to build ranked lists outside the
    platform.
  - Letterboxd's Year in Review has a documented, widely-complained-about bug
    where it reads only from Diary-logged entries (not "marked watched" or
    rated entries), causing near-empty summaries for many users — directly
    relevant to this project's own AOTY date-bucketing fallback chain.
  - Overall conclusion: no competitor handles the ranking/list-building flow
    well — a genuine market gap, not a crowded space.
- **Lateral-thinking session output** (Flip It / Break the Rules / Dumb
  Questions applied to Favorites v2 and AOTY evaluation criteria) — **detail not
  recovered.** This exists only in prior chat history not accessible from this
  session, and no file in the repo captures its output. A session on this topic
  happened; re-run if the concrete findings are needed.
