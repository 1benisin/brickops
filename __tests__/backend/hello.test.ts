import { describe, expect, it } from "vitest";
import { helloImpl } from "@/convex/functions/hello-impl";

describe("helloImpl", () => {
  it("greets the requester", () => {
    expect(helloImpl({ name: "Ops", tenantId: "tenant-123" })).toBe(
      "Hello Ops from tenant tenant-123, welcome to BrickOps!",
    );
  });
});
