import { Box, HStack } from '@chakra-ui/react';
import {
  ACCURACY_TIER_LABELS,
  type AccuracyTier,
} from '../../lib/criteria-calibration/accuracyTierLabels';
import { TIER_COLORS } from '../../lib/criteria-calibration/tierColors';

interface TierAccuracyBadgeProps {
  tier: AccuracyTier;
  percent: number;
  size?: 'sm' | 'lg';
}

// Two-section compound badge: tier label (solid) sharing one border with a percentage (muted,
// bordered, monospace) — the compound structure itself is what keeps the percentage from ever
// reading as a bare number, satisfying accuracyTierLabels.ts's copy rule visually instead of
// via a sentence. Replaces the two ad hoc renderings this used to be split across
// (AccuracyStatus's plain `{percent}% / Detail: {tier}` pair, and CalibrationCheckpoint's bare
// `<Badge>{tier}</Badge>` with no percentage at all).
//
// `size="lg"` is the same component, larger, for the checkpoint screens' featured/centered use
// (CalibrationCheckpoint.tsx) — not a second component, per the brief.
//
// The two sections are marked aria-hidden and the wrapper carries one composed aria-label
// ("Clear tier, 52 percent pinned down") so a screen reader reads this as one fact, not two
// disconnected fragments — same reasoning as the visual "no connecting word" rule.
export function TierAccuracyBadge({ tier, percent, size = 'sm' }: TierAccuracyBadgeProps) {
  const colors = TIER_COLORS[tier];
  const label = ACCURACY_TIER_LABELS[tier];
  const isLg = size === 'lg';

  return (
    <HStack
      gap={0}
      display="inline-flex"
      role="img"
      aria-label={`${label} tier, ${percent} percent pinned down`}
    >
      <Box
        aria-hidden="true"
        bg={colors.leftBg}
        color={colors.leftText}
        borderWidth="1px"
        borderColor={colors.border}
        borderRightWidth={0}
        borderTopLeftRadius="sm"
        borderBottomLeftRadius="sm"
        px={isLg ? 4 : 2}
        py={isLg ? 1.5 : 1}
        fontFamily="body"
        fontWeight="bold"
        fontSize={isLg ? 'sm' : 'xs'}
        textTransform="uppercase"
        letterSpacing="0.05em"
      >
        {label}
      </Box>
      <Box
        aria-hidden="true"
        bg={colors.rightBg}
        color={colors.rightText}
        borderWidth="1px"
        borderColor={colors.border}
        borderTopRightRadius="sm"
        borderBottomRightRadius="sm"
        px={isLg ? 4 : 2}
        py={isLg ? 1.5 : 1}
        fontFamily="mono"
        fontSize={isLg ? 'sm' : 'xs'}
      >
        {percent}%
      </Box>
    </HStack>
  );
}
