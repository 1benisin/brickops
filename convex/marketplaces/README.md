# Marketplaces Module

The marketplaces directory owns every integration with third-party store APIs (currently BrickLink and BrickOwl) plus the shared infrastructure that keeps provider implementations aligned. Use this guide to understand the patterns, shared services, and expectations before contributing new functionality.

## Directory Layout

- `bricklink/` – BrickLink-specific actions, schemas, transformers, and orchestration helpers.
- `brickowl/` – BrickOwl-specific modules mirroring the BrickLink structure.
- `shared/` – Cross-provider utilities for credentials, rate limiting, store operation types, webhook helpers, and marketplace-agnostic schemas.

Read the provider-specific READMEs (`bricklink/README.md`, `brickowl/README.md`) after this overview for concrete naming conventions and data-flow walkthroughs.

## Core Principles

- **Convex boundaries** – Follow the action/query/mutation split from `docs/architecture/backend/architecture.md`. Actions (or `internalAction`s) own network calls, queries stay pure, and mutations only persist state produced by actions.
- **Shared contract first** – Reuse the helpers in `marketplaces/shared` (credentials, rate limits, store operation types) instead of duplicating logic in provider directories.
- **Typed-by-validator** – Define Zod schemas next to each feature, export inferred types, and import those types across both backend and frontend code. Validators are the source of truth.
- **Structured errors & observability** – Throw `ConvexError` payloads with `code`, `message`, `httpStatus`, and `correlationId`. Emit `external.<provider>.*` metrics for every upstream call using correlation ids for traceability.
- **Consistency across providers** – Mirror patterns between BrickLink and BrickOwl modules so future providers can follow the same blueprint.

## Shared Marketplace Services

- `credentials.ts` / `credentialHelpers.ts` – Encryption, lookup, and validation for marketplace credentials. Always fetch credentials through these utilities using `businessAccountId`.
- `storeTypes.ts` – Canonical `StoreOperationResult` and store error payloads; use these return types for every mutating flow.
- `rateLimits.ts` / `rateLimitHelpers.ts` – Shared bucket naming and helper utilities consumed by provider-specific rate limit modules. Reference these when creating new throttles.
- `schema.ts` / `credentialTypes.ts` – Marketplace-agnostic enums, validators, and type exports.
- `auth.ts` – Assertions for environment and request provenance used by webhook handlers and authenticated entrypoints.
- `webhooks.ts` / `webhookTokens.ts` – Shared webhook token lifecycle helpers leveraged by provider notification modules.

## Contribution Workflow

1. **Discover requirements** – Review the relevant initiative in `docs/plans/` (for example `docs/plans/brickowl-service-testing-plan.md`) and the corresponding marketplace flows in `docs/flows/`.
2. **Study existing flows** – Read the provider README and inspect analogous actions or transformers before adding new ones.
3. **Plan the schema** – Define request/response validators (and inferred types) alongside the feature, reusing shared enums wherever possible.
4. **Implement the action** – Wrap upstream calls with the provider transport (`withBlClient`, `withBoClient`), enforce rate limits, and return validated data or `StoreOperationResult`.
5. **Persist via mutations** – Persist upstream data only after it passes schema validation, keeping mutations free of network calls.
6. **Record observability** – Emit metrics, propagate correlation ids, and normalize errors with shared helpers (`normalizeBlStoreError`, `normalizeBoStoreError`).
7. **Test** – Add or update tests following `docs/architecture/development/testing-strategy.md`.

## Testing & Verification

- Run `pnpm test:backend` after backend changes; add targeted tests for new actions, mutations, or helpers.
- Use the Convex MCP server to inspect tables, view logs, and confirm that newly added functions are registered as expected.

## Additional Resources

- `docs/architecture/development/development-workflow.md` – Development process, tooling, and CI expectations.
- `docs/architecture/backend/architecture.md` – Detailed guidance on Convex patterns used across the backend.
- Provider READMEs (`bricklink/README.md`, `brickowl/README.md`) – Naming conventions, data flows, and error handling specifics for each service.
- Shared marketplace utilities in `marketplaces/shared` – Source of truth for cross-provider helpers.

Following these guidelines keeps marketplace integrations consistent, observable, and safe to extend as we onboard additional providers.
