import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ui";

jest.mock("next-themes", () => ({
  useTheme: jest.fn(),
}));

const { useTheme } = jest.requireMock("next-themes") as {
  useTheme: jest.Mock;
};

describe("ThemeToggle", () => {
  it("toggles between light and dark modes", async () => {
    const setTheme = jest.fn();
    useTheme.mockReturnValue({ resolvedTheme: "light", setTheme });

    const user = userEvent.setup();
    render(<ThemeToggle />);

    const button = await screen.findByRole("button", { name: /activate dark mode/i });
    await user.click(button);

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("announces when already in dark mode", async () => {
    const setTheme = jest.fn();
    useTheme.mockReturnValue({ resolvedTheme: "dark", setTheme });

    render(<ThemeToggle />);

    expect(await screen.findByRole("button", { name: /activate light mode/i })).toBeInTheDocument();
  });
});
