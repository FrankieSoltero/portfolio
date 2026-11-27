import { describe, expect, it } from "vitest";
import {
  completedCount,
  drillStatus,
  EMPTY_PROGRESS,
  localDate,
  markCompleted,
  markRevealed,
  parseProgress,
  streak,
  todaysDrill,
  type DrillProgress,
  type DrillRecord,
} from "./progress";

/** Progress with the given records, filling in the version. */
function progressOf(drills: Record<string, DrillRecord>): DrillProgress {
  return { version: 1, drills };
}

/** Progress where each date is one completed, unrevealed drill. */
function completedOn(...dates: string[]): DrillProgress {
  return progressOf(
    Object.fromEntries(dates.map((date, i) => [`drill-${i}`, { completedOn: date, revealed: false }])),
  );
}

describe("parseProgress", () => {
  const valid = JSON.stringify(
    progressOf({ "first-drill": { completedOn: "2026-11-19", revealed: true } }),
  );

  it("reads valid stored progress", () => {
    expect(parseProgress(valid)).toEqual(
      progressOf({ "first-drill": { completedOn: "2026-11-19", revealed: true } }),
    );
  });

  it.each([
    ["null", null],
    ["invalid JSON", "{not json"],
    ["the wrong shape", JSON.stringify({ version: 1, drills: [1, 2] })],
    ["a record with the wrong shape", JSON.stringify({ version: 1, drills: { a: { done: true } } })],
    ["version 2", JSON.stringify({ version: 2, drills: {} })],
    ["a bad date", JSON.stringify(progressOf({ a: { completedOn: "yesterday", revealed: false } }))],
    ["an impossible date", JSON.stringify(progressOf({ a: { completedOn: "2026-02-30", revealed: false } }))],
  ])("treats %s as empty", (_label, raw) => {
    expect(parseProgress(raw)).toEqual(EMPTY_PROGRESS);
  });
});

describe("markCompleted", () => {
  it("records today's date without changing the input", () => {
    const before = progressOf({});
    const after = markCompleted(before, "a", "2026-11-19");
    expect(after.drills.a).toEqual({ completedOn: "2026-11-19", revealed: false });
    expect(before).toEqual(progressOf({}));
  });

  it("keeps the first completion date", () => {
    const before = progressOf({ a: { completedOn: "2026-11-18", revealed: false } });
    expect(markCompleted(before, "a", "2026-11-19").drills.a.completedOn).toBe("2026-11-18");
  });

  it("keeps an earlier reveal", () => {
    const before = progressOf({ a: { completedOn: null, revealed: true } });
    expect(markCompleted(before, "a", "2026-11-19").drills.a).toEqual({
      completedOn: "2026-11-19",
      revealed: true,
    });
  });
});

describe("markRevealed", () => {
  it("marks a drill revealed before it is completed", () => {
    const before = progressOf({});
    expect(markRevealed(before, "a").drills.a).toEqual({ completedOn: null, revealed: true });
    expect(before).toEqual(progressOf({}));
  });

  it("leaves a completed drill unchanged", () => {
    const before = progressOf({ a: { completedOn: "2026-11-19", revealed: false } });
    expect(markRevealed(before, "a")).toEqual(before);
  });
});

describe("drillStatus", () => {
  it("is done when completed without a reveal", () => {
    expect(drillStatus(completedOn("2026-11-19"), "drill-0")).toBe("done");
  });

  it("is done-with-help when completed after a reveal", () => {
    const p = progressOf({ a: { completedOn: "2026-11-19", revealed: true } });
    expect(drillStatus(p, "a")).toBe("done-with-help");
  });

  it("is todo otherwise", () => {
    const p = progressOf({ a: { completedOn: null, revealed: true } });
    expect(drillStatus(p, "a")).toBe("todo");
    expect(drillStatus(p, "missing")).toBe("todo");
    expect(drillStatus(p, "constructor")).toBe("todo");
  });
});

describe("todaysDrill", () => {
  it("is the first drill in order that is not completed", () => {
    const p = progressOf({ a: { completedOn: "2026-11-19", revealed: false } });
    expect(todaysDrill(["a", "b", "c"], p)).toBe("b");
  });

  it("is null when every drill is completed", () => {
    const done = { completedOn: "2026-11-19", revealed: false };
    expect(todaysDrill(["a", "b", "c"], progressOf({ a: done, b: done, c: done }))).toBeNull();
  });
});

describe("completedCount", () => {
  it("counts only completed drills in the list", () => {
    const done = { completedOn: "2026-11-19", revealed: false };
    const p = progressOf({ a: done, b: { completedOn: null, revealed: true }, gone: done });
    expect(completedCount(["a", "b", "c"], p)).toBe(1);
  });
});

describe("streak", () => {
  it.each<[string, string[], string, number]>([
    ["no completions", [], "2026-11-19", 0],
    ["a completion today only", ["2026-11-19"], "2026-11-19", 1],
    ["a completion yesterday only", ["2026-11-18"], "2026-11-19", 1],
    ["a run of days ending today", ["2026-11-17", "2026-11-18", "2026-11-19"], "2026-11-19", 3],
    ["a broken run", ["2026-11-15", "2026-11-16", "2026-11-18"], "2026-11-19", 1],
    ["a latest completion two days ago", ["2026-11-17"], "2026-11-19", 0],
    ["two completions on one day", ["2026-11-19", "2026-11-19"], "2026-11-19", 1],
    ["a run across months", ["2026-10-31", "2026-11-01"], "2026-11-01", 2],
  ])("is right for %s", (_label, dates, today, expected) => {
    expect(streak(completedOn(...dates), today)).toBe(expected);
  });
});

describe("localDate", () => {
  it("formats the local calendar date", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
