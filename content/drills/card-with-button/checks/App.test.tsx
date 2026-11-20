import { describe, it, expect } from "drillbox:test";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

function addToCart(product: string) {
  fireEvent.click(screen.getByRole("button", { name: `Add ${product} to cart` }));
}

function shownSelection(): string | null {
  return screen.getByText(/^Selected: /).textContent;
}

function shownCart(): string | null {
  return screen.getByText(/^Cart: /).textContent;
}

describe("Card with a button", () => {
  it("starts with nothing selected and an empty cart", () => {
    render(<App />);

    expect(shownSelection()).toBe("Selected: none");
    expect(shownCart()).toBe("Cart: 0");
  });

  it("adds to the cart", () => {
    render(<App />);

    addToCart("Desk");

    expect(shownCart()).toBe("Cart: 1");
  });

  it("leaves the selection alone when adding to the cart", () => {
    render(<App />);

    addToCart("Desk");

    expect(shownSelection()).toBe("Selected: none");
  });

  it("offers a button to select each product", () => {
    render(<App />);

    expect(screen.queryByRole("button", { name: "Select Lamp" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select Lamp" }));

    expect(shownSelection()).toBe("Selected: Lamp");
  });

  it("keeps the selection when a different product is added", () => {
    render(<App />);

    fireEvent.click(screen.getByText("Select Lamp"));
    addToCart("Chair");

    expect(shownSelection()).toBe("Selected: Lamp");
    expect(shownCart()).toBe("Cart: 1");
  });
});
