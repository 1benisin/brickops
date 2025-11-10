# BrickLink Catalog Client Functional Refactor Plan

## Objectives

- Mirror the stateless helper pattern introduced in `convex/marketplaces/bricklink/storeClient.ts` for all BrickLink catalog interactions.
- Replace the current `BricklinkClient` class with pure functions that accept explicit inputs and return typed results.
- Use BrickOps-managed environment credentials (`BRICKLINK_CONSUMER_KEY`, `BRICKLINK_CONSUMER_SECRET`, `BRICKLINK_ACCESS_TOKEN`, `BRICKLINK_TOKEN_SECRET`) for every BrickLink catalog request.
- Preserve existing mapping, normalization, metrics, and error-handling behavior while reducing surface area (`new BricklinkClient()` is removed).
- Remove bespoke retry logic from catalog requests so failure handling is left to callers.
- Update call sites, documentation, and tests so they consume the new functional API.

## Current State

- `catalogClient.ts` exports a singleton instance of `BricklinkClient` that caches env-derived credentials and exposes instance methods (`request`, `getRefreshedPart`, etc.).
- Request signing, retry/metrics, and error normalization largely duplicate logic that now lives in the stateless store client.
- Downstream workers (e.g., `convex/catalog/refreshWorker.ts`, `convex/marketplaces/bricklink/dataRefresher.ts`) depend on the singleton instance.
- Documentation (`docs/architecture/backend/architecture.md`, flow docs) still references the class-based API.

## High-Level Architecture

1. **Shared HTTP Core**

   - Reuse the stateless primitives from `storeClient.ts` where feasible (OAuth helpers, metrics, error normalization).
   - Introduce a `makeBricklinkCatalogRequest<T>(ctx, options)` function that pulls credentials from env helpers and delegates to a shared `request` primitive.

2. **Credential Loader**

   - Add `loadBricklinkEnvCredentials()` (or similar) that composes `getBricklinkCredentials()` from `convex/lib/external/env` and converts to the OAuth shape expected by existing helpers.
   - Ensure Convex actions/queries can access env vars during runtime (`ctx.env.get` in production, `process.env` fallback in tests).

3. **Resource-Specific Functions**

   - Expose standalone async functions for each catalog operation (`fetchBricklinkColor`, `fetchBricklinkCategory`, `fetchBricklinkPart`, `fetchBricklinkPartColors`, `fetchBricklinkPriceGuide`, `checkBricklinkHealth`).
   - Each function takes a minimal parameter object and returns the mapped domain objects (`mapColor`, `mapCategory`, etc.).

4. **Metrics & Error Handling (No Retries)**

   - Centralize metric emission so every request publishes `external.bricklink.catalog.*` events.
   - Eliminate the current retry/backoff layer; each stateless helper performs a single HTTP attempt and surfaces errors immediately.
   - Surface errors via `normalizeApiError("bricklink", ...)`, maintaining the current error shapes consumed by callers.

5. **Compatibility Layer**
   - Provide an interim `catalogClient` object composed of the new stateless functions (`export const catalogClient = { getRefreshedColor, ... }`) to ease migration.
   - Update call sites to import the individual functions directly once refactor lands; remove the compatibility object in a follow-up.

## Detailed Steps

### 1. Audit Existing Behavior

- Catalogue the existing public methods (`request`, `healthCheck`, `getRefreshedColor`, `getRefreshedCategory`, `getRefreshedPart`, `getRefreshedPartColors`, `getRefreshedPriceGuide`).
- Confirm all transformations performed by the mappers (`mapColor`, `mapCategory`, etc.) and ensure new functions still call them.
- Note current metric names and payloads via `recordMetric`.

### 2. Build Stateless Request Layer

- Extract a `request` helper modeled after `storeClient.ts` that:
  - Accepts `(ctx, credentials, { path, method, query, headers })`.
  - Builds OAuth headers using shared utilities (`generateOAuthParams`, `generateOAuthSignature`, `buildAuthorizationHeader`).
  - Emits metrics, handles non-2xx responses, and returns `{ data, status, headers }` without any retry loop.
- Wire credentials by reading from env via `getBricklinkCredentials()`; avoid caching in module scope so tests can override env values.
- Ensure health-check requests share the same helper to keep behavior consistent.

### 3. Expose Resource Functions

- Implement pure async functions:
  - `getBLColor(ctx, colorId)`
  - `getBLCategory(ctx, categoryId)`
  - `getBLPart(ctx, { itemType, itemNo })`
  - `getBLPartColors(ctx, { itemType, itemNo })`
  - `getBLPriceGuide(ctx, { itemType, itemNo, colorId, guideType, newOrUsed })`
  - `checkBricklinkCatalogHealth(ctx)`
- Each function:
  1. Calls the stateless request helper with proper path/query.
  2. Parses the BrickLink envelope (`meta`, `data`) and maps via existing helpers.
  3. Throws structured errors aligned with current behavior (no retries or silent suppression).

### 4. Update Call Sites

- Replace imports of `catalogClient` singleton with direct function imports in:
  - `convex/catalog/refreshWorker.ts`
  - `convex/marketplaces/bricklink/dataRefresher.ts`
  - Any validation or monitoring helpers (`convex/lib/external/validate.ts`).
- Adjust usage to pass `ctx` (or construct a minimal shim if functions operate outside Convex context, e.g., background workers).
- Remove the exported singleton once all call sites migrate.

### 5. Adjust Documentation & Tests

- Update references in `docs/architecture/backend/architecture.md` and flow docs to describe the new functional API.
- Add/refresh unit tests that hit each function with mocked fetch responses and env credentials.
- Ensure health-check tests exercise the env credential path (use `clearEnvCache` in setup).

### 6. Cleanup & Follow-Up

- Delete the deprecated `BricklinkClient` class and any unused helpers.
- Consider consolidating shared OAuth logic between catalog and store clients into a common module if duplication remains.
- Create follow-up ticket (if needed) to fully remove the temporary compatibility object once all call sites use named exports.

## Risks & Open Questions

- **Environment availability**: Convex actions may require explicit configuration for BrickLink env vars. Verify deployment config before merging.
- **Rate limiting parity**: Confirm whether catalog requests require the same quota enforcement as store requests; if so, reuse the shared quota helper.
- **Backward compatibility**: Ensure no downstream consumers rely on internal `request` shape when migrating to exported functions.

---
