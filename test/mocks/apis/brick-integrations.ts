export type BrickognizePrediction = {
  listing_id: string;
  items: Array<{
    id: string;
    name: string;
    img_url: string;
    score: number;
    color?: string;
  }>;
};

export const createBrickognizeSuccess = (
  overrides: Partial<BrickognizePrediction> = {},
): BrickognizePrediction => ({
  listing_id: "res-d492bca0",
  items: [
    {
      id: "3001",
      name: "Brick 2 x 4",
      img_url: "https://mocked.brickognize/assets/3001.png",
      score: 0.96,
    },
  ],
  ...overrides,
});

export type BricklinkOrder = {
  order_id: number;
  status: string;
  buyer_name: string;
  total_count: number;
};

export const createBricklinkOrder = (overrides: Partial<BricklinkOrder> = {}): BricklinkOrder => ({
  order_id: 3905404,
  status: "PENDING",
  buyer_name: "sklee",
  total_count: 1,
  ...overrides,
});

export type BrickowlInventoryItem = {
  id: string;
  condition: "new" | "used";
  quantity: number;
  location: string;
};

export const createBrickowlInventoryItem = (
  overrides: Partial<BrickowlInventoryItem> = {},
): BrickowlInventoryItem => ({
  id: "brickowl-123",
  condition: "new",
  quantity: 10,
  location: "A1-01",
  ...overrides,
});

export const setupBrickApiRoutes = async (page: import("@playwright/test").Page) => {
  await page.route("**/api/brickognize/**", (route) => {
    const body = JSON.stringify(createBrickognizeSuccess());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body,
    });
  });

  await page.route("**/api/bricklink/**", (route) => {
    const body = JSON.stringify({
      data: [createBricklinkOrder({ status: "READY", total_count: 4 })],
      meta: { code: "200" },
    });
    return route.fulfill({ status: 200, contentType: "application/json", body });
  });

  await page.route("**/api/brickowl/**", (route) => {
    const body = JSON.stringify({
      inventory: [createBrickowlInventoryItem()],
    });
    return route.fulfill({ status: 200, contentType: "application/json", body });
  });
};

export const createRateLimitError = (service: "brickognize" | "bricklink" | "brickowl") => ({
  status: 429,
  contentType: "application/json",
  body: JSON.stringify({ error: `${service} rate limit exceeded` }),
});

export const setupBrickApiError = async (
  page: import("@playwright/test").Page,
  service: "brickognize" | "bricklink" | "brickowl",
) => {
  const pattern = `**/api/${service}/**`;
  await page.route(pattern, (route) => route.fulfill(createRateLimitError(service)));
};
