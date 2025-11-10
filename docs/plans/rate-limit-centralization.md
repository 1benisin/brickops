# Rate Limit Centralization Plan

## Objective

- Consolidate all rate limiting logic, configuration, and Convex functions under `convex/ratelimit`.
- Remove the marketplace-specific rate limit helpers in `convex/marketplaces/shared`.
- Provide a minimal, well-documented API for callers that keeps the implementation simple (KISS).

## Current State

- `convex/ratelimit/` contains a `rateLimits` table definition, a `takeToken` internal mutation, and a provider-aware config map.
- `convex/marketplaces/shared/` duplicates the provider config (`rateLimitConfig.ts`) and exposes a placeholder `rateLimit.ts` wrapper.
- Marketplace mutations and ingestion workflows call into ad-hoc helpers spread across the shared marketplace module.
- Configuration drift is likely because two config files define the same limits.

## Guiding Principles (KISS)

- Keep a single mutation (`takeToken`) as the gateway for consuming rate limit tokens.
- Surface configuration through one source of truth and avoid class wrappers or stateful helpers.
- Buckets remain simple strings (`provider:scope`) so callers can compose identifiers without extra abstractions.

## Proposed Changes

1. **Audit Call Sites**

   - Identify every import of `convex/marketplaces/shared/rateLimitConfig` and `rateLimit` helper usage (orders, ingestion workers, etc.).
   - Confirm how buckets are named today and catalogue provider-specific behaviors (global vs per-account).

2. **Enhance `convex/ratelimit` API**

   - Export `providerValidator`, `Provider`, and `getRateLimitConfig` from `convex/ratelimit/rateLimitConfig.ts` for external use.
   - Add a thin helper (e.g., `useRateLimit(ctx)` or `takeRateLimitToken(ctx, args)`) that simply forwards to the internal mutation; keep it purely functional.
   - Document expected bucket naming conventions inside the helper file (default to business account IDs; reserve a single `brickopsAdmin` bucket for internal use).

3. **Migrate Marketplace Consumers**

   - Update marketplace shared mutations to call the new helper (or invoke `internal.ratelimit.mutations.takeToken` directly).
   - Replace config imports with `convex/ratelimit/rateLimitConfig`.
   - Delete `convex/marketplaces/shared/rateLimitConfig.ts` and `rateLimit.ts` once all references move.

4. **Schema & Logging Review**

   - Ensure existing `rateLimits` table covers all required fields; extend only if a gap appears during migration.
   - Standardize logging (`console.log` vs structured logger) or downgrade to trace-level to keep noise low.

5. **Documentation**
   - Update backend architecture docs to reference the centralized module.
   - Note bucket conventions (business account IDs plus the `brickopsAdmin` exception) and available helpers in `docs/architecture/backend/architecture.md`.

## Open Questions

- Do we need provider-specific alerting hooks beyond the generic `alertThreshold`? If so, consider exposing structured metrics from the helper.
- Are there non-marketplace consumers (e.g., Brickognize) that should also migrate during this pass?
