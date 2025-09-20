/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders hero content", () => {
    render(<HomePage />);

    expect(screen.getByText(/BrickOps/i)).toBeInTheDocument();
    expect(screen.getByText(/retail operations launchpad/i)).toBeInTheDocument();
  });
});
