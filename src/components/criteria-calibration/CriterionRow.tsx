import { Box, Text } from '@chakra-ui/react';

export interface CriterionData {
  label: string;
  levelName: string;
  description: string;
}

interface CriterionRowProps {
  criterion: CriterionData;
}

// Label -> LevelName -> LevelDescription, in that visual order. LevelName is the
// dominant element (Inter bold, large); label and description are both small/dim
// helper text, mono-uppercase vs. regular respectively, so they don't compete with it.
export function CriterionRow({ criterion }: CriterionRowProps) {
  return (
    <Box>
      <Text
        fontFamily="mono"
        textTransform="uppercase"
        letterSpacing="0.08em"
        fontSize="11px"
        color="text.muted"
      >
        {criterion.label}
      </Text>
      <Text fontFamily="body" fontWeight="bold" fontSize="xl" color="text.primary" lineHeight="1.2">
        {criterion.levelName}
      </Text>
      <Text fontFamily="body" fontSize="sm" color="text.dim">
        {criterion.description}
      </Text>
    </Box>
  );
}
