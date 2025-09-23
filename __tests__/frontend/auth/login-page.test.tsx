import { render, screen, waitFor, act } from "@testing-library/react";
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

    // Wrap all user interactions in act() to handle state updates
    await act(async () => {
      await user.type(await screen.findByLabelText(/email/i), "owner@example.com");
      await user.type(await screen.findByLabelText(/password/i), "secret123");
    });

    const submit = await screen.findByRole("button", { name: /sign in/i });

    await act(async () => {
      await user.click(submit);
    });

    const { push } = getRouterMocks();
    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("password", {
        flow: "signIn",
        email: "owner@example.com",
        password: "secret123",
      });
      expect(push).toHaveBeenCalledWith("/dashboard");
      expect(screen.queryByRole("button", { name: /signing in/i })).not.toBeInTheDocument();
    });
  });
});
