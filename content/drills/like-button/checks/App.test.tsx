import { describe, it, expect } from "drillbox:test";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("Like button", () => {
  it("shows every post as not liked to begin with", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Like First post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like Second post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like Third post" })).toBeInTheDocument();
    expect(screen.getByText("Liked: 0")).toBeInTheDocument();
  });

  it("marks a post as liked when its button is clicked", () => {
    render(<App />);

    click("Like First post");

    expect(screen.getByRole("button", { name: "Unlike First post" })).toBeInTheDocument();
    expect(screen.getByText("Liked: 1")).toBeInTheDocument();
  });

  it("keeps earlier likes when another post is liked", () => {
    render(<App />);

    click("Like First post");
    click("Like Third post");

    expect(screen.getByRole("button", { name: "Unlike First post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlike Third post" })).toBeInTheDocument();
    expect(screen.getByText("Liked: 2")).toBeInTheDocument();
  });

  it("un-likes only the post that was clicked", () => {
    render(<App />);

    click("Like First post");
    click("Like Second post");
    click("Unlike First post");

    expect(screen.getByRole("button", { name: "Like First post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlike Second post" })).toBeInTheDocument();
    expect(screen.getByText("Liked: 1")).toBeInTheDocument();
  });
});
