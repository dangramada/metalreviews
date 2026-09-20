# Score level indicator redesign — segmented bar + icon-button calibration action

Refines the "Score level: {tier}" row shipped flat (same weight at every tier) in
`criteria-calibration-terminology-and-gate-unification` (merged 2026-09-18). That version paired
the label with a plain text link ("Go to calibration"); this pass replaces the link with a
4-segment progress bar plus a ghost `IconButton`, per a Figma mockup (RANK/SCORE slabs, "SCORE
LEVEL: UNFOCUSED" with a 4-segment bar and a boxed Sliders icon).

## What changed

`RatingProgressBox.tsx`'s final-state block only (unchanged during `isPending`):

- **Layout** (corrected live against the first pass — see "Live corrections" below): a single
  `Flex align="center" justify="space-between" gap="40px"`, not the brief's original two
  same-width rows. Left side is one `VStack` (label, then the segment bar, `6px` gap between
  them); right side is the calibration `IconButton`, vertically centered against that whole
  block via the parent `Flex`'s `align="center"` — not pinned to the label's row alone.
- **Label**: `Score level: ` stays `text.muted` (sand.500, unchanged from the shipped flat
  version); the tier value (`Unfocused`/`Blurry`/`Clear`/`Sharp`) is `text.primary` (sand.200)
  as a nested `<Text as="span">` — two-tone, not the single uniform color the first pass
  shipped with.
- **Segment bar**: 4 segments, `Flex gap="4px"`, `aria-hidden` (purely decorative — the text
  label already carries the same information for screen readers). Each segment `27px × 6px` —
  `120px` total width including the three `4px` gaps, per Figma: `(120 - 3×4) / 4 = 27px`. Fill
  count maps directly to `confidenceTier`, no new prop: `none`→1, `medium`→2, `high`→3,
  `very_high`→4. Filled = `accent.border` (ember.500, `#ff6a1a`); empty = `ink.700` — the same
  track token the themed `ProgressBar` recipe already uses (`theme.ts`'s Progress slot recipe,
  2026-09-12), not a new gray value.
- **Calibration action**: `Tooltip` + `IconButton`, `size="sm"`, `variant="outline"`,
  `colorPalette="gray"` — corrected live from an initial `variant="ghost"` guess, which read as
  too subtle/borderless against the Figma mockup's boxed appearance once actually seen
  side-by-side in the browser. `p="12px"` on the button itself, matching the brief's literal
  "12px padding on all four sides" spec, which the first pass had dropped entirely in favor of
  Chakra's default `IconButton` sizing.
- **Icon button color**: `accent.text` (ember.300) for `none`/`medium`/`high`, `text.muted`
  (sand.500) only at `very_high` ("Sharp") — a single condition
  (`confidenceTier === 'very_high'`), not a 4-step decay. Same size/shape at every tier; only
  the icon color changes. Signals "nothing meaningful left to gain" at the ceiling, vs.
  "still accent, still worth doing" everywhere else.
- **Icon**: `LuSlidersVertical` (`react-icons/lu`) — Dan's explicit choice over
  `LuSlidersHorizontal`, which is the closer visual match to the app's old retired `FaSlidersH`
  (Rate-era). No plain `LuSliders` export exists in this version of `react-icons`.
- **Tooltip**: hover-only via the existing `src/components/ui/tooltip.tsx` wrapper — never
  shown by default. `aria-label="Go to calibration"` is present in every state regardless of
  hover; that's an accessibility floor, not the same thing as pre-emptive visibility.
- **Outer inset**: the whole row gets `px="12px" pb="12px" pt="4px"`, not a flat `p="12px"` —
  the parent `VStack`'s existing `gap={2}` (8px) already separates this section from the
  RANK/SCORE slabs above it, so `8 + 4 = 12px`, matching the other three sides. A first attempt
  at flat `p="12px"` stacked on top of that 8px gap, making the top inset visibly larger than
  the sides (caught live from a screenshot, not by re-deriving the Figma spec).
- **Chart gap**: `DesktopRatingLayout.tsx`'s Section-3 `VStack` (`RatingProgressBox` +
  `RatingRadarChart`) changed from `gap={4}` to `gap={0}` — nothing separates the score-level
  block from the chart below it; that section's own `pb="12px"` already supplies the visual
  gap. This also removes the gap in the `isPending` progress-slab state, which has no
  equivalent bottom padding of its own — flagged, not yet independently confirmed as
  acceptable there (only the final state was under live review).

## Live corrections (screenshot review, not caught by re-reading the brief)

The first implementation pass shipped with several deviations from the brief that only surfaced
once Dan compared the running page against the Figma screenshot directly:

1. Button padding (`12px` on all sides) was dropped entirely — Chakra's `size="sm"` default box
   was used instead of the literal measurement.
2. `variant="ghost"` was chosen over `variant="outline"` by over-weighting the brief's own
   hedged "closest precedent, confirm" language as a settled answer.
3. The label was one uniform color instead of two-tone (prefix vs. tier value) — missed by not
   inspecting the screenshot closely enough.
4. The outer 12px inset, once added, stacked with the parent `VStack`'s existing 8px gap on the
   top edge only, producing a visibly uneven inset.
5. Label-to-segment-bar gap went through three values before landing: the brief's `4px`, a
   first correction to `2px` (guessed too small), and the confirmed final `6px`.
6. The RatingProgressBox-to-chart gap (a `DesktopRatingLayout.tsx` concern, outside
   `RatingProgressBox.tsx` itself) wasn't part of the original brief at all — added after live
   review found visible space between the redesigned block and the chart below it.

None of these needed a new Figma read to catch — they were visible in a plain screenshot
comparison. The lesson carried into future passes on this component: check the rendered
output against the mockup pixel-by-pixel before calling a pass done, not just against the
brief's prose.

## Rejected directions (carried from the brief, not rebuilt)

- **Custom bordered icon box** (hand-picked `#ff6a1a` border, one-off `12px` box) — this
  brief's own earlier draft, based on a rough reading of the Figma screenshot's visual weight.
  The first implementation pass instead reused the existing ghost `IconButton` pattern from
  `FavoritesPage.tsx` (desktop Evaluate/Listen/Remove); live screenshot review then corrected
  that to `variant="outline"`, `colorPalette="gray"` — still not a hand-picked border color,
  just a different existing Chakra recipe than the first guess.
- **4 distinct button treatments (pill → label+icon → icon → icon), one per tier** — superseded
  by the simpler single-button-with-one-exception color rule above, once a real Figma mockup
  existed to react to.
- **Tooltip visible by default until first hover** — an icon-in-a-box + hover tooltip is an
  established enough pattern not to need training-wheel visibility; a tooltip that disappears
  on its own (not from a user action) reads as a glitch, not guidance. The segment bar already
  communicates urgency permanently — the tooltip's only job is naming the destination.
- **Overlay/blur on the radar chart**, **making the "Score level" label itself the click
  target** — both rejected earlier in `criteria-calibration-terminology-and-gate-unification`;
  not revisited here.

## What NOT to change

- The label's font-family/size/weight/letter-spacing and its underlying logic
  (`confidenceLabel(confidenceTier)`) are unchanged from the shipped flat version. Only its
  color is now two-tone (`text.muted` prefix, `text.primary` tier value) — don't introduce
  further new color/size values beyond that split.
- The segment bar is purely presentational on top of `confidenceTier`, already available in
  this component — no new backend signal, no `hasWeights`/`tier` gating change. It still only
  renders in the final state, never during `isPending`.
- Empty-segment color is `ink.700` specifically because it's the same token the themed
  `ProgressBar` track already uses — don't reach for a different gray if this component's
  surroundings change later; re-check `ProgressBar`'s track token first.

## Tests

`RatingProgressBox.test.tsx` (new — this component had no dedicated test file before): renders
the component directly with `confidenceTier` as a prop (no Supabase/gate mocking needed, unlike
`FavoritesPage.test.tsx`'s heavier stub setup — this component doesn't call
`useCalibrationGate` itself). Covers the segment-count mapping for all four tiers via
`data-testid`/`data-filled` attributes, the icon mute at `very_high` only, and that the
accessible label is always present.

## Status

54/54 files, 429/429 tests, `tsc` clean on `master` post-merge; `eslint` clean on the files this
work touches (pre-existing `prettier/prettier` findings elsewhere in `DesktopRatingLayout.tsx`,
unrelated lines, predate this branch — confirmed by diffing against the branch point before this
work).

Dan logged into his own account (per this project's QA-account convention; Claude never handles
credentials) and screenshotted the rendered final Score/Rank state on `/rate/:albumId` twice:
once against the first implementation pass, driving all six corrections in "Live corrections"
above, and again after those corrections landed, confirming the result works as implemented.
The `isPending` progress-slab state's now-zero gap to the chart (a side effect of the
`DesktopRatingLayout.tsx` change) was not separately called out as checked. The `6px` segment
height is carried from an earlier mockup per the brief's own caveat ("verify, don't assume it
carried over") — still not independently confirmed against the Figma file itself (no Figma
connector authorization available this session).

Merged to `master` `--no-ff` at `698bb86` on 2026-09-20. Rollback tag:
`pre-merge-score-level-indicator-redesign`.
