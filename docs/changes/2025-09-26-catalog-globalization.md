# Sprint Change Proposal: Global Catalog + Tenant Overlays (2025-09-26)

## Context

- LEGO parts catalog must be a canonical, shared dataset for all users.
- Current implementation scopes catalog/reference data by `businessAccountId`.
- We will globalize the catalog and move tenant-specific attributes into overlays.

## Decision

- Make catalog and Bricklink reference data GLOBAL (no tenant field).
- Introduce `catalogPartOverlay` keyed by `(businessAccountId, partNumber)` for per-tenant metadata (tags, notes, sort grid/bin).
- Inventory remains tenant-scoped and links to catalog by `partNumber`.

## Scope of Change

- Globalize tables: `legoPartCatalog`, `bricklinkColorReference`, `bricklinkCategoryReference`, `bricklinkPartColorAvailability`, `bricklinkElementReference`.
- Add `catalogPartOverlay` (tenant metadata).
- Update queries to remove tenant filters for global reads (auth remains).
- Seeding is a single global run; remove `--businessAccount`.
- RBAC: global writes restricted to system admins; overlays by tenant members only.

## Data Model Changes

### Global Tables (remove tenant field + tenant indexes)

- Remove `businessAccountId` from the five catalog/reference tables above.
- Update indexes accordingly.

`legoPartCatalog`

- Keep: `partNumber`, `name`, `description?`, `category?`, `categoryPath?`, `categoryPathKey?`, `imageUrl?`,
  `bricklinkPartId?`, `bricklinkCategoryId?`, `searchKeywords?`, `primaryColorId?`, `availableColorIds?`,
  `sortGrid?`, `sortBin?`, `marketPrice?`, `marketPriceCurrency?`, `marketPriceLastSyncedAt?`, `dataSource`,
  `lastUpdated`, `lastFetchedFromBricklink?`, `dataFreshness`, `createdBy`, `createdAt`, `updatedAt?`.
- Indexes:
  - `by_partNumber(partNumber)`
  - `by_category(category)`
  - `by_categoryPathKey(categoryPathKey)`
  - `by_primaryColor(primaryColorId)`
  - `by_sortLocation(sortGrid, sortBin)`
  - `by_dataFreshness(dataFreshness)`
  - `by_lastUpdated(lastUpdated)`
  - Search `search_parts` (searchField: `searchKeywords`, filterFields: `category`, `primaryColorId`, `categoryPathKey`)

`bricklinkColorReference`: `by_colorId(bricklinkColorId)`; search `search_color_name` (filterFields: `colorType`).

`bricklinkCategoryReference`: `by_categoryId(bricklinkCategoryId)`, `by_parent(parentCategoryId)`, `by_pathKey(pathKey)`; search `search_category_name` (filterFields: `parentCategoryId`).

`bricklinkPartColorAvailability`: `by_part(partNumber)`, `by_color(colorId)`.

`bricklinkElementReference`: `by_element(elementId)`, `by_part(partNumber)`, `by_color(colorId)`.

### Tenant Overlay Table

`catalogPartOverlay`

- Fields: `businessAccountId`, `partNumber`, `tags?: string[]`, `notes?: string`, `sortGrid?: string`, `sortBin?: string`, `createdBy`, `createdAt`, `updatedAt?`.
- Indexes: `by_business_part(businessAccountId, partNumber)`, `by_businessAccount(businessAccountId)`.

## API/Function Changes

- Global reads (auth required) remove tenant filters:
  - `searchParts(args)`: no `.eq("businessAccountId", ...)`; keep color/category/freshness filters.
  - `getPartDetails(args)`: query by `partNumber` only; enrich from global references.
  - `getCatalogFilters(args)`: compute from global references.
- Bricklink calls: drop tenant identity key; use neutral/global identity if needed.
- Overlays (separate slice): `upsertOverlay`, `getOverlay` with tenant RBAC.
  - Implemented as `catalog.upsertPartOverlay` and `catalog.getPartOverlay`, enforcing `(businessAccountId, partNumber)` scoping.

## Seeding Changes

- Seed script: remove `--businessAccount`; keep `--dryRun`, `--batchSize`.
- Global mutations:
  - `seedBricklinkColors({ records, clearExisting? })`
  - `seedBricklinkCategories({ records, clearExisting? })`
  - `seedPartColorAvailability({ records, clearExisting? })`
  - `seedElementReferences({ records, clearExisting? })`

## RBAC

- Global catalog writes restricted to system admins.
- Overlays CRUD restricted to org-authenticated users within their tenant.
- `BRICKOPS_SYSTEM_ADMIN_EMAILS` configures the admin allowlist; when unset, tenant owners remain eligible for maintenance flows.

## Migration Plan (Breaking OK)

1. Update schema: globalize tables; add `catalogPartOverlay`.
2. Update functions to remove tenant filters for catalog/reference reads.
3. Update seed mutations and script to global forms; deploy.
4. Run seeding once to populate global data.
5. Validate search and details flows; add overlay CRUD in a follow-up.

## Validation & Testing

- Backend: global reads return without tenant; overlays not included in search.
- E2E: search/browse flows still pass and meet SLA.
- Overlay unit tests: CRUD+RBAC (when implemented).

## Notes

- Inventory remains tenant-scoped and links by `partNumber`.
- Search does not include overlays for now.
