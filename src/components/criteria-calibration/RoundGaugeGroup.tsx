import { VStack } from '@chakra-ui/react';
import {
  ProgressCircleRoot,
  ProgressCircleRing,
  ProgressCircleValueText,
} from '../ui/progress-circle';
import { RoundCounter } from './RoundCounter';
import { AccuracyStatus, type AccuracyLevel } from './AccuracyStatus';

interface RoundGaugeGroupProps {
  round: number;
  accuracyLevel: AccuracyLevel;
  // Placeholder gauge fill only — not derived from any real accuracy computation yet.
  accuracyPercentPlaceholder: number;
}

// Visually clusters RoundCounter + ProgressCircle + AccuracyStatus as one unit
// so the header reads as a single "where am I" gauge rather than three loose labels.
export function RoundGaugeGroup({
  round,
  accuracyLevel,
  accuracyPercentPlaceholder,
}: RoundGaugeGroupProps) {
  return (
    <VStack gap={2} align="center">
      <RoundCounter round={round} />
      <ProgressCircleRoot value={accuracyPercentPlaceholder} size="lg">
        <ProgressCircleRing color="accent.border" trackColor="border.rule" cap="butt" />
        <ProgressCircleValueText color="text.primary" fontFamily="mono" />
      </ProgressCircleRoot>
      <AccuracyStatus level={accuracyLevel} />
    </VStack>
  );
}
