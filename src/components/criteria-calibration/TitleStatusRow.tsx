import { Flex, Heading } from '@chakra-ui/react';
import type { AccuracyTier } from '../../lib/criteria-calibration/accuracyTierLabels';
import { TierAccuracyBadge } from './TierAccuracyBadge';

interface TitleStatusRowProps {
  tier: AccuracyTier;
  accuracyPercent: number;
  /** Hide the badge until the user has actually answered something — at round 0 there is
   *  nothing calibrated yet to show (brief §5's Guide-tab rule, generalized to the header
   *  since the badge lives there now, persistent across all three tabs). */
  hasStarted: boolean;
}

// Heading + TierAccuracyBadge, right-aligned on the same row — not stacked, not centered
// separately, per the brief's explicit layout call.
export function TitleStatusRow({ tier, accuracyPercent, hasStarted }: TitleStatusRowProps) {
  return (
    <Flex justify="space-between" align="center">
      <Heading size="lg" fontFamily="heading" color="text.primary">
        Criteria Calibration
      </Heading>
      {hasStarted && <TierAccuracyBadge tier={tier} percent={accuracyPercent} size="sm" />}
    </Flex>
  );
}
