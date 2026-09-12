import { Fragment } from 'react';
import { Heading, Separator, Text, VStack } from '@chakra-ui/react';
import { CarouselControls, CarouselItem, CarouselItemGroup, CarouselRoot } from '../ui/carousel';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import { CriterionLevelDetail } from './CriterionLevelDetail';

interface CriteriaCarouselProps {
  catalog: CriteriaCatalog;
  slidesPerPage: number;
}

// One card per criterion: label, one-line "what this measures" summary
// (criteria.description, plumbed through useCriteriaCatalog.ts for this), and all 5 levels
// worst-to-best shown directly — no accordion/expand-collapse, deliberately (brief §5: a
// mid-session refresher needs the explanation immediately, not behind a tap). Built on the
// existing unused Chakra Carousel scaffold (components/ui/carousel.tsx); `slidesPerPage` is a
// real Carousel.Root prop (zag-js), not something this component has to emulate by grouping
// items manually.
//
// Same component rendered twice by GuideTab at different `slidesPerPage` values (desktop vs
// mobile), CSS-hidden per breakpoint rather than `useBreakpointValue` — see GuideTab.tsx.
//
// Sizing is deliberate, not incidental (2026-09-08): a card carries a name, a summary and five
// level descriptions, so it needs real width and real type sizes to be readable at a glance. It
// previously sat at 4-per-page inside a 896px container, giving each card ~162px of measured
// width with xs-sized level text — legible in principle, unreadable in practice. The page is now
// full-width and this is 3-per-page, so the same card gets roughly twice the room.
//
// 2026-09-12: the card now matches the calibration comparison card — 2px border.ruleStrong,
// square, 24px padding — and renders each level through the shared CriterionLevelDetail, so the
// level names are sentence case at the same size as the comparison card's, with the same
// Separator rules between them that CriterionLevelList uses. No hover treatment: unlike an
// OptionCard these are not selectable, and hover feedback on something unclickable invites a
// click. The criterion NAME is still a Heading pending Dan's `cardTitleBand` decision.
export function CriteriaCarousel({ catalog, slidesPerPage }: CriteriaCarouselProps) {
  const showControls = catalog.entries.length > slidesPerPage;

  return (
    // `spacing` must be a real CSS length, not a Chakra scale token: zag interpolates it raw
    // into `--slide-item-size`'s calc(), so a bare "4" produced `calc(100% / 3 - 4 * 2 / 3)` —
    // a unitless number subtracted from a percentage, which is invalid and voided the whole
    // expression (part of why every card rendered at its natural width).
    <CarouselRoot slideCount={catalog.entries.length} slidesPerPage={slidesPerPage} spacing="1rem">
      <CarouselItemGroup>
        {catalog.entries.map((entry) => (
          <CarouselItem key={entry.index} index={entry.index}>
            <VStack
              align="stretch"
              gap={4}
              p={6}
              h="full"
              border="2px solid"
              borderColor="border.ruleStrong"
              borderRadius="none"
              bg="surface.card"
            >
              <VStack align="stretch" gap={1.5}>
                <Heading size="md" fontFamily="heading" color="text.primary">
                  {entry.name}
                </Heading>
                <Text fontSize="sm" color="text.dim" fontFamily="body">
                  {entry.description}
                </Text>
              </VStack>
              <VStack align="stretch" gap={4}>
                {[1, 2, 3, 4, 5].map((lvl, i) => {
                  const level = entry.levels[lvl];
                  if (!level) return null;
                  return (
                    <Fragment key={lvl}>
                      {i > 0 && <Separator borderColor="border.rule" />}
                      <CriterionLevelDetail
                        levelName={level.label}
                        description={level.description}
                      />
                    </Fragment>
                  );
                })}
              </VStack>
            </VStack>
          </CarouselItem>
        ))}
      </CarouselItemGroup>
      {showControls && <CarouselControls />}
    </CarouselRoot>
  );
}
