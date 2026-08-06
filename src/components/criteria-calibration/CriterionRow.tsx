import { Box, Text } from '@chakra-ui/react';
import { CriterionBadge } from './CriterionBadge';
import { formatLevelDescription } from '../../lib/criteria-calibration/criteriaCatalog';

export interface CriterionData {
  label: string;
  levelName: string;
  description: string;
}

interface CriterionRowProps {
  criterion: CriterionData;
  // When the parent OptionCard is selected (accent.border bg), all three text
  // pieces switch to accent.ink so they stay legible against the ember fill —
  // Text components below set their own explicit `color`, so a parent color
  // override alone would not cascade to them.
  selected?: boolean;
}

// Badge -> LevelName -> LevelDescription, in that visual order. LevelName is
// the dominant element (Inter bold, large); badge and description are both
// small/dim helper roles so they don't compete with it.
export function CriterionRow({ criterion, selected }: CriterionRowProps) {
  return (
    <Box>
      <CriterionBadge selected={selected}>{criterion.label}</CriterionBadge>
      <Text
        mt={2}
        fontFamily="body"
        fontWeight="bold"
        fontSize="xl"
        textTransform="uppercase"
        color={selected ? 'accent.ink' : 'text.primary'}
        lineHeight="1.2"
      >
        {criterion.levelName}
      </Text>
      <Text fontFamily="body" fontSize="sm" color={selected ? 'accent.ink' : 'text.dim'}>
        {formatLevelDescription(criterion.description)}
      </Text>
    </Box>
  );
}
