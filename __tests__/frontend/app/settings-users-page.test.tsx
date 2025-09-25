/// <reference types="@testing-library/jest-dom" />
import React from "react";
import { renderWithProviders } from "../../../test/utils/render-with-providers";
import UsersSettingsPage from "../../../src/app/(authenticated)/settings/users/page";
import SettingsPage from "../../../src/app/(authenticated)/settings/page";
import { screen, fireEvent } from "@testing-library/react";
import { useQuery, useMutation } from "convex/react";

// Mock convex/react preserving others
jest.mock("convex/react", () => {
  const actual = jest.requireActual("convex/react");
  return {
    __esModule: true,
    ...actual,
    useQuery: jest.fn(),
    useMutation: jest.fn(() => jest.fn(async () => undefined)),
  };
});

describe("Settings Users Page", () => {
  const mockedUseQuery = useQuery as jest.Mock;
  const mockedUseMutation = useMutation as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default behavior
    mockedUseMutation.mockReturnValue(jest.fn(async () => undefined));
    mockedUseQuery.mockReturnValue(undefined);
  });

  it("renders loading skeletons when queries are pending", () => {
    mockedUseQuery.mockReturnValue(undefined);
    renderWithProviders(<UsersSettingsPage />);
    expect(screen.getByTestId("users-loading")).toBeInTheDocument();
  });

  it("lists members and hides actions for non-owners", () => {
    // Mock queries with proper call order mapping
    const mockQueries = [
      // getAuthState - 1st call
      {
        isAuthenticated: true,
        user: {
          role: "manager",
          status: "active",
          businessAccountId: "businessAccounts:1",
        },
      },
      // getCurrentUser - 2nd call
      {
        user: { role: "manager", firstName: "Mason", lastName: "Manager" },
        businessAccount: { name: "Acme" },
      },
      // listMembers - 3rd call
      [
        {
          _id: "users:1",
          name: "Olivia Owner",
          role: "owner",
          status: "active",
          isCurrentUser: false,
          email: "owner@example.com",
        },
        {
          _id: "users:2",
          name: "Mason Manager",
          role: "manager",
          status: "active",
          isCurrentUser: true,
          email: "manager@example.com",
        },
      ],
    ];

    let callIndex = 0;
    mockedUseQuery.mockImplementation(() => {
      const result = mockQueries[callIndex % mockQueries.length];
      callIndex++;
      return result;
    });

    renderWithProviders(<UsersSettingsPage />);

    expect(screen.getByText("Users")).toBeInTheDocument();
    // No invite button for non-owner
    expect(screen.queryByTestId("invite-button")).not.toBeInTheDocument();
    // Role select not shown for self and non-owner context
    expect(screen.getByText("manager")).toBeInTheDocument();
  });

  it("allows owner to open invite dialog and submit", async () => {
    const mockInvite = jest.fn().mockResolvedValue({ expiresAt: Date.now() + 1000 });
    mockedUseMutation.mockReturnValue(mockInvite);

    // Mock queries with proper call order mapping
    const mockQueries = [
      // getAuthState - 1st call
      {
        isAuthenticated: true,
        user: {
          role: "owner",
          status: "active",
          businessAccountId: "businessAccounts:1",
        },
      },
      // getCurrentUser - 2nd call
      {
        user: { role: "owner", firstName: "Olivia", lastName: "Owner" },
        businessAccount: { name: "Acme" },
      },
      // listMembers - 3rd call
      [
        {
          _id: "users:1",
          name: "Olivia Owner",
          role: "owner",
          status: "active",
          isCurrentUser: true,
          email: "owner@example.com",
        },
      ],
    ];

    let callIndex = 0;
    mockedUseQuery.mockImplementation(() => {
      const result = mockQueries[callIndex % mockQueries.length];
      callIndex++;
      return result;
    });

    renderWithProviders(<UsersSettingsPage />);

    fireEvent.click(screen.getByTestId("invite-button"));

    // Wait for dialog to appear
    await screen.findByRole("dialog");
    const email = await screen.findByTestId("invite-email");
    fireEvent.change(email, { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByTestId("invite-submit"));

    // Wait for async invite result to ensure mutation was called
    expect(await screen.findByTestId("invite-result")).toBeInTheDocument();
    expect(mockInvite).toHaveBeenCalled();
  });

  it("shows current role & permissions summary on Account settings page", () => {
    // Reset mocks first
    jest.clearAllMocks();

    // Mock queries with proper call order mapping
    const mockQueries = [
      // getAuthState - 1st call
      {
        isAuthenticated: true,
        user: {
          role: "manager",
          status: "active",
          businessAccountId: "businessAccounts:1",
        },
      },
      // getCurrentUser - 2nd call
      {
        user: {
          role: "manager",
          email: "manager@example.com",
          firstName: "Mason",
          lastName: "Manager",
        },
        businessAccount: { name: "Acme", inviteCode: "abc12345" },
      },
      // listMembers - 3rd call
      [
        {
          _id: "users:1",
          name: "Mason Manager",
          role: "manager",
          status: "active",
          isCurrentUser: true,
          email: "manager@example.com",
        },
      ],
    ];

    let callIndex = 0;
    mockedUseQuery.mockImplementation(() => {
      const result = mockQueries[callIndex % mockQueries.length];
      callIndex++;
      return result;
    });

    // Render settings root page instead of users page to validate role summary
    renderWithProviders(<SettingsPage />);

    expect(screen.getByText("Your role & permissions")).toBeInTheDocument();
    const summary = screen.getByTestId("role-permissions");
    expect(summary).toHaveTextContent(/Role:\s*manager/i);
    expect(summary).toHaveTextContent(/Full inventory and order management/i);
    expect(summary).toHaveTextContent(/Cannot manage users or account settings/i);
  });

  it("comprehensively tests role-based UI gating across all features", () => {
    jest.clearAllMocks();

    // Test Owner role - should see all controls
    const ownerMockQueries = [
      {
        isAuthenticated: true,
        user: { role: "owner", status: "active", businessAccountId: "businessAccounts:1" },
      },
      {
        user: { role: "owner", firstName: "Olivia", lastName: "Owner" },
        businessAccount: { name: "Acme" },
      },
      [
        {
          _id: "users:1",
          name: "Olivia Owner",
          role: "owner",
          status: "active",
          isCurrentUser: true,
          email: "owner@example.com",
        },
      ],
    ];

    let callIndex = 0;
    mockedUseQuery.mockImplementation(() => {
      const result = ownerMockQueries[callIndex % ownerMockQueries.length];
      callIndex++;
      return result;
    });

    const { rerender } = renderWithProviders(<UsersSettingsPage />);

    // Owner should see invite button
    expect(screen.getByTestId("invite-button")).toBeInTheDocument();
    expect(screen.getByText("Invite user")).toBeInTheDocument();

    // Test Manager role - should NOT see owner controls
    jest.clearAllMocks();
    callIndex = 0;

    const managerMockQueries = [
      {
        isAuthenticated: true,
        user: { role: "manager", status: "active", businessAccountId: "businessAccounts:1" },
      },
      {
        user: { role: "manager", firstName: "Mason", lastName: "Manager" },
        businessAccount: { name: "Acme" },
      },
      [
        {
          _id: "users:1",
          name: "Olivia Owner",
          role: "owner",
          status: "active",
          isCurrentUser: false,
          email: "owner@example.com",
        },
        {
          _id: "users:2",
          name: "Mason Manager",
          role: "manager",
          status: "active",
          isCurrentUser: true,
          email: "manager@example.com",
        },
      ],
    ];

    mockedUseQuery.mockImplementation(() => {
      const result = managerMockQueries[callIndex % managerMockQueries.length];
      callIndex++;
      return result;
    });

    rerender(<UsersSettingsPage />);

    // Manager should NOT see invite button or role controls
    expect(screen.queryByTestId("invite-button")).not.toBeInTheDocument();

    // Manager should see static role text, not selects
    expect(screen.getByText("manager")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();

    // Should not see remove buttons for other users
    expect(screen.queryByTestId("remove-users:1")).not.toBeInTheDocument();
  });
});
