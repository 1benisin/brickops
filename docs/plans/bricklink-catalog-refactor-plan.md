# BrickLink Catalog Refactor Plan

## Goals

- Simplify BrickLink transport logic while keeping retries, OAuth, and metrics centralized.
- Align catalog data access patterns with other marketplace subdomains (`inventory`, `orders`).
- Reduce duplication in catalog fetch helpers and ensure consistent error normalization.
- Improve discoverability of resource-specific logic (colors, categories, parts, price guides).

## Current Pain Points

- `convex/marketplaces/bricklink/transport.ts` mixes transport concerns with catalog fetchers and health checks, leading to a 760-line file.
- Catalog helpers (`fetchBlColor`, `fetchBlPriceGuide`, etc.) live outside the `catalog/` folder, unlike other subdomains.
- Multiple helpers duplicate the `makeBlCatalogRequest` + `parseEnvelope` pattern and return heterogeneous types.
- Error handling patterns drift from the conventions documented in `convex/marketplaces/bricklink/README.md`.

## Target Architecture

1. **Transport Layer (`client.ts` or rename to `transport.ts`)**
   - Owns shared OAuth signing, credential lookup, correlation IDs, retries, and rate limiting.
   - Exposes `withBlClient`, `makeBlRequest`, and `makeBlCatalogRequest`.
   - No longer exports catalog-specific helpers.
2. **Catalog Subdomains (`catalog/{resource}/`)**
   - Create dedicated folders for each BrickLink resource (e.g. `catalog/colors/`—including part color listings, `catalog/categories/`, `catalog/parts/`, `catalog/priceGuides/`).
   - Mirror the inventory pattern: each folder owns its `actions.ts`, `schema.ts`, and `transformers.ts`.
   - Keep resource-specific helpers (e.g. `getColor`, `refreshPriceGuide`) inside their `actions.ts`, exporting them directly (no barrel re-exports).
3. **Shared Utilities**
   - Introduce a generic `requestCatalogResource` helper to remove repeated envelope parsing.
   - Standardize error normalization (re-use `normalizeApiError` + `buildBlError` paths).
4. **Call-Site Consumption**
   - Update Convex actions and refresh workflows to import resource helpers directly from their modules.
   - Decide whether any thin wrapper (non-barrel) is still needed for ergonomics.

## Workstreams & Tasks

### Phase 1 – Transport Cleanup

- [x] Rename `client.ts` to `transport.ts` (or introduce an alias) and update imports.
- [x] Trim catalog-specific exports from the transport layer.
- [x] Ensure README references updated filenames and responsibilities.

### Phase 2 – Catalog Subdomain Modules

- [x] Create `convex/marketplaces/bricklink/colors/` (covering both color metadata and part-color lookups), `categories/`, `parts/`, `priceGuides/`.
- [x] Split each folder into `actions.ts`, `schema.ts`, and `transformers.ts`, following the existing inventory layout.
- [x] Migrate current helpers into the appropriate `actions.ts` files and colocate schemas/transformers.
- [x] Fold existing part-color helpers into the colors subdomain and extend its schema/transformers accordingly.
- [x] Extract a shared catalog request helper (e.g. `catalog/shared/request.ts`) for the `makeBlCatalogRequest` + envelope parsing pattern.
- [x] Export inferred types from each resource `schema.ts` and reference them in the associated actions.

### Phase 3 – Call-Site Updates

- [x] Update existing catalog call sites to import helpers directly from their resource modules.
- [x] Remove the legacy `catalogClient` object.
- [x] Document preferred import paths to avoid future barrel creation.

### Phase 4 – Consistency & Documentation

- [x] Confirm error payloads and metrics align with patterns used in `inventory` and `orders`.
- [x] Update `convex/marketplaces/bricklink/README.md` data access section with new module structure.
- [x] Add tests or adjust existing ones covering catalog refresh flows after refactor.

## Testing & Validation

- Run `pnpm lint` and `pnpm test:backend` after restructuring.
- Execute catalog refresh workflows (`convex/catalog/refreshWorker.ts`) to ensure no runtime regressions.

## Risks & Mitigations

- **Risk**: Wide-reaching import updates could introduce subtle circular dependencies.  
  **Mitigation**: Refactor in phases, update imports module-by-module, and leverage TypeScript compiler errors.
- **Risk**: Changing file locations may break existing deep imports.  
  **Mitigation**: Audit usages with TypeScript errors and update paths systematically.

## Open Questions

- Should transport helpers move to `marketplaces/shared` for reuse by other providers?
- Do we want to keep an object-style `catalogClient`, or rely solely on direct helper imports?
- Are there catalog workflows that expect `StoreOperationResult` responses instead of direct objects?
