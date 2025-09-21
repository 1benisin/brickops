import { webcrypto } from "node:crypto";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== "function") {
  // @ts-expect-error - assign node webcrypto so Vite can access crypto APIs during bundling
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
      thresholds: {
        lines: 80,
        functions: 75,
        statements: 80,
        branches: 60,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: "@/test-utils",
        replacement: fileURLToPath(new URL("./test/utils", import.meta.url)),
      },
      {
        find: "@/convex",
        replacement: fileURLToPath(new URL("./convex", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
});
