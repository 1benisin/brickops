const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
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
  ],
  coverageDirectory: "coverage/frontend",
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 75,
      lines: 80,
      statements: 80,
    },
  },
};

module.exports = createJestConfig(customJestConfig);
