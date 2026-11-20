import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DrillMeta } from "@/lib/drills";
import { DrillList } from "./DrillList";

const INTRO =
  "Each drill is a pull request that runs but isn't ready to merge. Read the brief, find what's wrong, fix it.";

function meta(order: number, overrides: Partial<DrillMeta> = {}): DrillMeta {
  return {
    slug: `drill-${order}`,
    title: `Drill ${order}`,
    order,
    summary: `Summary of drill ${order}.`,
    skills: ["useEffect", "lists"],
    difficulty: 2,
    minutes: 10,
    hints: ["a hint"],
    ...overrides,
  };
}

const TEN: DrillMeta[] = Array.from({ length: 10 }, (_, i) => meta(i + 1));

describe("DrillList", () => {
  it("shows the heading and intro", () => {
    render(<DrillList drills={TEN} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^REACT REVIEW DRILLS$/);
    expect(screen.getByText(INTRO)).toBeInTheDocument();
  });

  it("renders one entry per drill, in order, with a zero-padded number", () => {
    const shuffled = [TEN[2], TEN[9], TEN[0], ...TEN.slice(3, 9), TEN[1]];
    render(<DrillList drills={shuffled} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(10);
    items.forEach((item, i) => {
      expect(item).toHaveTextContent(`Drill ${i + 1}`);
      expect(item).toHaveTextContent(String(i + 1).padStart(2, "0"));
    });
    expect(items[0]).toHaveTextContent(/^01/);
    expect(items[9]).toHaveTextContent(/^10/);
  });

  it("links each title to /drills/<slug>", () => {
    render(<DrillList drills={[meta(1, { slug: "fetch-on-every-keystroke", title: "Search box" })]} />);
    expect(screen.getByRole("link", { name: "Search box" })).toHaveAttribute(
      "href",
      "/drills/fetch-on-every-keystroke",
    );
  });

  it("shows the summary, upper-case skills and minutes", () => {
    render(
      <DrillList
        drills={[meta(1, { summary: "A form that forgets.", skills: ["useState", "forms"], minutes: 15 })]}
      />,
    );
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("A form that forgets.");
    expect(item).toHaveTextContent("USESTATE · FORMS");
    expect(item).toHaveTextContent("15 MIN");
  });

  it.each([1, 2, 3] as const)("shows difficulty %i as pips out of 3", (n) => {
    render(<DrillList drills={[meta(1, { difficulty: n })]} />);
    const pips = screen.getByRole("img", { name: `Difficulty ${n} of 3` });
    expect(pips.querySelectorAll(".drills-pip")).toHaveLength(3);
    expect(pips.querySelectorAll(".drills-pip-filled")).toHaveLength(n);
    expect(pips.querySelectorAll(".drills-pip-empty")).toHaveLength(3 - n);
  });

  it("shows no progress UI", () => {
    const { container } = render(<DrillList drills={TEN} />);
    expect(container).not.toHaveTextContent(/streak|done|today|solved|complete/i);
    expect(container.querySelector("[class*='status'], [class*='badge']")).toBeNull();
  });

  it("shows an empty state when there are no drills", () => {
    render(<DrillList drills={[]} />);
    expect(screen.getByText("No drills yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
