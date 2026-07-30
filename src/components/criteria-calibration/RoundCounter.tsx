import { Text } from '@chakra-ui/react';

interface RoundCounterProps {
  round: number;
}

// Deliberately no "of N" — this flow has no fixed round count (spec: DoD).
export function RoundCounter({ round }: RoundCounterProps) {
  return (
    <Text
      fontFamily="mono"
      textTransform="uppercase"
      letterSpacing="0.08em"
      fontSize="sm"
      color="text.primary"
    >
      Round {round}
    </Text>
  );
}
