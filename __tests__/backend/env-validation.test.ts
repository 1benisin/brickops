import { describe, expect, it } from "vitest";
import { loadEnv } from "@/lib/env";

describe("environment validation", () => {
  it("returns parsed env when values are valid", () => {
    const result = loadEnv({
      NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
      CONVEX_DEPLOYMENT: "staging",
    });

    expect(result).toEqual({
      NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
      CONVEX_DEPLOYMENT: "staging",
    });
  });

  it("defaults CONVEX_DEPLOYMENT when omitted", () => {
    const result = loadEnv({
      NEXT_PUBLIC_CONVEX_URL: "https://example.convex.cloud",
    });

    expect(result.CONVEX_DEPLOYMENT).toBe("dev");
  });

  it("throws when NEXT_PUBLIC_CONVEX_URL is missing", () => {
    expect(() =>
      loadEnv({
        CONVEX_DEPLOYMENT: "dev",
      }),
    ).toThrow(/NEXT_PUBLIC_CONVEX_URL/);
  });

  it("throws when NEXT_PUBLIC_CONVEX_URL is not a valid URL", () => {
    expect(() =>
      loadEnv({
        NEXT_PUBLIC_CONVEX_URL: "notaurl",
      }),
    ).toThrow(/NEXT_PUBLIC_CONVEX_URL/);
  });
});
