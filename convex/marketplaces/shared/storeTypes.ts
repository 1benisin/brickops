/**
 * Shared TypeScript interfaces for marketplace store operations.
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
  originalPayload?: unknown;
}

export type StoreOperationSuccess = {
  success: true;
  correlationId: string;
  marketplaceId?: number | string;
  bricklinkOrderId?: number;
  brickowlOrderId?: string;
  marketplaceStatus?: string;
  rollbackData?: StoreOperationRollbackData;
};

export type StoreOperationFailure = {
  success: false;
  correlationId: string;
  marketplaceId?: number | string;
  bricklinkOrderId?: number;
  brickowlOrderId?: string;
  marketplaceStatus?: string;
  error: StoreOperationError;
};

export type StoreOperationResult = StoreOperationSuccess | StoreOperationFailure;

export interface RollbackOperation {
  operationType: "create" | "update" | "delete";
  compensatingOperation: "delete" | "create" | "update";
  compensatingPayload: unknown;
  description: string;
}

export interface DryRunResult {
  valid: boolean;
  validationErrors?: string[];
  estimatedApiCalls?: number;
  estimatedDurationMs?: number;
  affectedItems?: number;
}
