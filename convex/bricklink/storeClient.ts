/**
 * BrickLink Store Client
 * Handles user's BrickLink store operations (inventory + orders) using BYOK credentials
 *
 * ROLLBACK PATTERNS FOR STORY 3.4:
 * ===================================
 *
 * All CRUD operations support compensating operations for rollback:
 *
 * 1. CREATE ROLLBACK:
 *    - Original: createInventory(payload) → returns { inventory_id: 123, ... }
 *    - Compensating: deleteInventory(123)
 *    - Required data: marketplaceId from create response
 *
 * 2. UPDATE ROLLBACK:
 *    - Original: updateInventory(123, { quantity: "+5", unit_price: "2.00" })
 *    - Compensating: updateInventory(123, { quantity: "-5", unit_price: "1.50" })
 *    - Required data: previousQuantity, previousPrice, previous values for all updated fields
 *    - Note: Reverse quantity delta ("+5" becomes "-5")
 *
 * 3. DELETE ROLLBACK:
 *    - Original: deleteInventory(123)
 *    - Compensating: createInventory(originalPayload)
 *    - Required data: Full original inventory payload captured before delete
 *    - Note: New inventory will have different inventory_id
 *
 * DRY-RUN MODE:
 * - All operations support options.dryRun flag
 * - Validates payload without making API call
 * - Returns mock response or void (for delete)
 * - Use for rollback preview: "What would happen if I reversed this change?"
 *
 * STORY 3.4 INTEGRATION:
 * - inventoryHistory table tracks all changes with action type
 * - Each log entry stores oldData and newData for audit trail
 * - UI presents change history for searching and filtering
 * - No undo operations supported (history is read-only audit trail)
 */

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { normalizeApiError } from "../lib/external/types";
import { recordMetric } from "../lib/external/metrics";
import {
  generateOAuthParams,
  generateOAuthSignature,
  buildAuthorizationHeader,
  generateRequestId,
  type OAuthCredentials,
} from "./oauth";
import type { StoreOperationResult } from "../marketplace/types";

const BASE_URL = "https://api.bricklink.com/api/store/v1/";

/**
 * BrickLink user credentials structure
 */
export interface BricklinkUserCredentials {
  consumerKey: string;
  consumerSecret: string;
  tokenValue: string;
  tokenSecret: string;
}

/**
 * BrickLink API Response Wrapper
 */
interface BricklinkApiResponse<T> {
  meta: {
    description: string;
    message: string;
    code: number;
  };
  data: T;
}

/**
 * BrickLink Inventory Item Type
 */
type BricklinkItemType =
  | "PART"
  | "SET"
  | "MINIFIG"
  | "BOOK"
  | "GEAR"
  | "CATALOG"
  | "INSTRUCTION"
  | "UNSORTED_LOT"
  | "ORIGINAL_BOX";

/**
 * BrickLink Inventory Response from API
 */
export interface BricklinkInventoryResponse {
  inventory_id: number;
  item: {
    no: string;
    name: string;
    type: BricklinkItemType;
    category_id: number;
  };
  color_id: number;
  color_name: string;
  quantity: number;
  new_or_used: "N" | "U";
  completeness?: "C" | "B" | "S"; // Only for SET type
  unit_price: string; // Fixed point number as string
  bind_id: number;
  description: string;
  remarks: string;
  bulk: number;
  is_retain: boolean;
  is_stock_room: boolean;
  stock_room_id?: "A" | "B" | "C";
  date_created: string;
  my_cost?: string;
  sale_rate?: number;
  tier_quantity1?: number;
  tier_price1?: string;
  tier_quantity2?: number;
  tier_price2?: string;
  tier_quantity3?: number;
  tier_price3?: string;
}

/**
 * BrickLink Inventory Create Request
 */
export interface BricklinkInventoryCreateRequest {
  item: {
    no: string;
    type: BricklinkItemType;
  };
  color_id: number;
  quantity: number;
  unit_price: string;
  new_or_used: "N" | "U";
  completeness?: "C" | "B" | "S"; // Required only for SET type
  description?: string;
  remarks?: string;
  bulk?: number;
  is_retain?: boolean;
  is_stock_room?: boolean;
  stock_room_id?: "A" | "B" | "C";
  my_cost?: string;
  sale_rate?: number;
  tier_quantity1?: number;
  tier_price1?: string;
  tier_quantity2?: number;
  tier_price2?: string;
  tier_quantity3?: number;
  tier_price3?: string;
}

/**
 * Operation options for CRUD methods
 */
export interface OperationOptions {
  dryRun?: boolean; // If true, validate without executing (for rollback preview)
}

/**
 * BrickLink Inventory Update Request
 * Note: quantity must be prefixed with + or - (delta syntax)
 */
export interface BricklinkInventoryUpdateRequest {
  quantity?: string; // Must have +/- prefix (e.g., "+5", "-3")
  unit_price?: string;
  description?: string;
  remarks?: string;
  bulk?: number;
  is_retain?: boolean;
  is_stock_room?: boolean;
  stock_room_id?: "A" | "B" | "C";
  my_cost?: string;
  sale_rate?: number;
  tier_quantity1?: number;
  tier_price1?: string;
  tier_quantity2?: number;
  tier_price2?: string;
  tier_quantity3?: number;
  tier_price3?: string;
}

/**
 * Options for listing inventories
 */
export interface GetInventoriesOptions {
  itemType?: string; // Comma-separated, can use - prefix to exclude
  status?: string; // Y, S, B, C, N, R - can use - prefix to exclude
  categoryId?: string; // Comma-separated, can use - prefix to exclude
  colorId?: string; // Comma-separated, can use - prefix to exclude
}

/**
 * Bulk operation progress callback
 */
export interface BulkProgress {
  completed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
}

/**
 * Bulk operation options
 */
export interface BulkOperationOptions {
  chunkSize?: number; // Items per batch
  onProgress?: (progress: BulkProgress) => void | Promise<void>;
  idempotencyKey?: string; // External key for deduplication
  delayBetweenBatchesMs?: number; // Delay between batches to smooth rate limiting
}

/**
 * Bulk operation result for a single item
 */
export interface BulkOperationItemResult {
  success: boolean;
  marketplaceId?: number;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  marketplaceStatus?: string;
  correlationId?: string;
}

/**
 * Bulk operation result summary
 */
export interface BulkOperationResult {
  succeeded: number;
  failed: number;
  errors: Array<{
    batchIndex: number;
    itemIndex: number;
    item: unknown;
    error: {
      code: string;
      message: string;
      details?: unknown;
    };
  }>;
  results: BulkOperationItemResult[];
}

/**
 * Request options for store client
 */
interface RequestOptions {
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  retryConfig?: RetryConfig;
}

/**
 * Retry policy configuration
 */
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Default retry policy for transient failures
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000, // Start with 1 second
  maxDelayMs: 32000, // Max 32 seconds
  backoffMultiplier: 2, // Double each retry
};

/**
 * BrickLink Store Client
 * Per-user client for BrickLink store operations with database-backed rate limiting
 */
export class BricklinkStoreClient {
  private readonly credentials: BricklinkUserCredentials;
  private readonly businessAccountId: Id<"businessAccounts">;
  private readonly ctx: ActionCtx;

  constructor(
    credentials: BricklinkUserCredentials,
    businessAccountId: Id<"businessAccounts">,
    ctx: ActionCtx,
  ) {
    // Validate credentials
    if (
      !credentials.consumerKey ||
      !credentials.consumerSecret ||
      !credentials.tokenValue ||
      !credentials.tokenSecret
    ) {
      throw new ConvexError({
        code: "INVALID_CREDENTIALS",
        message: "BrickLink credentials are missing required fields",
      });
    }

    this.credentials = credentials;
    this.businessAccountId = businessAccountId;
    this.ctx = ctx;
  }

  /**
   * Make authenticated request to BrickLink API with rate limiting and retry logic
   */
  async request<T>(
    options: RequestOptions,
  ): Promise<{ data: T; status: number; headers: Headers }> {
    const method = (options.method ?? "GET").toUpperCase();
    const correlationId = crypto.randomUUID();
    const retryConfig = options.retryConfig ?? DEFAULT_RETRY_CONFIG;

    // Determine if operation is safe to retry
    // POST is NOT safe to retry (non-idempotent)
    // GET, PUT, DELETE are safe to retry
    const isSafeToRetry = method !== "POST";

    return await this.executeWithRetry(
      () => this.makeRequest<T>(method, options, correlationId),
      isSafeToRetry ? retryConfig : { ...retryConfig, maxRetries: 0 },
      correlationId,
    );
  }

  /**
   * Execute request with exponential backoff retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    retryConfig: RetryConfig,
    correlationId: string,
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on final attempt
        if (attempt === retryConfig.maxRetries) {
          throw error;
        }

        // Check if error is retryable
        const isRetryable = this.isRetryableError(error);
        if (!isRetryable) {
          throw error;
        }

        // Extract Retry-After header for HTTP 429 responses
        let waitTime = delay;
        if (error instanceof Error && error.message.includes("HTTP 429")) {
          // Try to extract Retry-After from error details
          const retryAfter = this.extractRetryAfter(error);
          if (retryAfter) {
            waitTime = retryAfter;
          }
        }

        // Log retry attempt
        recordMetric("external.bricklink.store.retry", {
          businessAccountId: this.businessAccountId,
          attempt: attempt + 1,
          maxRetries: retryConfig.maxRetries,
          delayMs: waitTime,
          correlationId,
        });

        // Wait before retry
        await this.sleep(waitTime);

        // Calculate next delay with exponential backoff
        delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelayMs);
      }
    }

    // Should never reach here, but throw last error just in case
    throw lastError ?? new Error("Unknown retry error");
  }

  /**
   * Check if error is retryable (transient failures)
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    // Retry transient HTTP errors
    if (message.includes("http 5")) return true; // 5xx server errors
    if (message.includes("http 429")) return true; // Rate limit (respect Retry-After)

    // Retry network errors
    if (message.includes("network")) return true;
    if (message.includes("timeout")) return true;
    if (message.includes("econnreset")) return true;
    if (message.includes("econnrefused")) return true;

    // Don't retry client errors (4xx except 429)
    if (message.includes("http 4")) return false;

    // Don't retry auth errors
    if (message.includes("unauthorized")) return false;
    if (message.includes("forbidden")) return false;

    // Don't retry rate limit exceeded from our own quota check
    if (error instanceof ConvexError) {
      const code = (error.data as { code?: string }).code;
      if (code === "RATE_LIMIT_EXCEEDED") return false;
      if (code === "CIRCUIT_BREAKER_OPEN") return false;
      if (code === "INVALID_CREDENTIALS") return false;
    }

    return false;
  }

  /**
   * Extract Retry-After value from error (for HTTP 429)
   * Returns milliseconds to wait
   */
  private extractRetryAfter(error: Error): number | null {
    // Try to extract from error details if available
    // This is a best-effort extraction
    const errorStr = error.toString();
    const retryAfterMatch = errorStr.match(/retry[_-]?after[:\s]+(\d+)/i);
    if (retryAfterMatch) {
      const seconds = parseInt(retryAfterMatch[1], 10);
      return seconds * 1000; // Convert to milliseconds
    }
    return null;
  }

  /**
   * Make the actual HTTP request (without retry logic)
   */
  private async makeRequest<T>(
    method: string,
    options: RequestOptions,
    correlationId: string,
  ): Promise<{ data: T; status: number; headers: Headers }> {
    // Log request start
    recordMetric("external.bricklink.store.request", {
      businessAccountId: this.businessAccountId,
      operation: options.path,
      method,
      correlationId,
    });

    // 1. Pre-flight quota check
    const quota = await this.ctx.runQuery(internal.marketplace.mutations.getQuotaState, {
      businessAccountId: this.businessAccountId,
      provider: "bricklink",
    });

    const now = Date.now();
    const windowElapsed = now - quota.windowStart;
    const isWindowExpired = windowElapsed >= quota.windowDurationMs;

    // Check circuit breaker
    if (quota.circuitBreakerOpenUntil && now < quota.circuitBreakerOpenUntil) {
      const retryAfterMs = quota.circuitBreakerOpenUntil - now;
      recordMetric("external.bricklink.store.circuit_breaker.blocked", {
        businessAccountId: this.businessAccountId,
        correlationId,
      });

      throw new ConvexError({
        code: "CIRCUIT_BREAKER_OPEN",
        message: "BrickLink sync temporarily disabled due to repeated failures",
        retryAfterMs,
      });
    }

    // Check quota (skip if window expired, will reset on increment)
    if (!isWindowExpired && quota.requestCount >= quota.capacity) {
      const resetIn = quota.windowStart + quota.windowDurationMs - now;

      recordMetric("external.bricklink.store.quota.blocked", {
        businessAccountId: this.businessAccountId,
        count: quota.requestCount,
        capacity: quota.capacity,
        percentage: quota.requestCount / quota.capacity,
        retryAfterMs: resetIn,
        correlationId,
      });

      throw new ConvexError({
        code: "RATE_LIMIT_EXCEEDED",
        message: `BrickLink rate limit exceeded (${quota.requestCount}/${quota.capacity}). Resets in ${Math.ceil(resetIn / 60000)} minutes.`,
        retryAfterMs: resetIn,
        currentUsage: quota.requestCount,
        capacity: quota.capacity,
      });
    }

    // 2. Build request
    const queryEntries = Object.entries(options.query ?? {}).filter(
      ([, value]) => value !== undefined && value !== null,
    );

    const relativePath = options.path.startsWith("/") ? options.path.substring(1) : options.path;
    const url = new URL(relativePath, BASE_URL);

    // Add query parameters
    queryEntries.forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });

    // Convert credentials to OAuth format
    const oauthCredentials: OAuthCredentials = {
      consumerKey: this.credentials.consumerKey,
      consumerSecret: this.credentials.consumerSecret,
      tokenValue: this.credentials.tokenValue,
      tokenSecret: this.credentials.tokenSecret,
    };

    // DEBUG: Log credential info (not the actual secrets)
    console.log("[OAuth Debug] Credential check", {
      hasConsumerKey: !!this.credentials.consumerKey,
      consumerKeyLength: this.credentials.consumerKey?.length,
      consumerKeyPrefix: this.credentials.consumerKey?.substring(0, 4),
      consumerKeySuffix: this.credentials.consumerKey?.substring(
        this.credentials.consumerKey.length - 4,
      ),
      hasConsumerSecret: !!this.credentials.consumerSecret,
      consumerSecretLength: this.credentials.consumerSecret?.length,
      hasTokenValue: !!this.credentials.tokenValue,
      tokenValueLength: this.credentials.tokenValue?.length,
      tokenValuePrefix: this.credentials.tokenValue?.substring(0, 4),
      tokenValueSuffix: this.credentials.tokenValue?.substring(
        this.credentials.tokenValue.length - 4,
      ),
      hasTokenSecret: !!this.credentials.tokenSecret,
      tokenSecretLength: this.credentials.tokenSecret?.length,
      url: url.href,
      method,
    });

    // Generate OAuth parameters
    const oauthParams = generateOAuthParams();

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

    // Generate OAuth signature
    const baseUrl = url.href.split("?")[0];

    // DEBUG: Log signature generation details
    console.log("[OAuth Debug] Signature generation", {
      method,
      baseUrl,
      paramCount: allParams.length,
      hasBody: !!options.body,
      bodyPreview: options.body ? JSON.stringify(options.body).substring(0, 100) : null,
    });

    const signature = await generateOAuthSignature(oauthCredentials, method, baseUrl, allParams);

    // Build Authorization header
    const authorization = buildAuthorizationHeader(oauthCredentials, signature, oauthParams);

    // 3. Make API request
    const started = Date.now();
    let response: Response;

    try {
      const requestBody = options.body ? JSON.stringify(options.body) : undefined;

      response = await fetch(url.href, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "BrickOps/1.0",
          ...(options.headers ?? {}),
          Authorization: authorization,
        },
        body: requestBody,
      });
    } catch (error) {
      const duration = Date.now() - started;

      // Record failure for circuit breaker
      await this.ctx.runMutation(internal.marketplace.mutations.recordFailure, {
        businessAccountId: this.businessAccountId,
        provider: "bricklink",
      });

      recordMetric("external.bricklink.store.error", {
        businessAccountId: this.businessAccountId,
        operation: options.path,
        errorType: "network",
        durationMs: duration,
        correlationId,
      });

      throw normalizeApiError("bricklink", error, {
        endpoint: options.path,
        correlationId,
      });
    }

    const duration = Date.now() - started;

    // Handle error responses
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

      // Record failure for circuit breaker
      await this.ctx.runMutation(internal.marketplace.mutations.recordFailure, {
        businessAccountId: this.businessAccountId,
        provider: "bricklink",
      });

      recordMetric("external.bricklink.store.error", {
        businessAccountId: this.businessAccountId,
        operation: options.path,
        httpStatus: response.status,
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

    // 4. Record successful quota usage
    await this.ctx.runMutation(internal.marketplace.mutations.incrementQuota, {
      businessAccountId: this.businessAccountId,
      provider: "bricklink",
    });

    // Reset consecutive failures on success
    await this.ctx.runMutation(internal.marketplace.mutations.resetFailures, {
      businessAccountId: this.businessAccountId,
      provider: "bricklink",
    });

    // Check if alert threshold was reached and emit metric
    const updatedQuota = await this.ctx.runQuery(internal.marketplace.mutations.getQuotaState, {
      businessAccountId: this.businessAccountId,
      provider: "bricklink",
    });

    const percentage = updatedQuota.requestCount / updatedQuota.capacity;
    if (percentage >= updatedQuota.alertThreshold && updatedQuota.alertEmitted) {
      recordMetric("external.bricklink.store.quota.alert", {
        businessAccountId: this.businessAccountId,
        provider: "bricklink",
        count: updatedQuota.requestCount,
        capacity: updatedQuota.capacity,
        percentage,
      });
    }

    recordMetric("external.bricklink.store.success", {
      businessAccountId: this.businessAccountId,
      operation: options.path,
      durationMs: duration,
      correlationId,
    });

    const data = (await response.json()) as T;

    // CRITICAL: BrickLink returns HTTP 200 with errors in the response body
    // Check for error responses in meta.code field
    if (typeof data === "object" && data !== null && "meta" in data) {
      const meta = (data as { meta: { code?: number; message?: string; description?: string } })
        .meta;
      if (meta.code && meta.code >= 400) {
        // Log full response for debugging
        console.error(`[BrickLink Error ${meta.code}] ${meta.message}`, {
          description: meta.description,
          endpoint: options.path,
          fullResponse: JSON.stringify(data),
        });

        // Treat as HTTP error even though status is 200
        await this.ctx.runMutation(internal.marketplace.mutations.recordFailure, {
          businessAccountId: this.businessAccountId,
          provider: "bricklink",
        });

        recordMetric("external.bricklink.store.error", {
          businessAccountId: this.businessAccountId,
          operation: options.path,
          httpStatus: meta.code,
          durationMs: duration,
          correlationId,
        });

        throw normalizeApiError(
          "bricklink",
          new Error(`BrickLink Error ${meta.code}: ${meta.message} - ${meta.description}`),
          {
            endpoint: options.path,
            status: meta.code,
            body: data,
            correlationId,
          },
        );
      }
    }

    return {
      data,
      status: response.status,
      headers: response.headers,
    };
  }

  /**
   * List store inventories with optional filtering
   * GET /inventories
   */
  async getInventories(options?: GetInventoriesOptions): Promise<BricklinkInventoryResponse[]> {
    const query: Record<string, string> = {};

    if (options?.itemType) {
      query.item_type = options.itemType;
    }
    if (options?.status) {
      query.status = options.status;
    }
    if (options?.categoryId) {
      query.category_id = options.categoryId;
    }
    if (options?.colorId) {
      query.color_id = options.colorId;
    }

    const response = await this.request<BricklinkApiResponse<BricklinkInventoryResponse[]>>({
      path: "/inventories",
      method: "GET",
      query,
    });

    return response.data.data;
  }

  /**
   * Get a single store inventory by ID
   * GET /inventories/{inventory_id}
   */
  async getInventory(inventoryId: number): Promise<BricklinkInventoryResponse> {
    const response = await this.request<BricklinkApiResponse<BricklinkInventoryResponse>>({
      path: `/inventories/${inventoryId}`,
      method: "GET",
    });

    return response.data.data;
  }

  /**
   * Create a single store inventory
   * POST /inventories
   */
  async createInventory(
    payload: BricklinkInventoryCreateRequest,
    options?: OperationOptions,
  ): Promise<StoreOperationResult> {
    const correlationId = generateRequestId();

    // Dry-run mode: validate without executing
    if (options?.dryRun) {
      this.validateCreatePayload(payload);
      return {
        success: true,
        marketplaceId: 0, // Mock ID
        correlationId,
      };
    }

    try {
      const response = await this.request<BricklinkApiResponse<BricklinkInventoryResponse>>({
        path: "/inventories",
        method: "POST",
        body: payload,
      });

      // Defensive check: ensure response.data.data exists
      if (!response.data?.data) {
        console.error("BrickLink API returned invalid response structure", response.data);
        throw new ConvexError({
          code: "INVALID_RESPONSE",
          message: "BrickLink API returned invalid response structure",
          responseData: JSON.stringify(response.data),
        });
      }

      const inventoryData = response.data.data;
      return {
        success: true,
        marketplaceId: inventoryData.inventory_id,
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
   * Create multiple store inventories (native bulk API - highly efficient)
   * POST /inventories with array body
   * Note: BrickLink returns empty data on success (no inventory IDs)
   */
  async createInventories(payloads: BricklinkInventoryCreateRequest[]): Promise<void> {
    await this.request<BricklinkApiResponse<null>>({
      path: "/inventories",
      method: "POST",
      body: payloads,
    });
  }

  /**
   * Update a store inventory
   * PUT /inventories/{inventory_id}
   * CRITICAL: quantity must use delta syntax with +/- prefix (e.g., "+5", "-3")
   */
  async updateInventory(
    inventoryId: number,
    payload: BricklinkInventoryUpdateRequest,
    options?: OperationOptions,
  ): Promise<StoreOperationResult> {
    const correlationId = generateRequestId();

    // Validate payload
    this.validateUpdatePayload(payload);

    // Dry-run mode: validate without executing
    if (options?.dryRun) {
      return {
        success: true,
        marketplaceId: inventoryId,
        correlationId,
      };
    }

    try {
      const response = await this.request<BricklinkApiResponse<BricklinkInventoryResponse>>({
        path: `/inventories/${inventoryId}`,
        method: "PUT",
        body: payload,
      });

      // Defensive check: ensure response.data.data exists
      if (!response.data?.data) {
        throw new ConvexError({
          code: "INVALID_RESPONSE",
          message: "BrickLink API returned invalid response structure",
          responseData: JSON.stringify(response.data),
        });
      }

      const inventoryData = response.data.data;
      return {
        success: true,
        marketplaceId: inventoryData.inventory_id,
        correlationId,
        rollbackData: {
          previousQuantity: payload.quantity ? inventoryData.quantity : undefined,
          previousPrice: payload.unit_price,
          previousLocation: payload.remarks,
          previousNotes: payload.description,
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
   * Delete a store inventory
   * DELETE /inventories/{inventory_id}
   */
  async deleteInventory(
    inventoryId: number,
    options?: OperationOptions,
  ): Promise<StoreOperationResult> {
    const correlationId = generateRequestId();

    // Validate inventory ID
    if (!inventoryId || inventoryId <= 0) {
      return {
        success: false,
        error: {
          code: "INVALID_INVENTORY_ID",
          message: "inventoryId must be a positive number",
        },
        correlationId,
      };
    }

    // Dry-run mode: validate without executing
    if (options?.dryRun) {
      return {
        success: true,
        marketplaceId: inventoryId,
        correlationId,
      };
    }

    try {
      await this.request<BricklinkApiResponse<null>>({
        path: `/inventories/${inventoryId}`,
        method: "DELETE",
      });

      return {
        success: true,
        marketplaceId: inventoryId,
        correlationId,
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
   * Bulk create inventories using native BrickLink bulk API (HIGHLY EFFICIENT)
   * Creates up to 100 items per API call - 1000 items = 10 API calls
   * Note: BrickLink returns empty data on success (no inventory IDs)
   */
  async bulkCreateInventories(
    payloads: BricklinkInventoryCreateRequest[],
    options?: BulkOperationOptions,
  ): Promise<BulkOperationResult> {
    const chunkSize = options?.chunkSize ?? 100; // BrickLink recommended maximum
    const delay = options?.delayBetweenBatchesMs ?? 0;
    const chunks = this.chunkArray(payloads, chunkSize);
    const totalBatches = chunks.length;

    const results: BulkOperationItemResult[] = [];
    const errors: BulkOperationResult["errors"] = [];
    let succeeded = 0;
    let failed = 0;

    // Track processed items for idempotency (if key provided)
    const processedKeys = new Set<string>();

    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
      const chunk = chunks[batchIndex];
      const correlationId = crypto.randomUUID();

      try {
        // Call native bulk create API
        await this.createInventories(chunk);

        // Mark all items in batch as successful
        for (let itemIndex = 0; itemIndex < chunk.length; itemIndex++) {
          const itemKey = options?.idempotencyKey
            ? `${options.idempotencyKey}-${batchIndex}-${itemIndex}`
            : undefined;

          // Skip if already processed (idempotency)
          if (itemKey && processedKeys.has(itemKey)) {
            continue;
          }

          results.push({
            success: true,
            correlationId,
            // Note: BrickLink doesn't return inventory IDs from bulk create
          });

          succeeded++;
          if (itemKey) {
            processedKeys.add(itemKey);
          }
        }
      } catch (error) {
        // Record batch failure - all items in batch failed
        for (let itemIndex = 0; itemIndex < chunk.length; itemIndex++) {
          const item = chunk[itemIndex];
          const errorDetails = {
            code:
              error instanceof ConvexError
                ? (error.data as { code?: string }).code ?? "UNKNOWN_ERROR"
                : "UNKNOWN_ERROR",
            message: error instanceof Error ? error.message : String(error),
            details: error,
          };

          results.push({
            success: false,
            error: errorDetails,
            correlationId,
          });

          errors.push({
            batchIndex,
            itemIndex,
            item,
            error: errorDetails,
          });

          failed++;
        }
      }

      // Report progress
      const completed = (batchIndex + 1) * chunkSize;
      const progress = {
        completed: Math.min(completed, payloads.length),
        total: payloads.length,
        currentBatch: batchIndex + 1,
        totalBatches,
      };

      // Record bulk progress metric
      recordMetric("external.bricklink.store.bulk.progress", {
        businessAccountId: this.businessAccountId,
        operation: "bulkCreate",
        ...progress,
      });

      if (options?.onProgress) {
        await options.onProgress(progress);
      }

      // Delay between batches to smooth rate limiting
      if (delay > 0 && batchIndex < chunks.length - 1) {
        await this.sleep(delay);
      }
    }

    return {
      succeeded,
      failed,
      errors,
      results,
    };
  }

  /**
   * Bulk update inventories (NO NATIVE SUPPORT - must sequence individual calls)
   * Each update requires separate API call - 100 updates = 100 API calls
   */
  async bulkUpdateInventories(
    updates: Array<{ inventoryId: number; payload: BricklinkInventoryUpdateRequest }>,
    options?: BulkOperationOptions,
  ): Promise<BulkOperationResult> {
    const chunkSize = options?.chunkSize ?? 50; // Smaller chunks for sequential operations
    const delay = options?.delayBetweenBatchesMs ?? 100; // Default delay to smooth rate limiting
    const chunks = this.chunkArray(updates, chunkSize);
    const totalBatches = chunks.length;

    const results: BulkOperationItemResult[] = [];
    const errors: BulkOperationResult["errors"] = [];
    let succeeded = 0;
    let failed = 0;

    // Track processed items for idempotency
    const processedKeys = new Set<string>();

    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
      const chunk = chunks[batchIndex];

      for (let itemIndex = 0; itemIndex < chunk.length; itemIndex++) {
        const update = chunk[itemIndex];
        const itemKey = options?.idempotencyKey
          ? `${options.idempotencyKey}-${update.inventoryId}`
          : undefined;

        // Skip if already processed (idempotency)
        if (itemKey && processedKeys.has(itemKey)) {
          continue;
        }

        const result = await this.updateInventory(update.inventoryId, update.payload);

        results.push({
          success: result.success,
          marketplaceId: result.marketplaceId as number,
          error: result.error,
          correlationId: result.correlationId,
        });

        if (result.success) {
          succeeded++;
          if (itemKey) {
            processedKeys.add(itemKey);
          }
        } else {
          const errorDetails = result.error ?? {
            code: "UNKNOWN_ERROR",
            message: "Unknown error occurred",
          };

          errors.push({
            batchIndex,
            itemIndex,
            item: update,
            error: errorDetails,
          });

          failed++;
        }
      }

      // Report progress
      const completed = (batchIndex + 1) * chunkSize;
      const progress = {
        completed: Math.min(completed, updates.length),
        total: updates.length,
        currentBatch: batchIndex + 1,
        totalBatches,
      };

      // Record bulk progress metric
      recordMetric("external.bricklink.store.bulk.progress", {
        businessAccountId: this.businessAccountId,
        operation: "bulkUpdate",
        ...progress,
      });

      if (options?.onProgress) {
        await options.onProgress(progress);
      }

      // Delay between batches
      if (delay > 0 && batchIndex < chunks.length - 1) {
        await this.sleep(delay);
      }
    }

    return {
      succeeded,
      failed,
      errors,
      results,
    };
  }

  /**
   * Bulk delete inventories (NO NATIVE SUPPORT - must sequence individual calls)
   * Each delete requires separate API call - 100 deletes = 100 API calls
   */
  async bulkDeleteInventories(
    inventoryIds: number[],
    options?: BulkOperationOptions,
  ): Promise<BulkOperationResult> {
    const chunkSize = options?.chunkSize ?? 50; // Smaller chunks for sequential operations
    const delay = options?.delayBetweenBatchesMs ?? 100; // Default delay to smooth rate limiting
    const chunks = this.chunkArray(inventoryIds, chunkSize);
    const totalBatches = chunks.length;

    const results: BulkOperationItemResult[] = [];
    const errors: BulkOperationResult["errors"] = [];
    let succeeded = 0;
    let failed = 0;

    // Track processed items for idempotency
    const processedKeys = new Set<string>();

    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
      const chunk = chunks[batchIndex];

      for (let itemIndex = 0; itemIndex < chunk.length; itemIndex++) {
        const inventoryId = chunk[itemIndex];
        const itemKey = options?.idempotencyKey
          ? `${options.idempotencyKey}-${inventoryId}`
          : undefined;

        // Skip if already processed (idempotency)
        if (itemKey && processedKeys.has(itemKey)) {
          continue;
        }

        const result = await this.deleteInventory(inventoryId);

        results.push({
          success: result.success,
          marketplaceId: result.marketplaceId as number,
          error: result.error,
          correlationId: result.correlationId,
        });

        if (result.success) {
          succeeded++;
          if (itemKey) {
            processedKeys.add(itemKey);
          }
        } else {
          const errorDetails = result.error ?? {
            code: "UNKNOWN_ERROR",
            message: "Unknown error occurred",
          };

          errors.push({
            batchIndex,
            itemIndex,
            item: inventoryId,
            error: errorDetails,
          });

          failed++;
        }
      }

      // Report progress
      const completed = (batchIndex + 1) * chunkSize;
      const progress = {
        completed: Math.min(completed, inventoryIds.length),
        total: inventoryIds.length,
        currentBatch: batchIndex + 1,
        totalBatches,
      };

      // Record bulk progress metric
      recordMetric("external.bricklink.store.bulk.progress", {
        businessAccountId: this.businessAccountId,
        operation: "bulkDelete",
        ...progress,
      });

      if (options?.onProgress) {
        await options.onProgress(progress);
      }

      // Delay between batches
      if (delay > 0 && batchIndex < chunks.length - 1) {
        await this.sleep(delay);
      }
    }

    return {
      succeeded,
      failed,
      errors,
      results,
    };
  }

  /**
   * Helper: Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Helper: Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Validate create payload before API request
   */
  private validateCreatePayload(payload: BricklinkInventoryCreateRequest): void {
    if (!payload.item.no) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "item.no (part number) is required",
      });
    }
    if (!payload.item.type) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "item.type is required",
      });
    }
    if (payload.color_id === undefined || payload.color_id === null) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "color_id is required",
      });
    }
    if (payload.quantity === undefined || payload.quantity === null || payload.quantity < 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "quantity must be a non-negative number",
      });
    }
    if (!payload.unit_price) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "unit_price is required",
      });
    }
    if (!payload.new_or_used || (payload.new_or_used !== "N" && payload.new_or_used !== "U")) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: 'new_or_used must be "N" or "U"',
      });
    }
  }

  /**
   * Validate update payload before API request
   */
  private validateUpdatePayload(payload: BricklinkInventoryUpdateRequest): void {
    // Validate quantity delta syntax if provided
    if (payload.quantity !== undefined && !/^[+-]\d+$/.test(payload.quantity)) {
      throw new ConvexError({
        code: "INVALID_QUANTITY_FORMAT",
        message:
          'Quantity updates must use delta syntax with +/- prefix (e.g., "+5" or "-3"), not absolute values.',
        providedQuantity: payload.quantity,
      });
    }
    // Validate price format if provided
    if (payload.unit_price !== undefined && isNaN(parseFloat(payload.unit_price))) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "unit_price must be a valid fixed-point number string",
      });
    }
  }

  /**
   * Normalize error to standard format for StoreOperationResult
   */
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

    const normalized = normalizeApiError("bricklink", error);
    return {
      code: normalized.error.code,
      message: normalized.error.message,
      details: normalized.error.details,
    };
  }

  /**
   * @internal Test only - creates client with custom credentials
   */
  static createForTesting(
    credentials: BricklinkUserCredentials,
    businessAccountId: Id<"businessAccounts">,
    ctx: ActionCtx,
  ): BricklinkStoreClient {
    return new BricklinkStoreClient(credentials, businessAccountId, ctx);
  }
}
