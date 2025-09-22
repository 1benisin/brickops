import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SignupPage from "@/app/(auth)/signup/page";
import { getRouterMocks } from "@/test-utils/next-navigation";

const signInMock = jest.fn();

jest.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: signInMock,
    signOut: jest.fn(),
  }),
}));

describe("SignupPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("sends sign-up payload without invite code", async () => {
    signInMock.mockResolvedValue({ signingIn: true });
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText(/first name/i), "Jamie");
    await user.type(screen.getByLabelText(/last name/i), "Owner");
    await user.type(screen.getByLabelText(/work email/i), "jamie@example.com");
    await user.type(screen.getByLabelText(/password/i), "supersecret");
    await user.type(screen.getByLabelText(/business name/i), "BrickOps HQ");

    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("password", {
        flow: "signUp",
        email: "jamie@example.com",
        password: "supersecret",
        firstName: "Jamie",
        lastName: "Owner",
        businessName: "BrickOps HQ",
        inviteCode: undefined,
      });
    });

    const { push } = getRouterMocks();
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("sends sign-up payload with invite code", async () => {
    signInMock.mockResolvedValue({ signingIn: true });
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText(/first name/i), "Charlie");
    await user.type(screen.getByLabelText(/last name/i), "Teammate");
    await user.type(screen.getByLabelText(/work email/i), "charlie@example.com");
    await user.type(screen.getByLabelText(/password/i), "supersecret");

    const inviteInput = screen.getByLabelText(/team invite code/i);
    await user.type(inviteInput, "abcdef12");

    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("password", {
        flow: "signUp",
        email: "charlie@example.com",
        password: "supersecret",
        firstName: "Charlie",
        lastName: "Teammate",
        businessName: undefined,
        inviteCode: "abcdef12",
      });
    });
  });
});
