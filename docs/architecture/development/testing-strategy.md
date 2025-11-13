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
__tests__/frontend/
├── app/
│   ├── dashboard-page.test.tsx
│   ├── identify-page.test.tsx
│   └── inventory-page.test.tsx
├── auth/
│   ├── login-page.test.tsx
│   └── signup-page.test.tsx
├── components/
│   ├── inventory/
│   │   └── inventory-card.test.tsx
│   ├── layout/
│   │   ├── app-navigation.test.tsx
│   │   └── authenticated-header.test.tsx
│   └── ui/
│       ├── button.test.tsx
│       └── theme-toggle.test.tsx
├── home-page.test.tsx
└── lib/
    └── env.test.ts
```

Focus on the page-level suites (`app/`) when you touch routing or data wiring, and keep component tests scoped to narrow behaviours. Shared helpers (mocks, providers) live alongside the tests that consume them.

### Backend Tests

```text
__tests__/backend/
├── auth-password-reset-email.test.ts
├── catalog-refresh-outbox.test.ts
├── identify-functions.test.ts
├── inventory-import-validation.test.ts
├── inventory-sync-status.test.ts
├── marketplaces/
│   ├── bricklink/
│   │   └── catalog-client.test.ts, client.test.ts, credentials.test.ts, ...
│   └── brickowl/
│       └── client.test.ts, credentials.test.ts, inventory/actions.test.ts, ...
├── orders/
│   └── normalizers/
│       ├── bricklink.test.ts
│       ├── brickowl.test.ts
│       └── utils.test.ts
├── lib/
│   ├── oauth.test.ts
│   └── upstreamRequest.test.ts
├── ratelimiter/
│   └── consume.test.ts
├── repo-structure.test.ts
└── users-*.test.ts
```

The marketplace suites validate transport behaviour, credential guards, and rate limiting; the inventory import tests protect our dedupe/validation pipeline and should be updated whenever import logic changes.

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
// __tests__/backend/inventory-functions.test.ts
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

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

  const itemId = await t.mutation(api.inventory.mutations.addInventoryItem, {
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

## E2E Testing Best Practices

### Authentication & Role-Based Testing

**Critical Pattern**: Always mock authentication state with the appropriate user role for the feature being tested.

```typescript
test.beforeEach(async ({ page }) => {
  // Mock authentication state - CRITICAL: Use correct role for test scenario
  await page.route("**/convex/function/users.getAuthState", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        isAuthenticated: true,
        user: {
          role: "owner", // ⚠️ CRITICAL: Use "owner" for admin features, not "manager"
          status: "active",
          businessAccountId: "businessAccounts:1",
        },
      }),
    });
  });

  // Mock current user details
  await page.route("**/convex/function/users.getCurrentUser", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          role: "owner", // Must match getAuthState
          firstName: "Test",
          lastName: "Owner",
          email: "owner@example.com",
        },
        businessAccount: { name: "Test Business" },
      }),
    });
  });
});
```

### Comprehensive API Mocking

**Pattern**: Mock ALL API endpoints that the page will call, not just the primary ones.

```typescript
test.beforeEach(async ({ page }) => {
  // Primary data endpoints
  await page.route("**/convex/function/users.listMembers", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          _id: "users:1",
          email: "owner@example.com",
          firstName: "Test",
          lastName: "Owner",
          role: "owner",
          status: "active",
          isCurrentUser: true,
        },
      ]),
    });
  });

  // Mutation endpoints that forms will call
  await page.route("**/convex/mutation/users.createUserInvite", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        token: "test-invite-token",
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      }),
    });
  });
});
```

### URL Redirect Testing

**Critical**: Verify actual redirect behavior, not assumed behavior.

```typescript
// ❌ WRONG: Assuming redirect pattern
await expect(page).toHaveURL(/\/signup\?token=expired-token/);

// ✅ CORRECT: Test actual redirect from invite page
await page.goto("/invite?token=expired-token");
await expect(page).toHaveURL(/\/signup\?inviteToken=expired-token/); // Note: inviteToken, not token
```

## Frontend Testing Patterns

### Authentication State Mocking

**Pattern**: Create consistent mock structures across all frontend tests.

```typescript
// ✅ CORRECT: Consistent auth state mocking
const mockAuthState = {
  isAuthenticated: true,
  user: {
    role: "owner",
    status: "active",
    businessAccountId: "businessAccounts:1",
  },
};

const mockCurrentUser = {
  user: {
    role: "owner", // Must match authState.user.role
    firstName: "Test",
    lastName: "Owner",
    email: "owner@example.com",
  },
  businessAccount: { name: "Test Business" },
};

// Apply consistently across test files
jest.mock("convex/react", () => ({
  useQuery: jest.fn((api) => {
    if (api._name === "users.getAuthState") return mockAuthState;
    if (api._name === "users.getCurrentUser") return mockCurrentUser;
    return undefined;
  }),
}));
```

### Role-Based UI Testing

**Pattern**: Test UI behavior for different user roles systematically.

```typescript
describe("Role-based access control", () => {
  it.each([
    ["owner", true, "should show invite button"],
    ["manager", false, "should hide invite button"],
    ["viewer", false, "should hide invite button"],
  ])("for %s role - %s", (role, shouldShowInvite, description) => {
    // Mock auth with specific role
    const mockAuthWithRole = { ...mockAuthState, user: { ...mockAuthState.user, role } };

    render(<UsersPage />);

    const inviteButton = screen.queryByTestId("invite-button");
    if (shouldShowInvite) {
      expect(inviteButton).toBeInTheDocument();
    } else {
      expect(inviteButton).not.toBeInTheDocument();
    }
  });
});
```

## Test ID Guidelines

### Required Test IDs

**Requirement**: All interactive elements in forms and critical UI components must have `data-testid` attributes.

```typescript
// ✅ REQUIRED: Form inputs must have test IDs
<Input
  id="firstName"
  data-testid="signup-form-firstName" // Pattern: {form}-{field}
  value={firstName}
  onChange={(e) => setFirstName(e.target.value)}
/>

// ✅ REQUIRED: Action buttons must have test IDs
<Button
  onClick={handleInvite}
  data-testid="invite-button" // Pattern: {action}-button
>
  Invite user
</Button>

// ✅ REQUIRED: Navigation elements
<Link href="/settings" data-testid="nav-settings-link">
  Settings
</Link>
```

### Test ID Naming Convention

```text
Pattern: {component}-{element}-{modifier?}

Examples:
- signup-form-firstName      (form field)
- invite-button             (action button)
- users-table-row-1         (table row)
- nav-settings-link         (navigation)
- modal-confirm-button      (modal action)
- error-message            (status display)
```

## Common Anti-Patterns & Solutions

### ❌ Anti-Pattern: Inconsistent Role Mocking

```typescript
// ❌ WRONG: Using "manager" role for admin functionality tests
await page.route("**/convex/function/users.getCurrentUser", (route) => {
  route.fulfill({
    body: JSON.stringify({
      user: { role: "manager" }, // Manager cannot invite users!
    }),
  });
});

await expect(page.getByTestId("invite-button")).toBeVisible(); // Will fail!
```

**✅ Solution**: Use appropriate roles for the functionality being tested.

### ❌ Anti-Pattern: Incomplete API Mocking

```typescript
// ❌ WRONG: Only mocking some endpoints
test("invite flow", async ({ page }) => {
  await page.route("**/users.getCurrentUser", () => {...}); // Missing other required endpoints
  await page.goto("/settings/users"); // Will fail due to unmocked API calls
});
```

**✅ Solution**: Mock ALL endpoints the page will call.

### ❌ Anti-Pattern: Missing Test IDs

```typescript
// ❌ WRONG: Components without test IDs
<Button onClick={handleSubmit}>Submit</Button>

// E2E test fails to find element
await page.click("button"); // Fragile - could click wrong button
```

**✅ Solution**: Add semantic test IDs to all interactive elements.

### ❌ Anti-Pattern: Assuming URL Patterns

```typescript
// ❌ WRONG: Assuming redirect implementation
await page.goto("/invite?token=abc123");
await expect(page).toHaveURL(/\/signup\?token=abc123/); // Wrong parameter name
```

**✅ Solution**: Test actual redirect behavior by checking implementation.

## Testing Checklist

Before submitting a PR with new features:

### Frontend Components

- [ ] All interactive elements have `data-testid` attributes
- [ ] Role-based access control is tested for all applicable roles
- [ ] Authentication state mocking is consistent and complete
- [ ] Form validation and error states are tested

### Backend Functions

- [ ] Authorization checks are tested (especially owner-only operations)
- [ ] Rate limiting behavior is tested where applicable
- [ ] Error conditions and edge cases are covered
- [ ] Database operations are properly mocked/isolated

### E2E Tests

- [ ] Authentication state mocked with correct roles for test scenario
- [ ] ALL API endpoints used by the page are mocked
- [ ] URL redirects are tested against actual implementation
- [ ] Critical user journeys are covered end-to-end
- [ ] Security scenarios (unauthorized access) are tested

### Integration Points

- [ ] Cross-component interactions are tested
- [ ] API contract compliance is verified
- [ ] Error propagation is tested across layers

---

## Global Catalog & Overlay Testing (Update 2025-09-26)

- Backend catalog/reference reads should not require a tenant and must return global results.
- Overlay CRUD (tenant-scoped) should be unit-tested separately with RBAC assertions.
- Search tests remain unchanged for now (no overlay merge into results).
- Backend regression pack includes unit tests for `catalog.getPartOverlay` / `catalog.upsertPartOverlay` (CRUD + tenant isolation) and guards that restrict global catalog write paths to system administrators.
