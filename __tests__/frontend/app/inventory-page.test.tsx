/// <reference types="@testing-library/jest-dom" />
import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test/utils/render-with-providers";
import InventoryPage from "../../../src/app/(authenticated)/inventory/page";
import { api } from "../../../convex/_generated/api";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Provide deterministic values
jest.mock("convex/react", () => {
  const actual = jest.requireActual("convex/react");
  return {
    __esModule: true,
    ...actual,
    useQuery: jest.fn((queryFn: unknown) => {
      switch (queryFn) {
        case api.users.queries.getCurrentUser:
          return { businessAccount: { _id: "ba_1" } } as unknown;
        case api.inventory.queries.listInventoryItems:
          return [] as unknown;
        case api.inventory.queries.getInventoryTotals:
          return {
            counts: { items: 0 },
            totals: { available: 0, reserved: 0, sold: 0 },
          } as unknown;
        case api.marketplace.mutations.getSyncSettings:
          return undefined;
        default:
          return undefined;
      }
    }),
    useMutation: jest.fn(() => jest.fn(async () => undefined)),
  };
});

describe("InventoryPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders inventory page with navigation to add item", async () => {
    const user = userEvent.setup();

    // Render with mocked Convex client and router
    renderWithProviders(<InventoryPage />);

    // Page should render with main title (level 1 heading)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Inventory");

    // Should have Add Item button
    expect(screen.getByRole("button", { name: /add item/i })).toBeInTheDocument();

    // Clicking Add Item should navigate to inventory files page
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(mockPush).toHaveBeenCalledWith("/inventory/files");
  });
});
