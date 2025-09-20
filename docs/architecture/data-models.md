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

## LegoPartCatalog, InventoryItem, MarketplaceOrder, PickSession, TodoItem

- Purpose: Central catalog and operational entities for inventory and order workflows
- Relationships: As defined in schema, supporting audit logs and picking flows
