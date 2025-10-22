# Data Models

The following core business entities are used across the stack:

## User

- Purpose: Represents users within the multi-tenant business account system with role-based access control
- Key Attributes: id, email, businessAccountId, role, firstName, lastName, isActive, createdAt, lastLoginAt
- Relationships: Belongs to BusinessAccount; can create/modify inventory items; can initiate pick sessions

## BusinessAccount

- Purpose: Tenant isolation boundary for multi-user businesses sharing inventory and orders
- Key Attributes: id, name, ownerId, credentials, subscriptionStatus, createdAt
- Relationships: Has many Users; owns all inventory items and orders; contains API integration settings

## LegoPartCatalog

- Purpose: Central catalog of Lego parts with BrickLink integration
- Key Attributes:
  - partNumber, name, description, category, imageUrl
  - bricklinkPartId, dataSource, dataFreshness, lastUpdated, lastFetchedFromBricklink
  - **Story 2.2 Extension**: `searchKeywords` (lowercased, space-delimited tokens including part numbers, aliases, keywords, and sort location), `primaryColorId`, `availableColorIds[]`, `categoryPath[]`, `sortGrid`, `sortBin`
  - **Derived Metrics**: `marketPrice`, `marketPriceLastSyncedAt`
- Relationships: Referenced by InventoryItems for part identification; linked to Bricklink color/category reference tables via ids
- Source of Truth: Bricklink datasets (API + XML baseline in `docs/external-documentation/bricklink-data` plus BrickOps sort-grid lookup in `bin_lookup_v3.json`)

> Implementation note: the Story 2.2 backlog item requires extending `convex/schema.ts` to add the new search and color fields, plus search indexes covering `partNumber`, `description`, and the new keyword array to satisfy catalog filter requirements.

## BricklinkColorReference

- Purpose: Local cache of Bricklink color taxonomy used for filtering and UI display
- Key Attributes: `colorId`, `name`, `rgbHex`, `type`, `isActive`, `introducedYear`, `retiredYear`
- Relationships: Referenced by `LegoPartCatalog.availableColorIds`
- Seed Source: `colors.xml` baseline file in `docs/external-documentation/bricklink-data`, refreshed via Bricklink `/colors` API when stale

## BricklinkCategoryReference

- Purpose: Local cache of Bricklink category hierarchy
- Key Attributes: `categoryId`, `name`, `parentCategoryId`, `path`
- Relationships: Referenced by `LegoPartCatalog.category` and `categoryPath`
- Seed Source: `categories.xml` baseline file plus Bricklink `/categories` API refreshes

## BricklinkPartColorAvailability

- Purpose: Tracks which colors Bricklink recognizes for each part number
- Key Attributes: `partNumber`, `colorId`, `hasInventory`, `isRetired`, `lastSyncedAt`
- Relationships: Joins `LegoPartCatalog.partNumber` and `BricklinkColorReference.colorId`
- Seed Source: Derived from `Parts.xml` + Bricklink `/items/part/{no}/supersets` & `/priceguide` endpoints, refreshed when part data becomes stale

## BricklinkElementReference

- Purpose: Maps Bricklink part + color combinations to LEGO Element IDs (a.k.a. design numbers) for manufacturing-level traceability
- Key Attributes: `partNumber`, `colorId`, `elementId`, `isActive`, `notes`
- Relationships: Links to `LegoPartCatalog` and `BricklinkColorReference` to expose exact element variants in detail views and exports
- Seed Source: `codes.xml` dataset in `docs/external-documentation/bricklink-data` with updates from Bricklink API element endpoints when available. Maintains multiple element IDs per part-color to reflect historical mold changes tracked by LEGO

## InventoryItem

- Purpose: Tracks actual inventory with status splits, marketplace sync tracking, and audit trail support
- Key Attributes:
  - Basic: sku, name, partNumber, colorId, location, condition (new/used)
  - Quantities: quantityAvailable, quantityReserved, quantitySold
  - Status: status (available/reserved/sold)
  - Marketplace: price, notes, bricklinkInventoryId, brickowlLotId (Stories 3.2-3.3)
  - Sync Status: lastSyncedAt, syncErrors[] (Story 3.4)
  - Audit: createdBy, createdAt, updatedAt
  - Soft Delete: isArchived, deletedAt
- Relationships: Belongs to BusinessAccount; tracked in InventoryHistory and InventorySyncQueue; syncs to marketplaces via marketplace IDs
- Indexes: by_businessAccount, by_sku (duplicate prevention), by_bricklinkInventoryId, by_brickowlLotId (marketplace sync lookups)

## InventoryHistory

- Purpose: Complete audit trail for local inventory changes with quantity deltas (separate from marketplace sync queue)
- Key Attributes:
  - References: businessAccountId, itemId, actorUserId
  - Change Type: changeType (create/update/adjust/delete)
  - Deltas: deltaAvailable, deltaReserved, deltaSold
  - Status Transitions: fromStatus, toStatus
  - Metadata: reason, createdAt
- Relationships: References InventoryItem and User
- Indexes: by_item, by_businessAccount, by_createdAt (for chronological queries)

## InventorySyncQueue (Story 3.4)

- Purpose: Marketplace sync orchestration queue tracking changes pending sync to BrickLink and/or BrickOwl
- Key Attributes:
  - References: businessAccountId, inventoryItemId, createdBy
  - Change Data: changeType (create/update/delete), previousData, newData, reason
  - Multi-Provider Sync: syncStatus, bricklinkSyncedAt, brickowlSyncedAt, bricklinkSyncError, brickowlSyncError
  - Conflict Tracking: conflictStatus, conflictDetails
  - Undo Chain: isUndo, undoesChangeId, undoneByChangeId
  - Tracing: correlationId, createdAt
- Relationships: References InventoryItem; bidirectional undo chain references
- Indexes: by_business_pending (queue processing), by_inventory_item (item history), by_correlation (distributed tracing)

## MarketplaceCredentials (Story 3.1)

- Purpose: User marketplace API credentials (BYOK model) stored encrypted at rest
- Key Attributes:
  - References: businessAccountId, provider (bricklink/brickowl), createdBy
  - BrickLink: bricklinkConsumerKey, bricklinkConsumerSecret, bricklinkTokenValue, bricklinkTokenSecret (all encrypted)
  - BrickOwl: brickowlApiKey (encrypted)
  - Validation: isActive, lastValidatedAt, validationStatus, validationMessage
  - Metadata: createdAt, updatedAt
- Relationships: One per provider per business account; used by marketplace store clients
- Indexes: by_business_provider (primary lookup), by_businessAccount (all credentials per tenant)
- Security: All credential fields encrypted using AES-GCM; never returned in plaintext

## MarketplaceRateLimits (Stories 3.2-3.3)

- Purpose: Database-backed rate limiting for marketplace APIs with circuit breaker support
- Key Attributes:
  - References: businessAccountId, provider (bricklink/brickowl)
  - Quota: windowStart, requestCount, capacity, windowDurationMs
  - Alerting: alertThreshold (0.8), alertEmitted
  - Circuit Breaker: consecutiveFailures, circuitBreakerOpenUntil
  - Metadata: lastRequestAt, lastResetAt, createdAt, updatedAt
- Relationships: One per provider per business account; queried/mutated by marketplace store clients
- Indexes: by_business_provider (primary lookup)
- Implementation: Pre-flight quota check + post-request recording; 24-hour window for BrickLink, 1-minute window for BrickOwl

## MarketplaceOrder, PickSession, TodoItem

- Purpose: Order fulfillment and workflow entities
- Relationships: As defined in schema, supporting audit logs and picking flows

---

## Global Catalog & Tenant Overlays (Update 2025-09-26)

- Catalog/reference datasets (`LegoPartCatalog`, `Bricklink*`) are GLOBAL (shared across tenants; no `businessAccountId`).
- Tenant-specific attributes must live in an overlay table keyed by `(businessAccountId, partNumber)` (e.g., `catalogPartOverlay`) with fields like `tags`, `notes`, `sortGrid`, `sortBin`.
- Inventory remains tenant-scoped and links to the global catalog by `partNumber`.
- Search/browse reads from the global catalog only (overlays are not merged into search results for now).

### CatalogPartOverlay

- Primary Key: implicit Convex `_id`
- Composite identity: `(businessAccountId, partNumber)` via indexes `by_business_part` and `by_businessAccount`
- Attributes:
  - `businessAccountId` — tenant that owns the overlay metadata
  - `partNumber` — reference to the global catalog entry
  - `tags?: string[]`, `notes?: string` — free-form metadata maintained per tenant
  - `sortGrid?: string`, `sortBin?: string` — tenant-specific location overrides
  - `createdBy`, `createdAt`, `updatedAt?` — audit trail
- Authorization: any active member of the tenant may create or update overlays; system APIs never merge overlay data into global catalog reads.
