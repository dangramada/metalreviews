import { Fragment } from 'react';
import { Box, Flex, Heading, Separator, Text, VStack } from '@chakra-ui/react';
import {
  CarouselIndicator,
  CarouselItem,
  CarouselItemGroup,
  CarouselNextButton,
  CarouselPrevButton,
  CarouselRoot,
} from '../ui/carousel';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import { CriterionLevelDetail } from './CriterionLevelDetail';
import { cardTitleBand } from '../../theme';

interface CriteriaCarouselProps {
  catalog: CriteriaCatalog;
  slidesPerPage: number;
  // Mobile only (GuideTab's slidesPerPage=1 instance): trades the gutter Prev/Next buttons for a
  // row of tappable pagination dots below the card header, so the card can render at full width
  // instead of ceding ~100px+ to gutters either side. Desktop (slidesPerPage=3) omits this and
  // keeps the gutter-button layout below unchanged.
  inlineControls?: boolean;
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
export function CriteriaCarousel({
  catalog,
  slidesPerPage,
  inlineControls,
}: CriteriaCarouselProps) {
  const showControls = catalog.entries.length > slidesPerPage;

  return (
    // `spacing` must be a real CSS length, not a Chakra scale token: zag interpolates it raw
    // into `--slide-item-size`'s calc(), so a bare "4" produced `calc(100% / 3 - 4 * 2 / 3)` —
    // a unitless number subtracted from a percentage, which is invalid and voided the whole
    // expression (part of why every card rendered at its natural width).
    <CarouselRoot slideCount={catalog.entries.length} slidesPerPage={slidesPerPage} spacing="1rem">
      {/* Two control layouts share the same slides. Gutter mode (default, desktop) flanks the
        slides with full-size Prev/Next buttons — see the ONE-set-of-controls comment inside the
        `!inlineControls` branch below. Inline mode (mobile, GuideTab's slidesPerPage=1 instance)
        skips the gutters entirely — no arrows fit a legible width in a 375px viewport once the
        card itself needs the room — and puts small chevrons + a page counter on each card's own
        header instead (below, in the per-entry map). Swiping the slides directly also still
        works in inline mode: CarouselItemGroupStyled's `overflowX: auto` +
        `scrollSnapType: x mandatory` (ui/carousel.tsx) already makes it a native touch-scrollable
        container, so removing the gutter buttons doesn't remove a way to page — it removes a
        *second*, space-costly way to do what a swipe already does. */}
      {inlineControls ? (
        <CarouselItemGroup>{renderItems()}</CarouselItemGroup>
      ) : (
        <Flex align="center" gap={3}>
          {/* ONE set of controls, flanking the slides rather than sitting above or below them.
            In GUTTERS, not overlaid on the cards: overlaid arrows would cover the first and last
            card's text, and these cards are 500px+ tall so there is no quiet corner to sit in.
            align="center" keeps them level with the cards at any card height. The cost is real
            and accepted — roughly 104px of width leaves the slides for the two buttons and
            their gaps. */}
          {showControls && <CarouselPrevButton />}
          <Box flex="1" minW={0}>
            <CarouselItemGroup>{renderItems()}</CarouselItemGroup>
          </Box>
          {showControls && <CarouselNextButton />}
        </Flex>
      )}
    </CarouselRoot>
  );

  function renderItems() {
    return catalog.entries.map((entry) => (
      // Snap points must mark PAGES, not slides. zag derives its pages straight from the
      // DOM's CSS scroll-snap positions (carousel.machine.mjs: `pageSnapPoints` from the
      // element's snap positions, and `canScrollNext = page < pageSnapPoints.length - 1`).
      // The scaffold's default puts scroll-snap-align on every item, so with 6 slides zag
      // counted 6 pages while slidesPerPage=3 makes only 4 of them reachable before the
      // scroll saturates — leaving Next enabled at the visual end, and taking a further
      // no-op click to disable. Snapping every Nth item gives one snap point per page, so
      // the index and the scroll run out together.
      <CarouselItem
        key={entry.index}
        index={entry.index}
        scrollSnapAlign={entry.index % slidesPerPage === 0 ? 'start' : 'none'}
      >
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

          {inlineControls && showControls && (
            // Pagination dots, one per criterion, replacing an earlier inline-chevrons-plus-
            // counter header that turned out to be the wrong shape for this brief. Square, not
            // round — `radii.full` is 0px throughout this app's design system (see
            // design-tokens.md), so a "dot" here is a small square tick, same language as every
            // other indicator in the app. `CarouselIndicator` (ui/carousel.tsx, itself
            // `Carousel.Indicator` re-exported unstyled) already wires `onClick` to jump straight
            // to that page (zag's `PAGE.SET`) and stamps `data-current` on the active one — no
            // custom click handling needed, just styling `&[data-current]`. Its built-in
            // `aria-label` is a generic "Item N" translation with no criterion name in it, so
            // each one gets an explicit `aria-label` naming the destination, same reasoning as
            // any icon-only control needing an accessible name.
            <Flex gap={3}>
              {catalog.entries.map((e) => (
                <CarouselIndicator
                  key={e.index}
                  index={e.index}
                  aria-label={`Go to ${e.name}, ${e.index + 1} of ${catalog.entries.length}`}
                  w={3}
                  h={3}
                  p={0}
                  minW={0}
                  borderRadius="none"
                  border="1px solid"
                  borderColor="border.rule"
                  bg="transparent"
                  cursor="pointer"
                  css={{ '&[data-current]': { bg: 'text.primary', borderColor: 'text.primary' } }}
                />
              ))}
            </Flex>
          )}

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
    ));
  }
}
