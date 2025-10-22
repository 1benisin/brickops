import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const requiredPaths = [
  "convex/users",
  "convex/inventory",
  "convex/catalog",
  "convex/identify",
  "convex/marketplace",
  "convex/schema.ts",
  "src/app",
  "src/components",
  "src/hooks",
  "src/lib",
  "src/middleware.ts",
  "__tests__/frontend",
  "__tests__/backend",
  "__tests__/e2e",
  "docs/architecture",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
];

function assertPathExists(relativePath: string) {
  const absolutePath = join(process.cwd(), relativePath);
  expect(() => accessSync(absolutePath, constants.F_OK)).not.toThrow();
}

describe("repository structure", () => {
  it("includes required scaffolding paths", () => {
    requiredPaths.forEach(assertPathExists);
  });
});
