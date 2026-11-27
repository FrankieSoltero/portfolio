import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise } from "drillbox/schema";
import type { WorkspaceProps } from "drillbox/workspace";
import { DRAFT_KEY_PREFIX, loadDraft, saveDraft } from "@/drills/draft";
import { FRAME_URL } from "@/drills/frame";
import { markCompleted, PROGRESS_KEY, type DrillProgress } from "@/drills/progress";
import WorkspaceHostDefault, { WorkspaceHost } from "./WorkspaceHost";

type Summary = Parameters<NonNullable<WorkspaceProps["onResult"]>>[0];

// The real Workspace starts CodeMirror and two sandboxed iframes; the browser tests cover
// it. Here a stand-in records what the host passes on each mount and exposes buttons that
// call onChange and onResult with whatever the test puts in `fake`.
const fake = vi.hoisted(() => ({
  mounts: [] as { id: string; initialFiles: Record<string, string> | undefined }[],
  props: null as WorkspaceProps | null,
  edit: {} as Record<string, string>,
  summary: null as unknown,
}));

vi.mock("drillbox/workspace", async () => {
  const { useLayoutEffect, useState } = await import("react");
  function Workspace(props: WorkspaceProps): React.JSX.Element {
    fake.props = props;
    // What the props were when this instance mounted: the real workspace reads
    // initialFiles only then, so each remount is recorded once.
    const [mounted] = useState(() => ({ id: props.exercise.id, initialFiles: props.initialFiles }));
    useLayoutEffect(() => {
      fake.mounts.push(mounted);
    }, [mounted]);
    return (
      <div data-testid="workspace" data-exercise={props.exercise.id}>
        <button type="button" onClick={() => props.onChange?.(fake.edit)}>
          EDIT
        </button>
        <button type="button" onClick={() => props.onResult?.(fake.summary as Summary)}>
          RESULT
        </button>
      </div>
    );
  }
  return { Workspace };
});

vi.mock("@/drills/draft", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/drills/draft")>();
  return { ...actual, loadDraft: vi.fn(actual.loadDraft), saveDraft: vi.fn(actual.saveDraft) };
});

vi.mock("@/drills/progress", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/drills/progress")>();
  return { ...actual, markCompleted: vi.fn(actual.markCompleted) };
});

/** An exercise with one editable, one read-only and one hidden file besides the entry. */
function exercise(id: string): Exercise {
  return {
    id,
    language: "js",
    entry: "App.tsx",
    files: {
      "App.tsx": { code: `// ${id} App\n` },
      "util.ts": { code: `// ${id} util\n` },
      "api.ts": { code: "export const api = 1;\n", readOnly: true },
      "setup.ts": { code: "// hidden\n", hidden: true },
    },
    checks: { "App.test.tsx": "it('works', () => {});\n" },
    options: { react: true },
  };
}

const A = exercise("drill-a");
const B = exercise("drill-b");

function storeDraft(slug: string, files: Record<string, string>): void {
  window.localStorage.setItem(`${DRAFT_KEY_PREFIX}${slug}`, JSON.stringify({ version: 1, files }));
}

function storedDraft(slug: string): unknown {
  const raw = window.localStorage.getItem(`${DRAFT_KEY_PREFIX}${slug}`);
  return raw === null ? null : JSON.parse(raw);
}

function storedProgress(): DrillProgress | null {
  const raw = window.localStorage.getItem(PROGRESS_KEY);
  return raw === null ? null : (JSON.parse(raw) as DrillProgress);
}

function summary(status: string, passed: number, failed: number, total: number): Summary {
  return { status, mode: "checks", passed, failed, total, results: [], diagnostics: [], issues: [] } as unknown as Summary;
}

/** Renders the host and waits for the workspace, which mounts once the draft is read. */
async function mount(ex: Exercise): Promise<ReturnType<typeof render>> {
  const view = render(<WorkspaceHost exercise={ex} />);
  await screen.findByTestId("workspace");
  return view;
}

function reportResult(s: Summary): void {
  fake.summary = s;
  fireEvent.click(screen.getByRole("button", { name: "RESULT" }));
}

beforeEach(() => {
  window.localStorage.clear();
  fake.mounts = [];
  fake.props = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 23, 10, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("WorkspaceHost", () => {
  it("is the default export too, for next/dynamic", () => {
    expect(WorkspaceHostDefault).toBe(WorkspaceHost);
  });

  it("renders nothing and reads no storage before mount", () => {
    storeDraft(A.id, { "App.tsx": "// saved\n" });
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    expect(renderToString(<WorkspaceHost exercise={A} />)).toBe("");
    expect(getItem).not.toHaveBeenCalled();
    expect(loadDraft).not.toHaveBeenCalled();
    getItem.mockRestore();
  });

  it("shows the fallback it is given until the draft is read, then the workspace", async () => {
    render(<WorkspaceHost exercise={A} fallback={<h2>STARTER CODE</h2>} />);
    expect(screen.getByRole("heading", { name: "STARTER CODE" })).toBeInTheDocument();
    expect(loadDraft).not.toHaveBeenCalled();
    expect(screen.queryByTestId("workspace")).toBeNull();

    await screen.findByTestId("workspace");
    expect(loadDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "STARTER CODE" })).toBeNull();
  });

  it("renders nothing until the draft is read when it has no fallback", async () => {
    const { container } = render(<WorkspaceHost exercise={A} />);
    expect(container).toBeEmptyDOMElement();
    await screen.findByTestId("workspace");
  });

  it("reads the draft in an effect for the editable files only", async () => {
    await mount(A);
    expect(loadDraft).toHaveBeenCalledTimes(1);
    expect(loadDraft).toHaveBeenCalledWith("drill-a", ["App.tsx", "util.ts"]);
  });

  it("mounts the workspace with the saved draft and the frame URL", async () => {
    storeDraft(A.id, { "App.tsx": "// saved\n", "api.ts": "// tampered\n", "setup.ts": "// tampered\n" });
    await mount(A);
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-exercise", "drill-a");
    expect(fake.mounts).toEqual([{ id: "drill-a", initialFiles: { "App.tsx": "// saved\n" } }]);
    expect(fake.props?.frameUrl).toBe(FRAME_URL);
    expect(fake.props?.exercise).toBe(A);
  });

  it("mounts the workspace without initial files when nothing is saved", async () => {
    await mount(A);
    expect(fake.mounts).toEqual([{ id: "drill-a", initialFiles: undefined }]);
  });

  it("saves each edit against the editable starter code, and a reset removes the draft", async () => {
    await mount(A);
    const starter = { "App.tsx": "// drill-a App\n", "util.ts": "// drill-a util\n" };

    fake.edit = { "App.tsx": "// edited\n", "util.ts": "// drill-a util\n" };
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(saveDraft).toHaveBeenLastCalledWith("drill-a", fake.edit, starter);
    expect(storedDraft("drill-a")).toEqual({ version: 1, files: fake.edit });

    fake.edit = { ...starter };
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(storedDraft("drill-a")).toBeNull();
  });

  it("marks the drill done once when every check passes", async () => {
    await mount(A);
    reportResult(summary("completed", 3, 0, 3));
    expect(markCompleted).toHaveBeenCalledTimes(1);
    expect(markCompleted).toHaveBeenCalledWith(expect.anything(), "drill-a", "2026-11-23");
    expect(storedProgress()?.drills["drill-a"]).toEqual({ completedOn: "2026-11-23", revealed: false });
  });

  it.each([
    ["some checks failing", summary("completed", 2, 1, 3)],
    ["no checks", summary("completed", 0, 0, 0)],
    ["passed not equal to total", summary("completed", 2, 0, 3)],
    ["a failure counted beside full passes", summary("completed", 3, 1, 3)],
    ["compile-error", summary("compile-error", 0, 0, 0)],
    ["timeout", summary("timeout", 3, 0, 3)],
    ["unavailable", summary("unavailable", 3, 0, 3)],
    ["stopped", summary("stopped", 3, 0, 3)],
    ["invalid-exercise", summary("invalid-exercise", 0, 0, 0)],
    ["unsupported-language", summary("unsupported-language", 0, 0, 0)],
  ])("does not mark the drill done for %s", async (_name, s) => {
    await mount(A);
    reportResult(s);
    expect(markCompleted).not.toHaveBeenCalled();
    expect(storedProgress()).toBeNull();
  });

  it("keeps the first completion date when an already-done drill passes again", async () => {
    const earlier: DrillProgress = {
      version: 1,
      drills: { "drill-a": { completedOn: "2026-11-01", revealed: true } },
    };
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(earlier));
    await mount(A);
    expect(() => reportResult(summary("completed", 3, 0, 3))).not.toThrow();
    expect(storedProgress()).toEqual(earlier);
  });

  it("reads the next drill's draft before its workspace mounts, keyed by drill", async () => {
    storeDraft(A.id, { "App.tsx": "// a saved\n" });
    storeDraft(B.id, { "util.ts": "// b saved\n" });
    const { rerender } = await mount(A);
    rerender(<WorkspaceHost exercise={B} />);
    // Until drill-b's draft is read, nothing is shown: drill-a's workspace is gone at once.
    expect(screen.queryByTestId("workspace")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("workspace")).toHaveAttribute("data-exercise", "drill-b"));
    expect(fake.mounts).toEqual([
      { id: "drill-a", initialFiles: { "App.tsx": "// a saved\n" } },
      { id: "drill-b", initialFiles: { "util.ts": "// b saved\n" } },
    ]);
    expect(loadDraft).toHaveBeenLastCalledWith("drill-b", ["App.tsx", "util.ts"]);

    // Edits now go to drill-b's draft, never drill-a's.
    fake.edit = { "App.tsx": "// b edited\n", "util.ts": "// b saved\n" };
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    expect(storedDraft("drill-b")).toEqual({ version: 1, files: fake.edit });
    expect(storedDraft("drill-a")).toEqual({ version: 1, files: { "App.tsx": "// a saved\n" } });
  });
});
