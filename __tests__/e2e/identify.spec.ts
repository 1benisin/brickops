import { expect, test } from "@playwright/test";

import { enableMockCamera } from "@/test-utils/playwright/camera";

const mockUserResponse = {
  user: {
    _id: "users:1",
    email: "owner@example.com",
    firstName: "Olivia",
    lastName: "Ops",
    role: "owner",
    status: "active",
  },
  businessAccount: {
    _id: "businessAccounts:1",
    name: "BrickOps",
  },
};

const highConfidenceResult = {
  provider: "brickognize",
  listingId: "listing-123",
  durationMs: 1800,
  requestedAt: Date.now(),
  topScore: 0.93,
  lowConfidence: false,
  boundingBox: null,
  items: [
    {
      id: "3001",
      name: "Brick 2 x 4",
      type: "part",
      category: "Brick",
      score: 0.93,
      imageUrl: "https://example.com/3001.jpg",
      externalSites: [
        {
          name: "bricklink",
          url: "https://www.bricklink.com/v2/catalog/catalogitem.page?P=3001",
        },
      ],
    },
  ],
};

const lowConfidenceResult = {
  ...highConfidenceResult,
  topScore: 0.42,
  lowConfidence: true,
  items: [
    {
      ...highConfidenceResult.items[0],
      score: 0.42,
    },
  ],
};

test.describe("camera identification workflow", () => {
  test.beforeEach(async ({ page }) => {
    await enableMockCamera(page);

    await page.route("**/convex/function/users.getCurrentUser", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUserResponse),
      });
    });

    await page.route("**/convex/function/users.getAuthState", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          isAuthenticated: true,
          user: {
            _id: "users:1",
            status: "active",
            businessAccountId: "businessAccounts:1",
            role: "owner",
          },
          businessAccount: mockUserResponse.businessAccount,
        }),
      });
    });

    await page.route("**/convex/mutation/identify.generateUploadUrl", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("https://mock-storage/upload"),
      });
    });

    await page.route("https://mock-storage/upload", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ storageId: "storage:1" }),
      });
    });

    await page.route("**/convex/action/identify.identifyPartFromImage", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(highConfidenceResult),
      });
    });
  });

  const runHappyPath = async (page: import("@playwright/test").Page) => {
    await page.goto("/identify");

    await page.getByTestId("identify-primary").click();
    await expect(page.getByTestId("identify-primary")).toHaveText(/Capture photo/i);
    await page.getByTestId("identify-primary").click();

    await expect(page.getByTestId("identify-submit")).toBeVisible();
    await page.getByTestId("identify-submit").click();

    await expect(page.getByTestId("identify-result")).toBeVisible();
    await expect(page.getByTestId("identify-confidence")).toHaveText(/93%/);
  };

  test("guides the operator through capture and identification", async ({ page }) => {
    await runHappyPath(page);
  });

  test("highlights low-confidence identifications for manual review", async ({ page }) => {
    await page.unroute("**/convex/action/identify.identifyPartFromImage");

    await page.route("**/convex/action/identify.identifyPartFromImage", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(lowConfidenceResult),
      });
    });

    await page.goto("/identify");
    await page.getByTestId("identify-primary").click();
    await expect(page.getByTestId("identify-primary")).toHaveText(/Capture photo/i);
    await page.getByTestId("identify-primary").click();
    await page.getByTestId("identify-submit").click();

    const banner = page.getByText(/automated acceptance threshold/i);
    await expect(banner).toBeVisible();
    await expect(page.getByTestId("identify-confidence")).toHaveText(/42%/);
  });
});
