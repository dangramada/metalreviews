// Evaluation progress / rank+score display — extracted from DesktopRatingLayout's Section 3
// (album-rating-page-desktop-redesign, 2026-08-05/06 motion pass) so MobileRatingLayout's
// stage-1 restructure can reuse the exact same box instead of hand-duplicating the JSX. Same
// visual output and AnimatePresence crossfade as before extraction — see
// docs/decisions/album-rating-page.md for why `mode="wait"` was chosen over a simultaneous
// crossfade (the pending->final swap changes child count, not just content).
import { Box, Flex, IconButton, Text, VStack } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LuSlidersVertical } from 'react-icons/lu';
import { Tooltip } from '../ui/tooltip';
import { RatingSlab } from './RatingSlab';
import type { AlbumRatingSummary } from '../../hooks/useAlbumRatingsSummary';
import { confidenceLabel, type CalibrationTier } from '../../hooks/useCalibrationGate';

// Score-level segmented indicator: 4 segments, filled count tracks confidenceTier directly
// (none=1, medium=2, high=3, very_high=4) — purely presentational on top of the tier already
// computed for the label, no new backend signal. Widths sum to 120px total including gaps
// per the Figma spec (score-level-indicator brief): (120 - 3*4) / 4 = 27px per segment.
const TIER_SEGMENT_COUNT: Record<CalibrationTier, number> = {
  none: 1,
  medium: 2,
  high: 3,
  very_high: 4,
};

interface RatingProgressBoxProps {
  ratedCount: number;
  totalCount: number;
  ratingSummary: AlbumRatingSummary | undefined;
  confidenceTier: CalibrationTier;
}

// Solver point estimates now come from a single jointly-solved feasible point (see
// solver.ts's computeChebyshevCenter), so a fully-rated profile's score is <= 1 by
// construction, not just in the common case — the old independent-midpoint method could
// overshoot (confirmed live: 1.308 on real production data, see
// docs/decisions/criteria-calibration/criteria-calibration-joint-point-estimate.md). SCORE_OVERFLOW_EPSILON
// tolerates only LP solver float noise; anything past it means the fix isn't holding for
// some reason and is worth knowing about, not silently clamping away again.
const SCORE_OVERFLOW_EPSILON = 1e-4;

export function RatingProgressBox({
  ratedCount,
  totalCount,
  ratingSummary,
  confidenceTier,
}: RatingProgressBoxProps) {
  // Pending on ratedCount alone, not on ratingSummary's presence — ratingSummary refetches
  // asynchronously after the last save, so gating on it instead would leave a stale "—" flash
  // between the final pick and the refetch resolving.
  const isPending = ratedCount < totalCount;
  const rankValue = ratingSummary ? `#${ratingSummary.rank}` : '—';
  if (ratingSummary && ratingSummary.score > 1 + SCORE_OVERFLOW_EPSILON) {
    console.warn(
      `RatingProgressBox: score ${ratingSummary.score} exceeds the expected <= 1 bound — the joint-point-estimate normalization fix may not be holding for this account.`
    );
  }
  const scoreValue = ratingSummary
    ? `${Math.min(100, Math.round(ratingSummary.score * 100))}%`
    : '—';

  return (
    <AnimatePresence mode="wait" initial={false}>
      {isPending ? (
        <motion.div
          key="progress"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <RatingSlab
            label="Evaluation progress"
            value={String(ratedCount)}
            valueSuffix={` / ${totalCount}`}
            variant="progress"
          />
        </motion.div>
      ) : (
        <motion.div
          key="final"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <VStack align="stretch" gap={2}>
            <Flex gap={0}>
              <RatingSlab label="Score" value={scoreValue} variant="base" />
              <RatingSlab label="Rank" value={rankValue} variant="high" />
            </Flex>
            {/* album-rating-soft-gate: v1, plain text label — no tooltip/explanation copy,
                reusing the same tier already computed for the (now non-blocking) calibration
                nudge rather than a new scale. Ship and evaluate before building further. */}
            <VStack align="stretch" gap="4px">
              <Flex align="center" justify="space-between" gap={2}>
                <Text
                  fontFamily="mono"
                  fontSize="12px"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.06em"
                  color="text.muted"
                >
                  Score level: {confidenceLabel(confidenceTier)}
                </Text>
                {/* terminology-and-gate-unification: a persistent action, not part of the label
                    itself, always present regardless of tier — no `from` param, since preserving
                    which album sent the user here (return-to-album continuity) is explicitly out
                    of scope for this round; finishing calibration falls back to /favorites.
                    score-level-indicator-redesign: swapped the text link for an icon button
                    reusing FavoritesPage's Evaluate/Listen/Remove ghost-icon pattern; icon color
                    signals urgency instead of button shape — accent while there's more to gain,
                    muted once `very_high` ("Sharp") is reached. Tooltip is hover-only by design
                    (see the brief's "Tooltip" section) — the segment bar already communicates
                    urgency permanently, so the tooltip's only job is naming the destination. */}
                <Tooltip content="Go to calibration">
                  <IconButton
                    asChild
                    aria-label="Go to calibration"
                    data-testid="calibration-action"
                    data-muted={confidenceTier === 'very_high'}
                    size="sm"
                    variant="ghost"
                    color={confidenceTier === 'very_high' ? 'text.muted' : 'accent.text'}
                    _hover={{ bg: 'whiteAlpha.100' }}
                  >
                    <RouterLink to="/calibration" title="Go to calibration">
                      <LuSlidersVertical />
                    </RouterLink>
                  </IconButton>
                </Tooltip>
              </Flex>
              <Flex gap="4px" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <Box
                    key={i}
                    data-testid="tier-segment"
                    data-filled={i < TIER_SEGMENT_COUNT[confidenceTier]}
                    w="27px"
                    h="6px"
                    bg={i < TIER_SEGMENT_COUNT[confidenceTier] ? 'accent.border' : 'ink.700'}
                  />
                ))}
              </Flex>
            </VStack>
          </VStack>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
