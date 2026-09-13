# Mobile layout: Guide tab carousel + Calibration tab action rail

## Source

Dan's brief: two mobile-only layout problems on `/calibration`.

1. Guide tab: the criterion carousel's gutter Prev/Next buttons cost more width on a narrow
   viewport than the card gets back, leaving the card narrower than its content needs.
2. Calibration tab: `ActionRail` (undo/redo/reset) occupies the grid's whole `auto`-width left
   column beside the comparison cards — proportionally expensive on mobile.

A third idea — de-emphasizing criteria that don't differ between the two alternatives being
compared — was explored and shelved before this pass started: the assumption it depended on
(early rounds vary only one criterion at a time) doesn't hold consistently across rounds, and the
fix was heading toward more complexity than justified. Not part of this doc's scope; revisit only
if mobile comparison friction turns out to be a real, confirmed problem.

Desktop had to stay pixel-identical in both cases — both are additive, mobile-scoped changes.

## What shipped

### Guide tab — pagination dots, not inline chevrons

First pass put small chevrons + a `CarouselProgressText` "N / M" counter inline with each card's
title (`CriteriaCarousel.tsx`, gated by a new `inlineControls` prop, wired only on `GuideTab.tsx`'s
mobile `slidesPerPage={1}` instance). Verified live and working — but Dan's mid-implementation
correction replaced this with the eventual shape: a row of **six tappable pagination dots**
below the title/description, above the "LEVELS" section, and the card header reverted to a plain
title + description block (no inline nav row).

The dots use `CarouselIndicator` (already exported unstyled from `ui/carousel.tsx` as
`Carousel.Indicator`) rather than a hand-rolled click handler: it already wires `onClick` to jump
straight to that page (zag's `PAGE.SET`, not sequential prev/next) and stamps `data-current` on
the active one, styled via `&[data-current]`. Square, not round — this app's `radii.full` token is
`0px` throughout (see `design-tokens.md`), so a "dot" here is a small square tick, same visual
language as every other indicator in the app, not an exception to it.

`CarouselIndicator`'s own built-in `aria-label` is a generic "Item N" translation with no
criterion name in it, so each dot gets an explicit override —
`` `Go to ${entry.name}, ${entry.index + 1} of ${catalog.entries.length}` `` — matching the same
reasoning that drove explicit `aria-label`s on the (now-removed) chevrons: an icon/dot-only
control needs an accessible name, not just a visual mark.

Swipe-drag between cards needed no new code in either pass: `CarouselItemGroupStyled`'s
`overflowX: auto` + `scrollSnapType: x mandatory` (`ui/carousel.tsx`) already makes the item group
a native touch-scrollable container.

Desktop (`slidesPerPage={3}`, `inlineControls` omitted) is untouched — same gutter
`CarouselPrevButton`/`CarouselNextButton` layout as before this pass.

### Calibration tab — horizontal action row on mobile

`ActionRail.tsx`'s button stack changed from `<VStack gap={2} align="flex-start">` to
`<Stack direction={{ base: 'row', md: 'column' }} gap={2} align="flex-start">` — one tree,
CSS-only responsive `direction`, the same technique as `CalibrationPageHeader.tsx`'s badge-
stacking fix (see that file). `ActionRail` has exactly one call site
(`CriteriaCalibrationPage.tsx`), so making the stack responsive by default rather than adding an
`orientation` prop was safe. Tooltip `placement="right"` was left fixed for both orientations —
the existing rationale (avoid covering the next button in the vertical stack) is a
desktop-specific concern, and hover tooltips are a secondary, non-blocking affordance on touch
devices anyway.

`CriteriaCalibrationPage.tsx`'s two-column grid (title / rail / cards, `auto 1fr`, documented
2026-09-12 design review) converted from per-`Box` `gridColumn`/`gridRow` pairs to responsive
named `gridTemplateAreas`:

```
gridTemplateColumns={{ base: '1fr', md: 'auto 1fr' }}
gridTemplateAreas={{
  base: `"title" "rail" "cards"`,
  md: `". title" "rail cards"`,
}}
```

`md` reproduces the exact pre-existing desktop layout (title alone in row 1 of the card column,
rail and cards sharing row 2). `base` stacks title → rail → cards in one column, which turns
`ActionRail`'s own responsive `direction` into a horizontal row above the comparison cards. Title
`Box`'s `my` margin is `{ base: 6, md: 8 }` — slightly tighter on mobile since the title no longer
shares a row with the cards (full 32px both sides plus the grid's `rowGap` would over-stack).

## Verification

- `npm run type-check`: clean.
- `npx eslint` on all four changed files: zero new findings (two pre-existing
  `react-hooks/set-state-in-effect` errors in `CriteriaCalibrationPage.tsx`, unrelated lines, not
  touched by this change).
- `npx vitest run`: 358/358 — no test asserts on carousel DOM shape, grid `gridColumn`/`gridRow`,
  or `ActionRail`'s stack orientation, so nothing needed updating.
- Live browser pass on Dan's real 76-round account (not a QA account — read-only interactions
  only: no Undo/Redo/Restart clicks, no answer submissions), both viewports:
  - Guide tab, mobile (375px): full-width card, six dots render with correct `aria-label`s
    (confirmed via accessibility tree, not just visually), tapping a non-adjacent dot (4th,
    "Coherence") jumps directly rather than paging sequentially, correct dot re-fills.
  - Guide tab, desktop (1280px): unchanged 3-per-page carousel with gutter arrows, no dots, no
    header change.
  - Calibration tab, mobile: Undo/Redo/Restart render as a horizontal row above the comparison
    cards, confirmed via accessibility tree ordering.
  - Calibration tab, desktop (900px): unchanged vertical rail beside the cards.
- One transient console error (`CarouselIndicator is not defined`) appeared once, immediately
  after the file first added the `CarouselIndicator` import — a stale Vite dependency
  pre-bundle from before the new import was discovered, not a real bug. Confirmed by a hard
  reload producing no new occurrence and every subsequent live check (including page reloads)
  rendering and functioning correctly.

## Also this session

Committed a separate, unrelated, previously-stalled design-review pass (four files:
`CalibrationPageHeader.tsx` mobile badge stacking, `ResultsTab.tsx` spacing,
`YourTasteCriterionDetail.tsx` hover contrast, `YourTasteFingerprint.tsx` hover tooltip) that was
sitting uncommitted at session start — confirmed with Dan it was finished work that stalled
before merging, not deliberately held back. Committed on its own, ahead of this change, not
described further here.

## Not in this doc

- Your Taste tab: no change. Reviewed and confirmed fine as-is on mobile per the brief, including
  the tier badge appearing in both the persistent header and the page content (Section 1) —
  intentional, different roles (global status vs. the narrative's required physical separation
  from its confidence figure), not a duplication bug.
