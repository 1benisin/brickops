# Database Schema

## Core Schema Overview

The database schema is defined in `convex/schema.ts` using Convex's type-safe schema definition system.

## Key Tables and Indexes

### legoPartCatalog (Upcoming Story 2.2 Enhancements)

**Purpose**: Central catalog cache seeded from Bricklink XML exports and kept fresh via scheduled API refreshes

```typescript
legoPartCatalog: defineTable({
  businessAccountId: v.id("businessAccounts"),
  partNumber: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  category: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  bricklinkPartId: v.optional(v.string()),
  dataSource: v.union(v.literal("brickops"), v.literal("bricklink"), v.literal("manual")),
  searchKeywords: v.string(), // space-delimited normalized tokens
  primaryColorId: v.optional(v.string()),
  availableColorIds: v.array(v.string()),
  categoryPath: v.array(v.string()),
  sortGrid: v.optional(v.string()),
  sortBin: v.optional(v.number()),
  marketPrice: v.optional(v.number()),
  marketPriceLastSyncedAt: v.optional(v.number()),
  lastUpdated: v.number(),
  lastFetchedFromBricklink: v.optional(v.number()),
  dataFreshness: v.union(v.literal("fresh"), v.literal("stale"), v.literal("expired")),
})
  .index("by_businessAccount", ["businessAccountId"])
  .index("by_partNumber", ["businessAccountId", "partNumber"])
  .index("by_category", ["businessAccountId", "category"])
  .index("by_dataFreshness", ["businessAccountId", "dataFreshness"])
  .searchIndex("search_parts", {
    searchField: "searchKeywords",
    filterFields: ["businessAccountId", "category", "primaryColorId", "sortGrid"],
  });
```

### bricklinkColorReference / bricklinkCategoryReference / bricklinkElementReference

**Purpose**: Reference datasets seeded from `colors.xml`, `categories.xml`, and `codes.xml`, refreshed weekly via Bricklink API jobs

```typescript
bricklinkColorReference: defineTable({
  colorId: v.string(),
  name: v.string(),
  rgbHex: v.optional(v.string()),
  type: v.optional(v.string()),
  introducedYear: v.optional(v.number()),
  retiredYear: v.optional(v.number()),
  lastSyncedAt: v.number(),
}).index("by_colorId", ["colorId"]);

bricklinkCategoryReference: defineTable({
  categoryId: v.string(),
  name: v.string(),
  parentCategoryId: v.optional(v.string()),
  path: v.array(v.string()),
  lastSyncedAt: v.number(),
}).index("by_categoryId", ["categoryId"]);

bricklinkElementReference: defineTable({
  partNumber: v.string(),
  colorId: v.string(),
  elementId: v.string(),
  isActive: v.optional(v.boolean()),
  lastSyncedAt: v.number(),
})
  .index("by_part_color", ["partNumber", "colorId"])
  .index("by_elementId", ["elementId"]);
```

### bricklinkPartColorAvailability

**Purpose**: Tracks available colors per part including Bricklink inventory insights and retirement status

```typescript
bricklinkPartColorAvailability: defineTable({
  partNumber: v.string(),
  colorId: v.string(),
  hasInventory: v.optional(v.boolean()),
  isRetired: v.optional(v.boolean()),
  lastSyncedAt: v.number(),
})
  .index("by_partNumber", ["partNumber"])
  .index("by_colorId", ["colorId"]);
```

### inventoryItems

**Purpose**: Core inventory tracking with status splits and audit support

```typescript
inventoryItems: defineTable({
  businessAccountId: v.id("businessAccounts"),
  sku: v.string(),
  name: v.string(),
  partNumber: v.string(),              // Added in Stories 3.2-3.3 - BrickLink/BrickOwl part number
  colorId: v.string(),
  location: v.string(),
  quantityAvailable: v.number(),
  quantityReserved: v.number(),        // Added in Story 1.6
  quantitySold: v.number(),            // Added in Story 1.6
  status: v.union(v.literal("available"), v.literal("reserved"), v.literal("sold")), // Added in Story 1.6
  condition: v.union(v.literal("new"), v.literal("used")),
  price: v.optional(v.number()),       // Added in Stories 3.2-3.3 - Unit price for marketplace sync
  notes: v.optional(v.string()),       // Added in Stories 3.2-3.3 - Description/remarks from marketplace
  bricklinkLotId: v.optional(v.number()), // Added in Story 3.2 - BrickLink inventory_id for sync tracking
  brickowlLotId: v.optional(v.string()),        // Added in Story 3.3 - BrickOwl lot_id for sync tracking
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  isArchived: v.optional(v.boolean()), // Added in Story 1.6 - soft delete support
  deletedAt: v.optional(v.number()),   // Added in Story 1.6 - soft delete support
  // Sync status tracking (Story 3.4)
  lastSyncedAt: v.optional(v.number()),
  syncErrors: v.optional(v.array(v.object({
    provider: v.string(),
    error: v.string(),
    occurredAt: v.number(),
  }))),
})
.index("by_businessAccount", ["businessAccountId"])              // Tenant isolation
.index("by_sku", ["businessAccountId", "sku"])                   // Duplicate prevention
.index("by_bricklinkLotId", ["businessAccountId", "bricklinkLotId"])  // BrickLink sync lookup
.index("by_brickowlLotId", ["businessAccountId", "brickowlLotId"]),              // BrickOwl sync lookup
```

### inventoryHistory

**Purpose**: Complete audit trail for all local inventory changes (compliance/historical record)

```typescript
inventoryHistory: defineTable({
  businessAccountId: v.id("businessAccounts"),
  itemId: v.id("inventoryItems"),
  changeType: v.union(
    v.literal("create"),
    v.literal("update"),
    v.literal("adjust"),
    v.literal("delete"),
  ),
  deltaAvailable: v.optional(v.number()),  // Quantity change tracking
  deltaReserved: v.optional(v.number()),   // Quantity change tracking
  deltaSold: v.optional(v.number()),       // Quantity change tracking
  fromStatus: v.optional(v.union(v.literal("available"), v.literal("reserved"), v.literal("sold"))),
  toStatus: v.optional(v.union(v.literal("available"), v.literal("reserved"), v.literal("sold"))),
  actorUserId: v.id("users"),
  reason: v.optional(v.string()),
  createdAt: v.number(),
})
.index("by_item", ["itemId"])                                    // Per-item history
.index("by_businessAccount", ["businessAccountId"])             // Tenant-wide audit
.index("by_createdAt", ["businessAccountId", "createdAt"]),     // Chronological queries
```

### inventorySyncQueue (Story 3.4)

**Purpose**: Marketplace sync orchestration queue (work items pending sync to marketplaces)

```typescript
inventorySyncQueue: defineTable({
  businessAccountId: v.id("businessAccounts"),
  inventoryItemId: v.id("inventoryItems"),
  changeType: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),

  // Change data snapshots
  previousData: v.optional(v.any()),  // Full previous state (for update/delete)
  newData: v.optional(v.any()),       // Full new state (for create/update)
  reason: v.optional(v.string()),     // User-provided reason

  // Multi-provider sync tracking
  syncStatus: v.union(
    v.literal("pending"),
    v.literal("syncing"),
    v.literal("synced"),
    v.literal("failed"),
  ),
  bricklinkSyncedAt: v.optional(v.number()),
  brickowlSyncedAt: v.optional(v.number()),
  bricklinkSyncError: v.optional(v.string()),
  brickowlSyncError: v.optional(v.string()),

  // Conflict tracking
  conflictStatus: v.optional(v.union(v.literal("detected"), v.literal("resolved"))),
  conflictDetails: v.optional(v.any()),

  // Undo tracking
  isUndo: v.optional(v.boolean()),
  undoesChangeId: v.optional(v.id("inventorySyncQueue")),
  undoneByChangeId: v.optional(v.id("inventorySyncQueue")),

  // Metadata
  correlationId: v.string(),
  createdBy: v.id("users"),
  createdAt: v.number(),
})
.index("by_business_pending", ["businessAccountId", "syncStatus"])  // Sync queue queries
.index("by_inventory_item", ["inventoryItemId", "createdAt"])       // Item sync history
.index("by_correlation", ["correlationId"]),                        // Distributed tracing
```

### marketplaceCredentials (Story 3.1)

**Purpose**: User marketplace API credentials (BYOK model) - encrypted at rest

```typescript
marketplaceCredentials: defineTable({
  businessAccountId: v.id("businessAccounts"),
  provider: v.union(v.literal("bricklink"), v.literal("brickowl")),

  // Encrypted OAuth 1.0a credentials for BrickLink
  bricklinkConsumerKey: v.optional(v.string()),     // encrypted
  bricklinkConsumerSecret: v.optional(v.string()),  // encrypted
  bricklinkTokenValue: v.optional(v.string()),      // encrypted
  bricklinkTokenSecret: v.optional(v.string()),     // encrypted

  // Encrypted API key for BrickOwl
  brickowlApiKey: v.optional(v.string()),           // encrypted

  // Metadata
  isActive: v.boolean(),
  lastValidatedAt: v.optional(v.number()),
  validationStatus: v.optional(v.union(
    v.literal("success"),
    v.literal("pending"),
    v.literal("failed")
  )),
  validationMessage: v.optional(v.string()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_business_provider", ["businessAccountId", "provider"])  // Primary lookup
.index("by_businessAccount", ["businessAccountId"]),               // All credentials per tenant
```

### marketplaceRateLimits (Stories 3.2-3.3)

**Purpose**: Per-tenant, per-provider rate limiting for marketplace APIs with circuit breaker support

```typescript
marketplaceRateLimits: defineTable({
  businessAccountId: v.id("businessAccounts"),
  provider: v.union(v.literal("bricklink"), v.literal("brickowl")),

  // Quota tracking
  windowStart: v.number(),        // Unix timestamp when current window started
  requestCount: v.number(),       // Requests made in current window
  capacity: v.number(),           // Max requests per window (provider-specific)
  windowDurationMs: v.number(),   // Window size in ms (provider-specific)

  // Alerting
  alertThreshold: v.number(),     // Percentage (0-1) to trigger alert (default: 0.8)
  alertEmitted: v.boolean(),      // Whether alert has been sent for current window

  // Circuit breaker
  consecutiveFailures: v.number(),              // Track failures for circuit breaker
  circuitBreakerOpenUntil: v.optional(v.number()), // If set, circuit is open

  // Metadata
  lastRequestAt: v.number(),
  lastResetAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index("by_business_provider", ["businessAccountId", "provider"]),  // Primary lookup
```

### orders / orderItems / orderNotifications (Unified Marketplace Orders)

**Purpose**: Normalized order storage that supports multiple marketplaces (BrickLink, BrickOwl) with shared picking workflows and ingestion telemetry.

```typescript
orders: defineTable({
  businessAccountId: v.id("businessAccounts"),
  provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  orderId: v.string(), // Canonical cross-provider identifier
  externalOrderKey: v.optional(v.string()), // Provider-specific key when different
  dateOrdered: v.number(),
  dateStatusChanged: v.optional(v.number()),
  status: v.union(
    v.literal("PENDING"),
    v.literal("UPDATED"),
    v.literal("PROCESSING"),
    v.literal("READY"),
    v.literal("PAID"),
    v.literal("PACKED"),
    v.literal("SHIPPED"),
    v.literal("RECEIVED"),
    v.literal("COMPLETED"),
    v.literal("CANCELLED"),
    v.literal("HOLD"),
    v.literal("ARCHIVED"),
  ),
  providerStatus: v.optional(v.string()), // Raw status for auditing/debugging
  buyerName: v.optional(v.string()),
  buyerEmail: v.optional(v.string()),
  buyerOrderCount: v.optional(v.number()),
  storeName: v.optional(v.string()),
  sellerName: v.optional(v.string()),
  remarks: v.optional(v.string()),
  totalCount: v.optional(v.number()),
  lotCount: v.optional(v.number()),
  totalWeight: v.optional(v.number()),
  paymentMethod: v.optional(v.string()),
  paymentCurrencyCode: v.optional(v.string()),
  paymentDatePaid: v.optional(v.number()),
  paymentStatus: v.optional(v.string()),
  shippingMethod: v.optional(v.string()),
  shippingMethodId: v.optional(v.string()),
  shippingTrackingNo: v.optional(v.string()),
  shippingTrackingLink: v.optional(v.string()),
  shippingDateShipped: v.optional(v.number()),
  shippingAddress: v.optional(v.string()), // Stored as JSON string
  costCurrencyCode: v.optional(v.string()),
  costSubtotal: v.optional(v.number()),
  costGrandTotal: v.optional(v.number()),
  costSalesTax: v.optional(v.number()),
  costFinalTotal: v.optional(v.number()),
  costInsurance: v.optional(v.number()),
  costShipping: v.optional(v.number()),
  costCredit: v.optional(v.number()),
  costCoupon: v.optional(v.number()),
  providerData: v.optional(v.any()), // Raw snapshot for reconciliation
  lastSyncedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_business_order", ["businessAccountId", "orderId"])
  .index("by_business_provider_order", ["businessAccountId", "provider", "orderId"])
  .index("by_business_status", ["businessAccountId", "status"])
  .index("by_business_date", ["businessAccountId", "dateOrdered"])
  .index("by_business_paymentStatus", ["businessAccountId", "paymentStatus"])
  .index("by_business_provider_date", ["businessAccountId", "provider", "dateOrdered"])
  .searchIndex("search_orders_orderId", {
    searchField: "orderId",
    filterFields: ["businessAccountId", "provider"],
  })
  .searchIndex("search_orders_buyerName", {
    searchField: "buyerName",
    filterFields: ["businessAccountId", "provider"],
  })
  .searchIndex("search_orders_paymentMethod", {
    searchField: "paymentMethod",
    filterFields: ["businessAccountId", "provider"],
  })
  .searchIndex("search_orders_shippingMethod", {
    searchField: "shippingMethod",
    filterFields: ["businessAccountId", "provider"],
  });

orderItems: defineTable({
  businessAccountId: v.id("businessAccounts"),
  provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  orderId: v.string(),
  providerOrderKey: v.optional(v.string()), // Useful for BrickOwl composite keys
  providerItemId: v.optional(v.string()),
  itemNo: v.string(),
  itemName: v.optional(v.string()),
  itemType: v.optional(v.string()),
  itemCategoryId: v.optional(v.number()),
  colorId: v.optional(v.number()),
  colorName: v.optional(v.string()),
  quantity: v.number(),
  condition: v.optional(v.string()),
  completeness: v.optional(v.string()),
  unitPrice: v.optional(v.number()),
  unitPriceFinal: v.optional(v.number()),
  currencyCode: v.optional(v.string()),
  remarks: v.optional(v.string()),
  description: v.optional(v.string()),
  weight: v.optional(v.number()),
  location: v.optional(v.string()),
  status: v.union(
    v.literal("picked"),
    v.literal("unpicked"),
    v.literal("skipped"),
    v.literal("issue"),
  ),
  providerData: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_order", ["businessAccountId", "orderId"])
  .index("by_business_item", ["businessAccountId", "itemNo", "colorId"])
  .index("by_business_provider_order", ["businessAccountId", "provider", "orderId"]);

orderNotifications: defineTable({
  businessAccountId: v.id("businessAccounts"),
  provider: v.union(v.literal("bricklink"), v.literal("brickowl")),
  eventType: v.string(),
  resourceId: v.string(),
  timestamp: v.number(),
  occurredAt: v.number(),
  dedupeKey: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("dead_letter"),
  ),
  attempts: v.number(),
  lastError: v.optional(v.string()),
  processedAt: v.optional(v.number()),
  payloadSnapshot: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_business_provider_status", ["businessAccountId", "provider", "status"])
  .index("by_dedupe", ["dedupeKey"])
  .index("by_business_created", ["businessAccountId", "createdAt"]);
```

### Migration Notes (BrickLink → Unified Orders)

- `bricklinkOrders`, `bricklinkOrderItems`, and `bricklinkNotifications` remain in the schema temporarily while backfill jobs migrate historical data into the new normalized tables.
- Backfill strategy:
  1. For each business account, iterate `bricklinkOrders` sorted by `dateOrdered`, transform to the normalized shape, and insert into `orders`/`orderItems` using idempotent upsert mutations.
  2. Once all records are migrated, freeze writes to legacy tables, verify downstream queries have switched to the new tables, and drop legacy definitions in a subsequent release.
- During the transition, ingestion and UI code operate on the new tables; backfill jobs are safe to run multiple times thanks to `orders` `by_business_provider_order` index coupled with deterministic upsert keys.

## Index Usage Patterns

### Inventory Queries

- **Tenant Isolation**: All queries use `by_businessAccount` index to ensure proper tenant boundaries
- **SKU Uniqueness**: `by_sku` composite index prevents duplicate SKUs within a business account
- **Archived Filtering**: Application-level filtering excludes `isArchived: true` items from standard listings

### Audit Queries

- **Item History**: `by_item` index on `inventoryHistory` for viewing change history of specific inventory items
- **Timeline Views**: `by_createdAt` composite index for chronological audit reports
- **Tenant Audit**: `by_businessAccount` index for business-wide audit trail access

### Marketplace Tables (Stories 3.1-3.3)

**Credentials Isolation**:

- `by_business_provider` index on `marketplaceCredentials` ensures one credential set per provider per tenant
- Supports zero, one, or both marketplaces configured independently

**Rate Limit Isolation**:

- `by_business_provider` index on `marketplaceRateLimits` provides per-tenant, per-provider quota tracking
- BrickLink and BrickOwl quotas are completely independent

### Sync Queue Queries (Story 3.4)

- **Pending Sync**: `by_business_pending` index on `inventorySyncQueue` for fetching items needing marketplace sync
- **Item Sync History**: `by_inventory_item` index for viewing sync status per item
- **Distributed Tracing**: `by_correlation` index for tracing changes through the sync pipeline

## Performance Considerations

1. **Tenant Isolation**: All queries must filter by `businessAccountId` to use indexes effectively
2. **Soft Deletes**: Archived items remain in indexes but are filtered at application level
3. **Audit Scale**: History logs grow over time; consider pagination limits (current: 200 max per query)
4. **Sync Queue**: `inventorySyncQueue` is actively updated with sync status; queries are real-time reactive

## Schema Evolution Notes

**Story 1.6 Changes**:

- Added quantity split fields (`quantityReserved`, `quantitySold`) to support status tracking
- Added `status` enum field for inventory state management
- Added soft delete fields (`isArchived`, `deletedAt`) for data preservation
- Created complete `inventoryHistory` table with comprehensive change tracking
- Enhanced indexes for efficient tenant-scoped queries

**Story 3.1 Changes (Marketplace Credentials)**:

- Created `marketplaceCredentials` table for encrypted user marketplace API credentials (BYOK model)
- Supports BrickLink OAuth 1.0a credentials (4 fields) and BrickOwl API key (1 field)
- One credential set per provider per business account via `by_business_provider` index
- All credential fields stored encrypted at rest using AES-GCM

**Story 3.2-3.3 Changes (Marketplace Clients)**:

- Created `marketplaceRateLimits` table for database-backed rate limiting per tenant per provider
- Extended `inventoryItems` with marketplace sync fields: `partNumber`, `price`, `notes`, `bricklinkLotId`, `brickowlLotId`
- Added indexes `by_bricklinkLotId` and `by_brickowlLotId` for efficient sync lookups
- Rate limiting supports circuit breaker pattern (opens after 5 failures) with 80% alert threshold

**Story 3.4 Changes (Sync Orchestration)**:

- Created `inventorySyncQueue` table for marketplace sync orchestration with per-provider status tracking
- Extended `inventoryItems` with quick sync status fields: `lastSyncedAt`, `syncErrors` array
- Sync queue supports: multi-provider sync (BrickLink + BrickOwl), conflict detection, undo tracking
- Indexes enable efficient queue processing, item history queries, and distributed tracing via correlation IDs
