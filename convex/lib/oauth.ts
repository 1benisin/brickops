// convex/lib/oauth.ts
import { hmacSha1Base64, randomHex } from "./webcrypto";

const DEFAULT_NONCE_BYTES = 16;

export type OAuthConfig = {
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
};

export type OAuthMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type OAuthInput = {
  method: OAuthMethod;
  url: string;
  cfg: OAuthConfig;
  extraParams?: Record<string, string | number | boolean | undefined>;
  nonceBytes?: number;
};

export type OAuthParameterMap = {
  oauth_consumer_key: string;
  oauth_nonce: string;
  oauth_signature_method: "HMAC-SHA1";
  oauth_timestamp: string;
  oauth_version: "1.0";
  oauth_token?: string;
};

export type OAuthHeaderResult = {
  header: string;
  params: OAuthParameterMap;
  signature: string;
  baseString: string;
  signingKey: string;
};

function pctEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function toQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${pctEncode(key)}=${pctEncode(params[key])}`)
    .join("&");
}

function parseUrlParams(url: string): Record<string, string> {
  const parsed = new URL(url);
  const out: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function sanitizeExtraParams(
  extraParams?: Record<string, string | number | boolean | undefined>,
): Record<string, string> {
  if (!extraParams) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(extraParams)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}

function buildSigningKey(config: OAuthConfig): string {
  const consumer = pctEncode(config.consumerSecret);
  const token = pctEncode(config.tokenSecret ?? "");
  return `${consumer}&${token}`;
}

function buildBaseParams(config: OAuthConfig, nonce: string, timestamp: string): OAuthParameterMap {
  const params: OAuthParameterMap = {
    oauth_consumer_key: config.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_version: "1.0",
  };

  if (config.token) {
    params.oauth_token = config.token;
  }

  return params;
}

export function createSignatureBaseString(
  method: OAuthMethod,
  url: string,
  params: Record<string, string>,
): string {
  const parsed = new URL(url);
  const baseUrl = `${parsed.origin}${parsed.pathname}`;
  return [method.toUpperCase(), pctEncode(baseUrl), pctEncode(toQueryString(params))].join("&");
}

export async function buildOAuthHeader(input: OAuthInput): Promise<OAuthHeaderResult> {
  const { method, url, cfg, extraParams, nonceBytes } = input;

  const nonce = randomHex(nonceBytes ?? DEFAULT_NONCE_BYTES);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams = buildBaseParams(cfg, nonce, timestamp);
  const signatureParams = {
    ...parseUrlParams(url),
    ...sanitizeExtraParams(extraParams),
    ...oauthParams,
  };

  const baseString = createSignatureBaseString(method, url, signatureParams);
  const signingKey = buildSigningKey(cfg);
  const signature = await hmacSha1Base64(signingKey, baseString);

  const headerParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  const header =
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((key) => {
        const typedKey = key as keyof typeof headerParams;
        const value = headerParams[typedKey]!;
        return `${pctEncode(key)}="${pctEncode(value)}"`;
      })
      .join(", ");

  return {
    header,
    params: oauthParams,
    signature,
    baseString,
    signingKey,
  };
}
