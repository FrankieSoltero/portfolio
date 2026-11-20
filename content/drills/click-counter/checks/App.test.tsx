import { describe, it, expect, beforeEach, afterEach } from "drillbox:test";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "./App";
import { apiControl } from "./api";

function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function shownCount(): string | null {
  return screen.getByText(/^Count: /).textContent;
}

async function releaseSave() {
  await act(async () => {
    apiControl.release("save");
  });
}

describe("Click counter", () => {
  beforeEach(() => {
    apiControl.setManual();
  });

  afterEach(() => {
    apiControl.reset();
  });

  it("starts at zero", () => {
    render(<App />);

    expect(shownCount()).toBe("Count: 0");
  });

  it("adds one", () => {
    render(<App />);

    click("Add 1");

    expect(shownCount()).toBe("Count: 1");
  });

  it("adds three in one click", () => {
    render(<App />);

    click("Add 3");

    expect(shownCount()).toBe("Count: 3");
  });

  it("keeps clicks made while a save is in progress", async () => {
    render(<App />);

    click("Add 1 after saving");
    click("Add 1");
    click("Add 1");
    await releaseSave();

    expect(shownCount()).toBe("Count: 3");
  });

  it("counts two saves started back to back", async () => {
    render(<App />);

    click("Add 1 after saving");
    click("Add 1 after saving");
    await releaseSave();
    await releaseSave();

    expect(shownCount()).toBe("Count: 2");
  });
});
