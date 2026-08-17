import { Button, Heading, Text, VStack } from '@chakra-ui/react';

// The four checkpoint screens that replaced Brief 3's automatic degree escalation
// (2026-08-17) — see docs/decisions/criteria-calibration/criteria-calibration-tiered-checkpoints.md.
// Purely presentational: every decision about WHICH variant to show lives in
// CriteriaCalibrationPage's checkpoint derivation, which is where the answer-log-derived state
// it depends on already is.
//
// Standing copy rules, all load-bearing:
//
//   1. Never reference ranking or stability. Same rule ProgressHeader.tsx documents for exit
//      copy. These screens are about accuracy, a quantity the solver actually reports; the
//      retired signal's ranking claims are exactly what could not be substantiated.
//   2. The exhaustion screen must stay NEUTRAL about cause. Synthetic-oracle data (2026-08-16)
//      shows several plausible real preference shapes — single-dominant, front-loaded,
//      linear-control — never crossing High within 86-90 answers, running to natural
//      exhaustion instead. Whether that is genuine under-information in those shapes or a
//      blind spot in computeScoreSpreadAccuracy is an OPEN QUESTION, tracked in
//      deferred-work.md and deliberately unresolved. So the copy must not imply the user
//      answered badly or inconsistently, and equally must not imply the metric failed. It
//      states the number as a fact and stops. Do not "improve" it in either direction until
//      that question is settled.
//   3. Very High offers no continuation. Per 1000minds' own framing, 100% is not reachable;
//      Very High is the practical ceiling, so offering "keep going" there would be offering
//      something that cannot pay off.

export type CheckpointVariant = 'degree2' | 'high' | 'veryHigh' | 'exhausted';

interface CalibrationCheckpointProps {
  variant: CheckpointVariant;
  /** Rounded whole-percent accuracy, already computed by the page from the same raw value the
   *  tier was derived from — so the number shown and the tier named can never disagree. */
  accuracyPercent: number;
  /** Present only when `variant` names a tier the user has reached. */
  accuracyLabel?: 'Low' | 'Medium' | 'High' | 'Very High';
  /** Absent on 'veryHigh' and 'exhausted', which offer no continuation. */
  onContinue?: () => void;
  onFinish: () => void;
}

function headline(variant: CheckpointVariant, percent: number, label?: string): string {
  if (variant === 'exhausted') return `Your accuracy: ${percent}%`;
  if (variant === 'veryHigh') return `Your accuracy is ${percent}% — Very High`;
  if (variant === 'high') return `Your accuracy is now ${percent}% — High`;
  // Degree 2 states the tier honestly whether or not Medium was actually reached — the
  // checkpoint fires on the degree-2 boundary regardless, so implying a threshold was met
  // would be a straightforward lie on the sessions that reach the boundary below it.
  return `Your accuracy so far: ${percent}% — ${label}`;
}

function body(variant: CheckpointVariant): string[] {
  switch (variant) {
    case 'degree2':
      return [
        "You've answered every comparison available at this level of detail.",
        'The higher this number goes, the more closely album scores reflect what you actually care about — the same album can land in a different place once your preferences are pinned down more precisely. Answering more comparisons is the only thing that raises it.',
      ];
    case 'high':
      return [
        'Album scores at this level are reliable for most comparisons. What’s left to gain is precision in the close calls — albums that currently score within a point or two of each other.',
        'The next step up is Very High. It takes more comparisons, and it’s the practical ceiling — 100% isn’t reachable.',
      ];
    case 'veryHigh':
      return [
        'This is as precise as this method gets. Your criteria weights are pinned down well enough that further comparisons wouldn’t meaningfully change how albums rank.',
      ];
    case 'exhausted':
      return [
        'There are no more comparisons available. Every trade-off this model can distinguish, at every level of detail, has been asked — this is where your answers land.',
        'Your criteria weights are saved and will be used to score albums.',
      ];
  }
}

export function CalibrationCheckpoint({
  variant,
  accuracyPercent,
  accuracyLabel,
  onContinue,
  onFinish,
}: CalibrationCheckpointProps) {
  const isTerminal = variant === 'veryHigh' || variant === 'exhausted';

  return (
    <VStack gap={5} align="stretch" aria-live="polite" maxW="2xl" mx="auto" textAlign="center">
      <Heading size="md" fontFamily="heading" color="text.primary">
        {headline(variant, accuracyPercent, accuracyLabel)}
      </Heading>

      {body(variant).map((paragraph) => (
        <Text key={paragraph} color="text.dim" fontFamily="body">
          {paragraph}
        </Text>
      ))}

      <VStack gap={3} pt={2}>
        {onContinue && (
          <Button colorPalette="orange" onClick={onContinue}>
            Increase accuracy
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
