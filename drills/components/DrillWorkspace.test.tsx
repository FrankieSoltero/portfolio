import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exercise } from "drillbox/schema";
import type { WorkspaceProps } from "drillbox/workspace";
import { DRAFT_KEY_PREFIX } from "@/drills/draft";

const ERROR_MESSAGE = "The workspace could not start. The starter code is below; your saved code is kept.";

// For code under app/, Next aliases `next/dynamic` to its App Router implementation
// (React.lazy + Suspense, load errors thrown to the nearest error boundary). Outside Next
// the bare specifier resolves to the Pages Router one, which hands load errors to
// `loading` instead; this makes the tests run what the site runs.
vi.mock("next/dynamic", () => import("next/dist/api/app-dynamic"));

// Shared with the mocks below: `gate` holds the WorkspaceHost import open, `failImport`
// makes it reject, `throwOnRender` makes the stand-in workspace throw, `mounts` records
// each workspace mount.
const control = vi.hoisted(() => {
  let open: () => void = () => {};
  const state = {
    gate: Promise.resolve(),
    failImport: false,
    throwOnRender: false,
    mounts: [] as { id: string; initialFiles: Record<string, string> | undefined }[],
    hold(): void {
      state.gate = new Promise<void>((resolve) => {
        open = resolve;
      });
    },
    release(): void {
      open();
    },
  };
  return state;
});

/**
 * `./WorkspaceHost` is loaded through next/dynamic. Registered per test (with a fresh
 * module graph) because a mocked module that loaded once stays loaded for the file.
 */
function mockHostImport(): void {
  vi.doMock("./WorkspaceHost", async (importOriginal) => {
    await control.gate;
    if (control.failImport) throw new Error("chunk load failed");
    return importOriginal<typeof import("./WorkspaceHost")>();
  });
}

// The real Workspace starts CodeMirror and two sandboxed iframes; the browser tests cover
// it. This stand-in records each mount and can throw while rendering.
vi.mock("drillbox/workspace", async () => {
  const { useLayoutEffect, useState } = await import("react");
  function Workspace(props: WorkspaceProps): React.JSX.Element {
    if (control.throwOnRender) throw new Error("workspace crashed");
    const [mounted] = useState(() => ({ id: props.exercise.id, initialFiles: props.initialFiles }));
    useLayoutEffect(() => {
      control.mounts.push(mounted);
    }, [mounted]);
    return (
      <div data-testid="workspace">
        <h2>WORKSPACE</h2>
      </div>
    );
  }
  return { Workspace };
});

const EXERCISE: Exercise = {
  id: "like-button",
  language: "js",
  entry: "App.tsx",
  files: { "App.tsx": { code: "export default function App() { return null; }\n" } },
  checks: { "App.test.tsx": "it('works', () => {});\n" },
  options: { react: true },
};

// The page passes the server-rendered STARTER CODE section content.
const FALLBACK = (
  <>
    <h2 className="drills-section-title">STARTER CODE</h2>
    <div className="drills-files">
      <figure className="drills-file">
        <figcaption className="drills-file-label">App.tsx</figcaption>
      </figure>
    </div>
  </>
);

let DrillWorkspace: typeof import("./DrillWorkspace").DrillWorkspace;

/** The HTML a server renders: no `window`, so next/dynamic bails out to the client. */
function serverHtml(): string {
  vi.stubGlobal("window", undefined);
  try {
    return renderToString(element());
  } finally {
    vi.unstubAllGlobals();
  }
}

function element(): React.JSX.Element {
  return <DrillWorkspace exercise={EXERCISE} fallback={FALLBACK} />;
}

function wrapper(container: HTMLElement): HTMLElement {
  const section = container.querySelector("section");
  if (!section) throw new Error("no section");
  return section;
}

function headings(el: HTMLElement): string[] {
  return [...el.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => h.textContent ?? "");
}

/** Lets pending imports, effects and promises run. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  // A fresh module graph per test, so every test starts with WorkspaceHost not yet imported.
  vi.resetModules();
  mockHostImport();
  ({ DrillWorkspace } = await import("./DrillWorkspace"));
  window.localStorage.clear();
  control.gate = Promise.resolve();
  control.failImport = false;
  control.throwOnRender = false;
  control.mounts = [];
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("DrillWorkspace", () => {
  it("shows the fallback, an alert and RETRY when the workspace fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    control.failImport = true;
    const { container } = render(element());
    await screen.findByRole("alert");

    const section = wrapper(container);
    expect(within(section).getByRole("alert")).toHaveTextContent(new RegExp(`^${ERROR_MESSAGE.replace(/[.;]/g, "\\$&")}$`));
    expect(within(section).getByRole("alert")).toHaveClass("drills-workspace-error");
    expect(within(section).getByRole("button", { name: "RETRY" })).toHaveClass("drills-button");
    expect(headings(section)).toEqual(["STARTER CODE"]);
    expect(within(section).getByText("App.tsx")).toBeInTheDocument();

    control.failImport = false;
    fireEvent.click(within(section).getByRole("button", { name: "RETRY" }));
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(headings(section)).toEqual(["WORKSPACE"]);
  });

  it("renders the fallback inside the wrapper section on the server", () => {
    const html = serverHtml();
    expect(html.startsWith('<section class="drills-section drills-workspace">')).toBe(true);
    expect(html).toContain('<h2 class="drills-section-title">STARTER CODE</h2>');
    expect(html).toContain('<figcaption class="drills-file-label">App.tsx</figcaption>');
    expect(html).not.toContain("WORKSPACE");
  });

  it("renders the same markup on the first client render as on the server", () => {
    control.hold();
    const server = serverHtml()
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<template[^>]*><\/template>/g, "");
    const { container } = render(element());
    expect(container.innerHTML).toBe(server);
    control.release();
  });

  it("shows the fallback while the workspace loads, then replaces it", async () => {
    control.hold();
    const { container } = render(element());
    const section = wrapper(container);
    await settle();
    expect(headings(section)).toEqual(["STARTER CODE"]);
    expect(screen.queryByTestId("workspace")).toBeNull();

    control.release();
    expect(await screen.findByTestId("workspace")).toBeInTheDocument();
    expect(headings(section)).toEqual(["WORKSPACE"]);
    expect(section).not.toHaveTextContent("STARTER CODE");
  });

  it("keeps the fallback up until the workspace has read the draft", async () => {
    control.hold();
    const { container } = render(element());
    const section = wrapper(container);
    await settle();
    // The headings in the section after every batch of DOM changes until the workspace is up.
    const seen: string[][] = [];
    const observer = new MutationObserver(() => seen.push(headings(section)));
    observer.observe(section, { childList: true, subtree: true });

    control.release();
    await screen.findByTestId("workspace");
    observer.disconnect();
    expect(seen.length).toBeGreaterThan(0);
    for (const batch of seen) expect(batch).not.toEqual([]);
    expect(headings(section)).toEqual(["WORKSPACE"]);
  });

  it("moves focus to the workspace section after RETRY", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    control.failImport = true;
    const { container } = render(element());
    await screen.findByRole("alert");
    const section = wrapper(container);
    expect(section).not.toHaveAttribute("tabindex");

    const retryButton = within(section).getByRole("button", { name: "RETRY" });
    retryButton.focus();
    control.failImport = false;
    fireEvent.click(retryButton);
    expect(section).toHaveAttribute("tabindex", "-1");
    expect(section).toHaveFocus();
    await screen.findByTestId("workspace");
    expect(section).toHaveFocus();
  });

  it("recovers from a workspace that throws while rendering, keeping the saved code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const saved = { "App.tsx": "// my fix\n" };
    window.localStorage.setItem(`${DRAFT_KEY_PREFIX}like-button`, JSON.stringify({ version: 1, files: saved }));
    control.throwOnRender = true;
    const { container } = render(element());
    await screen.findByRole("alert");

    const section = wrapper(container);
    expect(within(section).getByRole("alert")).toHaveTextContent(ERROR_MESSAGE);
    expect(headings(section)).toEqual(["STARTER CODE"]);

    control.throwOnRender = false;
    fireEvent.click(within(section).getByRole("button", { name: "RETRY" }));
    await screen.findByTestId("workspace");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(control.mounts).toEqual([{ id: "like-button", initialFiles: saved }]);
    expect(window.localStorage.getItem(`${DRAFT_KEY_PREFIX}like-button`)).not.toBeNull();
  });
});
