// Evaluation progress / rank+score display — extracted from DesktopRatingLayout's Section 3
// (album-rating-page-desktop-redesign, 2026-08-05/06 motion pass) so MobileRatingLayout's
// stage-1 restructure can reuse the exact same box instead of hand-duplicating the JSX. Same
// visual output and AnimatePresence crossfade as before extraction — see
// docs/decisions/album-rating-page.md for why `mode="wait"` was chosen over a simultaneous
// crossfade (the pending->final swap changes child count, not just content).
import { Flex } from '@chakra-ui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { RatingSlab } from './RatingSlab';
import type { AlbumRatingSummary } from '../../hooks/useAlbumRatingsSummary';

interface RatingProgressBoxProps {
  ratedCount: number;
  totalCount: number;
  ratingSummary: AlbumRatingSummary | undefined;
}

// Solver point estimates now come from a single jointly-solved feasible point (see
// solver.ts's computeChebyshevCenter), so a fully-rated profile's score is <= 1 by
// construction, not just in the common case — the old independent-midpoint method could
// overshoot (confirmed live: 1.308 on real production data, see
// docs/decisions/criteria-calibration-joint-point-estimate.md). SCORE_OVERFLOW_EPSILON
// tolerates only LP solver float noise; anything past it means the fix isn't holding for
// some reason and is worth knowing about, not silently clamping away again.
const SCORE_OVERFLOW_EPSILON = 1e-4;

export function RatingProgressBox({
  ratedCount,
  totalCount,
  ratingSummary,
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
          <Flex gap={0}>
            <RatingSlab label="Score" value={scoreValue} variant="base" />
            <RatingSlab label="Rank" value={rankValue} variant="high" />
          </Flex>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
