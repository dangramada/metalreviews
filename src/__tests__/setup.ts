import '@testing-library/jest-dom';

// jsdom doesn't implement ResizeObserver; Chakra v3's Menu positioning
// (@zag-js/popper via @floating-ui/dom) calls it asynchronously after tests
// complete, producing unhandled rejections. A no-op stub silences these.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
