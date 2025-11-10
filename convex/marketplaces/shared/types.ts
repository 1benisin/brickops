/**
 * Shared TypeScript interfaces for marketplace operations
 * Used across BrickLink, BrickOwl, and other marketplace integrations
 */

/**
 * Standard result format for store operations
 * Used by Story 3.4 for sync status tracking and rollback support
 */
export type StoreErrorCode =
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK"
  | "AUTH"
  | "PERMISSION"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVER_ERROR"
  | "INVALID_RESPONSE"
  | "CIRCUIT_BREAKER_OPEN"
  | "UNEXPECTED_ERROR"
  | string;

export interface StoreOperationError {
  code: StoreErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
  rateLimitResetAt?: string;
  httpStatus?: number;
}

export interface StoreOperationRollbackData {
  previousQuantity?: number;
  previousPrice?: string;
  previousLocation?: string;
  previousNotes?: string;
  originalPayload?: unknown; // Full original data for recreate after delete
}

export type StoreOperationSuccess = {
  success: true;
  correlationId: string; // For distributed tracing
  marketplaceId?: number | string; // Generic marketplace ID (lot_id for BrickLink, lot_id for BrickOwl)
  bricklinkOrderId?: number; // For BrickLink order operations (Epic 4)
  brickowlOrderId?: string; // For BrickOwl order operations (Epic 4)
  marketplaceStatus?: string; // Marketplace's status field if available
  rollbackData?: StoreOperationRollbackData;
};

export type StoreOperationFailure = {
  success: false;
  correlationId: string; // For distributed tracing
  marketplaceId?: number | string;
  bricklinkOrderId?: number;
  brickowlOrderId?: string;
  marketplaceStatus?: string;
  error: StoreOperationError;
};

export type StoreOperationResult = StoreOperationSuccess | StoreOperationFailure;

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
