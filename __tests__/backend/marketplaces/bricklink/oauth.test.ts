import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthorizationHeader,
  generateOAuthParams,
  generateOAuthSignature,
  percentEncode,
  type OAuthCredentials,
} from "@/convex/marketplaces/bricklink/oauth";

const { randomHexMock, hmacSha1Base64Mock } = vi.hoisted(() => ({
  randomHexMock: vi.fn(() => "nonce-default"),
  hmacSha1Base64Mock: vi.fn(async () => "signed-digest"),
}));

vi.mock("@/convex/lib/webcrypto", () => ({
  randomHex: randomHexMock,
  hmacSha1Base64: hmacSha1Base64Mock,
}));

describe("BrickLink OAuth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("percentEncode", () => {
    it("percent-encodes reserved characters while leaving safe characters intact", () => {
      expect(percentEncode("abc-._~")).toBe("abc-._~");
      expect(percentEncode("A B!*'()")).toBe("A%20B%21%2A%27%28%29");
      expect(percentEncode("https://example.com?q=lego bricks")).toBe(
        "https%3A%2F%2Fexample.com%3Fq%3Dlego%20bricks",
      );
    });
  });

  describe("generateOAuthParams", () => {
    it("uses provided timestamp and nonce factories when supplied", () => {
      const timestampFactory = vi.fn(() => 1234567890);
      const nonceFactory = vi.fn(() => "nonce-override");

      const params = generateOAuthParams(timestampFactory, nonceFactory);

      expect(params).toEqual({
        timestamp: "1234567890",
        nonce: "nonce-override",
      });
      expect(timestampFactory).toHaveBeenCalledTimes(1);
      expect(nonceFactory).toHaveBeenCalledTimes(1);
    });

    it("defaults to current time and randomHex output", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      randomHexMock.mockReturnValueOnce("generated-nonce");

      const params = generateOAuthParams();

      expect(params.timestamp).toBe(Math.floor(Date.now() / 1000).toString());
      expect(params.nonce).toBe("generated-nonce");
      expect(randomHexMock).toHaveBeenCalledWith(16);
    });
  });

  describe("generateOAuthSignature", () => {
    it("normalizes parameters, builds the base string, and signs with hmacSha1Base64", async () => {
      const credentials: OAuthCredentials = {
        consumerKey: "ck",
        consumerSecret: "cs secret",
        tokenValue: "tv",
        tokenSecret: "ts&",
      };

      hmacSha1Base64Mock.mockResolvedValueOnce("oauth-signature");

      const signature = await generateOAuthSignature(
        credentials,
        "get",
        "https://api.bricklink.com/resource",
        [
          ["remarks", "A&B"],
          ["quantity", "10"],
          ["oauth_nonce", "nonce"],
          ["oauth_consumer_key", "ck"],
        ],
      );

      expect(signature).toBe("oauth-signature");
      expect(hmacSha1Base64Mock).toHaveBeenCalledWith(
        "cs%20secret&ts%26",
        "GET&https%3A%2F%2Fapi.bricklink.com%2Fresource&oauth_consumer_key%3Dck%26oauth_nonce%3Dnonce%26quantity%3D10%26remarks%3DA%2526B",
      );
    });
  });

  describe("buildAuthorizationHeader", () => {
    it("formats the OAuth header with percent-encoded key-value pairs in canonical order", () => {
      const credentials: OAuthCredentials = {
        consumerKey: "ck",
        consumerSecret: "cs",
        tokenValue: "token value",
        tokenSecret: "ts",
      };
      const header = buildAuthorizationHeader(credentials, "signed value/=", {
        timestamp: "1704067200",
        nonce: "nonce with space",
      });

      expect(header).toBe(
        'OAuth oauth_consumer_key="ck", oauth_token="token%20value", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1704067200", oauth_nonce="nonce%20with%20space", oauth_version="1.0", oauth_signature="signed%20value%2F%3D"',
      );
    });
  });
});

