import { getBricklinkCredentials } from "../../lib/external/env";
import { recordMetric } from "../../lib/external/metrics";
import { HealthCheckResult, normalizeApiError } from "../../lib/external/types";
import {
  BricklinkColorResponse,
  BricklinkCategoryResponse,
  BricklinkItemResponse,
  BricklinkPartColorResponse,
  BricklinkPriceGuideResponse,
  mapColor,
  mapCategory,
  mapPart,
  mapPartColors,
  mapPriceGuide,
} from "./transformers";
import {
  buildAuthorizationHeader,
  generateOAuthParams,
  generateOAuthSignature,
  generateRequestId,
  type OAuthCredentials,
} from "./oauth";
import { parseBricklinkEnvelope, type BricklinkEnvelope } from "./validation";

const BASE_URL = "https://api.bricklink.com/api/store/v1/";
const HEALTH_ENDPOINT = "/orders";
const REQUEST_METRIC = "external.bricklink.catalog.request";
const HEALTH_METRIC = "external.bricklink.catalog.health";

export type BricklinkCatalogCtx = {
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

type BricklinkEnvKey = (typeof ENV_KEYS)[number];

export interface BricklinkCatalogRequestOptions {
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  correlationId?: string;
}

export interface BricklinkCatalogRequestResult<T> {
  data: T;
  status: number;
  headers: Headers;
  correlationId: string;
}

export interface BricklinkPartExternalIds {
  brickowlId?: string;
  ldrawId?: string;
  legoId?: string;
}

export interface FetchBricklinkColorParams {
  colorId: number;
}

export interface FetchBricklinkCategoryParams {
  categoryId: number;
}

export interface FetchBricklinkPartParams {
  itemNo: string;
  itemType?: "part" | "set" | "minifig";
  externalIds?: BricklinkPartExternalIds;
}

export interface FetchBricklinkPartColorsParams {
  itemNo: string;
}

export interface FetchBricklinkPriceGuideParams {
  itemNo: string;
  colorId: number;
  itemType?: "part" | "set" | "minifig";
  currencyCode?: string;
}

type GuideType = "stock" | "sold";
type ConditionFlag = "N" | "U";

export async function loadBricklinkCatalogCredentials(
  ctx?: BricklinkCatalogCtx,
): Promise<OAuthCredentials> {
  if (ctx?.env?.get) {
    const envGet = ctx.env.get.bind(ctx.env) as (
      key: string,
    ) => string | undefined | Promise<string | undefined>;
    const values = await Promise.all(
      ENV_KEYS.map((key) => Promise.resolve(envGet(key)).then((value) => value ?? undefined)),
    );

    const missing: BricklinkEnvKey[] = [];
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

    return {
      consumerKey,
      consumerSecret,
      tokenValue: accessToken,
      tokenSecret,
    };
  }

  const credentials = getBricklinkCredentials();
  return {
    consumerKey: credentials.consumerKey,
    consumerSecret: credentials.consumerSecret,
    tokenValue: credentials.accessToken,
    tokenSecret: credentials.tokenSecret,
  };
}

function buildRequestUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(relativePath, BASE_URL);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    url.searchParams.append(key, String(value));
  });

  return url;
}

function parseEnvelope<T>(
  raw: unknown,
  context: { endpoint: string; correlationId: string },
): { envelope: BricklinkEnvelope; data: T } {
  try {
    const envelope = parseBricklinkEnvelope(raw, context);
    return { envelope, data: envelope.data as T };
  } catch (error) {
    throw normalizeApiError("bricklink", error, context);
  }
}

async function performBricklinkCatalogRequest<T>(
  credentials: OAuthCredentials,
  options: BricklinkCatalogRequestOptions,
): Promise<BricklinkCatalogRequestResult<T>> {
  const method = (options.method ?? "GET").toUpperCase();
  const correlationId = options.correlationId ?? generateRequestId();
  const url = buildRequestUrl(options.path, options.query);
  const queryEntries = Array.from(url.searchParams.entries()) as Array<[string, string]>;

  const oauthParams = generateOAuthParams();
  const oauthParamPairs: Array<[string, string]> = [
    ["oauth_consumer_key", credentials.consumerKey],
    ["oauth_token", credentials.tokenValue],
    ["oauth_signature_method", "HMAC-SHA1"],
    ["oauth_timestamp", oauthParams.timestamp],
    ["oauth_nonce", oauthParams.nonce],
    ["oauth_version", "1.0"],
  ];

  const allParams: Array<[string, string]> = [...queryEntries, ...oauthParamPairs];
  const baseUrl = `${url.origin}${url.pathname}`;
  const signature = await generateOAuthSignature(credentials, method, baseUrl, allParams);
  const authorization = buildAuthorizationHeader(credentials, signature, oauthParams);

  const started = Date.now();
  let response: Response;

  try {
    response = await fetch(url.href, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": "BrickOps/1.0",
        ...(options.headers ?? {}),
        Authorization: authorization,
      },
    });
  } catch (error) {
    const duration = Date.now() - started;
    recordMetric(REQUEST_METRIC, {
      ok: false,
      status: undefined,
      operation: options.path,
      method,
      durationMs: duration,
      correlationId,
      errorType: "network",
    });
    throw normalizeApiError("bricklink", error, {
      endpoint: options.path,
      correlationId,
    });
  }

  const duration = Date.now() - started;

  if (!response.ok) {
    const bodyText = await response.text();
    let body: unknown = bodyText;
    try {
      body = bodyText ? JSON.parse(bodyText) : bodyText;
    } catch {
      // Keep body as text when JSON parsing fails.
    }

    recordMetric(REQUEST_METRIC, {
      ok: false,
      status: response.status,
      operation: options.path,
      method,
      durationMs: duration,
      correlationId,
    });

    throw normalizeApiError("bricklink", new Error(`HTTP ${response.status}`), {
      endpoint: options.path,
      status: response.status,
      body,
      correlationId,
    });
  }

  const data = (await response.json()) as T;

  recordMetric(REQUEST_METRIC, {
    ok: true,
    status: response.status,
    operation: options.path,
    method,
    durationMs: duration,
    correlationId,
  });

  return {
    data,
    status: response.status,
    headers: response.headers,
    correlationId,
  };
}

export async function makeBricklinkCatalogRequest<T>(
  ctx: BricklinkCatalogCtx | undefined,
  options: BricklinkCatalogRequestOptions,
): Promise<BricklinkCatalogRequestResult<T>> {
  const credentials = await loadBricklinkCatalogCredentials(ctx);
  return await performBricklinkCatalogRequest<T>(credentials, options);
}

export async function fetchBricklinkColor(
  ctx: BricklinkCatalogCtx | undefined,
  params: FetchBricklinkColorParams,
): Promise<ReturnType<typeof mapColor>> {
  const path = `/colors/${params.colorId}`;
  const response = await makeBricklinkCatalogRequest<unknown>(ctx, { path });
  const { data } = parseEnvelope<BricklinkColorResponse>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapColor(data);
}

export async function fetchBricklinkCategory(
  ctx: BricklinkCatalogCtx | undefined,
  params: FetchBricklinkCategoryParams,
): Promise<ReturnType<typeof mapCategory>> {
  const path = `/categories/${params.categoryId}`;
  const response = await makeBricklinkCatalogRequest<unknown>(ctx, { path });
  const { data } = parseEnvelope<BricklinkCategoryResponse>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapCategory(data);
}

export async function fetchBricklinkPart(
  ctx: BricklinkCatalogCtx | undefined,
  params: FetchBricklinkPartParams,
): Promise<ReturnType<typeof mapPart>> {
  const itemType = params.itemType ?? "part";
  const path = `/items/${itemType}/${params.itemNo}`;
  const response = await makeBricklinkCatalogRequest<unknown>(ctx, { path });
  const { data } = parseEnvelope<BricklinkItemResponse>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapPart(data, params.externalIds);
}

export async function fetchBricklinkPartColors(
  ctx: BricklinkCatalogCtx | undefined,
  params: FetchBricklinkPartColorsParams,
): Promise<ReturnType<typeof mapPartColors>> {
  const path = `/items/part/${params.itemNo}/colors`;
  const response = await makeBricklinkCatalogRequest<unknown>(ctx, { path });
  const { data } = parseEnvelope<BricklinkPartColorResponse[]>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapPartColors(params.itemNo, data);
}

async function fetchBricklinkPriceGuideVariant(
  ctx: BricklinkCatalogCtx | undefined,
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
  const requestOptions: BricklinkCatalogRequestOptions = {
    path,
    query: {
      color_id: options.colorId,
      guide_type: options.guideType,
      new_or_used: options.newOrUsed,
      currency_code: options.currencyCode,
    },
  };

  if (credentials) {
    const response = await performBricklinkCatalogRequest<unknown>(credentials, requestOptions);
    const { data } = parseEnvelope<BricklinkPriceGuideResponse>(response.data, {
      endpoint: path,
      correlationId: response.correlationId,
    });
    return mapPriceGuide(data, options.guideType, options.colorId);
  }

  const response = await makeBricklinkCatalogRequest<unknown>(ctx, requestOptions);
  const { data } = parseEnvelope<BricklinkPriceGuideResponse>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return mapPriceGuide(data, options.guideType, options.colorId);
}

export async function fetchBricklinkPriceGuide(
  ctx: BricklinkCatalogCtx | undefined,
  params: FetchBricklinkPriceGuideParams,
): Promise<{
  usedStock: ReturnType<typeof mapPriceGuide>;
  newStock: ReturnType<typeof mapPriceGuide>;
  usedSold: ReturnType<typeof mapPriceGuide>;
  newSold: ReturnType<typeof mapPriceGuide>;
}> {
  const itemType = params.itemType ?? "part";
  const currencyCode = params.currencyCode ?? "USD";
  const credentials = await loadBricklinkCatalogCredentials(ctx);

  const [usedStock, newStock, usedSold, newSold] = await Promise.all([
    fetchBricklinkPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "stock",
      newOrUsed: "U",
      currencyCode,
    }),
    fetchBricklinkPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "stock",
      newOrUsed: "N",
      currencyCode,
    }),
    fetchBricklinkPriceGuideVariant(ctx, credentials, {
      itemType,
      itemNo: params.itemNo,
      colorId: params.colorId,
      guideType: "sold",
      newOrUsed: "U",
      currencyCode,
    }),
    fetchBricklinkPriceGuideVariant(ctx, credentials, {
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

export async function fetchAllBricklinkColors(
  ctx: BricklinkCatalogCtx | undefined,
): Promise<Array<ReturnType<typeof mapColor>>> {
  const path = "/colors";
  const response = await makeBricklinkCatalogRequest<unknown>(ctx, { path });
  const { data } = parseEnvelope<BricklinkColorResponse[]>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return data.map(mapColor);
}

export async function fetchAllBricklinkCategories(
  ctx: BricklinkCatalogCtx | undefined,
): Promise<Array<ReturnType<typeof mapCategory>>> {
  const path = "/categories";
  const response = await makeBricklinkCatalogRequest<unknown>(ctx, { path });
  const { data } = parseEnvelope<BricklinkCategoryResponse[]>(response.data, {
    endpoint: path,
    correlationId: response.correlationId,
  });
  return data.map(mapCategory);
}

export async function checkBricklinkCatalogHealth(
  ctx?: BricklinkCatalogCtx,
): Promise<HealthCheckResult> {
  const started = Date.now();
  try {
    const response = await makeBricklinkCatalogRequest<unknown>(ctx, {
      path: HEALTH_ENDPOINT,
      query: { direction: "in", limit: 1 },
    });

    const duration = Date.now() - started;

    recordMetric(HEALTH_METRIC, {
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

    recordMetric(HEALTH_METRIC, {
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
  getRefreshedColor(colorId: number, ctx?: BricklinkCatalogCtx) {
    return fetchBricklinkColor(ctx, { colorId });
  },
  getRefreshedCategory(categoryId: number, ctx?: BricklinkCatalogCtx) {
    return fetchBricklinkCategory(ctx, { categoryId });
  },
  getRefreshedPart(
    partNo: string,
    externalIds?: BricklinkPartExternalIds,
    ctx?: BricklinkCatalogCtx,
  ) {
    return fetchBricklinkPart(ctx, { itemNo: partNo, externalIds });
  },
  getRefreshedPartColors(partNo: string, ctx?: BricklinkCatalogCtx) {
    return fetchBricklinkPartColors(ctx, { itemNo: partNo });
  },
  getRefreshedPriceGuide(
    partNo: string,
    colorId: number,
    itemType: "part" | "set" | "minifig" = "part",
    ctx?: BricklinkCatalogCtx,
  ) {
    return fetchBricklinkPriceGuide(ctx, { itemNo: partNo, colorId, itemType });
  },
  getAllColors(ctx?: BricklinkCatalogCtx) {
    return fetchAllBricklinkColors(ctx);
  },
  getAllCategories(ctx?: BricklinkCatalogCtx) {
    return fetchAllBricklinkCategories(ctx);
  },
  healthCheck(ctx?: BricklinkCatalogCtx) {
    return checkBricklinkCatalogHealth(ctx);
  },
};
