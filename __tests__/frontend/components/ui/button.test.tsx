import { render, screen } from "@testing-library/react";
import { Button, buttonVariants } from "@/components/ui";

describe("Button", () => {
  it("renders the children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("applies variant and size classes", () => {
    const { container } = render(
      <Button variant="destructive" size="lg">
        Delete
      </Button>,
    );

    const button = container.querySelector("button");
    expect(button).toHaveClass(buttonVariants({ variant: "destructive", size: "lg" }));
  });
});
