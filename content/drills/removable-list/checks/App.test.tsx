import { describe, it, expect } from "drillbox:test";
import { render, screen, within, fireEvent } from "@testing-library/react";
import App from "./App";

function plusOne(guest: string): HTMLElement {
  return screen.getByRole("checkbox", { name: `Plus one for ${guest}` });
}

function removeGuest(guest: string) {
  fireEvent.click(screen.getByRole("button", { name: `Remove ${guest}` }));
}

function addGuest(guest: string) {
  fireEvent.change(screen.getByLabelText("Guest name"), { target: { value: guest } });
  fireEvent.click(screen.getByRole("button", { name: "Add guest" }));
}

/** The guest named on each row, top to bottom, read from the row's remove button. */
function shownGuests(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((row) => within(row).getByRole("button", { name: /^Remove / }).textContent?.replace(/^Remove /, "") ?? "");
}

describe("Removable list", () => {
  it("lists the guests in order", () => {
    render(<App />);

    expect(shownGuests()).toEqual(["Ada", "Grace", "Linus"]);
  });

  it("keeps other guests' plus-one choices when one is removed", () => {
    render(<App />);

    fireEvent.click(plusOne("Grace"));
    removeGuest("Ada");

    expect(plusOne("Grace")).toBeChecked();
    expect(plusOne("Linus")).not.toBeChecked();
  });

  it("keeps existing choices when a guest is added at the top", () => {
    render(<App />);

    fireEvent.click(plusOne("Ada"));
    addGuest("Alan");

    expect(plusOne("Ada")).toBeChecked();
    expect(plusOne("Alan")).not.toBeChecked();
  });

  it("removes only the chosen guest after earlier changes", () => {
    render(<App />);

    removeGuest("Ada");
    addGuest("Alan");
    removeGuest("Alan");

    expect(shownGuests()).toEqual(["Grace", "Linus"]);
  });
});
