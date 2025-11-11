# BrickLink Service

The BrickLink service owns every Convex integration with BrickLink’s REST APIs. This guide highlights the core patterns you must follow so new features remain consistent with the rest of the marketplace stack.

## TL;DR

- Actions own all network traffic; queries stay pure; mutations only persist data fetched by actions.
- Always load BrickLink credentials via `shared/credentials.ts` using the provided `businessAccountId`.
- Use `withBlClient` (via `client.ts`) for every upstream call so retries, metrics, OAuth signing, and rate limits stay consistent.
- Validate inbound and outbound payloads with the closest `schema.ts`, surface errors with `StoreOperationResult`, and record `external.bricklink.*` metrics including correlation ids.

## Data Access Pattern

- **Execution boundaries**: Place network calls inside Convex `action`/`internalAction`. Queries stay side-effect free; mutations only write Convex data that actions produce.
- **Credential lookup**: Require a `businessAccountId`. `shared/credentials.ts` validates the active account, retrieves encrypted credentials from `marketplaces/shared/credentials`, and decrypts them for the request.
- **HTTP orchestration**:
  - Call `withBlClient` from `client.ts` to obtain a typed BrickLink client that injects credentials, correlation ids, retries, and rate limiting.
  - Use `makeBlRequest` for store endpoints and `makeBlCatalogRequest` for catalog endpoints. Both delegate to `shared/request.ts`, which signs OAuth 1.0a headers and normalizes responses so Convex logic handles a consistent `{ meta, data }` shape.
  - `shared/envelope.ts` and the root `schema.ts` validate the BrickLink response envelope before any domain logic runs.
- **Metrics & rate limits**: `shared/rateLimit.ts` maintains global and per-account buckets (`bricklink:global`, `bricklink:account:<id>`). Record `external.bricklink.*` metrics on every call, including status, duration, and correlation id.
- **Response transforms**: Domain `schema.ts` files declare Zod schemas for endpoint payloads. Helpers such as `catalog/transformers.ts` map validated payloads into Convex table shapes so downstream types remain consistent.
- **Store operation wrapper**: Mutating endpoints should return a `StoreOperationResult` (see `marketplaces/shared/storeTypes`). The pattern in `inventory/actions.ts`—validate input, call `makeBlRequest`, normalize failures with `normalizeBlStoreError`, surface any retry hints—is the canonical example.

## Directory Layout

```
convex/marketplaces/bricklink/
├── client.ts              # Typed BrickLink client, retries, metrics, helpers
├── errors.ts              # Normalize upstream errors into StoreOperationError
├── oauth.ts               # OAuth 1.0a signing helpers shared by request layer
├── schema.ts              # Cross-domain enums and BrickLink envelope schema
├── shared/                # Cross-domain helpers (credentials, ids, rate limit)
│   ├── credentials.ts
│   ├── ids.ts
│   ├── rateLimit.ts
│   └── request.ts
├── catalog/               # Catalog ingestion and refresh pipeline
│   ├── actions.ts         # Read-only endpoints (use withBlClient)
│   ├── schema.ts          # Catalog payload schemas
│   ├── transformers.ts    # Map catalog payloads into Convex tables
│   ├── freshness.ts       # Catalog freshness thresholds
│   └── refresh/           # Background refresh orchestration and cleanup
├── inventory/             # Store inventory CRUD & validation
│   ├── actions.ts         # StoreOperationResult flows
│   ├── schema.ts          # Inventory payload schemas
│   └── transformers.ts    # Normalize inventory responses pre-persistence
├── orders/                # Order retrieval, updates, notifications
│   ├── actions.ts         # list/get/update flows via withBlClient
│   ├── schema.ts          # Order payload schemas
│   └── mocks.ts           # Development-only webhook simulation
└── notifications/         # Webhook ingestion, dedupe, scheduling
    ├── actions.ts         # HTTP handler, queue management, processing
    ├── schema.ts          # Notification payload schemas
    └── utilities.ts       # Dedupe keys, retry rules, helpers
```

Refer back to this tree when creating new modules so new files match existing placement.

## Naming Conventions

- Prefix BrickLink-specific schemas with `bl…` (e.g. `blInventoryResponseSchema`) and export inferred types with a `BL…` prefix (`BLInventoryResponse`).
- Keep Zod schemas next to the feature that consumes them; re-export inferred types instead of duplicating TypeScript interfaces elsewhere.
- Prefix network helpers and orchestrators with `bl`/`BL` (`BLRequestOptions`, `BLClient`) to distinguish them from shared marketplace utilities.
- Use `mapX` naming for transformers (`mapPart`, `mapPriceGuide`) and pass raw BrickLink payloads as input.
- Generate correlation ids with `generateCorrelationId` and propagate them through headers (`X-Correlation-Id`) and metrics.
- Group files by responsibility (`actions.ts`, `schema.ts`, `transformers.ts`, `utilities.ts`) so new endpoints and helpers are easy to discover.

## Error Handling Pattern

- Throw `ConvexError` with structured payloads containing `code`, `message`, `httpStatus`, `correlationId`, and optional `retryAfterMs`/`details`. Downstream telemetry and UI flows expect these fields.
- Allow `client.ts` to wrap non-2xx responses via `buildBlError`, favoring the BrickLink meta code when available.
- Let `errors.ts` convert all Convex and upstream errors into a canonical `StoreOperationError` using `normalizeBlStoreError`, mapping status codes to standard store error codes (`RATE_LIMITED`, `AUTH`, `NETWORK`, etc.).
- When validation fails (before calling BrickLink), return `StoreOperationResult` with `success: false`. Reserve thrown errors for unexpected situations such as credential mismatches or upstream transport failures.
- Attach the active correlation id to every thrown error and metric to make cross-service tracing trivial.

## Working With Domain Modules

- **Catalog**: Use `withBlClient` for read-only APIs, parse `response.data.data`, map results with `catalog/transformers.ts`, and schedule refresh work in `catalog/refresh` when data ages out.
- **Inventory**: Wrap all create/update/delete flows in `StoreOperationResult`, record metrics for validation outcomes, and normalize BrickLink responses before returning to callers.
- **Orders**: Support paginated fetches (`listOrdersPage`), detail retrieval, status updates, payment updates, and Drive Thru email flows. Always validate input with `orders/schema.ts` helpers first.
- **Notifications**: The HTTP handler validates webhook tokens, deduplicates events, persists them to `bricklinkNotifications`, and schedules retries with exponential backoff. Processing actions retrieve order details via the orders module.

## Adding a New Endpoint

1. Define request and response schemas in the relevant domain `schema.ts`, reusing enums from the root `schema.ts` whenever possible.
2. Implement a Convex action in the appropriate domain:
   - Parse inputs with the new schema.
   - Call `withBlClient`/`makeBlRequest`, supplying a correlation id for mutating calls.
   - Validate `response.data.data` against the response schema before returning.
3. For mutating endpoints, map BrickLink failures into `StoreOperationResult` with `normalizeBlStoreError` and record metrics (including retry hints).
4. Extend transformers or refresh logic if the endpoint persists data locally.
5. Update tests or mocks if webhook flows or dev tooling rely on the new endpoint.

## Local Testing & Tooling

- Use `orders/mocks.ts` for development-only Drive Thru webhook simulations (guard new mocks with `assertDevelopmentEnvironment`).
- Reach for the ShadCN and Convex MCP servers to inspect UI components or Convex data while developing.
- Run `pnpm test:backend` after adding or modifying actions, and follow the project-wide testing standards in `docs/architecture/development/testing-strategy.md`.

## Helpful References

- `docs/external-documentation/api-bricklink/` — upstream API reference.
- `convex/marketplaces/shared/credentials.ts` — shared persistence for encrypted credentials and webhook tokens.
- `docs/architecture/backend/architecture.md` — Convex action/mutation guidance for marketplace integrations.

Keeping new code aligned with these conventions preserves consistency across marketplace integrations and simplifies cross-provider maintenance.
