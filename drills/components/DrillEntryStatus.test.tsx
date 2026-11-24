import { render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_KEY, type DrillProgress, type DrillRecord } from "@/drills/progress";
import { DrillEntryStatus } from "./DrillEntryStatus";

const SLUGS = ["drill-1", "drill-2", "drill-3"];

function seed(drills: Record<string, DrillRecord>): void {
  const progress: DrillProgress = { version: 1, drills };
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/** The single status span rendered for `slug`. */
function statusOf(slug: string): HTMLElement {
  const { container } = render(<DrillEntryStatus slug={slug} slugs={SLUGS} />);
  const spans = container.querySelectorAll<HTMLElement>("span.drills-entry-status");
  expect(spans).toHaveLength(1);
  return spans[0];
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

describe("DrillEntryStatus", () => {
  it("renders an empty status span before storage is read, like the server", () => {
    seed({ "drill-1": { completedOn: "2026-11-19", revealed: false } });
    expect(renderToString(<DrillEntryStatus slug="drill-1" slugs={SLUGS} />)).toBe(
      '<span class="drills-entry-status"></span>',
    );
  });

  it("shows TODAY on the first drill not yet done", () => {
    seed({ "drill-1": { completedOn: "2026-11-18", revealed: false } });
    const status = statusOf("drill-2");
    expect(status).toHaveTextContent(/^TODAY$/);
    expect(status).toHaveClass("drills-status-today");
  });

  it("shows nothing on a drill not done that is not today's", () => {
    seed({ "drill-1": { completedOn: "2026-11-18", revealed: false } });
    const status = statusOf("drill-3");
    expect(status).toHaveTextContent(/^$/);
    expect(status.className).toBe("drills-entry-status");
  });

  it("shows DONE on a drill completed without help", () => {
    seed({ "drill-1": { completedOn: "2026-11-18", revealed: false } });
    const status = statusOf("drill-1");
    expect(status).toHaveTextContent(/^DONE$/);
    expect(status).toHaveClass("drills-status-done");
  });

  it("shows DONE WITH HELP on a drill completed after revealing the fix", () => {
    seed({ "drill-1": { completedOn: "2026-11-18", revealed: true } });
    const status = statusOf("drill-1");
    expect(status).toHaveTextContent(/^DONE WITH HELP$/);
    expect(status).toHaveClass("drills-status-helped");
  });
});
