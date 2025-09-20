/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import HomePage from "@/app/page";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const { usePathname } = jest.requireMock("next/navigation") as {
  usePathname: jest.Mock;
};

describe("HomePage", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/");
  });

  it("renders hero content", () => {
    render(<HomePage />);

    expect(screen.getByText(/BrickOps/i, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/retail operations launchpad/i)).toBeInTheDocument();
  });
});
