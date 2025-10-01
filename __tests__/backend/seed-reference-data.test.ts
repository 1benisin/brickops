import { beforeEach, describe, expect, it, vi } from "vitest";

const { convexConstructor, setAdminAuthMock } = vi.hoisted(() => {
  const ctor = vi.fn();
  const adminAuth = vi.fn();
  return { convexConstructor: ctor, setAdminAuthMock: adminAuth };
});

vi.mock("convex/browser", () => ({
  ConvexHttpClient: convexConstructor,
}));

import { createConvexAdminClient } from "../../scripts/catalog/seed-reference-data";

describe("createConvexAdminClient", () => {
  beforeEach(() => {
    setAdminAuthMock.mockReset();
    convexConstructor.mockReset();
    convexConstructor.mockImplementation(() => ({
      setAdminAuth: setAdminAuthMock,
    }));
  });

  it("attaches admin auth when not in dry run", () => {
    const client = createConvexAdminClient("https://example.convex.cloud", {
      adminKey: "admin-secret",
      dryRun: false,
    });

    expect(convexConstructor).toHaveBeenCalledWith("https://example.convex.cloud");
    expect(setAdminAuthMock).toHaveBeenCalledWith("admin-secret");
    expect(client).toBe(convexConstructor.mock.results[0]?.value);
  });

  it("skips admin auth when running in dry mode", () => {
    const client = createConvexAdminClient("https://example.convex.cloud", {
      dryRun: true,
    });

    expect(convexConstructor).toHaveBeenCalled();
    expect(setAdminAuthMock).not.toHaveBeenCalled();
    expect(client).toBe(convexConstructor.mock.results[0]?.value);
  });

  it("throws when admin key is missing in non-dry runs", () => {
    expect(() =>
      createConvexAdminClient("https://example.convex.cloud", {
        dryRun: false,
      }),
    ).toThrow(/adminKey is required/i);
  });
});
