import { getRebrickableApiKey } from "../lib/external/env";
import { ExternalHttpClient, RequestOptions, RequestResult } from "../lib/external/httpClient";
import { RateLimitConfig } from "../lib/external/httpClient";
import { recordMetric } from "../lib/external/metrics";
import { HealthCheckResult, normalizeApiError } from "../lib/external/types";
import { getRateLimitConfig } from "../ratelimiter/rateLimitConfig";

const BASE_URL = "https://rebrickable.com/api/v3";
const HEALTH_ENDPOINT = "/lego/colors/";

// Get Rebrickable rate limit configuration
const getRebrickableRateLimit = (): RateLimitConfig => {
  const config = getRateLimitConfig("rebrickable");
  return {
    capacity: config.capacity,
    intervalMs: config.windowDurationMs,
  };
};

const DEFAULT_RATE_LIMIT = getRebrickableRateLimit();

// ============================================================================
// Types
// ============================================================================

export interface RebrickableExternalIds {
  BrickLink?: string[];
  BrickOwl?: string[];
  Brickset?: string[];
  LEGO?: string[];
  LDraw?: string[];
}

export interface RebrickablePart {
  part_num: string;
  name: string;
  part_cat_id: number;
  part_url: string;
  part_img_url: string | null;
  external_ids: RebrickableExternalIds;
}

export interface RebrickablePartsListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RebrickablePart[];
}

// ============================================================================
// Client
// ============================================================================

export class RebrickableClient {
  private readonly apiKey: string;
  private readonly http: ExternalHttpClient;

  constructor(options: { apiKey?: string } = {}) {
    this.apiKey = options.apiKey ?? getRebrickableApiKey();
    this.http = new ExternalHttpClient("rebrickable", BASE_URL, {
      Accept: "application/json",
      "User-Agent": "BrickOps/1.0",
      Authorization: `key ${this.apiKey}`,
    });
  }

  async request<T>(
    options: Omit<RequestOptions, "rateLimit"> & { rateLimit?: RateLimitConfig },
  ): Promise<RequestResult<T>> {
    return this.http.request<T>({
      ...options,
      rateLimit: options.rateLimit ?? DEFAULT_RATE_LIMIT,
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const started = Date.now();
    try {
      const result = await this.request<RebrickablePartsListResponse>({
        path: HEALTH_ENDPOINT,
        query: { page_size: 1 },
      });

      const duration = Date.now() - started;
      recordMetric("external.rebrickable.health", {
        ok: true,
        status: result.status,
        durationMs: duration,
      });

      return {
        provider: "rebrickable",
        ok: true,
        status: result.status,
        durationMs: duration,
      } satisfies HealthCheckResult;
    } catch (error) {
      const duration = Date.now() - started;
      const apiError = normalizeApiError("rebrickable", error, { endpoint: HEALTH_ENDPOINT });
      const details = apiError.error.details as { status?: number } | undefined;

      recordMetric("external.rebrickable.health", {
        ok: false,
        status: details?.status,
        errorCode: apiError.error.code,
        durationMs: duration,
      });
      return {
        provider: "rebrickable",
        ok: false,
        status: details?.status,
        error: apiError,
        durationMs: duration,
      } satisfies HealthCheckResult;
    }
  }

  /**
   * Get parts by BrickLink IDs
   * Returns a map of BrickLink ID -> RebrickablePart[]
   * Uses bulk lookup when possible to minimize API calls
   */
  async getPartsByBricklinkIds(bricklinkIds: string[]): Promise<Map<string, RebrickablePart[]>> {
    const mapping = new Map<string, RebrickablePart[]>();
    if (bricklinkIds.length === 0) {
      return mapping;
    }

    const started = Date.now();

    try {
      // Rebrickable supports filtering by bricklink_id
      // Query each BrickLink ID separately to maintain mapping
      // Process in batches to avoid overwhelming the API
      const batchSize = 10; // Conservative batch size
      for (let i = 0; i < bricklinkIds.length; i += batchSize) {
        const batch = bricklinkIds.slice(i, i + batchSize);

        // Query each BrickLink ID (Rebrickable API supports bricklink_id filter)
        const batchPromises = batch.map(async (bricklinkId) => {
          try {
            const result = await this.request<RebrickablePartsListResponse>({
              path: "/lego/parts/",
              query: {
                bricklink_id: bricklinkId,
                page_size: 1000, // Max page size
              },
            });
            return { bricklinkId, parts: result.data.results };
          } catch (error) {
            // Log error but continue with other IDs
            recordMetric("external.rebrickable.getPartsByBricklinkIds.error", {
              bricklinkId,
              errorCode: error instanceof Error ? error.message : String(error),
            });
            return { bricklinkId, parts: [] };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        for (const { bricklinkId, parts } of batchResults) {
          mapping.set(bricklinkId, parts);
        }
      }

      const duration = Date.now() - started;
      const totalParts = Array.from(mapping.values()).reduce((sum, parts) => sum + parts.length, 0);
      recordMetric("external.rebrickable.getPartsByBricklinkIds", {
        bricklinkIdCount: bricklinkIds.length,
        partCount: totalParts,
        durationMs: duration,
      });

      return mapping;
    } catch (error) {
      const duration = Date.now() - started;
      const apiError = normalizeApiError("rebrickable", error, {
        endpoint: "/lego/parts/",
        bricklinkIdCount: bricklinkIds.length,
      });

      recordMetric("external.rebrickable.getPartsByBricklinkIds.error", {
        bricklinkIdCount: bricklinkIds.length,
        errorCode: apiError.error.code,
        durationMs: duration,
      });

      throw apiError;
    }
  }

  /**
   * Get parts by BrickOwl IDs
   * Returns a map of BrickOwl ID -> RebrickablePart[]
   */
  async getPartsByBrickowlIds(brickowlIds: string[]): Promise<Map<string, RebrickablePart[]>> {
    const mapping = new Map<string, RebrickablePart[]>();
    if (brickowlIds.length === 0) {
      return mapping;
    }

    const started = Date.now();

    try {
      const batchSize = 10;
      for (let i = 0; i < brickowlIds.length; i += batchSize) {
        const batch = brickowlIds.slice(i, i + batchSize);

        const batchPromises = batch.map(async (brickowlId) => {
          try {
            const result = await this.request<RebrickablePartsListResponse>({
              path: "/lego/parts/",
              query: {
                brickowl_id: brickowlId,
                page_size: 1000,
              },
            });
            return { brickowlId, parts: result.data.results };
          } catch (error) {
            recordMetric("external.rebrickable.getPartsByBrickowlIds.error", {
              brickowlId,
              errorCode: error instanceof Error ? error.message : String(error),
            });
            return { brickowlId, parts: [] };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        for (const { brickowlId, parts } of batchResults) {
          mapping.set(brickowlId, parts);
        }
      }

      const duration = Date.now() - started;
      const totalParts = Array.from(mapping.values()).reduce((sum, parts) => sum + parts.length, 0);
      recordMetric("external.rebrickable.getPartsByBrickowlIds", {
        brickowlIdCount: brickowlIds.length,
        partCount: totalParts,
        durationMs: duration,
      });

      return mapping;
    } catch (error) {
      const duration = Date.now() - started;
      const apiError = normalizeApiError("rebrickable", error, {
        endpoint: "/lego/parts/",
        brickowlIdCount: brickowlIds.length,
      });

      recordMetric("external.rebrickable.getPartsByBrickowlIds.error", {
        brickowlIdCount: brickowlIds.length,
        errorCode: apiError.error.code,
        durationMs: duration,
      });

      throw apiError;
    }
  }
  /**
   * Get all colors with external IDs
   * Returns a list of colors
   */
  async getColors(): Promise<RebrickableColor[]> {
    const started = Date.now();
    try {
      // Fetch all colors (page_size=1000 should cover all ~200 colors)
      const result = await this.request<RebrickableColorListResponse>({
        path: "/lego/colors/",
        query: { page_size: 1000 },
      });

      const duration = Date.now() - started;
      recordMetric("external.rebrickable.getColors", {
        count: result.data.results.length,
        durationMs: duration,
      });

      return result.data.results;
    } catch (error) {
      const duration = Date.now() - started;
      const apiError = normalizeApiError("rebrickable", error, {
        endpoint: "/lego/colors/",
      });

      recordMetric("external.rebrickable.getColors.error", {
        errorCode: apiError.error.code,
        durationMs: duration,
      });

      throw apiError;
    }
  }
}

export interface RebrickableColor {
  id: number;
  name: string;
  rgb: string;
  is_trans: boolean;
  external_ids: RebrickableExternalIds;
}

export interface RebrickableColorListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: RebrickableColor[];
}
