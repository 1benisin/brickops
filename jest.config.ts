import nextJest from "next/jest";
import type { Config } from "jest";

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig: Config = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jsdom",
  testMatch: ["**/__tests__/frontend/**/*.test.(ts|tsx)"],
  moduleNameMapper: {
    "^@/test-utils/(.*)$": "<rootDir>/test/utils/$1",
    "^@/convex/(.*)$": "<rootDir>/convex/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^next/navigation$": "<rootDir>/test/mocks/next-navigation.ts",
    "^.+\\.(css|less|sass|scss)$": "<rootDir>/test/mocks/style-mock.ts",
  },
  collectCoverageFrom: [
    "src/components/**/*.{ts,tsx}",
    "src/hooks/**/*.{ts,tsx}",
    "src/lib/**/*.{ts,tsx}",
    "!src/components/**/examples/**",
    "!src/components/providers/**",
    "!src/components/ui/index.ts",
    "!src/components/layout/index.ts",
    "!src/lib/index.ts",
    "!src/hooks/useExample.ts", // Example hook - not production code
    "!src/lib/convexClient.ts", // Singleton - better covered by integration tests
  ],
  coverageDirectory: "coverage/frontend",
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 65,
      statements: 65,
    },
  },
};

export default createJestConfig(customJestConfig);
