import { describe, it, expect } from "drillbox:test";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function toggleDiscount() {
  fireEvent.click(screen.getByRole("checkbox", { name: "10% off" }));
}

function shownItems(): string | null {
  return screen.getByText(/^Items: /).textContent;
}

function shownTotal(): string | null {
  return screen.getByText(/^Total: /).textContent;
}

describe("Cart total", () => {
  it("shows the starting items and total", () => {
    render(<App />);

    expect(shownItems()).toBe("Items: 3");
    expect(shownTotal()).toBe("Total: $35.74");
  });

  it("updates items and total when a quantity goes up", () => {
    render(<App />);

    click("Increase Pen");

    expect(shownItems()).toBe("Items: 4");
    expect(shownTotal()).toBe("Total: $36.99");
  });

  it("updates items and total when a quantity goes down", () => {
    render(<App />);

    click("Increase Pen");
    click("Decrease Pen");

    expect(shownItems()).toBe("Items: 3");
    expect(shownTotal()).toBe("Total: $35.74");
  });

  it("updates items and total when a line is removed", () => {
    render(<App />);

    click("Remove Bag");

    expect(shownItems()).toBe("Items: 2");
    expect(shownTotal()).toBe("Total: $5.75");
  });

  it("applies the discount to the whole total", () => {
    render(<App />);

    toggleDiscount();

    expect(shownTotal()).toBe("Total: $32.17");
  });

  it("applies the discount to changes made while it is on", () => {
    render(<App />);

    toggleDiscount();
    click("Increase Notebook");

    expect(shownTotal()).toBe("Total: $36.22");
  });

  it("returns to the full total when the discount is turned off", () => {
    render(<App />);

    toggleDiscount();
    click("Increase Notebook");
    toggleDiscount();

    expect(shownTotal()).toBe("Total: $40.24");
  });
});
