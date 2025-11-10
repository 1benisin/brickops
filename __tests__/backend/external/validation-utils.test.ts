import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  validateBricklink,
  validateBrickognize,
  validateBrickowl,
  validateExternalApis,
} from "@/convex/lib/external/validate";
import { addMetricListener, clearMetricListeners } from "@/convex/lib/external/metrics";

const successResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
  },
  json: async () => data,
});

describe("External API validation", () => {
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearMetricListeners();
    Object.assign(process.env, {
      BRICKOWL_API_KEY: "brickowl-test",
      BRICKLINK_CONSUMER_KEY: "ck",
      BRICKLINK_CONSUMER_SECRET: "cs",
      BRICKLINK_ACCESS_TOKEN: "at",
      BRICKLINK_TOKEN_SECRET: "ts",
    });

    fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.includes("brickognize.com")) {
        return Promise.resolve(successResponse({ status: "ok" }));
      }

      if (url.includes("bricklink.com")) {
        return Promise.resolve(successResponse({ data: [] }));
      }

      if (url.includes("brickowl.com")) {
        return Promise.resolve(successResponse({ user: { username: "tester" } }));
      }

      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearMetricListeners();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("returns successful results for all providers", async () => {
    const events: string[] = [];
    addMetricListener((event) => events.push(event.name));

    const result = await validateExternalApis();

    expect(result.brickognize.ok).toBe(true);
    expect(result.bricklink.ok).toBe(true);
    expect(result.brickowl.ok).toBe(true);

    expect(events).toEqual(
      expect.arrayContaining([
        "external.brickognize.health",
        "external.bricklink.catalog.health",
        "external.brickowl.health",
      ]),
    );
  });

  it("captures failure details for a provider", async () => {
    vi.unstubAllGlobals();

    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.includes("brickognize.com")) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: {
            get: (key: string) =>
              key.toLowerCase() === "content-type" ? "application/json" : null,
          },
          json: async () => ({ detail: "invalid token" }),
        });
      }

      if (url.includes("bricklink.com")) {
        return Promise.resolve(successResponse({ data: [] }));
      }

      if (url.includes("brickowl.com")) {
        return Promise.resolve(successResponse({ user: { username: "tester" } }));
      }

      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    vi.stubGlobal("fetch", fetchMock);

    const brickognize = await validateBrickognize();
    expect(brickognize.ok).toBe(false);
    expect(brickognize.status).toBe(401);
    expect(brickognize.error?.error.code).toBe("HTTP_401");

    const [link, owl] = await Promise.all([validateBricklink(), validateBrickowl()]);
    expect(link.ok).toBe(true);
    expect(owl.ok).toBe(true);
  });

  it("returns structured failures when the Brickognize endpoint rate limits requests", async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;

      if (url.includes("brickognize.com")) {
        return Promise.reject(new Error("Rate limit exceeded for key test"));
      }

      if (url.includes("bricklink.com")) {
        return Promise.resolve(successResponse({ data: [] }));
      }

      if (url.includes("brickowl.com")) {
        return Promise.resolve(successResponse({ user: { username: "tester" } }));
      }

      return Promise.reject(new Error(`Unexpected fetch call: ${url}`));
    });

    const events: string[] = [];
    addMetricListener((event) => events.push(event.name));

    const result = await validateBrickognize();
    expect(result.ok).toBe(false);
    expect(result.error?.error.code).toBe("UNEXPECTED_ERROR");
    expect(result.error?.error.message).toMatch(/rate limit exceeded/i);
    expect(events).toContain("external.brickognize.health");
  });
});
