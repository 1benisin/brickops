import { ConvexError } from "convex/values";
import type { ActionCtx } from "../../../_generated/server";
import type { Id } from "../../../_generated/dataModel";
import type { AttemptTelemetry, UpstreamResponse } from "../../../lib/upstreamRequest";
import { upstreamRequest } from "../../../lib/upstreamRequest";
import type { Provider, RateLimitOptions } from "../../../ratelimiter/schema";
import { randomHex } from "../../../lib/webcrypto";
import { getBrickOwlCredentials, type BrickOwlCredentials } from "./credentials";
import { brickowlAccountBucket } from "./rateLimit";

const BRICKOWL_BASE_URL = "https://api.brickowl.com/v1";
const PROVIDER: Provider = "brickowl";
const USER_AGENT = "BrickOps/1.0";

type HttpMethod = "GET" | "POST";

export type BrickOwlRetryPolicy = {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
};

export const DEFAULT_RETRY_POLICY: BrickOwlRetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 8_000,
  backoffMultiplier: 2,
};

export type BrickOwlRequestOptions = {
  path: string;
  method?: HttpMethod;
  queryParams?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  correlationId?: string;
  idempotencyKey?: string;
  isIdempotent?: boolean;
  retryPolicy?: Partial<BrickOwlRetryPolicy>;
  onAttempt?: (telemetry: AttemptTelemetry) => void;
};

export type BrickOwlRequestState = {
  cache?: Map<string, unknown>;
};

export type BrickOwlClient = {
  request: <T>(options: BrickOwlRequestOptions, state?: BrickOwlRequestState) => Promise<T>;
  requestWithRetry: <T>(
    options: BrickOwlRequestOptions,
    state?: BrickOwlRequestState,
  ) => Promise<T>;
};

export function createBrickOwlRequestState(): BrickOwlRequestState {
  return { cache: new Map<string, unknown>() };
}

export function generateCorrelationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `bo-${Date.now()}-${randomHex(8)}`;
}

export async function withBrickOwlClient<T>(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    fn: (client: BrickOwlClient) => Promise<T>;
  },
): Promise<T> {
  const client: BrickOwlClient = {
    request: async <TResult>(options: BrickOwlRequestOptions, state?: BrickOwlRequestState) => {
      return await makeBrickOwlRequest<TResult>(ctx, params.businessAccountId, options, state);
    },
    requestWithRetry: async <TResult>(
      options: BrickOwlRequestOptions,
      state?: BrickOwlRequestState,
    ) => {
      const merged: BrickOwlRequestOptions = {
        ...options,
        retryPolicy: {
          ...DEFAULT_RETRY_POLICY,
          ...(options.retryPolicy ?? {}),
        },
      };
      return await makeBrickOwlRequest<TResult>(ctx, params.businessAccountId, merged, state);
    },
  };

  return await params.fn(client);
}

export async function makeBrickOwlRequest<T>(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  options: BrickOwlRequestOptions,
  state?: BrickOwlRequestState,
): Promise<T> {
  const credentials = await getBrickOwlCredentials(ctx, businessAccountId);
  const correlationId = options.correlationId ?? generateCorrelationId();
  const method = (options.method ?? "GET") as HttpMethod;

  if (options.idempotencyKey && state?.cache?.has(options.idempotencyKey)) {
    return state.cache.get(options.idempotencyKey) as T;
  }

  const query = normalizeQuery(options.queryParams);
  const body = buildRequestBody(method, options.body);
  const retry = toRetryPolicy(options.retryPolicy);

  const response = await upstreamRequest<unknown>({
    ctx,
    baseUrl: BRICKOWL_BASE_URL,
    path: options.path,
    method,
    query,
    body,
    headers: buildDefaultHeaders(correlationId),
    auth: buildApiKeyAuth(credentials),
    rateLimit: buildRateLimitOptions(businessAccountId),
    retry,
    expectJson: true,
    onAttempt: options.onAttempt,
  });

  if (!response.ok) {
    throw buildBrickOwlError({
      response,
      correlationId,
      endpoint: options.path,
    });
  }

  if (options.idempotencyKey && state?.cache) {
    state.cache.set(options.idempotencyKey, response.data);
  }

  return response.data as T;
}

function buildDefaultHeaders(correlationId: string): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    "X-Correlation-Id": correlationId,
  };
}

function buildApiKeyAuth(credentials: BrickOwlCredentials) {
  return {
    kind: "apiKey" as const,
    value: credentials.apiKey,
    query: {
      name: "key",
      methods: ["GET" as HttpMethod],
    },
    formField: {
      name: "key",
      methods: ["POST" as HttpMethod],
    },
  };
}

function buildRateLimitOptions(businessAccountId: Id<"businessAccounts">): RateLimitOptions {
  return {
    provider: PROVIDER,
    bucket: brickowlAccountBucket(businessAccountId),
  };
}

function normalizeQuery(
  queryParams?: Record<string, string | number | boolean | undefined>,
): Record<string, string> | undefined {
  if (!queryParams) {
    return undefined;
  }
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined || value === null) {
      continue;
    }
    normalized[key] = String(value);
  }
  return normalized;
}

function buildRequestBody(
  method: HttpMethod,
  body: Record<string, unknown> | undefined,
): URLSearchParams | undefined {
  if (method !== "POST" || !body) {
    return undefined;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value) || typeof value === "object") {
      params.append(key, JSON.stringify(value));
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}

function toRetryPolicy(policy?: Partial<BrickOwlRetryPolicy>) {
  if (!policy || Object.keys(policy).length === 0) {
    return undefined;
  }
  const resolved: BrickOwlRetryPolicy = {
    maxRetries: policy.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
    initialDelayMs: policy.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs,
    maxDelayMs: policy.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
    backoffMultiplier: policy.backoffMultiplier ?? DEFAULT_RETRY_POLICY.backoffMultiplier,
  };

  return {
    attempts: Math.max(1, resolved.maxRetries + 1),
    baseDelayMs: resolved.initialDelayMs,
    maxDelayMs: resolved.maxDelayMs,
    retryStatuses: [408, 425, 429, 500, 502, 503, 504],
  };
}

function buildBrickOwlError(input: {
  response: UpstreamResponse<unknown>;
  correlationId: string;
  endpoint: string;
}): ConvexError {
  const { response, correlationId, endpoint } = input;
  const status = response.status;
  const retryAfter = response.headers.get("Retry-After");
  const retryAfterMs = retryAfter ? parseRetryAfter(retryAfter) : undefined;
  const baseDetails = {
    httpStatus: status,
    endpoint,
    correlationId,
    rawBody: response.rawBody,
  };

  if (status === 429) {
    throw new ConvexError({
      code: "RATE_LIMITED",
      message: "BrickOwl rate limit reached. Please retry later.",
      retryAfterMs,
      ...baseDetails,
    });
  }

  if (status === 401) {
    throw new ConvexError({
      code: "AUTH",
      message: "BrickOwl API key is invalid or expired. Please update credentials.",
      ...baseDetails,
    });
  }

  if (status === 404) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Requested resource was not found on BrickOwl.",
      ...baseDetails,
    });
  }

  if (status === 400) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "BrickOwl rejected the request due to invalid data.",
      ...baseDetails,
    });
  }

  if (status >= 500) {
    throw new ConvexError({
      code: "SERVER_ERROR",
      message: "BrickOwl service is temporarily unavailable.",
      retryAfterMs,
      ...baseDetails,
    });
  }

  throw new ConvexError({
    code: status ? String(status) : "BRICKOWL_ERROR",
    message: "BrickOwl API request failed.",
    ...baseDetails,
  });
}

function parseRetryAfter(header: string): number | undefined {
  if (!header) {
    return undefined;
  }
  const numeric = Number(header);
  if (!Number.isNaN(numeric)) {
    return numeric * 1000;
  }
  const parsed = Date.parse(header);
  if (!Number.isNaN(parsed)) {
    return Math.max(0, parsed - Date.now());
  }
  return undefined;
}
