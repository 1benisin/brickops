import type { ActionCtx } from "../../../_generated/server";
import {
  upstreamRequest,
  type AttemptTelemetry,
  type RateLimitOptions,
  type RetryPolicy,
  type UpstreamResponse,
} from "../../../lib/upstreamRequest";
import type { OAuthHeaderResult } from "../../../lib/oauth";
import {
  buildAuthorizationHeader,
  generateOAuthParams,
  generateOAuthSignature,
  type OAuthCredentials,
} from "../oauth";
import { generateCorrelationId } from "./ids";

const BL_BASE_URL = "https://api.bricklink.com/api/store/v1";
const USER_AGENT = "BrickOps/1.0";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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

export function isActionCtx(candidate: unknown): candidate is ActionCtx {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  const context = candidate as Partial<ActionCtx>;
  return typeof context.runQuery === "function" && typeof context.runMutation === "function";
}

export async function executeBlRequest<T = unknown>(
  args: BLRequestArgs,
): Promise<BLRequestResult<T>> {
  const method = (args.method ?? "GET").toUpperCase() as HttpMethod;
  const correlationId = args.correlationId ?? generateCorrelationId();
  const headers = withDefaultHeaders(args.headers, correlationId);
  const headerRecord = Object.fromEntries(headers.entries()) as Record<string, string>;
  const expectJson = args.expectJson ?? true;

  if (args.ctx) {
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
  const signature = await generateOAuthSignature(args.credentials, method, baseUrl, allParams);
  const authorization = buildAuthorizationHeader(args.credentials, signature, oauthParams);

  const { bodyInit, contentType } = serializeBody(args.body);
  if (contentType && !headers.has("Content-Type")) {
    headers.set("Content-Type", contentType);
  }
  headers.set("Authorization", authorization);

  const startedAt = Date.now();

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: bodyInit,
  });

  const durationMs = Date.now() - startedAt;
  const rawText = await response.text();
  const rawBody = rawText.length > 0 ? rawText : null;
  const data = parseBody<T>(rawBody, expectJson);

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
    new Headers(headers).forEach((value, key) => {
      merged.set(key, value);
    });
  }

  return merged;
}

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
    url.searchParams.append(key, String(value));
  });

  return url;
}

function serializeBody(body: unknown): { bodyInit: BodyInit | undefined; contentType?: string } {
  if (body === undefined || body === null) {
    return { bodyInit: undefined };
  }

  if (
    typeof ArrayBuffer !== "undefined" &&
    (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
  ) {
    return { bodyInit: body as ArrayBuffer };
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return { bodyInit: body };
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return { bodyInit: body };
  }

  if (typeof body === "string") {
    return { bodyInit: body, contentType: "text/plain" };
  }

  if (body instanceof URLSearchParams) {
    return { bodyInit: body, contentType: "application/x-www-form-urlencoded" };
  }

  if (typeof body === "object") {
    return {
      bodyInit: JSON.stringify(body),
      contentType: "application/json; charset=utf-8",
    };
  }

  return { bodyInit: String(body), contentType: "text/plain" };
}

function parseBody<T>(rawBody: string | null, expectJson: boolean): T {
  if (!rawBody) {
    return undefined as T;
  }

  if (!expectJson) {
    return rawBody as unknown as T;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    return rawBody as unknown as T;
  }
}
