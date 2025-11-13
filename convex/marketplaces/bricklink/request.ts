// Low-level helpers for making signed BrickLink API requests and tracking metadata.
import type { ActionCtx } from "../../_generated/server";
import {
  upstreamRequest,
  type AttemptTelemetry,
  type RateLimitOptions,
  type RetryPolicy,
  type UpstreamResponse,
} from "../../lib/upstreamRequest";
import type { OAuthHeaderResult } from "../../lib/oauth";
import {
  buildAuthorizationHeader,
  generateOAuthParams,
  generateOAuthSignature,
  type OAuthCredentials,
} from "./oauth";
import { generateCorrelationId } from "./ids";

const BL_BASE_URL = "https://api.bricklink.com/api/store/v1";
const USER_AGENT = "BrickOps/1.0";

function shouldForceJsonContentType(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }

  if (typeof ArrayBuffer !== "undefined") {
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return false;
    }
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return false;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return false;
  }

  if (body instanceof URLSearchParams) {
    return false;
  }

  return true;
}

// The BrickLink REST API sticks to these standard HTTP verbs.
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Inputs needed to make a call to BrickLink, including auth secrets and optional Convex context.
export type BLRequestArgs = {
  ctx?: ActionCtx;
  credentials: OAuthCredentials;
  path: string;
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: HeadersInit;
  body?: unknown;
  expectJson?: boolean;
  correlationId?: string;
  rateLimit?: RateLimitOptions;
  onAttempt?: (telemetry: AttemptTelemetry) => void;
  retry?: RetryPolicy;
};

// What we hand back after a call: response info, metadata, and any parsed body.
export type BLRequestResult<T> = {
  ok: boolean;
  status: number;
  data: T;
  headers: Headers;
  correlationId: string;
  durationMs: number;
  attempts?: number;
  throttle?: UpstreamResponse["throttle"];
  oauth?: OAuthHeaderResult;
  rawBody: string | null;
};

// Tiny type guard so callers can tell if they passed in an Action context.
export function isActionCtx(candidate: unknown): candidate is ActionCtx {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  const context = candidate as Partial<ActionCtx>;
  return typeof context.runQuery === "function" && typeof context.runMutation === "function";
}

// Core helper that signs and performs a BrickLink API request and returns useful metadata.
export async function executeBlRequest<T = unknown>(
  args: BLRequestArgs,
): Promise<BLRequestResult<T>> {
  // Normalise method, build a correlation id, and start building the header set.
  const method = (args.method ?? "GET").toUpperCase() as HttpMethod;
  const correlationId = args.correlationId ?? generateCorrelationId();
  const headers = withDefaultHeaders(args.headers, correlationId);
  const expectJson = args.expectJson ?? true;

  if (shouldForceJsonContentType(args.body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (args.ctx) {
    const headerRecord = headersToRecord(headers);
    // When we have a Convex Action ctx, delegate to our shared upstreamRequest helper.
    const response = await upstreamRequest<T>({
      ctx: args.ctx,
      baseUrl: BL_BASE_URL,
      path: args.path,
      method,
      query: args.query,
      body: args.body,
      headers: headerRecord,
      auth: {
        kind: "oauth1",
        consumerKey: args.credentials.consumerKey,
        consumerSecret: args.credentials.consumerSecret,
        token: args.credentials.tokenValue,
        tokenSecret: args.credentials.tokenSecret,
      },
      expectJson,
      rateLimit: args.rateLimit,
      onAttempt: args.onAttempt,
      retry: args.retry,
    });

    return {
      ok: response.ok,
      status: response.status,
      data: response.data as T,
      headers: response.headers,
      correlationId,
      durationMs: response.durationMs,
      attempts: response.attempts,
      throttle: response.throttle,
      oauth: response.oauth,
      rawBody: response.rawBody,
    };
  }

  // Otherwise, run a direct fetch (used mainly in tests and tools) and build OAuth ourselves.
  const url = buildRequestUrl(args.path, args.query);
  const oauthParams = generateOAuthParams();
  const queryEntries = Array.from(url.searchParams.entries()) as Array<[string, string]>;
  const oauthParamPairs: Array<[string, string]> = [
    ["oauth_consumer_key", args.credentials.consumerKey],
    ["oauth_token", args.credentials.tokenValue],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", oauthParams.timestamp],
    ["oauth_nonce", oauthParams.nonce],
    ["oauth_version", "1.0"],
  ];

  const allParams: Array<[string, string]> = [...queryEntries, ...oauthParamPairs];
  const baseUrl = `${url.origin}${url.pathname}`;
  // Sign the request so BrickLink accepts it.
  const signature = await generateOAuthSignature(args.credentials, method, baseUrl, allParams);
  const authorization = buildAuthorizationHeader(args.credentials, signature, oauthParams);

  const { bodyInit, contentType } = serializeBody(args.body);
  if (contentType && !headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
  headers.set("Authorization", authorization);

  const startedAt = Date.now();

  // Perform the network call with the fully prepared request.
  const headerRecord = headersToRecord(headers);
  const headerInit = recordToFetchHeaders(headerRecord);

  const response = await fetch(url.toString(), {
    method,
    headers: headerInit,
    body: bodyInit,
  });

  const durationMs = Date.now() - startedAt;
  const rawText = await response.text();
  const rawBody = rawText.length > 0 ? rawText : null;
  const data = parseBody<T>(rawBody, expectJson);

  // Shape the response like the Convex branch so callers can handle both paths the same way.
  return {
    ok: response.ok,
    status: response.status,
    data,
    headers: response.headers,
    correlationId,
    durationMs,
    attempts: 1,
    throttle: undefined,
    oauth: undefined,
    rawBody,
  };
}

function headersToRecord(headers: Headers): Record<string, string> {
  return Array.from(headers.entries()).reduce<Record<string, string>>((acc, [key, value]) => {
    const canonical = canonicalHeaderName(key);
    acc[canonical] = value;
    return acc;
  }, {});
}

function recordToFetchHeaders(record: Record<string, string>): Record<string, string> {
  const init = { ...record } as Record<string, string>;
  Object.defineProperty(init, "entries", {
    enumerable: false,
    value: function* entries(): IterableIterator<[string, string]> {
      yield* Object.entries(record);
    },
  });
  return init;
}

function canonicalHeaderName(name: string): string {
  return name
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment[0]!.toUpperCase() + segment.slice(1).toLowerCase())
    .join("-");
}

// Merge caller headers with the standard BrickOps defaults like Accept and correlation id.
export function withDefaultHeaders(
  headers: HeadersInit | undefined,
  correlationId: string,
): Headers {
  const merged = new Headers({
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    "X-Correlation-Id": correlationId,
  });

  if (headers) {
    // Copy every caller-provided header over the defaults, allowing overrides.
    new Headers(headers).forEach((value, key) => {
      merged.set(key, value);
    });
  }

  return merged;
}

// Build a full URL against the BrickLink API, skipping undefined query params.
function buildRequestUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, BL_BASE_URL.endsWith("/") ? BL_BASE_URL : `${BL_BASE_URL}/`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    // BrickLink expects everything as strings, so cast while appending.
    url.searchParams.append(key, String(value));
  });

  return url;
}

// Accepts many common body shapes and turns them into fetch-ready payloads.
function serializeBody(body: unknown): { bodyInit: BodyInit | undefined; contentType?: string } {
  if (body === undefined || body === null) {
    return { bodyInit: undefined };
  }

  if (
    typeof ArrayBuffer !== "undefined" &&
    (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
  ) {
    // Pass binary data straight through for endpoints that expect it.
    return { bodyInit: body as ArrayBuffer };
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return { bodyInit: body };
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return { bodyInit: body };
  }

  if (typeof body === "string") {
    // Caller already crafted a string; send it as plain text.
    return { bodyInit: body, contentType: "text/plain" };
  }

  if (body instanceof URLSearchParams) {
    return { bodyInit: body, contentType: "application/x-www-form-urlencoded" };
  }

  if (typeof body === "object") {
    // Most of the time we send JSON payloads, so serialize here.
    return {
      bodyInit: JSON.stringify(body),
      contentType: "application/json; charset=utf-8",
    };
  }

  return { bodyInit: String(body), contentType: "text/plain" };
}

// Try to decode the response body, but fall back to the raw text if JSON parsing fails.
function parseBody<T>(rawBody: string | null, expectJson: boolean): T {
  if (!rawBody) {
    return undefined as T;
  }

  if (!expectJson) {
    // Caller asked for plain text, so skip JSON parsing.
    return rawBody as unknown as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    // If BrickLink returned invalid JSON, surface the raw string so callers can inspect it.
    return rawBody as unknown as T;
  }
}
