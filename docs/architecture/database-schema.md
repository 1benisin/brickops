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
  colorId: v.string(),
  location: v.string(),
  quantityAvailable: v.number(),
  quantityReserved: v.number(),      // Added in Story 1.6
  quantitySold: v.number(),          // Added in Story 1.6
  status: v.union(v.literal("available"), v.literal("reserved"), v.literal("sold")), // Added in Story 1.6
  condition: v.union(v.literal("new"), v.literal("used")),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
  isArchived: v.optional(v.boolean()), // Added in Story 1.6 - soft delete support
  deletedAt: v.optional(v.number()),   // Added in Story 1.6 - soft delete support
})
.index("by_businessAccount", ["businessAccountId"])  // Tenant isolation
.index("by_sku", ["businessAccountId", "sku"]),      // Duplicate prevention
```

### inventoryAuditLogs

**Purpose**: Complete audit trail for inventory changes

```typescript
inventoryAuditLogs: defineTable({
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

## Index Usage Patterns

### Inventory Queries

- **Tenant Isolation**: All queries use `by_businessAccount` index to ensure proper tenant boundaries
- **SKU Uniqueness**: `by_sku` composite index prevents duplicate SKUs within a business account
- **Archived Filtering**: Application-level filtering excludes `isArchived: true` items from standard listings

### Audit Queries

- **Item History**: `by_item` index for viewing change history of specific inventory items
- **Timeline Views**: `by_createdAt` composite index for chronological audit reports
- **Tenant Audit**: `by_businessAccount` index for business-wide audit trail access

## Performance Considerations

1. **Tenant Isolation**: All queries must filter by `businessAccountId` to use indexes effectively
2. **Soft Deletes**: Archived items remain in indexes but are filtered at application level
3. **Audit Scale**: Audit logs grow over time; consider pagination limits (current: 200 max per query)

## Schema Evolution Notes

**Story 1.6 Changes**:

- Added quantity split fields (`quantityReserved`, `quantitySold`) to support status tracking
- Added `status` enum field for inventory state management
- Added soft delete fields (`isArchived`, `deletedAt`) for data preservation
- Created complete `inventoryAuditLogs` table with comprehensive change tracking
- Enhanced indexes for efficient tenant-scoped queries
