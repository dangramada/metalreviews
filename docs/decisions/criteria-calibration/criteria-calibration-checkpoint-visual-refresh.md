# Criteria Calibration — checkpoint screen visual refresh

## Source

Dan flagged a screenshot of the "You've compared everything at this level" checkpoint (2026-09-15,
right after `criteria-calibration-page-redesign` merged) and asked for it to be brought in line
with the calibration content pass — specifically the title's typeface, and spacing. Given latitude
("as you consider") on the exact values.

## What shipped

`src/components/criteria-calibration/CalibrationCheckpoint.tsx`, three changes, no copy or logic
touched.

### 1. Title: Clash Display → Inter

The headline was rendered `<Heading fontFamily="heading" size="md">` — Clash Display, the app's
display face. This was the **one title left** on the whole Criteria Calibration surface still
using it: `naming-decisions.md` reserves Clash Display for the wordmark and the score-slab number
only, and every other title in this feature (`QuestionPrompt`, the Guide card's `cardTitleBand`
heading) had already moved to Inter during the page-redesign content pass. This checkpoint screen
predates that pass and was simply never revisited, so the fix is bringing the last holdout in line
with a rule the rest of the feature already follows, not introducing a new one.

Only the font family changed — `fontFamily="body"` in place of `"heading"`, same `size="md"`, same
weight and colour. Measured before/after at `/style-guide`'s new "Calibration Checkpoint" section:
16px / 600 weight in both cases, family switches from `"Clash Display", sans-serif` to
`Inter, sans-serif`.

Not moved to the `cardTitle` text style used elsewhere (`QuestionPrompt`, `WorkStatusRow`): that
style is 18px/500, sized for a per-round prompt. A checkpoint is a bigger moment — the one screen
in the whole flow announcing a degree boundary — and 16px/600 (Chakra's own Heading `size="md"`)
reads as more of an event without inventing a new scale just for this.

### 2. Buttons: hardcoded `orange` → the app's own tokens

Both action buttons spelled out `colorPalette="orange"` (Chakra's built-in ramp) and
`colorPalette="gray"` directly, rather than the exported `primaryButton`/`secondaryButton` configs
every other calibration surface already uses (`EqualButton`, `GuideTab`'s CTA, `ResultsTab`).

**Correction (2026-09-16):** this was originally written up as a pure token-discipline change with
no visual effect, on the claim that the rendered colour measured the same before and after. That
measurement was only taken _after_ the change — the before state was never actually checked. It
should have been: Chakra's stock `orange.500` is `#f97316`; the app's `ember.500`, which
`primaryButton` resolves to, is `#ff6a1a`. Close, but a real difference (`+6R -9G +4B`), not the
identical colour originally reported. So this button's fill did shift slightly, and the fix is
better than described — it silently corrected a small colour mismatch, not just future-proofed
against one. Everything else about the change stands: `{...primaryButton}` (Continue, Done) and
`{...secondaryButton} variant="outline"` (Pause), matching every other calibration surface.

Found the same pattern in `src/components/ErrorBoundary.tsx`'s reload button while making this
change. Left alone — it's an app-wide component, not calibration-scoped — and logged to
`deferred-work.md`.

### 3. Spacing: three even 32px groups instead of one ad hoc top-padding

Before: outer `VStack gap={5}` (20px) plus a `pt={2}` (8px) tacked onto the button row on top of
that gap, so the gap above the buttons (28px) didn't match the gap above the body text (20px) —
two different numbers for what reads as the same kind of separation, sized by accretion rather
than intent.

After: outer `VStack gap={8}` (32px), three children — [title + badge], body text, button row —
with the ad hoc `pt` removed. The inner title/badge grouping went from `gap={2}` (8px) to
`gap={3}` (12px) to give the (now-lighter, Inter) title a touch more room from the badge under it.
The button row itself went from `gap={3}` (12px) to `gap={4}` (16px) between Continue and Pause,
matching the 16px rhythm the rest of calibration content uses (`WorkStatusRow`'s internal gaps).

32px was picked to echo the calibration content pass's own established rhythm (the question
title's top/bottom gap is 32px per `criteria-calibration-page-redesign.md`'s content-pass section)
rather than as a new number — this screen sits inside the same panel as that content and should
read as governed by the same scale.

## What deliberately did not change

- Copy, `checkpointCopy.ts`'s six rules, and which variant shows which template — all owned by
  `criteria-calibration-checkpoint-copy-rewrite.md`, out of scope here.
- The badge itself (`TierAccuracyBadge`) — untouched, already covered by the tooltip pass on
  `criteria-calibration-page-redesign`.
- The terminal ("Done, evaluate albums") button's single-button layout, and the non-terminal
  two-button row's `flex="1" maxW="12rem"` sizing.
- `ErrorBoundary.tsx`'s matching hardcoded `orange` (see above — logged separately, not bundled).

## Verification

- Added a "Calibration Checkpoint" section to `/style-guide`, rendered inside the same
  `surface.tabPanel` / `border.ruleStrong` frame the real page uses, since this screen's spacing
  was tuned to sit inside that frame rather than on the bare page background. Confirmed the
  section is a faithful stand-in by matching it screenshot-for-screenshot against Dan's original
  report before changing anything.
- Measured, not assumed: title font-family/size/weight before and after, and the Continue button's
  rendered background colour before and after, both via `getComputedStyle` in a live browser tab.
- `npx vitest run`: 344/344 (no test asserted on the heading's font family or the buttons'
  `colorPalette`, so nothing needed updating).
- `npx tsc -p tsconfig.app.json --noEmit`: unchanged at 206, identical error set to master.
- Did **not** re-verify this live on the authenticated QA account — the change is isolated to one
  presentational component with no logic touched, and is now also visible, unauthenticated, at
  `/style-guide`.

## Not in this branch

- `ErrorBoundary.tsx`'s hardcoded `colorPalette="orange"` (logged to `deferred-work.md`).
- Any change to the checkpoint's copy, trigger logic, or which tiers show which template.
