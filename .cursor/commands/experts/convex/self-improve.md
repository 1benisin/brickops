# Purpose

Maintain Convex expertise file accuracy by validating against codebase and updating when new patterns are discovered.

## Workflow

1. **Read current expertise file** - Understand existing knowledge
2. **Identify new pattern/knowledge** - What Convex pattern needs documentation?
3. **Validate against codebase** - Check if pattern is used correctly in code
4. **Add to expertise file** - Keep it compact (max 20 lines total)
5. **Format**: Key fact → Code example → Anti-pattern if needed

## Rules

- **Keep it compact** - One line per key fact, minimal code examples
- **Focus on patterns** - Only document reusable Convex-specific patterns
- **No explanations** - Just facts and examples
- **Update, don't duplicate** - If pattern exists, update it; don't add duplicates
- **Include anti-patterns** - Show "Do this" vs "Don't do this" when helpful

## Example

**New knowledge**: "Use `ctx.scheduler.runAfter()` for delayed mutations"

**Add to file**:

```
Delayed mutations: `ctx.scheduler.runAfter(delayMs, api.module.function, args)`
```

If anti-pattern exists:

```
Delayed mutations: `ctx.scheduler.runAfter(delayMs, api.module.function, args)`
Don't: `setTimeout(() => ctx.runMutation(...), delayMs)`
```
