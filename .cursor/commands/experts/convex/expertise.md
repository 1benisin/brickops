# Convex Type Utilities

No `FunctionArgs` - use `Infer<typeof validator>` from validators.ts

**Document inserts**: `WithoutSystemFields<Doc<"table">>` not `Omit`

**Function returns**: `FunctionReturnType<typeof api.module.function>`

```typescript
// Args: Infer<typeof validator>
// Inserts: WithoutSystemFields<Doc<"table">>
// Returns: FunctionReturnType<typeof api.module.function>
```
