import { Flex, Text } from '@chakra-ui/react';

// Minor visual separator between Card A and Card B — a label, not a decision point.
export function VsDivider() {
  return (
    <Flex align="center" justify="center" px={2}>
      <Text
        fontFamily="mono"
        fontSize="xs"
        color="text.muted"
        textTransform="uppercase"
        letterSpacing="0.08em"
      >
        vs
      </Text>
    </Flex>
  );
}
