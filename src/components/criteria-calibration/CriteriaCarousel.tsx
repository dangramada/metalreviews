import { Box, Heading, Text, VStack } from '@chakra-ui/react';
import { CarouselControls, CarouselItem, CarouselItemGroup, CarouselRoot } from '../ui/carousel';
import type { CriteriaCatalog } from '../../lib/criteria-calibration/criteriaCatalog';
import { formatLevelDescription } from '../../lib/criteria-calibration/criteriaCatalog';

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
export function CriteriaCarousel({ catalog, slidesPerPage }: CriteriaCarouselProps) {
  const showControls = catalog.entries.length > slidesPerPage;

  return (
    <CarouselRoot slideCount={catalog.entries.length} slidesPerPage={slidesPerPage} spacing="4">
      <CarouselItemGroup>
        {catalog.entries.map((entry) => (
          <CarouselItem key={entry.index} index={entry.index}>
            <VStack
              align="stretch"
              gap={3}
              p={4}
              h="full"
              borderWidth="1px"
              borderColor="border.default"
              borderRadius="md"
              bg="surface.card"
            >
              <Heading size="sm" fontFamily="heading" color="text.primary">
                {entry.name}
              </Heading>
              <Text fontSize="sm" color="text.dim" fontFamily="body">
                {entry.description}
              </Text>
              <VStack align="stretch" gap={1.5}>
                {[1, 2, 3, 4, 5].map((lvl) => {
                  const level = entry.levels[lvl];
                  if (!level) return null;
                  return (
                    <Box key={lvl}>
                      <Text
                        fontSize="xs"
                        fontWeight="bold"
                        textTransform="uppercase"
                        letterSpacing="0.04em"
                        color="text.primary"
                      >
                        {level.label}
                      </Text>
                      <Text fontSize="xs" color="text.dim" fontFamily="body">
                        {formatLevelDescription(level.description)}
                      </Text>
                    </Box>
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
