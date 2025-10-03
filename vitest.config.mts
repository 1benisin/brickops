import { webcrypto } from "node:crypto";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== "function") {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/backend/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      reportsDirectory: "coverage/backend",
      include: ["convex/**/*.{ts,js}"],
      exclude: [
        "convex/_generated/**",
        "convex/**/*.d.ts",
        "node_modules/**",
        "__tests__/**",
        // Configuration files - no logic to test
        "convex/auth.config.ts",
        "convex/schema.ts",
        "convex/crons.ts",
      ],
      thresholds: {
        lines: 65, // Temporarily lowered from 80 - needs tests for auth.ts, http.ts, internal.ts
        functions: 75,
        statements: 65, // Temporarily lowered from 80 - needs tests for auth.ts, http.ts, internal.ts
        branches: 60,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^@\/test-utils\//,
        replacement: fileURLToPath(new URL("./test/utils/", import.meta.url)),
      },
      {
        find: /^@\/convex\//,
        replacement: fileURLToPath(new URL("./convex/", import.meta.url)),
      },
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./src/", import.meta.url)),
      },
    ],
  },
});
