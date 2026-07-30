import { HStack, Text } from '@chakra-ui/react';

export type AccuracyLevel = 'Low' | 'Medium' | 'High';

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
