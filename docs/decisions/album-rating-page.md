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

## Retouch pass — four fixes after live review (2026-08-05, same day)

Four corrections against the reference screenshot, diagnosed from source before any change per
the project's standing convention:

1. **Card fill was the wrong shade.** `surface.ratingCard` (`sand.600`) turned out to be shared
   between the card's own background *and* Section 2's border — confirmed by grep before
   touching anything. Rather than repoint the shared token (which would've also changed the
   border), added a new `surface.ratingCardFill` token (`sand.900`, exact match to `#1A1A1A`)
   used only for the card `Box`'s `bg`; `surface.ratingCard` keeps its original value and its
   original job (Section 2's border).
2. **Band/album title moved inside the card**, at the top, above the 3-section row — it
   previously lived in a shared `Box` above/outside the card in `AlbumRatingPage.tsx`, rendered
   unconditionally on both desktop and mobile even though `MobileRatingLayout` already shows its
   own separate compact title. Moving it into `DesktopRatingLayout` (desktop-only) also removed
   that pre-existing duplicate title on mobile as a side effect — `MobileRatingLayout.tsx`
   itself was not touched.
3. **RadioCard text — three related fixes, one shared helper.** Root cause of the centered text:
   last session's `align="center"` on `RadioCardRoot` (added for the indicator's vertical
   centering) also sets Chakra's `radio-card` recipe `itemControl.textAlign: 'center'` — the two
   are coupled in the built-in recipe and can't be split via the variant prop. Fixed by keeping
   `align="center"` (still needed for the indicator) and passing `label`/`description` as JSX
   (`<Text textAlign="left">…</Text>`) instead of plain strings — both props accept
   `React.ReactNode`, so this stayed scoped to `CriterionLevelPicker.tsx` without touching the
   shared `radio-card.tsx` wrapper. Separately, confirmed against `supabase/criteria.sql` that
   raw `criteria_levels` text is Title Case labels + lowercase, unpunctuated descriptions — and
   confirmed via grep that both fields render in four *other* places beyond this page
   (`CriterionRow.tsx`/`OptionCard.tsx` in Criteria Calibration, `RatingSummaryView.tsx`,
   `MobileRatingLayout.tsx`, and this page's own status badges in `DesktopRatingLayout.tsx`,
   which already had `textTransform="uppercase"` on the whole badge and needed no change).
   Rather than fixing only `CriterionLevelPicker.tsx` and leaving the other four on stale
   casing/punctuation (confirmed with Dan as the wrong call — same defect, not five separate
   ones), added `formatLevelDescription()` next to `buildCriteriaCatalog` in
   `criteriaCatalog.ts` (capitalize first letter, ensure a trailing `.`/`!`/`?`) and applied it
   everywhere a description renders (`CriterionLevelPicker.tsx`, `CriterionRow.tsx`); the label's
   uppercase treatment needed no shared helper since it's non-destructive CSS
   (`textTransform="uppercase"`) applied individually at all five sites. This pass therefore
   touches two files outside the original rating-page scope (`CriterionRow.tsx` — Criteria
   Calibration's comparison cards) for text-formatting consistency only; no logic changed there.
4. **Rank/Score slabs now sit flush**, no gap. `RatingSlab.tsx` had no `flex`/width of its own,
   so the two slabs in `DesktopRatingLayout`'s Section 3 just floated at their intrinsic content
   width with the parent `Flex`'s `gap={2}` (8px) showing the card background through the
   middle. Fixed with `gap={0}` on the parent and `flex="1 1 0"` added directly inside
   `RatingSlab.tsx` — hardcoded rather than passed as a prop, since this component only ever
   renders in this fixed adjacent pair.

**Verified**: `tsc --noEmit` clean, `npx vitest run` 217/217 (no test asserted on raw
label/description casing or punctuation, so the wider text-formatting footprint didn't break
anything). Live-verified at a 1600px desktop viewport: card fill visibly darker and distinct
from the review-card `ink.900` bg, title inside the card, RadioCard text left-aligned/uppercase
label/punctuated description, Rank/Score forming one continuous two-tone strip. Also
live-verified the other four text consumers directly: Criteria Calibration's comparison cards
(`/criteria-calibration`) show e.g. "BOLD" / "Risk-taking defines the album, not just a few
moments.", and the mobile confirmation dialog (`RatingSummaryView`) shows e.g.
"3 — SOME FRESH IDEAS" with the level-number prefix left untransformed and only the label
uppercased.

## Second retouch pass — four more fixes after live review (2026-08-05, same day)

All four diagnosed from source/live computed style before changing, per the standing
convention — two (badge contrast, left-alignment) required live `getComputedStyle` checks, not
just re-reading the code, since the previous pass's left-align fix had visibly not worked.

1. **Missing outer card border.** The card `Box` had no `border`/`borderColor` at all —
   confirmed by reading the file, not assumed. Added the review card's static treatment
   (`border="2px solid" borderColor="border.ruleStrong"`) but deliberately not its
   score-conditional hover (`cardHoverBorderColor` in `App.tsx`) — this page has no score to
   link a hover color to. Also skipped the Favorites-row precedent's plain `border.hover`
   fallback (`FavoritesPage.tsx`, documented at `slant-take-design-system.md` pass 9, confirmed
   as the intended reference for exactly this "no score" situation): unlike a review card or a
   Favorites row, this card isn't a link/button, so there's no interaction for a hover state to
   give feedback about. No hover treatment at all.
2. **Section 2 badge contrast — measured, not eyeballed.** Computed styles confirmed current
   pairings before touching anything: rated badges were already `accent.border`/`accent.ink`
   (same as `scoreSlabHigh`, ~6.8:1 contrast by sRGB calculation) — no change needed, contrary
   to the brief's assumption that both badge variants needed fixing. "NOT EVALUATED" was
   `sand.700`/`text.dim` (sand.300), computed at ~4.1:1 — fails WCAG AA's 4.5:1 for the 10px
   text, which matches how it read live. Fixed by keeping the same `sand.700` background and
   switching text to `text.primary` (sand.200), computed at ~6.9:1.
3. **Left-alignment still weren't showing — real root cause found via live computed style, not
   re-applied.** The previous pass's fix (wrapping `label`/`description` in
   `<Text textAlign="left">`) was confirmed present in the shipped code and its `text-align` WAS
   computing to `left` on the actual DOM node — but the visible centering came from a different,
   coupled property one level up: `align="center"` on `RadioCardRoot` (still needed for the
   indicator's vertical centering) also sets `ItemContent`'s own `alignItems: center` in
   Chakra's built-in recipe, not just `ItemControl`'s `textAlign`. `ItemContent` is a column
   flexbox wrapping the label+description block; with `alignItems: center`, that block shrinks
   to its content width and centers *as a flex item* within the row — at that point, `text-align:
   left` on text that already exactly fills its own box has no visible effect. Confirmed via
   `getBoundingClientRect()`: the label span's left edge exactly matched its container's left
   edge only after the real fix. Since `ItemControl` and `ItemContent` read the same CSS var
   from the same `align` prop, they can't be decoupled via variant props alone — added an
   optional `contentAlignItems` prop to the shared `radio-card.tsx` wrapper (forwarded to
   `RadioCard.ItemContent` only, default unset so the wrapper's only other potential future
   consumers are unaffected) and passed `contentAlignItems="flex-start"` from
   `CriterionLevelPicker.tsx`. The now-redundant `textAlign="left"` on the inner `Text`s was
   removed. Also found and removed in the same file: `justify="space-between"` on
   `RadioCardRoot` was silently invalid (the recipe's `justify` variant only defines
   start/end/center; confirmed live that `--radio-card-justify` computed as empty) — harmless
   only because `ItemContent`'s own `flex: 1` already pushes the indicator to the row's end
   regardless. Removed as dead/misleading rather than left in place.
4. **Em dash → en dash** between level number and label (`1 — FLAT` → `1 – FLAT`) in
   `CriterionLevelPicker.tsx`'s template string.

**Verified**: `tsc --noEmit` clean, `npx vitest run` 217/217. Live-verified via computed style
(not visual inspection alone) on a zero-rated album (Draconian – In Somnolent Ruin) at a 1600px
viewport: card `border-width: 2px`/`border-color: rgb(58, 58, 58)` on `rgb(26, 26, 26)` bg;
"NOT EVALUATED" badge `rgb(56, 56, 56)` bg / `rgb(202, 198, 187)` text; level-picker
`ItemContent` `align-items: flex-start` with the label span's `left` pixel value exactly equal
to its container's; level-text codepoint `U+2013` (en dash) confirmed via `codePointAt`.

Same-day follow-up fix (reported directly, not part of a formal pass): the multi-line
description case still centered after the above. Root cause: `contentAlignItems="flex-start"`
positions the label/description *block* at the row's left edge, but doesn't affect text-align
*within* a wrapped block — a shrink-to-fit box that wraps takes the available width rather than
its longest line's width, and inside that wider box the text still inherited `text-align:
center` from `ItemControl` (still needed for the indicator's centering). The previous pass had
removed `textAlign="left"` from the label/description `Text`s as apparently-redundant once
`contentAlignItems` was added — restored it, since it's only redundant for single-line text.
Also tweaked by hand in the same window: Section 2 badge font size 10px → 11px, and the
`{level}–{LABEL}` dash spacing tightened (no surrounding spaces).

## Third pass — spacing/padding sweep, title relocation, background layering (2026-08-05, same day)

Scoped explicitly to precede the (separate, not-yet-started) responsive-breakpoints session.

**Zero-padding sweep.** Removed the outer card `Box`'s `p={6}` and the 3-section `Flex`'s
`gap={6}` entirely — all 3 sections now sit flush against the card's 2px border and against
each other, with only the pre-existing 1px `surface.ratingCard` border (on Section 2's own box)
as the visual divider on both sides, per the brief's confirmation that no new dividers were
needed. Changed the 3-section `Flex`'s `align` from `flex-start` to `stretch` — not explicitly
requested, but necessary for the new per-section background fills (below) to cover each
section's full height rather than stopping at its shortest child. Two interpretive calls, not
covered by the brief's explicit bullet list, made narrowly rather than guessed broadly: (1) no
gap was added between the artwork and the text block below it — the brief's only stated
exception was "16px horizontal padding and 12px gap between its 3 rows," not a gap *before* row
1, so left at zero; (2) Section 3's existing `gap={4}` between the Rank/Score row and the radar
chart was left untouched — the sweep's bullets are all about section/card-boundary spacing, not
every internal component gap, and this one was never flagged as needing a value. Both are easy
to adjust if wrong on manual review.

**Title moved into Section 1.** Previously rendered as a full-width `Heading` at the top of the
card (added in the first retouch pass), now removed from there and rebuilt as row 1 of Section
1's stacked text block, directly under the artwork. Matched the review card's own band/album
typography exactly (`App.tsx` ~line 741: `Heading` 19px/700/uppercase for band, `Text` 18px/500
for album, tightly stacked with zero gap between them) rather than inventing new styles.
Inlined rather than reusing `AlbumMeta.tsx` for the release-date/genre rows too: `AlbumMeta`'s
own internal margins (`mb=1`/`mb=2`) would double up with this section's `gap="12px"`, and
extraction wasn't required this pass — a few duplicated lines were the lower-risk choice over
touching a component also used by the review card.

**Background layering — one correction, one addition.**
- `surface.criterionActive` repointed from `sand.950` to `sand.900` (now matches
  `ratingCardFill` exactly) — confirmed via grep it has exactly two consumers, both in this
  file, so repointing the token directly (not adding a new one) was safe.
- Each section now has its own `bg="surface.card"` (`ink.900`) fill, reusing the token already
  registered for review cards rather than adding a redundant new one at the same value.
  Layering, outermost to innermost: card frame `sand.900` → section fill `ink.900` (darkest) →
  active row/picker `sand.900` (back up to the frame's value) → row hover `sand.800`
  (untouched this pass).
- The outer 2px `border.ruleStrong` card border and the inner 1px `surface.ratingCard` (`sand.600`)
  Section 2 border are unchanged and confirmed distinct — the padding removal didn't collapse
  or remove either.

**Flagged, not changed**: the brief describes the Rank/Score slabs as already having "no border
between them," but `RatingSlab.tsx` spreads `scoreSlabBase`/`scoreSlabHigh` unmodified, and
`scoreSlabBase` includes a 2px `borderLeft` (`border.rule`) — meaning the Score slab (right
side) should show a thin vertical rule against Rank, not a seamless join. Nothing in this pass
touched `RatingSlab.tsx`, so this predates it either way; left as-is rather than guessing
whether to strip the border, pending a look at how it actually renders.

**Not verified live this pass** — Dan is testing manually. `tsc --noEmit` is clean;
`npx vitest run` not re-run since no test-covered logic changed (pure layout/token edits).

## Fourth pass — Section 2 bg/border/padding, title removed from level picker, RadioCard highlight (2026-08-05, same day)

Also not live-verified (`tsc` clean only) — Dan testing manually throughout this stretch.

- `surface.criterionRow` (new, `ink.800`) as the uniform resting fill for both criteria rows and
  the level picker; `surface.criterionHover` repointed `sand.800`→`ink.900`; `surface.criterionActive`
  deleted (its 2 consumers both confirmed via grep) — "active" briefly had no distinct
  background at all, only a text-color change (superseded by the fifth pass below).
- Section 2's border reduced to left/right only (top/bottom removed — the outer 2px card border
  already frames those since the third pass's zero-padding sweep).
- Active criteria row text → `ink.500` (superseded by the fifth pass below).
- `CriterionLevelPicker.tsx` gained a `showTitle` prop (default `true`) so its redundant-on-desktop
  criterion-name heading could be hidden there without breaking `MobileRatingLayout`'s Detail
  screen, which has no other place to show the name.
- Criteria row `py`: 12px → 16px.
- RadioCard checked-state highlight (item outline ring + indicator fill) → `sand.200`, via
  explicit `_checked` overrides rather than `colorPalette` — `sand` isn't registered as a full
  color palette in this theme (only `ember` is), so `colorPalette.solid` wouldn't have resolved.
- `RatingSlab.tsx`: `border="none"` added after spreading `scoreSlabBase`/`scoreSlabHigh`,
  stripping their inherited 2px border for this component's own usage only — the shared style
  objects in `theme.ts` are untouched, still used by the review card's own `ScoreSlab`.

## Fifth pass — active-state background restored, indicator default state (2026-08-05, same day)

Correction to the fourth pass's "active has no background" simplification, after live review.

- `surface.criterionRow` repointed again, `ink.800`→`sand.950` — now the *darker* resting fill.
- `surface.criterionActive` reintroduced at a new value (`ink.800`, not its original `sand.900`/
  `sand.950`) — shared by the active criteria row and the level picker panel next to it, so they
  read as one lighter highlighted block against the darker `sand.950` resting rows.
- Active row text: `ink.500` → `ember.500`.
- RadioCard indicator default (unchecked) state: explicit `borderColor="sand.600"`,
  `borderWidth="2px"` — previously unset, silently falling back to Chakra's built-in
  `border.emphasized`/1px. The checked-state `sand.200` override from the fourth pass is
  unchanged.

Not live-verified — Dan testing manually.

## Sixth pass — criteria/level-picker border continuity, flicker fix, hover/typography polish (2026-08-05, same day)

Also not live-verified — Dan testing manually throughout. All in `DesktopRatingLayout.tsx`,
`CriterionLevelPicker.tsx`, `RatingSlab.tsx`.

**Border continuity between the criteria list and level picker.** The level picker panel
carries no border of its own — a divider is instead drawn as `borderRight` on each *non-active*
criteria row, `sand.600`. This achieves the same vertical rule a border on the panel itself
would, but for free gets a gap exactly at the active row's height (which needs no divider there
— the active row and the panel beside it share the same `surface.criterionActive` fill and
should read as one continuous block), without needing to compute pixel offsets against a
dynamically-sized panel.

Two real bugs found via live review against this approach, both fixed:
- **Small-screen gap**: the criteria list's 6 rows are often shorter than the level picker's
  content (which can wrap to more lines), so the row-based border stopped partway down instead
  of reaching the section's true bottom edge. Fixed by giving the *last* row `flex="1"`, so it
  grows to fill any leftover column height — its own `border-right` then always reaches the
  bottom regardless of viewport size, no runtime measurement needed.
- **First/last-row border doubling**: when the active row is the first or last criterion, its
  `borderTop`/`borderBottom` sits directly against the outer 2px card border (Section 2 itself
  has no top/bottom border of its own, see the third pass), reading as a doubled line. Both are
  now suppressed via `isFirst`/`isLast` index checks — top only for the first row, bottom only
  for the last, left as separate, narrowly-scoped conditions rather than one broader rule.

**Selection flicker, root cause found live, not guessed.** Clicking a different criterion
visibly reflowed the rows below it. Cause: `borderTop`/`borderBottom`/`borderRight` were toggled
between `undefined` and `'1px solid'` depending on state — since rows have no fixed height,
adding/removing a border changes the row's own rendered box size (2px height swing for
top+bottom), shifting every row below it on each click. Fixed by always rendering all 3 sides at
`1px solid` and toggling only their *color* (`sand.600`/`transparent`) via
`borderTopColor`/`borderBottomColor`/`borderRightColor` — box size never changes now.

**Smaller fixes, same pass:**
- Criteria row: `gap` between name and status badge, 4px→8px; `cursor="pointer"` on hover for
  inactive rows only (clicking the already-active row is a no-op).
- Criteria row + status badge text: explicit `textAlign="left"` added to both — same defensive
  fix as the RadioCard centering bug from an earlier pass (likely cause: `as="button"`'s
  browser-default centered text-align cascading to children with no explicit override; not
  chased further since the fix is safe regardless of the exact source).
- RadioCard level items: `_hover={{ borderColor: 'sand.500' }}` with
  `transition="border-color 0.15s ease"`; `cursor="pointer"` by default, `"default"` when
  checked (via the existing `_checked` override).
- `RatingSlab.tsx`: label text `10px`→`14px` and `opacity: 0.7`→`1`; value text `23px`→`28px`;
  container `pt`/`pb` `8px`/`4px`→`16px`/`12px` — all overridden locally, not touching the
  shared `scoreSlabBase`/`scoreSlabHigh` objects the review card's own `ScoreSlab` still uses.

## 2026-08-05: Responsive layout for DesktopRatingLayout (3 tiers)

Separate session from the retouch passes above — a genuine responsive strategy for
`DesktopRatingLayout`, not another visual fix. The real mobile/desktop split stays at `md`
(768px, `AlbumRatingPage.tsx`'s existing raw `@media` show/hide — `MobileRatingLayout` untouched
throughout this session). What changed is entirely inside the `>=768px` component itself, which
previously rendered one fixed layout (Section 1 and Section 3 fixed-width, Section 2 absorbing
100% of the squeeze) at every width above that.

**Why the single-fluid-column approach was wrong.** Section 2 (criteria list + level picker) has
the most content and the most sensitivity to width — criterion names, level descriptions that
wrap across lines — so it should be the *last* section to give up space, not the *only* one
compressing. Confirmed via live testing before writing any layout code: at ~900-1000px the old
layout squeezed Section 2 uncomfortably while Section 1's fixed 300px artwork column and
Section 3's fixed 220px slabs sat untouched.

**Structure: one grid, not two render trees.** Rather than branching the component's JSX per
tier, `DesktopRatingLayout`'s outer `Box` became a CSS Grid with `gridTemplateAreas`/
`gridTemplateColumns` switched by a single internal `@media (min-width: 64em)` (1024px) — each
section keeps a stable `gridArea` (`art`/`crit`/`score`) and DOM position; only the grid's own
column/row definition changes. This is why Tier 2's row-1-then-row-2 reorder (Section 2 sits
between 1 and 3 in the DOM) didn't need a `order` hack or a duplicate branch — grid areas handle
the visual reorder for free.

Raw `@media (min-width: 64em)`, not Chakra's `lg` breakpoint token — this theme defines no
custom breakpoints, so Chakra's `lg` resolves to 992px, not the 1024px the brief calls for
specifically. Same reasoning as the existing 47.9375em/48em split one level up in
`AlbumRatingPage.tsx`: precision over convenience where an exact px boundary matters.

**Tier 1 (>=1024px) — chosen values, found by live testing at 1024/1150/1300/1600px:**
```
gridTemplateColumns: 300px minmax(420px, 1.6fr) minmax(220px, 0.9fr)
```
- Section 1: unchanged fixed `300px` — least to gain from flexing, and the 300x300 artwork
  requirement is explicit and repeated elsewhere in this project's history.
- Section 2: `minmax(420px, 1.6fr)`. 420px is the narrowest width at which the level picker's
  longest level descriptions still wrap to no more than 2 lines at the 1024px boundary itself
  (checked directly, not assumed); the `1.6fr` share means it gives up space to Section 3 more
  slowly as the viewport narrows, per the brief's priority ordering.
- Section 3: `minmax(220px, 0.9fr)`. 220px matches `RatingSlab`'s own pre-responsive fixed width
  — below that, "SCORE" plus a value like "100%" starts crowding the slab (checked live with a
  3-digit `100%`/2-digit `#12` value at the narrow 1024px end, not just the default `72%`/`#3`
  mock). The radar chart's own internal `ResponsiveContainer` (already required by Recharts, see
  the engine-integration entry above) absorbs the rest of the narrowing without any extra work
  here.

At no tested width (1024/1150/1300/1600) did Section 2's text overflow, the radar chart clip, or
either `RatingSlab`'s value wrap.

**Tier 2 (768-1023px) — 2-row reorg, verified live at 768/900/1023px:**
```
gridTemplateAreas: '"art score" "crit crit"'
gridTemplateColumns: 1fr 1fr
```
Row 1: Section 1 (artwork+meta) and Section 3 (Rank/Score+chart) side by side, evenly split —
both are comparatively compact and content-light, and pair naturally per the brief. Row 2:
Section 2 full width below, where it actually has room.

**Artwork sizing at Tier 2.** `AlbumArtwork.tsx`'s `size` prop gained an `"auto"` mode (`w:
'100%', h: 'auto', aspectRatio: '1'`) instead of a fixed px string — `DesktopRatingLayout` now
always passes `size="auto"`. At Tier 1 this renders identically to the old hardcoded `300px`
(the grid track itself is a fixed 300px there, so 100% width = 300px). At Tier 2, Section 1's
own column is fluid (shared 1fr track with Section 3), so a hardcoded 300px would either
overflow the shared row at the 768px end or leave Section 3 starved at the 1023px end — verified
live at both ends that neither happens with `auto` (measured via `getBoundingClientRect()` at
1023px: a 485.5px square, exactly half the 1023px card width minus its 2px border, matching
Section 3's own column width).

**What did not change:** `MobileRatingLayout` (confirmed via the still-intact 47.9375em/48em
gate in `AlbumRatingPage.tsx`, one level above this component); the border/badge/alignment/dash
fixes from the earlier retouch passes; `RatingSlab`'s inherited `borderLeft` (still open, still
out of scope, not touched here).

**Verification:** live-checked at 768, 900, 1023, 1024, 1150, 1300, and 1600px via a temporary
unauthenticated dev route (`/dev-rating-preview`, mock catalog + mock rating summary, removed
before this pass's commit — not part of the shipped diff) since `/rate/:albumId` is
auth-gated and no test credentials were available in this session. `tsc --noEmit` clean,
`npx vitest run` 217/217.

## 2026-08-05: Radar chart labels + true responsiveness, Tier 2 border adjustments

Follow-up to the 3-tier responsive layout above, on live review of the shipped result.

**Diagnostic (reported before any change was made).** `RatingRadarChart.tsx`'s `Chart.Root`
carried a hardcoded `boxSize={isSmall ? '40px' : '260px'}` — the "full" chart was always exactly
260px square, regardless of Section 3's actual width. The inner `ResponsiveContainer
width="100%" height="100%"` was genuinely responsive, but only to that fixed 260px box, so it
never grew — this is why the chart read as fixed-size and left-aligned inside Section 3's wider
column even after the layout around it became responsive. `PolarAngleAxis` already had
`dataKey={chart.key('criterion')}` wired to `entry?.name` (the same short label shown in Section
2's list, e.g. "Songwriting") but `tick={false}` explicitly suppressed rendering it — a past
pass ("Axis labels removed per feedback"). No `outerRadius` was set at all, so Recharts' own
default (`"80%"`, itself a percentage) meant the plotted shape would already have scaled
correctly once its container did — the fix was entirely about the container, not the radius
units. Confirmed this was a prop-level fix, not a structural recomposition, before proceeding.

**Sizing fix.** `Chart.Root`'s fixed `boxSize` (full mode only — the 40px mobile preview icon in
`MobileRatingLayout` is untouched) became `w="100%" aspectRatio="1"`, mirroring the same fluid
1:1 pattern already used for `AlbumArtwork`'s `size="auto"` mode. Verified via
`getBoundingClientRect()` at 1600px: exactly `449×449`, ratio `1` — uniform scaling confirmed,
not just visually plausible.

**Labels.** `PolarAngleAxis`'s `tick={false}` became `tick={isSmall ? false : { fontSize: 10,
fill: criterionTickColor }}` (`criterionTickColor = chart.color('text.muted')`, resolved once in
the component body so it and the radar's own stroke/fill read from the same token-resolution
path). No new data needed — `entry?.name` was already short. Hover-tooltip content/behavior
(criterion/level/weight on hover) is unchanged; the new labels are the always-visible
supplement, not a replacement.

**Label clipping, found and fixed via live measurement, not eyeballing.** The first attempt
(`outerRadius="62%"`, `margin={{ top: 24, right: 24, bottom: 24, left: 24 }}`) still clipped at
Tier 1's 1024px end: `getBoundingClientRect()` on `.recharts-polar-angle-axis-tick-value` showed
"Consistency" (rightmost point, `text-anchor="start"` so its text runs further right than the
plotted point itself) extending to `x=1006` against the outer card's own right edge at `x=1000`
— about 6px of real clipping past the card border, not just visually tight. `outerRadius="50%"`
with `margin={{ top: 24, right: 40, bottom: 24, left: 40 }}` was the first value with zero
overflow at 1024px (re-measured: "Consistency" right edge `x=988.97`, card edge `x=1000`,
~11px clear); re-verified at every other tested width up to 1600px with the same measurement
approach, all clear.

**Growth at Tier 2, per Dan's live-review note ("we have a ton of space").** Since the fix is
container-driven (not a fixed cap), the chart naturally uses Section 3's much wider Tier 2 half-row
share — confirmed visually at 768/900/1023px that it grows substantially larger than at Tier 1's
narrow end, not staying small.

**Tier 2 border adjustments**, same `64em` breakpoint already established for the grid itself:
- Section 1 (`art`): gained `borderRight: 1px solid sand.600`, Tier 2 only (`@media
  (max-width: 63.9375em)`) — separates it from Section 3 in Row 1. Section 3 needs no matching
  left border; one edge is enough to read as the divider.
- Section 2 (`crit`): its existing `borderLeft`/`borderRight` (`surface.ratingCard`, a token that
  resolves to the same `sand.600`) now apply only at Tier 1 (`@media (min-width: 64em)`) — at
  Tier 2 it's a standalone full-width row, not flanked between two neighbors, so left/right
  borders would be meaningless. A `borderTop: 1px solid sand.600` takes their place at Tier 2,
  separating Row 2 from Row 1.
- Both toggle together via one `css` object per section (default = Tier 2 styles, `@media
  (min-width: 64em)` override = Tier 1 styles) rather than two independent conditions — verified
  via computed-style inspection, not just visual read: at 1023px, Section 1's right border is a
  1px `rgb(77, 77, 76)` (`sand.600`, `#4d4d4c`) edge spanning exactly Row 1's height; Section 2
  has `borderTop` `sand.600` and `0px` left/right. At 1024px, only Section 2 carries left/right
  borders (both `1px`), and no element has a full-width top border — Tier 1 unchanged from
  before this pass.

**What did not change:** Tier 1's column widths, Tier 2's row structure, `MobileRatingLayout`,
and the radar chart's hover-tooltip content.

**Verification:** live-checked (screenshots plus `getBoundingClientRect()`/computed-style
measurements, not visual assumption alone) at 768, 900, 1023, 1024, 1150, 1300, and 1600px via
the same temporary unauthenticated dev route used for the previous pass (`/dev-rating-preview`,
removed before this pass's commit). `tsc --noEmit` clean, `npx vitest run` 217/217.

## 2026-08-06: Radar chart label abbreviation, replacing the size-aware-radius approach

Follow-up correction to the 2026-08-05 radar-chart entry above. Live review after that pass
shipped surfaced a real reintroduction of the label-clipping bug via manual edits to
`outerRadius`/`margin` (60% / uniform 20px, up from 50% / 40px-left-right — a deliberate visual
preference for a bigger, fuller-looking chart), and prompted a proper fix for the tradeoff this
recreated at Tier 1's narrow end.

**Approaches considered, in the order tried:**
1. **Widen Section 3's grid min-width** (tested: 220px → 250px → 260px). Rejected — doesn't
   work structurally. `outerRadius` is a *percentage* of the container, so a wider column grows
   the plotted radius right along with it; the label's fixed pixel overhang past that radius
   barely shrinks. Pushing further (260px) actively overconstrained the Tier 1 grid
   (300+420+260 = 980px needed vs. 976px available at 1024px), making the whole chart spill past
   the card edge — worse than the 220px baseline. Confirmed via `getBoundingClientRect()`
   measurements at each step, not assumed.
2. **Size-aware radius/margin via `ResizeObserver`** — proposed as the "correct" fix (shrink the
   plotted shape only when the chart's own measured box is actually too narrow, full 60%/20px
   look everywhere else). Rejected by design preference before implementation: any radius
   reduction, even a conditional one, visibly shrinks the chart at the narrow end — not
   acceptable regardless of how precisely it's targeted.
3. **Label abbreviation in a fixed viewport band (shipped).** Keeps `outerRadius`/`margin`
   constant everywhere (60% / 20px uniform, unchanged from the manual edit) — the plotted shape
   never shrinks. Only the axis-label *text* degrades, and only inside a fixed 1024–1250px
   window (given directly, not derived): full criterion names clip past the card at Tier 1's
   narrow end, so labels shorten there; outside that band (Tier 2, and Tier 1 beyond ~1250px)
   full names render.

**Implementation.** `RatingRadarChart.tsx` gained a `CRITERION_ABBREVIATIONS` lookup (fixed
per-name table, not generic truncation — reads as deliberate abbreviations rather than mid-word
cutoffs) wired through `PolarAngleAxis`'s `tickFormatter`. Sizing detection is a plain
`window.innerWidth` check with a `resize` listener (`isNarrow = innerWidth >= 1024 && innerWidth
<= 1250`), not `matchMedia` (avoids string-parsing indirection) and not `em` units (avoids a
repeat of the em-vs-px boundary confusion already documented in the layout entries above) — an
exact, easy-to-verify match against the two numbers as given. A `ResizeObserver`-based variant
(measuring the chart's own rendered box rather than the viewport) was built first per option 2
above, then removed entirely once viewport-width was confirmed as the actual desired trigger —
not layered on top of the simpler fix.

**Real bug found and fixed independent of the above: label text keys must match seeded data
exactly.** The abbreviation table's initial key was `'Emotional Impact'` (title case); the real
row in `supabase/criteria.sql` is `'Emotional impact'` (sentence case, only the first word
capitalized). A title-case key would have silently never matched — that criterion's label would
never abbreviate, failing quietly with no error, only found by cross-checking the lookup keys
against the actual seed file rather than trusting the brief's casing at face value. Also
corrected: the dev-only test harness's mock catalog, which had used an entirely different,
made-up set of six criterion names (leftover from the original responsive-layout pass) — swapped
to the real six (`Innovation`/`Emotional impact`/`Performance`/`Coherence`/`Production`/
`Songwriting`) and `FIXED_CRITERION_ORDER`'s real id mapping, so the abbreviation table was
actually being exercised rather than silently falling through to its no-match fallback the whole
time.

**Two dev-server artifacts hit and fixed during iteration, neither a real code bug:** a stray
plain `// comment` that landed directly inside JSX children (invalid — JSX comments need `{/*
*/}`) after a mid-edit restructure, which rendered as literal on-page text and broke Vite HMR for
the rest of that session; and a stale Vite module cache that kept serving a since-removed
`useRef` import after the `ResizeObserver` approach was torn out, throwing `ReferenceError:
useRef is not defined` until the dev server was restarted. Both are artifacts of iterating
against a live server, not issues in the committed code — `tsc --noEmit`, which compiles from
disk, was clean throughout even while the running server was serving stale/broken bundles.

**Also this pass:** axis-label color changed from the semantic `text.muted` token to the raw
`sand.200` palette value directly (a deliberate manual choice, not measured/justified by contrast
tooling the way earlier badge-contrast fixes in this doc were — noted here for consistency with
this doc's practice of recording token choices, not as an implied audit).

**What did not change:** Tier 1/Tier 2 grid structure and borders (both from the prior entry,
untouched by this pass), the chart's hover-tooltip content, `MobileRatingLayout`.

**Verification:** `tsc --noEmit` clean and `npx vitest run` 217/217 confirmed after every
substantive change in this pass. Live visual verification across the 1024–1250px band and its
boundaries was run interactively during the session (confirmed working per direct user review)
rather than captured here step-by-step, since the session's live-testing loop was cut short
partway through automated re-verification at the user's request ("stop testing") after the
dev-server artifacts above had already cost significant time — the fixes that followed (the
`Emotional impact` casing correction and the `sand.200` color change) were applied and
type-/test-checked but not re-screenshotted individually.

### 2026-08-06 — Motion pass: radar animation, completion reveal, criterion-switch transition

Four small, additive motion/interaction improvements, no layout changes. Site-wide convention
followed: no bounce, short durations (150–350ms), nothing "playful" — matching the page's
sharp-cornered, zero-border-radius aesthetic. (First shipped with a two-slab `RATED n`/`TOTAL 6`
pending state and a same-node background-color reveal; both were replaced same-day per live
feedback — this entry describes the final shipped shape, not the intermediate one.)

**1. Radar chart animates on pick.** `RatingRadarChart.tsx`'s `<Radar>` already had
`isAnimationActive`; added `animationDuration={250}` with no `animationEasing` override.
Deliberately *not* using the house `ease-out` convention here — confirmed live that Recharts'
default easing looks right on this specific animation and `ease-out` looked wrong in practice,
despite matching the site's usual preference on paper. This is a tested exception, not an
oversight — don't "fix" it back to `ease-out` later without re-testing live.

**2+4. Evaluation-progress box + completion reveal.** `RatingSlab` gained a third `progress`
variant (`bg: ember.950`, `color: sand.200`, `px: 12px` — a local style object, not added to
`scoreSlabBase`/`High` in `theme.ts` since it's only ever used here). `DesktopRatingLayout`
computes `isPending = ratings.size < order.length` and, while pending, renders exactly one
`RatingSlab` spanning the full Rank/Score row — label "Evaluation progress", value `n` (the
rated count, `RatingSlab`'s existing bold 28px number styling, untouched) followed by a
`valueSuffix` of `` ` / ${order.length}` `` in a smaller/normal-weight inline `Text` (20px, 400
weight) — e.g. `4` bold next to `/6` smaller, reading as one line. Deliberately gated on
`ratings.size` directly rather than on `ratingSummary`'s presence: `ratingSummary` refetches
asynchronously after the 6th save (`AlbumRatingPage.tsx`'s `handlePick` calls
`refetchRatingSummary()` post-save), so gating on it would leave a stale "—" flash between the
6th pick and the refetch resolving.

The completion reveal is a structural swap (one full-width box → two half-width slabs), not a
same-node prop change, so a plain `background-color` transition doesn't apply — confirmed live
before committing to an approach: a first attempt used a single simultaneous `AnimatePresence`
crossfade (both sides mounted and opacity-animating at once) and it read as a jump-cut, since the
one full-width box and the two half-width slabs share too little visually for an overlap to look
like a transition. Fixed with `mode="wait"`: the progress box fully unmounts (200ms `easeOut`
fade-out) before the Rank/Score `Flex` mounts and fades in (200ms `easeOut`) — verified live via
screenshots at mid-exit, mid-enter (visibly dimmed before settling), and the final `RANK #n`
ember / `SCORE n%` light state. No layout shift, since only one side is ever mounted at a time.

**5. Criterion-switch transition.** The active criterion's `CriterionLevelPicker` (inside
`DesktopRatingLayout`'s Section 2 picker panel) is now wrapped in a `framer-motion` `motion.div`
keyed on `selectedEntry.index`, with `initial={{ opacity: 0, y: 4 }}` →
`animate={{ opacity: 1, y: 0 }}` over 180ms `easeOut`. The `key` forces a fresh mount (and thus a
fresh `initial`→`animate` run) on every row click, not just the first render. `framer-motion` was
already a transitive dependency (via Chakra) but not previously imported directly anywhere in
`src/` — this is the first direct usage. No exit animation: the old content is removed instantly
on remount rather than cross-fading out, which avoids the layout-shift risk of two stacked panels
rendering simultaneously during a crossfade, at the cost of the brief's literal "old content
fades out" phrasing — the visible, load-bearing part (new content settling in via fade +
translateY) is unchanged.

**Verification:** `tsc --noEmit` clean, `npx vitest run` 217/217 (as of the last pass that
touched test-relevant logic — the two follow-up tweaks above, progress-box padding and the
bold-count/smaller-suffix split, were type-checked and live-verified via screenshots but not
re-run through the full suite, since neither touches logic any existing test covers). Live
verification throughout used the `/dev-rating-preview` dev-only harness
(`src/DevRatingPreview.tsx`, temporary — remove before merging): radar re-animation caught
mid-animation (polygon interpolating between shapes); criterion-switch fade caught mid-fade
(incoming level list at partial opacity); the progress-box → Rank/Score reveal caught at all
three phases described above.

**What did not change:** any layout/spacing/border/color token outside what's listed above, the
radar chart's hover-tooltip behavior/`outerRadius`/margins/axis labels, `MobileRatingLayout`,
`scoreSlabBase`/`scoreSlabHigh` themselves (only a new third variant added).

### 2026-08-07 — Mobile stage 1: structural redesign (`mobile-album-evaluation-redesign` branch)

First of a planned 4-stage mobile pass bringing `MobileRatingLayout` in line with
`DesktopRatingLayout`'s bordered-card visual language (album-rating-page-desktop-redesign,
above). Stages 2-4 (radar-chart modal, "View Your Evaluation"/`RatingSummaryView` removal,
selection/transition animation) are explicitly out of scope for this pass.

**Diagnostic correction to the brief:** the brief referenced adding a `hideGenres` prop to
`AlbumMeta` — that component no longer exists. It was replaced by `AlbumMetaBlock.tsx` during
design-system-audit-2026-08 Pass 4 (see that doc). Added `hideGenres?: boolean = false` there
instead, gating only the existing `genre.length > 0` Wrap block; default keeps all three existing
consumers (`DesktopRatingLayout`, `FavoritesPage`'s desktop and mobile `FavoriteListItemRow`
trees) unaffected.

**Extracted `RatingProgressBox`** (`src/components/album-rating/RatingProgressBox.tsx`) out of
`DesktopRatingLayout`'s Section 3 — the "Evaluation progress n/total" / Rank+Score
`AnimatePresence` crossfade (see the dated 2026-08-0x motion-pass entry above for why
`mode="wait"` was chosen) was inline JSX there, not a standalone component, so it couldn't be
reused directly. Extraction is a pure lift: same props derived the same way
(`ratedCount`/`totalCount`/`ratingSummary`), same crossfade timing, verified live at both
pending and complete states on desktop post-extraction (no visual/behavior change) before wiring
it into mobile. `RatingSlab`'s own comment (previously claiming it only ever renders inside
`DesktopRatingLayout`'s Section 3) updated to reference `RatingProgressBox` instead.

**Mobile album-info zone** reimplemented locally (no shared extraction this pass, per brief) from
`FavoriteListItemRow`'s desktop tree in `FavoritesPage.tsx` (`Flex align="center" gap={4}` +
flush artwork + `AlbumMetaBlock`) — explicitly not that same file's separate artwork-first
*mobile* tree, which is a different pattern for a different context. Artwork resized 128px (the
favorites-row precedent) → 96px per brief; `AlbumMetaBlock` called with `titleLayout="stacked"
hideGenres` — this page shows genre nowhere else either, so suppressing it here is consistent
with the existing page, not a new omission.

**Criteria-row badges** replicate `DesktopRatingLayout`'s exact inline status-label expression
(`` `${level}–${label}` `` / `'NOT EVALUATED'`, en dash, no spaces) — confirmed via grep that no
shared helper exists to call instead, so this copies the expression rather than inventing a
shared one.

**Criteria-row dividers:** plain 1px `borderBottom` (color `sand.600`) on every row except the
last — not desktop's isFirst/isLast border-suppression scheme, which exists there to solve a
left/right border-doubling problem specific to desktop's split-panel row layout that doesn't
apply to mobile's plain vertical list.

**Removed from `MobileRatingLayout`:** the fixed header's ~40px ambient `RatingRadarChart` and
the "← Favorites" `backHref`/`backLabel` link — both props dropped from
`MobileRatingLayoutProps` and the call site in `AlbumRatingPage.tsx`, since the page-level
`PageBreadcrumb` above both layouts already covers that navigation and nothing else consumed
`backLabel` after the drop. `resolveBackDestination`'s return type narrowed from `{href, label,
sourceLabel}` to `{href, sourceLabel}` accordingly (`AlbumRatingPage.tsx`).

**Extended `MobileRatingLayout`'s props** to receive `releaseDate`, `genre`, `weights`,
`ratingSummary` from `AlbumRatingPage.tsx` — plumbing only, mirroring what
`DesktopRatingLayout` already received; no new data fetching.

**Verification:** `tsc --noEmit` clean, `npx vitest run` 222/222. Live-verified at a 375px mobile
viewport against real Supabase data (logged in as the account's own session, not automated) for
both a zero-ratings album (Ænigmatum — *Infinitude's Passage*, progress box showed "1/6" then
"2/6" after picking a level live, confirming save + auto-return-to-overview + row highlight all
still work) and a fully-rated album (Black Sites — *For Eternity*, Rank #1 / Score 100% slabs,
all six criteria showing rated badges, "View Your Evaluation" button still present since its
removal is stage 3). Both screens matched the three reference mockup screenshots' structure.
Desktop re-verified unaffected at 1280px post-`RatingProgressBox` extraction (3-section card,
Rank/Score slabs, radar chart all rendering correctly).

**What did not change this pass:** `DesktopRatingLayout`'s own JSX/tokens (only the Section 3
box's internals moved into `RatingProgressBox`, same output), auto-return timing/save/upsert
logic, the "View Your Evaluation" button/`RatingSummaryView` dialog, route/breadcrumb logic
(`from`-aware navigation, `PageBreadcrumb`), any screen-transition or selection-feedback
animation (stage 4).

### 2026-08-07 — Mobile stage 1 retouch pass (visual adjustments)

Four visual fixes against live review of the shipped stage-1 result, same
`mobile-album-evaluation-redesign` branch.

**Album-info block padding:** already 0/0 from stage 1 (`AlbumMetaBlock`'s `padding={{ x: 0, y:
0 }}` at the mobile call site) — no change needed, confirmed against the brief's item 1.

**`AlbumMetaBlock` gained `bandFontSize`/`albumFontSize`** (two flat optional props, not a
grouped object like `padding` — band/album sizes have no shared spatial axis to justify nesting,
so this matches `titleToDateGap`/`dateToGenreGap`'s flat-prop precedent instead). Both fall back
to `cardTitleBand.fontSize`/`cardTitleAlbum.fontSize` via `??`, not a plain JSX override, since
`<Heading {...cardTitleBand} fontSize={undefined}>` would otherwise blow away the spread's own
fontSize (a later explicit prop always wins over an earlier spread, even when its value is
`undefined`). Mobile passes `16px`/`16px`; no other consumer passes these.

**Band line-height changed to `1.4` (from `1.1`) as `AlbumMetaBlock`'s own default** — applied
directly in the component (not `theme.ts`'s `cardTitleBand`, which only StyleGuide.tsx's
unrelated dev-only reference swatch also uses, hardcoding its own `lineHeight="1.1"`
independently of this component). Global change, live-reverified on all three real consumers at
their existing usages: `DesktopRatingLayout` (Section 1, stacked), `FavoritesPage`'s desktop row
(inline) and mobile row (stacked) — no visible regression on any.

**`truncateBand`/`clampAlbumLines`** added as opt-in props (`false`/`undefined` default,
stacked-layout-only — the inline layout already truncates its whole "band – album" line via the
parent `Text`'s `lineClamp={1}`, so per-span truncation there would be redundant). Mobile passes
`truncateBand` + `clampAlbumLines={2}`. Implemented as conditional style objects spread onto the
element (`{...bandTruncateStyle}`) rather than individual JSX props, for the same
undefined-overwrite reason as the fontSize props above.

**Rank/score block padding — diagnostic finding (brief's item 6):** `RatingProgressBox` has no
`padding` prop and no hardcoded padding inside itself — its root is a bare `AnimatePresence`/
`motion.div` with zero padding, and `DesktopRatingLayout`'s Section 3 `VStack` wraps it with no
`px`/`py` either. The 16px mobile padding was entirely owned by `MobileRatingLayout`'s own
wrapper `Box` around `<RatingProgressBox>` (stage 1), not by anything shared with desktop — so
the fix was a plain `px={4} py={4}` → `px={0} py={0}` edit on that wrapper, no new prop needed,
desktop untouched (it never had an equivalent wrapper to begin with).

**Verification:** `tsc --noEmit` clean, `npx vitest run` 222/222. Live-verified at 375px against
real Supabase data using an album with both a long band name (Labor of the Negative) and a long
album name (*The Triumph of Time and the Disillusioned*) — band truncated to one line with
ellipsis, album clamped to exactly 2 lines with ellipsis, both screens' font sizes and padding
matched spec. Desktop re-checked at 1280px on `DesktopRatingLayout` (unaffected — full names
shown, no truncation, progress-box padding unchanged) and both `FavoritesPage` trees (unaffected
by the line-height default change).

**What did not change:** `DesktopRatingLayout`'s own padding/spacing, any other
`AlbumMetaBlock`/`RatingProgressBox` consumer's passed props (all still get old behavior via
untouched defaults), stage-1 structural work (card border, badge format, dividers, auto-return/
highlight behavior).

### 2026-08-08 — Mobile stage 1: second retouch pass (manual-testing fixes)

Three more fixes against Dan's own manual testing of the retouch pass above, same branch.

**Album-info block padding removed:** the `Flex` wrapping Zone 1's artwork+meta (`p={4}` →
`p={0}`) — a further tightening beyond `AlbumMetaBlock`'s own already-zeroed padding. Also added
`titleToDateGap={1}` (4px, Chakra's `space.1`) at the same call site, closing the gap between the
album name and the release-date line specifically on mobile; no other consumer's gap changed
(prop default stays `3`).

**Artwork size:** 96px → 110px in `MobileRatingLayout`'s Zone 1 only.

**Fixed a real bug: `clampAlbumLines` wasn't clamping anything.** The first retouch pass (above)
hand-built the 2-line-clamp CSS as a plain object (`display: '-webkit-box'`, `WebkitLineClamp`,
`WebkitBoxOrient`, `overflow`, `textOverflow`) and spread it onto the `Text`'s JSX props.
Confirmed live (Dan's manual test) that this did nothing — Chakra v3 only promotes *recognized*
style props into emitted CSS; arbitrary camelCase keys like `WebkitLineClamp` fall through as
inert DOM attributes rather than styling anything. Fixed by passing `clampAlbumLines` straight
into Chakra's own `lineClamp` prop (already in use elsewhere in this file, on the inline layout's
whole-line truncation) — it generates the equivalent CSS itself, and additionally sets
`textWrap: 'wrap'`, which is what actually lets the album name wrap across 2 lines before the
ellipsis kicks in, rather than truncating immediately on line 1 the way `truncateBand`'s
single-line style does.

**`hideReleaseDateLabel` prop added** (opt-in, default `false`) — drops the "Release date: "
prefix, showing only `formatReleaseDate(releaseDate)`. Used by `MobileRatingLayout` only; every
other consumer keeps the labeled form unchanged.

**Verification:** `tsc --noEmit` clean, `npx vitest run` 222/222. Visual confirmation of the
clamp fix and the other three changes was via Dan's own manual testing this pass, not this
session's live Browser-pane walkthrough (session was mid-flow when he said he'd verify directly).

**What did not change:** any other `AlbumMetaBlock` consumer (all four new/changed props here —
`hideReleaseDateLabel`, the `titleToDateGap`/padding call-site values, the artwork size — are
either opt-in with an unchanged default or scoped to `MobileRatingLayout`'s own JSX), stage-1
structural work.

### 2026-08-08 — Mobile stage 2: radar-chart modal

Third of four `mobile-album-evaluation-redesign` stages. Adds a tap-to-open modal showing the
full radar chart on mobile's Screen 1 (Overview), triggered from the `RatingProgressBox` zone.
Additive only — the existing "View Your Evaluation" button/`RatingSummaryView` dialog (stage 3)
and all screen-transition/selection-feedback work (stage 4) untouched.

**Diagnostic findings, confirmed before implementation:**
- `RatingRadarChart`'s `size` prop (`'full' | 'small'`, default `'full'`) already gives the
  brief's "full mode" for free — no new prop plumbing needed, just omit `size` or pass
  `size="full"`.
- No code path special-cases zero ratings — a 0/6 chart just plots every point at level 0,
  degenerating to a tiny center shape. Live-verified via a temporary dev harness (see below):
  renders correctly, no crash, no NaN.
- `RatingProgressBox` has no `onClick`/ref-forwarding conflicts — safe to wrap from outside.

**Trigger:** `MobileRatingLayout`'s existing `RatingProgressBox` usage (Screen 1 only) is wrapped
in a native `Box as="button"` (not `role="button"`/`tabIndex` — a real `<button>` gets focus and
Enter/Space activation for free) with `aria-label="View radar chart"`, opening a `radarOpen`
dialog state on click. `RatingProgressBox.tsx` and `DesktopRatingLayout.tsx` have **zero diff**
(confirmed via `git diff --stat` post-implementation) — desktop's usage is unaffected.

**Modal:** same `DialogRoot`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogBody`/
`DialogFooter` structure as the page-level `RatingSummaryView` dialog in `AlbumRatingPage.tsx`,
kept local to `MobileRatingLayout.tsx` instead (all the data it needs — `catalog`/`ratings`/
`order`/`weights`/`band`/`album` — were already props there; no new fetching). Title
`` `${band} – ${album}` ``, same format as the existing dialog. Standard close (X, tap-outside,
Esc) via Chakra's `Dialog.Root`.

**Bug found and fixed in passing**: `MobileRatingLayout`'s `weights` prop was already declared
in `MobileRatingLayoutProps` and passed by `AlbumRatingPage.tsx`, but never destructured in the
component's parameter list — a pre-existing dead prop (unused until this stage needed it for the
new chart). Fixed by adding it to the destructure; caught immediately by a live "weights is not
defined" runtime error during verification, not by `tsc` (the prop's declared type made it look
used).

**Tooltip on tap — better than expected.** Diagnostic read of `RatingRadarChart.tsx` found no
touch-specific wiring around Recharts' `Tooltip`, suggesting tap likely wouldn't trigger it. Live
verification (Browser pane, mobile viewport/touch emulation) showed the opposite: tapping a
radar point **did** show the tooltip correctly (tested at 0/6 — "Innovation / Not rated / —").
Likely explained by the synthetic click event most mobile browsers dispatch after a touchend,
which Recharts' tooltip activation responds to. Documenting as a positive finding rather than a
gap — no custom touch-tooltip logic was built (per the brief, this wasn't to be built regardless
of the diagnostic's outcome), and real-device behavior may still vary by browser; flagged as a
candidate to spot-check on a real phone, not added to `deferred-work.md` as a known-broken item
since it worked in the tested environment.

**Live verification**: could not use a real logged-in Supabase session for this pass — verifying
live would have required entering a live account's password into the browser tool, which is out
of scope for this session to do (credential entry is not something this session performs). Used
a temporary dev-only route (`/dev-radar-modal-preview`, `src/DevRadarModalPreview.tsx`) rendering
`MobileRatingLayout` directly with mock catalog/ratings/weights data at 0/6, 3/6 (partial), and
6/6 — same precedent as the desktop redesign's now-removed `DevRatingPreview.tsx`. All three
states confirmed correct at 375px: 0/6 shows a degenerate center point, 3/6 a partial polygon,
6/6 the full hexagon plus Rank/Score slabs and the (untouched) "View Your Evaluation" button
still present and functional. Route and harness component removed before this stage's work was
considered done — `git diff --stat` confirms only `MobileRatingLayout.tsx` changed.

**Verification:** `tsc --noEmit` clean, `npx vitest run` 222/222 (before and after harness
removal).

**What did not change:** `RatingProgressBox.tsx`, `DesktopRatingLayout.tsx` (both zero diff),
`RatingSummaryView.tsx`/its dialog, `main.tsx` (temp route added and removed same session, net
zero diff), any screen-transition/selection-feedback behavior (stage 4, not started).

### 2026-08-08 — Mobile stage 3: remove "View Your Evaluation" / `RatingSummaryView`

Fourth of four `mobile-album-evaluation-redesign` stages (stage 4, selection/transition
animation, still not started).

**Diagnostic findings, confirmed before implementation:** the button, its open/close state, and
the `RatingSummaryView` render were split across two files, not all in `MobileRatingLayout.tsx`
as might be assumed from the button living there. The button itself
(`MobileRatingLayout.tsx`, gated on `isComplete`) called an `onOpenSummary` prop; the actual
`summaryOpen` state, the `DialogRoot`, and the `RatingSummaryView` render all lived in
`AlbumRatingPage.tsx`, rendered page-level (outside both `DesktopRatingLayout` and
`MobileRatingLayout`, gated only on `albumInfo` truthiness) — dead weight on desktop, which never
set `summaryOpen` since `isComplete`/`onOpenSummary` were never passed to `DesktopRatingLayout`.
This confirmed stage 2's diagnostic note ("DialogRoot pattern in AlbumRatingPage.tsx") was
accurate and not a misattribution — it's a distinct dialog from stage 2's radar-chart modal,
which lives entirely inside `MobileRatingLayout.tsx` and was untouched by this pass.
`git grep RatingSummaryView` across the whole repo found only 3 source references (the two
files above plus the component itself, plus one now-updated comment) — no `aoty-*` doc or other
page referenced it for reuse, so it was deleted outright rather than kept as an orphan.

**Decoupling check on `RatingProgressBox` (re-confirmed post-hoc, with quote):** the brief
required confirming `RatingProgressBox` computes its own completion state
(`ratedCount`/`totalCount`) rather than depending on the `isComplete` this stage deletes. Quote,
`RatingProgressBox.tsx`:
```
interface RatingProgressBoxProps {
  ratedCount: number;
  totalCount: number;
  ratingSummary: AlbumRatingSummary | undefined;
}

export function RatingProgressBox({ ratedCount, totalCount, ratingSummary }: RatingProgressBoxProps) {
  const isPending = ratedCount < totalCount;
  ...
```
No `isComplete` prop in the interface, ever — both call sites
(`MobileRatingLayout.tsx:146`, `DesktopRatingLayout.tsx:272`) pass only `ratedCount`/
`totalCount`/`ratingSummary`. `isComplete` (`AlbumRatingPage.tsx`) existed solely to gate the
now-removed button; it had no other reader. Confirmed safe to delete.

**Removed:** the button block in `MobileRatingLayout.tsx` (with its now-unused
`isComplete`/`onOpenSummary` props and the now-unused `primaryButton` import); `summaryOpen`
state, the `isComplete` computation, the `RatingSummaryView` import, and the page-level
`DialogRoot` block in `AlbumRatingPage.tsx` (along with now-unused `Button`/`Dialog*`/
`CloseButton`/`secondaryButton` imports and the `CRITERIA_COUNT` constant); the file
`RatingSummaryView.tsx` deleted outright.

**Live verification:** same constraint as stage 2 — no real logged-in Supabase session used.
Reused stage 2's precedent: a temporary dev-only route (`/dev-mobile-stage3-preview`,
`src/DevMobileStage3Preview.tsx`) rendering `MobileRatingLayout` directly with mock data at 6/6
completion. Confirmed at 375px: Rank/Score box and all 6 criteria rows render correctly, no
"View Your Evaluation" button present, `read_page` DOM scan showed exactly 7 interactive
elements (radar-chart trigger + 6 criteria rows, no 8th button).

The first verification pass stopped there and treated the element count as sufficient — it
wasn't: a button count proves the old button is gone, not that the still-shipping stage-2 radar
modal still opens after this stage's changes. The browser tool's coordinate/ref click was flaky
in that pass (timeouts, text-selection instead of a click firing), and rather than finding a
working alternative the pass moved on. Redone: `document.querySelector('[aria-label="View radar
chart"]').dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))` fired the
click directly, bypassing the flaky coordinate-based input path, and a screenshot confirmed the
modal opened with the full hexagon chart rendered (all 6 criteria labeled: Emotional impact,
Performance, Production, Songwriting, Innovation, Coherence). Stage 2's radar modal is confirmed
unaffected by this stage's removal.

Route and harness component removed before this stage's work was considered done — `git diff
--stat` confirms only `AlbumRatingPage.tsx`, `MobileRatingLayout.tsx` (both modified) and
`RatingSummaryView.tsx` (deleted) changed, `tsc --noEmit` clean after removal.

**`RatingSummaryView.tsx` test-file question:** no test file for `RatingSummaryView` ever
existed. Confirmed via full git history (`git log --all --diff-filter=A --name-only -- '*Rating
SummaryView*'` returns only the component file itself, never a `.test.`/`.spec.` companion) and
via the current tree (no `__tests__` file anywhere under `album-rating/` references it). No
album-rating component in this codebase has dedicated unit tests — that's true before and after
this stage, not something this stage changed. This is why `npx vitest run` stayed at 222/222
both before and after the deletion: there was nothing to lose. The earlier brief's phrasing
("delete the file and any test files for it") was gap-filling for an unconfirmed case — no such
file existed, so nothing beyond the component itself needed removing.

**Verification:** `tsc --noEmit` clean, `npx vitest run` 222/222 (before and after harness
removal, and before/after this stage's deletion — see test-file note above for why the count
didn't move).

**What did not change:** `DesktopRatingLayout.tsx`, `RatingProgressBox.tsx`, `RatingRadarChart.tsx`,
the radar-chart modal (stage 2, entirely inside `MobileRatingLayout.tsx`), any
screen-transition/selection-feedback behavior (stage 4, not started).

## Stage 4a (2026-08-08) — selection feedback + screen transitions, two revisions

First live testing of the mobile-album-evaluation-redesign branch (prior stages were
DOM-scan/mock-data verified only, never a real logged-in click-through) surfaced real problems
in the first attempt, leading to a second revision. Both are recorded here since revision 1's
mistakes are exactly why revision 2 looks the way it does.

**Revision 1.** Replaced the flat `AUTO_RETURN_MS` (1750ms) delay-then-snap with: save → scale +
checkmark + dim feedback on the picked `RadioCardItem` (`FEEDBACK_MS`) → a directional
`AnimatePresence`/`mode="popLayout"` slide back to Screen 1 (`SLIDE_MS`) → row highlight once
settled. `RatingProgressBox` was hoisted above the `AnimatePresence` block and toggled via CSS
`display` (not unmounted) specifically so its own crossfade — previously never able to play on
mobile at all, since the box used to live *inside* the per-screen branch and so unmounted on
every screen switch — could survive the switch. A `progressSnapshot` state, synced from the live
`ratings`/`ratingSummary` props only inside the "slide settled" callback, gated when the box
was allowed to see the new `ratedCount` at all, so the crossfade would play at arrival instead of
mid-slide.

Dan's live testing (real Supabase account, real clicks) found this genuinely felt "greoaie/
sacadată" (heavy/jerky), and diagnosed why precisely: `RatingProgressBox`, hoisted outside the
`AnimatePresence` block, wasn't part of what actually slid — it popped via `display` toggle at
its own independent moment while the criteria list slid as a separate, uncoordinated animation.
Two treatments on what should read as one panel.

**Revision 2 — structural fix.** Root-caused (not guessed) two more issues at the same time:

- **Border bug**: the album-info→content divider used `borderTop` on `Flex`/`VStack` elements,
  one of them (`Flex as="button"`, the detail screen's back row) without an explicit `w="100%"`
  — a `Flex` rendered `as="button"` can pick up a native `<button>`'s intrinsic sizing behavior
  on some mobile engines even with `display:flex` applied. Per Dan's screenshot, that border
  visibly stopped short of the card's right edge. Fixed by using one dedicated `Box` divider
  with an explicit `w="100%"` in both panels, rather than relying on ambient block-width
  behavior on a `Flex`/`VStack`.
- **Dim-affects-selected-card bug**: Chakra's radio-card recipe bakes in `_disabled: {opacity:
  0.5}` on the item slot. `disabled` was set to `true` for *every* `RadioCardItem` during the
  feedback window (to block re-taps), including the selected one — so even though the custom
  per-item dim logic correctly excluded the selected card, Chakra's own disabled-opacity still
  applied to it (opacities compound: 1 × 0.5 = 0.5). Fixed with a per-item `_disabled={{opacity:
  isFeedbackTarget ? 1 : 0.5}}` override.

Structural fix: `MobileScreenTransition.tsx` (new) — owns *only* the slide mechanics, decoupled
on purpose from feedback/highlight/snapshot state (so a future switch to e.g. a bottom-sheet
reveal only touches this file). A two-panel flex track (`width: 200%`, each panel `50%`/
`flexShrink: 0`), both panels *always* mounted side by side, with a single `translateX` on the
shared track (`x: 0%` for overview, `x: -50%` for detail) driving visibility — no
`AnimatePresence`, no enter/exit variant pair, one transform serves both directions.
`MobileRatingLayout.tsx` was rebuilt around it: `albumInfo` is no longer hoisted/deduplicated
above the sliding content — each screen is now a fully self-contained panel (album info +
progress box + list, or album info + back row + picker), so *everything* in a panel moves
together as MobileScreenTransition slides it. `detailCriterionId` no longer resets to `null` on
return (defaults to `order[0]`, never null) — since both panels are permanently mounted,
including while the detail panel is still visible mid-slide-back, a null-guarded panel would
flash blank instead of showing the just-rated criterion underneath.

`progressSnapshot` (the delayed-sync mechanism) was **kept**, not dropped, despite the panel
now being permanently mounted — flagged explicitly by Dan before implementation: "always
mounted" only fixes state loss on remount, it doesn't stop the *live* `ratings`/`ratingSummary`
props from updating (and `RatingProgressBox` reacting to them) the instant the save resolves,
well before the feedback+slide sequence finishes, while the panel may still be translated
off-screen. Without the snapshot, the crossfade would play and finish while invisible — the
exact "pop instead of crossfade" bug this mechanism exists to prevent, reintroduced via a
different path. `progressSnapshot` still only syncs from live props inside the same
"slide settled" `setTimeout` as before; only the CSS-`display` toggle was dropped (no longer
needed once the panel is naturally always-mounted rather than hoisted-and-toggled).

**Other revision-2 fixes**, both in `CriterionLevelPicker.tsx`: removed the checkmark-over-
indicator overlay entirely (visually clashed with Ark UI's own `_checked` state) — feedback is
scale-up only now. Row highlight (`MobileRatingLayout.tsx`, arrival) and the selection-feedback
ring (`CriterionLevelPicker.tsx`, mid-pick) both switched from a `bg` fill to a `border`, same
`accent.border` token in both places — the arrival highlight's `accent.ink` text-color swap was
also dropped (it existed only for contrast against the now-removed fill).

**Timing**: `FEEDBACK_MS` (450) and `SLIDE_MS` (280) carried over unchanged from revision 1 —
revision 1's "snappier, not sluggish" read was against the disjointed two-treatment slide, not
the unified one, so per the brief these values are flagged as still needing a live-feel
re-confirmation post-restructure rather than assumed correct.

**Verification**: `tsc --noEmit` clean, `npx vitest run` 222/222, both revisions. Live-tested
against real Supabase data (Dan directly, plus tool-driven verification via
`label.click()`/`button.click()` dispatch — the browser tool's coordinate-based `left_click`
was unreliable across both sessions, consistent with the flakiness noted in the stage-3 entry
above, so verification routed around it the same way). Confirmed end-to-end: progress increments
correctly across 4 sequential picks (3/6 → 6/6) on a real album, the 6th pick correctly shows
the crossfaded Rank/Score (not a stuck pending state), both panel dividers span the full card
width, the radar-chart modal still opens correctly post-restructure (real click, real screenshot
with rendered hexagon), and `DesktopRatingLayout` at 1280px is visually unaffected (own
`CriterionLevelPicker` usage never passes `pendingLevel`, so `feedbackActive` is always `false`
there — same checked-ring styling as before this stage). Not captured: a mid-slide screenshot
proving `RatingProgressBox` hasn't reached its final state while still transitioning into
view — the tool's round-trip latency consistently exceeded the ~730ms total animation window
across repeated attempts in both sessions, so that specific proof relies on Dan's own live
observation (he reached 6/6 on a separate album, Ænigmatum, independently during this stage).
Stage 4b (sticky headers) not started; selection/transition animation for stage 4 is otherwise
functionally complete pending Dan's feel-confirmation on the two timing values above.

## Stage 4a revision 3 (2026-08-08) — three more live-testing fixes

Three issues from Dan's continued live testing of revision 2, addressed together.

**Album info no longer duplicated per-panel.** `albumInfo` was identical on both screens and,
per Dan's review, was never actually implicated in the original disjointed-slide bug (that was
specifically `RatingProgressBox` popping independently of the sliding list) — so it didn't
belong inside `MobileScreenTransition`'s per-panel content at all. Pulled out to render once,
statically, above the sliding track in `MobileRatingLayout.tsx`, with a single divider below it
instead of one copy per panel. `MobileScreenTransition`'s two panels now hold only
screen-specific content: overview = progress box + criteria list, detail = back-row + picker.
Sets up cleanly for stage 4b's sticky-header work too (nothing to keep in sync between two
divider instances anymore).

**Arrival-highlight layout shift and wrong color, root-caused.** The row highlight (added
revision 2) toggled `border` presence outright (`undefined` -> `"2px solid"`). Confirmed via
Chakra's global reset (Panda's Preflight, `box-sizing: border-box` on `*`) that box-sizing
wasn't the cause — the real mechanism: this row has no fixed height, so adding a border still
grows its *total* rendered height regardless of box-sizing (border-box only keeps
padding+border+content within an *explicit* size; with `height: auto` there's nothing to keep
them within). Also very likely explained the wrong-color report: `border="2px solid"` (shorthand)
and a separate `borderColor` prop both emit border-color declarations, with no guaranteed
precedence between them in the generated CSS.

Fixed by switching to an inset `boxShadow` instead of a real border: same 2px ring shape in both
states, only the color value ever changes (`accent.border` <-> `transparent`), and box-shadow
never participates in layout at all — a stronger guarantee than "should be fine because
box-sizing is border-box," since it holds regardless of the row's height being fixed or auto.

That surfaced a second, genuinely separate bug during live verification: the color itself was
written as `'inset 0 0 0 2px {colors.accent.border}'`, using Panda CSS's `{colors.x.y}`
brace-interpolation token syntax embedded in a compound string. That syntax is a *build-time*
token-extraction feature; live-tested via computed style and confirmed it produced an
inconsistent/absent box-shadow at runtime rather than the intended color (polled
`getComputedStyle(row).boxShadow` for 6-9 seconds after a pick across several attempts — the
inset shadow was present with the correct *shape* but stuck at a transparent color the entire
time). Fixed with Chakra's own `useToken('colors', 'accent.border')` hook, which resolves to the
real CSS color value (confirmed live: `rgb(255, 106, 26)`) — a documented runtime API, not a
build-time-only string convention. Re-verified live end to end after the `useToken` fix: the
highlight now renders with the correct accent color and the expected ~1.2s-to-trigger,
~2.5s-duration timing, with no visible layout shift (row height/spacing identical to unhighlighted
siblings in a before/after screenshot).

**Already-selected level now shows a persistent accent border.** `CriterionLevelPicker`'s
`_checked` styling previously only used the accent color while `isFeedbackTarget` (the transient
just-picked window); opening the Detail screen for an already-rated criterion showed the old
plain `sand.200` ring instead. Changed the condition from `isFeedbackTarget` to `feedbackActive`
(true for any mobile-mounted picker, regardless of whether a pick is transiently in progress) —
so every checked item shows the accent border on mobile, matching "already selected" and "just
now selected" visually. Desktop (`feedbackActive` always `false`, since `DesktopRatingLayout`
never passes `pendingLevel`) is unaffected — verified at 1280px, checked ring still plain
`sand.200`.

**Verification:** `tsc --noEmit` clean, `npx vitest run` 222/222. Live-verified against real
Supabase data (`REZN — Cycles In The Infinite Dream`, driven via `label.click()`/`button.click()`
dispatch — the browser tool's coordinate-based `left_click` remains unreliable this session):
static album info confirmed via screenshot to not move between screens, single full-width divider
on both screens, persistent accent border on an already-rated level shown immediately on Detail
open (screenshot), arrival highlight confirmed with the correct resolved color and no layout
shift (screenshot + computed-style polling), radar-chart modal still functional (real click, real
screenshot), desktop at 1280px visually unaffected.

## Stage 4a revision 4 (2026-08-08) — Rank/Score race, full accent-color revert, feedback pause

**Audit of the previous "full 4-pick sequence...correct progress increments" claim**, asked for
before proceeding with new fixes: that claim (end of the revision-3 message) was backed by real
screenshots — both `Labor of the Negative` (revision 2 session, "RANK #7 / SCORE 81%") and `REZN
— Cycles In The Infinite Dream` (revision 3 session, "RANK #11 / SCORE 72%") showed the
crossfaded Rank/Score in actual captured screenshots, not inferred from "no errors thrown." That
doesn't contradict Dan's new bug report, though — see the race explanation below: passing runs
and failing runs are both consistent with a genuine race condition where the outcome depends on
which of two independent async operations finishes first. Every one of this session's own test
runs happened to have the refetch win the race; Dan's real-world testing hit the other outcome.
Neither observation was wrong; the mechanism itself was non-deterministic.

**Root cause of the missing Rank/Score, confirmed via code inspection.**
`AlbumRatingPage.tsx`'s `handlePick` calls `refetchRatingSummary()` fire-and-forget — not
awaited — immediately after `setRatings(...)`. `MobileRatingLayout`'s own `handlePick` only
awaits the upsert itself (`await onPick(...)`), which resolves as soon as `AlbumRatingPage`'s
`handlePick` function body finishes running, well before the refetch's own network round trip
completes. The previous (revision 2/3) `progressSnapshot` mechanism was a *one-shot* sync: it
copied `ratedCount`/`ratingSummary` from a ref into state exactly once, at the "slide settled"
moment, 450+280=730ms after the save resolved (before revision 4's `PAUSE_MS`, 880ms after). If
`refetchRatingSummary()`'s query took longer than that window — an unremarkable amount of real
network latency on the 6th/final pick specifically — the one-shot sync captured the still-stale
`ratingSummary` (`undefined`), and nothing ever re-triggered a second sync while the user stayed
on Overview, so it stayed permanently stuck showing "—" instead of a real rank/score.

**Fix**: replaced the one-shot value copy with a `revealed` boolean gate. `RatingProgressBox` now
reads `revealed ? <live props> : progressSnapshot` — while `!revealed` (the whole feedback+pause+
slide window), it shows a fixed last-known snapshot (captured directly in `handlePick`'s own
closure, not via a `useEffect`+`setState` mirror — the first attempt at this hit React's
"don't call setState synchronously inside an effect" cascading-render lint error, and wasn't
needed anyway once the snapshot is captured inline in the event-handler flow instead). Once
`revealed` flips to `true` at settle, the box tracks live props on every subsequent render,
indefinitely — no single-shot window left to lose the race against. A late-arriving refetch now
simply re-renders the box correctly whenever it actually resolves, whether that's before or after
the settle point.

**Verified with a deliberate post-settle wait** (per the brief, not a same-instant check): full
0/6 -> 6/6 live run against `IMMOLATION — Descent` (a fresh, previously-unrated album), 6th pick
on Coherence, then a 4-second explicit wait before checking — Rank #2 / Score 100% confirmed via
both a script-level DOM check and a real screenshot, ~12 seconds after the pick (long past the
730-880ms settle window, well into territory where the old one-shot bug would have already shown
its permanent-stale-dash failure mode if it were still present).

**Accent-color revert**: Dan asked to fully back out the accent-border treatment added to
`CriterionLevelPicker` across revisions 2-3 (both the persistent already-selected border and the
feedback-moment color) — back to the plain, unconditional `sand.200` `_checked` ring, byte-
identical to `DesktopRatingLayout`'s untouched style. The scale-up + dim/fade feedback
(`motion.div`, the `_disabled` opacity fix) was kept, confirmed still working. The Overview row's
arrival highlight (box-shadow, `accent.border`) was explicitly out of scope for this revert and
is unchanged. Verified live: reopening an already-rated criterion now shows the plain white ring,
no accent color anywhere in the picker at any point (idle, mid-feedback, or persistent).

**Pause between feedback and slide** (`PAUSE_MS`): added a `setTimeout` between `FEEDBACK_MS`
elapsing and the slide starting, so the two read as distinct steps rather than blurring together.
Set to 150ms — the midpoint of the brief's suggested 100-250ms range. Verified the mechanism
itself fires correctly (monitored `MobileScreenTransition`'s track `transform` directly: it only
starts moving ~600-800ms after a pick, matching `FEEDBACK_MS + PAUSE_MS` plus real network
latency for the save), but **not** live-feel-tested — this tool can confirm the pause exists and
measure its duration, but can't judge whether 150ms specifically "feels right" the way a human
watching it can, the same limitation noted for `SLIDE_MS`/`FEEDBACK_MS` previously. Flagged for
Dan, not closed out.

**Verification**: `tsc --noEmit` clean, `npx vitest run` 222/222. Live-verified against real
Supabase data end to end (`IMMOLATION — Descent`, 0/6 -> 6/6, driven via `label.click()`/
`button.click()` dispatch): radar-chart modal still functional (real click, real screenshot),
desktop at 1280px visually unaffected (plain checked ring, no accent color, Rank/Score/radar all
correct).

**Still open going into any future stage-4a work**: `FEEDBACK_MS` (450), `PAUSE_MS` (150), and
`SLIDE_MS` (280) all need Dan's live feel-confirmation — none have been adjusted from
first-guess/brief-suggested values based on actual perceived feel, only verified to fire
correctly. Stage 4b (sticky headers) not started.
