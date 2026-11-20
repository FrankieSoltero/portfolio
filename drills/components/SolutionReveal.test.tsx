import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolutionReveal } from "./SolutionReveal";

const { reveal } = vi.hoisted(() => ({ reveal: vi.fn() }));

vi.mock("@/drills/useProgress", () => ({
  useProgress: () => ({
    progress: { version: 1, drills: {} },
    ready: true,
    complete: vi.fn(),
    reveal,
  }),
}));

afterEach(() => {
  reveal.mockClear();
});

function renderReveal() {
  return render(
    <SolutionReveal slug="like-button">
      <pre>fixed code</pre>
      <p>Why it broke.</p>
    </SolutionReveal>,
  );
}

describe("SolutionReveal", () => {
  it("offers REVEAL THE FIX and keeps the solution hidden", () => {
    renderReveal();
    expect(screen.getByRole("button", { name: "REVEAL THE FIX" })).toBeInTheDocument();
    expect(screen.getByText("fixed code")).not.toBeVisible();
    expect(screen.getByText("Why it broke.")).not.toBeVisible();
    expect(screen.getByText("fixed code").closest("[hidden]")).not.toBeNull();
    expect(reveal).not.toHaveBeenCalled();
  });

  it("shows the solution, records the reveal once and removes the button on click", () => {
    renderReveal();
    fireEvent.click(screen.getByRole("button", { name: "REVEAL THE FIX" }));

    expect(screen.getByText("fixed code")).toBeVisible();
    expect(screen.getByText("Why it broke.")).toBeVisible();
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith("like-button");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("has no completion control", () => {
    const { container } = renderReveal();
    fireEvent.click(screen.getByRole("button", { name: "REVEAL THE FIX" }));
    expect(container).not.toHaveTextContent(/mark as done|done|complete/i);
  });
});
