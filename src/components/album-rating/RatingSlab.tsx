// Rank/Score display for the AlbumRatingPage's Section 3 — reuses the review card's
// scoreSlabBase/scoreSlabHigh style configs (theme.ts) for visual consistency, but not
// App.tsx's own ScoreSlab component: that component isn't exported and hardcodes a bare
// number + dimmed "/10" as its content, whereas this needs a small label plus an arbitrary
// value string (a rank "#N", a percentage, or an em dash pre-completion).
// flex="1 1 0" hardcodes an even 50/50 split against a sibling RatingSlab — safe because this
// component only ever renders in the fixed Rank/Score pair in DesktopRatingLayout's Section 3,
// not as a general-purpose slab.
import { Box, Text } from '@chakra-ui/react';
import { scoreSlabBase, scoreSlabHigh } from '../../theme';

export function RatingSlab({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: 'base' | 'high';
}) {
  return (
    <Box
      {...(variant === 'high' ? scoreSlabHigh : scoreSlabBase)}
      // scoreSlabBase/scoreSlabHigh carry a 2px borderTop/borderLeft (the review card's own
      // flush-corner treatment) — overridden off here per the fourth pass; the shared style
      // objects in theme.ts are untouched since the review card's own ScoreSlab still uses them.
      border="none"
      flex="1 1 0"
      display="flex"
      flexDirection="column"
      gap="2px"
    >
      <Text as="span" fontFamily="mono" fontSize="10px" fontWeight="700" textTransform="uppercase" opacity={0.7}>
        {label}
      </Text>
      <Text as="span" fontFamily="heading" fontSize="23px" fontWeight="700" lineHeight="1" letterSpacing="-0.02em">
        {value}
      </Text>
    </Box>
  );
}
