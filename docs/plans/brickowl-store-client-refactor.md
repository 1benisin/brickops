# BrickOwl Store Client Refactor Plan

## Objectives

- Align all BrickOwl API interactions with the official documentation in `docs/external-documentation/api-brickowl/`.
- Replace the current stateful `BrickOwlStoreClient` class with stateless helper functions, mirroring the BrickLink refactor (`bricklink-store-client-refactor.md`).
- Expose Convex actions/modules that map cleanly to documented BrickOwl routes (inventory, orders, bulk operations, notifications).
- Centralize validation using `convex/values` so only documented query parameters and payload fields are permitted.
- Preserve existing rate limiting, retry, logging, caching, and error-normalization behavior.

## High-Level Architecture

1. **Stateless HTTP Core (`storeClient.ts`)**

   - Keep shared primitives (`request`, `requestWithRetry`, `executeWithRetry`, OAuth/auth helpers, logging, cache handling).
   - Functions accept `ActionCtx`, credentials, and request options; no class or instance state.
   - Preserve idempotency key handling and request cache for bulk/idempotent calls.

2. **Credential + Context Helpers**

   - `getBrickOwlCredentials(ctx, businessAccountId)` to fetch and validate encrypted API keys.
   - `createBrickOwlHttpClient(ctx, businessAccountId)` returns an object with `request(options)` that closes over `ctx`/credentials.
   - `withBrickOwlClient(ctx, { businessAccountId, fn })` helper for shared credential loading.

3. **Route-Specific Modules**

   - `convex/marketplaces/brickowl/inventories.ts`
   - `convex/marketplaces/brickowl/orders.ts`
   - `convex/marketplaces/brickowl/bulk.ts`
   - `convex/marketplaces/brickowl/notifications.ts`
   - Each exports functions mirroring BrickOwl endpoints (`listInventories`, `getInventory`, `createInventory`, etc.) with signatures like `(ctx: ActionCtx, params: { businessAccountId: Id<"businessAccounts">; ... })`.
   - Bulk helper module coordinates batch payload composition and response parsing.

4. **Validators & Types (`schema.ts`)**

   - Define request/response validators derived from API docs (inventory payloads, orders, batch operations, notification targets).
   - Export `Infer`-derived TypeScript types for reuse.
   - Group schemas per resource (inventory, orders, bulk, notifications).

5. **Internal Convex Actions/Mutations**

   - Update higher-level flows (inventory import, order ingestion, mock helpers) to call the new resource modules directly.
   - Enforce validator usage at module boundaries to reject invalid options early.

## Detailed Steps

### 1. Schema & Validators (`convex/marketplaces/brickowl/schema.ts`)

- Create validators for:
  - Inventory filters, create/update payloads, response structures.
  - Order detail/item responses, status mapping inputs, notification targets.
  - Bulk batch payloads (request envelopes and individual operations).
- Export inferred types for each validator.

### 2. Stateless HTTP Core (`storeClient.ts`)

- Remove class definition; expose:
  - `async function request<T>(ctx, businessAccountId, credentials, options)`
  - `async function requestWithRetry<T>(ctx, businessAccountId, credentials, options)` (wraps retry policy/idempotency cache).
  - `async function executeWithRetry<T>(ctx, correlationId, operation, retryConfig)` if separate retry orchestration is needed.
  - `normalizeBrickOwlError`, `buildRequestUrl`, `serializeErrorBody`, and cache helpers.
- Maintain existing metrics (`external.brickowl.store.*`), quota checks, and error handling.
- Ensure idempotency cache logic is stateless (move cache to optional injected store or scoped map per invocation).

### 3. Credential Helpers (`credentials.ts`)

- Add `async function getBrickOwlCredentials(ctx, businessAccountId)` that decrypts the stored API key and validates format.
- Add `async function createBrickOwlHttpClient(ctx, businessAccountId)` returning `{ request }` using stateless core.
- Add `async function withBrickOwlClient(ctx, params)` mirroring the BrickLink helper.

### 4. Resource Modules

**Inventories (`inventories.ts`)**

- Expose CRUD helpers (`listInventories`, `getInventory`, `createInventory`, `updateInventory`, `deleteInventory`).
- Include bulk wrappers (`bulkCreateInventories`, `bulkUpdateInventories`, `bulkDeleteInventories`) that reshape payloads for `/bulk/batch`.
- Validate inputs via `schema` validators, construct requests using stateless client, log concise summaries, and return typed results.

**Orders (`orders.ts`)**

- Provide `getOrder`, `getOrderItems`, and status helpers if applicable.
- Normalize responses with validators and provide typed data to ingestion pipelines.

**Bulk (`bulk.ts`)**

- Centralize batch request orchestration (chunking, progress callbacks) for inventory operations.
- Reuse validators to ensure only documented endpoints/methods are batched.

**Notifications (`notifications.ts`)**

- Wrap `/order/notify` and related endpoints with validation and shared logging.

### 5. Update Call Sites

- Replace `new BrickOwlStoreClient(...)` instantiations with functional helpers across Convex modules (inventory import, orders ingestion, mock helpers, shared helpers).
- Update imports to consume new modules/types (e.g., `BOInventoryResponse` from `schema.ts`).
- Align higher-level flows with validator-derived types to avoid duplicating payload definitions.

### 6. Logging, Metrics & Rate Limiting

- Ensure all existing metrics (`external.brickowl.store.*`) remain in the stateless core.
- Keep quota checks/circuit-breaker updates in `request`.
- Emit structured logs for each endpoint similar to the BrickLink refactor (operation, status, correlationId, counts).

### 7. Testing & Verification

- Add/refresh unit tests for validators and helper modules (mirroring BrickLink coverage).
- Update integration tests covering inventory import, bulk operations, and mock order flows to use new helpers.
- Run `pnpm test:backend` and `pnpm lint` to confirm refactor stability.

### 8. Documentation & Cleanup

- Update `docs/architecture/backend/architecture.md` (or create ADR) to document the new BrickOwl helper layout.
- Ensure `docs/flows/` references to BrickOwl client functions point to new module APIs.
- Remove obsolete class-based code after migration.

## Open Questions / Follow-ups

- Determine if additional BrickOwl endpoints (e.g., catalog lookups, webhook equivalents) should be included in this refactor.
- Define response validation depth for batch operations (BrickOwl responses can be heterogeneous).
- Evaluate whether idempotency caching should move to a shared utility for parity with other providers.
