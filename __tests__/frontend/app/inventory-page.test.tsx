/// <reference types="@testing-library/jest-dom" />
import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../test/utils/render-with-providers";
import InventoryPage from "../../../src/app/(authenticated)/inventory/page";
import { api } from "../../../convex/_generated/api";

// Mock Radix Dialog to avoid act warnings and portal issues
jest.mock("@radix-ui/react-dialog", () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Trigger: ({
    children,
    asChild,
    ...props
  }: React.ComponentProps<"button"> & { asChild?: boolean }) => {
    // If asChild is true, render children directly without wrapping button
    return asChild ? <>{children}</> : <button {...props}>{children}</button>;
  },
  Portal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Overlay: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  Content: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  Title: ({ children, ...props }: React.ComponentProps<"h2">) => <h2 {...props}>{children}</h2>,
  Description: ({ children, ...props }: React.ComponentProps<"p">) => <p {...props}>{children}</p>,
  Close: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
}));

// Provide deterministic values to enable the Save button
jest.mock("convex/react", () => {
  const actual = jest.requireActual("convex/react");
  return {
    __esModule: true,
    ...actual,
    useQuery: jest.fn((queryFn: unknown, _args: unknown) => {
      switch (queryFn) {
        case api.functions.users.getCurrentUser:
          return { businessAccount: { _id: "ba_1" } } as unknown;
        case api.functions.inventory.listInventoryItems:
          return [] as unknown;
        case api.functions.inventory.getInventoryTotals:
          return {
            counts: { items: 0 },
            totals: { available: 0, reserved: 0, sold: 0 },
          } as unknown;
        case api.functions.inventory.listInventoryAuditLogs:
          return [] as unknown;
        default:
          return undefined;
      }
    }),
    useMutation: jest.fn(() => jest.fn(async () => undefined)),
  };
});

describe("InventoryPage", () => {
  it("renders inventory page with add item functionality", async () => {
    const user = userEvent.setup();

    // Render with mocked Convex client and Radix components
    renderWithProviders(<InventoryPage />);

    // Page should render with main title (level 1 heading)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Inventory");

    // Should have Add Item button
    expect(screen.getByRole("button", { name: /add item/i })).toBeInTheDocument();

    // Open dialog
    await user.click(screen.getByRole("button", { name: /add item/i }));

    // Dialog should open with form fields
    expect(screen.getByRole("heading", { name: /add inventory item/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/SKU/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Color ID/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Location/i)).toBeInTheDocument();

    // Save button should be present (validation state tested elsewhere)
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});
