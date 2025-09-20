import { render, screen } from "@testing-library/react";
import { AppNavigation, type NavigationItem } from "@/components/layout";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const { usePathname } = jest.requireMock("next/navigation") as {
  usePathname: jest.Mock;
};

const navigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Orders", href: "/orders" },
];

describe("AppNavigation", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/orders");
  });

  it("highlights the active route", () => {
    render(<AppNavigation items={navigationItems} />);

    const ordersLink = screen.getByRole("link", { name: "Orders" });
    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });

    expect(ordersLink.className).toContain("bg-secondary");
    expect(ordersLink.getAttribute("aria-current")).toBe("page");
    expect(dashboardLink.className).toContain("hover:bg-accent");
    expect(dashboardLink.hasAttribute("aria-current")).toBe(false);
  });

  it("supports vertical orientation", () => {
    render(<AppNavigation items={navigationItems} orientation="vertical" />);

    expect(screen.getByRole("navigation").className).toContain("flex-col");
  });
});
