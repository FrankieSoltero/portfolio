import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HintList } from "./HintList";

const HINTS = ["Look at the click handler.", "The list is changed in place.", "Make a new array."];

describe("HintList", () => {
  it("shows no hints at first and offers hint 1 of 3", () => {
    render(<HintList hints={HINTS} />);
    for (const hint of HINTS) expect(screen.queryByText(hint)).toBeNull();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "REVEAL HINT 1 OF 3" })).toBeInTheDocument();
  });

  it("reveals hints one per click, in order", () => {
    render(<HintList hints={HINTS} />);
    fireEvent.click(screen.getByRole("button", { name: "REVEAL HINT 1 OF 3" }));
    fireEvent.click(screen.getByRole("button", { name: "REVEAL HINT 2 OF 3" }));

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([HINTS[0], HINTS[1]]);
    expect(screen.queryByText(HINTS[2])).toBeNull();
    expect(screen.getByRole("button", { name: "REVEAL HINT 3 OF 3" })).toBeInTheDocument();
  });

  it("removes the button once every hint is shown", () => {
    render(<HintList hints={HINTS} />);
    for (let n = 1; n <= 3; n++) {
      fireEvent.click(screen.getByRole("button", { name: `REVEAL HINT ${n} OF 3` }));
    }
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(HINTS);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
