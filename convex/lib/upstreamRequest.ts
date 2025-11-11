// convex/lib/upstreamRequest.ts
import type { FunctionReference } from "convex/server";
import { ConvexError, type Value } from "convex/values";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Provider } from "../ratelimiter/schema";
import { buildOAuthHeader, type OAuthHeaderResult, type OAuthMethod } from "./oauth";

type HttpMethod = OAuthMethod;

type RetryableStatus = number;

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 5000,
  retryStatuses: [429],
};

const MAX_LIMITER_ATTEMPTS = 3;
const MIN_DEFERRAL_DELAY_MS = 50;

type ApiKeyMethodConfig = {
  name: string;
  methods?: HttpMethod[];
};

export type OAuth1Auth = {
  kind: "oauth1";
  consumerKey: string;
  consumerSecret: string;
  token?: string;
  tokenSecret?: string;
  extraParams?: Record<string, string | number | boolean | undefined>;
  nonceBytes?: number;
};

export type ApiKeyAuth = {
  kind: "apiKey";
  value: string;
  header?: {
    name: string;
    prefix?: string;
  };
  query?: ApiKeyMethodConfig;
  formField?: ApiKeyMethodConfig;
};

export type NoAuth = { kind: "none" };

export type UpstreamAuth = OAuth1Auth | ApiKeyAuth | NoAuth;

export type RetryPolicy = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryStatuses?: RetryableStatus[];
};

export type RateLimitOptions = {
  provider: Provider;
  bucket: string;
};

export type AttemptTelemetry = {
  attempt: number;
  method: HttpMethod;
  url: string;
  status?: number;
  error?: unknown;
  durationMs?: number;
  retryInMs?: number;
  rateLimit?: {
    provider: Provider;
    bucket: string;
    granted: boolean;
    remaining?: number;
    resetAt?: number;
    retryInMs?: number;
  };
};

export type RequestOptions<TBody = unknown> = {
  ctx: ActionCtx;
  baseUrl: string;
  path: string;
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: TBody;
  headers?: Record<string, string>;
  auth?: UpstreamAuth;
  retry?: RetryPolicy;
  rateLimit?: RateLimitOptions;
  timeoutMs?: number;
  expectJson?: boolean;
  onAttempt?: (info: AttemptTelemetry) => void;
};

export type UpstreamResponse<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | undefined;
  rawBody: string | null;
  headers: Headers;
  attempts: number;
  durationMs: number;
  throttle?: {
    remaining: number;
    resetAt: number;
  };
  oauth?: OAuthHeaderResult;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(baseUrl: string, path: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase);
}

function appendQuery(url: URL, query?: Record<string, string | number | boolean | undefined>) {
  if (!query) {
    return;
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    url.searchParams.set(key, String(value));
  });
}

function cloneHeaders(headers?: Record<string, string>): Record<string, string> {
  return headers ? { ...headers } : {};
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

function shouldApplyForMethod(
  config: ApiKeyMethodConfig | undefined,
  method: HttpMethod,
): config is ApiKeyMethodConfig {
  if (!config) {
    return false;
  }
  if (!config.methods || config.methods.length === 0) {
    return true;
  }
  return config.methods.map((m) => m.toUpperCase()).includes(method);
}

function appendFormValue(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value) || typeof value === "object") {
    params.append(key, JSON.stringify(value));
    return;
  }
  params.append(key, String(value));
}

function ensureUrlEncodedBody(bodyInit: BodyInit | undefined, rawBody: unknown): URLSearchParams {
  if (bodyInit instanceof URLSearchParams) {
    return new URLSearchParams(bodyInit);
  }
  if (bodyInit === undefined || bodyInit === null) {
    const params = new URLSearchParams();
    if (rawBody && typeof rawBody === "object") {
      Object.entries(rawBody as Record<string, unknown>).forEach(([key, value]) =>
        appendFormValue(params, key, value),
      );
    }
    return params;
  }
  if (typeof bodyInit === "string") {
    return new URLSearchParams(bodyInit);
  }

  throw new ConvexError({
    code: "INVALID_FORM_BODY",
    message: "Cannot inject form field into non-form body",
  });
}

function serializeBody(body: unknown): { bodyInit: BodyInit | undefined; contentType?: string } {
  if (body === undefined || body === null) {
    return { bodyInit: undefined };
  }

  if (typeof body === "string") {
    return { bodyInit: body, contentType: "text/plain" };
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

  if (body instanceof URLSearchParams) {
    return { bodyInit: body, contentType: "application/x-www-form-urlencoded" };
  }

  if (typeof body === "object") {
    return {
      bodyInit: JSON.stringify(body),
      contentType: "application/json; charset=utf-8",
    };
  }

  return {
    bodyInit: String(body),
    contentType: "text/plain",
  };
}

type ConsumeResult = {
  granted: boolean;
  remaining: number;
  resetAt: number;
};

type ConsumeTokenMutationRef = FunctionReference<
  "mutation",
  "internal",
  { provider: Provider; bucket: string },
  { granted: boolean; resetAt: number; remaining: number },
  string | undefined
>;

type RateLimitModules = {
  ratelimiter?: {
    consumeToken?: ConsumeTokenMutationRef;
  };
  ratelimit?: {
    consume?: {
      consumeToken?: ConsumeTokenMutationRef;
    };
    consumeToken?: ConsumeTokenMutationRef;
  };
};

async function consumeRateLimit(
  ctx: ActionCtx,
  options: RateLimitOptions,
  attempt: number,
  method: HttpMethod,
  url: string,
  onAttempt?: (info: AttemptTelemetry) => void,
): Promise<ConsumeResult> {
  const modules = internal as RateLimitModules;
  const consumeTokenMutation =
    modules.ratelimiter?.consumeToken ??
    modules.ratelimit?.consume?.consumeToken ??
    modules.ratelimit?.consumeToken;

  if (!consumeTokenMutation) {
    throw new ConvexError({
      code: "RATE_LIMIT_MODULE_MISSING",
      message: "Rate limiter mutation is not available",
    });
  }

  let tries = 0;
  let result: ConsumeResult | null = null;

  while (tries < MAX_LIMITER_ATTEMPTS) {
    tries += 1;
    const response = await ctx.runMutation(consumeTokenMutation, {
      provider: options.provider,
      bucket: options.bucket,
    });

    if (response.granted) {
      result = {
        granted: true,
        remaining: response.remaining,
        resetAt: response.resetAt,
      };
      onAttempt?.({
        attempt,
        method,
        url,
        rateLimit: {
          provider: options.provider,
          bucket: options.bucket,
          granted: true,
          remaining: response.remaining,
          resetAt: response.resetAt,
        },
      });
      break;
    }

    const waitMs = Math.max(MIN_DEFERRAL_DELAY_MS, response.resetAt - Date.now());
    onAttempt?.({
      attempt,
      method,
      url,
      rateLimit: {
        provider: options.provider,
        bucket: options.bucket,
        granted: false,
        retryInMs: waitMs,
        remaining: response.remaining,
        resetAt: response.resetAt,
      },
      retryInMs: waitMs,
    });
    await sleep(waitMs);
  }

  if (!result) {
    throw new ConvexError({
      code: "RATE_LIMIT_BLOCKED",
      message: `Rate limit exhausted for ${options.provider}/${options.bucket}`,
      provider: options.provider,
      bucket: options.bucket,
    });
  }

  return result;
}

function computeExponentialDelay(attempt: number, policy: RetryPolicy): number {
  const exponent = policy.baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * policy.baseDelayMs);
  return Math.min(exponent + jitter, policy.maxDelayMs);
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) {
    return undefined;
  }

  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return undefined;
}

function shouldRetryRequest(
  attempt: number,
  policy: RetryPolicy,
  status?: number,
  retryAfterMs?: number,
  isNetworkError?: boolean,
): number | null {
  if (attempt >= policy.attempts) {
    return null;
  }

  if (isNetworkError) {
    return retryAfterMs ?? computeExponentialDelay(attempt, policy);
  }

  if (status === undefined) {
    return null;
  }

  if (policy.retryStatuses?.includes(status)) {
    return retryAfterMs ?? computeExponentialDelay(attempt, policy);
  }

  if (status === 429) {
    return retryAfterMs ?? computeExponentialDelay(attempt, policy);
  }

  if (status >= 500 && status < 600) {
    return retryAfterMs ?? computeExponentialDelay(attempt, policy);
  }

  return null;
}

type ApplyAuthResult = {
  bodyInit: BodyInit | undefined;
  oauth?: OAuthHeaderResult;
};

async function applyAuth(
  auth: UpstreamAuth | undefined,
  method: HttpMethod,
  url: URL,
  headers: Record<string, string>,
  body: unknown,
  bodyInit: BodyInit | undefined,
): Promise<ApplyAuthResult> {
  if (!auth || auth.kind === "none") {
    return { bodyInit };
  }

  if (auth.kind === "oauth1") {
    const oauth = await buildOAuthHeader({
      method,
      url: url.toString(),
      cfg: {
        consumerKey: auth.consumerKey,
        consumerSecret: auth.consumerSecret,
        token: auth.token,
        tokenSecret: auth.tokenSecret,
      },
      extraParams: auth.extraParams,
      nonceBytes: auth.nonceBytes,
    });
    headers.Authorization = oauth.header;
    return { bodyInit, oauth };
  }

  if (auth.kind === "apiKey") {
    if (auth.header) {
      headers[auth.header.name] = `${auth.header.prefix ?? ""}${auth.value}`;
    }

    if (shouldApplyForMethod(auth.query, method)) {
      url.searchParams.set(auth.query!.name, auth.value);
    }

    let updatedBody = bodyInit;

    if (shouldApplyForMethod(auth.formField, method)) {
      const params = ensureUrlEncodedBody(bodyInit, body);
      params.set(auth.formField!.name, auth.value);
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      updatedBody = params;
    }

    return { bodyInit: updatedBody };
  }

  return { bodyInit };
}

function parseBody<T>(raw: string, expectJson: boolean): T | undefined {
  if (!raw) {
    return undefined;
  }

  if (!expectJson) {
    return raw as unknown as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new ConvexError({
      code: "INVALID_JSON",
      message: "Failed to parse upstream JSON response",
      details: {
        parseError: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export async function upstreamRequest<T = unknown>(
  options: RequestOptions,
): Promise<UpstreamResponse<T>> {
  const {
    ctx,
    baseUrl,
    path,
    method: providedMethod,
    query,
    body,
    headers,
    auth,
    retry,
    rateLimit,
    timeoutMs: _timeoutMs,
    expectJson = true,
    onAttempt,
  } = options;
  // TODO: support request timeouts via AbortController when runtime allows (`_timeoutMs`).

  const method = (providedMethod ?? "GET").toUpperCase() as HttpMethod;
  const policy: RetryPolicy = {
    ...DEFAULT_RETRY_POLICY,
    ...(retry ?? {}),
  };

  const startedAt = Date.now();
  let lastError: unknown;
  let lastStatus: number | undefined;
  let lastRawBody: string | null = null;
  let oauthMetadata: OAuthHeaderResult | undefined;
  let throttleMetadata:
    | {
        remaining: number;
        resetAt: number;
      }
    | undefined;

  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    const url = buildUrl(baseUrl, path);
    appendQuery(url, query);

    const attemptHeaders = cloneHeaders(headers);
    if (!hasHeader(attemptHeaders, "accept")) {
      attemptHeaders.Accept = "application/json";
    }

    const { bodyInit, contentType } = serializeBody(body);
    if (contentType && !hasHeader(attemptHeaders, "content-type")) {
      attemptHeaders["Content-Type"] = contentType;
    }

    if (rateLimit) {
      const limiterResult = await consumeRateLimit(
        ctx,
        rateLimit,
        attempt,
        method,
        url.toString(),
        onAttempt,
      );
      throttleMetadata = {
        remaining: limiterResult.remaining,
        resetAt: limiterResult.resetAt,
      };
    }

    let authResult: ApplyAuthResult;
    try {
      authResult = await applyAuth(auth, method, url, attemptHeaders, body, bodyInit);
      oauthMetadata = authResult.oauth ?? oauthMetadata;
    } catch (error) {
      throw new ConvexError({
        code: "AUTH_CONFIGURATION_ERROR",
        message: "Failed to apply upstream authentication",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const attemptStartedAt = Date.now();

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: attemptHeaders,
        body: authResult.bodyInit,
      });

      const duration = Date.now() - attemptStartedAt;
      lastStatus = response.status;

      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));

      const rawBody = await response.text();
      lastRawBody = rawBody.length > 0 ? rawBody : null;
      const data = parseBody<T>(rawBody, expectJson);
      const shouldRetry = shouldRetryRequest(attempt, policy, response.status, retryAfterMs, false);

      onAttempt?.({
        attempt,
        method,
        url: url.toString(),
        status: response.status,
        durationMs: duration,
        retryInMs: shouldRetry ?? undefined,
        rateLimit: rateLimit
          ? {
              provider: rateLimit.provider,
              bucket: rateLimit.bucket,
              granted: true,
              remaining: throttleMetadata?.remaining,
              resetAt: throttleMetadata?.resetAt,
            }
          : undefined,
      });

      if (shouldRetry !== null) {
        await sleep(shouldRetry);
        continue;
      }

      return {
        ok: response.ok,
        status: response.status,
        data,
        rawBody: lastRawBody,
        headers: response.headers,
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        throttle: throttleMetadata,
        oauth: oauthMetadata,
      };
    } catch (error) {
      lastError = error;
      const duration = Date.now() - attemptStartedAt;
      const delay = shouldRetryRequest(attempt, policy, undefined, undefined, true);

      onAttempt?.({
        attempt,
        method,
        url: url.toString(),
        error,
        durationMs: duration,
        retryInMs: delay ?? undefined,
        rateLimit: rateLimit
          ? {
              provider: rateLimit.provider,
              bucket: rateLimit.bucket,
              granted: true,
              remaining: throttleMetadata?.remaining,
              resetAt: throttleMetadata?.resetAt,
            }
          : undefined,
      });

      if (delay === null) {
        break;
      }

      await sleep(delay);
    }
  }

  const errorPayload: Record<string, Value> = {
    code: "UPSTREAM_REQUEST_FAILED",
    message: "Upstream request failed after exhausting retries",
  };

  if (typeof lastStatus === "number") {
    errorPayload.httpStatus = lastStatus;
  }

  if (lastError) {
    errorPayload.error = lastError instanceof Error ? lastError.message : String(lastError);
  }

  if (lastRawBody !== null) {
    errorPayload.rawBody = lastRawBody;
  }

  throw new ConvexError(errorPayload);
}
