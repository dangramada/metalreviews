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
