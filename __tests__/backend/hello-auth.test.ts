import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { deriveTenantId } from "@/convex/hello";

describe("deriveTenantId", () => {
  it("supports colon delimiters", () => {
    expect(deriveTenantId("tenant-1:user-1")).toBe("tenant-1");
  });

  it("supports pipe delimiters", () => {
    expect(deriveTenantId("tenant-2|user-2")).toBe("tenant-2");
  });

  it("supports slash delimiters", () => {
    expect(deriveTenantId("tenant-3/user-3")).toBe("tenant-3");
  });

  it("returns token when no delimiter present", () => {
    expect(deriveTenantId("tenant-4")).toBe("tenant-4");
  });

  it("throws when token is empty", () => {
    expect(() => deriveTenantId("")).toThrow(ConvexError);
  });
});
