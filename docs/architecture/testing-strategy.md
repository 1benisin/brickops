# Testing Strategy

## Testing Pyramid

```text
    E2E Tests (5%)
   /              \
Integration Tests (25%)
/                      \
Frontend Unit (35%)  Backend Unit (35%)
```

**Coverage Goals:**

- 80% unit test coverage
- 60% integration test coverage
- 100% coverage for critical paths (inventory sync, order processing, picking workflows)

## Test Organization

### Frontend Tests

```text
__tests__/
├── components/           # Component unit tests
│   ├── inventory/
│   ├── orders/
│   └── picking/
├── hooks/               # Custom hook tests
├── services/            # API service tests
└── utils/               # Utility function tests
```

### Backend Tests

```text
convex/
├── functions/
│   └── inventory.test.ts    # Function unit tests
└── __tests__/
    ├── integration/         # Cross-function integration tests
    └── api/                 # External API integration tests
```

### E2E Tests

```text
e2e/
├── auth/                # Authentication flows
├── inventory/           # Inventory management workflows
├── orders/              # Order processing end-to-end
└── picking/             # Complete picking session workflows
```

## Execution Policy (CI vs Local/On-Demand)

- CI Pipeline (default): Run unit and integration tests only (`pnpm test:coverage`). This keeps CI fast and reliable.
- E2E (Playwright): Run locally during feature work affecting routing/auth/hydration OR via the on-demand GitHub workflow (`E2E`) or scheduled weekly run. CI does not run E2E on every PR by default.

Rationale: Browser E2E is valuable but heavy. We prioritize fast feedback in CI and reserve E2E for smoke/regression checks when needed.

### Local E2E commands

```bash
pnpm exec playwright install
pnpm build && pnpm start &
PLAYWRIGHT_BASE_URL=http://localhost:3000 pnpm exec playwright test --project=chromium-desktop
```

### GitHub E2E workflow

- Manual trigger: Actions → E2E → Run workflow
- Scheduled: weekly Monday 06:00 UTC

## Test Examples

### Frontend Component Test

```typescript
// __tests__/components/inventory/InventoryCard.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { InventoryCard } from "@/components/inventory/InventoryCard";

const mockConvexClient = new ConvexReactClient("https://test.convex.dev");

describe("InventoryCard", () => {
  const mockItem = {
    id: "123",
    partNumber: "3001",
    colorId: "5",
    location: "A1-B2",
    quantityAvailable: 10,
    condition: "new" as const,
  };

  it("renders inventory item correctly", () => {
    render(
      <ConvexProvider client={mockConvexClient}>
        <InventoryCard item={mockItem} />
      </ConvexProvider>
    );

    expect(screen.getByText("3001")).toBeInTheDocument();
    expect(screen.getByText("A1-B2")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
```

### Backend Function Test

```typescript
// convex/functions/inventory.test.ts
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

test("addInventoryItem creates item with correct data", async () => {
  const t = convexTest(schema);

  const businessAccountId = await t.run(async (ctx) => {
    return await ctx.db.insert("businessAccounts", {
      name: "Test Business",
      ownerId: "user123",
      subscriptionStatus: "active",
      createdAt: Date.now(),
    });
  });

  const itemId = await t.mutation(api.inventory.addInventoryItem, {
    businessAccountId,
    partNumber: "3001",
    colorId: "5",
    location: "A1",
    quantityAvailable: 10,
    condition: "new",
  });

  const item = await t.query(api.inventory.getItem, { itemId });
  expect(item?.partNumber).toBe("3001");
  expect(item?.quantityAvailable).toBe(10);
});
```

### E2E Test

```typescript
// e2e/inventory/add-inventory.spec.ts
import { test, expect } from "@playwright/test";

test("user can add inventory item via camera identification", async ({ page }) => {
  await page.goto("/identify");

  // Mock camera access and part identification
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.resolve(new MediaStream());
  });

  await page.click('[data-testid="capture-button"]');
  await page.waitForSelector('[data-testid="identification-results"]');

  await page.fill('[data-testid="quantity-input"]', "5");
  await page.fill('[data-testid="location-input"]', "A1-B2");
  await page.click('[data-testid="add-to-inventory"]');

  await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
});
```
