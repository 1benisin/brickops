import { hmacSha1Base64, randomHex } from "../lib/webcrypto";
import { getBricklinkCredentials } from "../lib/external/env";
import { recordMetric } from "../lib/external/metrics";
import { HealthCheckResult, normalizeApiError } from "../lib/external/types";
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
} from "./bricklinkMappers";

const BASE_URL = "https://api.bricklink.com/api/store/v1/";
const HEALTH_ENDPOINT = "/orders";

const DAILY_QUOTA_CAPACITY = 5_000;
const DAILY_QUOTA_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const ALERT_THRESHOLD = 0.8;

const percentEncode = (input: string) =>
  encodeURIComponent(input)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

export class BricklinkClient {
  private readonly credentials: ReturnType<typeof getBricklinkCredentials>;
  private readonly nonce: () => string;
  private readonly timestamp: () => number;

  private static quotaState = {
    count: 0,
    windowStart: 0,
    alertEmitted: false,
  };

  constructor() {
    this.credentials = getBricklinkCredentials();
    this.nonce = () => randomHex(16);
    this.timestamp = () => Math.floor(Date.now() / 1000);
  }

  /** @internal Test only - creates client with custom options */
  static createForTesting(
    options: {
      credentials?: ReturnType<typeof getBricklinkCredentials>;
      nonce?: () => string;
      timestamp?: () => number;
    } = {},
  ) {
    const client = Object.create(BricklinkClient.prototype);
    client.credentials = options.credentials ?? getBricklinkCredentials();
    client.nonce = options.nonce ?? (() => randomHex(16));
    client.timestamp = options.timestamp ?? (() => Math.floor(Date.now() / 1000));
    return client;
  }

  /** @internal Test only - resets quota tracking state */
  static resetQuotaForTests() {
    BricklinkClient.quotaState = {
      count: 0,
      windowStart: 0,
      alertEmitted: false,
    };
  }

  private static recordQuotaUsage() {
    const now = Date.now();
    const windowElapsed = now - BricklinkClient.quotaState.windowStart;
    if (BricklinkClient.quotaState.windowStart === 0 || windowElapsed >= DAILY_QUOTA_INTERVAL_MS) {
      BricklinkClient.quotaState.windowStart = now;
      BricklinkClient.quotaState.count = 0;
      BricklinkClient.quotaState.alertEmitted = false;
    }

    const nextCount = BricklinkClient.quotaState.count + 1;
    const percentage = nextCount / DAILY_QUOTA_CAPACITY;

    if (nextCount > DAILY_QUOTA_CAPACITY) {
      const timeUntilReset =
        DAILY_QUOTA_INTERVAL_MS - (now - BricklinkClient.quotaState.windowStart);

      recordMetric("external.bricklink.quota.blocked", {
        count: BricklinkClient.quotaState.count,
        capacity: DAILY_QUOTA_CAPACITY,
        percentage: BricklinkClient.quotaState.count / DAILY_QUOTA_CAPACITY,
        retryAfterMs: timeUntilReset,
      });

      throw new Error(
        `Bricklink API daily quota exceeded (${DAILY_QUOTA_CAPACITY} requests/day); retry after ${Math.ceil(timeUntilReset / 1000)} seconds`,
      );
    }

    BricklinkClient.quotaState.count = nextCount;

    recordMetric("external.bricklink.quota", {
      count: nextCount,
      capacity: DAILY_QUOTA_CAPACITY,
      percentage,
    });

    if (percentage >= ALERT_THRESHOLD && !BricklinkClient.quotaState.alertEmitted) {
      BricklinkClient.quotaState.alertEmitted = true;
      recordMetric("external.bricklink.quota.alert", {
        count: nextCount,
        capacity: DAILY_QUOTA_CAPACITY,
        percentage,
      });
    }
  }

  async request<T>(options: {
    path: string;
    method?: string;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
  }): Promise<{ data: T; status: number; headers: Headers }> {
    const method = (options.method ?? "GET").toUpperCase();
    const queryEntries = Object.entries(options.query ?? {}).filter(
      ([, value]) => value !== undefined && value !== null,
    );

    // Remove leading slash to make path relative to BASE_URL
    const relativePath = options.path.startsWith("/") ? options.path.substring(1) : options.path;
    const url = new URL(relativePath, BASE_URL);

    // Add query parameters to URL
    queryEntries.forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    // Build OAuth 1.0 parameters
    const oauthParams: [string, string][] = [
      ["oauth_consumer_key", this.credentials.consumerKey],
      ["oauth_token", this.credentials.accessToken],
      ["oauth_signature_method", "HMAC-SHA1"],
      ["oauth_timestamp", this.timestamp().toString()],
      ["oauth_nonce", this.nonce()],
      ["oauth_version", "1.0"],
    ];

    const allParams: [string, string][] = [
      ...queryEntries.map(([key, value]): [string, string] => [key, String(value)]),
      ...oauthParams,
    ];

    // Generate OAuth signature
    const signingKey = `${percentEncode(this.credentials.consumerSecret)}&${percentEncode(this.credentials.tokenSecret)}`;
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

    const baseUrl = url.href.split("?")[0];
    const baseString = [
      method.toUpperCase(),
      percentEncode(baseUrl),
      percentEncode(normalizedParams),
    ].join("&");

    const signature = await hmacSha1Base64(signingKey, baseString);

    const authorization = `OAuth ${[...oauthParams, ["oauth_signature", signature]]
      .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
      .join(", ")}`;

    // Check quota before making request - will throw error if quota is exceeded
    BricklinkClient.recordQuotaUsage();

    // Make HTTP request
    const response = await fetch(url.href, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": "BrickOps/1.0",
        ...(options.headers ?? {}),
        Authorization: authorization,
      },
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      let body: unknown;
      try {
        if (contentType.includes("application/json")) {
          body = await response.json();
        } else {
          body = await response.text();
        }
      } catch (error) {
        body = { parseError: (error as Error).message };
      }

      throw normalizeApiError("bricklink", new Error(`HTTP ${response.status}`), {
        endpoint: options.path,
        status: response.status,
        body,
      });
    }

    const data = (await response.json()) as T;
    return {
      data,
      status: response.status,
      headers: response.headers,
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      const result = await this.request<{ data: unknown }>({
        path: HEALTH_ENDPOINT,
        query: { direction: "in", limit: 1 },
      });

      const duration = Date.now() - started;
      recordMetric("external.bricklink.health", {
        ok: true,
        status: result.status,
        durationMs: duration,
      });

      return {
        provider: "bricklink",
        ok: true,
        status: result.status,
        durationMs: duration,
      } satisfies HealthCheckResult;
    } catch (error) {
      const duration = Date.now() - started;
      const apiError = normalizeApiError("bricklink", error, { endpoint: HEALTH_ENDPOINT });
      const details = apiError.error.details as { status?: number } | undefined;

      recordMetric("external.bricklink.health", {
        ok: false,
        status: details?.status,
        errorCode: apiError.error.code,
        durationMs: duration,
      });
      return {
        provider: "bricklink",
        ok: false,
        status: details?.status,
        error: apiError,
        durationMs: duration,
      } satisfies HealthCheckResult;
    }
  }

  /**
   * Refresh color data from Bricklink API
   */
  async getRefreshedColor(colorId: number): Promise<ReturnType<typeof mapColor>> {
    try {
      const result = await this.request<{ meta: unknown; data: BricklinkColorResponse }>({
        path: `/colors/${colorId}`,
      });

      return mapColor(result.data.data);
    } catch (error) {
      throw new Error(
        `Failed to fetch color ${colorId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Refresh category data from Bricklink API
   */
  async getRefreshedCategory(categoryId: number): Promise<ReturnType<typeof mapCategory>> {
    try {
      const result = await this.request<{ meta: unknown; data: BricklinkCategoryResponse }>({
        path: `/categories/${categoryId}`,
      });

      return mapCategory(result.data.data);
    } catch (error) {
      throw new Error(
        `Failed to fetch category ${categoryId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Refresh part data from Bricklink API
   */
  async getRefreshedPart(partNo: string): Promise<ReturnType<typeof mapPart>> {
    try {
      const result = await this.request<{ meta: unknown; data: BricklinkItemResponse }>({
        path: `/items/part/${partNo}`,
      });

      return mapPart(result.data.data);
    } catch (error) {
      throw new Error(
        `Failed to fetch part ${partNo}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Refresh part colors data from Bricklink API
   */
  async getRefreshedPartColors(partNo: string): Promise<ReturnType<typeof mapPartColors>> {
    try {
      const result = await this.request<{ meta: unknown; data: BricklinkPartColorResponse[] }>({
        path: `/items/part/${partNo}/colors`,
      });

      return mapPartColors(partNo, result.data.data);
    } catch (error) {
      throw new Error(
        `Failed to fetch part colors for ${partNo}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Refresh price guide data from Bricklink API
   *
   */
  /**
   * Fetches all price guide data for a part-color, including:
   * - used stock
   * - new stock
   * - used sold
   * - new sold
   */
  async getRefreshedPriceGuide(
    partNo: string,
    colorId: number,
    itemType: "part" | "set" | "minifig" = "part",
  ): Promise<{
    usedStock: ReturnType<typeof mapPriceGuide>;
    newStock: ReturnType<typeof mapPriceGuide>;
    usedSold: ReturnType<typeof mapPriceGuide>;
    newSold: ReturnType<typeof mapPriceGuide>;
  }> {
    try {
      // Helper to make a single request
      const fetchGuide = async (guideType: "stock" | "sold", newOrUsed: "N" | "U") => {
        const query = {
          color_id: colorId.toString(),
          guide_type: guideType,
          new_or_used: newOrUsed,
          currency_code: "USD",
        };
        const result = await this.request<{ meta: unknown; data: BricklinkPriceGuideResponse }>({
          path: `/items/${itemType}/${partNo}/price`,
          query,
        });
        return mapPriceGuide(result.data.data);
      };

      // Run all 4 requests in parallel
      const [usedStock, newStock, usedSold, newSold] = await Promise.all([
        fetchGuide("stock", "U"),
        fetchGuide("stock", "N"),
        fetchGuide("sold", "U"),
        fetchGuide("sold", "N"),
      ]);

      return { usedStock, newStock, usedSold, newSold };
    } catch (error) {
      throw new Error(
        `Failed to fetch price guides for ${partNo}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get all colors from Bricklink API
   */
  async getAllColors(): Promise<ReturnType<typeof mapColor>[]> {
    try {
      const result = await this.request<{ meta: unknown; data: BricklinkColorResponse[] }>({
        path: "/colors",
      });

      return result.data.data.map(mapColor);
    } catch (error) {
      throw new Error(
        `Failed to fetch all colors: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get all categories from Bricklink API
   */
  async getAllCategories(): Promise<ReturnType<typeof mapCategory>[]> {
    try {
      const result = await this.request<{ meta: unknown; data: BricklinkCategoryResponse[] }>({
        path: "/categories",
      });

      return result.data.data.map(mapCategory);
    } catch (error) {
      throw new Error(
        `Failed to fetch all categories: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Shared BricklinkClient instance
 *
 * This singleton instance is used across the application to ensure:
 * - Quota tracking is global (all code shares the same rate limit counter)
 * - Efficient resource usage (no repeated instantiation)
 * - Consistent behavior across all Bricklink API calls
 *
 * For testing, use BricklinkClient.createForTesting() instead.
 */
export const bricklinkClient = new BricklinkClient();
