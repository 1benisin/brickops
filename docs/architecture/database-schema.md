# Database Schema

## Core Schema Overview

The database schema is defined in `convex/schema.ts` using Convex's type-safe schema definition system.

## Key Tables and Indexes

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
