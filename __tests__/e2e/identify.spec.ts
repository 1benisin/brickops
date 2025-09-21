import { expect, test } from "@playwright/test";

import { enableMockCamera, evaluateCameraTracks } from "@/test-utils/playwright/camera";

test.describe("camera identification workflow", () => {
  test("stubs camera access for identification flows", async ({ page }) => {
    await enableMockCamera(page);

    await page.goto("/");

    const trackCount = await evaluateCameraTracks(page);
    expect(trackCount).toBeGreaterThan(0);
  });
});
