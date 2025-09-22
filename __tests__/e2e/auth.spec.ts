import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function mockAuthApi(page: Page) {
  await page.route("**/api/auth", async (route) => {
    const request = route.request();
    let payload: { action?: string; args?: any } = {};
    try {
      payload = JSON.parse(request.postData() ?? "{}");
    } catch (error) {
      console.warn("[auth-test] Unable to parse auth payload", error);
    }

    const { action, args } = payload;
    if (action === "auth:signIn") {
      const params = args?.params ?? {};
      const flow: string | undefined = params.flow;

      if (flow === "reset") {
        return route.fulfill({ status: 200, body: JSON.stringify({ tokens: null }) });
      }

      if (flow === "reset-verification") {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({ tokens: { token: "mock-token", refreshToken: "mock-refresh" } }),
        });
      }

      if (flow === "signUp" || flow === "signIn" || params.code) {
        return route.fulfill({
          status: 200,
          body: JSON.stringify({ tokens: { token: "mock-token", refreshToken: "mock-refresh" } }),
        });
      }

      return route.fulfill({ status: 200, body: JSON.stringify({ tokens: null }) });
    }

    if (action === "auth:signOut") {
      return route.fulfill({ status: 200, body: JSON.stringify({}) });
    }

    return route.fulfill({ status: 200, body: JSON.stringify({ tokens: null }) });
  });

  await page.route("http://localhost:8383/**", async (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ status: 200, body: JSON.stringify({ status: "mock-ok" }) });
    }
    return route.fulfill({ status: 200, body: "" });
  });
}

test.describe("authentication journeys", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthApi(page);
  });

  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login$/);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("signs up a new workspace and routes to dashboard", async ({ page }) => {
    await page.goto("/signup");

    await page.getByLabel(/first name/i).fill("Jamie");
    await page.getByLabel(/last name/i).fill("Owner");
    await page.getByLabel(/work email/i).fill("jamie@example.com");
    await page.getByLabel(/password/i).fill("supersecret");
    await page.getByLabel(/business name/i).fill("BrickOps HQ");

    await page.getByRole("button", { name: /create account/i }).click();

    await page.waitForURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  });

  test("logs in an existing user and supports sign out", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel(/email/i).fill("owner@example.com");
    await page.getByLabel(/password/i).fill("secret123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("completes password reset with verification code", async ({ page }) => {
    await page.goto("/reset-password");

    await page.getByLabel(/email/i).fill("owner@example.com");
    await page.getByRole("button", { name: /send verification code/i }).click();

    await expect(page.getByLabel(/verification code/i)).toBeVisible();
    await page.getByLabel(/verification code/i).fill("654321");
    await page.getByLabel(/new password/i).fill("strongpassword1");
    await page.getByRole("button", { name: /update password/i }).click();

    await page.waitForURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });
});
