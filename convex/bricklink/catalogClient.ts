import { randomHex } from "../lib/webcrypto";
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
import {
  generateOAuthParams,
  generateOAuthSignature,
  buildAuthorizationHeader,
  type OAuthCredentials,
} from "./oauth";
import { getRateLimitConfig } from "../marketplace/rateLimitConfig";

const BASE_URL = "https://api.bricklink.com/api/store/v1/";
const HEALTH_ENDPOINT = "/orders";

// Get BrickLink rate limit configuration from shared source (reserved for metrics or headers)
const _RATE_LIMIT = getRateLimitConfig("bricklink");

export class BricklinkClient {
  private readonly credentials: ReturnType<typeof getBricklinkCredentials>;
  private readonly nonce: () => string;
  private readonly timestamp: () => number;

  constructor() {
    this.credentials = getBricklinkCredentials();
    this.nonce = () => randomHex(16);
    this.timestamp = () => Math.floor(Date.now() / 1000);
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

    // Convert credentials to OAuth format
    const oauthCredentials: OAuthCredentials = {
      consumerKey: this.credentials.consumerKey,
      consumerSecret: this.credentials.consumerSecret,
      tokenValue: this.credentials.accessToken,
      tokenSecret: this.credentials.tokenSecret,
    };

    // Generate OAuth parameters
    const oauthParams = generateOAuthParams(this.timestamp, this.nonce);

    // Build parameter list for signing
    const oauthParamPairs: Array<[string, string]> = [
      ["oauth_consumer_key", oauthCredentials.consumerKey],
      ["oauth_token", oauthCredentials.tokenValue],
      ["oauth_signature_method", "HMAC-SHA1"],
      ["oauth_timestamp", oauthParams.timestamp],
      ["oauth_nonce", oauthParams.nonce],
      ["oauth_version", "1.0"],
    ];

    const allParams: Array<[string, string]> = [
      ...queryEntries.map(([key, value]): [string, string] => [key, String(value)]),
      ...oauthParamPairs,
    ];

    // Generate OAuth signature using shared helper
    const baseUrl = url.href.split("?")[0];
    const signature = await generateOAuthSignature(oauthCredentials, method, baseUrl, allParams);

    // Build Authorization header using shared helper
    const authorization = buildAuthorizationHeader(oauthCredentials, signature, oauthParams);

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
        // Pass the colorId we requested since Bricklink doesn't echo it back
        return mapPriceGuide(result.data.data, guideType, colorId);
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

  // (getPartColorImage removed - client uses BrickLink CDN directly)

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

export const catalogClient = new BricklinkClient();
