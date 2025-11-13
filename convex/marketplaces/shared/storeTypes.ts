// Shared TypeScript interfaces we use when calling external marketplace stores.

// Possible error codes we capture when a marketplace call fails.
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

// Standard shape for describing a marketplace failure.
export interface StoreOperationError {
  code: StoreErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
  rateLimitResetAt?: string;
  httpStatus?: number;
}

// Details needed to roll back a change if the marketplace call fails later on.
export interface StoreOperationRollbackData {
  previousQuantity?: number;
  previousPrice?: string;
  previousLocation?: string;
  previousNotes?: string;
  originalPayload?: unknown;
}

// Successful marketplace operation response.
export type StoreOperationSuccess = {
  success: true;
  correlationId: string;
  marketplaceId?: number | string;
  bricklinkOrderId?: number;
  brickowlOrderId?: string;
  marketplaceStatus?: string;
  rollbackData?: StoreOperationRollbackData;
};

// Failed marketplace operation response that includes structured error info.
export type StoreOperationFailure = {
  success: false;
  correlationId: string;
  marketplaceId?: number | string;
  bricklinkOrderId?: number;
  brickowlOrderId?: string;
  marketplaceStatus?: string;
  error: StoreOperationError;
};

// Union type so callers can work with either success or failure results.
export type StoreOperationResult = StoreOperationSuccess | StoreOperationFailure;

// Information about how to undo a previously applied change.
export interface RollbackOperation {
  operationType: "create" | "update" | "delete";
  compensatingOperation: "delete" | "create" | "update";
  compensatingPayload: unknown;
  description: string;
}

// Summary of a dry-run request before we perform the real marketplace call.
export interface DryRunResult {
  valid: boolean;
  validationErrors?: string[];
  estimatedApiCalls?: number;
  estimatedDurationMs?: number;
  affectedItems?: number;
}
