/**
 * Bricklink Data Aggregator
 *
 * This module provides utilities for fetching and aggregating LEGO part data from Bricklink API.
 * It handles rate limiting, caching, data normalization, and error handling for part details and colors.
 */

import type { GenericMutationCtx } from "convex/server";

import type { DataModel } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { ConvexError } from "convex/values";

import { BricklinkClient } from "../external/bricklink";
import { recordMetric } from "../external/metrics";
import { consumeBricklinkQuota, requireQuotaSuccess } from "./rateLimiter";

/** Context type for Bricklink aggregator operations - supports both standard and generic mutation contexts */
export type BricklinkAggregatorCtx = MutationCtx | GenericMutationCtx<DataModel>;

/**
 * Convert protocol-relative URLs (starting with //) to absolute HTTPS URLs
 * This is required for Next.js Image component compatibility
 */
function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url || typeof url !== "string") {
    return undefined;
  }

  // Convert protocol-relative URLs to HTTPS
  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  return url;
}

/**
 * Normalized snapshot of LEGO part data from Bricklink API
 *
 * This type represents a cleaned, structured view of part data with:
 * - Standardized field names and types
 * - Optional fields for flexibility with varying API responses
 * - Raw data preservation for debugging/advanced use cases
 */
export type PartSnapshot = {
  partNumber: string;
  canonicalName?: string;
  categoryId?: number;
  description?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  weightGrams?: number;
  dimensionsMm?: {
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
  };
  isPrinted?: boolean;
  isObsolete?: boolean;
  availableColorIds?: number[];
  rawDetail?: unknown;
  rawColors?: unknown;
};

/**
 * Configuration options for fetching Bricklink part data
 */
export type FetchOptions = {
  identityKey?: string;
  memo?: Map<string, Promise<unknown>>;
  reserveOnLimit?: boolean;
};

/** Constructs Bricklink API path for part detail requests */
const DETAIL_PATH = (partNumber: string) => `/items/part/${encodeURIComponent(partNumber)}`;

/** Constructs Bricklink API path for part color requests */
const COLORS_PATH = (partNumber: string) => `/items/part/${encodeURIComponent(partNumber)}/colors`;

/**
 * Memoized fetch utility that caches promises to prevent duplicate API calls
 *
 * This prevents race conditions when multiple requests for the same data are made
 * simultaneously. If a request fails, the cache entry is removed so it can be retried.
 *
 * @param memo - Shared cache map for storing promises
 * @param key - Unique cache key for this request
 * @param loader - Function that performs the actual API call
 * @returns Cached promise result or executes loader if not cached
 */
async function memoizedFetch<T>(
  memo: Map<string, Promise<unknown>>,
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  // Return cached promise if it exists
  if (memo.has(key)) {
    return memo.get(key) as Promise<T>;
  }

  // Create new promise and cache it
  const promise = loader();
  memo.set(key, promise as Promise<unknown>);
  try {
    return await promise;
  } catch (error) {
    // Remove failed promise from cache so it can be retried
    memo.delete(key);
    throw error;
  }
}

/**
 * Safely parses unknown input to a number, handling various input types
 *
 * Handles: undefined, null, numbers, and string representations of numbers.
 * Returns undefined for invalid inputs rather than throwing errors.
 */
function parseNumber(input: unknown): number | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input === "number") return Number.isNaN(input) ? undefined : input;
  if (typeof input === "string") {
    const num = Number(input);
    return Number.isNaN(num) ? undefined : num;
  }
  return undefined;
}

/**
 * Safely coerces unknown input to a boolean, handling various input types
 *
 * Handles: undefined, null, booleans, numbers (0 = false, non-zero = true),
 * and common string representations (y/yes/true = true, n/no/false = false).
 * Returns undefined for unrecognized inputs.
 */
function coerceBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "y" || normalized === "yes" || normalized === "true") {
      return true;
    }
    if (normalized === "n" || normalized === "no" || normalized === "false") {
      return false;
    }
  }
  return undefined;
}

/**
 * Fetches and aggregates comprehensive part data from Bricklink API
 *
 * This is the main function that orchestrates fetching part details and colors
 * from Bricklink, with built-in rate limiting, caching, and data normalization.
 *
 * @param ctx - Convex mutation context for database operations
 * @param partNumber - LEGO part number to fetch (e.g., "3001")
 * @param options - Configuration for rate limiting, caching, and quota handling
 * @returns Normalized PartSnapshot with structured data and raw API responses
 * @throws ConvexError if part is not found or API requests fail
 */
export async function fetchBricklinkPartSnapshot(
  ctx: BricklinkAggregatorCtx,
  partNumber: string,
  options: FetchOptions = {},
): Promise<PartSnapshot> {
  // Set up caching and client
  const memo = options.memo ?? new Map<string, Promise<unknown>>();
  const client = new BricklinkClient();
  const identityKey = options.identityKey ?? "global-catalog";

  // Track timing for metrics
  const fetchStart = Date.now();

  // Fetch part details with rate limiting and caching
  const detailPromise = memoizedFetch(memo, DETAIL_PATH(partNumber), async () => {
    // Check rate limit quota before making request
    const quota = await consumeBricklinkQuota(ctx, {
      identity: identityKey,
      reserve: options.reserveOnLimit,
    });
    requireQuotaSuccess(quota, `Bricklink part detail ${partNumber}`);

    // Make API request for part details
    // Bricklink returns { meta: {...}, data: {...} }
    const result = await client.request<{ meta: unknown; data: Record<string, unknown> }>({
      path: DETAIL_PATH(partNumber),
      identityKey,
    });

    // Record metrics for monitoring
    recordMetric("catalog.bricklink.detail", {
      partNumber,
      durationMs: Date.now() - fetchStart,
      status: result.status ?? 200,
    });

    // Extract the actual item data from the Bricklink response wrapper
    return result.data?.data ?? null;
  });

  // Fetch available colors with rate limiting and caching
  const colorsPromise = memoizedFetch(memo, COLORS_PATH(partNumber), async () => {
    // Check rate limit quota before making request
    const quota = await consumeBricklinkQuota(ctx, {
      identity: identityKey,
      reserve: options.reserveOnLimit,
    });
    requireQuotaSuccess(quota, `Bricklink colors ${partNumber}`);

    // Make API request for available colors
    // Bricklink returns { meta: {...}, data: [...] }
    const result = await client.request<{ meta: unknown; data: Array<Record<string, unknown>> }>({
      path: COLORS_PATH(partNumber),
      identityKey,
    });

    // Record metrics for monitoring
    recordMetric("catalog.bricklink.colors", {
      partNumber,
      durationMs: Date.now() - fetchStart,
      status: result.status ?? 200,
      count: result.data?.data?.length ?? 0,
    });

    // Extract the actual colors array from the Bricklink response wrapper
    return result.data?.data ?? null;
  });

  // Execute both API calls in parallel for efficiency
  const [detail, colors] = await Promise.all([detailPromise, colorsPromise]);

  // Validate that we got part details (colors can be empty/null)
  if (!detail) {
    throw new ConvexError(`Bricklink part ${partNumber} not found`);
  }

  // Parse weight from various possible field names in API response
  const weightGrams = parseNumber(
    (detail as Record<string, unknown>)["weight"] ??
      (detail as Record<string, unknown>)["weight_gr"] ??
      (detail as Record<string, unknown>)["weight_grams"],
  );

  // Parse dimensions from various possible field names in API response
  const dimensionsMm = {
    lengthMm:
      parseNumber(
        (detail as Record<string, unknown>)["dim_x"] ??
          (detail as Record<string, unknown>)["dimX"] ??
          (detail as Record<string, unknown>)["dim_x_mm"],
      ) ?? undefined,
    widthMm:
      parseNumber(
        (detail as Record<string, unknown>)["dim_y"] ??
          (detail as Record<string, unknown>)["dimY"] ??
          (detail as Record<string, unknown>)["dim_y_mm"],
      ) ?? undefined,
    heightMm:
      parseNumber(
        (detail as Record<string, unknown>)["dim_z"] ??
          (detail as Record<string, unknown>)["dimZ"] ??
          (detail as Record<string, unknown>)["dim_z_mm"],
      ) ?? undefined,
  };

  // Extract available color IDs from colors array
  const availableColorIds = Array.isArray(colors)
    ? colors
        .map((entry) => parseNumber((entry as Record<string, unknown>)["color_id"]))
        .filter((value): value is number => typeof value === "number")
    : undefined;

  // Build normalized PartSnapshot from parsed data
  const snapshot: PartSnapshot = {
    partNumber,
    canonicalName:
      typeof (detail as Record<string, unknown>)["name"] === "string"
        ? ((detail as Record<string, unknown>)["name"] as string)
        : undefined,
    categoryId: parseNumber(
      (detail as Record<string, unknown>)["category_id"] ??
        (detail as Record<string, unknown>)["categoryId"],
    ),
    description:
      typeof (detail as Record<string, unknown>)["description"] === "string"
        ? ((detail as Record<string, unknown>)["description"] as string)
        : undefined,
    imageUrl: normalizeImageUrl(
      typeof (detail as Record<string, unknown>)["image_url"] === "string"
        ? ((detail as Record<string, unknown>)["image_url"] as string)
        : undefined,
    ),
    thumbnailUrl: normalizeImageUrl(
      typeof (detail as Record<string, unknown>)["thumbnail_url"] === "string"
        ? ((detail as Record<string, unknown>)["thumbnail_url"] as string)
        : undefined,
    ),
    weightGrams,
    dimensionsMm,
    // Parse boolean flags from various possible field names
    isPrinted: coerceBoolean(
      (detail as Record<string, unknown>)["printed"] ??
        (detail as Record<string, unknown>)["is_printed"] ??
        (detail as Record<string, unknown>)["has_print"],
    ),
    isObsolete: coerceBoolean(
      (detail as Record<string, unknown>)["obsolete"] ??
        (detail as Record<string, unknown>)["is_obsolete"] ??
        (detail as Record<string, unknown>)["retired"],
    ),
    availableColorIds,
    // Preserve raw API responses for debugging and advanced use cases
    rawDetail: detail,
    rawColors: colors,
  };

  return snapshot;
}
