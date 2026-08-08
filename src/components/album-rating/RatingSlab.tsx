// Rank/Score display for the AlbumRatingPage's Section 3 — reuses the review card's
// scoreSlabBase/scoreSlabHigh style configs (theme.ts) for visual consistency, but not
// App.tsx's own ScoreSlab component: that component isn't exported and hardcodes a bare
// number + dimmed "/10" as its content, whereas this needs a small label plus an arbitrary
// value string (a rank "#N", a percentage, or an em dash pre-completion).
// flex="1 1 0" gives an even 50/50 split when paired with a sibling RatingSlab (Rank/Score), or
// fills the full row width when rendered alone (the progress variant, pre-completion) — safe
// because this component only ever renders inside RatingProgressBox (used by both
// DesktopRatingLayout's Section 3 and MobileRatingLayout), not as a general-purpose slab.
import { Box, Text } from '@chakra-ui/react';
import { scoreSlabBase, scoreSlabHigh } from '../../theme';

// In-progress state — single full-width box (see DesktopRatingLayout) shown in place of the
// Rank/Score pair while rating is incomplete. Not a theme.ts style object like scoreSlabBase/
// High since it's only ever used here, not shared with the review card.
const scoreSlabProgress = {
  bg: 'ember.950',
  color: 'sand.200',
  px: '12px',
} as const;

export function RatingSlab({
  label,
  value,
  // Trailing descriptive text after `value` (e.g. "/ total criteria") — normal weight, smaller
  // than the count itself, so the count stays the visually dominant part of the line. Only the
  // progress variant uses this; Rank/Score pass a plain `value` with no suffix.
  valueSuffix,
  variant,
}: {
  label: string;
  value: string;
  valueSuffix?: string;
  variant: 'base' | 'high' | 'progress';
}) {
  const styles =
    variant === 'progress' ? scoreSlabProgress : variant === 'high' ? scoreSlabHigh : scoreSlabBase;
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
    >
      <Text as="span" fontFamily="mono" fontSize="14px" fontWeight="700" textTransform="uppercase" opacity={1}>
        {label}
      </Text>
      <Text as="span" fontFamily="heading" fontSize="28px" fontWeight="700" lineHeight="1" letterSpacing="-0.02em">
        {value}
        {valueSuffix && (
          <Text as="span" fontFamily="heading" fontSize="20px" fontWeight="400" letterSpacing="-0.02em">
            {valueSuffix}
          </Text>
        )}
      </Text>
    </Box>
  );
}
