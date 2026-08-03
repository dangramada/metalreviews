# Concept Draft — Artifact
Feature: Album Rating Page (replaces AlbumRatingDrawer / earlier modal concept)
Designer: Dan
Date: 30 July 2026
Mode: Concept
Status: Complete
─────────────────────────────────────────────

## Summary

Superseded an earlier same-session modal concept for `AlbumRatingDrawer`'s
replacement. After testing an interactive mockup, the modal was rejected: level
descriptions were hidden behind numbers, there was no live summary while rating,
and a modal felt too cramped for a decision that deserves real space. This concept
replaces it with a **dedicated page**, using the app's standard `Header`/`Footer`
layout, with genuinely different structures for desktop and mobile rather than one
layout scaled down — driven by a lateral-thinking "break the rules" pass and two
rounds of interactive mockup testing.

This page is reachable from two places (Favorites today, the future Ranked
Albums/AOTY hub later) — navigation back must respect which one the user came from.

## Key outputs

### Route & navigation

- New route: `/rate/:albumId?from=favorites|aoty` (exact path TBD in implementation,
  but the `from` query param carrying the entry source is load-bearing — the page's
  "back" affordance reads it to return to the correct place, not a hardcoded default).
- Standard `Header` + `Footer` on both desktop and mobile — this is a full page in
  the app's normal layout, not an overlay.
- Page title area matches `FavoritesPage`'s existing title treatment (same tokens),
  plus a "← Back to Favorites" / "← Back to AOTY" link/button driven by `from`.
- Band/album name (`"[Band] – [Album]"`, `fonts.heading`) displayed near the artwork
  on both layouts, unchanged in content from the earlier concept.

### Desktop layout (viewport ≥ `md` breakpoint, fluid up to large screens)

Three columns, all visible simultaneously — no screen transitions on desktop, only
content updates:

```
┌───────────────┬─────────────────────┬───────────────────────────┐
│ Column 1      │ Column 2            │ Column 3                  │
│ Artwork       │ Criteria list       │ Levels for selected        │
│ (fixed size)  │ (names only, no     │ criterion, OR a placeholder│
│               │  values shown       │ ("Select a criterion to    │
│ RadarChart    │  inline)            │  begin") before any click  │
│ (Chakra       │                     │                            │
│  Charts,      │ Click → updates     │ RadioCard.Root/Item (Chakra│
│  filled)      │ Column 3's content, │ native) — 5 levels, real   │
│               │ no navigation/route │ per-criterion labels +     │
│ Hover on a    │ change              │ descriptions               │
│ radar axis →  │                     │                            │
│ tooltip shows │                     │                            │
│ criterion name│                     │                            │
│ + chosen level│                     │                            │
│ + real PAPRIKA│                     │                            │
│ weight value  │                     │                            │
└───────────────┴─────────────────────┴───────────────────────────┘
```

- Column widths are fluid (flex/grid proportions, not fixed pixel widths) between
  the `md` breakpoint and large desktop viewports.
- Column 2 intentionally shows **no rating values inline** — just the 6 criterion
  names as a clean list. The radar chart (Column 1) is where values become visible,
  and only on hover (see below) — this was a deliberate choice to keep Column 2
  scannable and let the chart carry the "what have I rated" information instead of
  duplicating it as text next to each name.

### Mobile layout (viewport < `md` breakpoint)

Two sequential screens, not three simultaneous columns — a genuinely different
structure, not the desktop layout compressed:

**Fixed header, present on both screens:**
- Small artwork
- `[Band] – [Album]`
- Small `RadarChart` (~40px, same filled style as desktop, scaled down — chosen to
  keep it as ambient feedback rather than a detailed readout at that size)
- Back-to-source link ("← Favorites"/"← AOTY") — **shown only on the overview
  screen**, not the detail screen (see below for why)

**Screen 1 — Overview:**
- All 6 criteria as rows: checkmark icon if rated + level name if rated, plain
  circle icon if not
- Tap any row → Screen 2 (detail) for that criterion

**Screen 2 — Detail:**
- Back arrow at the top returns to Screen 1 (Overview) — **not** to Favorites/AOTY
  directly. The two levels of "back" are deliberately separate: this arrow always
  means "back within the rating flow," while the source link on Overview means
  "leave the rating flow entirely." Conflating them into one button was considered
  and rejected — it would be ambiguous whether a "back" tap means "previous screen"
  or "leave the page."
- Single criterion, full name shown as header
- `RadioCard.Root`/`Item` (Chakra native), vertical, full label + description per
  level — same content as desktop's Column 3, just full-width instead of one column
  among three
- Selecting a level immediately saves (same upsert-per-pick behavior as today) and
  **auto-returns to Overview** after a short delay, with the just-rated row visibly
  highlighted (border + background) for a few seconds before settling to its normal
  completed-row appearance

### Radar chart (both layouts)

- Built with `@chakra-ui/charts`' `RadarChart` component (filled series, not just
  outline) — **new dependency**, brings in Recharts transitively. Chosen over a
  custom SVG build because it integrates with the existing token system and ships
  grid/axis/tooltip primitives rather than requiring all of that to be hand-built.
- Reflects real per-criterion values as ratings are picked — not just "rated vs.
  not," but the actual chosen level, scaled appropriately per axis.
- On desktop, hovering an axis/point shows a tooltip with: criterion name, chosen
  level label, and **the real PAPRIKA weight value** for that pick (not just its
  1–5 position) — this was an explicit correction mid-session; the tooltip must
  surface actual model weights, not merely the ordinal level number.
- On mobile, shown small and fixed in the header on both screens — no interactive
  hover (touch has no hover state), so it functions purely as ambient/glanceable
  feedback there; tapping it is not a specified interaction in this concept.

### Navigation & completion behavior (carried over from earlier session work,
unchanged by this pivot from modal → page)

- Free navigation at all times — any criterion reachable from any other, any order.
- No criterion required to advance or view any other.
- Fixed criterion order: Emotional impact/atmosphere → Instrumental+Vocal
  performance → Production & sound design → Songwriting → Musical
  innovation/Originality → Coherence↔Versatility.
- Progressive save unchanged (upsert per pick, existing `on_conflict` behavior).
- A save/completion action (e.g. "Save Album Evaluation" or equivalent) still
  triggers the existing confirmation view once all 6 criteria are rated — exact
  placement of that trigger on this new page layout is an open question (see
  below), since the earlier modal concept's single dedicated footer button doesn't
  map directly onto either the 3-column or 2-screen structure.

## Existing components/patterns used

- `Header`/`Footer` — same instances used by `FavoritesPage`/`App.tsx`
- Page title treatment — same tokens as `FavoritesPage`'s `"My Favorites"` heading
- `RadioCard.Root`/`Item` (Chakra native) — carried over from the earlier modal
  concept, unchanged in its own internal structure
- `LuCheck` (`react-icons/lu`) — completed-criterion indicator, already used
  elsewhere in the app (via the Chakra v3 migration's icon mapping)
- `accent.border`/`accent.ink`/`accent.text` (ember palette) — active/selected/
  highlighted states
- `primaryButton`/`secondaryButton` style sets

## New elements / patterns flagged

- **Dedicated route** (`/rate/:albumId`) with a `from`-source-aware back
  navigation — new routing pattern, not used elsewhere in the app (Favorites and
  Reviews are not deep-linked to a "return to caller" model today).
- **`@chakra-ui/charts` (Recharts)** — new dependency, first use of any charting
  library in this project.
- **Three-column simultaneous desktop layout** — new layout pattern.
- **Two-screen sequential mobile flow with auto-return + temporary highlight** —
  new interaction pattern (distinct from the wizard/step-indicator pattern explored
  and then abandoned in the earlier modal concept this session superseded).
- **Genuinely different structures per breakpoint** (not one layout scaled) — a
  deliberate architectural choice, flagged because it means two implementations to
  maintain in parallel rather than one responsive layout; discussed and accepted
  as correct given how differently attention works in each context (sequential
  focus on mobile vs. simultaneous overview on desktop).

## Open questions

- Exact placement/trigger of the final "save/confirm" action once all 6 criteria
  are rated, on both the 3-column desktop layout and the 2-screen mobile flow —
  not resolved this session.
- Exact wording/copy for the Column 3 / pre-selection placeholder on desktop.
- Whether the radar chart's mobile version (in the fixed header) needs any
  interaction at all, or is purely decorative feedback — leaning decorative, not
  fully settled.
- Exact spacing/breakpoint values, column width ratios, and the specific `md`
  Chakra breakpoint's fluid range behavior — deferred to implementation/Figma-level
  detail.
- Icon/visual choice for the desktop Column 1 loading/empty states, and for the
  mobile completed-vs-incomplete row indicators, beyond the `LuCheck` decision
  already made.

## Assumptions made

- Assumed this page fully replaces the earlier-session modal concept
  (`album-rating-modal--concept-draft.md`) rather than the two coexisting — the
  modal concept is superseded, not parallel.
- Assumed the `from` query param is sufficient to route "back" correctly; no
  requirement surfaced this session for preserving deeper navigation state (e.g.
  scroll position on the hub) beyond which page to return to.
- Assumed Recharts/`@chakra-ui/charts`' theming can be made to respect the
  existing `ember`/`ink`/`sand` token ramps without a fight — not verified against
  the actual library's API surface this session; worth a quick spike before
  committing to a full brief, given this project's history of "compiles clean,
  wrong at runtime" token-integration surprises (see `design-tokens.md`,
  `slant-take-design-system.md`).

## Next recommended step

Before writing a Claude Code brief, recommend a short spike (not a full
implementation pass) to confirm `@chakra-ui/charts`' `RadarChart` actually renders
against this project's token system as expected — given the project's own history
of token-integration issues that only surface at runtime, not at compile time.
Once that's confirmed, this concept is ready to translate into an implementation
brief; the open questions above (save-action placement especially) should be
resolved either in that brief's planning step or via a quick follow-up
conversation first.
─────────────────────────────────────────────
Skill: concept-draft
