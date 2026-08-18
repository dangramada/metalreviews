import { VStack } from '@chakra-ui/react';
import {
  ProgressCircleRoot,
  ProgressCircleRing,
  ProgressCircleValueText,
} from '../ui/progress-circle';
import { RoundCounter } from './RoundCounter';
import { AccuracyStatus, type AccuracyTier } from './AccuracyStatus';

interface RoundGaugeGroupProps {
  round: number;
  // Progress: how far through the session (drives the ring + its center value).
  // As of 2026-08-18 this is the segmented per-degree measure — one equal segment
  // per degree the session can visit, filled by how far the current degree's
  // coverage gate has closed — NOT the accuracy percentage. Between 2026-08-09 and
  // then the ring showed accuracy, because an earlier coverage-based ring could read
  // 100% while the model was still undetermined; the per-degree measure can't do
  // that, since a degree only completes when its coverage gate is satisfied.
  progressPercent: number;
  // Accuracy: a separate, cumulative metric — never resets per round, never
  // collapsed into the Progress ring. Rendered via AccuracyStatus below it,
  // alongside the tier label, which is a third, independent quantity.
  accuracyPercent: number;
  accuracyTier: AccuracyTier;
}

// Visually clusters RoundCounter + ProgressCircle (Progress) + AccuracyStatus
// (Accuracy) as one unit so the header reads as a single "where am I" gauge,
// while keeping the two metrics visibly distinct within it.
export function RoundGaugeGroup({
  round,
  progressPercent,
  accuracyPercent,
  accuracyTier,
}: RoundGaugeGroupProps) {
  return (
    <VStack gap={2} align="center">
      <RoundCounter round={round} />
      <ProgressCircleRoot value={progressPercent} size="lg">
        <ProgressCircleRing color="accent.border" trackColor="border.rule" cap="butt" />
        <ProgressCircleValueText color="text.primary" fontFamily="mono" />
      </ProgressCircleRoot>
      <AccuracyStatus percent={accuracyPercent} tier={accuracyTier} />
    </VStack>
  );
}
