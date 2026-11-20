import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DrillsShell } from "./DrillsShell";

describe("DrillsShell", () => {
  it("links home to / with a plain anchor", () => {
    render(<DrillsShell>content</DrillsShell>);
    const home = screen.getByRole("link", { name: "◀ FRANCISCO SOLTERO" });
    expect(home.tagName).toBe("A");
    expect(home).toHaveAttribute("href", "/");
  });

  it("shows the DRILLS wordmark linking to /drills", () => {
    render(<DrillsShell>content</DrillsShell>);
    expect(screen.getByRole("link", { name: "DRILLS" })).toHaveAttribute("href", "/drills");
  });

  it("renders the footer line", () => {
    render(<DrillsShell>content</DrillsShell>);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "react review drills · find the bugs, fix the PR",
    );
  });

  it("puts the children inside main.drills-page", () => {
    render(
      <DrillsShell>
        <p>drill body</p>
      </DrillsShell>,
    );
    const main = screen.getByRole("main");
    expect(main).toHaveClass("drills-page");
    expect(main).toHaveTextContent("drill body");
  });
});
