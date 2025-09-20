# Error Handling Strategy

## General Approach

- **Error Model:** Structured error objects with error codes, user-friendly messages, and technical details using Convex's built-in error handling
- **Exception Hierarchy:** Domain-specific error types (InventoryError, APIIntegrationError, AuthenticationError) with consistent error formatting
- **Error Propagation:** Errors bubble up through service layers with context enrichment at each level, utilizing Convex's automatic error serialization

## Logging Standards

- **Library:** Convex built-in logging with structured log format
- **Format:** JSON structured logs with consistent field naming: `{ timestamp, level, service, correlationId, userId, businessAccountId, message, context, error }`
- **Levels:** ERROR (system failures), WARN (recoverable issues), INFO (business events), DEBUG (development diagnostics)
- **Required Context:**
  - Correlation ID: `req-${timestamp}-${randomId}` format for tracing requests across services
  - Service Context: Function name, component, and operation being performed
  - User Context: Always include businessAccountId for tenant isolation, userId when available (exclude PII)

## Error Handling Patterns

### External API Errors

- **Retry Policy:** Exponential backoff with jitter (1s, 2s, 4s, 8s max) for transient failures, immediate retry for rate limits after cool-down period
- **Circuit Breaker:** Open circuit after 5 consecutive failures, half-open after 30 seconds, close after 3 successful requests
- **Timeout Configuration:** 10 seconds for Brickognize API, 15 seconds for Bricklink/Brickowl APIs (accounting for their slower response times)
- **Error Translation:** Map external API errors to user-friendly messages while preserving technical details for logging

### Business Logic Errors

- **Custom Exceptions:** `InventoryInsufficientError`, `OrderNotFoundError`, `PartIdentificationFailedError`, `PickingConflictError`
- **User-Facing Errors:** Clear, actionable messages with suggested resolution steps (e.g., "Part not found at location C303. Check alternative locations or mark as issue.")
- **Error Codes:** Domain-prefixed codes (INV-001, ORD-001, API-001) for support and debugging reference

### Data Consistency

- **Transaction Strategy:** Convex's built-in transactional mutations ensure atomicity for inventory updates and order processing
- **Compensation Logic:** Rollback patterns for failed multi-step operations (e.g., inventory reservation failure triggers order status reset)
- **Idempotency:** All external API calls and critical operations use idempotency keys to prevent duplicate processing
