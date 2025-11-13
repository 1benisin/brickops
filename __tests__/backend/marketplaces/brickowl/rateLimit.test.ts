import { describe, expect, it } from "vitest";

import type { Id } from "@/convex/_generated/dataModel";
import { boAccountBucket } from "@/convex/marketplaces/brickowl/rateLimit";

describe("boAccountBucket", () => {
  it("namespaces the bucket by provider and business account id", () => {
    const businessAccountId = "ba-42" as Id<"businessAccounts">;

    expect(boAccountBucket(businessAccountId)).toBe(`brickowl:account:${businessAccountId}`);
  });
});

