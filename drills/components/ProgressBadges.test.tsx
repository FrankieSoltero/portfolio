import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_KEY, type DrillProgress, type DrillRecord } from "@/drills/progress";
import { ProgressBadges } from "./ProgressBadges";

const SLUGS = Array.from({ length: 10 }, (_, i) => `drill-${i + 1}`);

// Fake "now": 19 November 2026, so completion dates below are fixed calendar days.
const TODAY = "2026-11-19";

function done(completedOn: string, revealed = false): DrillRecord {
  return { completedOn, revealed };
}

function seed(drills: Record<string, DrillRecord>): void {
  const progress: DrillProgress = { version: 1, drills };
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
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

describe("ProgressBadges", () => {
  it("renders an empty badges paragraph before storage is read, like the server", () => {
    seed({ "drill-1": done(TODAY) });
    expect(renderToString(<ProgressBadges slugs={SLUGS} />)).toBe('<p class="drills-badges"></p>');
  });

  it("shows the streak and the done count once progress is loaded", () => {
    // Three listed drills done on consecutive days, plus one completion of a drill that is
    // no longer listed on the day before: streak 4, count 3.
    seed({
      "drill-1": done("2026-11-19"),
      "drill-2": done("2026-11-18"),
      "drill-3": done("2026-11-17", true),
      "retired-drill": done("2026-11-16"),
    });
    const { container } = render(<ProgressBadges slugs={SLUGS} />);
    const badges = container.querySelector("p.drills-badges");
    expect(badges).not.toBeNull();
    const spans = badges!.querySelectorAll(":scope > span.drills-badge");
    expect(spans).toHaveLength(2);
    expect(spans[0]).toHaveClass("drills-badge-streak");
    expect(spans[0]).toHaveTextContent(/^STREAK: 4 DAYS$/);
    expect(spans[1]).toHaveClass("drills-badge-done");
    expect(spans[1]).toHaveTextContent(/^3 \/ 10 DONE$/);
  });

  it.each([
    [0, {}, "STREAK: 0 DAYS"],
    [1, { "drill-1": done("2026-11-19") }, "STREAK: 1 DAY"],
    [2, { "drill-1": done("2026-11-19"), "drill-2": done("2026-11-18") }, "STREAK: 2 DAYS"],
  ] as const)("words a streak of %i as %s", (_n, drills, text) => {
    seed(drills);
    render(<ProgressBadges slugs={SLUGS} />);
    expect(screen.getByText(text)).toHaveClass("drills-badge-streak");
  });

  it("ignores records for slugs that are not drills in the count", () => {
    seed({
      "drill-1": done("2026-11-10"),
      "drill-2": done("2026-11-10"),
      "not-a-drill": done("2026-11-10"),
    });
    render(<ProgressBadges slugs={SLUGS} />);
    expect(screen.getByText("2 / 10 DONE")).toHaveClass("drills-badge-done");
  });
});

// CSS processing is off under vitest, so the stylesheet is read as text (as tokens.test.ts does).
const DRILLS_CSS = fs
  .readFileSync(path.join(process.cwd(), "app", "drills", "drills.css"), "utf-8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** Declarations of the rule whose selector is exactly `selector`, as property → value. */
function declarations(selector: string): Record<string, string> {
  for (const [, prelude, body] of DRILLS_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (prelude.trim().replace(/\s+/g, " ") !== selector) continue;
    return Object.fromEntries(
      body
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const colon = d.indexOf(":");
          return [d.slice(0, colon).trim(), d.slice(colon + 1).trim().replace(/\s+/g, " ")];
        }),
    );
  }
  return {};
}

describe("progress styles in drills.css", () => {
  it("lays the badges out as a wrapping mono row", () => {
    expect(declarations(".drills .drills-badges")).toMatchObject({
      display: "flex",
      "flex-wrap": "wrap",
      gap: "16px",
      "font-family": expect.stringMatching(/^var\(--font-mono\)/),
      "font-size": "22px",
      margin: "0",
    });
  });

  it("frames each badge on the panel colour", () => {
    expect(declarations(".drills .drills-badge")).toMatchObject({
      background: "var(--panel)",
      "box-shadow": "0 -3px #000, 0 3px #000, -3px 0 #000, 3px 0 #000",
      padding: "6px 14px",
    });
  });

  it.each([
    [".drills .drills-badge-streak", "var(--slime)"],
    [".drills .drills-badge-done", "var(--gold)"],
    [".drills .drills-status-done", "var(--slime)"],
    [".drills .drills-status-helped", "var(--gold)"],
    [".drills .drills-status-today", "var(--cyan)"],
  ])("colours %s with %s", (selector, colour) => {
    expect(declarations(selector)).toMatchObject({ color: colour });
  });

  it("sets the entry status in 10px pixel type", () => {
    expect(declarations(".drills .drills-entry-status")).toMatchObject({
      "font-family": expect.stringMatching(/^var\(--font-pixel\)/),
      "font-size": "10px",
    });
  });
});
