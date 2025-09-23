import "@testing-library/jest-dom";

import { resetMockNavigation } from "@/test-utils/next-navigation";

// Suppress Next.js internal act warnings in tests
const originalError = console.error;
// eslint-disable-next-line no-undef
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("The current testing environment is not configured to support act")
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

// eslint-disable-next-line no-undef
afterAll(() => {
  console.error = originalError;
});

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

  global.ResizeObserver = ResizeObserver;
}
