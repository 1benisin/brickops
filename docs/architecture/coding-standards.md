# Coding Standards

## Critical Rules

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
