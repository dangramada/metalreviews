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
  // Progress: how far through the session (drives the ring + its center value).
  progressPercent: number;
  // Accuracy: a separate, cumulative metric — never resets per round, never
  // collapsed into the Progress ring. Rendered via AccuracyStatus below it.
  accuracyPercent: number;
  accuracyLevel: AccuracyLevel;
}

// Visually clusters RoundCounter + ProgressCircle (Progress) + AccuracyStatus
// (Accuracy) as one unit so the header reads as a single "where am I" gauge,
// while keeping the two metrics visibly distinct within it.
export function RoundGaugeGroup({
  round,
  progressPercent,
  accuracyPercent,
  accuracyLevel,
}: RoundGaugeGroupProps) {
  return (
    <VStack gap={2} align="center">
      <RoundCounter round={round} />
      <ProgressCircleRoot value={progressPercent} size="lg">
        <ProgressCircleRing color="accent.border" trackColor="border.rule" cap="butt" />
        <ProgressCircleValueText color="text.primary" fontFamily="mono" />
      </ProgressCircleRoot>
      <AccuracyStatus percent={accuracyPercent} level={accuracyLevel} />
    </VStack>
  );
}
