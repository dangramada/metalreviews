import { Button, Heading, Text, VStack } from '@chakra-ui/react';
import { ACCURACY_TIER_LABELS } from '../../lib/criteria-calibration/accuracyTierLabels';

// The checkpoint screens shown at degree-exhaustion boundaries. Purely presentational: every
// decision about WHICH variant to show lives in CriteriaCalibrationPage's checkpoint
// derivation, which is where the answer-log-derived state it depends on already is.
//
// REWRITTEN 2026-08-18 for degree-tied tiers — see
// docs/decisions/criteria-calibration/criteria-calibration-degree-tiers-and-progress.md.
// Before, three of these fired on an accuracy THRESHOLD CROSSING, which could interrupt
// mid-degree; now a tier can only change at a degree boundary, so every variant is a boundary
// screen and the variants are named for the tier the user just reached.
//
// Standing copy rules, all load-bearing:
//
//   1. NEVER claim the label says anything about ranking quality, score trustworthiness, or
//      stability. This is stricter than the previous rule and applies to all four screens.
//      Degree-tying did not fix the recalibration report's #4/#8 inversion — the oracle with the
//      best true ranking sits on the base rung, the one converged to a wrong model reads Sharp —
//      it re-expressed it. What each label CAN honestly say is how many levels of trade-off the
//      user has finished, which is true by construction. Copy that stays inside that is safe;
//      copy that drifts toward "your scores are reliable now" is not, and no amount of hedging
//      makes it so. See the decision doc's §2b.
//   2. The exhaustion screen must stay NEUTRAL about cause. Several plausible preference shapes
//      run out of road without the model ever becoming determinate; whether that is genuine
//      under-information or a blind spot in computeScoreSpreadAccuracy is an OPEN QUESTION
//      tracked in deferred-work.md. So the copy must not imply the user answered badly, and
//      equally must not imply the metric failed. It states the position and stops. A test
//      asserts both directions. Do not "improve" it until that question is settled.
//   3. Sharp DOES offer continuation, reversing the old Very High screen's rule. That rule
//      ("100% is unreachable, so this is the ceiling") was about an accuracy threshold. Sharp is
//      the top of the LABEL ladder, not of the work: degrees 5 and 6 still have comparisons, and
//      they stay at Sharp because the evidence shows they change nothing measurable. Offering
//      them while saying plainly that the label will not move is the honest version — hiding
//      them would strand the terminal-exhaustion screen and make two whole degrees unreachable.

export type CheckpointVariant = 'medium' | 'high' | 'veryHigh' | 'exhausted';

interface CalibrationCheckpointProps {
  variant: CheckpointVariant;
  /** Rounded whole-percent score-spread accuracy. Shown as a live measurement alongside the
   *  label, never as the thing that earned it — the two are independent by design now. */
  accuracyPercent: number;
  onContinue?: () => void;
  onFinish: () => void;
}

// The degree whose completion each tier names. Kept next to the copy because the copy states
// these numbers out loud, so they must not drift from degreeTiers.ts's mapping.
const DEGREE_FOR_VARIANT: Record<Exclude<CheckpointVariant, 'exhausted'>, number> = {
  medium: 2,
  high: 3,
  veryHigh: 4,
};

function headline(variant: CheckpointVariant): string {
  if (variant === 'exhausted') return 'No comparisons left to ask';
  const degree = DEGREE_FOR_VARIANT[variant];
  return `${degree}-criteria comparisons complete — ${ACCURACY_TIER_LABELS[variant]}`;
}

function body(variant: CheckpointVariant, accuracyPercent: number): string[] {
  switch (variant) {
    case 'medium':
      return [
        `You've answered every comparison this method can put to you two criteria at a time. That's what ${ACCURACY_TIER_LABELS.medium} means — a level of detail finished, nothing more and nothing less.`,
        'Going further means comparing three criteria at once: fewer, harder trade-offs, and a more detailed picture of how you weigh them against each other.',
        `Separately, your answers currently pin the model down to ${accuracyPercent}%. That number moves with every comparison; the label above only moves when you finish a whole level.`,
      ];
    case 'high':
      return [
        `Three-criteria comparisons are done too. ${ACCURACY_TIER_LABELS.high} means you've finished the first two levels of detail — pairs, then triples.`,
        'The next level compares four criteria at a time.',
        `Your answers currently pin the model down to ${accuracyPercent}%.`,
      ];
    case 'veryHigh':
      return [
        `Four criteria at a time, all answered. ${ACCURACY_TIER_LABELS.veryHigh} is the last label — you've completed every level of detail this scale distinguishes.`,
        `There are still five- and six-criteria comparisons available if you want to keep going. They stay at ${ACCURACY_TIER_LABELS.veryHigh}: on the evidence we have, comparisons at that level of detail change the picture very little.`,
        `Your answers currently pin the model down to ${accuracyPercent}%.`,
      ];
    case 'exhausted':
      return [
        'Every trade-off this model can distinguish, at every level of detail, has been asked — this is where your answers land.',
        `Your answers pin the model down to ${accuracyPercent}%.`,
        'Your criteria weights are saved and will be used to score albums.',
      ];
  }
}

export function CalibrationCheckpoint({
  variant,
  accuracyPercent,
  onContinue,
  onFinish,
}: CalibrationCheckpointProps) {
  const isTerminal = variant === 'exhausted';

  return (
    <VStack gap={5} align="stretch" aria-live="polite" maxW="2xl" mx="auto" textAlign="center">
      <Heading size="md" fontFamily="heading" color="text.primary">
        {headline(variant)}
      </Heading>

      {body(variant, accuracyPercent).map((paragraph) => (
        <Text key={paragraph} color="text.dim" fontFamily="body">
          {paragraph}
        </Text>
      ))}

      <VStack gap={3} pt={2}>
        {onContinue && (
          <Button colorPalette="orange" onClick={onContinue}>
            Keep comparing
          </Button>
        )}
        <Button
          variant={isTerminal ? 'solid' : 'outline'}
          colorPalette={isTerminal ? 'orange' : 'gray'}
          onClick={onFinish}
        >
          {isTerminal ? 'Evaluate albums' : 'Stop here — evaluate albums'}
        </Button>
      </VStack>
    </VStack>
  );
}
