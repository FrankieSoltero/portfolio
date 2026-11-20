import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROGRESS, PROGRESS_KEY, type DrillProgress } from "./progress";
import { useProgress } from "./useProgress";

const STORED: DrillProgress = {
  version: 1,
  drills: { "first-drill": { completedOn: "2026-11-18", revealed: false } },
};

/** What is currently written under PROGRESS_KEY, parsed. */
function stored(): unknown {
  const raw = window.localStorage.getItem(PROGRESS_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 19, 9, 30));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("useProgress", () => {
  it("renders empty and not ready first, like the server render", () => {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(STORED));
    const renders: ReturnType<typeof useProgress>[] = [];
    renderHook(() => {
      const value = useProgress();
      renders.push(value);
      return value;
    });
    expect(renders[0].ready).toBe(false);
    expect(renders[0].progress).toEqual(EMPTY_PROGRESS);
  });

  it("loads stored progress after mount", () => {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(STORED));
    const { result } = renderHook(() => useProgress());
    expect(result.current.ready).toBe(true);
    expect(result.current.progress).toEqual(STORED);
  });

  it("is ready with empty progress when nothing valid is stored", () => {
    window.localStorage.setItem(PROGRESS_KEY, "{not json");
    const { result } = renderHook(() => useProgress());
    expect(result.current.ready).toBe(true);
    expect(result.current.progress).toEqual(EMPTY_PROGRESS);
  });

  it("completes a drill today and saves it", () => {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(STORED));
    const { result } = renderHook(() => useProgress());
    act(() => result.current.complete("second-drill"));
    const expected: DrillProgress = {
      version: 1,
      drills: {
        ...STORED.drills,
        "second-drill": { completedOn: "2026-11-19", revealed: false },
      },
    };
    expect(result.current.progress).toEqual(expected);
    expect(stored()).toEqual(expected);
  });

  it("reveals a drill and saves it", () => {
    const { result } = renderHook(() => useProgress());
    act(() => result.current.reveal("first-drill"));
    const expected: DrillProgress = {
      version: 1,
      drills: { "first-drill": { completedOn: null, revealed: true } },
    };
    expect(result.current.progress).toEqual(expected);
    expect(stored()).toEqual(expected);
  });

  it("keeps both changes when reveal and complete happen together", () => {
    const { result } = renderHook(() => useProgress());
    act(() => {
      result.current.reveal("a");
      result.current.complete("a");
    });
    const expected = { completedOn: "2026-11-19", revealed: true };
    expect(result.current.progress.drills.a).toEqual(expected);
    expect(stored()).toEqual({ version: 1, drills: { a: expected } });
  });

  it("still works in memory when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useProgress());
    expect(result.current.ready).toBe(true);
    expect(result.current.progress).toEqual(EMPTY_PROGRESS);
    act(() => result.current.reveal("a"));
    expect(result.current.progress.drills.a).toEqual({ completedOn: null, revealed: true });
  });

  it("still works in memory when storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const { result } = renderHook(() => useProgress());
    act(() => result.current.complete("a"));
    act(() => result.current.reveal("b"));
    expect(result.current.progress.drills).toEqual({
      a: { completedOn: "2026-11-19", revealed: false },
      b: { completedOn: null, revealed: true },
    });
  });
});
