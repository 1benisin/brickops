import "@testing-library/jest-dom";

import { resetMockNavigation } from "@/test-utils/next-navigation";

// eslint-disable-next-line no-undef
beforeEach(() => {
  resetMockNavigation();
});

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

if (typeof global.ResizeObserver === "undefined") {
  class ResizeObserver {
    observe() {
      return undefined;
    }

    unobserve() {
      return undefined;
    }

    disconnect() {
      return undefined;
    }
  }

  // @ts-expect-error - Provide minimal ResizeObserver implementation for tests
  global.ResizeObserver = ResizeObserver;
}
