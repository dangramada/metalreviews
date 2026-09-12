import { Fragment, type ReactNode } from 'react';
import { Box, Flex, Heading, Separator, Text, VStack } from '@chakra-ui/react';
import { CarouselControls, CarouselItem, CarouselItemGroup, CarouselRoot } from '../ui/carousel';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import { CriterionLevelDetail } from './CriterionLevelDetail';
import { cardTitleBand } from '../../theme';

interface CriteriaCarouselProps {
  catalog: CriteriaCatalog;
  slidesPerPage: number;
  /** Rendered on the same row as the prev/next controls. It lives INSIDE the carousel because
   *  zag's Control must be a descendant of its Root, and the controls belong next to the
   *  intro — where you learn the section exists — rather than under a 500px-tall card. GuideTab
   *  mounts this component twice (desktop/mobile), so the intro exists twice in the DOM with the
   *  hidden copy display:none, which also hides it from assistive tech. */
  intro?: ReactNode;
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
// click, and the criterion name uses `cardTitleBand` so it outranks the level names.
//
// 2026-09-12 (second Guide pass): a full-bleed 2px rule separates the header from the levels, the
// list carries a "Levels" eyebrow, and each level is numbered "N - Label" in CriterionLevelPicker's
// own format — together these say "these five things are a 1-5 scale", which nothing on the card
// previously did.
export function CriteriaCarousel({ catalog, slidesPerPage, intro }: CriteriaCarouselProps) {
  const showControls = catalog.entries.length > slidesPerPage;

  return (
    // `spacing` must be a real CSS length, not a Chakra scale token: zag interpolates it raw
    // into `--slide-item-size`'s calc(), so a bare "4" produced `calc(100% / 3 - 4 * 2 / 3)` —
    // a unitless number subtracted from a percentage, which is invalid and voided the whole
    // expression (part of why every card rendered at its natural width).
    <CarouselRoot slideCount={catalog.entries.length} slidesPerPage={slidesPerPage} spacing="1rem">
      {(intro || showControls) && (
        <Flex align="flex-start" justify="space-between" gap={6} mb={6}>
          {intro}
          {showControls && <CarouselControls mt={0} />}
        </Flex>
      )}
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
              bg="surface.calibrationCard"
            >
              <VStack align="stretch" gap={1.5}>
                {/* `cardTitleBand` — the app's shared band/album title typography (Inter
                  19px/700 uppercase, theme.ts). The criterion name is this card's title and has
                  to outrank the five level names below it; the comparison card's CriterionBadge
                  would have done the opposite, since that badge is deliberately the quietest
                  thing on its own card. Spread onto a Heading exactly as AlbumMetaBlock does. */}
                <Heading as="h3" {...cardTitleBand} color="text.primary">
                  {entry.name}
                </Heading>
                <Text fontSize="sm" color="text.dim" fontFamily="body">
                  {entry.description}
                </Text>
              </VStack>

              {/* Full-bleed 2px rule in the card's own border colour, pulled out past the 24px
                padding (mx={-6}) so it meets both edges and reads as part of the card's
                structure rather than as another list separator. The header was previously the
                only block with nothing under it, and sat 16px from the first level while the
                levels sat 54px apart — so it grouped with the list instead of heading it. */}
              <Box mx={-6} h="2px" bg="border.ruleStrong" />

              <VStack align="stretch" gap={4}>
                <Text
                  fontFamily="mono"
                  fontSize="11px"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.06em"
                  color="text.muted"
                >
                  Levels
                </Text>
                {[1, 2, 3, 4, 5].map((lvl, i) => {
                  const level = entry.levels[lvl];
                  if (!level) return null;
                  return (
                    <Fragment key={lvl}>
                      {i > 0 && <Separator borderColor="border.rule" />}
                      <CriterionLevelDetail
                        levelNumber={lvl}
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
