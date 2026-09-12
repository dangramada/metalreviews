import { Box, Text } from '@chakra-ui/react';
import { formatLevelDescription } from '../../lib/criteria-calibration/criteriaCatalog';

interface CriterionLevelDetailProps {
  levelName: string;
  description: string;
  /** Set when the containing OptionCard is selected (accent.border fill), so both lines switch
   *  to accent.ink together. Unused by the Guide, whose cards are never selectable. */
  selected?: boolean;
  /** 1-5. Shown as "3 - Skilled", matching AlbumRatingPage's CriterionLevelPicker format
   *  exactly, so the scale a user meets in the Guide is the one they meet when rating. Guide
   *  only: a comparison card shows a single level per criterion, where a rank prefix would state
   *  something the card is not about. */
  levelNumber?: number;
}

// One level: its name and what that level means. Extracted 2026-09-12 so the comparison card
// (CriterionRow) and the Guide card (CriteriaCarousel) render a level through ONE component
// rather than two lists of matching font values — the point of "same UI" is that it survives the
// next change to either screen, which duplicated styling does not.
//
// It owns formatLevelDescription too, which both callers previously applied themselves.
export function CriterionLevelDetail({
  levelName,
  description,
  selected,
  levelNumber,
}: CriterionLevelDetailProps) {
  return (
    <Box>
      <Text textStyle="cardTitle" color={selected ? 'accent.ink' : 'text.primary'}>
        {levelNumber ? `${levelNumber} – ${levelName}` : levelName}
      </Text>
      <Text fontFamily="body" fontSize="sm" color={selected ? 'accent.ink' : 'text.dim'}>
        {formatLevelDescription(description)}
      </Text>
    </Box>
  );
}
