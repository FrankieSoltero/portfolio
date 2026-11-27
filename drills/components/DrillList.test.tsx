import { render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_KEY, type DrillProgress, type DrillRecord } from "@/drills/progress";
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

function seed(drills: Record<string, DrillRecord>): void {
  const progress: DrillProgress = { version: 1, drills };
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/** Status text of each entry, in list order. */
function statuses(): string[] {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".drills-entry-status")?.textContent ?? "missing");
}

function badgeTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".drills-index-header .drills-badge")].map(
    (b) => b.textContent ?? "",
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 19, 9, 30));
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

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

  it("renders the progress elements empty before storage is read, like the server", () => {
    seed({ "drill-1": { completedOn: "2026-11-19", revealed: false } });
    const html = renderToString(<DrillList drills={TEN} />);
    expect(html).toContain('<p class="drills-badges"></p>');
    expect(html.match(/<span class="drills-entry-status"><\/span>/g)).toHaveLength(10);
    expect(html).not.toMatch(/STREAK|DONE|TODAY/);
  });

  it("places the badges after the intro and each status after the entry title", () => {
    const { container } = render(<DrillList drills={TEN} />);
    const intro = container.querySelector("header.drills-index-header > p.drills-intro");
    expect(intro?.nextElementSibling).toHaveClass("drills-badges");
    for (const item of container.querySelectorAll("li.drills-entry")) {
      const title = item.querySelector(":scope > h2.drills-entry-title");
      expect(title?.nextElementSibling).toHaveClass("drills-entry-status");
    }
  });

  it("with nothing done: first drill is TODAY, streak 0, 0 / 10 done", () => {
    const { container } = render(<DrillList drills={TEN} />);
    expect(statuses()).toEqual(["TODAY", "", "", "", "", "", "", "", "", ""]);
    expect(badgeTexts(container)).toEqual(["STREAK: 0 DAYS", "0 / 10 DONE"]);
  });

  it("with some done: done drills are marked and the first not done is TODAY", () => {
    seed({
      "drill-1": { completedOn: "2026-11-18", revealed: false },
      "drill-2": { completedOn: "2026-11-19", revealed: true },
      "drill-4": { completedOn: "2026-11-19", revealed: false },
    });
    const { container } = render(<DrillList drills={TEN} />);
    expect(statuses()).toEqual(["DONE", "DONE WITH HELP", "TODAY", "DONE", "", "", "", "", "", ""]);
    expect(badgeTexts(container)).toEqual(["STREAK: 2 DAYS", "3 / 10 DONE"]);
  });

  it("with all done: no entry is TODAY and the count is 10 / 10", () => {
    const drills: Record<string, DrillRecord> = {};
    for (const d of TEN) drills[d.slug] = { completedOn: "2026-11-19", revealed: false };
    seed(drills);
    const { container } = render(<DrillList drills={TEN} />);
    expect(statuses()).toEqual(Array.from({ length: 10 }, () => "DONE"));
    expect(container).not.toHaveTextContent("TODAY");
    expect(badgeTexts(container)).toEqual(["STREAK: 1 DAY", "10 / 10 DONE"]);
  });

  it("shows an empty state when there are no drills", () => {
    render(<DrillList drills={[]} />);
    expect(screen.getByText("No drills yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
