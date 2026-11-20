import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApi } from "./api-control";

/** Tracks how a promise settles so tests can assert it has not settled yet. */
function track<T>(promise: Promise<T>) {
  const state: { settled: boolean; value?: T; error?: unknown } = { settled: false };
  promise.then(
    (value) => Object.assign(state, { settled: true, value }),
    (error) => Object.assign(state, { settled: true, error })
  );
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createApi — auto mode", () => {
  it("resolves no earlier than 200 ms at the shortest delay", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { control, request } = createApi();
    const call = track(request("a", 1));
    expect(control.calls()).toEqual(["a"]);
    expect(control.pending()).toEqual([]);
    await vi.advanceTimersByTimeAsync(199);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(call).toEqual({ settled: true, value: 1 });
  });

  it("resolves no later than 1200 ms at the longest delay", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const { request } = createApi();
    const call = track(request("a", 1));
    await vi.advanceTimersByTimeAsync(1198);
    expect(call.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(call).toEqual({ settled: true, value: 1 });
  });
});

describe("createApi — manual mode", () => {
  it("keeps a request pending until it is released", async () => {
    const { control, request } = createApi();
    control.setManual();
    const call = track(request("a", 1));
    await vi.advanceTimersByTimeAsync(5000);
    expect(call.settled).toBe(false);
    expect(control.pending()).toEqual(["a"]);
    expect(control.calls()).toEqual(["a"]);
  });

  it("release resolves the call with its value and removes it from pending", async () => {
    const { control, request } = createApi();
    control.setManual();
    const call = track(request("a", { id: 7 }));
    control.release("a");
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toEqual({ settled: true, value: { id: 7 } });
    expect(control.pending()).toEqual([]);
  });

  it("release resolves only the oldest of two calls with the same label", async () => {
    const { control, request } = createApi();
    control.setManual();
    const first = track(request("a", 1));
    const second = track(request("a", 2));
    control.release("a");
    await vi.advanceTimersByTimeAsync(0);
    expect(first).toEqual({ settled: true, value: 1 });
    expect(second.settled).toBe(false);
    expect(control.pending()).toEqual(["a"]);
  });

  it("fail rejects with Request failed by default, or with the given message", async () => {
    const { control, request } = createApi();
    control.setManual();
    const plain = track(request("a", 1));
    const custom = track(request("b", 1));
    control.fail("a");
    control.fail("b", "boom");
    await vi.advanceTimersByTimeAsync(0);
    expect(plain.error).toEqual(new Error("Request failed"));
    expect(custom.error).toEqual(new Error("boom"));
    expect(control.pending()).toEqual([]);
  });

  it("release and fail throw when nothing with that label is pending", () => {
    const { control, request } = createApi();
    control.setManual();
    void request("a", 1);
    expect(() => control.release("x")).toThrow(new Error("No pending call: x"));
    expect(() => control.fail("x")).toThrow(new Error("No pending call: x"));
  });
});

describe("createApi — reset", () => {
  it("returns to auto mode with empty pending and calls", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { control, request } = createApi();
    control.setManual();
    void request("a", 1);
    control.reset();
    expect(control.pending()).toEqual([]);
    expect(control.calls()).toEqual([]);
    const call = track(request("b", 2));
    await vi.advanceTimersByTimeAsync(200);
    expect(call).toEqual({ settled: true, value: 2 });
  });

  it("leaves earlier calls, manual or in flight, never settling", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { control, request } = createApi();
    const inFlight = track(request("auto", 1));
    control.setManual();
    const held = track(request("held", 2));
    control.reset();
    await vi.advanceTimersByTimeAsync(5000);
    expect(inFlight.settled).toBe(false);
    expect(held.settled).toBe(false);
    expect(() => control.release("held")).toThrow(new Error("No pending call: held"));
  });
});
