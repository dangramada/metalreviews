import { Text } from '@chakra-ui/react';

export type AccuracyLevel = 'Low' | 'Medium' | 'High';

interface AccuracyStatusProps {
  level: AccuracyLevel;
}

// Cumulative across the whole session, not per round — distinct from RoundCounter
// both in what it measures and in visual weight (dim caption vs. primary mono label).
export function AccuracyStatus({ level }: AccuracyStatusProps) {
  return (
    <Text fontFamily="body" fontSize="xs" color="text.dim">
      Accuracy: {level}
    </Text>
  );
}
