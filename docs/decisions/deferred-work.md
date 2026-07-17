# Deferred / postponed work — consolidated tracker

This file is the single place to check for real, previously-decided future work that
has not yet been built or resolved. It does not replace the historical detail in
individual decision docs — those remain the source of truth for *why* a decision was
made; this file exists so nothing gets lost across dozens of session-scoped "what this
session did NOT do" notes.

**Convention:** when a session identifies new deferred or postponed work, add it here
rather than only stating it inline in that session's own doc (see `CLAUDE.md`).

---

## A. Product features (named, not built)

- **AOTY ranking session (Phase 7)** — the actual public-launch differentiator.
  Design discovery was paused mid-question in a design-discovery chat; not yet
  resumed. Route already reserved (`/aoty/:shareId`, see `auth-routing.md`).
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
- **GitHub Actions cron for scheduled ingest** — agreed direction over Render's
  paid cron option. Caveat: GitHub disables scheduled workflows after 60 days of
  repo inactivity. `node-cron` wiring in `scripts/ingest-cli.ts` is real,
  functional code but currently dead in production pending this — no process
  ever runs it. `ingest-trigger-and-security.md`.
- **Google/Facebook OAuth** — credentials not yet configured. Placeholder comment
  in `LoginPage.tsx` marks where the `supabase.auth.signInWithOAuth()` buttons go.
  `auth-routing.md`.
- **Resend SMTP config in Supabase** — a ~10-minute pre-launch config task (no
  code changes), needed before public launch because Supabase's default email
  sending has a low free-tier cap. **Status unknown** — no mention of this
  anywhere in `docs/decisions/` or `CLAUDE.md` to confirm it was ever done.
  Treat as not-yet-done until confirmed otherwise.
- **Shareable AOTY page** (`/aoty/:shareId`) — route reserved (renamed from
  `/list/:shareId`), nothing built. `auth-routing.md`.

## B. Known code/data gaps (accepted, not fixed)

- **Multi-artist-credit genre gap** (Sunn O))) & Boris — *Altar* case) — genre
  lookup only uses `artist-credit[0]`, the first-billed artist, on split
  releases. Deferred, not fixed. `genre-data.md` (cross-reference only).
- **`favorites.review_id` column — resolved, not open.** The original migration
  brief called for this to stay deferred pending Dan's go-ahead
  (`album-identity-migration.md`), but a later session confirmed via direct live
  query that the column is already gone (`favorites` rows are `{ user_id,
  created_at, album_id }` only — `album-identity-ingest.md`), and
  `album-identity-frontend-homepage.md` explicitly logs the drop as "confirmed
  run." Listed here only so the now-superseded "not run yet" language in
  `album-identity-migration.md` isn't mistaken for current status.
- **`manual_albums` legacy table** — fully dead in every live code path (client,
  server, ingest); absorbed into `albums`. A drop script
  (`supabase/manual_albums-drop.sql`) has been written but not run — explicitly
  called out as "a separate decision, not made" in the session that confirmed it
  dead. `manual-albums.md`, `album-identity-visibility-and-duplicate-fix.md`.
- **`scripts/seed-from-json.ts`** — pre-Supabase-migration relic, already broken
  by the album-identity schema migration (imports a `toDbRow()` shape `reviews`
  no longer has). Kept only so the import itself doesn't fail; not wired into
  real ingest, not fixed. `album-identity-ingest.md`, `architecture.md`.
- **Security audit Finding #9** — `--no-sandbox` not passed to
  `puppeteer.launch()`. Explicitly still open. `render-deployment.md`.
- **Puppeteer `dependencies` fix (commit `a63fa62`) — verification status
  unchanged, still open.** `render-deployment.md` states as of 2026-07-01: "Not
  yet verified against a real Render deploy." No later doc or commit found
  confirming this verification happened since. Treat as still unverified.
- **Dropdown `<option>` white-background cosmetic gap** — logged in
  `chakra-v3-migration-plan.md`. Small, unfixed.
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
    mid-90s *Episode*, not a new release) and AMG's "The Willowtip Files" (confirmed
    retrospective — reviews a 2004 album as part of a "label's 2001–2006" feature). PS's
    "Lost in Time" (10+ instances since Mar 2025) is the same pattern, confirmed across
    three separate instances (Metallica's 1991 *Black Album*, Anathallo's 2006 *Floating
    World*, Watchtower's 1985 *Energetic Disassembly*) — always an old-album
    retrospective, never new-release coverage.
  - **Genuine franchise-prefix pollution on a real, current review** — the one confirmed
    case is AMG's "AMG's Unsigned Band Rodeö" (~110+ instances since Dec 2024): checked
    directly, it reviews a real new release (Blindfolded's *What Seeps through Threads*,
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

## C. Design/branding (open)

- **Logo** — T-ligature concept explored across five typefaces (Bebas Neue,
  Archivo Black, Playfair Display, Space Mono, Monoton); never approved. Known
  issue: the fused double-T reads as the Greek letter π.
- **"Graded Slab" visual direction** — Dan's strong preference, based on
  portfolio affinity. Explored in amber and other accent variants. Never
  formally approved.
- **AOTY tab label** — still unnamed; blocked on the AOTY feature itself being
  built (section A).
- **Portable IA ideas** parked from the "Dossier/Photocopier Mono" exploration
  direction: a tagline under the logo, a "last ingest date" timestamp element.
- **Grid-vs-vintage-chart structural layout toggle** — explicitly parked as a
  later-stage exploration, unrevisited since.

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
