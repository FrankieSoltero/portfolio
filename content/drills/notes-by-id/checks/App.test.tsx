import { describe, it, expect } from "drillbox:test";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

function saveNote(task: string, text: string) {
  fireEvent.change(screen.getByLabelText(`Note for ${task}`), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: `Save note for ${task}` }));
}

function clearNote(task: string) {
  fireEvent.click(screen.getByRole("button", { name: `Clear note for ${task}` }));
}

function shownCount(): string | null {
  return screen.getByText(/^Notes saved: /).textContent;
}

describe("Notes by id", () => {
  it("shows a saved note under its task", () => {
    render(<App />);

    saveNote("Write tests", "mock the api");

    expect(screen.getByText("Note: mock the api")).toBeInTheDocument();
    expect(shownCount()).toBe("Notes saved: 1");
  });

  it("keeps earlier notes when another is saved", () => {
    render(<App />);

    saveNote("Write tests", "mock the api");
    saveNote("Fix build", "bump node");

    expect(screen.queryByText("Note: mock the api")).toBeInTheDocument();
    expect(screen.queryByText("Note: bump node")).toBeInTheDocument();
    expect(shownCount()).toBe("Notes saved: 2");
  });

  it("counts a task once when its note is saved again", () => {
    render(<App />);

    saveNote("Ship it", "tag the release");
    saveNote("Ship it", "write the changelog");

    expect(screen.queryByText("Note: tag the release")).not.toBeInTheDocument();
    expect(screen.queryByText("Note: write the changelog")).toBeInTheDocument();
    expect(shownCount()).toBe("Notes saved: 1");
  });

  it("clears only the chosen note", () => {
    render(<App />);

    saveNote("Write tests", "mock the api");
    saveNote("Fix build", "bump node");
    clearNote("Fix build");

    expect(screen.queryByText("Note: bump node")).not.toBeInTheDocument();
    expect(screen.queryByText("Note: mock the api")).toBeInTheDocument();
    expect(shownCount()).toBe("Notes saved: 1");
  });
});
