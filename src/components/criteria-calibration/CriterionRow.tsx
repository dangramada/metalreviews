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

// Badge -> LevelName -> LevelDescription, in that visual order. LevelName is the dominant
// element; badge and description are both small/dim helper roles so they don't compete with it.
//
// Sentence case since 2026-09-12 (design review). The labels are ALREADY stored sentence case
// ("Groundbreaking", "Some fresh ideas") — the shouting was purely a textTransform here, so
// dropping it needed no data change. It now shares the `cardTitle` text style with the question
// title and the round counter.
export function CriterionRow({ criterion, selected }: CriterionRowProps) {
  return (
    <Box>
      <CriterionBadge selected={selected}>{criterion.label}</CriterionBadge>
      <Text mt={2} textStyle="cardTitle" color={selected ? 'accent.ink' : 'text.primary'}>
        {criterion.levelName}
      </Text>
      <Text fontFamily="body" fontSize="sm" color={selected ? 'accent.ink' : 'text.dim'}>
        {formatLevelDescription(criterion.description)}
      </Text>
    </Box>
  );
}
