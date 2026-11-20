import { describe, it, expect, beforeEach, afterEach } from "drillbox:test";
import { render, screen, within, fireEvent, act } from "@testing-library/react";
import App from "./App";
import { apiControl } from "./api";

function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function tick(name: string) {
  fireEvent.click(screen.getByRole("checkbox", { name }));
}

function openComments(title: string) {
  click(`Show comments for ${title}`);
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

function post(title: string) {
  return within(screen.getByRole("region", { name: title }));
}

/** Renders the feed and lets the posts, then the authors, arrive. */
async function renderFeed() {
  render(<App />);
  await release("posts");
  await release("users");
}

function shownCount(): string | null {
  return screen.getByText(/^Threads loaded: /).textContent;
}

function requestsMade(label: string): string[] {
  return apiControl.calls().filter((call) => call === label);
}

describe("Posts feed", () => {
  beforeEach(() => {
    apiControl.setManual();
  });

  afterEach(() => {
    apiControl.reset();
  });

  it("shows each post with its author", async () => {
    render(<App />);
    await release("posts");
    await release("users");

    expect(post("Alpha").queryByText("Author: Ada")).toBeInTheDocument();
    expect(post("Beta").queryByText("Author: Grace")).toBeInTheDocument();
  });

  it("shows a placeholder author until authors arrive", async () => {
    render(<App />);
    await release("posts");

    expect(post("Alpha").queryByText("Author: …")).toBeInTheDocument();
  });

  it("likes and un-likes a post", async () => {
    await renderFeed();

    click("Like Alpha");

    expect(screen.queryByRole("button", { name: "Unlike Alpha" })).toBeInTheDocument();

    click("Unlike Alpha");

    expect(screen.queryByRole("button", { name: "Like Alpha" })).toBeInTheDocument();
  });

  it("does not open comments when a post is liked", async () => {
    await renderFeed();

    click("Like Alpha");

    expect(apiControl.calls()).not.toContain("comments:1");
    expect(screen.queryByText("Loading comments…")).toBeNull();
  });

  it("shows the last clicked post's comments whatever order responses arrive in", async () => {
    await renderFeed();

    openComments("Alpha");
    openComments("Beta");
    await release("comments:2");
    await release("comments:1");

    expect(post("Beta").queryByText("Beta comment 1")).toBeInTheDocument();
    expect(screen.queryByText("Alpha comment 1")).toBeNull();
  });

  it("counts each thread once and does not ask twice", async () => {
    await renderFeed();
    openComments("Alpha");
    await release("comments:1");
    openComments("Beta");
    await release("comments:2");

    openComments("Alpha");
    if (apiControl.pending().includes("comments:1")) await release("comments:1");

    expect(shownCount()).toBe("Threads loaded: 2");
    expect(requestsMade("comments:1")).toHaveLength(1);
  });

  it("keeps a pin on its post when the order is reversed", async () => {
    await renderFeed();

    tick("Pin Alpha");
    tick("Newest first");

    expect(screen.getByRole("checkbox", { name: "Pin Alpha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pin Gamma" })).not.toBeChecked();
    expect(screen.getAllByRole("region")[0]).toHaveAccessibleName("Gamma");
  });

  it("shows an error under the post when its comments fail", async () => {
    await renderFeed();

    openComments("Alpha");
    await fail("comments:1");

    expect(post("Alpha").queryByRole("alert")?.textContent ?? null).toBe("Could not load comments");
    expect(screen.queryByText("Loading comments…")).toBeNull();
  });

  it("loads the comments on a second try after a failure", async () => {
    await renderFeed();
    openComments("Alpha");
    await fail("comments:1");

    openComments("Alpha");
    await release("comments:1");

    expect(post("Alpha").queryByText("Alpha comment 1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
