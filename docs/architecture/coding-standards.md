# Coding Standards

## Critical Rules

- **Convex Function Patterns**: Follow the [Convex Function Patterns](./backend-architecture.md#convex-function-patterns-and-best-practices) section strictly:
  - Queries are read-only and pure (no writes, no scheduling)
  - Mutations handle all database writes and scheduling
  - Actions orchestrate external APIs and call mutations to persist
  - Internal functions for server-only building blocks
  - Always await promises (no fire-and-forget)
- External API calls go through service layer with rate limiting
- Never mutate state directly; follow React/Zustand patterns
- Use shared types across frontend/backend
- All Convex functions validate authentication and tenant access
- Use structured error objects and consistent logging

## Naming Conventions

- React Components: PascalCase (e.g., InventoryItemCard)
- Hooks: camelCase with use prefix (e.g., useInventory)
- Database Tables: camelCase singular (Convex tables)
- Routes: App Router conventions

## Testing Standards

- Follow the comprehensive [Testing Strategy](./testing-strategy.md) for all test implementations
- Use `act()` for React state updates and `waitFor()` for async assertions
- Prefer `userEvent` over `fireEvent` for better user simulation
