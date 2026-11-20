import { describe, it, expect, beforeEach, afterEach } from "drillbox:test";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import App from "./App";
import { apiControl } from "./api";

async function release(label: string) {
  await act(async () => {
    apiControl.release(label);
  });
}

function shownNames(): string[] {
  return screen.queryAllByRole("listitem").map((item) => item.textContent ?? "");
}

function shownCount(): string | null {
  return screen.getByText(/^Results: /).textContent;
}

async function firstLoad() {
  render(<App />);
  await release("search::false");
  await waitFor(() => expect(shownNames()).toEqual(["Lamp", "Lantern", "Desk"]));
}

describe("Search filters", () => {
  beforeEach(() => {
    apiControl.setManual();
  });

  afterEach(() => {
    apiControl.reset();
  });

  it("shows results for the starting filters", async () => {
    render(<App />);

    await release("search::false");

    expect(shownNames()).toEqual(["Lamp", "Lantern", "Desk"]);
  });

  it("asks once for the current filters", async () => {
    await firstLoad();

    expect(apiControl.calls()).toEqual(["search::false"]);
  });

  it("asks again when the query changes", async () => {
    await firstLoad();

    fireEvent.change(screen.getByRole("textbox", { name: "Search products" }), {
      target: { value: "la" },
    });
    await release("search:la:false");

    expect(shownNames()).toEqual(["Lamp", "Lantern"]);
    expect(apiControl.calls()).toEqual(["search::false", "search:la:false"]);
  });

  it("asks again when In stock only is ticked", async () => {
    await firstLoad();

    fireEvent.click(screen.getByRole("checkbox", { name: "In stock only" }));
    await release("search::true");

    expect(shownNames()).toEqual(["Lamp", "Desk"]);
    expect(apiControl.calls()).toEqual(["search::false", "search::true"]);
  });

  it("shows a count that matches the list", async () => {
    await firstLoad();

    expect(shownCount()).toBe("Results: 3");
  });
});
