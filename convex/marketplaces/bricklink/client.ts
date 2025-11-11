import { ConvexError } from "convex/values";
import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { getBlCredentials as getEnvBlCredentials } from "../../lib/external/env";
import { recordMetric } from "../../lib/external/metrics";
import { normalizeApiError, type HealthCheckResult } from "../../lib/external/types";
import type {
  AttemptTelemetry,
  RateLimitOptions,
  RetryPolicy,
  UpstreamResponse,
} from "../../lib/upstreamRequest";
import type { OAuthHeaderResult } from "../../lib/oauth";
import type { Provider } from "../../ratelimiter/schema";
import { requireActiveUser } from "@/convex/users/authorization";
import {
  mapCategory,
  mapColor,
  mapPart,
  mapPartColors,
  mapPriceGuide,
  type BLCategoryResponse,
  type BLColorResponse,
  type BLItemResponse,
  type BLPartColorResponse,
  type BLPriceGuideResponse,
} from "./catalog/transformers";
import { parseBlEnvelope } from "./shared/envelope";
import { blAccountBucket } from "./shared/rateLimit";
import { getBlCredentials, normalizeBlCredentials } from "./shared/credentials";
import { executeBlRequest, isActionCtx, withDefaultHeaders } from "./shared/request";
import { generateCorrelationId } from "./shared/ids";
import type { OAuthCredentials } from "./oauth";
import type { BLApiResponse, BLEnvelope, BLResponseMeta } from "./shared/envelope";

export type { BLApiResponse, BLEnvelope, BLResponseMeta } from "./shared/envelope";

const PROVIDER: Provider = "bricklink";
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 300,
  maxDelayMs: 5_000,
  retryStatuses: [408, 425, 429, 500, 502, 503, 504],
};

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type CommonRequestOptions = {
  path: string;
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  expectJson?: boolean;
  correlationId: string;
  onAttempt?: (telemetry: AttemptTelemetry) => void;
};

type RequestContext = {
  ctx?: ActionCtx;
  credentials: OAuthCredentials;
  rateLimit?: RateLimitOptions;
  retry: RetryPolicy;
};

export type BLRequestOptions = Omit<CommonRequestOptions, "correlationId"> & {
  correlationId?: string;
  businessAccountId?: Id<"businessAccounts">;
  onAttempt?: (telemetry: AttemptTelemetry) => void;
  credentials?: OAuthCredentials;
  rateLimit?: RateLimitOptions;
  retry?: RetryPolicy;
};

export type BLRequestResult<T> = {
  data: BLApiResponse<T>;
  status: number;
  headers: Headers;
  correlationId: string;
  attempts: number;
  durationMs: number;
  throttle?: UpstreamResponse["throttle"];
  oauth?: OAuthHeaderResult;
};

export type BLClient = {
  request: <T>(options: BLRequestOptions) => Promise<BLRequestResult<T>>;
};

export async function makeBlRequest<T>(
  ctx: ActionCtx,
  options: BLRequestOptions,
): Promise<BLRequestResult<T>> {
  const {
    businessAccountId: providedBusinessAccountId,
    credentials: providedCredentials,
    rateLimit: providedRateLimit,
    retry,
    ...request
  } = options;
  const correlationId = request.correlationId ?? generateCorrelationId();
  let businessAccountId = providedBusinessAccountId;
  let credentials = providedCredentials;

  if (!credentials) {
    if (!businessAccountId) {
      businessAccountId = (await requireActiveUser(ctx)).businessAccountId;
    }

    if (!businessAccountId) {
      throw new ConvexError({
        code: "BUSINESS_ACCOUNT_REQUIRED",
        message: "BrickLink requests require an active business account context.",
      });
    }

    credentials = await getBlCredentials(ctx, businessAccountId);
  }

  const effectiveRateLimit =
    providedRateLimit ??
    (businessAccountId
      ? {
          provider: PROVIDER,
          bucket: blAccountBucket(businessAccountId),
        }
      : undefined);

  return await performBlRequest<T>(
    {
      ctx,
      credentials,
      rateLimit: effectiveRateLimit,
      retry: buildRetryPolicy(retry),
    },
    {
      ...request,
      correlationId,
    },
  );
}

export async function withBlClient<T>(
  ctx: ActionCtx,
  params: {
    businessAccountId: Id<"businessAccounts">;
    fn: (client: BLClient) => Promise<T>;
  },
): Promise<T> {
  const client: BLClient = {
    request: async <TResult>(options: BLRequestOptions) => {
      return await makeBlRequest<TResult>(ctx, {
        ...options,
        businessAccountId: params.businessAccountId,
      });
    },
  };

  return await params.fn(client);
}

function buildRetryPolicy(overrides: RetryPolicy | undefined): RetryPolicy {
  return {
    ...DEFAULT_RETRY_POLICY,
    ...(overrides ?? {}),
  };
}

async function performBlRequest<T>(
  context: RequestContext,
  request: CommonRequestOptions,
): Promise<BLRequestResult<T>> {
  const response = await executeBlRequest<BLApiResponse<T>>({
    ctx: context.ctx,
    credentials: context.credentials,
    path: request.path,
    method: request.method,
    query: request.query,
    body: request.body,
    headers: withDefaultHeaders(request.headers, request.correlationId),
    expectJson: request.expectJson ?? true,
    correlationId: request.correlationId,
    rateLimit: context.rateLimit,
    onAttempt: request.onAttempt,
    retry: context.retry,
  });

  if (!response.data) {
    throw new ConvexError({
      code: "INVALID_RESPONSE",
      message: "BrickLink API returned an empty response body",
      httpStatus: response.status,
      correlationId: request.correlationId,
      rawBody: response.rawBody,
    });
  }

  const envelope = parseBlEnvelope(response.data, {
    endpoint: request.path,
    correlationId: request.correlationId,
  });

  const syntheticResponse: UpstreamResponse<BLApiResponse<T>> = {
    ok: response.ok,
    status: response.status,
    data: response.data,
    rawBody: response.rawBody,
    headers: response.headers,
    attempts: response.attempts ?? 1,
    durationMs: response.durationMs,
    throttle: response.throttle,
    oauth: response.oauth,
  };

  if (!response.ok || isErrorMeta(envelope.meta)) {
    throw buildBlError({
      response: syntheticResponse,
      envelope,
      correlationId: request.correlationId,
      endpoint: request.path,
    });
  }

  return {
    data: envelope,
    status: response.status,
    headers: response.headers,
    correlationId: request.correlationId,
    attempts: response.attempts ?? 1,
    durationMs: response.durationMs,
    throttle: response.throttle,
    oauth: response.oauth,
  };
}

function isErrorMeta(meta: BLResponseMeta): boolean {
  return typeof meta.code === "number" && meta.code >= 400;
}

type BLErrorDetails<T> = {
  description?: string;
  throttle?: UpstreamResponse<BLApiResponse<T>>["throttle"];
  rawBody: UpstreamResponse<BLApiResponse<T>>["rawBody"];
  oauth?: UpstreamResponse<BLApiResponse<T>>["oauth"];
};

type BLErrorPayload<T> = {
  code: string;
  message: string;
  httpStatus: number;
  endpoint: string;
  correlationId: string;
  retryAfterMs?: number;
  details: BLErrorDetails<T>;
};

function buildBlError<T>(input: {
  response: UpstreamResponse<BLApiResponse<T>>;
  envelope: BLApiResponse<T>;
  correlationId: string;
  endpoint: string;
}): ConvexError<BLErrorPayload<T>> {
  const { response, envelope, correlationId, endpoint } = input;
  const retryAfterHeader = response.headers.get("Retry-After");

  return new ConvexError<BLErrorPayload<T>>({
    code: envelope.meta.code ? String(envelope.meta.code) : "BRICKLINK_ERROR",
    message: envelope.meta.message ?? "BrickLink request failed",
    httpStatus: response.status,
    endpoint,
    correlationId,
    retryAfterMs: retryAfterHeader ? parseRetryAfter(retryAfterHeader) : undefined,
    details: {
      description: envelope.meta.description,
      throttle: response.throttle,
      rawBody: response.rawBody,
      oauth: response.oauth,
    },
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

export type BLCatalogCtx = {
  env?: {
    get(key: string): string | undefined | Promise<string | undefined>;
  };
};

const ENV_KEYS = [
  "BRICKLINK_CONSUMER_KEY",
  "BRICKLINK_CONSUMER_SECRET",
  "BRICKLINK_ACCESS_TOKEN",
  "BRICKLINK_TOKEN_SECRET",
] as const;

type BLEnvKey = (typeof ENV_KEYS)[number];

export interface BLCatalogRequestOptions
  extends Omit<BLRequestOptions, "businessAccountId" | "credentials" | "rateLimit" | "retry"> {}

export type BLCatalogRequestResult<T> = BLRequestResult<T>;

export async function makeBlCatalogRequest<T>(
  ctx: BLCatalogCtx | undefined,
  options: BLCatalogRequestOptions,
  overrides?: { credentials?: OAuthCredentials; rateLimit?: RateLimitOptions; retry?: RetryPolicy },
): Promise<BLCatalogRequestResult<T>> {
  const method: HttpMethod = options.method ?? "GET";
  const correlationId = options.correlationId ?? generateCorrelationId();
  const credentials = overrides?.credentials ?? (await loadBlCatalogCredentials(ctx));
  const actionCtx = ctx && isActionCtx(ctx) ? (ctx as ActionCtx) : undefined;
  const startedAt = Date.now();

  try {
    const response = await performBlRequest<T>(
      {
        ctx: actionCtx,
        credentials,
        rateLimit: overrides?.rateLimit,
        retry: buildRetryPolicy(overrides?.retry),
      },
      {
        ...options,
        method,
        correlationId,
      },
    );

    const durationMs = response.durationMs ?? Date.now() - startedAt;

    recordMetric("external.bricklink.catalog.request", {
      ok: true,
      status: response.status,
      operation: options.path,
      method,
      durationMs,
      correlationId: response.correlationId,
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startedAt;
    const maybeConvexError = error as {
      status?: number;
      httpStatus?: number;
      correlationId?: string;
      details?: { rawBody?: unknown };
    };
    const status =
      typeof maybeConvexError.httpStatus === "number"
        ? maybeConvexError.httpStatus
        : typeof maybeConvexError.status === "number"
          ? maybeConvexError.status
          : undefined;
    const errorCorrelationId = maybeConvexError.correlationId ?? correlationId;
    const rawBody =
      maybeConvexError.details && typeof maybeConvexError.details === "object"
        ? maybeConvexError.details.rawBody
        : undefined;
    const metricPayload: Record<string, unknown> = {
      ok: false,
      status,
      operation: options.path,
      method,
      durationMs: duration,
      correlationId: errorCorrelationId,
    };
    if (status === undefined) {
      metricPayload.errorType = "network";
    }
    recordMetric("external.bricklink.catalog.request", {
      ...metricPayload,
    });

    throw normalizeApiError("bricklink", error, {
      endpoint: options.path,
      status,
      body: rawBody,
      correlationId: errorCorrelationId,
    });
  }
}

async function loadBlCatalogCredentials(ctx?: BLCatalogCtx): Promise<OAuthCredentials> {
  if (ctx?.env?.get) {
    const envGet = ctx.env.get.bind(ctx.env) as (
      key: string,
    ) => string | undefined | Promise<string | undefined>;
    const values = await Promise.all(
      ENV_KEYS.map((key) => Promise.resolve(envGet(key)).then((value) => value ?? undefined)),
    );

    const missing: BLEnvKey[] = [];
    values.forEach((value: string | undefined, index: number) => {
      if (!value) {
        missing.push(ENV_KEYS[index]);
      }
    });

    if (missing.length > 0) {
      throw normalizeApiError("bricklink", new Error("Missing BrickLink credentials"), {
        missing,
      });
    }

    const [consumerKey, consumerSecret, accessToken, tokenSecret] = values as [
      string,
      string,
      string,
      string,
    ];

    return normalizeBlCredentials({
      consumerKey,
      consumerSecret,
      tokenValue: accessToken,
      tokenSecret,
    });
  }

  const credentials = getEnvBlCredentials();
  return normalizeBlCredentials({
    consumerKey: credentials.consumerKey,
    consumerSecret: credentials.consumerSecret,
    tokenValue: credentials.accessToken,
    tokenSecret: credentials.tokenSecret,
  });
}

function parseEnvelope<T>(
  raw: BLApiResponse<unknown>,
  context: { endpoint: string; correlationId: string },
): { envelope: BLEnvelope; data: T } {
  try {
    const envelope = parseBlEnvelope(raw, context);
    return { envelope, data: envelope.data as T };
  } catch (error) {
    throw normalizeApiError("bricklink", error, context);
  }
}

export interface BLPartExternalIds {
  brickowlId?: string;
  ldrawId?: string;
  legoId?: string;
}

export interface FetchBlColorParams {
  colorId: number;
}

export interface FetchBlCategoryParams {
  categoryId: number;
}

export interface FetchBlPartParams {
  itemNo: string;
  itemType?: "part" | "set" | "minifig";
  externalIds?: BLPartExternalIds;
}

export interface FetchBlPartColorsParams {
  itemNo: string;
}

export interface FetchBlPriceGuideParams {
  itemNo: string;
  colorId: number;
  itemType?: "part" | "set" | "minifig";
  currencyCode?: string;
}

type GuideType = "stock" | "sold";
type ConditionFlag = "N" | "U";

export async function fetchBlColor(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlColorParams,
): Promise<ReturnType<typeof mapColor>> {
  const path = `/colors/${params.colorId}`;
  const response = await makeBlCatalogRequest<BLColorResponse>(ctx, { path });
  const { data } = parseEnvelope<BLColorResponse>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapColor(data);
}

export async function fetchBlCategory(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlCategoryParams,
): Promise<ReturnType<typeof mapCategory>> {
  const path = `/categories/${params.categoryId}`;
  const response = await makeBlCatalogRequest<BLCategoryResponse>(ctx, { path });
  const { data } = parseEnvelope<BLCategoryResponse>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapCategory(data);
}

export async function fetchBlPart(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlPartParams,
): Promise<ReturnType<typeof mapPart>> {
  const itemType = params.itemType ?? "part";
  const path = `/items/${itemType}/${params.itemNo}`;
  const response = await makeBlCatalogRequest<BLItemResponse>(ctx, { path });
  const { data } = parseEnvelope<BLItemResponse>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapPart(data, params.externalIds);
}

export async function fetchBlPartColors(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlPartColorsParams,
): Promise<ReturnType<typeof mapPartColors>> {
  const path = `/items/part/${params.itemNo}/colors`;
  const response = await makeBlCatalogRequest<BLPartColorResponse[]>(ctx, {
    path,
  });
  const { data } = parseEnvelope<BLPartColorResponse[]>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapPartColors(params.itemNo, data);
}

async function fetchBlPriceGuideVariant(
  ctx: BLCatalogCtx | undefined,
  credentials: OAuthCredentials | undefined,
  options: {
    itemType: "part" | "set" | "minifig";
    itemNo: string;
    colorId: number;
    guideType: GuideType;
    newOrUsed: ConditionFlag;
    currencyCode: string;
  },
): Promise<ReturnType<typeof mapPriceGuide>> {
  const path = `/items/${options.itemType}/${options.itemNo}/price`;
  const requestOptions: BLCatalogRequestOptions = {
    path,
    query: {
      color_id: options.colorId,
      guide_type: options.guideType,
      new_or_used: options.newOrUsed,
      currency_code: options.currencyCode,
    },
  };

  const response = await makeBlCatalogRequest<BLPriceGuideResponse>(
    ctx,
    requestOptions,
    credentials ? { credentials } : undefined,
  );
  const { data } = parseEnvelope<BLPriceGuideResponse>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapPriceGuide(data, options.guideType, options.colorId);
}

export async function fetchBlPriceGuide(
  ctx: BLCatalogCtx | undefined,
  params: FetchBlPriceGuideParams,
): Promise<{
  usedStock: ReturnType<typeof mapPriceGuide>;
  newStock: ReturnType<typeof mapPriceGuide>;
  usedSold: ReturnType<typeof mapPriceGuide>;
  newSold: ReturnType<typeof mapPriceGuide>;
}> {
  const itemType = params.itemType ?? "part";
  const currencyCode = params.currencyCode ?? "USD";
  const credentials = await loadBlCatalogCredentials(ctx);

  const [usedStock, newStock, usedSold, newSold] = await Promise.all([
    fetchBlPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "stock",
      newOrUsed: "U",
      currencyCode,
    }),
    fetchBlPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "stock",
      newOrUsed: "N",
      currencyCode,
    }),
    fetchBlPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "sold",
      newOrUsed: "U",
      currencyCode,
    }),
    fetchBlPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "sold",
      newOrUsed: "N",
      currencyCode,
    }),
  ]);

  return { usedStock, newStock, usedSold, newSold };
}

export async function fetchAllBlColors(
  ctx: BLCatalogCtx | undefined,
): Promise<Array<ReturnType<typeof mapColor>>> {
  const path = "/colors";
  const response = await makeBlCatalogRequest<BLColorResponse[]>(ctx, { path });
  const { data } = parseEnvelope<BLColorResponse[]>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return data.map(mapColor);
}

export async function fetchAllBlCategories(
  ctx: BLCatalogCtx | undefined,
): Promise<Array<ReturnType<typeof mapCategory>>> {
  const path = "/categories";
  const response = await makeBlCatalogRequest<BLCategoryResponse[]>(ctx, { path });
  const { data } = parseEnvelope<BLCategoryResponse[]>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return data.map(mapCategory);
}

const HEALTH_ENDPOINT = "/orders";

export async function checkBlCatalogHealth(ctx?: BLCatalogCtx): Promise<HealthCheckResult> {
  const started = Date.now();
  try {
    const response = await makeBlCatalogRequest<unknown>(ctx, {
      path: HEALTH_ENDPOINT,
      query: { direction: "in", limit: 1 },
    });

    const duration = Date.now() - started;

    recordMetric("external.bricklink.catalog.health", {
      ok: true,
      status: response.status,
      durationMs: duration,
      correlationId: response.correlationId,
    });

    return {
      provider: "bricklink",
      ok: true,
      status: response.status,
      durationMs: duration,
    };
  } catch (error) {
    const duration = Date.now() - started;
    const apiError = normalizeApiError("bricklink", error, { endpoint: HEALTH_ENDPOINT });
    const details = (apiError.error.details ?? {}) as { status?: number; correlationId?: string };

    recordMetric("external.bricklink.catalog.health", {
      ok: false,
      status: details.status,
      errorCode: apiError.error.code,
      durationMs: duration,
      correlationId: details.correlationId,
    });

    return {
      provider: "bricklink",
      ok: false,
      status: details.status,
      error: apiError,
      durationMs: duration,
    };
  }
}

export const catalogClient = {
  getRefreshedColor(colorId: number, ctx?: BLCatalogCtx) {
    return fetchBlColor(ctx, { colorId });
  },
  getRefreshedCategory(categoryId: number, ctx?: BLCatalogCtx) {
    return fetchBlCategory(ctx, { categoryId });
  },
  getRefreshedPart(partNo: string, externalIds?: BLPartExternalIds, ctx?: BLCatalogCtx) {
    return fetchBlPart(ctx, { itemNo: partNo, externalIds });
  },
  getRefreshedPartColors(partNo: string, ctx?: BLCatalogCtx) {
    return fetchBlPartColors(ctx, { itemNo: partNo });
  },
  getRefreshedPriceGuide(
    partNo: string,
    colorId: number,
    itemType: "part" | "set" | "minifig" = "part",
    ctx?: BLCatalogCtx,
  ) {
    return fetchBlPriceGuide(ctx, { itemNo: partNo, colorId, itemType });
  },
  getAllColors(ctx?: BLCatalogCtx) {
    return fetchAllBlColors(ctx);
  },
  getAllCategories(ctx?: BLCatalogCtx) {
    return fetchAllBlCategories(ctx);
  },
  healthCheck(ctx?: BLCatalogCtx) {
    return checkBlCatalogHealth(ctx);
  },
};

export { generateCorrelationId } from "./shared/ids";
