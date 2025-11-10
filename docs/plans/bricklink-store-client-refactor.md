# BrickLink Store Client Refactor Plan

## Objectives

- Align all BrickLink API interactions with the official documentation in `docs/external-documentation/api-bricklink`.
- Replace the current stateful `BricklinkStoreClient` class with stateless helper functions.
- Expose internal Convex actions/modules that map directly to BrickLink CRUD routes (`/inventories`, `/orders`, `/catalog`, `/categories`, `/colors`).
- Centralize validation using `convex/values` so only documented query parameters and payload fields are permitted.
- Preserve existing rate limiting, retry, logging, and error-normalization behavior.

## High-Level Architecture

1. **Stateless HTTP Core (`storeClient.ts`)**

   - Keep only shared primitives (`request`, `executeWithRetry`, `makeRequest`, OAuth helpers, logging).
   - Functions accept `ActionCtx`, credentials, and request options. No class or instance state.

2. **Credential + Context Helpers**

   - `getBrickLinkCredentials(ctx, businessAccountId)` to fetch and validate BrickLink credentials.
   - `createBrickLinkHttpClient(ctx, businessAccountId)` returns a simple object with a `request(options)` function that closes over `ctx` and credentials (still stateless per call).

3. **Route-Specific Modules (one per resource)**

   - `convex/marketplaces/bricklink/inventories.ts`
   - `convex/marketplaces/bricklink/orders.ts`
   - `convex/marketplaces/bricklink/catalog.ts`
   - `convex/marketplaces/bricklink/categories.ts`
   - `convex/marketplaces/bricklink/colors.ts`
   - Each exports functions mirroring BrickLink CRUD endpoints (`getBLInventories`, `getBLInventory`, `createBLInventory`, etc.). Signatures: `(ctx: ActionCtx, params: { businessAccountId: Id<"businessAccounts">; ... })`.

4. **Validators & Types (`schema.ts`)**

   - Define query/payload validators derived from BrickLink docs (e.g., allowed `status` values, enum item types).
   - Export `Infer`ed TypeScript types so call sites share the same definitions.
   - Keep schemas grouped per resource.

5. **Internal Convex Actions**
   - For higher-level flows (e.g., import preview), call the new helpers directly (`await getBLInventories(ctx, { businessAccountId, filters })`).
   - Enforce validator usage at boundaries to catch invalid options early.

## Detailed Steps

### 1. Schema & Validators (`convex/marketplaces/bricklink/schema.ts`)

- Create resource-specific validator objects:
  - `bricklinkInventoryFiltersValidator` for `/inventories` query params (`item_type`, `status`, `category_id`, `color_id`).
  - `bricklinkInventoryCreateValidator`, `bricklinkInventoryUpdateValidator`.
  - Similar validators for orders, catalog, categories, colors.
- Export inferred types for reuse:  
  `export type BricklinkInventoryFilters = Infer<typeof bricklinkInventoryFiltersValidator>;`

### 2. Stateless HTTP Core (`storeClient.ts`)

- Remove the class; export:
  - `async function request<T>(ctx, businessAccountId, credentials, options)`
  - `async function executeWithRetry<T>(ctx, correlationId, operation, retryConfig)`
  - `async function makeRequest<T>(ctx, businessAccountId, credentials, correlationId, options)`
- Keep OAuth signing, quota checks, logging, metrics identical to current behavior.
- Introduce a small helper:  
  `async function withBrickLinkClient<T>(ctx, businessAccountId, fn)` that loads credentials once and hands `request` to `fn`.

### 3. Credential Helpers (`credentials.ts`)

- Add `async function ensureBrickLinkCredentials(ctx, businessAccountId)` that:
  - Fetches stored credentials.
  - Throws a structured `ConvexError` if missing/invalid.
  - Returns `{ credentials, businessAccountId }`.

### 4. Resource Modules

**Inventories (`inventories.ts`)**

- Export:
  - `getBLInventories(ctx, { businessAccountId, filters })`
  - `getBLInventory(ctx, { businessAccountId, inventoryId })`
  - `createBLInventory(ctx, { businessAccountId, payload })`
  - `updateBLInventory(ctx, { businessAccountId, inventoryId, payload })`
  - `deleteBLInventory(ctx, { businessAccountId, inventoryId })`
- Each function:
  1. Validates inputs with `schema` validators.
  2. Calls `withBrickLinkClient` to execute the HTTP request via stateless `request`.
  3. Logs summarized responses (counts, meta codes).
  4. Returns typed data (run response validators if necessary).

**Orders / Catalog / Categories / Colors**

- Follow the same pattern; map to `/orders`, `/catalog`, `/categories`, `/colors` endpoints.
- Keep function names descriptive (`listOrders`, `getOrder`, etc.).
- Only pass documented query parameters.

### 5. Update Call Sites

- Search for `new BricklinkStoreClient` and replace with functional helpers.
- Update imports to `convex/marketplaces/bricklink/inventories` etc.
- Adjust to new API: e.g., `const inventories = await getBLInventories(ctx, { businessAccountId, filters });`
- Ensure existing actions/queries use validator-derived types.

### 6. Logging & Metrics

- Maintain current metrics (`external.bricklink.store.*`) inside `request`.
- Log summary per endpoint function using consistent format:
- Remove temporary debug consoles once satisfied.

### 8. Documentation & Cleanup

- Update `docs/architecture/backend/architecture.md` (or dedicated ADR) describing:
  - Removal of `BricklinkStoreClient` class.
  - New functional helper modules and validator usage.
- Note the new file layout under `convex/marketplaces/bricklink/`.
- Delete obsolete class definitions once migration complete.

## Open Questions / Follow-ups

- Confirm if any additional BrickLink endpoints should be covered (e.g., notifications). Extend schema modules as needed.
- Evaluate whether response validation is necessary beyond meta checks (BrickLink sometimes returns 200 with error meta).

---
