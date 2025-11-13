# BrickOwl Service

BrickOwl integrations live under this module. Follow these conventions to keep provider-specific logic aligned with the rest of the marketplace stack.

## TL;DR

- Actions own network calls; queries stay pure; mutations persist Convex state derived from actions.
- Always resolve credentials via `credentials.ts` using the active `businessAccountId`.
- Route every upstream request through `withBoClient` so retries, metrics, rate limits, and correlation ids stay consistent.
- Validate payloads with the nearest `schema.ts`, wrap mutating flows in `StoreOperationResult`, and emit `external.brickowl.*` metrics including correlation ids.

## Developer Onboarding Checklist

- Read `docs/architecture/backend/architecture.md` and `docs/architecture/development/development-workflow.md` to internalize Convex conventions and deployment workflows.
- Align with product scope by reviewing the active initiatives in `docs/plans/` (for example the BrickOwl testing plan) before adding or changing endpoints.
- Walk through existing BrickOwl flows (`inventory/actions.ts`, `orders/actions.ts`) to see how actions compose the shared marketplace helpers and transformers.
- Audit the shared marketplace modules in `convex/marketplaces/shared`, paying special attention to `credentials.ts`, `storeTypes.ts`, and the rate limit helpers used across providers.
- Use the Convex MCP server to inspect current BrickOwl tables and functions, then run `pnpm test:backend` to validate your changes end-to-end.

## Data Access Pattern

- **Execution boundaries**: Keep HTTP traffic inside Convex `action`/`internalAction`. Queries read only; mutations store the data produced by actions.
- **Credential lookup**: Require a `businessAccountId`. `credentials.ts` decrypts the BrickOwl API key stored in `marketplaces/shared/credentials`.
- **HTTP orchestration**:
  - Use `withBoClient` (from `client.ts`) for every BrickOwl request. The helper injects credentials, correlation ids, retries, and per-account rate limits.
  - `request.ts` normalizes headers, query parameters, and POST bodies before delegating to `upstreamRequest`.
- **Metrics & rate limits**: `rateLimit.ts` exposes `boAccountBucket(businessAccountId)` for per-account limits. Record `external.brickowl.*` metrics on each request with tags for `businessAccountId`, `endpoint`, `method`, `status`, and `correlationId`.
- **Transformers**: Domain `transformers.ts` files map BrickOwl payloads into Convex table shapes to keep downstream typing predictable.
- **Store operation wrapper**: Mutating endpoints should return `StoreOperationResult`. Follow the pattern in `inventory/actions.ts`—parse input, call BrickOwl, normalize failures, include retry hints, and return rollback metadata.

## End-to-End Data Flow

1. A scheduler, webhook, or UI trigger calls the appropriate Convex action, keeping background orchestration inside `internalAction` modules.
2. The action fetches and validates the BrickOwl credentials for the supplied `businessAccountId` using `marketplaces/shared/credentials.ts` and its helpers.
3. `withBoClient` (from `client.ts`) wraps the outbound request, attaching a correlation id, invoking rate limit helpers, and configuring retries/backoff.
4. Responses are normalized by `request.ts`, then validated against the relevant domain `schema.ts`. Transformers map the typed payloads into Convex entities.
5. Mutations persist the validated data or synthesize a `StoreOperationResult`, leveraging `marketplaces/shared/storeTypes.ts` for consistent return types.
6. Structured metrics (`external.brickowl.*`) and error envelopes propagate the correlation id for observability across services.

## Shared Marketplace Services

- `marketplaces/shared/credentials.ts` and `credentialHelpers.ts` handle encrypted credential storage, rotation, and activation checks for every marketplace provider.
- `marketplaces/shared/storeTypes.ts` defines `StoreOperationResult` and shared error formats—return these from BrickOwl mutations to stay consistent with BrickLink.
- `marketplaces/shared/rateLimits.ts` and `rateLimitHelpers.ts` publish bucket names and helpers consumed by `brickowl/rateLimit.ts`; reuse them when adding new throttles.
- `marketplaces/shared/schema.ts` and `credentialTypes.ts` expose marketplace-agnostic enums and validators; import from here instead of duplicating primitives.
- `marketplaces/shared/webhooks.ts` and `webhookTokens.ts` encapsulate webhook token lifecycle management reused by BrickOwl notifications.
- `convex/users/authorization.ts` provides environment and authentication assertions; call `requireUserRole(ctx, "owner")` for owner-only entrypoints.

## Directory Layout

```
convex/marketplaces/brickowl/
├── client.ts                 # BO client, retries, helpers
├── credentials.ts            # Credential lookup & validation
├── errors.ts                 # Normalize upstream errors into StoreOperationError
├── ids.ts                    # Correlation id helpers
├── rateLimit.ts              # Rate limit bucket helpers
├── request.ts                # Request normalization + upstream bridge
├── schema.ts                 # Shared enums + barrel re-exports
├── validators.ts             # Shared enums + primitive validators
├── inventory/
│   ├── actions.ts            # Inventory CRUD orchestration
│   ├── bulk.ts               # Bulk inventory helpers
│   ├── schema.ts             # Inventory request/response validators
│   └── transformers.ts       # Inventory mapping helpers
├── orders/
│   ├── actions.ts            # Orders list/detail flows
│   └── schema.ts             # Orders validators and payloads
└── notifications/
    ├── actions.ts            # Webhook registration + polling
    └── schema.ts             # Notification payload validators
```

> **Note:** Domain schemas now live alongside their actions; `schema.ts` only re-exports shared enums and domain validators.

## Naming Conventions

- Prefix BrickOwl-specific schemas and helpers with `bo…` (e.g. `boInventoryResponseSchema`) and export inferred types with `BO…` (e.g. `BOInventoryResponse`).
- Prefix network helpers with `bo`/`BO` (`BOClient`, `makeBoRequest`, `BORetryPolicy`) to differentiate them from shared marketplace utilities.
- Generate correlation ids with `generateCorrelationId` from `ids.ts` and thread them through every mutating flow, metric, and error.
- Group files by responsibility (`actions.ts`, `schema.ts`, `transformers.ts`, `utilities.ts`) so new endpoints remain discoverable.

## Error Handling Pattern

- Throw `ConvexError` with structured payloads that include `code`, `message`, `httpStatus`, `correlationId`, and optional `retryAfterMs`/`details`.
- Let `client.ts` wrap non-2xx responses with contextual metadata; `errors.ts` should convert them into canonical `StoreOperationError` instances via `normalizeBoStoreError`.
- Validation failures (before calling BrickOwl) should return `StoreOperationResult` with `success: false`. Reserve thrown errors for unexpected cases like credential mismatches or transport failures.

## Working With Domain Modules

- **Inventory**: Wrap create/update/delete flows in `StoreOperationResult`, record metrics for success/failure, and normalize BrickOwl responses before returning to callers.
- **Orders**: Support paginated lists, detail retrieval, and ancillary endpoints (items, notify target). Always validate input with domain schemas first.
- **Notifications**: Split incoming webhook handling into validation, dedupe, and processing (planned parity with BrickLink).

## Adding a New Endpoint

1. Define request/response schemas in the relevant domain module, reusing shared enums from `schema.ts`.
2. Implement a Convex action that:
   - Parses input with the new schema.
   - Calls `client.request`/`client.requestWithRetry` with a correlation id.
   - Validates the upstream response before returning or persisting data.
3. For writes, normalize BrickOwl failures with `normalizeBoStoreError` and return `StoreOperationResult`.
4. Update or add tests/mocks to cover the new flow.

## Local Testing & Tooling

- Use the Convex MCP server to inspect tables and functions while developing.
- Run `pnpm test:backend` after modifying actions or shared helpers.
- Capture metrics locally to verify `external.brickowl.*` events before deploying.
