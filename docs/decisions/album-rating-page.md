# Album Rating Page — dedicated route replacing the drawer and the rejected modal

Branch: `album-rating-page`, branched fresh from `master` (not from `album-rating-modal`,
which is rejected and left untouched per the brief). Third UI attempt at this feature: the
original `AlbumRatingDrawer` (flat 6×5 list in a narrow drawer, `album-rating-drawer.md`) was
functionally complete but a poor experience; a wizard-style `AlbumRatingModal` was built and
then rejected (level descriptions hidden behind numbers, no persistent summary, cramped
footprint — see `docs/decisions/album-rating-page--concept-draft.md`'s Summary). This session
replaces both with a dedicated page at `/rate/:albumId`, with genuinely different desktop and
mobile layouts rather than one responsive layout scaled between them. Gate, progressive save,
and score/rank computation are unchanged — this is a pure UI/interaction replacement on top of
already-correct data behavior.

## Corrections made to the brief during planning (confirmed with Dan before building)

- **Band/album typography**: the brief said `fonts.heading`; the actual established
  convention (`StyleGuide.tsx`'s "Band/album card typography" specimen) is `fontFamily="body"`
  — Clash Display (the heading face) is reserved for the wordmark and score-slab number only.
  Followed the documented convention, not the brief's literal wording.
- **Criterion order**: verified against real catalog ids in `supabase/criteria.sql` rather than
  assumed. `0=Innovation, 1=Emotional impact, 2=Performance, 3=Coherence, 4=Production,
  5=Songwriting`. The brief's fixed order maps to id sequence `[1, 2, 4, 5, 0, 3]` — see
  `src/lib/album-rating/criterionOrder.ts`. One naming note: id 3's real DB name is just
  `"Coherence"`, not "Coherence↔Versatility" as the brief's concept-draft phrased it; that was
  concept-stage notation, not a real string — the page displays `entry.name` from the catalog.
- **`RadioCard`**: reused `src/components/ui/radio-card.tsx` exactly as `AlbumRatingDrawer`
  already used it (Chakra v3 native `RadioCard` wrapper) — no new snippet generated, no new
  styling. It behaved identically to its drawer usage; no shared-component surprises to report.
- **`@chakra-ui/charts`' `RadarChart`**: the brief assumed a turnkey `RadarChart` component.
  Checked the package's actual type declarations directly — it only exports `useChart`,
  `Chart.Root`, `Chart.Tooltip`, `Chart.Legend`, `Chart.Gradient`, `Chart.RadialText` (plus
  `bar-list`/`bar-segment`). The real pattern is composing Recharts' own
  `RadarChart`/`PolarGrid`/`PolarAngleAxis`/`PolarRadiusAxis`/`Radar` inside `Chart.Root`, using
  `chart.color(token)` to resolve semantic tokens to real CSS colors. Not a scope problem, just
  a naming correction — `src/components/album-rating/RatingRadarChart.tsx`.

## Radar chart spike — two real runtime gotchas found, both fixed

Per the brief's explicit ask, spiked the chart with placeholder data before wiring in real data,
given this project's documented history of "compiles clean, wrong at runtime" token-integration
bugs (`design-tokens.md`).

1. **Recharts' `RadarChart` has `responsive: false` and no default width/height** (confirmed by
   reading `recharts/lib/chart/PolarChart.js`'s `defaultPolarChartProps` directly). Without an
   explicit `<ResponsiveContainer width="100%" height="100%">` wrapper, it silently renders a
   0×0 SVG — no console error, just a blank box. This is not a token issue; it's a Recharts v3
   API requirement `@chakra-ui/charts`'s `Chart.Root` does not handle for you.
2. **`Chart.Tooltip`'s `render` prop receives the raw data point directly**, not a payload
   wrapper — confirmed by reading `@chakra-ui/charts`' own `chart.cjs` implementation
   (`if (render) return render(item.payload)`), not assumed from the `.d.ts` alone. `Chart.Tooltip`
   itself must be passed as Recharts' own `<Tooltip content={<Chart.Tooltip .../>} />`, not
   dropped in as a standalone chart child the way `<PolarGrid/>`/`<Radar/>` are.

Once both were fixed, the `ember`/`ink`/ `border.default` tokens resolved correctly at runtime —
confirmed visually (orange fill/stroke matching `accent.border`, muted-gray grid) via a
temporary spike route (`/radar-spike`, removed before merging), not just by reading the code.
No lasting theming fight — this cleared the brief's stated bar for "stop and report back if
theming fights the token system in ways that would take significant extra effort."

## Real bug found via live verification: weight tooltip showed "—" for every point

The desktop tooltip's weight lookup (`RatingRadarChart`'s `weightMap`, keyed by
`` `${criterionId}:${level}` ``) always missed, because `AlbumRatingPage.tsx` set `weights`
state directly from the raw Supabase rows (`{ criterion_id, level, value }`, snake_case) while
`RatingRadarChart`'s `CriterionLevelWeight` type expects camelCase (`criterionId`). No thrown
error — `weightMap.get()` just silently returned `undefined` for every real key, always
resolving to the `'—'` fallback. Caught only by hovering the chart against real Supabase data
(rated "Urzah – A Tranquil Void" fully, live) and seeing "weight: —" where a real number was
expected. Fixed by mapping the fetched rows to camelCase in `AlbumRatingPage.tsx` before storing
state. Re-verified against real weights afterward: "Performance / Rough / weight: 0.000" and
"Emotional impact / Engaging / weight: 0.250", both matching the real persisted
`user_criterion_weights` values exactly.

## Save/completion action placement

Brief left this open. Decision: a persistent `primaryButton`-styled "View Your Evaluation"
button — below the radar chart in Column 1 on desktop, appended to the end of the Overview
screen's list on mobile — appears once `ratings.size === 6`, opening the existing confirmation
view (`RatingSummaryView`, extracted verbatim from `AlbumRatingDrawer`'s confirmation state,
content untouched) inside a `DialogRoot` on both layouts.

## Live badge-update wiring — no new plumbing needed

`AlbumRatingDrawer`'s `onRatingChange` callback existed because the drawer was inline in
`FavoritesPage` and needed to explicitly trigger `useAlbumRatingsSummary`'s `refetch()`. Since
rating now happens on a separate route, navigating there unmounts `FavoritesPage` entirely, and
navigating back remounts it — `useAlbumRatingsSummary`'s own `useEffect` refetches on every
mount, so the rank badge updates correctly with zero additional wiring. Verified live: rated
"Urzah – A Tranquil Void" fully (score clamped to 100%, per the existing clamp — see
`album-rating-drawer.md`), navigated back to `/favorites`, and its badge showed `#5` — plus the
other four already-rated albums' relative order shifted too, consistent with the
already-documented Medium-tier score-tie / clamp caveats (`album-rating-drawer.md`,
`deferred-work.md`), not a new bug.

## `AlbumRatingDrawer.tsx` deletion

Confirmed via `git grep` on `master` that its only non-doc references were its own file and
`FavoritesPage.tsx`'s import/render block (both changed by this brief). Deleted outright, not
left as dead code.

## Files

New: `src/AlbumRatingPage.tsx`, `src/components/album-rating/DesktopRatingLayout.tsx`,
`src/components/album-rating/MobileRatingLayout.tsx`,
`src/components/album-rating/RatingRadarChart.tsx`,
`src/components/album-rating/RatingSummaryView.tsx`,
`src/components/album-rating/CriterionLevelPicker.tsx`,
`src/components/album-rating/AlbumArtwork.tsx`, `src/lib/album-rating/criterionOrder.ts`.
Modified: `src/FavoritesPage.tsx` (`handleRate` navigates to `` `/rate/${albumId}?from=favorites` ``
instead of opening the drawer; removed drawer state/import/render block), `src/main.tsx` (new
lazy-loaded `/rate/:albumId` route, auth-gated same as `/criteria-calibration`), `package.json`
(`@chakra-ui/charts`, `recharts`). Deleted: `src/components/album-rating/AlbumRatingDrawer.tsx`.

## Not touched

`useCalibrationGate.ts` and its gate dialog (still checked in `FavoritesPage.handleRate` before
navigating). `scoreAndRank.ts`, `useAlbumRatingsSummary.ts` — read from, not modified.
`RatingSummaryView`'s content (score/rank/breakdown) — extracted verbatim, not edited. Nothing
under `criteria-calibration/`. Nothing from the `album-rating-modal` branch — that branch was
never read or referenced during this build. `album_criteria_ratings` schema, upsert logic, and
`on_conflict` key — unchanged.

## Known cosmetic warning (not fixed, not ours to fix)

`@chakra-ui/charts`' own `ChartTooltip` implementation (`chart.cjs`) maps over the tooltip
payload without passing a React `key` (`payload.map((item, index) => {...}, index)` — the second
argument to `.map()`'s callback is `thisArg`, not a key), producing a harmless
"Each child in a list should have a unique key prop" console warning whenever the desktop
tooltip renders. This is a bug inside the vendored library, not this project's code; not worth
a workaround given it's cosmetic-only (no functional impact, confirmed by the tooltip rendering
correctly regardless).

## Manual verification

Live against the dev server + real Supabase data, logged in as Dan. Desktop (1280×800): 3-column
layout renders correctly; clicking a Column 2 criterion updates Column 3 with no route change;
placeholder shown before first selection; picked and persisted Production=4 (survived a full
page reload, confirmed via re-inspecting the pre-filled radio state); completed all 6 criteria on
"Urzah – A Tranquil Void", radar chart filled to a complete hexagon, "View Your Evaluation"
button appeared and opened the confirmation dialog showing Score 100% (clamped) / Rank #5 / all
6 picks; navigated back to Favorites and confirmed the `#5` rank badge appeared live with no
reload, and the other favorited albums' relative ranks shifted consistent with documented
Medium-tier tie-break behavior. Mobile (resized to 622×784, below the `md` breakpoint): Overview
screen showed all 6 criteria in fixed order, unrated with circle icons; tapping "Emotional
impact" opened the Detail screen with real level labels/descriptions; picking a level saved
immediately, auto-returned to Overview after ~1.75s with the row highlighted (checkmark, "3 —
Engaging" inline), then the highlight faded to normal after a few seconds. Radar chart tooltip
verified against real weight values (not spike placeholder data) after fixing the camelCase bug
above. `tsc --noEmit` and `npx vitest run` both clean (217/217) before and after the fix.

**Note on test data**: live verification wrote real picks to `album_criteria_ratings` for
"Urzah – A Tranquil Void" (all 6 criteria) on Dan's real account, which now shows a `#5` rank
badge on `/favorites`. Left in place — no delete tooling available in this session, and it's
real rating data on a real favorited album, not garbage data (Dan can re-rate or leave as-is).

## Deferred (added to `deferred-work.md`)

The `from=aoty` back-destination falls back to `/favorites` with a `TODO` comment in
`src/AlbumRatingPage.tsx`'s `resolveBackDestination()`, since the Ranked Albums/AOTY hub route
doesn't exist yet (already tracked under `deferred-work.md`'s AOTY entry — cross-referenced,
not duplicated).

## Follow-up polish pass (same session, post-merge)

Four small tweaks to `RatingRadarChart.tsx`, requested after reviewing the merged chart live:

1. **Axis labels removed** — `PolarAngleAxis`'s `tick` prop set to `false`. Angular positioning
   (required for the categorical `criterion` dataKey to lay points around the circle) is
   unaffected; only the criterion-name text is hidden.
2. **Tooltip kept as-is**, functionally — confirmed still fires correctly after the label
   removal.
3. **"Filled Grid" style**, exact snippet supplied: `<PolarGrid stroke="none" style={{ fill:
   chart.color('ember.solid'), fillOpacity: 0.1 }} />`. Confirmed `ember.solid` is a real,
   already-defined semantic token (`src/theme.ts`'s `colorPalette.ember` registration), not
   guessed. Using `style` instead of the `fill`/`fillOpacity` props is deliberate, not
   equivalent: Recharts' `PolarGrid` internally hardcodes `fill="none"` as a prop on every
   individual concentric ring (confirmed by reading `ConcentricGridPath` in
   `recharts/lib/polar/PolarGrid.js` — only a single outer-boundary polygon gets the real
   `fill` prop by default). Inline `style.fill` overrides that per-ring `fill="none"` **prop**
   via normal CSS cascade rules (inline style beats presentation attributes), so every ring
   ends up filled — producing the nested, cumulatively-shaded band look, not a flat single
   fill. Confirmed live, not assumed.
4. **Weight/level "alignment" confusion — first pass, later reversed (see next section)**: talked
   through with Dan; initial fix kept the radial position on the picked *level* (1–5, a simple,
   always-comparable scale) and showed the tooltip's weight as **% of that criterion's own max
   achievable weight** instead of a bare fraction. Rejected plotting the raw weight directly at
   the time: per-criterion max weights aren't comparable to each other (each criterion's LP is
   solved independently — same root cause as the normalization/tie findings in
   `album-rating-drawer.md`), so a criterion with a naturally low max weight would always look
   small on the chart even at its best pick, reading as a bug rather than real signal.

**Also found and fixed while implementing #3**: `PolarRadiusAxis`'s default "nice number" tick
algorithm did not produce one ring per level for `domain={[0, 5]}` — confirmed live by dumping
each grid ring's SVG path: only 4 rings rendered, at values 0/2/4/5, with no ring at 1 or 3. This
is what surfaced as "the 3rd level isn't displayed." Fixed with an explicit
`ticks={[1, 2, 3, 4, 5]}` on `PolarRadiusAxis`, confirmed live afterward: exactly 5 evenly-spaced
rings (20/40/60/80/100px radius steps) on both chart sizes.

All four changes verified live via the same `/radar-spike` temporary-route pattern used for the
original build (added, checked, removed each time — never left in the router). `tsc --noEmit`
and `npx vitest run` (217/217) clean throughout.

## Second follow-up: switched the radial position from level to weight (reverses #4 above)

Live testing surfaced a concrete bug in the level-based approach: a level-1 pick for "Emotional
impact" showed "0% of criterion max" in the tooltip yet still plotted a full ring out from
center (level 1 sits at 1/5 of the radius). Investigated whether this was a per-user LP quirk or
structural — confirmed structural, not coincidental: `solver.ts:83` explicitly fixes level 1 at
weight 0 for **every** criterion, for **every** user (`// fixed at 0, contributes nothing to the
sum`). So a level-1 pick will always show 0% weight while visibly occupying real chart area,
making a contributes-nothing pick look like it's contributing something.

Decision (confirmed with Dan): switch `RatingRadarChart`'s plotted value from `level` to the
real `weight`, reversing the "keep level, clarify tooltip" call from the prior pass now that a
concrete case showed the mismatch isn't just a scale difference but an actual visual lie for
level-1 picks.

- `RadarPoint.weight` replaces `RadarPoint.level` as the `Radar`'s `dataKey`. A weight-0 pick
  (any criterion's level 1) now sits exactly at the center, full stop — verified live with a
  level-1/weight-0 "Emotional impact" pick.
- Domain is no longer the fixed `[0, 5]` — it's `[0, domainMax]` where `domainMax` is this
  user's single highest weight value across all 30 (criterion, level) combinations (falls back
  to `1` only to avoid a degenerate zero-width domain before weights load). Mirrors the earlier
  ticks fix's own principle (outer boundary = the actual max value): `ticks` are 5 evenly-spaced
  values ending exactly at `domainMax`.
- Tooltip keeps the same criterion name / level label / "% of criterion max" content as the
  prior pass — that context is still useful precisely because raw weight isn't comparable
  across criteria, even though it's now also the plotted value.
- **Cost paid**: `weights` was previously optional and desktop-tooltip-only (mobile's small
  ambient chart never received it, since position depended only on level). Since position now
  depends on weight everywhere, `weights` is threaded into `MobileRatingLayout` too — new
  required prop, passed through from `AlbumRatingPage`'s already-fetched `weights` state (no new
  fetch, just wiring).
- **Known tradeoff, unchanged from the original 3-way framing**: different criteria have
  different max weights (again, independent per-criterion LP solves), so a maxed-out pick on a
  naturally low-weight criterion won't reach the outer edge the way a maxed-out pick on a
  high-weight criterion does. Real signal (that criterion structurally swings this user's score
  less), not a bug — flagged going in, not discovered after the fact.
- One cosmetic Recharts quirk noted, not fixed: hovering the exact center pixel (radius 0)
  returns no tooltip, since angle is mathematically undefined at the origin. Hovering even
  slightly off-center (still visually "at" the point) resolves correctly. Not realistically
  hit by a real hover gesture; not worth working around.

Verified live via the same disposable `/radar-spike` pattern: an "Emotional impact" pick at
level 1 (weight 0, confirmed via a synthetic fixture with `criterionId:1, level:1, value:0`)
renders with its vertex exactly at the chart center on both desktop and mobile sizes, and the
tooltip (hovering just off dead-center) correctly shows "Emotional impact / Flat / 0% of
criterion max." `tsc --noEmit` and `npx vitest run` (217/217) clean.

## Third follow-up: chart read as too small, hover cursor line overshot the grid

Dan flagged a screenshot showing the axis's hover cursor line extending well past the top of the
grid, with the overall chart reading as smaller/more cramped than its container. Root cause:
Recharts' `RadarChart` (a `PolarChart`) defaults `outerRadius` to `'80%'`
(`recharts/lib/chart/PolarChart.js`), so the grid and data polygon only ever fill 80% of the
plotting area, leaving a 20% ring of dead space between the grid boundary and the SVG's true
edge — but the per-axis hover cursor line is drawn out to that true 100% edge regardless, so it
visibly overshot the grid. This also explains the "smaller" perception: 20% of the box's radius
was always empty margin.

Fix: `outerRadius="100%"` on `RechartsRadarChart` (a `PolarChart`-level prop, not something set
on `PolarGrid`/`PolarAngleAxis` individually). Confirmed live by dumping the outermost grid
ring's SVG path against the six per-axis line elements' endpoints — both now terminate at
identical coordinates (radius 125px on the 260px box), so the grid, data, and cursor line all
share the same 100% boundary. `tsc --noEmit` and `npx vitest run` (217/217) clean.

## Fourth follow-up: a second, distinct overshoot — hover cursor followed the raw mouse position

After the `outerRadius` fix above, Dan flagged another screenshot: hovering a data point still
showed a long stray line running from the hovered vertex off toward the bottom-right, well past
the chart's box — a different line from the one the `outerRadius` fix addressed (that one was a
fixed per-axis spoke; this one visibly changed direction depending on where the mouse was).

Root cause: Recharts' `<Tooltip>` component defaults its `cursor` prop to `true`, which draws a
guide line from the chart's center toward the actual mouse position — unclamped to the chart's
radius (confirmed via `recharts/types/component/Tooltip.d.ts`: `cursor?: CursorDefinition`,
default `true`, "if set false, no cursor will be drawn"). Combined with `Chart.Root`'s own
`baseCss` (`chart.cjs`) setting `overflow: visible` on `& svg`, that line rendered fully outside
the chart's box instead of being clipped at its edge.

Fix: `cursor={false}` on the `<Tooltip>` element. The hovered point's own `activeDot` marker
(Radar's built-in behavior, already visible in earlier screenshots as the white-ringed dot)
already shows what's selected, so no separate cursor guide line is needed. Confirmed live via a
real synthetic hover: the tooltip still renders correctly ("Performance / Masterful / 100% of
criterion max"), and the only `<line>` elements present afterward are the six fixed structural
per-axis spokes (center to each vertex, all terminating within the 260px box) plus their tiny
tick-line stubs — no line tracking the mouse position. `tsc --noEmit` and `npx vitest run`
(217/217) clean.
