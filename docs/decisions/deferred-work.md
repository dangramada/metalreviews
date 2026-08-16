# Deferred / postponed work — consolidated tracker

This file is the single place to check for real, previously-decided future work that
has not yet been built or resolved. It does not replace the historical detail in
individual decision docs — those remain the source of truth for _why_ a decision was
made; this file exists so nothing gets lost across dozens of session-scoped "what this
session did NOT do" notes.

**Convention:** when a session identifies new deferred or postponed work, add it here
rather than only stating it inline in that session's own doc (see `CLAUDE.md`).

**`finished-work.md` (added 2026-08-16)** holds items that used to live here and are now
confirmed fully closed — moved there verbatim, not rewritten, so "check here first" above
means "here, then there if you're looking for something that used to be open." A handful
of items below carry a struck-through `DONE` sub-clause but were kept here rather than
split, because they also contain a real, still-open follow-up in the same entry (e.g.
"Automatic degree escalation", "LP solver hardening") — splitting those would have meant
rewriting them, which this reorg pass deliberately avoided.

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
  scheduled. `album-identity/album-identity-decisions.md` §5 Layer 2.
- **Album data staleness / admin data-quality view** — surfaced 2026-07-17.
  **Could not locate a source doc for this.** Searched `docs/decisions/` and
  `CLAUDE.md`'s index for any "log-tags-decision-and-staleness-question" file or
  equivalent staleness/data-quality content and found nothing. Flagging as a named
  item with no confirmed home doc — if one exists outside `docs/decisions/`, it
  should be cross-referenced here instead of this note.
- **Live MusicBrainz autocomplete on `AddAlbumDrawer`** — debounced search-as-you-
  type, Layer 1 of the manual-add duplicate-prevention design. Named follow-up in
  `album-identity/album-identity-decisions.md` §5 / `album-identity/album-identity-frontend-favorites.md`.
- **Import tool** — text-paste MVP first. Richer follow-ups: Last.fm
  (`user.getTopAlbums`, time-scoped) and ListenBrainz (MBID-native). Spotify and
  YouTube Music ruled out (Spotify: extended-quota API access structurally
  unavailable to an individual developer; YouTube Music: no official API).
- **Bulk MusicBrainz ID backfill pass** — current backfill is opportunistic-only;
  already-enriched albums that never got an MB match can stay `mb_release_group_id
= null` indefinitely under the current design. `album-identity/album-identity-ingest.md`.
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
- **Font-size token audit — hardcoded values across the codebase, some non-standard.** Surfaced
  2026-08-07: `FavoriteListItemRow`'s band/album typography is inline styles, not `theme.ts`
  tokens. Dan's explicit note: real, separate concern (many hardcoded font-size values app-wide),
  not to be fixed ad-hoc inside a component brief. Scope: audit all hardcoded font-size values
  codebase-wide, decide whether/how to consolidate into tokens. Not started.

## B. Known code/data gaps (accepted, not fixed)

- **`useCalibrationResume.ts`'s mount-time degree inference and
  `preferenceGraph.ts`'s `inferDegreeFromAnswers` are two independent
  implementations of the same formula — drift risk, not fixed, 2026-08-16.**
  Fixing the cross-degree Undo/Redo stale-`degree` bug (see
  `criteria-calibration-second-session-reset.md`'s 2026-08-15 diagnosis) added
  `inferDegreeFromAnswers` (`preferenceGraph.ts`) so `CriteriaCalibrationPage.tsx`'s
  `handleUndo`/`handleRedo` could re-derive `degree` from the post-mutation answer
  log the same way `useCalibrationResume.ts` already does on mount. Deliberately
  left `useCalibrationResume.ts`'s own inline `reduce` untouched per the brief (not
  a rewrite of resume's mount-time inference) — today the two are byte-for-byte
  the same formula (`Math.max` over each answer's `profileA` key count, floored at
  `STARTING_DEGREE`), so there's no live bug. The actual risk: nothing guards
  against them diverging if either is edited later (e.g. a future change to how
  degree is derived, applied to one call site and not the other, would silently
  reintroduce a stale-`degree` class of bug on either resume or undo/redo). Worth
  a follow-up pass to have `useCalibrationResume.ts` call the shared helper too,
  once that file isn't mid-fight with something else.
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
  among levels 2-5. Full trace output and reasoning: `docs/decisions/criteria-calibration/criteria-calibration-coverage-weighted-candidates.md`.

  **2026-08-15 addendum — re-verified against Dan's second, independent 71-answer
  session, read-only, no production files touched
  (`scripts/diagnose-second-session-flatness-2026-08-15.ts`, live
  `user_calibration_answers` replay through the real `solveValues`).** Four things
  checked, per the standing brief:
  1. **`MAX_AMBIGUOUS_GAP` status: confirmed dead code, not a live gate.** Only
     two references in the whole tree: a comment in `elicitationDriver.ts:398`
     ("replaces the old gap-based `MAX_AMBIGUOUS_GAP` check") and a `describe()`
     label in `elicitationDriver.test.ts:451`. The constant itself no longer
     exists in source. `nextAction` consults `isDegreeCoverageComplete` /
     `MAX_VALUE_RANGE_FOR_COVERAGE` (fixed at `0.2`, not criteria-count-scaled)
     instead — fully superseded by the 2026-08-09 coverage-based escalation
     design checkpoint. This makes the original confound (a) as literally framed
     (does `MAX_AMBIGUOUS_GAP` need to scale with criteria count?) moot: there is
     nothing left to recalibrate. A parallel question could be asked of
     `MAX_VALUE_RANGE_FOR_COVERAGE` instead, but that is a different mechanism,
     not a resolution of the old confound, and — same as before — two sessions at
     a fixed 6-criteria count can't separate a criteria-count effect from
     anything else regardless of which threshold is in question. Not resolvable
     with current data; not forced.

  2. **The flat-plateau shape did NOT reproduce as originally described, but a
     related degree-2-confinement pattern did, and it resolved once the session
     escalated past degree 2.** Checkpoints every ~10 real answers plus the
     three degree-transition boundaries (degree 2 ends at n=28, degree 3 spans
     n=29-49, degree 4 spans n=50-71, degree distribution 28/21/22):
     - **While still confined to degree 2 (n=28, the last purely-degree-2
       checkpoint):** several criteria show a flat/zero pair among _low_ levels
       instead of high levels — e.g. criterion 0: `[0, 0, 0.0832, 0.1249,
0.1667]` (flat 1-2, then differentiated 3-5); criterion 2: `[0, 0, 0,
0.0830, 0.1666]` (flat 1-3, then differentiated). This is the same
       qualitative phenomenon as the original finding — adjacent levels
       collapsing to indistinguishable point estimates — but the _specific_
       levels affected differ (1-2/1-3 here vs. 2-5 in the original), which the
       original session-level diagnosis couldn't have shown since it only ever
       reached degree 2.
     - **Once degree escalated to 3 then 4 (n=29 through the final n=71), the
       flatness dissolved.** Final state, all six criteria, no adjacent-level
       gap under 0.02: criterion 0 `[0, 0.0242, 0.0713, 0.1189, 0.1667]`;
       criterion 1 `[0, 0.0233, 0.0714, 0.1184, 0.1668]`; criterion 2 `[0,
0.0235, 0.0472, 0.0709, 0.1666]`; criterion 3 `[0, 0.0239, 0.0949,
0.1422, 0.1667]`; criterion 4 `[0, 0.0242, 0.0481, 0.0953, 0.1667]`;
       criterion 5 `[0, 0.0475, 0.0712, 0.0954, 0.1665]`. No criterion shows a
       near-flat run of two or more adjacent non-level-1 levels anywhere in this
       final state.
     - **Working hypothesis this raises, not yet confirmed:** the original
       33-answer trace was diagnosed _while the session was stuck at degree 2_
       (its own doc records `nextAction()` returning a degree-2 ask at the
       moment of the trace). The flatness may be substantially a
       degree-2-confinement symptom — a criterion only gets enough independent
       constraints to separate its middle levels once cross-criterion
       comparisons at degree 3+ start arriving — rather than a standalone,
       permanent defect in `solveValues`' point-estimate assignment. This does
       **not** rule out a real solver-side issue (the degree-2-only shape above
       is still a genuine flat/indistinguishable region that existed at that
       point in the session, and a session that stalls at degree 2 for longer
       than this one did would presumably keep it), but it means "the solver
       treats levels 2-5 as flat" is not the most precise statement of the
       mechanism. Worth factoring into the future solver-design brief rather
       than assuming the original framing still holds unmodified.

  3. **Criterion-5-style total zero-weight did NOT reproduce, at any checkpoint
     sampled (n=10, 20, 28, 29, 40, 49, 50, 60, 70, 71).** Max solved point
     across all 5 levels, per criterion, at the final state: criterion 0
     `0.1667`, criterion 1 `0.1668`, criterion 2 `0.1666`, criterion 3 `0.1667`,
     criterion 4 `0.1667`, criterion 5 `0.1665` — none near zero, and by n=10
     every criterion already had at least one non-level-1 level at ~0.166+ from
     cold-start extreme comparisons. No criterion in this session was ever
     starved of solved weight the way criterion 5 was in the first. Reported as
     a genuine non-reproduction, not assumed fixed — a single non-reproducing
     session doesn't rule out position- or content-dependent recurrence on a
     future session, especially since the original zero-weight criterion and
     this session's exact configuration weren't confirmed to be the identical
     criterion set/order.

  4. **Confound (a) is not resolvable with current data**, and for a different
     reason than expected going in: not because two 6-criteria sessions can't
     separate a criteria-count effect (true, but moot), but because the gate it
     was originally about no longer exists in production. See point 1.

  Script used (kept, read-only, not wired into any build step):
  `scripts/diagnose-second-session-flatness-2026-08-15.ts`.

  **2026-08-15 follow-up framing — two unseparated candidate explanations, and
  a priority downgrade.** The re-verification above found a _different_ flat
  region (levels 1-3, not 2-5) at the degree-2-confined checkpoint (n=28),
  which then resolved by n=71. Two candidate explanations, not distinguished
  by this data: (a) escaping degree-2 confinement specifically resolved it, or
  (b) total answer volume (33 vs. 71) resolved it regardless of degree — the
  two sessions differ on both dimensions simultaneously (more answers _and_
  more degree escalation), so this can't be separated yet. The differing
  flat-region location (1-3 vs. the original's 2-5) also weakens the idea that
  this is a stable, level-specific solver pathology — it's more consistent
  with generic sparse-data under-determination that can appear anywhere data
  is still thin, not a defect tied to particular levels.

  Downgrading this item's priority: given the final state at n=71 shows no
  gap under 0.02 anywhere, there's no current evidence of a permanent solver
  defect requiring a dedicated fix. No solver-design brief scoped for now.
  Revisit only if a future real session shows persistent flatness that
  doesn't resolve with continued real answers, ideally on a third independent
  account/session so degree-confinement and answer volume can finally be
  separated.

- **Criteria Calibration UI never displays the current `degree` anywhere —
  flagged 2026-08-11, not fixed.** Surfaced while diagnosing/fixing the
  degree-jump anomaly (`docs/decisions/criteria-calibration/criteria-calibration-degree-scoped-coverage-fix.md`):
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

- **Front-loaded value shapes converge markedly slower than back-loaded shapes under the
  current degree-2 candidate-weighting design — found 2026-08-16, not investigated further.**
  `criteria-calibration-synthetic-oracles.md`'s oracles #5/#6 share one weight vector, one RNG
  seed, and differ only in within-criterion level shape (front-loaded: big 1→2 jump, flat 2-5;
  back-loaded: the reverse). Back-loaded reached High tier at round 68 and recovered its
  ground truth to within 0.06 rmse; front-loaded never left degree 2 or reached High tier in
  90 real answers and stayed compressed well below its true scale throughout. Both recovered
  the _correct qualitative shape_ (this is not the flatness-fabrication bug — see that doc's
  oracle #5/#6 section), so this is specifically a _convergence-speed_ asymmetry, reproducible
  given the shared seed/weights. No mechanism identified beyond what's directly observable;
  worth a look if degree-2 candidate weighting (`coverage-weighted-candidates.md`) is revisited.

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
  `criteria-calibration-dantzig-fix.md`); item 3 **shipped 2026-08-16** and has been relocated
  to `finished-work.md`; items 4 and 5 remain open.
  1. ~~Implement pure Dantzig in `simplex.ts`~~ — **done 2026-08-12.** Both phases, plus the
     phase-1→phase-2 artificial cleanup switched to largest-magnitude selection.
  2. ~~Bland silently returning wrong weights~~ — **done 2026-08-12**, and it was worse than
     the 2/120 constraint-violating case originally flagged: confirmed read-only against the
     live DB that Dan's `user_criterion_weights` held **30 rows, all zero** (sum 0, not 1),
     because a failed Chebyshev-center solve was being swallowed into an all-zero point
     estimate and persisted. Closed by a post-solve feasibility guard in `solveLP` plus
     making the Chebyshev failure throw instead of degrading to zeros.
  3. **Still open — `MAX_ITERATIONS = 2000` is safe now and not forever.** Dantzig first
     exceeds it at n≈300 and routinely by n≈400–600. Confirmed on the real implementation at
     n=59: worst per-solve pivot count under 600, Chebyshev LP 409 — >3x headroom, pinned by
     a test. Revisit alongside any auto-escalation work that lengthens sessions.
     A Dantzig-primary/Bland-fallback design was considered and **rejected** — reasoning
     recorded in the decision doc so it isn't re-proposed. Full detail, tables and method:
     `criteria-calibration-dantzig-stress-test.md`.
  4. **NEW, open — the reported weights are one arbitrary pick among tied optima.**
     Surfaced (not caused) by the Harris pass. The Chebyshev LP's optimum is massively
     degenerate: every ratio-test rule tested attains the _identical_ optimal radius on all
     180 solvable regions, and `totalSlack` is invariant, so the fitted region genuinely does
     not move — but many points attain the maximum and the pivoting rule decides which one is
     reported and persisted. Consequences: (a) any solver change re-prices stored weights
     (measured on Dan's real log: max 0.0239, median 0.0065, and one level value collapsing to
     exactly 0); (b) any test pinning specific solved values pins a tie-break, not a model
     property. Fix would be a deterministic secondary objective — lexicographic tie-breaking,
     or maximising a strictly convex proxy. Not scoped. Related product question, also
     unscoped: whether a "your weights were recalibrated" message belongs on the results page.
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

  **Second real session, 2026-08-15 (corroborating, still not dispositive):** replayed
  the second validation session's 71-answer log (see
  `docs/decisions/criteria-calibration/criteria-calibration-second-session-reset.md`) through the unmodified
  signal, same fine-grained per-real-answer method as the first session's replay. Last
  real top-10 change at n=45; `fired` flips at n=57 (45+12, exactly R=12); span held
  through the end of the log (n=71) with zero re-flips — same pattern as the first
  session's n=35→70 hold. No false positive on this second independent trace. Two data
  points now instead of one, both single-user (Dan's own account) — real evidence, not
  yet enough to stop treating R=12 as provisional. Full numbers, plus the full
  accuracy/tier/fired trajectory:
  `docs/decisions/criteria-calibration/second-session-accuracy-trajectory-2026-08-15.csv`.

  **Superseded numbers, 2026-08-16 (post-Harris):** the n=35 / n=45 last-top-10-change figures
  above, and the 47 / 57 firing points derived from them, were measured pre-Harris-ratio-test.
  Re-replaying both sessions through the current solver gives **n=39 → fires 51** (first
  session) and **n=46 → fires 58** (second). The signal is unchanged; the solver's reported
  point moved, so the derived top-10 trajectory moved with it — item 5 below (arbitrary pick
  among tied optima) surfacing in a second place. R=12 still holds with zero false positives on
  both traces. Treat 39/46 as current. Full numbers:
  `docs/decisions/criteria-calibration/criteria-calibration-escalation-signal-candidates.md`.

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
  - **Update 2026-08-16 — "make it per-user" is not actually sufficient, and the two obvious
    replacements were tested and both failed.** Calibration is gated to run _before_ a user has
    rated anything, so a first-time user has no rated albums to build a per-user benchmark set
    from — the mechanism can't work for anyone but Dan, whatever the ratings source. Two
    solver-internal replacements needing no external data were evaluated against a 12-trace
    evidence set (both real sessions + 10 synthetic oracles, all re-run post-Harris):
    **coverage-width thresholds** have no single constant that fires at-or-after ranking-settle
    across the set at any R ∈ {3,6,9,12} — the quantity isn't comparable across users;
    **weight-vector stability** is worse and structurally unsound, its converged-tail jitter
    matching still-learning movement on 5 of 11 traces (item 5 again). Recommendation on the
    table: keep the incumbent, accept the degradation for non-Dan users, and if developing
    further pick the coverage-width family (immune to the tie-break degeneracy). A normalised
    coverage-width ratio and an accuracy-plateau signal are named but untested. Full analysis,
    per-R sweeps and committed trajectory CSVs:
    `criteria-calibration-escalation-signal-candidates.md`.
  - **Sub-note (2026-08-15, low priority — readability/defence-in-depth, NOT a live bug):**
    `useRankingTestSetRatings.ts`'s query filters only on `.in('album_id', RANKING_TEST_SET_IDS)`
    with no explicit `.eq('user_id', ...)`. Raised during the pre-reset audit of Dan's account
    as a possible cross-user pollution path for the top-10 stability signal; **checked and
    ruled out** — `album_criteria_ratings` has RLS enabled with
    `using (auth.uid() = user_id)` (`supabase/album_criteria_ratings.sql:35-41`), so the
    frontend query is already per-user at the DB layer, exactly as the parent entry states.
    What remains is only that the scoping is implicit: a reader of the hook can't see it
    without knowing the policy, and the sibling queries in `useAlbumRatingsSummary.ts` /
    `AlbumRatingPage.tsx` rely on the same implicit scoping. Worth an explicit filter (or at
    minimum a comment naming the RLS dependency) when the per-user rework above happens —
    that rework will move this query off a fixed id list anyway. **Separately and more
    importantly:** service-key scripts (`scripts/*.ts` via `scripts/supabaseClient.ts`)
    **bypass RLS entirely**, so any script touching this table must filter on `user_id`
    explicitly — `scripts/verify-pre-reset-step0.ts` and
    `scripts/reset-calibration-2026-08-15.ts` both do.
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
- **CORRECTNESS RISK TO AN ALREADY-SHIPPED SIGNAL** (not routine cleanup — flagged distinctly
  from this section's other accepted-not-fixed items; see `finished-work.md`'s "Weights/status
  upsert had an unfixed write-race" entry for the 2026-08-15 fix this risk was carved out of):
  **`last_eligible_top10`/
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
- **Undo across a degree boundary shows the wrong degree's content until a manual page
  refresh.** Live-observed 2026-08-15, second calibration session, Undo from degree 4 back
  to degree 3 around round 46. Root cause diagnosed (read-only, not fixed): `degree`
  (`CriteriaCalibrationPage.tsx`) is a plain `useState`, mutated in exactly two places — the
  resume effect and `handleEscalate` (line ~501) — both forward-only. `handleUndo` (line
  ~424) pops `answers`/`windowHistory` but never touches `degree`. `action` (the displayed
  question) DOES correctly recompute on every Undo — it's a `useMemo` on
  `[catalog, session, degree]` and `session` rebuilds fresh from `answers` — so this is not
  a memoization-staleness bug; it recomputes against the wrong (stale, never-decremented)
  `degree` value, so once every degree-4 answer is undone it still calls
  `nextAction(session, degree=4)` and gets a _fresh_ degree-4 result instead of reverting to
  degree 3. A page refresh fixes it because reload re-invokes `useCalibrationResume`, which
  re-derives `degree` from the now-shorter persisted log (`Math.max(...profile-key-counts,
STARTING_DEGREE)`) — the one reconciliation path that exists, and it only runs on mount.
  Explicitly distinct from the 2026-08-14 "degree came back at 2 instead of 3 after
  refresh" note in `criteria-calibration-auto-escalation-signal.md` — that one confirmed
  `useCalibrationResume`'s resume-time inference is _correct_; this is a live in-session gap
  with no resume involved. Answer-log data integrity checked and unaffected by this
  specific Undo: 0 duplicate profile-pairs, 0 out-of-order timestamps, 0 sub-50ms
  insert/delete-race candidates across the full 71-row log. **Not fixed this session** —
  needs a `handleUndo` path that re-derives `degree` from the truncated answer log the same
  way resume does, or an explicit call to the same inference helper.

## C. Design/branding (open)

- **Criteria Calibration header layout** — needs a dedicated reorganization pass.
  Surfaced 2026-07-28 while building the Criteria Calibration screen UI (Phase 7);
  current `ProgressHeader` layout (Progress ring + Accuracy status centered,
  "Stop here" right, empty flex spacer left) works but wasn't given a real design
  pass — out of scope for that UI-only brief. `docs/decisions/criteria-calibration/criteria-calibration-ui.md`.
  Related, distinct scope (do **not** merge the two): "Accuracy display conflates two
  different signals" below — that entry is about _what_ the header communicates, this one
  about _how it is laid out_.
- **Accuracy display conflates two different signals** — surfaced live 2026-08-15, during
  the second full calibration session (`dan.gramada@gmail.com` account reset,
  `criteria-calibration-second-session-reset.md`).
  Current display shows one number (locked to "Medium" per the known display bug already
  tracked separately) representing answer-consistency accuracy. Real session data from that
  day shows a punctuated pattern: sharp early growth (10% → 68% by round 7), a long plateau,
  then 100% reached at round 58 (degree 4) and held through round 72 with the stop message
  ("You've reached your highest calibration confidence") — degrees 5–6 never touched. This
  matches the already-documented finding that the additive model on this 6-criterion catalog
  is structurally determined by degree-2 data
  (`criteria-calibration-additive-model-degree-sufficiency.md`) — not a bug, but the current
  single-number display doesn't communicate _why_, so it reads as "did I miss something?"
  rather than "there was nothing left to learn."
  **Proposed direction** (not designed, not approved for build): split the single number
  into two distinct signals — (1) consistency/confidence (the current metric) and
  (2) coverage/remaining-uncertainty, using the min/max range data `solveValues` already
  computes per (criterion, level) but never surfaces today. Inspired by 1000minds' own
  Lower/Upper-bound-per-level display (reference text logged in that session's chat,
  available on request).
  **Explicitly a reversal candidate for the 2026-08-09 decision**
  (`criteria-calibration-medium-gate-redesign.md`) that deliberately collapsed progress-ring
  coverage and accuracy into one number, after they diverged misleadingly (coverage hit 100%
  from mere canonical-pair-touch while real accuracy still read "Low"). Flagged as **NOT**
  the same bug: that coverage metric was a weak proxy (pair-touched, boolean); the newly
  proposed signal would use the solver's own real uncertainty bounds, not a proxy. Still,
  treat this as a genuine reversal — it needs explicit acknowledgment if revisited, not a
  silent do-over.
  See docs/decisions/criteria-calibration/criteria-calibration-1000minds-comparative-research.md
  (2026-08-16) for a comparative study against 1000minds' calibration UX —
  relevant for the future Concept Draft on this item.
  Also flagged, same session: a **"calibration results page"** idea — showing criteria
  weights/levels visually (bar-style relative importance, per-level trade-off values),
  reusing the `RadarChart` (`@chakra-ui/charts`) pattern already adopted for
  `album-rating-page--concept-draft.md`. Same status: idea only, no design work done.
  **Status: not scheduled.** Needs a dedicated Concept Draft session before any code — do
  not implement from this note alone.
  **Sub-note (2026-08-15, mechanical replay, not new design work):** the "round 58"/"round
  72" figures above are the UI's `RoundCounter` label (`answers.length + 1` —
  `CriteriaCalibrationPage.tsx:273`), confirmed by a full replay of the session's real
  `user_calibration_answers` log: 71 real answers, `fired` at answer_count 57 (round 58),
  session's actual final `nextAction` call independently returns `degree-exhausted`/
  `coverage-complete` at n=71 (round 72) — both match this entry's live-observed numbers
  exactly. Same replay quantifies the post-saturation gap this entry already describes
  qualitatively ("held through round 72"): **14 real degree-4 answers were asked between
  firing (n=57) and actual exhaustion (n=71)**, all after accuracy had already reached
  0.9999+ — i.e., real user time spent past the point the model had anything left to
  learn, the concrete cost of not yet having this entry's proposed two-signal display.
  Not fixing here, just quantifying: full trajectory in
  `docs/decisions/criteria-calibration/second-session-accuracy-trajectory-2026-08-15.csv`; the fired/exhaustion
  mechanics themselves are also written up under the `REQUIRED_ANSWER_SPAN` entry above.
  Cross-reference: "Criteria Calibration header layout" above (related area, distinct
  scope — not to be merged).
- **Logo** — T-ligature concept explored across five typefaces (Bebas Neue,
  Archivo Black, Playfair Display, Space Mono, Monoton); never approved. Known
  issue: the fused double-T reads as the Greek letter π.
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
- **Favourite-heart button doesn't match the mockup** — surfaced 2026-07-25.
  Mockup has a flush 34×34 square at `top:0 right:0` with `bg-page` and 2px
  left+bottom rules, i.e. the same flush-corner treatment as the source badge and
  score slab. The app has an inset translucent circle (`blackAlpha.400`, inset at
  `top={2} right={2}`; the radius is already 0 after pass 2, but nothing else
  matches). Not a badge, so it was out of pass 3's scope — flagged, not touched.
  Small, self-contained follow-up that would complete the corner treatment.

> Note: apart from the two Criteria Calibration entries (which cite existing decision
> docs) and the items marked DONE, none of the above design/branding items have a
> corresponding file in
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
