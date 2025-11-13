import { ConvexError } from "convex/values";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import {
  upstreamRequest,
  type AttemptTelemetry,
  type RetryPolicy,
  type UpstreamResponse,
} from "../../lib/upstreamRequest";
import { getBrickOwlCredentials } from "./credentials";
import { generateCorrelationId } from "./ids";
import {
  type BOHttpMethod,
  BO_BASE_URL,
  buildBoApiKeyAuth,
  buildBoDefaultHeaders,
  buildBoRateLimitOptions,
  buildBoRequestBody,
  normalizeBoQuery,
} from "./request";

export type BORetryPolicy = {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
};

type BoErrorPayload = {
  code: string;
  message: string;
  httpStatus: number;
  endpoint: string;
  correlationId: string;
  rawBody?: string;
  retryAfterMs?: number;
};

export const DEFAULT_RETRY_POLICY: BORetryPolicy = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 8_000,
  backoffMultiplier: 2,
};

export type BORequestOptions = {
  path: string;
  method?: BOHttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  correlationId?: string;
  idempotencyKey?: string;
  isIdempotent?: boolean;
  retryPolicy?: Partial<BORetryPolicy>;
  onAttempt?: (telemetry: AttemptTelemetry) => void;
};

export type BORequestState = {
  cache?: Map<string, unknown>;
};

export type BOClient = {
  request: <T>(options: BORequestOptions, state?: BORequestState) => Promise<T>;
  requestWithRetry: <T>(options: BORequestOptions, state?: BORequestState) => Promise<T>;
};

export function createBoRequestState(): BORequestState {
  return { cache: new Map<string, unknown>() };
}

export async function withBoClient<T>(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    correlationId?: string;
    fn: (client: BOClient) => Promise<T>;
  },
): Promise<T> {
  const defaultCorrelationId = params.correlationId;

  const client: BOClient = {
    request: async <TResult>(options: BORequestOptions, state?: BORequestState) => {
      const resolved = applyDefaultCorrelation(options, defaultCorrelationId);
      return await makeBoRequest<TResult>(ctx, params.businessAccountId, resolved, state);
    },
    requestWithRetry: async <TResult>(options: BORequestOptions, state?: BORequestState) => {
      const merged: BORequestOptions = {
        ...options,
        retryPolicy: {
          ...DEFAULT_RETRY_POLICY,
          ...(options.retryPolicy ?? {}),
        },
      };
      const resolved = applyDefaultCorrelation(merged, defaultCorrelationId);
      return await makeBoRequest<TResult>(ctx, params.businessAccountId, resolved, state);
    },
  };

  return await params.fn(client);
}

export async function makeBoRequest<T>(
  ctx: ActionCtx,
  businessAccountId: Id<"businessAccounts">,
  options: BORequestOptions,
  state?: BORequestState,
): Promise<T> {
  const credentials = await getBrickOwlCredentials(ctx, businessAccountId);
  const correlationId = options.correlationId ?? generateCorrelationId();
  const method = (options.method ?? "GET") as BOHttpMethod;

  if (options.idempotencyKey && state?.cache?.has(options.idempotencyKey)) {
    return state.cache.get(options.idempotencyKey) as T;
  }

  const query = normalizeBoQuery(options.query);
  const body = buildBoRequestBody(method, options.body);
  const retry = toRetryPolicy(options.retryPolicy);

  const response = await upstreamRequest<unknown>({
    ctx,
    baseUrl: BO_BASE_URL,
    path: options.path,
    method,
    query,
    body,
    headers: buildBoDefaultHeaders(correlationId),
    auth: buildBoApiKeyAuth(credentials),
    rateLimit: buildBoRateLimitOptions(businessAccountId),
    retry,
    expectJson: true,
    onAttempt: options.onAttempt,
  });

  if (!response.ok) {
    throw buildBoError({
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

function applyDefaultCorrelation(
  options: BORequestOptions,
  defaultCorrelationId?: string,
): BORequestOptions {
  if (!defaultCorrelationId || options.correlationId) {
    return options;
  }
  return {
    ...options,
    correlationId: defaultCorrelationId,
  };
}

function toRetryPolicy(policy?: Partial<BORetryPolicy>): RetryPolicy | undefined {
  if (!policy || Object.keys(policy).length === 0) {
    return undefined;
  }
  const resolved: BORetryPolicy = {
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

function buildBoError(input: {
  response: UpstreamResponse<unknown>;
  correlationId: string;
  endpoint: string;
}): ConvexError<BoErrorPayload> {
  const { response, correlationId, endpoint } = input;
  const status = response.status;
  const retryAfter = response.headers.get("Retry-After");
  const retryAfterMs = retryAfter ? parseRetryAfter(retryAfter) : undefined;
  const baseDetails: Omit<BoErrorPayload, "code" | "message"> = {
    httpStatus: status,
    endpoint,
    correlationId,
    rawBody: response.rawBody ?? undefined,
  };

  if (status === 429) {
    return new ConvexError<BoErrorPayload>({
      code: "RATE_LIMITED",
      message: "BrickOwl rate limit reached. Please retry later.",
      retryAfterMs,
      ...baseDetails,
    });
  }

  if (status === 401) {
    return new ConvexError<BoErrorPayload>({
      code: "AUTH",
      message: "BrickOwl API key is invalid or expired. Please update credentials.",
      ...baseDetails,
    });
  }

  if (status === 404) {
    return new ConvexError<BoErrorPayload>({
      code: "NOT_FOUND",
      message: "Requested resource was not found on BrickOwl.",
      ...baseDetails,
    });
  }

  if (status === 400) {
    return new ConvexError<BoErrorPayload>({
      code: "VALIDATION_ERROR",
      message: "BrickOwl rejected the request due to invalid data.",
      ...baseDetails,
    });
  }

  if (status >= 500) {
    return new ConvexError<BoErrorPayload>({
      code: "SERVER_ERROR",
      message: "BrickOwl service is temporarily unavailable.",
      retryAfterMs,
      ...baseDetails,
    });
  }

  return new ConvexError<BoErrorPayload>({
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
