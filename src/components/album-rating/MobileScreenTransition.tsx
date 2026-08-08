// Owns ONLY the slide-transition mechanics between MobileRatingLayout's two screens — nothing
// about feedback animation, row highlight, or the progress-box snapshot delay lives here, on
// purpose (stage 4a revision 2): if the slide approach doesn't hold up under more live testing,
// swapping in a different transition (e.g. a bottom-sheet reveal) should mean replacing only
// this component's internals, not re-touching MobileRatingLayout's state machine.
//
// A single `translateX` on a two-panel flex track, both panels always mounted side by side —
// not the previous attempt's `AnimatePresence`/mount-unmount approach. That's what fixes the
// "disjointed slide" bug: previously RatingProgressBox was hoisted above the AnimatePresence
// block and toggled via CSS `display`, so it popped independently of the sliding criteria list —
// two uncoordinated animation treatments on what should read as one panel. Here, every zone of a
// screen (album info, progress box, criteria list — or album info, back row, picker) is part of
// the same panel, and the panel itself is what slides; there's nothing left to pop separately.
// See docs/decisions/album-rating-page.md's dated stage-4a revision-2 entry for the full trace.
import type { ReactNode } from 'react';
import { Box } from '@chakra-ui/react';
import { motion } from 'framer-motion';

interface MobileScreenTransitionProps {
  screen: 'overview' | 'detail';
  overview: ReactNode;
  detail: ReactNode;
  durationMs?: number;
}

export function MobileScreenTransition({
  screen,
  overview,
  detail,
  durationMs = 280,
}: MobileScreenTransitionProps) {
  return (
    <Box overflow="hidden" position="relative">
      {/* Track is 200% of the viewport, holding two 50%-wide (= 100%-of-viewport) panels
          side by side. Shifting the track by -50% of its own width brings the second panel
          fully into view — one transform serves both directions (0% -> overview visible,
          -50% -> detail visible), so there's no separate enter/exit variant pair to keep in
          sync, unlike the AnimatePresence approach this replaces. */}
      <motion.div
        style={{ display: 'flex', width: '200%' }}
        animate={{ x: screen === 'overview' ? '0%' : '-50%' }}
        transition={{ duration: durationMs / 1000, ease: 'easeOut' }}
      >
        <Box flexShrink={0} w="50%">
          {overview}
        </Box>
        <Box flexShrink={0} w="50%">
          {detail}
        </Box>
      </motion.div>
    </Box>
  );
}
