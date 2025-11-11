import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildOAuthHeader,
  createSignatureBaseString,
  type OAuthHeaderResult,
} from "@/convex/lib/oauth";

const { randomHexMock, hmacSha1Base64Mock } = vi.hoisted(() => ({
  randomHexMock: vi.fn(() => "cafefeed"),
  hmacSha1Base64Mock: vi.fn(async () => "signed-value"),
}));

vi.mock("@/convex/lib/webcrypto", () => ({
  randomHex: randomHexMock,
  hmacSha1Base64: hmacSha1Base64Mock,
}));

describe("oauth helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    randomHexMock.mockClear();
    hmacSha1Base64Mock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a signature base string with sorted, encoded parameters", () => {
    const params = {
      foo: "bar",
      baz: "qux",
    };

    const baseString = createSignatureBaseString(
      "GET",
      "https://api.example.com/v1/resource",
      params,
    );

    expect(baseString).toBe(
      ["GET", "https%3A%2F%2Fapi.example.com%2Fv1%2Fresource", "baz%3Dqux%26foo%3Dbar"].join("&"),
    );
  });

  it("builds an OAuth header with deterministic nonce and signature metadata", async () => {
    const result: OAuthHeaderResult = await buildOAuthHeader({
      method: "POST",
      url: "https://api.example.com/inventory/update?foo=bar",
      cfg: {
        consumerKey: "ck",
        consumerSecret: "cs",
        token: "tk",
        tokenSecret: "ts",
      },
      extraParams: {
        quantity: 10,
        remarks: undefined,
      },
      nonceBytes: 8,
    });

    expect(randomHexMock).toHaveBeenCalledWith(8);

    const expectedTimestamp = Math.floor(Date.now() / 1000).toString();
    const expectedQuery = [
      "foo=bar",
      "oauth_consumer_key=ck",
      "oauth_nonce=cafefeed",
      "oauth_signature_method=HMAC-SHA1",
      `oauth_timestamp=${expectedTimestamp}`,
      "oauth_token=tk",
      "oauth_version=1.0",
      "quantity=10",
    ]
      .sort()
      .join("&");

    const expectedBaseString = [
      "POST",
      "https%3A%2F%2Fapi.example.com%2Finventory%2Fupdate",
      encodeURIComponent(expectedQuery),
    ].join("&");

    expect(result.baseString).toBe(expectedBaseString);

    expect(hmacSha1Base64Mock).toHaveBeenCalledWith("cs&ts", expectedBaseString);
    expect(result.signingKey).toBe("cs&ts");
    expect(result.signature).toBe("signed-value");
    expect(result.params).toMatchObject({
      oauth_consumer_key: "ck",
      oauth_nonce: "cafefeed",
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: expectedTimestamp,
      oauth_version: "1.0",
      oauth_token: "tk",
    });

    expect(result.header).toBe(
      'OAuth oauth_consumer_key="ck", oauth_nonce="cafefeed", oauth_signature="signed-value", oauth_signature_method="HMAC-SHA1", oauth_timestamp="' +
        expectedTimestamp +
        '", oauth_token="tk", oauth_version="1.0"',
    );
  });
});
