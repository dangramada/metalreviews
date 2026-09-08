import '@testing-library/jest-dom';

// jsdom doesn't implement ResizeObserver; Chakra v3's Menu positioning
// (@zag-js/popper via @floating-ui/dom) calls it asynchronously after tests
// complete, producing unhandled rejections. A no-op stub silences these.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom also doesn't implement IntersectionObserver; Chakra v3's Carousel
// (@zag-js/carousel, first used by GuideTab's CriteriaCarousel) calls it to track which
// slides are in view. Same no-op-stub treatment as ResizeObserver above.
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds = [];
} as unknown as typeof IntersectionObserver;

// jsdom implements neither Element.scrollTo nor Element.scrollBy (it defines them on window
// only). @zag-js/carousel calls el.scrollTo on its item-group to page between slides — which it
// only does now that the item group is a real scroll container: before 2026-09-08 that element
// carried no styles at all (Chakra 3.36 ships no carousel slot recipe), so nothing ever
// scrolled and the call was never reached. Without these stubs the call throws as an
// *unhandled* error rather than a test failure, which Vitest correctly warns can mask false
// positives. No-op stubs, matching the two observers above: nothing in the suite asserts on
// scroll position, and jsdom has no layout to scroll anyway.
Element.prototype.scrollTo = function scrollTo() {};
Element.prototype.scrollBy = function scrollBy() {};
