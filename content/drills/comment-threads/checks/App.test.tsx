import { describe, it, expect, beforeEach, afterEach } from "drillbox:test";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import App from "./App";
import { apiControl } from "./api";

function open(title: string) {
  fireEvent.click(screen.getByRole("button", { name: `Show comments for ${title}` }));
}

async function release(label: string) {
  await act(async () => {
    apiControl.release(label);
  });
}

function post(title: string) {
  return within(screen.getByRole("region", { name: title }));
}

function shownCount(): string | null {
  return screen.getByText(/^Threads loaded: /).textContent;
}

describe("Comment threads", () => {
  beforeEach(() => {
    apiControl.setManual();
  });

  afterEach(() => {
    apiControl.reset();
  });

  it("opens the comments under the post that was clicked", async () => {
    render(<App />);

    open("Alpha");
    await release("comments:1");

    expect(post("Alpha").queryByText("Alpha comment 1")).toBeInTheDocument();
    expect(shownCount()).toBe("Threads loaded: 1");
  });

  it("does not show another post's comments while a thread loads", async () => {
    render(<App />);
    open("Alpha");
    await release("comments:1");

    open("Beta");

    expect(post("Beta").queryByText("Loading comments…")).toBeInTheDocument();
    expect(screen.queryByText("Alpha comment 1")).toBeNull();
  });

  it("shows the last clicked post's comments whatever order responses arrive in", async () => {
    render(<App />);

    open("Alpha");
    open("Beta");
    await release("comments:2");
    await release("comments:1");

    expect(post("Beta").queryByText("Beta comment 1")).toBeInTheDocument();
    expect(screen.queryByText("Alpha comment 1")).toBeNull();
    expect(shownCount()).toBe("Threads loaded: 2");
  });

  it("counts each thread once", async () => {
    render(<App />);
    open("Alpha");
    await release("comments:1");
    open("Beta");
    await release("comments:2");

    expect(shownCount()).toBe("Threads loaded: 2");

    open("Alpha");
    if (apiControl.pending().includes("comments:1")) await release("comments:1");

    expect(shownCount()).toBe("Threads loaded: 2");
  });

  it("does not request a thread it already has", async () => {
    render(<App />);
    open("Alpha");
    await release("comments:1");
    open("Beta");
    await release("comments:2");

    open("Alpha");

    expect(apiControl.calls()).toEqual(["comments:1", "comments:2"]);
    expect(post("Alpha").queryByText("Alpha comment 1")).toBeInTheDocument();
  });
});
