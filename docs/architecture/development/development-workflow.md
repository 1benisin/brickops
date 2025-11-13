# Development Workflow

## Local Development Setup

### Prerequisites

```bash
# Install deps
pnpm install

# Run unit/integration locally
pnpm test:coverage

# Optional: run E2E locally when touching auth/routing/hydration
pnpm exec playwright install
pnpm build && pnpm start &
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=chromium-desktop
```

## CI Strategy

- Lint, unit, and integration tests run on each PR and push to main.
- E2E is not part of default CI. Use the "E2E" workflow manually or wait for the weekly scheduled run.

## When to run E2E

Run Playwright locally or via workflow when changes affect:

- Authentication / sessions / redirects
- Next.js routing or middleware
- Hydration-sensitive UI changes
- Critical flows (signup, login, dashboard load)

## Catalog Data Seeding

1. Export the latest Bricklink XML datasets (parts, categories, codes) and place them in `docs/external-documentation/api-bricklink/seed-data/` alongside `bin_lookup_v3.json`.
2. Convert XML to JSONL with the helper scripts:
   ```bash
   pnpm ts-node scripts/catalog/build-catalog.ts --limit 0
   pnpm ts-node scripts/seed/build-colors.ts
   ```
   The outputs (`parts.jsonl`, `categories.jsonl`, `bricklinkElementReference.jsonl`, `colors.jsonl`) are written back to the `seed-data/` directory.
3. Import the generated files into your local Convex deployment:
   ```bash
   npx convex import --table parts docs/external-documentation/api-bricklink/seed-data/parts.jsonl
   npx convex import --table categories docs/external-documentation/api-bricklink/seed-data/categories.jsonl
   npx convex import --table bricklinkElementReference docs/external-documentation/api-bricklink/seed-data/bricklinkElementReference.jsonl
   npx convex import --table colors docs/external-documentation/api-bricklink/seed-data/colors.jsonl
   ```
4. Trigger refresh jobs if you need fresh data immediately (see `convex/crons.ts` or run `internal.catalog.refreshWorker.drainCatalogRefreshOutbox` via the Convex dashboard/CLI).

## Convex Type Sharing (Frontend/Backend)

- Prefer generated types over hand-rolled interfaces.
- Import `Id`/`Doc` from `convex/_generated/dataModel` when referencing tables.
- Derive function result types via Convex references:

```ts
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type SearchResult = FunctionReturnType<typeof api.catalog.searchParts>;
export type CatalogPart = SearchResult["parts"][number];
```

- Share literal unions/enums with validators using `Infer` from `convex/values`:

```ts
import { v } from "convex/values";
type Sort = typeof sortValidator; // validator
export const sortValidator = v.object({
  field: v.union(v.literal("name"), v.literal("marketPrice"), v.literal("lastUpdated")),
  direction: v.union(v.literal("asc"), v.literal("desc")),
});
export type SortState = import("convex/values").Infer<typeof sortValidator>;
```

- Frontend re-exports common types from `src/types/` (e.g., `src/types/catalog.ts`) instead of duplicating shapes.
- If a function becomes paginated, use Convex’s paginated helpers (and derived types) rather than custom shapes.
