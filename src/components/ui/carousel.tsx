'use client';

import { Carousel } from '@chakra-ui/react';
import { Box, IconButton, Image } from '@chakra-ui/react';
import * as React from 'react';
import { LuChevronLeft, LuChevronRight, LuPause, LuPlay } from 'react-icons/lu';

interface CarouselRootProps extends Carousel.RootProps {
  withAutoplay?: boolean;
}

export const CarouselRoot = React.forwardRef<HTMLDivElement, CarouselRootProps>(
  function CarouselRoot(props, ref) {
    const { children, withAutoplay, ...rest } = props;
    return (
      <Carousel.Root {...rest} ref={ref}>
        {children}
        {withAutoplay && (
          <Box position="absolute" bottom="var(--carousel-spacing)" right="var(--carousel-spacing)">
            <Carousel.AutoplayTrigger asChild>
              <IconButton aria-label="Toggle autoplay" size="sm" variant="ghost">
                <AutoplayIcon />
              </IconButton>
            </Carousel.AutoplayTrigger>
          </Box>
        )}
      </Carousel.Root>
    );
  }
);

// Chakra 3.36 ships NO slot recipe for `carousel` (checked: nothing under
// @chakra-ui/react/dist/esm/theme/slot-recipes). Every Carousel part therefore renders
// completely unstyled, and the two triggers in particular collapsed to a 0x0 box — the chevron
// SVG was in the DOM, the button had no size, so the carousel looked like a static squashed
// grid with no way to page it (found live 2026-09-08). The triggers below are given explicit
// IconButton styling and the control an explicit layout, since there is no theme layer to
// inherit either from. Remove this if a future Chakra version adds the recipe.
export const CarouselControls = React.forwardRef<HTMLDivElement, Carousel.ControlProps>(
  function CarouselControls(props, ref) {
    return (
      <Carousel.Control
        ref={ref}
        display="flex"
        justifyContent="flex-end"
        gap="2"
        mt="4"
        {...props}
      >
        <Carousel.PrevTrigger asChild>
          <IconButton aria-label="Previous" size="sm" variant="outline" colorPalette="gray">
            <LuChevronLeft />
          </IconButton>
        </Carousel.PrevTrigger>
        <Carousel.NextTrigger asChild>
          <IconButton aria-label="Next" size="sm" variant="outline" colorPalette="gray">
            <LuChevronRight />
          </IconButton>
        </Carousel.NextTrigger>
      </Carousel.Control>
    );
  }
);

export const CarouselIndicators = React.forwardRef<HTMLDivElement, Carousel.IndicatorGroupProps>(
  function CarouselIndicators(props, ref) {
    return <Carousel.IndicatorGroup ref={ref} {...props} />;
  }
);

// Same missing-recipe problem as CarouselControls above, and the reason `slidesPerPage` looked
// like it did nothing: zag DOES publish `--slides-per-page` / `--slide-spacing` /
// `--slide-item-size` on the root, but with no recipe nothing consumes them, so every item laid
// out at its natural width and all six sat side by side regardless of the prop. The item group
// is the scroll/snap container and each item is sized from `--slide-item-size`.
export const CarouselItemGroupStyled = React.forwardRef<HTMLDivElement, Carousel.ItemGroupProps>(
  function CarouselItemGroupStyled(props, ref) {
    return (
      <Carousel.ItemGroup
        ref={ref}
        display="flex"
        gap="var(--slide-spacing)"
        overflowX="auto"
        scrollSnapType="x mandatory"
        scrollBehavior="smooth"
        // The triggers are the intended control; a visible native scrollbar under the cards is
        // just noise. Scrolling by wheel/trackpad/touch still works.
        css={{
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
        {...props}
      />
    );
  }
);

export const CarouselItem = React.forwardRef<
  HTMLDivElement,
  Carousel.ItemProps & { src?: string; alt?: string }
>(function CarouselItem({ src, alt, children, ...rest }, ref) {
  return (
    <Carousel.Item flex="0 0 var(--slide-item-size)" scrollSnapAlign="start" {...rest} ref={ref}>
      {src ? (
        <Image src={src} alt={alt} w="full" h="300px" objectFit="cover" borderRadius="md" />
      ) : (
        children
      )}
    </Carousel.Item>
  );
});

const AutoplayIcon = () => {
  const [running, setRunning] = React.useState(true);
  const toggle = () => setRunning(!running);
  return <Box onClick={toggle}>{running ? <LuPause /> : <LuPlay />}</Box>;
};

export const CarouselItemGroup = CarouselItemGroupStyled;
export const CarouselIndicator = Carousel.Indicator;
export const CarouselPrevTrigger = Carousel.PrevTrigger;
export const CarouselNextTrigger = Carousel.NextTrigger;
export const CarouselAutoplayTrigger = Carousel.AutoplayTrigger;
