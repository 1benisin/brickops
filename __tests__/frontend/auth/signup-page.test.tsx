import { render, screen, waitFor, act } from "@testing-library/react";
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

    // Wrap all user interactions in act() to handle state updates
    await act(async () => {
      await user.type(await screen.findByLabelText(/first name/i), "Jamie");
      await user.type(await screen.findByLabelText(/last name/i), "Owner");
      await user.type(await screen.findByLabelText(/work email/i), "jamie@example.com");
      await user.type(await screen.findByLabelText(/password/i), "supersecret");
      await user.type(await screen.findByLabelText(/business name/i), "BrickOps HQ");
    });

    const submit = await screen.findByRole("button", { name: /create account/i });

    await act(async () => {
      await user.click(submit);
    });

    const { push } = getRouterMocks();
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
      expect(push).toHaveBeenCalledWith("/dashboard");
      expect(screen.queryByRole("button", { name: /creating workspace/i })).not.toBeInTheDocument();
    });
  });

  it("sends sign-up payload with invite code", async () => {
    signInMock.mockResolvedValue({ signingIn: true });
    const user = userEvent.setup();

    render(<SignupPage />);

    // Wrap all user interactions in act() to handle state updates
    await act(async () => {
      await user.type(await screen.findByLabelText(/first name/i), "Charlie");
      await user.type(await screen.findByLabelText(/last name/i), "Teammate");
      await user.type(await screen.findByLabelText(/work email/i), "charlie@example.com");
      await user.type(await screen.findByLabelText(/password/i), "supersecret");

      const inviteInput = await screen.findByLabelText(/team invite code/i);
      await user.type(inviteInput, "abcdef12");
    });

    const submit2 = await screen.findByRole("button", { name: /create account/i });

    await act(async () => {
      await user.click(submit2);
    });

    const { push: push2 } = getRouterMocks();
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
      expect(push2).toHaveBeenCalledWith("/dashboard");
      expect(screen.queryByRole("button", { name: /creating workspace/i })).not.toBeInTheDocument();
    });
  });
});
