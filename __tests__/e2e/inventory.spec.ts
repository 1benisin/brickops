import { test, expect } from "@playwright/test";

test.describe("Inventory Management", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to inventory page (assumes authentication is handled)
    await page.goto("/inventory");
  });

  test("displays inventory page with totals card", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByText("Totals")).toBeVisible();
    await expect(page.getByText("Items:")).toBeVisible();
    await expect(page.getByText("Available:")).toBeVisible();
    await expect(page.getByText("Reserved:")).toBeVisible();
    await expect(page.getByText("Sold:")).toBeVisible();
  });

  test("can open add item dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Add Item" }).click();

    await expect(page.getByText("Add Inventory Item")).toBeVisible();
    await expect(page.getByPlaceholder("SKU")).toBeVisible();
    await expect(page.getByPlaceholder("Name")).toBeVisible();
    await expect(page.getByPlaceholder("Color ID")).toBeVisible();
    await expect(page.getByPlaceholder("Location")).toBeVisible();
  });

  test("add item form validation works", async ({ page }) => {
    await page.getByRole("button", { name: "Add Item" }).click();

    // Save button should be disabled initially
    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeDisabled();

    // Fill required fields
    await page.getByPlaceholder("SKU").fill("TEST001");
    await page.getByPlaceholder("Name").fill("Test Brick");
    await page.getByPlaceholder("Color ID").fill("1");
    await page.getByPlaceholder("Location").fill("A1-A1");

    // Save button should now be enabled
    await expect(saveButton).toBeEnabled();
  });

  test("can view audit history for an item", async ({ page }) => {
    // Assumes there's at least one inventory item
    const historyButton = page.getByRole("button", { name: "History" }).first();

    if (await historyButton.isVisible()) {
      await historyButton.click();
      await expect(page.getByText(/Audit History/)).toBeVisible();
    }
  });

  test("inventory table displays correctly", async ({ page }) => {
    await expect(page.getByRole("columnheader", { name: "SKU" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Location" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Avail" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
  });
});
