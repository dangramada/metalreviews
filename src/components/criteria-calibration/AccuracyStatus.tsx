import { HStack, Text } from '@chakra-ui/react';

// 'Very High' added 2026-08-17 with the tiered-checkpoint flow. The page used to hard-cap the
// displayed label at Medium — that cap was about the deprecated computeSolverAccuracy metric
// (blind to degree-3+ improvement, see accuracyTiers.ts). The live score-spread metric's tiers
// are what the checkpoint flow is built on, so all four are now displayable.
export type AccuracyLevel = 'Low' | 'Medium' | 'High' | 'Very High';

interface AccuracyStatusProps {
  percent: number;
  level: AccuracyLevel;
}

// Cumulative across the whole session, not per round — a different metric from
// Progress (which lives in the ProgressCircle and measures how far through the
// session the user is). Numeric % and qualitative label are both rendered as
// distinct text nodes, not merged into a single string, per spec.
export function AccuracyStatus({ percent, level }: AccuracyStatusProps) {
  return (
    <HStack gap={2}>
      <Text fontFamily="mono" fontSize="xs" color="text.dim">
        {percent}%
      </Text>
      <Text fontFamily="body" fontSize="xs" color="text.dim">
        Accuracy: {level}
      </Text>
    </HStack>
  );
}
