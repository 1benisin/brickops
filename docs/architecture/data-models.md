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
- Key Attributes: partNumber, name, category, imageUrl, bricklinkPartId, dataSource, dataFreshness
- Relationships: Referenced by InventoryItems for part identification

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
