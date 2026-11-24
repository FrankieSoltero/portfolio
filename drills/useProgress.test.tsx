import { act, render, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drillStatus, EMPTY_PROGRESS, PROGRESS_KEY, type DrillProgress } from "./progress";
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

type Hook = ReturnType<typeof useProgress>;

/**
 * Renders two sibling components that each call useProgress(), and records the latest
 * value each one rendered and how many times each one mounted.
 */
function renderTwo() {
  const latest: { first?: Hook; second?: Hook } = {};
  const mounts = { first: 0, second: 0 };
  function Probe({ name }: { name: "first" | "second" }) {
    const value = useProgress();
    latest[name] = value;
    useEffect(() => {
      mounts[name] += 1;
    }, [name]);
    return null;
  }
  const view = render(
    <>
      <Probe name="first" />
      <Probe name="second" />
    </>,
  );
  const get = (name: "first" | "second"): Hook => {
    const value = latest[name];
    if (!value) throw new Error(`${name} never rendered`);
    return value;
  };
  return { view, mounts, first: () => get("first"), second: () => get("second") };
}

/** Delivers a `storage` event like the browser does when another tab writes. */
function storageEvent(key: string, newValue: string | null): void {
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
  });
}

describe("useProgress shared between components", () => {
  it("keeps a reveal from one component when another completes the drill", () => {
    const { first, second } = renderTwo();
    act(() => first().reveal("a"));
    act(() => second().complete("a"));
    expect(drillStatus(first().progress, "a")).toBe("done-with-help");
    expect(drillStatus(second().progress, "a")).toBe("done-with-help");
    expect(stored()).toEqual({
      version: 1,
      drills: { a: { completedOn: "2026-11-19", revealed: true } },
    });
  });

  it("updates the other component live, without remounting it", () => {
    const { first, second, mounts } = renderTwo();
    act(() => first().complete("a"));
    expect(second().progress.drills.a).toEqual({ completedOn: "2026-11-19", revealed: false });
    expect(mounts).toEqual({ first: 1, second: 1 });
  });

  it("shows progress another tab stored, and ignores other keys", () => {
    const { first, second } = renderTwo();
    storageEvent("something-else", JSON.stringify(STORED));
    expect(first().progress).toEqual(EMPTY_PROGRESS);
    storageEvent(PROGRESS_KEY, JSON.stringify(STORED));
    expect(first().progress).toEqual(STORED);
    expect(second().progress).toEqual(STORED);
    storageEvent(PROGRESS_KEY, "{not json");
    expect(first().progress).toEqual(EMPTY_PROGRESS);
    expect(second().progress).toEqual(EMPTY_PROGRESS);
  });

  it("re-reads storage before a write, keeping another tab's record", () => {
    const { first } = renderTwo();
    // Another tab writes and no event reaches this tab.
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(STORED));
    act(() => first().complete("b"));
    const expected: DrillProgress = {
      version: 1,
      drills: { ...STORED.drills, b: { completedOn: "2026-11-19", revealed: false } },
    };
    expect(stored()).toEqual(expected);
    expect(first().progress).toEqual(expected);
  });

  it("removes the storage listener when the last component unmounts", () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const { view } = renderTwo();
    const storageAdds = added.mock.calls.filter(([type]) => type === "storage");
    expect(storageAdds).toHaveLength(1);
    expect(removed.mock.calls.filter(([type]) => type === "storage")).toHaveLength(0);
    view.unmount();
    const storageRemoves = removed.mock.calls.filter(([type]) => type === "storage");
    expect(storageRemoves).toHaveLength(1);
    expect(storageRemoves[0][1]).toBe(storageAdds[0][1]);
  });
});
