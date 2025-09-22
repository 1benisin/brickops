import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { sendPasswordResetEmail } from "@/convex/lib/external/email";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("sendPasswordResetEmail", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.RESEND_API_KEY = "test-api-key";
    process.env.AUTH_EMAIL_FROM = "BrickOps Auth <auth@brickops.test>";
  });

  it("submits password reset payload to Resend", async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);

    await sendPasswordResetEmail({
      identifier: "Owner@example.com",
      code: "123456",
      url: "https://app.brickops.test/reset",
      expires: new Date("2025-01-01T00:00:00Z"),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [endpoint, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-api-key",
      "Content-Type": "application/json",
    });

    const payload = JSON.parse(init?.body as string);
    expect(payload.from).toBe("BrickOps Auth <auth@brickops.test>");
    expect(payload.to).toEqual(["owner@example.com"]);
    expect(payload.subject).toBe("BrickOps password reset");
    expect(payload.html).toContain("123456");
    expect(payload.text).toContain("123456");
  });

  it("throws when Resend returns a non-OK response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "invalid api key",
    } as Response);

    await expect(
      sendPasswordResetEmail({ identifier: "team@example.com", code: "999999" }),
    ).rejects.toThrowError("Unable to send password reset email");
  });
});
