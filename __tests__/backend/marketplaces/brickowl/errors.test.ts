import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";

import { normalizeBoStoreError } from "@/convex/marketplaces/brickowl/errors";

describe("normalizeBoStoreError", () => {
  it("converts ConvexError metadata into StoreOperationError shape", () => {
    const correlationId = "corr-123";
    const error = new ConvexError({
      code: "RATE_LIMITED",
      message: "Try again later",
      httpStatus: 429,
      correlationId,
      retryAfterMs: 2000,
    });

    const normalized = normalizeBoStoreError(error);

    expect(normalized).toMatchObject({
      code: "RATE_LIMITED",
      message: "Try again later",
      retryable: true,
      httpStatus: 429,
      rateLimitResetAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it("falls back to UNEXPECTED_ERROR for unknown structures", () => {
    const normalized = normalizeBoStoreError(new Error("network exploded"));

    expect(normalized.code).toBe("UNEXPECTED_ERROR");
    expect(normalized.retryable).toBe(false);
  });

  it("maps provider-specific codes into canonical StoreError codes", () => {
    const error = new ConvexError({
      code: "NETWORK_ERROR",
      message: "Temporary network failure",
      httpStatus: 503,
    });

    const normalized = normalizeBoStoreError(error);

    expect(normalized.code).toBe("NETWORK");
    expect(normalized.retryable).toBe(true);
  });
});
