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

- Before working on catalog stories, run the Bricklink bootstrap script (to be added under `scripts/`) that parses XML exports in `docs/external-documentation/bricklink-data/` plus the `bin_lookup_v3.json` sort lookup and populates Convex tables for parts, colors, categories, element references, part-color availability, and sort locations.
- Seed data should be committed to the local Convex deployment so developers can iterate without immediate Bricklink API access.
- Refresh jobs can be triggered manually by invoking the corresponding Convex cron once schema changes land; document the exact command alongside the script when implemented.

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
