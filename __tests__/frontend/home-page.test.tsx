/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import HomePage from "@/app/page";
import { setMockPathname } from "@/test-utils/next-navigation";

describe("HomePage", () => {
  beforeEach(() => {
    setMockPathname("/");
  });

  it("renders hero content", () => {
    render(<HomePage />);

    expect(screen.getByText(/BrickOps/i, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(/retail operations launchpad/i)).toBeInTheDocument();
  });
});
