/**
 * Shared OAuth 1.0a signing helpers for BrickLink API
 * Used by both catalog client and store client
 */

import { hmacSha1Base64, randomHex } from "../lib/webcrypto";

/**
 * Percent-encode per RFC 3986 (OAuth 1.0a spec)
 */
export const percentEncode = (input: string): string =>
  encodeURIComponent(input)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

/**
 * OAuth 1.0a credentials structure
 */
export interface OAuthCredentials {
  consumerKey: string;
  consumerSecret: string;
  tokenValue: string;
  tokenSecret: string;
}

/**
 * OAuth parameters for signature generation
 */
export interface OAuthParams {
  timestamp: string;
  nonce: string;
}

/**
 * Generate OAuth parameters (timestamp and nonce)
 */
export function generateOAuthParams(timestamp?: () => number, nonce?: () => string): OAuthParams {
  const timestampFn = timestamp ?? (() => Math.floor(Date.now() / 1000));
  const nonceFn = nonce ?? (() => randomHex(16));

  return {
    timestamp: timestampFn().toString(),
    nonce: nonceFn(),
  };
}

/**
 * Generate OAuth 1.0a signature
 * @param credentials OAuth credentials
 * @param method HTTP method (GET, POST, etc.)
 * @param url Full URL without query parameters
 * @param allParams All parameters (query + OAuth)
 */
export async function generateOAuthSignature(
  credentials: OAuthCredentials,
  method: string,
  url: string,
  allParams: Array<[string, string]>,
): Promise<string> {
  // Create signing key
  const signingKey = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.tokenSecret)}`;

  // Normalize parameters
  const normalizedParams = allParams
    .map(([key, value]) => ({ key: percentEncode(key), value: percentEncode(value) }))
    .sort((a, b) => {
      if (a.key === b.key) {
        return a.value.localeCompare(b.value);
      }
      return a.key.localeCompare(b.key);
    })
    .map(({ key, value }) => `${key}=${value}`)
    .join("&");

  // Build base string
  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(normalizedParams),
  ].join("&");

  // Generate signature
  return await hmacSha1Base64(signingKey, baseString);
}

/**
 * Build OAuth 1.0a Authorization header
 * @param credentials OAuth credentials
 * @param signature Generated signature
 * @param oauthParams OAuth parameters (timestamp, nonce)
 */
export function buildAuthorizationHeader(
  credentials: OAuthCredentials,
  signature: string,
  oauthParams: OAuthParams,
): string {
  const params: Array<[string, string]> = [
    ["oauth_consumer_key", credentials.consumerKey],
    ["oauth_token", credentials.tokenValue],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", oauthParams.timestamp],
    ["oauth_nonce", oauthParams.nonce],
    ["oauth_version", "1.0"],
    ["oauth_signature", signature],
  ];

  return `OAuth ${params.map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`).join(", ")}`;
}

/**
 * Generate unique request ID for correlation and tracing
 * @returns Unique request identifier
 */
export function generateRequestId(): string {
  return `bl-${Date.now()}-${randomHex(8)}`;
}
