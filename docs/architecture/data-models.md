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

- Purpose: Tracks actual inventory with status splits and audit trail support
- Key Attributes:
  - Basic: sku, name, colorId, location, condition (new/used)
  - Quantities: quantityAvailable, quantityReserved, quantitySold
  - Status: status (available/reserved/sold)
  - Audit: createdBy, createdAt, updatedAt
  - Soft Delete: isArchived, deletedAt
- Relationships: Belongs to BusinessAccount; tracked in InventoryAuditLogs
- Indexes: by_businessAccount, by_sku (for duplicate prevention)

## InventoryAuditLogs

- Purpose: Complete audit trail for all inventory changes with quantity deltas
- Key Attributes:
  - References: businessAccountId, itemId, actorUserId
  - Change Type: changeType (create/update/adjust/delete)
  - Deltas: deltaAvailable, deltaReserved, deltaSold
  - Status Transitions: fromStatus, toStatus
  - Metadata: reason, createdAt
- Relationships: References InventoryItem and User
- Indexes: by_item, by_businessAccount, by_createdAt (for chronological queries)

## MarketplaceOrder, PickSession, TodoItem

- Purpose: Order fulfillment and workflow entities
- Relationships: As defined in schema, supporting audit logs and picking flows
