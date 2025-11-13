import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeBlError,
  normalizeBlStoreError,
  type BLResponseMeta,
} from "@/convex/marketplaces/bricklink/errors";
import type { NormalizedBlError } from "@/convex/marketplaces/bricklink/errors";
import { ConvexError } from "convex/values";

const { normalizeApiErrorMock } = vi.hoisted(() => ({
  normalizeApiErrorMock: vi.fn(),
}));

vi.mock("@/convex/lib/external/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/convex/lib/external/types")>();
  return {
    ...actual,
    normalizeApiError: normalizeApiErrorMock,
  };
});

describe("BrickLink error normalization", () => {
  beforeEach(() => {
    normalizeApiErrorMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("normalizeBlError", () => {
    const meta = (overrides: Partial<BLResponseMeta> = {}): BLResponseMeta => ({
      code: 999,
      message: "BrickLink said nope",
      description: "Additional detail",
      ...overrides,
    });

    it.each<
      [
        string,
        Parameters<typeof normalizeBlError>,
        Pick<NormalizedBlError, "code" | "httpStatus"> & { details?: Record<string, unknown> },
      ]
    >([
      [
        "maps 401 responses to authentication errors",
        [meta({ code: 401, message: "Auth failed" }), 401],
        { code: "AUTHENTICATION_ERROR", httpStatus: 401 },
      ],
      [
        "maps 429 responses to rate limit errors and preserves retry-after detail",
        [meta({ code: 29, message: "Too many" }), 429, { retryAfter: 7000 }],
        {
          code: "RATE_LIMITED",
          httpStatus: 429,
          details: { retryAfter: 7000 },
        },
      ],
      [
        "maps other 4xx responses to bad request",
        [meta({ code: 400, message: "Bad data" }), 404],
        { code: "BAD_REQUEST", httpStatus: 404 },
      ],
      [
        "maps 5xx responses to upstream failure",
        [meta({ code: 500, message: "Downstream" }), 503],
        { code: "UPSTREAM_FAILURE", httpStatus: 503 },
      ],
      [
        "falls back to unknown error when status bucket not matched",
        [meta({ code: 123, message: "Weird" })],
        { code: "UNKNOWN_ERROR", httpStatus: 123 },
      ],
    ])("%s", (_, args, expected) => {
      const result = normalizeBlError(...args);

      expect(result.service).toBe("bricklink");
      expect(result.message).toBe(args[0].message ?? "Weird");
      expect(result.blCode).toBe(args[0].code);
      expect(result.httpStatus).toBe(expected.httpStatus);
      expect(result.code).toBe(expected.code);
      expect(result.details).toMatchObject({
        description: args[0].description,
        ...(expected.details ?? {}),
      });
    });
  });

  describe("normalizeBlStoreError", () => {
    it("converts ConvexError payloads by mapping codes and honoring retryAfterMs metadata", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-03-01T12:00:00.000Z"));

      const convexError = new ConvexError({
        code: "RATE_LIMIT_EXCEEDED",
        message: "Slow down",
        httpStatus: 429,
        retryAfterMs: 9000,
      });

      const result = normalizeBlStoreError(convexError);

      expect(result.code).toBe("RATE_LIMITED");
      expect(result.retryable).toBe(true);
      expect(result.httpStatus).toBe(429);
      expect(result.rateLimitResetAt).toBe(new Date(Date.now() + 9000).toISOString());
      expect(result.details).toMatchObject({
        code: "RATE_LIMIT_EXCEEDED",
        retryAfterMs: 9000,
      });
    });

    it("respects retryable overrides provided on ConvexError payloads", () => {
      const convexError = new ConvexError({
        code: "SOME_SERVER_ISSUE",
        httpStatus: 503,
        retryable: false,
      });

      const result = normalizeBlStoreError(convexError);

      expect(result.code).toBe("SERVER_ERROR");
      expect(result.retryable).toBe(false);
      expect(result.httpStatus).toBe(503);
    });

    it("normalizes generic errors via normalizeApiError and extracts retry hints from headers", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-03-02T08:00:00.000Z"));

      normalizeApiErrorMock.mockReturnValue({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "BrickLink throttle",
          details: {
            status: 429,
            headers: { "Retry-After": "5" },
          },
          timestamp: new Date().toISOString(),
          requestId: "req-123",
        },
      });

      const result = normalizeBlStoreError(new Error("raw upstream failure"));

      expect(normalizeApiErrorMock).toHaveBeenCalledWith("bricklink", expect.any(Error));
      expect(result.code).toBe("RATE_LIMITED");
      expect(result.retryable).toBe(true);
      expect(result.httpStatus).toBe(429);
      expect(result.rateLimitResetAt).toBe(new Date(Date.now() + 5000).toISOString());
    });

    it("falls back to retry-after metadata specified in response body", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-03-02T09:00:00.000Z"));

      normalizeApiErrorMock.mockReturnValue({
        error: {
          code: "SERVER_EXPLODED",
          message: "Upstream exploded",
          details: {
            status: 503,
            body: {
              meta: { retry_after: 12 },
            },
          },
          timestamp: new Date().toISOString(),
          requestId: "req-456",
        },
      });

      const result = normalizeBlStoreError("boom");

      expect(result.code).toBe("SERVER_ERROR");
      expect(result.retryable).toBe(true);
      expect(result.httpStatus).toBe(503);
      expect(result.rateLimitResetAt).toBe(new Date(Date.now() + 12000).toISOString());
    });
  });
});

