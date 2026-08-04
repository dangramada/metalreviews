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
4. **Weight/level "alignment" confusion resolved without changing the plotted metric** — talked
   through with Dan: the radial position still reflects the picked *level* (1–5, a simple,
   always-comparable scale), but the desktop tooltip's weight is now shown as **% of that
   criterion's own max achievable weight** (`Math.round((weight / maxWeightForCriterion) * 100)`)
   instead of a bare fraction. Rejected plotting the raw weight directly: per-criterion max
   weights aren't comparable to each other (each criterion's LP is solved independently — same
   root cause as the normalization/tie findings in `album-rating-drawer.md`), so a
   criterion with a naturally low max weight would always look small on the chart even at its
   best pick, reading as a bug rather than real signal.

**Also found and fixed while implementing #3**: `PolarRadiusAxis`'s default "nice number" tick
algorithm did not produce one ring per level for `domain={[0, 5]}` — confirmed live by dumping
each grid ring's SVG path: only 4 rings rendered, at values 0/2/4/5, with no ring at 1 or 3. This
is what surfaced as "the 3rd level isn't displayed." Fixed with an explicit
`ticks={[1, 2, 3, 4, 5]}` on `PolarRadiusAxis`, confirmed live afterward: exactly 5 evenly-spaced
rings (20/40/60/80/100px radius steps) on both chart sizes.

All four changes verified live via the same `/radar-spike` temporary-route pattern used for the
original build (added, checked, removed each time — never left in the router). `tsc --noEmit`
and `npx vitest run` (217/217) clean throughout.

## Concurrent-session collision, discovered and undone (same session)

After the polish pass above (commit `5e6f8af`), a Claude Code hook warned "another chat's dev
server is running in this folder." `git log`/`git reflog` then showed 4 commits on `master` on
top of `5e6f8af` that this session did not make:

```
9a7a458 fix: restore per-criterion spoke strokes, make radar chart fluid
f16bfba fix: radar chart hover cursor line followed raw mouse position
58af68a fix: radar chart outerRadius defaults to 80%, leaving grid undersized
9ddcc6a fix: plot radar chart by weight, not level
```

A separate, concurrent Claude Code session — same repo, same `master` branch, same git identity
(`Dan Gramada` + `Co-Authored-By: Claude Sonnet 5` trailers, same commit-message conventions) —
had been committing directly to `master` in parallel. All 4 were legitimate, well-reasoned fixes,
not garbage: 3 were independent real bugs (Recharts' `outerRadius` defaulting to 80% and
undersizing the grid; the hover cursor guide-line rendering unclamped past the chart's `overflow:
visible` SVG; `stroke="none"` from this session's own "Filled Grid" pass silently killing the
spoke lines too, since `PolarGrid`'s `stroke` prop controls both concentric rings and radial
spokes together). The 4th, `9ddcc6a`, directly reversed the level-vs-weight plotting decision
made earlier in this doc's Follow-up polish pass §4 — with its own real justification (a level-1
pick is fixed at weight 0 by construction, `solver.ts:83`, so plotting by level made a
zero-contribution pick look like it occupied real chart area instead of sitting at center).

**Decision (confirmed with Dan)**: undo all 4, back to `5e6f8af`, discarding the 3 legitimate
fixes along with the plot-by-weight reversal, rather than cherry-picking just the 3 unrelated
fixes and reverting only `9ddcc6a`. Done safely: tagged the pre-undo state first
(`pre-undo-radar-weight-plotting` → `9a7a458`, so the 3 discarded bug fixes are recoverable via
`git log pre-undo-radar-weight-plotting` / cherry-pick if wanted later), then `git reset --hard
5e6f8af`. `tsc --noEmit` and `npx vitest run` (217/217) confirmed clean at the reset point.

**Process finding, not yet fully resolved**: this collision was only possible because both
sessions were committing straight to `master` instead of isolating work on a branch — including
this session's own polish pass (`5e6f8af`), which should have been a branch per the project's own
stated convention (every prior feature in `CLAUDE.md`'s Active branches section gets its own
branch, `--no-ff` merged when done) rather than a direct commit, even though it felt like a small
same-session follow-up at the time. Two open items from this: (1) going forward in this session,
further changes go on a fresh branch, merged only when done; (2) the `album-rating-page` branch
ref itself now stops at the merge commit and doesn't include the polish pass or this undo, so it
no longer accurately represents "this feature's retained history" per convention — fast-forwarding
it to match `master`'s current tip is proposed but not yet done, pending confirmation.

## Desktop layout redesign — 3-column layout replaced with 3-section card (2026-08-05)

Branch: `album-rating-page-desktop-redesign`. Reworked `DesktopRatingLayout` against a new
reference screenshot; mobile untouched. Step 0 diagnostic (mandatory per the brief) surfaced
four real discrepancies from the brief's assumptions, built around rather than silently
corrected:

1. **RadioCard was already the real `RadioCardRoot`/`RadioCardItem`** (`components/ui/radio-card.tsx`)
   — no replacement needed. But its visual defaults were wrong for this page: the indicator
   rendered **square**, because Slant Take deliberately zeroes `radii.full` app-wide (see
   `theme.ts`'s own comment anticipating this exact case — "reinstate a dedicated token if a
   future component needs one"), and it sat **bottom-left** instead of end-of-row, because
   `CriterionLevelPicker.tsx` passed `orientation="vertical"` to `RadioCardRoot`, putting
   Chakra's `radio-card` recipe into a column `flexDirection` with default `align="start"`.
   Fixed with two independent, narrowly-scoped changes: a new `radii.circle: '9999px'` token
   (not reinstating `radii.full`, which the card-artwork heart-favorite toggle relies on
   staying zeroed) applied only via `indicator={<RadioCardItemIndicator borderRadius="circle" />}`
   on this one usage; and `orientation="horizontal" justify="space-between" align="center"` on
   `RadioCardRoot` so the label/description sit left, the indicator sits right, vertically
   centered.
2. **`sand.600` does not match the review card's actual wrapper token.** The review card's own
   wrapper (`cardStyle` in `App.tsx`) uses `surface.card`, which resolves to `ink.900` (`#131313`)
   — much darker than `sand.600` (`#4d4d4c`). Went with `sand.600` anyway, since the brief's
   hex table states these are exact matches (not approximations) and the reference screenshot
   clearly shows a lighter gray card. This is a deliberate divergence from review-card styling,
   not an oversight — documented here per the brief's own flagged ambiguity.
3. **Release date + genre badges were inline JSX in `App.tsx`**, not a reusable component.
   Extracted into `components/album-rating/AlbumMeta.tsx` (reused by both the review card and
   this page now) — pure refactor, no visual change at the original call site.
4. **A generic Chakra-generated Breadcrumb primitive already existed** at
   `components/ui/breadcrumb.tsx` (`BreadcrumbRoot`/`BreadcrumbLink`/`BreadcrumbCurrentLink`,
   same auto-generated-snippet pattern as `radio-card.tsx`/`dialog.tsx`) but was wired into zero
   pages and wasn't the `{label, to?}[]` API the brief described. Added `PageBreadcrumb` in the
   same file, wrapping those primitives with that array API — this project's intended shape for
   every page needing back-navigation going forward. Wired up on `AlbumRatingPage` only this
   session (see `deferred-work.md` for the retrofit-elsewhere follow-up). Note: a sibling file
   named `Breadcrumb.tsx` was attempted first and rejected by the Write tool as a duplicate —
   macOS's default case-insensitive filesystem treats it as the same path as the existing
   lowercase `breadcrumb.tsx`. Extending the existing file was the correct fix, not a workaround.

**New structure**: one `Box bg="surface.ratingCard"` (semantic alias for `sand.600`, following
the existing `border.rule`/`border.ruleStrong`-style alias pattern rather than scattering raw
`sand.*` references through the component) wrapping 3 sections in a single `Flex` row — artwork
(fixed 300×300) + `AlbumMeta` on the left; a horizontal split (criteria rows | active picker)
inside one bordered container in the middle; `RatingSlab`×2 (Rank/Score) + the relocated radar
chart on the right. The page title (`[Band] – [Album]`) stays where it already was, above this
card and shared with the mobile layout — not moved inside the card — since the brief itself
flagged "above/within the card" as an open question and moving it risked touching mobile's
shared header markup, which is out of scope this session.

**Inline status badges** (`NOT EVALUATED` / `{level} – {LABEL}` per criterion row) are an
intentional reversal of this doc's earlier "Column 2 shows no rating values inline" decision —
the new reference design calls for them directly.

**Rank/Score**: new `RatingSlab` component (`components/album-rating/RatingSlab.tsx`) wraps the
existing `scoreSlabBase`/`scoreSlabHigh` style configs from `theme.ts` rather than reusing
`App.tsx`'s `ScoreSlab` component directly — that component isn't exported and hardcodes a bare
number + dimmed `/10`, whereas this needed a small label plus an arbitrary value string. Rank is
always `scoreSlabHigh` (ember-filled), Score is always `scoreSlabBase` (light) — fixed
assignment, not the review card's `score >= 8.0` threshold logic. Value is `—` until
`useAlbumRatingsSummary` has an entry for the album (i.e. all 6 criteria rated); no new scoring
logic added, same hook/`scoreAndRank.ts` reused as-is.

**Selection vs. rating, verified live**: `selectedCriterionId` now defaults to
`FIXED_CRITERION_ORDER[0]` instead of `null`, so Section 2 never opens on an empty placeholder.
Confirmed live on a zero-ratings album (Draconian – In Somnolent Ruin) that this is purely
display state: the first criterion shows as active with all 5 of its radio options unselected,
and Rank/Score both showed `—`. Also verified a partially-rated state (2 of 6 criteria rated on
the same album, via live picks) shows the correct mix of `NOT EVALUATED` and real-value badges
per row with Rank/Score still `—`, and a fully-rated album (Urzah – A Tranquil Void) showed real
`#4` rank / `79%` score slabs and a fully-plotted radar chart.

**Removed**: the desktop "View Your Evaluation" button and its `DesktopRatingLayout`-side wiring.
The confirmation dialog (`RatingSummaryView` in a `DialogRoot`) itself is untouched and still
used by `MobileRatingLayout`, which keeps its own "View Your Evaluation" button — mobile is
unchanged.

**Verified**: `tsc --noEmit` clean, `npx vitest run` 217/217, live-verified against real
Supabase data as described above at a 1600px desktop viewport (at the Browser pane's narrower
default ~1037px width the criteria-row text wrapped uncomfortably — the fixed 300px artwork +
~220px Rank/Score columns leave too little room for Section 2 below roughly 1300px; acceptable
for now since real desktop monitors are comfortably wider, but worth keeping in mind as a
lower-bound constraint if a narrower "desktop" breakpoint is ever targeted).
