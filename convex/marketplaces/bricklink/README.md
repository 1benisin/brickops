# BrickLink Service

The BrickLink service owns every Convex integration with BrickLink’s REST APIs. This guide highlights the core patterns you must follow so new features remain consistent with the rest of the marketplace stack.

## TL;DR

- Actions own all network traffic; queries stay pure; mutations only persist data fetched by actions.
- Always load BrickLink credentials via `credentials.ts` using the provided `businessAccountId`.
- Use `withBlClient` (via `transport.ts`) for every upstream call so retries, metrics, OAuth signing, and rate limits stay consistent.
- Validate inbound and outbound payloads with the closest `schema.ts`, surface errors with `StoreOperationResult`, and record `external.bricklink.*` metrics including correlation ids.

## Developer Onboarding Checklist

- Read `docs/architecture/backend/architecture.md` and `docs/architecture/development/development-workflow.md` to align with Convex patterns and workflows.
- Review the relevant initiative in `docs/plans/` and any BrickLink-specific requirements captured there before adding or changing endpoints.
- Inspect existing flows (for example `catalog/refreshWorker.ts` and `inventory/actions.ts`) to understand how actions orchestrate BrickLink requests and persistence.
- Explore the helpers in `convex/marketplaces/shared`—especially `credentials.ts`, `storeTypes.ts`, and the rate limit helpers—to understand the shared marketplace contract.
- Use the Convex MCP server to list available BrickLink functions and tables, then run `pnpm test:backend` to verify changes locally.

## Data Access Pattern

- **Execution boundaries**: Place network calls inside Convex `action`/`internalAction`. Queries stay side-effect free; mutations only write Convex data that actions produce.
- **Credential lookup**: Require a `businessAccountId`. `credentials.ts` validates the active account, retrieves encrypted credentials from `marketplaces/shared/credentials`, and decrypts them for the request.
- **HTTP orchestration**:
  - Call `withBlClient` from `transport.ts` to obtain a typed BrickLink client that injects credentials, correlation ids, retries, and rate limiting.
  - Use `makeBlRequest` for store endpoints and `makeBlCatalogRequest` for catalog endpoints. Both delegate to `request.ts`, which signs OAuth 1.0a headers and normalizes responses so Convex logic handles a consistent `{ meta, data }` shape.
  - `envelope.ts` and the root `schema.ts` validate the BrickLink response envelope before any domain logic runs.
- **Metrics & rate limits**: `rateLimit.ts` maintains global and per-account buckets (`bricklink:global`, `bricklink:account:<id>`). Record `external.bricklink.*` metrics on every call, including status, duration, and correlation id.
- **Response transforms**: Domain `schema.ts` files declare Zod schemas for endpoint payloads. Resource transformers (for example `catalog/parts/transformers.ts`) map validated payloads into Convex table shapes so downstream types remain consistent.
- **Store operation wrapper**: Mutating endpoints should return a `StoreOperationResult` (see `marketplaces/shared/storeTypes`). The pattern in `inventory/actions.ts`—validate input, call `makeBlRequest`, normalize failures with `normalizeBlStoreError`, surface any retry hints—is the canonical example.

## End-to-End Data Flow

1. A scheduler, webhook handler, or UI request calls the appropriate Convex action (`internalAction` for background work, public `action` for user-triggered flows).
2. The action loads BrickLink credentials for the supplied `businessAccountId` via `marketplaces/shared/credentials.ts`, ensuring the account is active.
3. `withBlClient` wraps the outbound request with OAuth signing, correlation id generation, retries, and calls into `rateLimit.ts` to enforce per-account and global throttles.
4. The upstream response is normalized through `envelope.ts` and validated against the domain `schema.ts`. Transformers map `response.data.data` into Convex-native shapes.
5. Mutations persist validated entities, reusing shared transaction helpers where needed. Actions return typed payloads or `StoreOperationResult` instances to the caller.
6. Metrics (`external.bricklink.*`) and structured errors propagate correlation ids so downstream services and dashboards can trace the request.

## Shared Marketplace Services

- `marketplaces/shared/credentials.ts` and `credentialHelpers.ts` centralize credential storage, encryption, and account activation checks for every marketplace provider.
- `marketplaces/shared/storeTypes.ts` defines `StoreOperationResult` and shared error envelopes; BrickLink actions should always reuse these types when returning store mutations.
- `marketplaces/shared/rateLimits.ts` and `rateLimitHelpers.ts` expose bucket naming helpers consumed by `bricklink/rateLimit.ts`; use them when creating new throttles.
- `marketplaces/shared/schema.ts` and `credentialTypes.ts` hold reusable enums and validator primitives—import from here instead of redefining marketplace-agnostic types.
- `marketplaces/shared/webhooks.ts` and `webhookTokens.ts` provide the webhook token lifecycle shared across marketplace providers; BrickLink notification flows rely on them.
- `convex/users/authorization.ts` offers helpers for asserting environment constraints and request provenance; call `requireUserRole(ctx, "owner")` when adding new authenticated entrypoints.

## Directory Layout

```
convex/marketplaces/bricklink/
├── transport.ts           # Typed BrickLink transport layer, retries, metrics, helpers
├── errors.ts              # Normalize upstream errors into StoreOperationError
├── oauth.ts               # OAuth 1.0a signing helpers shared by request layer
├── schema.ts              # Cross-domain enums and BrickLink envelope schema
├── credentials.ts         # Credential lookup, decryption, normalization
├── envelope.ts            # BrickLink envelope parsing helpers
├── ids.ts                 # Correlation id utilities
├── rateLimit.ts           # Rate limit buckets and helpers
├── request.ts             # HTTP request orchestration and OAuth signing
├── catalog/               # Catalog ingestion and refresh pipeline
│   ├── categories/        # Category fetch + transforms
│   │   ├── actions.ts
│   │   ├── schema.ts
│   │   └── transformers.ts
│   ├── colors/            # Color metadata fetch + transforms
│   │   ├── actions.ts
│   │   ├── schema.ts
│   │   └── transformers.ts
│   ├── parts/             # Part detail fetch + transforms
│   │   ├── actions.ts
│   │   ├── schema.ts
│   │   └── transformers.ts
│   ├── priceGuides/       # Price guide fetch + transforms
│   │   ├── actions.ts
│   │   ├── schema.ts
│   │   └── transformers.ts
│   ├── shared/            # Catalog utilities
│   │   ├── health.ts
│   │   ├── request.ts
│   │   └── transformers.ts
│   └── refresh.ts         # Catalog freshness utilities and orchestration
├── inventory/             # Store inventory CRUD & validation
│   ├── actions.ts         # StoreOperationResult flows
│   ├── schema.ts          # Inventory payload schemas
│   └── transformers.ts    # Normalize inventory responses pre-persistence
├── orders/                # Order retrieval, updates, notifications
│   ├── actions.ts         # list/get/update flows via withBlClient
│   ├── schema.ts          # Order payload schemas
│   └── mocks.ts           # Development-only webhook simulation
└── notifications/         # Webhook ingestion, polling, dedupe pipeline
    ├── actions.ts         # HTTP wrappers, scheduler entrypoints, processor wiring
    ├── processor.ts       # Notification queue processing, polling helpers, mock ingestion
    ├── schema.ts          # Notification payload schemas
    ├── store.ts           # Credential lookup, dedupe persistence, status updates
    ├── utilities.ts       # Dedupe keys, retry rules, shared helpers
    └── webhook.ts         # HTTP handler & webhook registration lifecycle
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
- Allow `transport.ts` to wrap non-2xx responses via `buildBlError`, favoring the BrickLink meta code when available.
- Let `errors.ts` convert all Convex and upstream errors into a canonical `StoreOperationError` using `normalizeBlStoreError`, mapping status codes to standard store error codes (`RATE_LIMITED`, `AUTH`, `NETWORK`, etc.).
- When validation fails (before calling BrickLink), return `StoreOperationResult` with `success: false`. Reserve thrown errors for unexpected situations such as credential mismatches or upstream transport failures.
- Attach the active correlation id to every thrown error and metric to make cross-service tracing trivial.

## Working With Domain Modules

- **Catalog**: Use `withBlClient` for read-only APIs, parse `response.data.data`, map results with the resource transformers (for example `catalog/parts/transformers.ts`), and schedule refresh work via `catalog/refresh` when data ages out.
- **Inventory**: Wrap all create/update/delete flows in `StoreOperationResult`, record metrics for validation outcomes, and normalize BrickLink responses before returning to callers.
- **Orders**: Support paginated fetches (`listOrdersPage`), detail retrieval, status updates, payment updates, and Drive Thru email flows. Always validate input with `orders/schema.ts` helpers first.
- **Notifications**: `webhook.ts` authenticates inbound requests, manages registration, and stages work; `store.ts` centralizes credential lookup plus persistence into `bricklinkNotifications`; `processor.ts` polls and processes notifications with exponential backoff, delegating to the orders module. `utilities.ts` holds dedupe keys, retry constants, and shared helpers.

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
