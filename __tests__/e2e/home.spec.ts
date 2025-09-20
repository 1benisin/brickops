import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("displays hero copy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /retail operations launchpad/i })).toBeVisible();
  });
});

test.describe("home page mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("displays hero copy on mobile viewport", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /retail operations launchpad/i })).toBeVisible();
  });
});
