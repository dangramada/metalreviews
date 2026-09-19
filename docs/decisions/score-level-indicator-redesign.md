# Score level indicator redesign — segmented bar + icon-button calibration action

Refines the "Score level: {tier}" row shipped flat (same weight at every tier) in
`criteria-calibration-terminology-and-gate-unification` (merged 2026-09-18). That version paired
the label with a plain text link ("Go to calibration"); this pass replaces the link with a
4-segment progress bar plus a ghost `IconButton`, per a Figma mockup (RANK/SCORE slabs, "SCORE
LEVEL: UNFOCUSED" with a 4-segment bar and a boxed Sliders icon).

## What changed

`RatingProgressBox.tsx`'s final-state block only (unchanged during `isPending`):

- **Row 1** (unchanged text, new action): `Score level: {label}` on the left; the calibration
  action, now a `Tooltip` + `IconButton` (`variant="ghost"`, `size="sm"`) instead of a text
  `Link`, on the right. Same row, `4px` gap to Row 2 below it.
- **Row 2** (new): a 4-segment bar, `Flex gap="4px"`, `aria-hidden` (purely decorative — the
  text label already carries the same information for screen readers). Each segment `27px ×
  6px` — `120px` total width including the three `4px` gaps, per Figma:
  `(120 - 3×4) / 4 = 27px`. Fill count maps directly to `confidenceTier`, no new prop:
  `none`→1, `medium`→2, `high`→3, `very_high`→4. Filled = `accent.border` (ember.500,
  `#ff6a1a`); empty = `ink.700` — the same track token the themed `ProgressBar` recipe already
  uses (`theme.ts`'s Progress slot recipe, 2026-09-12), not a new gray value.
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

## Rejected directions (carried from the brief, not rebuilt)

- **Custom bordered icon box** (hand-picked `#ff6a1a` border, one-off `12px` box) — this
  brief's own earlier draft, based on a rough reading of the Figma screenshot's visual weight.
  Superseded by reusing the existing ghost `IconButton` pattern already used for
  Evaluate/Listen/Remove in `FavoritesPage.tsx` (desktop) — same "icon action inside a card"
  context, no invented style.
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

- The label text/tokens/logic (`confidenceLabel(confidenceTier)`) is unchanged from the shipped
  flat version — don't introduce new font-size/color values for it.
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

54/54 files, 429/429 tests, `tsc` and `eslint` clean on the `score-level-indicator-redesign`
branch (branched from `master`).

**Not live-verified in-browser** — reaching the final Score/Rank state on `/rate/:albumId`
needs a logged-in account, and per this project's QA-account convention (no stored credentials;
see `docs/decisions/branch-log.md`'s account-identity note) Dan logs in himself rather than
Claude driving auth. The `6px` segment height is carried from an earlier mockup per the brief's
own caveat ("verify, don't assume it carried over") — not independently confirmed against
Figma in this session (no Figma connector authorization available). Both should be checked
against the real account/file before merge.
