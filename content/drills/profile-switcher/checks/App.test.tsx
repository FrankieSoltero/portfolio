import { describe, it, expect, beforeEach, afterEach } from "drillbox:test";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "./App";
import { apiControl } from "./api";

function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

async function release(label: string) {
  await act(async () => {
    apiControl.release(label);
  });
}

async function fail(label: string) {
  await act(async () => {
    apiControl.fail(label);
  });
}

function shownName(): string | null {
  return screen.queryByRole("heading")?.textContent ?? null;
}

function shownAlert(): string | null {
  return screen.queryByRole("alert")?.textContent ?? null;
}

function loadingShown(): boolean {
  return screen.queryByText("Loading…") !== null;
}

describe("Profile switcher", () => {
  beforeEach(() => {
    apiControl.setManual();
  });

  afterEach(() => {
    apiControl.reset();
  });

  it("shows Loading… and then the first profile", async () => {
    render(<App />);

    expect(loadingShown()).toBe(true);

    await release("user:1");

    expect(loadingShown()).toBe(false);
    expect(shownName()).toBe("Ada");
    expect(screen.queryByText("Role: Engineer")).toBeInTheDocument();
  });

  it("shows Loading… while a newly chosen profile is on its way", async () => {
    render(<App />);
    await release("user:1");

    click("Show Grace");

    expect(loadingShown()).toBe(true);
    expect(shownName()).not.toBe("Ada");
  });

  it("shows the last chosen profile whatever order responses arrive in", async () => {
    render(<App />);

    click("Show Grace");
    click("Show Linus");
    await release("user:3");
    await release("user:2");
    await release("user:1");

    expect(shownName()).toBe("Linus");
    expect(screen.queryByText("Role: Maintainer")).toBeInTheDocument();
  });

  it("shows an error when the profile cannot be loaded", async () => {
    render(<App />);

    await fail("user:1");

    expect(shownAlert()).toBe("Could not load profile");
    expect(loadingShown()).toBe(false);
  });

  it("recovers when another user is chosen after an error", async () => {
    render(<App />);
    await fail("user:1");

    click("Show Grace");
    await release("user:2");

    expect(shownName()).toBe("Grace");
    expect(screen.queryByText("Role: Admiral")).toBeInTheDocument();
    expect(shownAlert()).toBeNull();
  });
});
