import { Text } from '@chakra-ui/react';

interface RoundCounterProps {
  round: number;
}

// Deliberately no "of N" — this flow has no fixed round count (spec: DoD).
//
// Uses the shared `statusReadout` text style — 14px bold Inter, paired with the progress
// percentage beside it. Was mono/uppercase/letterspaced, which made a plain ordinal look like a
// system readout; it is now plain Inter, sentence case.
export function RoundCounter({ round }: RoundCounterProps) {
  return (
    <Text textStyle="statusReadout" color="text.primary">
      Round {round}
    </Text>
  );
}
