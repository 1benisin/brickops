# Coding Standards

## Core Standards

- **Languages & Runtimes:** TypeScript 5.3.3+ with Node.js 20.11.0 LTS, strict mode enabled (`"strict": true` in tsconfig.json)
- **Style & Linting:** ESLint with `@typescript-eslint/recommended` and Prettier with 80-character line limit
- **Test Organization:** Tests co-located with source files using `.test.ts` suffix, organized by function/component being tested

## Naming Conventions

| Element          | Convention                        | Example                                   |
| ---------------- | --------------------------------- | ----------------------------------------- |
| Convex Functions | camelCase with domain prefix      | `inventoryAddItem`, `ordersProcessPickup` |
| Database Tables  | camelCase singular                | `inventoryItem`, `marketplaceOrder`       |
| React Components | PascalCase with descriptive names | `InventoryItemCard`, `PickSessionModal`   |

## Critical Rules

- **External API Rate Limits:** All external API calls MUST use the rate limiting wrapper functions - never call Brickognize, Bricklink, or Brickowl APIs directly
- **Tenant Isolation:** Every database query MUST filter by `businessAccountId` - no global queries across tenants allowed
- **Real-time Updates:** Use Convex subscriptions (`useQuery`) for all live data - never use polling or manual refresh patterns
- **Error Propagation:** All Convex functions MUST use structured error objects with error codes - never throw raw strings or generic errors
- **Authentication:** All protected functions MUST verify user authentication and business account access at function entry
- **Inventory Ground Truth:** All inventory changes MUST sync to Bricklink API - never update local inventory without external sync
- **File Upload Security:** User uploads MUST be validated for file type and size before storage - use Convex file validation helpers
