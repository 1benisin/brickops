import { test, expect, Page } from "@playwright/test";

test.describe("User Invite Flow", () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();

    // Mock Convex for E2E testing
    await page.route("**/convex/function/users.createUserInvite", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          expiresAt: Date.now() + 72 * 60 * 60 * 1000,
          inviteToken: "test-token-123",
        }),
      });
    });

    await page.route("**/convex/function/auth.signUpWithInvite", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          userId: "users:newuser",
        }),
      });
    });

    await page.route("**/convex/function/users.getCurrentUser", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            role: "owner",
            firstName: "New",
            lastName: "User",
            email: "newuser@example.com",
          },
          businessAccount: { name: "Test Business" },
        }),
      });
    });

    await page.route("**/convex/function/users.getAuthState", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          isAuthenticated: true,
          user: {
            role: "owner",
            status: "active",
            businessAccountId: "businessAccounts:1",
          },
        }),
      });
    });

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
            name: "Test Owner",
            role: "owner",
            status: "active",
            isCurrentUser: true,
          },
        ]),
      });
    });

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

  test.afterEach(async () => {
    await page.close();
  });

  test("complete invite → accept → role enforcement flow", async () => {
    // Step 1: Owner invites user
    await page.goto("/settings/users");

    // Verify owner can see invite button
    await expect(page.getByTestId("invite-button")).toBeVisible();

    // Click invite button and fill form
    await page.getByTestId("invite-button").click();
    await expect(page.getByText("Invite user")).toBeVisible();

    await page.getByTestId("invite-email").fill("newuser@example.com");
    await page.getByTestId("invite-role").selectOption("manager");
    await page.getByTestId("invite-submit").click();

    // Verify invite was sent
    await expect(page.getByTestId("invite-result")).toBeVisible();

    // Step 2: User clicks invite link (simulate redirect to invite page)
    await page.goto("/invite?token=test-token-123");

    // Should redirect to signup with token
    await expect(page).toHaveURL(/\/signup\?token=test-token-123/);

    // Step 3: User completes signup
    await page.getByTestId("signup-form-firstName").fill("New");
    await page.getByTestId("signup-form-lastName").fill("User");
    await page.getByTestId("signup-form-email").fill("newuser@example.com");
    await page.getByTestId("signup-form-password").fill("password123");
    await page.getByTestId("signup-submit").click();

    // Should redirect to dashboard after successful signup
    await expect(page).toHaveURL("/dashboard");

    // Step 4: Verify role enforcement - new user should have manager permissions
    await page.goto("/settings");

    // Should see role display showing manager
    await expect(page.getByTestId("role-permissions")).toContainText("manager");
    await expect(page.getByTestId("role-permissions")).toContainText(
      "Full inventory and order management",
    );
    await expect(page.getByTestId("role-permissions")).toContainText(
      "Cannot manage users or account settings",
    );

    // Navigate to users page - should NOT see invite button (manager can't invite)
    await page.goto("/settings/users");
    await expect(page.getByTestId("invite-button")).not.toBeVisible();

    // Verify audit trail would be recorded (this would be tested at backend level)
    // In a real E2E test, we might check database or audit log endpoints
  });

  test("invite token expiration handling", async () => {
    // Mock expired token response
    await page.route("**/convex/function/auth.signUpWithInvite", (route) => {
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Invite token has expired",
        }),
      });
    });

    // Try to use expired invite link
    await page.goto("/invite?token=expired-token");
    await expect(page).toHaveURL(/\/signup\?inviteToken=expired-token/);

    // Fill signup form
    await page.getByTestId("signup-form-firstName").fill("New");
    await page.getByTestId("signup-form-lastName").fill("User");
    await page.getByTestId("signup-form-email").fill("newuser@example.com");
    await page.getByTestId("signup-form-password").fill("password123");
    await page.getByTestId("signup-submit").click();

    // Should show error message about expired token
    await expect(page.getByText("Invite token has expired")).toBeVisible();
  });

  test("unauthorized access attempts", async () => {
    // Mock manager user trying to access owner-only features
    await page.route("**/convex/function/users.createUserInvite", (route) => {
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Only owners can invite users",
        }),
      });
    });

    // Manager tries to access users page
    await page.goto("/settings/users");

    // Should not see invite button
    await expect(page.getByTestId("invite-button")).not.toBeVisible();

    // If somehow they try to trigger invite (direct API call), should fail
    // This would be handled by backend authorization
  });
});
