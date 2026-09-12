import { Box, Button, Flex, Text, VStack } from '@chakra-ui/react';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import { CriteriaCarousel } from './CriteriaCarousel';
import { primaryButton } from '../../theme';

interface GuideTabProps {
  catalog: CriteriaCatalog;
  onStart: () => void;
}

// Intro + criteria-preview carousel + explicit "Start Calibration" CTA (brief §5). No
// TierAccuracyBadge here — CalibrationPageHeader already hides it until the user has
// answered something, which is exactly the round-0 rule this tab cares about.
//
// Desktop (>= 768px / 48em) shows a 3-cards-at-once carousel with arrows (6 criteria don't all
// fit, and 3 is what leaves each card wide enough to actually read — see CriteriaCarousel's own
// sizing note); mobile (< 768px) shows one card at a time. Both are mounted simultaneously and
// CSS-hidden per breakpoint — matching AlbumRatingPage.tsx's DesktopRatingLayout/
// MobileRatingLayout split — not `useBreakpointValue`, which this project avoids for jsdom
// testability (see AlbumRatingPage.tsx, CLAUDE.md).
export function GuideTab({ catalog, onStart }: GuideTabProps) {
  return (
    <VStack gap={8} align="stretch">
      {/* The count comes from the catalog, not the word "six": the criteria set is data, and a
        hardcoded number would quietly become a lie if it ever changed. Saying it at all is the
        point — the carousel shows 3 at a time, so nothing otherwise tells you how many exist.
        Rendered here rather than passed into the carousel: the controls no longer sit on this
        row, so the intro no longer needs the carousel's context, and keeping it here means one
        copy in the DOM instead of one per breakpoint-mounted carousel. */}
      <Text color="text.dim" fontFamily="body" maxW="2xl">
        Criteria Calibration compares your criteria two at a time to figure out what matters most to
        you. It builds a personal weighting used to score every album you rate — here&apos;s what
        each of the {catalog.entries.length} criteria measures.
      </Text>

      <Box css={{ '@media (max-width: 47.9375em)': { display: 'none' } }}>
        <CriteriaCarousel catalog={catalog} slidesPerPage={3} />
      </Box>
      <Box css={{ '@media (min-width: 48em)': { display: 'none' } }}>
        <CriteriaCarousel catalog={catalog} slidesPerPage={1} />
      </Box>

      <Flex justify="center">
        <Button {...primaryButton} size="lg" onClick={onStart}>
          Start Calibration
        </Button>
      </Flex>
    </VStack>
  );
}
