import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import LoginPage from "@/app/(auth)/login/page";
import { getRouterMocks } from "@/test-utils/next-navigation";

const signInMock = jest.fn();

jest.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: signInMock,
    signOut: jest.fn(),
  }),
}));

describe("LoginPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("submits credentials via Convex Auth", async () => {
    signInMock.mockResolvedValue({ signingIn: true });
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email/i), "owner@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("password", {
        flow: "signIn",
        email: "owner@example.com",
        password: "secret123",
      });
    });

    const { push } = getRouterMocks();
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard");
    });
  });
});
