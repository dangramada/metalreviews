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

// Neutral in-progress state — same sand.700 fill on both slots while rating is incomplete
// (see DesktopRatingLayout), replacing what used to be two static em-dashes. Not a theme.ts
// style object like scoreSlabBase/High since it's only ever used here, not shared with the
// review card.
const scoreSlabPending = {
  bg: 'sand.700',
  color: 'text.primary',
} as const;

export function RatingSlab({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: 'base' | 'high' | 'pending';
}) {
  const styles =
    variant === 'pending' ? scoreSlabPending : variant === 'high' ? scoreSlabHigh : scoreSlabBase;
  return (
    <Box
      {...styles}
      // scoreSlabBase/scoreSlabHigh carry a 2px borderTop/borderLeft (the review card's own
      // flush-corner treatment) — overridden off here per the fourth pass; the shared style
      // objects in theme.ts are untouched since the review card's own ScoreSlab still uses them.
      border="none"
      // Overrides scoreSlabBase's pt/pb (8px/4px) for this component's own usage only — same
      // reasoning as the border override above.
      pt="16px"
      pb="12px"
      flex="1 1 0"
      display="flex"
      flexDirection="column"
      gap="2px"
      // Drives the pending -> real-variant background swap at rating completion (see
      // DesktopRatingLayout) — content (label/value) swaps instantly alongside this, only the
      // color itself eases.
      transition="background-color 350ms ease-out"
    >
      <Text as="span" fontFamily="mono" fontSize="14px" fontWeight="700" textTransform="uppercase" opacity={1}>
        {label}
      </Text>
      <Text as="span" fontFamily="heading" fontSize="28px" fontWeight="700" lineHeight="1" letterSpacing="-0.02em">
        {value}
      </Text>
    </Box>
  );
}
