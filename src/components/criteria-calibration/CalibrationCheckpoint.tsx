import { useEffect, useRef } from 'react';
import { Button, HStack, Heading, Text, VStack } from '@chakra-ui/react';
import type { AccuracyTier } from '../../lib/criteria-calibration/accuracyTierLabels';
import { TierAccuracyBadge } from './TierAccuracyBadge';
import { primaryButton, secondaryButton } from '../../theme';
import {
  CHECKPOINT_CEILING_HEADLINE,
  CHECKPOINT_CONTINUE_BUTTON,
  CHECKPOINT_DONE_BUTTON,
  CHECKPOINT_FROZEN_HEADLINE,
  CHECKPOINT_PAUSE_BUTTON,
  CHECKPOINT_PROMOTION_HEADLINE,
  CHECKPOINT_TERMINAL_HEADLINE,
  checkpointCeilingBody,
  checkpointFrozenBody,
  checkpointPromotionBody,
  checkpointTerminalBody,
} from '../../lib/criteria-calibration/checkpointCopy';

// The checkpoint screens shown at degree-exhaustion boundaries (plus one shown mid-degree, see
// 'frozen' below). Purely presentational: every decision about WHICH variant to show, and what
// tier to display, lives in CriteriaCalibrationPage's checkpoint derivation, which is where the
// answer-log-derived state it depends on already is.
//
// REWRITTEN 2026-08-26 (criteria-calibration-checkpoint-copy-rewrite) for shorter, less
// justificatory copy and a permanently-visible tier badge — see
// docs/decisions/criteria-calibration/criteria-calibration-checkpoint-copy-rewrite.md. Before,
// the tier name was only mentioned inline in the headline text, and only for three of the four
// variants (never for 'exhausted', never for a silent degree-5 boundary since no screen showed
// there at all). Now every screen shows a badge with the CURRENT tier, unconditionally,
// including when it hasn't changed from the previous checkpoint (Sharp -> Sharp at the 4->5 and
// 5->6 boundaries) — the badge states a fact, and the body copy is what explains a ceiling, not
// the badge's absence.
//
// `variant` picks which body template to show (four templates: 'promotion' for medium/high,
// 'ceiling' for veryHigh, 'terminal' for exhausted, 'frozen' for the freeze checkpoint).
// `tier` is now a SEPARATE prop controlling only the badge, decoupled from `variant`: for the
// three promoting/ceiling variants tier always equals variant's own tier by construction, but
// 'frozen' fires mid-degree-2 with whatever the actual current tier is (typically 'none'), not
// a tier "reached" by this screen. Passing it explicitly means the badge can never silently
// drift from what CriteriaCalibrationPage's own tier derivation says is true right now.
//
// 'frozen' is defined here as a full variant (type, template, badge behavior) even though no
// caller produces it yet — its trigger condition (the 78-answer freeze threshold) lives on the
// separate criteria-calibration-freeze-checkpoint branch. Defining the copy here now means that
// branch only has to wire a condition to an existing variant, not touch this file's templates.
//
// Standing copy rules, all load-bearing (see checkpointCopy.ts's header for the full six-rule
// list this file's copy must keep satisfying):
//
//   1. NEVER claim the badge says anything about ranking quality, score trustworthiness, or
//      stability. Degree-tying did not fix the recalibration report's #4/#8 inversion — the
//      oracle with the best true ranking sits on the base rung, the one converged to a wrong
//      model reads Sharp — it re-expressed it. What the badge CAN honestly say is how many
//      levels of trade-off the user has finished, which is true by construction.
//   2. The terminal screen must stay NEUTRAL about cause. Several plausible preference shapes
//      run out of road without the model ever becoming determinate; whether that is genuine
//      under-information or a blind spot in computeScoreSpreadAccuracy is an OPEN QUESTION
//      tracked in deferred-work.md. So the copy must not imply the user answered badly, and
//      equally must not imply the metric failed. It states the position and stops.
//   3. Sharp DOES offer continuation at both boundaries where it's already reached (degree-4 and
//      degree-5 exhaustion, both use 'ceiling' copy) — degrees 5 and 6 still have comparisons,
//      and they stay at Sharp because the evidence shows they change nothing measurable. Saying
//      plainly that the badge will not move is the honest version; hiding the screen (as
//      degree-5 exhaustion did before this rewrite) would make a whole degree's boundary
//      invisible.

export type CheckpointVariant = 'medium' | 'high' | 'veryHigh' | 'exhausted' | 'frozen';

interface CalibrationCheckpointProps {
  variant: CheckpointVariant;
  /** The tier to show on the badge, independent of `variant` (see file header). */
  tier: AccuracyTier;
  /** Rounded whole-percent score-spread accuracy. Shown as a live measurement, part of the
   *  body copy's own subject ("you're N% clear on..."), never a bare number. */
  accuracyPercent: number;
  onContinue?: () => void;
  /** Non-terminal "Pause here" — goes to the Results tab, stays on this page (criteria-
   *  calibration-page-redesign §4: pause is always a temporary exit from an unfinished
   *  process). Unused for the terminal variant, which has no Pause button. */
  onPause?: () => void;
  /** Terminal "Done, evaluate albums" — leaves the page entirely, since grade-6 exhaustion is
   *  a natural end with no "back to calibration" to return to. Unused for every other variant. */
  onFinish?: () => void;
}

function headline(variant: CheckpointVariant): string {
  switch (variant) {
    case 'medium':
    case 'high':
      return CHECKPOINT_PROMOTION_HEADLINE;
    case 'veryHigh':
      return CHECKPOINT_CEILING_HEADLINE;
    case 'exhausted':
      return CHECKPOINT_TERMINAL_HEADLINE;
    case 'frozen':
      return CHECKPOINT_FROZEN_HEADLINE;
  }
}

function body(variant: CheckpointVariant, accuracyPercent: number): string {
  switch (variant) {
    case 'medium':
    case 'high':
      return checkpointPromotionBody(accuracyPercent);
    case 'veryHigh':
      return checkpointCeilingBody(accuracyPercent);
    case 'exhausted':
      return checkpointTerminalBody(accuracyPercent);
    case 'frozen':
      return checkpointFrozenBody(accuracyPercent);
  }
}

export function CalibrationCheckpoint({
  variant,
  tier,
  accuracyPercent,
  onContinue,
  onPause,
  onFinish,
}: CalibrationCheckpointProps) {
  const isTerminal = variant === 'exhausted';

  // Move focus to the headline whenever a checkpoint (re)appears, so screen readers reliably
  // announce it — aria-live="polite" on the wrapper alone doesn't guarantee that if focus is
  // sitting elsewhere (e.g. on the comparison card that was just clicked). tabIndex={-1} makes
  // the heading programmatically focusable without adding it to normal tab order.
  const headlineRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headlineRef.current?.focus();
  }, [variant]);

  return (
    <VStack gap={8} align="stretch" aria-live="polite" maxW="2xl" mx="auto" textAlign="center">
      <VStack gap={3}>
        {/* Inter, not Clash Display (2026-09-15). This screen predates the calibration content
          pass and was the one surface in the whole feature still using the display face for a
          title — every other title on this page (QuestionPrompt, the Guide card's
          cardTitleBand) had already been moved off it. That wasn't a stray inconsistency:
          naming-decisions.md reserves Clash Display for the wordmark and the score-slab number
          ONLY, so this was the one place still violating that rule. `size="md"` here is
          Chakra's Heading recipe size, not a `textStyle` — kept as-is since only the FAMILY was
          wrong, not the weight or scale a milestone screen like this earns over a per-round
          question. */}
        <Heading ref={headlineRef} tabIndex={-1} size="md" fontFamily="body" color="text.primary">
          {headline(variant)}
        </Heading>
        {/* No ⓘ beside the badge since 2026-09-12: the badge is its own tooltip trigger now
          (TierAccuracyBadge), so the glyph would have been a second affordance for an
          explanation the badge already offers, and the copy would have had to live in two
          places to stay in sync. */}
        <TierAccuracyBadge tier={tier} percent={accuracyPercent} size="lg" />
      </VStack>

      <Text color="text.dim" fontFamily="body">
        {body(variant, accuracyPercent)}
      </Text>

      {/* Buttons now spread the app's own primaryButton/secondaryButton tokens (theme.ts)
        instead of hardcoding Chakra's built-in `colorPalette="orange"` ramp directly — this was
        the other pre-existing inconsistency: everywhere else calibration content reached for
        `primaryButton` (EqualButton, GuideTab's CTA, ResultsTab), this screen alone spelled out
        the palette by hand. Visually near-identical (the app's `ember` ramp IS an orange), so
        this is a token-discipline fix, not a restyle: a future accent-colour change now reaches
        this screen for free instead of needing a second edit. */}
      {isTerminal ? (
        <Button {...primaryButton} onClick={onFinish}>
          {CHECKPOINT_DONE_BUTTON}
        </Button>
      ) : (
        // gap=4 (16px) between the two buttons, matching the 16px rhythm the rest of
        // calibration content uses (WorkStatusRow's internal gaps); pt dropped in favor of the
        // parent VStack's own gap={8}, so this row's spacing above it is the same 32px as the
        // other two group boundaries rather than a bespoke top-padding on top of a gap.
        <HStack gap={4} justify="center">
          <Button {...primaryButton} flex="1" maxW="12rem" onClick={onContinue}>
            {CHECKPOINT_CONTINUE_BUTTON}
          </Button>
          <Button {...secondaryButton} variant="outline" flex="1" maxW="12rem" onClick={onPause}>
            {CHECKPOINT_PAUSE_BUTTON}
          </Button>
        </HStack>
      )}
    </VStack>
  );
}
