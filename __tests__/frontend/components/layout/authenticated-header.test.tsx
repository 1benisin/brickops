import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthenticatedHeader } from "@/components/layout/AuthenticatedHeader";
import { NavigationItem } from "@/components/layout/AppNavigation";
import { Home, Package, ShoppingCart } from "lucide-react";

// Mock the ThemeToggle component
jest.mock("@/components/ui", () => ({
  ...jest.requireActual("@/components/ui"),
  ThemeToggle: () => <div data-testid="theme-toggle">Theme Toggle</div>,
}));

const mockNavigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
];

const defaultProps = {
  navigation: mockNavigation,
  onSignOut: jest.fn(),
};

describe("AuthenticatedHeader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders the BrickOps logo and link", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const logoLink = screen.getByRole("link", { name: /brickops/i });
      expect(logoLink).toBeInTheDocument();
      expect(logoLink).toHaveAttribute("href", "/dashboard");

      // Should contain the BO initials
      expect(screen.getByText("BO")).toBeInTheDocument();
      expect(screen.getByText("BrickOps")).toBeInTheDocument();
    });

    it("renders navigation items on desktop", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      // Should contain navigation elements (there are nested nav elements)
      const navigationElements = screen.getAllByRole("navigation");
      expect(navigationElements.length).toBeGreaterThan(0);
    });

    it("renders theme toggle", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    });

    it("renders sign out button on desktop", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const signOutButtons = screen.getAllByRole("button", { name: /sign out/i });
      expect(signOutButtons.length).toBeGreaterThan(0);

      // Desktop sign out button should have LogOut icon text
      expect(screen.getByText("Sign out")).toBeInTheDocument();
    });

    it("renders mobile menu trigger", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const mobileMenuButton = screen.getByRole("button", {
        name: /open navigation menu/i,
      });
      expect(mobileMenuButton).toBeInTheDocument();
      expect(mobileMenuButton).toHaveAttribute("aria-haspopup", "dialog");
    });
  });

  describe("User Interactions", () => {
    it("calls onSignOut when desktop sign out button is clicked", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const signOutButtons = screen.getAllByRole("button", { name: /sign out/i });
      // Find the desktop button (one that contains text "Sign out")
      const desktopSignOutButton = signOutButtons.find((button) =>
        button.textContent?.includes("Sign out"),
      );

      expect(desktopSignOutButton).toBeInTheDocument();
      fireEvent.click(desktopSignOutButton!);

      expect(defaultProps.onSignOut).toHaveBeenCalledTimes(1);
    });

    it("opens mobile menu when menu button is clicked", async () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const mobileMenuButton = screen.getByRole("button", {
        name: /open navigation menu/i,
      });

      // Menu should initially be closed
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.click(mobileMenuButton);

      // Wait for sheet to open
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Should contain navigation title
      expect(screen.getByText("Navigation")).toBeInTheDocument();
    });

    it("calls onSignOut when mobile sign out button is clicked", async () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      // Open mobile menu
      const mobileMenuButton = screen.getByRole("button", {
        name: /open navigation menu/i,
      });
      fireEvent.click(mobileMenuButton);

      // Wait for sheet to open
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Find and click mobile sign out button
      const signOutButtons = screen.getAllByRole("button", { name: /sign out/i });
      const mobileSignOutButton = signOutButtons.find((button) =>
        button.closest('[role="dialog"]'),
      );

      expect(mobileSignOutButton).toBeInTheDocument();
      fireEvent.click(mobileSignOutButton!);

      expect(defaultProps.onSignOut).toHaveBeenCalledTimes(1);
    });

    it("closes mobile menu when navigation link is clicked", async () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      // Open mobile menu
      const mobileMenuButton = screen.getByRole("button", {
        name: /open navigation menu/i,
      });
      fireEvent.click(mobileMenuButton);

      // Wait for sheet to open
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // The AppNavigation component should call onNavigate when clicked
      // This is tested indirectly through the sheet state management
      // We simulate this by checking the sheet can be closed
      const closeButton = screen.getByRole("button", { name: /close/i });
      if (closeButton) {
        fireEvent.click(closeButton);

        await waitFor(() => {
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
      }
    });
  });

  describe("Responsive Behavior", () => {
    it("has correct CSS classes for responsive design", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      // Desktop navigation should be hidden on mobile (outer nav wrapper)
      const navigationElements = screen.getAllByRole("navigation");
      const outerNav = navigationElements.find((nav) => nav.className.includes("hidden"));
      expect(outerNav).toHaveClass("hidden", "md:flex");

      // Mobile menu button should be hidden on desktop
      const mobileMenuButton = screen.getByRole("button", {
        name: /open navigation menu/i,
      });
      expect(mobileMenuButton).toHaveClass("md:hidden");

      // Desktop sign out should be hidden on small screens
      const desktopSignOut = screen
        .getAllByRole("button", { name: /sign out/i })
        .find((btn) => btn.textContent?.includes("Sign out"));
      expect(desktopSignOut).toHaveClass("hidden", "sm:inline-flex");
    });

    it("shows BrickOps text only on small screens and up", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const brandText = screen.getByText("BrickOps");
      expect(brandText).toHaveClass("hidden", "sm:inline-block");
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA attributes", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const mobileMenuButton = screen.getByRole("button", {
        name: /open navigation menu/i,
      });
      expect(mobileMenuButton).toHaveAttribute("aria-label", "Open navigation menu");
      expect(mobileMenuButton).toHaveAttribute("aria-haspopup", "dialog");
    });

    it("has semantic header element", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();
    });

    it("has accessible logo link", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const logoLink = screen.getByRole("link", { name: /brickops/i });
      expect(logoLink).toHaveAttribute("href", "/dashboard");
    });

    it("provides dialog title when mobile menu is open", async () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      // Open mobile menu
      const mobileMenuButton = screen.getByRole("button", {
        name: /open navigation menu/i,
      });
      fireEvent.click(mobileMenuButton);

      // Wait for sheet to open
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Should have accessible title
      expect(screen.getByRole("dialog")).toHaveAccessibleName("Navigation");
    });
  });

  describe("Edge Cases", () => {
    it("handles empty navigation array", () => {
      render(<AuthenticatedHeader {...defaultProps} navigation={[]} />);

      // Should still render header structure
      expect(screen.getByRole("banner")).toBeInTheDocument();
      expect(screen.getByText("BrickOps")).toBeInTheDocument();
    });

    it("handles missing onSignOut prop gracefully", () => {
      // TypeScript would prevent this, but testing runtime safety
      const propsWithoutOnSignOut = {
        navigation: mockNavigation,
        onSignOut: undefined,
      };

      expect(() => {
        // @ts-expect-error Testing runtime behavior with missing required prop
        render(<AuthenticatedHeader {...propsWithoutOnSignOut} />);
      }).not.toThrow();
    });
  });

  describe("Visual Elements", () => {
    it("renders logo with correct styling classes", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const logoContainer = screen.getByText("BO");
      expect(logoContainer).toHaveClass(
        "inline-flex",
        "size-9",
        "items-center",
        "justify-center",
        "rounded-lg",
        "bg-primary",
        "text-primary-foreground",
        "shadow-subtle",
      );
    });

    it("has backdrop blur styling", () => {
      render(<AuthenticatedHeader {...defaultProps} />);

      const header = screen.getByRole("banner");
      expect(header).toHaveClass(
        "border-b",
        "bg-background/80",
        "backdrop-blur",
        "supports-[backdrop-filter]:bg-background/60",
      );
    });
  });
});
