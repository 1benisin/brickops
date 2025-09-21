import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";

import { BricklinkClient } from "@/convex/lib/external/bricklink";
import { addMetricListener, clearMetricListeners } from "@/convex/lib/external/metrics";

const TEST_CREDENTIALS = {
  consumerKey: "ck",
  consumerSecret: "cs",
  accessToken: "at",
  tokenSecret: "ts",
};

const percentEncode = (input: string) =>
  encodeURIComponent(input)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

const buildBaseString = (method: string, url: URL, params: [string, string][]) => {
  const normalizedParams = params
    .map(([key, value]) => ({ key: percentEncode(key), value: percentEncode(value) }))
    .sort((a, b) => {
      if (a.key === b.key) {
        return a.value.localeCompare(b.value);
      }
      return a.key.localeCompare(b.key);
    })
    .map(({ key, value }) => `${key}=${value}`)
    .join("&");

  const baseUrl = `${url.origin}${url.pathname}`;
  return [method.toUpperCase(), percentEncode(baseUrl), percentEncode(normalizedParams)].join("&");
};

describe("BricklinkClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    BricklinkClient.resetQuotaForTests();
    clearMetricListeners();
  });

  it("generates deterministic OAuth header with correct signature", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({ data: [] }),
    });

    const timestamp = 1_600_000_000;
    const nonce = "abc123";

    const client = new BricklinkClient({
      credentials: TEST_CREDENTIALS,
      timestamp: () => timestamp,
      nonce: () => nonce,
      fetchImpl: fetchMock,
    });

    await client.request({
      path: "/orders",
      query: { direction: "in" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    const authHeader = headers?.Authorization ?? headers?.authorization;
    expect(authHeader).toBeTruthy();

    const params: [string, string][] = [
      ["direction", "in"],
      ["oauth_consumer_key", TEST_CREDENTIALS.consumerKey],
      ["oauth_token", TEST_CREDENTIALS.accessToken],
      ["oauth_signature_method", "HMAC-SHA1"],
      ["oauth_timestamp", String(timestamp)],
      ["oauth_nonce", nonce],
      ["oauth_version", "1.0"],
    ];

    const baseString = buildBaseString(
      "GET",
      new URL("/orders", "https://api.bricklink.com/api/store/v1"),
      params,
    );

    const expectedSignature = createHmac("sha1", "cs&ts").update(baseString).digest("base64");

    const encodedSignature = percentEncode(expectedSignature);

    expect(authHeader).toBe(
      `OAuth oauth_consumer_key="ck", oauth_token="at", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${timestamp}", oauth_nonce="${nonce}", oauth_version="1.0", oauth_signature="${encodedSignature}"`,
    );
  });

  it("emits a quota alert when usage crosses 80%", async () => {
    const events: string[] = [];
    addMetricListener((event) => {
      events.push(event.name);
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (key: string) => (key.toLowerCase() === "content-type" ? "application/json" : null),
      },
      json: async () => ({ data: [] }),
    });

    const client = new BricklinkClient({
      credentials: TEST_CREDENTIALS,
      timestamp: () => 1_600_000_000,
      nonce: () => "alert-test",
      fetchImpl: fetchMock,
    });

    const quotaState = (
      BricklinkClient as unknown as {
        quotaState: { count: number; windowStart: number; alertEmitted: boolean };
      }
    ).quotaState;
    quotaState.count = 3_999;
    quotaState.windowStart = Date.now();
    quotaState.alertEmitted = false;

    await client.request({
      path: "/orders",
      query: { direction: "in" },
    });

    expect(events).toContain("external.bricklink.quota");
    expect(events).toContain("external.bricklink.quota.alert");
  });

  it("returns structured failure when quota is exhausted before a health check", async () => {
    const events: string[] = [];
    addMetricListener((event) => {
      events.push(event.name);
    });

    const fetchMock = vi.fn();

    const client = new BricklinkClient({
      credentials: TEST_CREDENTIALS,
      timestamp: () => 1_600_000_000,
      nonce: () => "quota-fail",
      fetchImpl: fetchMock,
    });

    const quotaState = (
      BricklinkClient as unknown as {
        quotaState: { count: number; windowStart: number; alertEmitted: boolean };
      }
    ).quotaState;
    quotaState.count = 5_000;
    quotaState.windowStart = Date.now();
    quotaState.alertEmitted = true;

    const result = await client.healthCheck();

    expect(result.ok).toBe(false);
    expect(result.error?.error.code).toBe("UNEXPECTED_ERROR");
    expect(result.error?.error.message).toMatch(/daily quota exceeded/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(events).toContain("external.bricklink.health");
  });

  it("blocks requests that exceed the daily quota", async () => {
    const events: string[] = [];
    addMetricListener((event) => {
      events.push(event.name);
    });

    const fetchMock = vi.fn();

    const client = new BricklinkClient({
      credentials: TEST_CREDENTIALS,
      timestamp: () => 1_600_000_000,
      nonce: () => "blocked-test",
      fetchImpl: fetchMock,
    });

    const quotaState = (
      BricklinkClient as unknown as {
        quotaState: { count: number; windowStart: number; alertEmitted: boolean };
      }
    ).quotaState;
    quotaState.count = 5_000;
    quotaState.windowStart = Date.now();
    quotaState.alertEmitted = true;

    await expect(
      client.request({
        path: "/orders",
        query: { direction: "in" },
      }),
    ).rejects.toThrow(/daily quota exceeded/i);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(events).toContain("external.bricklink.quota.blocked");
  });
});
