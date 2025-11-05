/**
 * BrickOwl Store Client
 * Handles user's BrickOwl store operations (inventory + orders) using BYOK credentials
 *
 * ROLLBACK PATTERNS FOR STORY 3.4:
 * ===================================
 *
 * All CRUD operations support compensating operations for rollback:
 *
 * 1. CREATE ROLLBACK:
 *    - Original: createInventory(payload) → returns { lot_id: "ABC123", ... }
 *    - Compensating: deleteInventory("ABC123")
 *    - Required data: marketplaceId from create response
 *
 * 2. UPDATE ROLLBACK:
 *    - Original: updateInventory("ABC123", { relative_quantity: 5, price: 2.00 })
 *    - Compensating: updateInventory("ABC123", { relative_quantity: -5, price: 1.50 })
 *    - Required data: previousQuantity, previousPrice, previous values for all updated fields
 *    - Note: Reverse quantity delta (relative_quantity: 5 becomes -5)
 *
 * 3. DELETE ROLLBACK:
 *    - Original: deleteInventory("ABC123")
 *    - Compensating: createInventory(originalPayload)
 *    - Required data: Full original inventory payload captured before delete
 *    - Note: New inventory will have different lot_id
 *
 * DRY-RUN MODE:
 * - All operations support options.dryRun flag
 * - Validates payload without making API call
 * - Returns mock response for validation
 * - Use for rollback preview: "What would happen if I reversed this change?"
 *
 * STORY 3.4 INTEGRATION:
 * - inventoryHistory table tracks all changes with action type
 * - Each log entry stores oldData and newData for audit trail
 * - UI presents change history for searching and filtering
 * - No undo operations supported (history is read-only audit trail)
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import { normalizeApiError } from "../../lib/external/types";
import { recordMetric } from "../../lib/external/metrics";
import {
  generateRequestId,
  buildAuthHeaders,
  validateApiKey,
  type BrickOwlCredentials,
} from "./auth";
import type { StoreOperationResult } from "../shared/types";

const BASE_URL = "https://api.brickowl.com/v1";

/**
 * BrickOwl Inventory Item Type
 */
type BrickOwlItemType =
  | "Part"
  | "Set"
  | "Minifigure"
  | "Gear"
  | "Sticker"
  | "Minibuild"
  | "Instructions"
  | "Packaging";

/**
 * BrickOwl Condition Codes
 */
type BrickOwlCondition =
  | "new"
  | "news"
  | "newc"
  | "newi"
  | "usedc"
  | "usedi"
  | "usedn"
  | "usedg"
  | "useda"
  | "other";

/**
 * BrickOwl Inventory Response from API
 */
export interface BrickOwlInventoryResponse {
  lot_id: string;
  boid: string;
  type: BrickOwlItemType;
  color_id?: number;
  quantity: number;
  price: number;
  condition: BrickOwlCondition;
  for_sale: 0 | 1;
  sale_percent?: number;
  my_cost?: number;
  lot_weight?: number;
  personal_note?: string;
  public_note?: string;
  bulk_qty?: number;
  tier_price?: string;
  external_id_1?: string;
}

/**
 * Create Inventory Payload
 */
export interface CreateInventoryPayload {
  boid: string;
  color_id?: number;
  quantity: number;
  price: number;
  condition: BrickOwlCondition;
  external_id?: string;
  personal_note?: string;
  public_note?: string;
  bulk_qty?: number;
  tier_price?: string;
  my_cost?: number;
  lot_weight?: number;
}

/**
 * Update Inventory Payload
 */
export interface UpdateInventoryPayload {
  absolute_quantity?: number;
  relative_quantity?: number;
  for_sale?: 0 | 1;
  price?: number;
  sale_percent?: number;
  my_cost?: number;
  lot_weight?: number;
  personal_note?: string;
  public_note?: string;
  bulk_qty?: number;
  tier_price?: string;
  condition?: BrickOwlCondition;
  update_external_id_1?: string;
}

/**
 * Get Inventories Options
 */
export interface GetInventoriesOptions {
  type?: BrickOwlItemType;
  active_only?: boolean;
  external_id_1?: string;
  lot_id?: string;
}

/**
 * Bulk Operation Options
 */
export interface BulkOptions {
  chunkSize?: number;
  onProgress?: (progress: BulkProgress) => void;
  idempotencyKey?: string;
  dryRun?: boolean;
}

/**
 * Bulk Progress Callback
 */
export interface BulkProgress {
  completed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
}

/**
 * Bulk Operation Result
 */
export interface BulkOperationResult {
  succeeded: number;
  failed: number;
  total: number;
  errors: Array<{
    batchIndex: number;
    requestIndex: number;
    request: unknown;
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  }>;
  results: StoreOperationResult[];
}

/**
 * Batch Request Item
 */
interface BatchRequest {
  endpoint: string;
  request_method: "GET" | "POST";
  params: unknown[];
}

/**
 * Request Options
 */
interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  queryParams?: Record<string, string>;
  correlationId?: string;
  idempotencyKey?: string;
  isIdempotent?: boolean; // If true, safe to retry automatically
}

/**
 * Retry Policy Configuration
 */
interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry policy
 */
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 32000,
  backoffMultiplier: 2,
};

/**
 * BrickOwl Store Client
 * Handles inventory and order operations (orders in Epic 4)
 */
export class BrickOwlStoreClient {
  private readonly credentials: BrickOwlCredentials;
  private readonly businessAccountId: Id<"businessAccounts">;
  private readonly ctx: ActionCtx;
  private readonly requestCache: Map<string, unknown> = new Map();

  constructor(
    credentials: BrickOwlCredentials,
    businessAccountId: Id<"businessAccounts">,
    ctx: ActionCtx,
  ) {
    // Validate API key on construction
    if (!validateApiKey(credentials.apiKey)) {
      throw new ConvexError("Invalid BrickOwl API key format");
    }

    this.credentials = credentials;
    this.businessAccountId = businessAccountId;
    this.ctx = ctx;
  }

  /**
   * Exponential backoff sleep
   */
  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: unknown, statusCode?: number): boolean {
    // Retry on network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return true;
    }

    // Retry on 5xx server errors
    if (statusCode && statusCode >= 500) {
      return true;
    }

    // Don't retry on client errors (4xx) except 429 (rate limit)
    if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
      return false;
    }

    return false;
  }

  /**
   * Make authenticated request with exponential backoff retry
   * Wraps the base request with retry logic for transient failures
   */
  private async requestWithRetry<T>(options: RequestOptions): Promise<T> {
    const policy = DEFAULT_RETRY_POLICY;
    let lastError: unknown;
    let retryCount = 0;

    // CRITICAL: Only retry idempotent operations
    const canRetry =
      options.isIdempotent || options.method === "GET" || options.idempotencyKey !== undefined;

    while (retryCount <= policy.maxRetries) {
      try {
        return await this.request<T>(options);
      } catch (error) {
        lastError = error;

        // Extract status code if available
        let statusCode: number | undefined;
        if (error instanceof ConvexError) {
          const data = error.data as { httpStatus?: number };
          statusCode = data?.httpStatus;
        }

        // Don't retry if not a retryable error
        if (!this.isRetryableError(error, statusCode)) {
          throw error;
        }

        // Don't retry non-idempotent operations
        if (!canRetry) {
          throw error;
        }

        // Don't retry if we've exhausted retries
        if (retryCount >= policy.maxRetries) {
          break;
        }

        // Calculate backoff delay with exponential increase
        const delay = Math.min(
          policy.initialDelayMs * Math.pow(policy.backoffMultiplier, retryCount),
          policy.maxDelayMs,
        );

        recordMetric("external.brickowl.store.retry", {
          retryCount,
          delayMs: delay,
          correlationId: options.correlationId,
        });

        await this.sleep(delay);
        retryCount++;
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Make authenticated request to BrickOwl API with rate limiting
   * Rate limit: 200 req/min (conservative - uses bulk endpoint limit for all requests)
   */
  private async request<T>(options: RequestOptions): Promise<T> {
    const correlationId = options.correlationId ?? generateRequestId();
    const startTime = Date.now();

    try {
      // 1. Check idempotency cache
      if (options.idempotencyKey && this.requestCache.has(options.idempotencyKey)) {
        recordMetric("external.brickowl.store.cache_hit", {
          operation: options.path,
          correlationId,
        });
        return this.requestCache.get(options.idempotencyKey) as T;
      }

      // 2. Pre-flight quota check
      const quota = await this.ctx.runQuery(internal.marketplaces.shared.mutations.getQuotaState, {
        businessAccountId: this.businessAccountId,
        provider: "brickowl",
      });

      // Check circuit breaker
      if (quota.circuitBreakerOpenUntil && Date.now() < quota.circuitBreakerOpenUntil) {
        const retryAfterMs = quota.circuitBreakerOpenUntil - Date.now();
        throw new ConvexError(
          `BrickOwl sync temporarily disabled due to repeated failures. Retry in ${Math.ceil(retryAfterMs / 1000)}s`,
        );
      }

      // Check quota
      if (quota.requestCount >= quota.capacity) {
        const retryAfterMs = quota.windowStart + quota.windowDurationMs - Date.now();
        recordMetric("external.brickowl.store.quota_exceeded", {
          businessAccountId: this.businessAccountId,
          correlationId,
        });
        throw new ConvexError(
          `BrickOwl API rate limit exceeded. Resets in ${Math.ceil(retryAfterMs / 1000)}s`,
        );
      }

      // Emit alert at 80% threshold (if flag set in mutation)
      if (quota.alertEmitted) {
        recordMetric("external.brickowl.store.quota.alert", {
          businessAccountId: this.businessAccountId,
          requestCount: quota.requestCount,
          capacity: quota.capacity,
          percentage: Math.round((quota.requestCount / quota.capacity) * 100),
          correlationId,
        });
      }

      // 3. Build URL and headers
      const url = new URL(options.path, BASE_URL);
      if (options.queryParams) {
        Object.entries(options.queryParams).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      const headers = buildAuthHeaders(this.credentials.apiKey);

      // 4. Make request
      recordMetric("external.brickowl.store.request", {
        operation: options.path,
        method: options.method,
        businessAccountId: this.businessAccountId,
        correlationId,
      });

      const response = await fetch(url.toString(), {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      // 5. Record quota usage AFTER request
      await this.ctx.runMutation(internal.marketplaces.shared.mutations.incrementQuota, {
        businessAccountId: this.businessAccountId,
        provider: "brickowl",
      });

      // 6. Handle response
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        await this.handleErrorResponse(response, correlationId, durationMs);
      }

      const data = (await response.json()) as T;

      // 7. Cache result if idempotent
      if (options.idempotencyKey) {
        this.requestCache.set(options.idempotencyKey, data);
      }

      // 8. Record success metrics
      recordMetric("external.brickowl.store.success", {
        operation: options.path,
        businessAccountId: this.businessAccountId,
        durationMs,
        correlationId,
      });

      return data;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      recordMetric("external.brickowl.store.error", {
        operation: options.path,
        businessAccountId: this.businessAccountId,
        durationMs,
        correlationId,
        errorMessage:
          error instanceof ConvexError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unknown error",
      });

      // Record failure for circuit breaker on network errors
      if (error instanceof TypeError && error.message.includes("fetch")) {
        await this.ctx.runMutation(internal.marketplaces.shared.mutations.recordFailure, {
          businessAccountId: this.businessAccountId,
          provider: "brickowl",
        });
      }

      throw error;
    }
  }

  /**
   * Handle error responses from BrickOwl API
   */
  private async handleErrorResponse(
    response: Response,
    correlationId: string,
    _durationMs: number,
  ): Promise<never> {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }

    const apiError = normalizeApiError("brickowl", errorBody, { correlationId });

    // Handle specific HTTP status codes
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;

      recordMetric("external.brickowl.store.throttle", {
        correlationId,
        retryAfterMs,
      });

      const err = new ConvexError(
        `BrickOwl rate limit: retry after ${Math.ceil(retryAfterMs / 1000)}s`,
      );
      (err.data as { httpStatus?: number }).httpStatus = response.status;
      throw err;
    }

    if (response.status === 401) {
      const err = new ConvexError(
        "BrickOwl API key is invalid or expired. Please update your credentials.",
      );
      (err.data as { httpStatus?: number }).httpStatus = response.status;
      throw err;
    }

    if (response.status === 404) {
      const err = new ConvexError("Inventory lot not found on BrickOwl");
      (err.data as { httpStatus?: number }).httpStatus = response.status;
      throw err;
    }

    if (response.status === 400) {
      const err = new ConvexError(apiError.error.message || "Invalid request data");
      (err.data as { httpStatus?: number }).httpStatus = response.status;
      throw err;
    }

    // Record failure for circuit breaker (5xx errors and network failures)
    if (response.status >= 500) {
      await this.ctx.runMutation(internal.marketplaces.shared.mutations.recordFailure, {
        businessAccountId: this.businessAccountId,
        provider: "brickowl",
      });
    }

    const finalError = new ConvexError(
      apiError.error.message || `BrickOwl API error: ${response.status}`,
    );
    (finalError.data as { httpStatus?: number }).httpStatus = response.status;
    throw finalError;
  }

  /**
   * Get inventory lots (list/read operations)
   * Supports filtering by type, active status, external ID, or lot ID
   */
  async getInventories(options?: GetInventoriesOptions): Promise<BrickOwlInventoryResponse[]> {
    const correlationId = generateRequestId();
    const queryParams: Record<string, string> = {};

    if (options?.type) queryParams.type = options.type;
    if (options?.active_only !== undefined) {
      queryParams.active_only = options.active_only ? "1" : "0";
    }
    if (options?.external_id_1) queryParams.external_id_1 = options.external_id_1;
    if (options?.lot_id) queryParams.lot_id = options.lot_id;

    return await this.requestWithRetry<BrickOwlInventoryResponse[]>({
      method: "GET",
      path: "/inventory/list",
      queryParams,
      correlationId,
      isIdempotent: true, // GET is always safe to retry
    });
  }

  /**
   * Get single inventory lot by ID
   */
  async getInventory(lotId: string): Promise<BrickOwlInventoryResponse> {
    const results = await this.getInventories({ lot_id: lotId });

    if (results.length === 0) {
      throw new ConvexError(`Inventory lot ${lotId} not found`);
    }

    return results[0];
  }

  /**
   * Create single inventory lot
   */
  async createInventory(
    payload: CreateInventoryPayload,
    options?: { idempotencyKey?: string; dryRun?: boolean },
  ): Promise<StoreOperationResult> {
    const correlationId = generateRequestId();

    // Dry-run mode: validate only
    if (options?.dryRun) {
      this.validateCreatePayload(payload);
      return {
        success: true,
        marketplaceId: "dry-run-lot-id",
        correlationId,
      };
    }

    try {
      const result = await this.requestWithRetry<BrickOwlInventoryResponse>({
        method: "POST",
        path: "/inventory/create",
        body: payload,
        correlationId,
        idempotencyKey: options?.idempotencyKey,
        isIdempotent: !!options?.idempotencyKey, // Only retry if idempotency key provided
      });

      return {
        success: true,
        marketplaceId: result.lot_id,
        correlationId,
        rollbackData: {
          originalPayload: payload,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: this.normalizeError(error),
        correlationId,
      };
    }
  }

  /**
   * Update single inventory lot
   * Supports both lot_id and external_id as identifier
   */
  async updateInventory(
    identifier: string,
    payload: UpdateInventoryPayload,
    options?: { useExternalId?: boolean; idempotencyKey?: string; dryRun?: boolean },
  ): Promise<StoreOperationResult> {
    const correlationId = generateRequestId();

    // Dry-run mode: validate only
    if (options?.dryRun) {
      this.validateUpdatePayload(payload);
      return {
        success: true,
        marketplaceId: identifier,
        correlationId,
      };
    }

    try {
      // Get current state for rollback data
      const current = await this.getInventory(identifier);

      const body = {
        ...payload,
        ...(options?.useExternalId ? { external_id: identifier } : { lot_id: identifier }),
      };

      const result = await this.requestWithRetry<BrickOwlInventoryResponse>({
        method: "POST",
        path: "/inventory/update",
        body,
        correlationId,
        idempotencyKey: options?.idempotencyKey,
        isIdempotent: !!options?.idempotencyKey, // Only retry if idempotency key provided
      });

      return {
        success: true,
        marketplaceId: result.lot_id,
        correlationId,
        rollbackData: {
          previousQuantity: current.quantity,
          previousPrice: current.price.toString(),
          previousNotes: current.personal_note,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: this.normalizeError(error),
        correlationId,
      };
    }
  }

  /**
   * Delete single inventory lot
   * Supports both lot_id and external_id as identifier
   */
  async deleteInventory(
    identifier: string,
    options?: { useExternalId?: boolean; idempotencyKey?: string; dryRun?: boolean },
  ): Promise<StoreOperationResult> {
    const correlationId = generateRequestId();

    // Dry-run mode: validate only
    if (options?.dryRun) {
      return {
        success: true,
        marketplaceId: identifier,
        correlationId,
      };
    }

    try {
      // Get current state for rollback data
      const current = await this.getInventory(identifier);

      const body = options?.useExternalId ? { external_id: identifier } : { lot_id: identifier };

      await this.requestWithRetry({
        method: "POST",
        path: "/inventory/delete",
        body,
        correlationId,
        idempotencyKey: options?.idempotencyKey,
        isIdempotent: !!options?.idempotencyKey, // Only retry if idempotency key provided
      });

      return {
        success: true,
        marketplaceId: identifier,
        correlationId,
        rollbackData: {
          originalPayload: current,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: this.normalizeError(error),
        correlationId,
      };
    }
  }

  /**
   * Bulk operations using BrickOwl's native batch API
   * Supports up to 50 requests per batch
   */
  async bulkBatchOperations(
    requests: BatchRequest[],
    options?: BulkOptions,
  ): Promise<BulkOperationResult> {
    const chunkSize = Math.min(options?.chunkSize ?? 50, 50); // BrickOwl max
    const chunks = this.chunkArray(requests, chunkSize);
    const results: StoreOperationResult[] = [];
    const errors: BulkOperationResult["errors"] = [];

    // Log bulk operation start
    recordMetric("external.brickowl.store.bulk.start", {
      itemCount: requests.length,
      totalBatches: chunks.length,
      businessAccountId: this.businessAccountId,
    });

    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
      const chunk = chunks[batchIndex];
      const correlationId = generateRequestId();

      try {
        const batchIdempotencyKey = options?.idempotencyKey
          ? `${options.idempotencyKey}-batch-${batchIndex}`
          : undefined;

        const batchResponse = await this.requestWithRetry<unknown[]>({
          method: "POST",
          path: "/bulk/batch",
          body: { requests: chunk },
          correlationId,
          idempotencyKey: batchIdempotencyKey,
          isIdempotent: !!batchIdempotencyKey, // Retry if idempotency key provided
        });

        // Process batch results
        for (let index = 0; index < batchResponse.length; index++) {
          const result = batchResponse[index];
          const success = !this.isErrorResponse(result);
          const lotId = success ? (result as BrickOwlInventoryResponse).lot_id : undefined;
          results.push({
            success,
            marketplaceId: lotId,
            error: success ? undefined : this.normalizeError(result),
            correlationId,
          });

          if (!success) {
            errors.push({
              batchIndex,
              requestIndex: index,
              request: chunk[index],
              error: this.normalizeError(result),
            });
          }
        }

        // Progress callback and metric
        const progress = {
          completed: (batchIndex + 1) * chunk.length,
          total: requests.length,
          currentBatch: batchIndex + 1,
          totalBatches: chunks.length,
        };

        recordMetric("external.brickowl.store.bulk.progress", {
          ...progress,
          businessAccountId: this.businessAccountId,
          correlationId,
        });

        options?.onProgress?.(progress);
      } catch (error) {
        // Entire batch failed
        for (let i = 0; i < chunk.length; i++) {
          errors.push({
            batchIndex,
            requestIndex: i,
            request: chunk[i],
            error: this.normalizeError(error),
          });
          results.push({
            success: false,
            error: this.normalizeError(error),
            correlationId,
          });
        }
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    // Log bulk operation completion
    recordMetric("external.brickowl.store.bulk.complete", {
      itemCount: requests.length,
      succeeded,
      failed,
      businessAccountId: this.businessAccountId,
    });

    return {
      succeeded,
      failed,
      total: results.length,
      errors,
      results,
    };
  }

  /**
   * Bulk create inventories using batch API
   */
  async bulkCreateInventories(
    payloads: CreateInventoryPayload[],
    options?: BulkOptions,
  ): Promise<BulkOperationResult> {
    const requests: BatchRequest[] = payloads.map((payload) => ({
      endpoint: "inventory/create",
      request_method: "POST",
      params: [payload],
    }));

    return await this.bulkBatchOperations(requests, options);
  }

  /**
   * Bulk update inventories using batch API
   */
  async bulkUpdateInventories(
    updates: Array<{
      identifier: string;
      payload: UpdateInventoryPayload;
      useExternalId?: boolean;
    }>,
    options?: BulkOptions,
  ): Promise<BulkOperationResult> {
    const requests: BatchRequest[] = updates.map((update) => ({
      endpoint: "inventory/update",
      request_method: "POST",
      params: [
        {
          ...update.payload,
          ...(update.useExternalId
            ? { external_id: update.identifier }
            : { lot_id: update.identifier }),
        },
      ],
    }));

    return await this.bulkBatchOperations(requests, options);
  }

  /**
   * Bulk delete inventories using batch API
   */
  async bulkDeleteInventories(
    identifiers: Array<{ identifier: string; useExternalId?: boolean }>,
    options?: BulkOptions,
  ): Promise<BulkOperationResult> {
    const requests: BatchRequest[] = identifiers.map((item) => ({
      endpoint: "inventory/delete",
      request_method: "POST",
      params: [item.useExternalId ? { external_id: item.identifier } : { lot_id: item.identifier }],
    }));

    return await this.bulkBatchOperations(requests, options);
  }

  /**
   * Validation helpers
   */
  private validateCreatePayload(payload: CreateInventoryPayload): void {
    if (!payload.boid) throw new Error("boid is required");
    if (!payload.quantity || payload.quantity < 1) throw new Error("quantity must be >= 1");
    if (!payload.price || payload.price < 0) throw new Error("price must be positive");
    if (!payload.condition) throw new Error("condition is required");
  }

  private validateUpdatePayload(payload: UpdateInventoryPayload): void {
    if (payload.absolute_quantity !== undefined && payload.relative_quantity !== undefined) {
      throw new Error("Cannot use both absolute_quantity and relative_quantity");
    }
    if (payload.price !== undefined && payload.price < 0) {
      throw new Error("price must be positive");
    }
  }

  /**
   * Utility methods
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private isErrorResponse(response: unknown): boolean {
    return (
      typeof response === "object" &&
      response !== null &&
      ("error" in response || "message" in response)
    );
  }

  private normalizeError(error: unknown): {
    code: string;
    message: string;
    details?: unknown;
  } {
    if (error instanceof ConvexError) {
      return {
        code: "CONVEX_ERROR",
        message: error.message ?? "An error occurred",
        details: error.data,
      };
    }

    const normalized = normalizeApiError("brickowl", error);
    return {
      code: normalized.error.code,
      message: normalized.error.message,
      details: normalized.error.details,
    };
  }
}
