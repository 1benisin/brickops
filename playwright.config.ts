import { devices, defineConfig } from "@playwright/test";

const IS_CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "__tests__/e2e",
  fullyParallel: true,
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 2 : undefined,
  reporter: IS_CI
    ? [["line"], ["html", { outputFolder: "test-results/playwright-report", open: "never" }]]
    : [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    headless: true,
    trace: IS_CI ? "on-first-retry" : "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
        permissions: ["camera"],
      },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"], isMobile: true, permissions: ["camera"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], video: "off", trace: "off", screenshot: "off" },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: !IS_CI,
    timeout: 120_000,
  },
  metadata: {
    owner: "QA",
  },
});
