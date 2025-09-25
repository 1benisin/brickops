/// <reference types="@testing-library/jest-dom" />
import React from "react";
import { renderWithProviders } from "../../../test/utils/render-with-providers";
import DashboardPage from "../../../src/app/(authenticated)/dashboard/page";
import { screen } from "@testing-library/react";
import { useQuery } from "convex/react";

// Mock the convex/react module: preserve actual exports except where overridden
jest.mock("convex/react", () => {
  const actual = jest.requireActual("convex/react");
  return {
    __esModule: true,
    ...actual,
    useQuery: jest.fn(),
    useMutation: jest.fn(() => jest.fn(async () => undefined)),
  };
});

describe("DashboardPage", () => {
  const mockedUseQuery = useQuery as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders loading skeletons when data is loading", () => {
    // Arrange: Mock useQuery to return undefined for all queries
    mockedUseQuery.mockReturnValue(undefined);

    // Act
    renderWithProviders(<DashboardPage />);

    // Assert
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard");
    expect(screen.getByTestId("dashboard-totals-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-totals")).not.toBeInTheDocument();
  });

  it("renders totals from convex query when data is loaded", () => {
    // Arrange: Sequentially return user then totals
    mockedUseQuery.mockReturnValueOnce({ businessAccount: { _id: "ba_1" } }).mockReturnValueOnce({
      counts: { items: 3 },
      totals: { available: 10, reserved: 2, sold: 1 },
    });

    // Act
    renderWithProviders(<DashboardPage />);

    // Assert
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Dashboard");
    expect(screen.getByTestId("dashboard-totals")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-totals-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("totals-items")).toHaveTextContent("3");
    expect(screen.getByTestId("totals-available")).toHaveTextContent("10");
    expect(screen.getByTestId("totals-reserved")).toHaveTextContent("2");
    expect(screen.getByTestId("totals-sold")).toHaveTextContent("1");
  });
});
