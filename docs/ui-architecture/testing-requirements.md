# Testing Requirements

## Component Test Template

```typescript
// __tests__/components/inventory/InventoryCard.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { InventoryCard } from "@/components/inventory/InventoryCard";

const mockConvexClient = new ConvexReactClient("https://test.convex.dev");

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ConvexProvider client={mockConvexClient}>{children}</ConvexProvider>
);

describe("InventoryCard", () => {
  const mockInventoryItem = {
    id: "123",
    partNumber: "3001",
    description: "2x4 Brick",
    color: "Red",
    quantity: 10,
    location: "A1-B2",
    status: "available" as const,
    lastUpdated: new Date("2025-01-20"),
    userId: "user123",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders inventory item information correctly", () => {
    render(
      <TestWrapper>
        <InventoryCard item={mockInventoryItem} />
      </TestWrapper>
    );

    expect(screen.getByText("3001")).toBeInTheDocument();
    expect(screen.getByText("2x4 Brick")).toBeInTheDocument();
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("A1-B2")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("handles quantity adjustment correctly", async () => {
    const user = userEvent.setup();

    render(
      <TestWrapper>
        <InventoryCard item={mockInventoryItem} />
      </TestWrapper>
    );

    const incrementButton = screen.getByRole("button", {
      name: /increase quantity/i,
    });
    await user.click(incrementButton);

    // Test expectations...
  });
});
```

## Testing Best Practices

1. **Unit Tests**: Test individual components in isolation with proper mocking
2. **Integration Tests**: Test component interactions and API integrations
3. **E2E Tests**: Test critical user flows including camera capture and order processing
4. **Coverage Goals**: Aim for 80% code coverage with focus on business logic
5. **Test Structure**: Follow Arrange-Act-Assert pattern with descriptive test names
6. **Mock External Dependencies**: Mock API calls, camera access, and marketplace integrations
