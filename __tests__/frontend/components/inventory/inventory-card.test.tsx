import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";

import { InventoryCard } from "@/components/inventory";
import { renderWithProviders } from "@/test-utils/render-with-providers";
import { setMockPathname } from "@/test-utils/next-navigation";

describe("InventoryCard", () => {
  const mockItem = {
    id: "item-123",
    partNumber: "3001",
    colorId: "5",
    location: "A1-B2",
    quantityAvailable: 10,
    condition: "new" as const,
  };

  it("renders inventory details with Convex provider context", () => {
    setMockPathname("/inventory");

    renderWithProviders(<InventoryCard item={mockItem} />);

    expect(screen.getByTestId("inventory-card")).toBeInTheDocument();
    expect(screen.getByTestId("inventory-part-number")).toHaveTextContent("3001");
    expect(screen.getByTestId("inventory-location")).toHaveTextContent("A1-B2");
    expect(screen.getByTestId("inventory-quantity")).toHaveTextContent("10");
    expect(screen.getByTestId("inventory-condition")).toHaveTextContent("New");
    expect(screen.getByTestId("inventory-color")).toHaveTextContent("5");
  });

  it("invokes onSelect when clicked", async () => {
    const onSelect = jest.fn();

    renderWithProviders(<InventoryCard item={mockItem} onSelect={onSelect} />);

    await userEvent.click(screen.getByTestId("inventory-card"));

    expect(onSelect).toHaveBeenCalledWith("item-123");
  });
});
