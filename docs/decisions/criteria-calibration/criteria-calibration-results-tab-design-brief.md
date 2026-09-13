# Criteria Calibration — Results Tab: Design Brief

**Not in this repo.** This design brief is design-discovery output (mockups + a
lateral-thinking session resolving the open questions from the discovery-kickoff brief) and
lives only in Project Knowledge (claude.ai), not here — don't look for it under
`docs/decisions/`. See `criteria-calibration-results-tab-design-brief.md` in Project Knowledge
for full content: the three-section structure (narrative summary + confidence,
taste-fingerprint bar, expandable per-criterion/per-level breakdown), token reuse from the
Calibration progress bar, `TierAccuracyBadge` reuse, the recommendation to spike
`Chart.BarList`/`Chart.BarSegment` before building, and the open questions (real per-level
values for Versatility/Album coherence, sub-1% increment stability, copy finalization).

Builds on `criteria-calibration-results-tab--discovery-kickoff-brief.md`, also
Project-Knowledge-only.

Once implementation actually starts, the implementation-side decision doc (not yet created —
this page has no code yet, only a below-grade-2 placeholder per
`criteria-calibration-page-redesign.md`) is the one to update with what was actually built and
why it deviated (if at all) from this brief — per `documentation-governance.md`'s two-layer
rule.

## Spike findings (2026-09-12)

Ran the brief's recommended `Chart.BarList`/`Chart.BarSegment` spike before writing an
implementation plan — throwaway route `/results-spike`
(`src/ResultsSpike.tsx` + a route entry in `main.tsx`, both to be deleted, same lifecycle as the
`RatingRadarChart` `/radar-spike` precedent), verified live in the browser, not just type-checked.

**`BarSegment` (not `BarList`) is the right primitive, and it works — with one real technique,
and one real gap:**

- **Verdict: GO.** `BarSegment.Root`/`.Bar`/`.Content` render correctly against this app's
  tokens with no fighting the library. Zero-radius comes for free (the app's `radii.l1 = 0px`
  global override reaches `BarSegmentBar`'s hardcoded `rounded="l1"`); segment `bg` accepts
  Chakra color tokens directly (`ember.500`, `ink.300`) with no `chart.color()` resolution
  needed — that call is only required where a raw CSS value is unavoidable (Recharts SVG props,
  `ColorSwatch`'s `value`), not plain `Box` props.
- **The width-matching requirement (per-level breakdown bar's total width = the criterion's own
  row-bar width, not 100%) needs no hack.** `BarSegment` always sizes every segment to
  `value / sum(all passed values) * 100` — i.e. always "100% of its own container." Rather than
  padding that out with an invisible spacer segment, scope a separate `useChart` to just one
  criterion's own level values and wrap it in a `Box` already sized to that criterion's
  weight-relative-to-the-top-criterion width. Confirmed live: Emotional impact's (28%) and
  Coherence's (22%) expanded breakdown bars end exactly where their own collapsed row bars end,
  not at the container's full width.
- **Passing each level's real ABSOLUTE percent (not a within-criterion fraction) as `value`
  solves two requirements at once for free**: segment width (relative to the criterion's own
  total, since that's what the wrapper is scoped to) and the literal displayed number (the
  brief's "same absolute basis as the top-level weight" rule) come from the same number — no
  parallel "% of criterion" math to keep in sync.
- **Real gap found, not yet solved: sub-~1%-wide segments cannot fit a label.** Coherence's
  "Perfectly unified" (0.3%, the brief's own `<0.5%` example) and Performance's "Masterful"
  (0.5% exactly, confirmed to correctly stay literal rather than collapsing to `<0.5%` — the
  boundary is "under 0.5%", not "at or under") both render as unreadable one-character-per-line
  wrapped text inside a near-zero-width flex segment. `lineClamp`/`minW={0}` did not fix this —
  the segment is too narrow for any font size to show even the shortened `<0.5%` form. **Needs
  a decision before the real implementation**: candidates are hiding inline labels below a
  measured width threshold (tooltip-only, à la `BarSegmentTooltip`), or moving every level's
  label out of the bar into a shared list/legend below it (`BarSegmentLegend` exists for this
  but computes its own relative percent — would need the same absolute-value substitution used
  above). Not resolved by this spike; flag to whoever picks up the real implementation.
- Fingerprint segment labels (Section 2) truncate under Chakra's own `lineClamp` for the two
  narrowest criteria (Performance 10%, Innovation 8%) at this viewport width — expected/cosmetic
  at these proportions, not a library problem, and not the sub-1% failure mode above.

**Net:** no fallback to a hand-built implementation needed for the two structural
requirements (relative-width segments, absolute-basis labels) — both spike open questions map
to this outcome. The label-collision-at-tiny-widths problem is real and unresolved, and should
be decided (not silently patched) before the real Results tab component is built.

## Label-fallback follow-up + visual pass (2026-09-12, same day)

Resolved the tiny-width label gap above and restyled the spike against a second concept mockup
(`results-visual-concepts.html`, combined-direction 1+2+3), adapted onto this app's real tokens
rather than the mockup's raw hex vars. Same throwaway `/results-spike` route, still verified
live, not just type-checked.

**Two independent thresholds, confirmed NOT to be the same rule:**

- **RENDER threshold (`RENDER_THRESHOLD_PERCENT = 1`, absolute %):** below this, a level's
  segment moves its label out of the aligned per-segment row into a compact wrapped legend below
  the bar — no tooltip/hover fallback (no hover on mobile; hover-only percentages were already
  rejected earlier in the brief). The segment itself still renders at its real proportional
  width either way; only where its label attaches changes.
- **PRECISION threshold (`PRECISION_THRESHOLD_PERCENT = 0.5`):** independent of the above —
  governs only whether the literal number or `<0.5%` displays.
- **Confirmed live, three boundary cases:** Songwriting's invented "Outstanding" level at 0.8%
  (above precision, below render) shows literal `0.8%` in the legend, not `<0.5%` — proves the
  two thresholds fire independently, per spec. Performance's "Masterful" at exactly 0.5% shows
  literal `0.5%` (the rule is "under 0.5%", not "at or under"). Innovation's "Groundbreaking" at
  0.3% shows `<0.5%`. All three render cleanly in the legend with no character-wrapping.

**Other changes from the visual-concept pass:**

- Per-criterion rows now use the app's own `AccordionRoot`/`AccordionItem` disclosure
  (`src/components/ui/accordion.tsx`) instead of a hand-rolled `<details>`-style toggle — matches
  how the brief said either was fine, and reuses the existing chevron-indicator pattern rather
  than inventing new iconography.
- Fingerprint segments (Section 2) now embed the criterion name directly on the segment (dark
  `accent.ink` text on the ember fill, matching the concept) when the segment is wide enough
  (`FINGERPRINT_INLINE_LABEL_MIN_PERCENT = 20`, a concrete cutoff — the concept mockup's own
  break point across its 5 segments read as an editorial pick for that one example, not a
  computed rule, so this doesn't try to reverse-engineer it). Percent stays always-visible below
  every segment regardless.
- Added a `levels: null` per-criterion state (Coherence, standing in for the brief's real open
  question about unconfirmed Coherence/Versatility level data) rendering a "needs verification"
  note instead of a fabricated breakdown — still expands normally, doesn't fabricate.
- Colors switched from raw `ink.700`/hex vars to the existing semantic tokens
  (`border.ruleStrong`, `text.primary`, `text.dim`, `accent.ink`) where an equivalent already
  exists, rather than reaching for the raw `ink`/`sand` scale directly.

**Still open:** the shared legend's exact placement/format (currently a plain wrapped
name+percent list under the bar) hasn't been design-reviewed against the mockup's own visual
language beyond "not a tooltip, not aligned under the segment" — worth a second look before the
real implementation, not treated as finalized copy/layout by this pass.

## Correction: always show the 0% baseline level (2026-09-12, same day)

Reverses this pass's own earlier, wrong assumption. The spike had only ever included levels 2-5
per criterion (the level-1 baseline was silently omitted as "zero-width, nothing to show").
Corrected: every non-null criterion's breakdown now includes its real level-1 baseline at 0%,
matching the 1000minds reference pattern (all levels shown, including a 0% one) — the user
directly compared that level by name during calibration, so dropping it from Results would read
as a bug, not as "contributes zero."

- **0% still needs no special-casing in the render/legend split** — 0 is already
  `< RENDER_THRESHOLD_PERCENT`, so it falls into the shared legend automatically, same as any
  other sub-threshold level. Confirmed live (Emotional impact's "Flat", Performance's "Rough").
- **New, narrow addition: a per-segment visual-width floor** (`MIN_SEGMENT_VISUAL_PERCENT =
  0.15`), applied only inside the `useChart` data passed to `BarSegment` — NOT to the label text
  or the render/legend threshold check, both of which still read the real, unfloored value.
  Without it, a literal `value: 0` renders at true `flex: 0` (fully invisible); with it, the
  zero-value level renders as a thin but real visible tick at the start of the bar, confirmed
  live for Emotional impact ("Flat") and Performance ("Rough" and, independently, the also-0.5%
  "Masterful" both correctly showing side by side with distinct text).
- **Precision formatting special-cased for exactly 0**: `formatLevelPercent` now returns a
  literal `"0%"` for `value === 0`, bypassing the `<0.5%` truncation entirely — 0 is a structural
  fact from the model's normalization (the lowest level is always floored to exactly 0), not a
  small-but-uncertain value where exact precision would overclaim. Confirmed live: "Rough 0%"
  and "Masterful 0.5%" render as distinct literal strings in the same legend, not both collapsing
  to the same truncated form.
- Also fixed an unrelated pre-existing data bug surfaced while doing this: Performance's
  invented level values summed to 9.7, not its own 10% weight (the "Excellent" value was wrong,
  not a real invariant violation in any actual model) — corrected to sum exactly 10 again.

## Correction: text-fit measurement + collapsed/expanded width split (2026-09-12, same day)

Two more legibility issues found from the previous pass's screenshot, both fixed live:

**1. Text-length truncation is a separate failure mode from the percent threshold.** A label
above `RENDER_THRESHOLD_PERCENT` (e.g. Production's "Exceptional" at 1%) can still be too long
to fit its actual rendered width — the percent check alone let these through as unreadable
fragments. Fixed with a real DOM fit check, not a second percent guess: each percent-eligible
label mounts in-flow (`whiteSpace: nowrap`, `overflow: hidden`, `minW={0}` to override
flexbox's own `min-width: auto` floor) and toggles `visibility: hidden` — never removed from the
tree — once `scrollWidth > clientWidth` on its wrapping box. A label now goes to the legend if
EITHER condition fails (below the percent threshold, OR doesn't fit), confirmed live for
Production's "Exceptional".

- **Real bug caught along the way: `flexShrink={0}` defeats its own measurement.** Copied from
  `BarSegmentBar`'s own segments (safe there — they hold no text), `flexShrink={0}` on a
  text-bearing box means the box can't shrink below its content's natural width; it grows
  instead, silently overflowing the row (confirmed live: the whole page gained horizontal
  scroll) AND makes `scrollWidth > clientWidth` structurally impossible to ever observe (the box
  is always exactly as wide as its content). Fixed by dropping `flexShrink` to its default and
  keeping only `minW={0}` + `overflow="hidden"` — applied to both this bar's label boxes and the
  fingerprint's (Section 2) segment/percent boxes, which had the same latent bug even though
  their current data never triggered it.
- **Real timing bug caught the same way: measuring inside `useLayoutEffect` synchronously read
  stale (pre-flex) widths.** The very first live check showed every segment measuring as
  "fits" even when visibly truncated — Chakra/Panda's atomic CSS for the `flex` prop hadn't
  actually landed in the DOM yet at that point in the commit. Forcing a `resize` event
  afterwards (once styles had settled) re-measured correctly, isolating the cause. Fixed by
  measuring inside a `requestAnimationFrame` tick instead of synchronously — confirmed live on a
  cold reload (no manual resize needed) that "Exceptional" now correctly starts hidden from its
  own segment and appears only in the legend.

**2. Collapsed and expanded width are now two different rules**, not one shared scale.
`LevelBreakdownBar` no longer takes a `widthPercent` prop at all — it used to be scaled to match
the criterion's collapsed row-bar width (for cross-section correlation), which made low-weight
criteria's (e.g. Performance, 10%) expanded detail cramped exactly where a curious user asked
for more room. The collapsed row bar (`CriterionDetailRow`, unchanged) still scales to the
criterion's own weight relative to the top criterion — correlation still matters there. Once
expanded, every criterion's breakdown now gets the full available width regardless of rank,
confirmed live: Production (14%) and Performance (10%) both render their expanded breakdowns at
the same full width as Emotional impact's (28%), despite very different collapsed bar lengths.

**Implementation note:** `LevelBreakdownBar` now only mounts while its accordion item is
actually open — the accordion's `value` was lifted to controlled state in `ResultsSpike` so
`CriterionDetailRow` can gate rendering on `isOpen`, rather than relying on Ark's own
collapse-animation to hide a permanently-mounted panel (which can hand the fit-measurement
effect a hidden, zero-width container on first mount).

## Correction: BarSegment → BarList for Section 3, one absolute page-wide scale (2026-09-12, same day)

Structural replacement, not another threshold tweak. Section 3 (per-criterion level breakdown)
no longer uses `BarSegment` at all — every level is its own independent row (label column, bar,
value column), never a segment sharing a container with other levels. Section 2 (taste
fingerprint) is unchanged, still `BarSegment`, per instruction (it's a composition/whole, not a
list). This eliminates three separate problems fought earlier the same day as one structural
class, not three patches:

- **Illegible tiny segments** (the `<0.5%` render-threshold/legend saga): gone, because there is
  no segment to be illegible — a level's own row is never divided among other levels.
- **Truncated long names** ("Exceptional", "Some fresh ideas"): gone, because the label sits in
  its own fixed-width column BEFORE the bar, never inside or constrained by the bar's own
  rendered width. Confirmed live: "Exceptional" (Production, 1%) and "Some fresh ideas"
  (Innovation, 3%) both render in full now, at the same absolutePercent values that broke under
  `BarSegment` earlier the same day.
- **The collapsed/expanded scale mismatch**: dropped, not bridged. The brief's own instruction
  was to drop the "zoom-connector" idea entirely rather than build one — collapsed criterion
  rows and level rows now share one `LABEL_COLUMN_WIDTH`/`VALUE_COLUMN_WIDTH`/track-width layout
  and the same literal `width: {percent}%` rule, so a level's bar and its own criterion's
  collapsed bar are already on the same physical scale with no transition needed.

**`RENDER_THRESHOLD_PERCENT` and the whole legend/DOM-fit-measurement apparatus (refs,
`useLayoutEffect`, resize listener, `overflowingLabels` state) are gone**, confirmed live to be
unnecessary under BarList's row-per-level layout: a label's own column is never sized by its
value, so nothing to measure. Only `PRECISION_THRESHOLD_PERCENT` (`<0.5%` truncation) and the
literal-`0%` special case survive from the earlier passes — both are about the displayed
*number*, not layout, and still apply.

**Real `BarList.Bar` tried live first, not assumed — and not used.** A throwaway smoke test
(`useChart` loaded with only Emotional impact's 5 real levels) showed two things directly on
screen:
- `BarListBar`'s width math is `value / max(THIS chart's own data) * 100` — a per-instance
  domain. With only one criterion's levels loaded, "Powerful" (its own highest level, 11%)
  rendered at 100% width and everything else scaled relative to that 11%, not to any page-wide
  reference. That's exactly the kind of per-criterion-relative scale the brief is moving away
  from, and there's no prop to override it — achieving a fixed `[0,100]` domain would need a
  same-value sentinel row baked into `chart.data`, which `BarListBar` would then also render as
  a real (unwanted) list row, since it iterates `chart.data` unconditionally. Bypassing that
  means not really using `BarListBar`'s own rendering at all.
- Its color prop is read via `chart.getSeries({name: "name"})` — so a working `series` config is
  `[{name: "name", color: ...}]`. The seemingly-obvious `[{name: "value", color: ...}]` (matching
  the field actually being plotted) silently renders every bar with no color at all, confirmed
  live before finding the working shape. Noted here in case a future pass reconsiders it.

Net: hand-rolled rows, not the library's own `<BarList.Bar/>`, deliver the brief's "one row per
level" structure with full control over the shared absolute scale.

**Scope call flagged, not silently decided: the fingerprint (Section 2) is NOT on the same
literal pixel scale as the collapsed-row/level-row track.** The brief's wording lists fingerprint
segments alongside collapsed rows and level bars under "one absolute scale." Doing that literally
would mean either shrinking the fingerprint to a sliver (its 100%-stacked width would have to
equal `trackWidth × 28/100`, since 28% — Emotional impact — is the tallest real bar elsewhere) or
stretching every row's track out to ~3.6× the page width to match the fingerprint's own full
bleed. Neither reads as an improvement over the fingerprint's current already-correct absolute
scale (segment width = its own real percent of the full composition). This pass scopes the
shared scale to the two row types that actually conflicted this session — collapsed criterion
rows and per-level rows — and leaves the fingerprint's own full-bleed presentation alone. Flagging
for confirmation rather than assuming it's what was meant.

## Label-overlay pass (2026-09-12, same day)

Follow-up to a reference screenshot the user shared (a "traffic sources"-style bar list — label
overlaid directly on the bar, spilling onto plain background when the bar is short, value pinned
far right). Explicit instruction: adopt the LAYOUT idea, not the reference's own colors. Applied
to both `LevelRow` and `CriterionDetailRow`'s collapsed trigger (not just levels) — doing it for
levels only would have reclaimed the old label column's width back into the level row's own
track while leaving the collapsed row's track narrower, silently breaking the absolute-scale
invariant from the previous pass. Scope call made and flagged here, not asked about, since it
followed directly from a constraint already established this session.

**Contrast problem, solved without leaving this app's tokens.** The reference's dark bar fill
lets one light text color work everywhere; this app's `ink.300` fill (kept, per instruction) is
light, so plain light text over it would wash out. Solved by rendering the label TWICE, stacked
exactly on top of itself at identical font/size/padding: a light copy (`text.primary`) across the
full row, and a dark copy (`ink.950`) clipped to the bar's own width via `overflow="hidden"` on a
same-width wrapper. The dark copy occludes the light one wherever the bar exists; the light copy
alone shows through past the bar's edge — no gradient/mix-blend trick, no per-row conditional
logic, just two ordinary stacked elements.

**Confirmed live**, not just visually plausible: a label fully contained within its own bar
("Emotional impact", 28%, entirely dark text, legible), several straddling the bar's edge mid-word
("Performance", "Coherence" — clean handoff at the boundary, no doubled or blurred text), and the
0%/3px-floor minimum ("Flat", "Uninspired" — almost entirely the light copy, matching the
reference's own "Yahoo" row). No console errors, no page overflow at any expanded state.

## Correction: bar height/font size, exact value-column alignment, fingerprint legend (2026-09-13)

Three separate accessibility/legibility fixes, same day as the label-overlay pass:

- **Bar height and font size raised.** Criterion rows now use `40px` — matching
  `@chakra-ui/charts`' own default `barSize="10"` (confirmed by reading `useChart`'s `size()`
  helper: it resolves `sizes.10`, the same 2.5rem token Chakra's bar components default to), which
  also gives the accordion trigger button a comfortable touch target. Level rows are a deliberate
  step down at `28px` (still well above the original `20px`) so the row hierarchy — one criterion,
  several levels under it — still reads from height alone, not just position. Font sizes moved
  from a flat `xs` everywhere to `md` (criterion) / `sm` (levels).
- **Level percentages now align under their criterion's, to the pixel — measured, not eyeballed.**
  The two rows aren't in identical DOM contexts: the criterion row's value text is a sibling of
  the accordion's own expand chevron (see `accordion.tsx`), which reserves real width after it;
  a level row has nothing there. Left alone this pushed the criterion's value column ~4.8px left
  of the level rows'. Fixed with a measured trailing padding (`CHEVRON_RESERVE`) on the level
  list, tuned against a live `getBoundingClientRect()` comparison rather than guessed — confirmed
  live afterwards: criterion value and every one of its levels' values land at the exact same
  `right` pixel (774.8046875 in the verification pass).
- **Fingerprint legend added for criteria without room for an on-segment name.** Every criterion
  under `FINGERPRINT_INLINE_LABEL_MIN_PERCENT` (20%) already showed its percent below its segment
  but no name anywhere near it — nothing tying the number back to which criterion it belonged to
  except column position. Added a compact swatch+name legend row, restricted to exactly the
  criteria that didn't get an inline name (Songwriting/Production/Performance/Innovation in the
  spike's data) so already-labeled criteria aren't repeated.

Confirmed live: no console errors, no page overflow, "Exceptional" (Production, 1%) still renders
in full at the larger font size.

## Hover state added (2026-09-13, same day)

`BarSegmentBar`/`BarListBar` both ship a hover affordance by default (`_hover: {bg:
'bg.subtle'}` for BarList rows; highlighted-series opacity for BarSegment) — our hand-rolled rows
had none. Added a full-row background highlight on both row types, reusing
`surface.criterionHover` (`ink.900`) rather than inventing a new hover color — that token already
exists in `theme.ts` specifically for "hovering a criterion row" (see its own comment there), so
it's a semantic match, not just a convenient value. `CriterionDetailRow`'s trigger previously
force-disabled Chakra's own Accordion hover (`_hover: {bg: 'transparent'}`, added earlier this
session to stop it fighting the label-overlay bars) — replaced with the real intended hover
instead of just suppressing it. `LevelRow` gained the same treatment via a small
`px={2} mx={-2}` bleed so the highlight doesn't look clipped flush against the label's edge.
Confirmed live on both a collapsed criterion row and an expanded level row — highlight renders
correctly behind the bar/label-overlay text with no visual conflict, no console errors, no
overflow.

## Edge-case pass (2026-09-13)

Ran the built spike against two synthetic datasets beyond the canonical example (temporarily
swapped into `CRITERIA`, verified live, then restored to the exact original — confirmed via a
line-by-line re-read after restoring, not just assumed). No code changes this pass — findings
only, per the request.

**Dataset A — near-flat weights** (17/17/17/17/16/16), one 3-level criterion (Songwriting: Weak/
Good/Outstanding only), one pending/null criterion (Coherence) retained for regression:

- **Case 1 — narrative sentence, real finding, not fixed here.** With four criteria tied at 17%,
  the sentence ("you lean hardest into emotional impact and coherence") picks literally
  `CRITERIA[0]`/`[1]` — array order, not a real distinction. It reads as if those two are clearly
  ahead of the rest; they aren't. **No tie-breaking or tie-aware copy exists today.** Needs a
  product decision before the real build (e.g. "you lean hardest into X, Y, and four others
  within a point of them," or naming ties explicitly) — not something to silently paper over.
- **Case 3 — 3-level criterion.** Confirmed live: Songwriting's breakdown renders exactly 3 rows
  (Weak 0%, Good 9%, Outstanding 8%) with correct proportional bar widths and no layout artifact.
  The layout never assumed 5 levels; `criterion.levels.map(...)` was always level-count-agnostic.
- **Case 4 — all 6 accordions expanded at once, the never-reviewed state.** Confirmed live,
  scrolled through the full page: no layout breakage, no overflow (`scrollWidth === clientWidth`
  throughout), value-column alignment holds down every row including the 3-level one, Coherence's
  pending note renders correctly alongside five real breakdowns open at the same time.
  (Mechanical note: driving this required dispatching each accordion click with a delay between
  them — firing all six synchronously via native `.click()` calls hit a stale-closure batching
  issue where every handler read the same pre-click `openValues`, so only the last click's toggle
  survived. That's a test-automation artifact of firing synthetic clicks faster than React can
  re-render between them, not a bug in the page itself — a real user clicking six times has a
  render in between each and would not hit this.)
- **Case 5 — legend swatch contrast, confirmed quantitatively, not eyeballed.** Computed WCAG
  contrast ratios for the `EMBER_GRADIENT` swatches against `surface.page`
  (`#0c0c0c`): 500→6.83, 600→5.13, 700→3.58, 800→2.58, **900→1.95, 950→1.33**. With near-flat
  weights, ALL SIX criteria land in the fingerprint legend, including the two darkest — and
  `ember.900`/`ember.950` both fall far under WCAG's 3:1 minimum for non-text graphical UI
  (SC 1.4.11), with `950` nearly invisible against the page background. **Real, confirmed
  accessibility gap** in the legend-swatch treatment specifically (the fingerprint SEGMENTS
  themselves aren't affected — they're large filled areas read by shape/position, not tiny
  swatches read by color alone). Needs a fix before the real build: options include a border ring
  on dark swatches, a lighter/desaturated swatch-only color distinct from the segment's own
  gradient color, or dropping color-matching from the legend entirely (name + percent only, no
  swatch).

**Dataset B — one dominant criterion (45%) vs. five small ones** (15/12/10/10/8):

- **Case 2 — both extremes on one screen.** Expanded Emotional impact (45%) and Innovation (8%)
  simultaneously, confirmed live in one scrolled view: Emotional impact's widest level bar
  ("Powerful," 15% absolute) renders long but never encroaches on the value column (levels' own
  values are always ≤ their criterion's weight, never close to 100%); Innovation's tiny bars
  (2-3.2%) remain legible via the label-overlay technique with no cramping next to the much taller
  criterion above. Fingerprint correctly gives Emotional impact (45%, above the 20% cutoff) an
  inline name while the other five fall to the legend. No issues found.

**Net:** two real, confirmed-not-guessed findings to resolve before the real implementation —
the narrative sentence's tie-handling (case 1) and the legend swatch contrast at the dark end of
the gradient (case 5). Everything else checked (3-level criteria, all-expanded state, extreme
weight spread) held up with no changes needed.

## Real implementation (2026-09-13)

Ships the tab against real solved data, on the final consolidated brief (naming: "Your Taste"
tab, "Fingerprint" section header; tie-aware narrative copy per the near-flat-weights finding
above; the legend swatch contrast fix; the always-show-the-0%-baseline correction above). That
consolidated brief lives in Project Knowledge, per this doc's own header note — this section
records what the real build did with it, not a copy of the brief itself.

Two loose ends from the spike passes above turned out to be spike artifacts rather than real
gaps once wired to the live model, resolved structurally rather than answered directly:

- **Per-level data for criteria never confirmed during discovery (Coherence/Versatility)** —
  moot: every criterion's per-level breakdown now comes straight from `solvedValues` (the same
  `LevelValue[][]` `CriteriaCalibrationPage.tsx` already computes via `computeCommitState`),
  never authored mockup numbers. No criterion needs a "pending verification" placeholder state
  in production the way `levels: null` stood in for it during the spike.
- **Which component the level rows use** — `BarSegment` (fingerprint, Section 2) / hand-rolled
  one-row-per-level markup (Section 3), per the "Correction: BarSegment → BarList for Section 3"
  pass above. Confirmed before building that this really was live-tried-and-rejected, not a
  silent substitution: that pass's own "Real `BarList.Bar` tried live first" paragraph is the
  record of it (per-instance `value / max(this chart's own data)` domain, incompatible with the
  page's one-absolute-scale requirement; no override prop; the sentinel-row workaround would
  itself render as an unwanted visible row).

**Overlay-label accessibility, fixed.** The decorative (bar-clipped, dark-copy) half of the
double-copy label technique from the "Label-overlay pass" section above now carries
`aria-hidden="true"`, so a screen reader announces each level name once, not twice. The
`RENDER_THRESHOLD_PERCENT`/DOM-measurement fit-check apparatus from the earlier BarSegment-era
passes was never carried into production code (it was superseded by the BarList correction
before any of this shipped) — nothing to remove beyond deleting the spike file itself.

**Formatting: criterion weight and its level percentages share one function.** Both
`weightPercent` (a criterion's own top-line figure) and every one of its level increments are
formatted by the same `formatLevelPercent` (`resultsBreakdown.ts`), derived from the same
unrounded solved values — never rounded to a whole number, never a separately-derived numeric
format. Because of that, displayed level percentages sum exactly to the displayed criterion
weight (e.g. `9.7 + 7.6 + 3.8 + 1.7 = 22.8`) with no rounding drift to explain away — a real,
verifiable property of the page, not an approximation.

**Gate simplified to one empty state.** `ResultsTab.tsx` used to distinguish "zero answers" from
"some answers, not enough" with two different copy variants under a `hasWeights` prop
(`answers.length > 0`). The real gate is `tier !== 'none'` (degree 2 exhausted) — a value
`CriteriaCalibrationPage.tsx` already computes — and everything below that gate now shows the
brief's single "Nothing's taken shape yet." / "Keep comparing and it'll start to show up here."
state, regardless of how many answers have been logged. Confirmed via the freeze-checkpoint
suite: a session frozen at degree 2 with 78 real answers logged still reads `tier === 'none'`
(freeze means degree 2 was never actually marked exhausted), so it now correctly shows the empty
state rather than the old "coming soon" copy that `hasWeights` alone used to unlock on its own.

**What shipped:** `src/lib/criteria-calibration/resultsBreakdown.ts` (data derivation:
`CriterionBreakdown`, `formatLevelPercent`, leader/tie detection),
`src/lib/criteria-calibration/resultsNarrative.ts` (the four sentence templates),
`YourTasteFingerprint.tsx` and `YourTasteCriterionDetail.tsx` (Sections 2 and 3), a rewritten
`ResultsTab.tsx` (gate + Section 1 + composition), the tab label change (`Results` → `Your
Taste`, internal `?step=results` id unchanged), and `YourTasteTab.test.tsx` — an enforced
regression suite reproducing every edge case the spike checked manually live (tie-handling at
1/2/3/4+ leaders, the 0%/exactly-0.5%/under-0.5% formatting boundaries, long unclipped names,
all-criteria-expanded, the aria-hidden fix). Ark UI's accordion defers its open/close commit to
a CSS-animation step jsdom never completes, so the per-level tests drive
`YourTasteCriterionDetail`'s `openValues` directly rather than simulating a trigger click.

`ResultsSpike.tsx` and its `/results-spike` route are deleted — same end-of-lifecycle as the
`/radar-spike` precedent it was modeled on.

Verified: `tsc --noEmit` clean, `npm run lint` clean on every touched/added file, 358/358 tests
(`npx vitest run`). No live Supabase-backed browser pass was practical from this session —
verifying the real gate needs a degree-2-exhausted account, and per this project's QA
convention Dan logs into any test account himself (no stored credentials).
