/**
 * Shared TypeScript interfaces for marketplace operations
 * Used across BrickLink, BrickOwl, and other marketplace integrations
 */

/**
 * Standard result format for store operations
 * Used by Story 3.4 for sync status tracking and rollback support
 */
export interface StoreOperationResult {
  success: boolean;
  marketplaceId?: number | string; // Generic marketplace ID (lot_id for BrickLink, lot_id for BrickOwl)
  bricklinkOrderId?: number; // For BrickLink order operations (Epic 4)
  brickowlOrderId?: string; // For BrickOwl order operations (Epic 4)
  error?: {
    code: string; // e.g., "CONFLICT", "VALIDATION_ERROR", "RATE_LIMIT", "NOT_FOUND"
    message: string; // User-friendly error message
    details?: unknown; // Additional error context
  };
  marketplaceStatus?: string; // Marketplace's status field if available
  correlationId: string; // For distributed tracing
  // Rollback support - data needed to reverse operation
  rollbackData?: {
    previousQuantity?: number;
    previousPrice?: string;
    previousLocation?: string;
    previousNotes?: string;
    originalPayload?: unknown; // Full original data for recreate after delete
  };
}

/**
 * Marketplace credentials (decrypted)
 */
export interface MarketplaceCredentials {
  provider: "bricklink" | "brickowl";
  // BrickLink OAuth 1.0a
  bricklinkConsumerKey?: string;
  bricklinkConsumerSecret?: string;
  bricklinkTokenValue?: string;
  bricklinkTokenSecret?: string;
  // BrickOwl API key
  brickowlApiKey?: string;
}

/**
 * Rate limit state for a marketplace provider
 */
export interface RateLimitState {
  windowStart: number;
  requestCount: number;
  capacity: number;
  windowDurationMs: number;
  alertThreshold: number;
  alertEmitted: boolean;
  consecutiveFailures: number;
  circuitBreakerOpenUntil?: number;
}

/**
 * Rollback operation descriptor
 * Describes how to reverse a marketplace operation
 */
export interface RollbackOperation {
  operationType: "create" | "update" | "delete";
  compensatingOperation: "delete" | "create" | "update";
  compensatingPayload: unknown;
  description: string; // Human-readable description of rollback
}

/**
 * Dry-run result for operation preview
 */
export interface DryRunResult {
  valid: boolean;
  validationErrors?: string[];
  estimatedApiCalls?: number;
  estimatedDurationMs?: number;
  affectedItems?: number;
}
