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

## React Testing Best Practices

### Handling Async State Updates

When testing React components with async state updates (especially those using `startTransition`, `useState`, or form submissions), wrap user interactions in `act()` to ensure all state updates complete before assertions:

```typescript
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

it("handles form submission with state updates", async () => {
  const user = userEvent.setup();
  render(<MyForm />);

  // Wrap all user interactions that trigger state updates
  await act(async () => {
    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
  });

  const submitButton = screen.getByRole("button", { name: /submit/i });

  // Wrap form submission separately
  await act(async () => {
    await user.click(submitButton);
  });

  // Use waitFor for assertions that depend on async operations
  await waitFor(() => {
    expect(mockApiCall).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "secret123",
    });
  });
});
```

### Common Patterns

**✅ Do:**

- Wrap user interactions in `act()` when they trigger state updates
- Group related form interactions together in one `act()` block
- Use `waitFor()` for assertions that depend on async operations
- Test loading states and error handling separately

**❌ Don't:**

- Mix form filling and form submission in the same `act()` block
- Assert immediately after async operations without `waitFor()`
- Ignore React warnings about state updates in tests
- Test implementation details instead of user behavior

### Form Testing Template

```typescript
it("processes form submission correctly", async () => {
  const mockSubmit = jest.fn().mockResolvedValue({ success: true });
  const user = userEvent.setup();

  render(<FormComponent onSubmit={mockSubmit} />);

  // 1. Fill out the form (grouped together)
  await act(async () => {
    await user.type(screen.getByLabelText(/name/i), "John Doe");
    await user.type(screen.getByLabelText(/email/i), "john@example.com");
  });

  // 2. Submit the form (separate action)
  await act(async () => {
    await user.click(screen.getByRole("button", { name: /submit/i }));
  });

  // 3. Assert on the results
  await waitFor(() => {
    expect(mockSubmit).toHaveBeenCalledWith({
      name: "John Doe",
      email: "john@example.com",
    });
  });
});
```

## Test Examples

### Frontend Component Test

```typescript
// __tests__/components/inventory/InventoryCard.test.tsx
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("handles quantity update with proper state management", async () => {
    const mockUpdateQuantity = jest.fn();
    const user = userEvent.setup();

    render(
      <ConvexProvider client={mockConvexClient}>
        <InventoryCard item={mockItem} onUpdateQuantity={mockUpdateQuantity} />
      </ConvexProvider>
    );

    // Use act() for user interactions that trigger state updates
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /edit quantity/i }));
      await user.clear(screen.getByLabelText(/quantity/i));
      await user.type(screen.getByLabelText(/quantity/i), "15");
    });

    await act(async () => {
      await user.click(screen.getByRole("button", { name: /save/i }));
    });

    // Wait for async operations to complete
    await waitFor(() => {
      expect(mockUpdateQuantity).toHaveBeenCalledWith("123", 15);
    });
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
