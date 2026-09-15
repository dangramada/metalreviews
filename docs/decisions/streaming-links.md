# Streaming links (Listen chip)

## 2026-09-15 — Listen chip with generated search-links, shipped

**Decision:** Added a "Listen" trigger to the home-page album card (top-right overlay, next
to the Favorite heart), opening a menu of generated search-result links to four platforms in
priority order: Bandcamp, Spotify, YouTube Music, Deezer. Links are built client-side from
`band`+`album`, already on the `albums` table — no API calls, no schema changes.

**Why generated search-links, not exact-match:**

- MusicBrainz `url-rels` coverage tested at near-zero on a 50-album sample — see
  `scripts/musicbrainz-streaming-coverage-2026-09-14.ts` and its output data.
- Spotify's Web API now requires the developer's own Premium subscription and caps dev-mode
  apps at 5 users.
- Bandcamp has no public search/discovery API to resolve a match against.
- Competitor analysis (RateYourMusic, Metal Archives) showed the "exact link" outcome
  elsewhere comes from community crowdsourcing, not automation — not viable for a
  solo-operated project. Full discovery artifacts (`streaming-links--concept-draft.md`,
  `streaming-links--competitor-analysis.md`) live in Project Knowledge only, per
  `documentation-governance.md`'s two-layer rule — not duplicated here.

**Explicitly out of scope / parked:**

- No album detail page — doesn't exist, wasn't built here.
- No "remember preferred platform" personalization — raised in discovery, parked for a
  possible future pass.
- No manual/admin-curated link entry — would need review-administration tooling that doesn't
  exist yet; deferred.

**New standing pattern:** overlay icon buttons on the card (Favorite heart, Listen chip) sit
on a fixed opaque scrim (`blackAlpha.800` resting, `blackAlpha.900` on hover or while an
attached menu is open) so they stay legible regardless of what's under them on the artwork.
Apply this to any future overlay icon button added to the card, not just these two.

**New dependency:** `simple-icons`, scoped to the four platform-logo menu items only — a
deliberate, narrow exception to the Lucide-only icon convention for new pages (Lucide has no
brand/logo icons).

**Implementation notes**, for whoever next touches this code:

- The Listen trigger is a Chakra `Menu` (Ark UI), not a `Popover` wrapping a separate list —
  Menu is already non-modal/dismissible on its own, so nesting a Popover around it would just
  create two overlapping open-state managers.
- The trigger's own `onClick` must never call `preventDefault()` — Ark's Menu trigger checks
  `event.defaultPrevented` before opening, so doing so silently blocks the menu from ever
  opening.
- Single-review cards wrap the whole card in an `<a>`. Two separate click-through problems had
  to be fixed so the Listen chip and its menu don't fall through to that anchor's navigation:
  `stopPropagation()` alone does **not** stop a native `<a>` from following its href — only
  `preventDefault()` does, called anywhere in the same click's dispatch — so that's done on
  the anchor's own `onClick` (gated on a `data-listen-trigger` marker) rather than on the
  trigger itself. Separately, clicking outside an open menu to dismiss it fires a
  `pointerdown`-driven close *before* the resulting `click` bubbles to that same anchor, so a
  second marker (`data-menu-just-closed`, set from the Menu's `onOpenChange`) swallows that one
  click too.
- Chakra's alpha color scales (`blackAlpha`/`whiteAlpha`) only define steps
  `50/100/200/.../900/950` — an invalid step like `.750` silently resolves to no color at all
  rather than erroring, which is how the overlay scrim first shipped invisible.

**Git history:** originally built on `feature/album-card-listen-links`, branched off
`spike/musicbrainz-streaming-links` per an earlier session decision. That spike branch carried
its own throwaway diagnostic commits (`DevMusicBrainzStreamingCoverage.tsx`, an unauthenticated
`/dev-musicbrainz-streaming-coverage` route wired directly into the production router, and a
coverage-data dump under `public/`) — none of that was reviewed for production, so rather than
merging the feature branch as-is, only its 6 Listen-chip-specific commits were cherry-picked
onto `master` (clean, no conflicts — the spike commits never touched `App.tsx`). Rollback tag
`pre-merge-album-card-listen-links` marks the pre-merge point (`d25641f`). Four further
refinement commits (contrast tuning, menu-item hover, active-state persistence, outside-click
fix) landed as direct commits to `master` afterward, following several rounds of live design
review rather than a single upfront spec. `spike/musicbrainz-streaming-links` itself is
untouched and still awaits its own separate review/merge decision.
