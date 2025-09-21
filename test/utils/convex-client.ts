/* eslint-disable @typescript-eslint/no-explicit-any, no-undef */
import type { ConvexReactClient } from "convex/react";

export type MockWatch = {
  onUpdate: jest.Mock<() => void, [() => void]>;
  localQueryResult: jest.Mock<unknown | undefined, []>;
  journal: jest.Mock<unknown | undefined, []>;
};

type ConvexClientOverrides = Partial<ConvexReactClient> & {
  watchQuery?: jest.Mock<MockWatch, any>;
};

export const createMockConvexClient = (
  overrides: Partial<ConvexClientOverrides> = {},
): ConvexReactClient => {
  const watchQuery = jest.fn(
    (): MockWatch => ({
      onUpdate: jest.fn(() => () => undefined),
      localQueryResult: jest.fn(),
      journal: jest.fn(),
    }),
  );

  const base: Partial<ConvexReactClient> = {
    mutation: jest.fn(),
    action: jest.fn(),
    watchQuery,
    prewarmQuery: jest.fn(),
    connectionState: jest.fn(() => ({
      hasInflightRequests: false,
      isWebSocketConnected: false,
      timeOfOldestInflightRequest: null,
      hasEverConnected: false,
      connectionCount: 0,
      connectionRetries: 0,
      inflightMutations: 0,
      inflightActions: 0,
    })),
    subscribeToConnectionState: jest.fn(() => () => undefined),
    close: jest.fn(() => Promise.resolve()),
    setAuth: jest.fn(),
    clearAuth: jest.fn(),
    url: "https://mock.convex.test",
    ...overrides,
  };

  return base as ConvexReactClient;
};
