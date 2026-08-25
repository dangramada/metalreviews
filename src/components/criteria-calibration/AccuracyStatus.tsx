import { HStack, Text } from '@chakra-ui/react';
import {
  ACCURACY_TIER_LABELS,
  type AccuracyTier,
} from '../../lib/criteria-calibration/accuracyTierLabels';

// Takes the internal tier and renders its label, rather than accepting a pre-formatted string:
// the display names live in exactly one place (accuracyTierLabels.ts) as of 2026-08-18, when
// the labels became Unfocused / Blurry / Clear / Sharp and started being assigned by which
// degree of comparison the user has finished rather than by an accuracy threshold.
export type { AccuracyTier };

interface AccuracyStatusProps {
  percent: number;
  tier: AccuracyTier;
}

// Two INDEPENDENT quantities, deliberately shown side by side and deliberately not merged into
// one sentence: the percentage is the live score-spread accuracy, which moves with every answer,
// and the label names how many degrees of comparison are finished, which moves only at a
// boundary. They are no longer derived from each other. "Detail:" rather than "Accuracy:" for
// the label, because calling a completeness measure "accuracy" is the exact conflation the copy
// rule in accuracyTierLabels.ts forbids.
export function AccuracyStatus({ percent, tier }: AccuracyStatusProps) {
  return (
    <HStack gap={2}>
      <Text fontFamily="mono" fontSize="xs" color="text.dim">
        {percent}%
      </Text>
      <Text fontFamily="body" fontSize="xs" color="text.dim">
        Detail: {ACCURACY_TIER_LABELS[tier]}
      </Text>
    </HStack>
  );
}
