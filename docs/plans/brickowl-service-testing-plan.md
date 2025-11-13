# BrickOwl Service Testing Plan

## Goals

- Provide confidence that BrickOwl integrations follow BrickOps marketplace conventions and handle failures predictably.
- Verify that shared helpers (client, credentials, request shaping, error normalization) behave correctly under success and failure scenarios.
- Assert that domain actions for inventory, orders, and notifications produce validated responses, propagate metrics, and surface actionable errors.

## What Do We Want the Service to Do?

- Resolve and validate BrickOwl credentials per business account before issuing upstream calls.
- Wrap every upstream request with consistent correlation IDs, rate limiting, retries, and metric emission.
- Normalize BrickOwl payloads into Convex-friendly structures, enforcing validator schemas along the way.
- Return `StoreOperationResult` objects for mutating flows with rollback metadata and retry guidance.
- Surface structured errors that map to canonical `StoreErrorCode` values and preserve retry hints (e.g., rate-limit reset timestamps).
- Support dry-run/idempotent modes so bulk operations and UI-driven retries remain safe.

## How We Think About Testing

- **Unit coverage first:** isolate helpers with lightweight fakes (e.g., stub `upstreamRequest`, `recordMetric`) to exercise success, retry, caching, and error branches.
- **Contract-style tests for actions:** use domain fixtures (existing `mockOrders`, synthetic inventory payloads) to confirm validators, transformer workflows, and `StoreOperationResult` shapes.
- **Behavior under failure:** explicitly simulate rate limiting, credential mismatches, BrickOwl validation errors, and transport failures to confirm normalization surfaces actionable metadata.
- **Instrumentation & ergonomics:** ensure metrics, correlation IDs, and idempotency caching occur where expected with minimal mocking.
- **Integration edges:** smoke-test multi-step flows (`bulkCreateInventories`, sequential update/delete) by stubbing BrickOwl responses and verifying downstream state.

## Test Data & Fixtures

- Reuse `convex/marketplaces/brickowl/mockOrders.ts` for order payload shapes; augment with minimal inventory samples (new + used lots).
- Extend shared fixtures for retry headers (e.g., `Retry-After`), malformed payloads, and mixed-type query parameters.
- Provide helper builders for `ActionCtx` and `Id<"businessAccounts">` to reduce boilerplate across suites.

## Planned `describe` Blocks

### Core Client Layer

- `describe('createBoRequestState')` – caches responses when idempotency keys repeat.
- `describe('withBoClient')` – injects correlation IDs and delegates to provided fn.
- `describe('makeBoRequest')` – hands credentials, rate limits, retries, and returns parsed data.
- `describe('toRetryPolicy')` – converts partial overrides into `RetryPolicy` options.
- `describe('buildBoError')` – maps upstream status codes to structured `ConvexError` payloads.

### Credential Resolution

- `describe('getBrickOwlCredentials')` – enforces account ownership, decrypts API keys, rejects missing/invalid keys.
- `describe('isValidBrickOwlApiKey')` – validates allowed character set and length boundaries.

### Request Shaping & Rate Limits

- `describe('buildBoDefaultHeaders')` – sets user agent + correlation header.
- `describe('buildBoApiKeyAuth')` – injects key into query/form fields per method.
- `describe('buildBoRateLimitOptions')` – produces account-scoped bucket names.
- `describe('normalizeBoQuery')` – strips undefineds, coerces primitive types.
- `describe('buildBoRequestBody')` – serializes POST payloads and JSON-encodes objects.
- `describe('boAccountBucket')` – prefixes bucket namespace correctly.

### Error Normalization

- `describe('normalizeBoStoreError')` – maps ConvexError + generic errors into canonical `StoreOperationError`s.
- `describe('mapBrickOwlErrorCode')` – translates status/provider codes into `StoreErrorCode`.
- `describe('isRetryable')` – flags retryable cases for rate limits, timeouts, and server errors.
- `describe('extractRetryAfterFromHeaders')` – parses numeric and timestamp `Retry-After` headers.
- `describe('extractRetryAfterFromBody')` – pulls retry hints from BrickOwl JSON bodies.

### Inventory Domain Actions

- `describe('listInventories')` – validates filter parsing and schema enforcement on responses.
- `describe('getInventory')` – handles lookups by lot/external id and not-found errors.
- `describe('createInventory')` – tests validator enforcement, idempotency caching, dry-run behavior, success metric emission, and error normalization.
- `describe('updateInventory')` – ensures fetch-before-update, rollback data population, and error paths.
- `describe('deleteInventory')` – confirms payload shaping, rollback data, metrics, and retryable failures.
- `describe('bulkCreateInventories')` – orchestrates bulk executor, aggregates partial failures, and preserves correlation IDs.
- `describe('executeBulkRequests')` (from `inventory/bulk.ts`) – chunks requests, respects options, and normalizes store results.
- `describe('recordInventoryMetric')` – emits correct tags for success/failure/validation outcomes.

### Orders Domain Actions

- `describe('listOrders')` – enforces query param schemas, pagination, and sorting defaults.
- `describe('getOrderDetail')` – loads order metadata/items and handles missing orders.
- `describe('acknowledgeOrderNotification')` – validates payloads and confirms mutation result semantics.
- `describe('normalizeOrderResponse')` – converts BrickOwl payloads to Convex shapes (covered in `orders/transformers` if present).

### Notifications Domain

- `describe('registerNotificationTargets')` – validates webhook subscription payloads and idempotency.
- `describe('pollNotifications')` – handles pagination cursors, translates events, and respects rate limits.
- `describe('acknowledgeNotification')` – returns `StoreOperationResult` with retry metadata on failure.

### Cross-Cutting Behaviors

- `describe('BrickOwl metrics emission')` – verifies that success/failure branches emit `external.brickowl.*` events with required tags.
- `describe('Correlation ID propagation')` – ensures IDs thread through client, metrics, and error payloads.
- `describe('Idempotent operations')` – simulates repeated calls with `idempotencyKey` to confirm cache reuse.
- `describe('Dry run safeguards')` – asserts dry-run paths never hit network layer and return deterministic placeholders.
- `describe('Retry telemetry hooks')` – checks that `onAttempt` callbacks surface retry attempts with expected payload.

## Risks & Follow-Ups

- Some suites require deeper Convex context stubs; coordinate on shared test helpers to avoid brittle mocks.
- Bulk and notification flows may need additional fixtures from live BrickOwl responses—plan for capture in staging before finalizing assertions.
- Post-MVP, consider adding contract tests against a mocked BrickOwl server (VCR-style) to catch schema drift.
