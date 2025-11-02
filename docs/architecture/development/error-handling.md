# Error Handling Strategy

BrickOps uses structured error handling patterns throughout the codebase to provide consistent error experiences and enable proper error recovery.

## Error Types

### ConvexError for User-Facing Errors

Convex functions use `ConvexError` for user-facing errors with helpful messages:

```typescript
import { ConvexError } from "convex/values";

// User-friendly error messages
throw new ConvexError("BrickOwl credentials not configured. Please update your credentials in settings.");
throw new ConvexError("BrickOwl API rate limit exceeded. Please retry after 60 seconds.");
throw new ConvexError("Invalid inventory data: quantity must be positive.");
```

**Guidelines:**
- Use clear, actionable error messages
- Include guidance on how to resolve the error
- Never expose internal implementation details
- Log detailed errors server-side with correlation IDs

### API Error Normalization

External API errors are normalized using the `normalizeApiError()` helper:

```typescript
// From convex/lib/external/types.ts
import { normalizeApiError } from "../lib/external/types";

try {
  const response = await fetch(apiUrl);
  if (!response.ok) {
    throw normalizeApiError("bricklink", error, {
      endpoint: path,
      status: response.status,
      correlationId,
    });
  }
} catch (error) {
  // Normalized error with consistent structure
  throw error;
}
```

### Structured Error Interface

```typescript
interface ApiError {
  error: {
    code: string;              // Error code (e.g., "VALIDATION_ERROR", "RATE_LIMIT")
    message: string;           // User-friendly message
    details?: Record<string, any>; // Additional error context
    timestamp: string;         // Error timestamp
    requestId: string;         // Correlation ID for tracing
  };
}
```

## Error Handling Patterns

### External API Errors

**Retry Logic:**
- Exponential backoff with jitter
- Circuit breaker pattern for persistent failures
- Timeout configuration per API
- Retry-After header support for rate limits

**Error Categories:**
1. **Transient Failures** (auto-retry):
   - HTTP 5xx errors
   - Network timeouts
   - Rate limit exceeded (429) - respect Retry-After header
   - Action throws → Convex auto-retries with backoff

2. **Permanent Failures** (no retry):
   - HTTP 4xx errors (bad request, not found, unauthorized)
   - Validation errors
   - Conflict errors (409)
   - Store error details for user review

3. **Special Handling:**
   - HTTP 409 (Conflict) → Surface to UI for user resolution
   - HTTP 401 (Unauthorized) → Prompt user to update credentials
   - HTTP 429 (Rate Limit) → Show wait time to user

**BrickLink-Specific Error Handling:**

BrickLink returns HTTP 200 with errors in the response body. Check `meta.code` field:

```typescript
if (typeof data === "object" && data !== null && "meta" in data) {
  const meta = (data as { meta: { code?: number; message?: string } }).meta;
  if (meta.code && meta.code >= 400) {
    throw normalizeApiError("bricklink", 
      new Error(`BrickLink Error ${meta.code}: ${meta.message}`),
      { endpoint: path, status: meta.code }
    );
  }
}
```

**BrickOwl-Specific Error Handling:**

Standard HTTP status codes with JSON error bodies:

```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get("Retry-After");
  throw new ConvexError(`BrickOwl rate limit: retry after ${retryAfter}s`);
}

if (response.status === 401) {
  throw new ConvexError("BrickOwl API key is invalid or expired. Please update your credentials.");
}
```

### Data Consistency

**Transactional Mutations:**
- All database operations within a mutation are atomic
- Failures rollback all changes automatically
- Use Convex transactions for multi-step operations

**Idempotency:**
- Idempotency keys for external API calls
- Prevent duplicate operations on retries
- Store operation status in database before external calls

**Error Logging:**

```typescript
// Log error with context before throwing
recordMetric("external.bricklink.store.error", {
  businessAccountId,
  operation: path,
  httpStatus: error.status,
  durationMs,
  correlationId,
});

// Throw normalized error
throw normalizeApiError("bricklink", error, { correlationId });
```

## Frontend Error Handling

**Error Display:**
- Show user-friendly error messages from backend
- Display retry options for transient failures
- Provide action buttons for resolvable errors (e.g., "Update Credentials")

**Error Recovery:**
- Automatic retry for transient failures
- Manual retry options in UI
- Clear error messages with next steps

## Error Metrics and Monitoring

**Metrics Recorded:**
- Error rates by operation and provider
- HTTP status code distribution
- Error recovery success rates
- Circuit breaker state changes

**Correlation IDs:**
- Every error includes a correlation ID
- Enables end-to-end tracing
- Links frontend errors to backend logs

## Best Practices

1. **Always log detailed errors server-side** - Include correlation IDs, full context
2. **Never expose internal details to users** - Use user-friendly messages
3. **Provide actionable guidance** - Tell users how to fix the problem
4. **Use structured error codes** - Enable programmatic error handling
5. **Track error patterns** - Monitor for recurring issues
6. **Implement circuit breakers** - Prevent cascading failures
7. **Respect rate limits** - Handle 429 errors gracefully with retry-after
