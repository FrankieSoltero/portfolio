import fs from "fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAdjacentDrills,
  getAllDrills,
  getDrillBySlug,
  type Drill,
  type DrillMeta,
} from "@/lib/drills";
import DrillPage, { dynamicParams, generateMetadata, generateStaticParams } from "./page";

// The real loader over content/drills, with two seams so a test can give the page a
// read-only file or neighbours on both sides.
vi.mock("@/lib/drills", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drills")>();
  return {
    ...actual,
    getDrillBySlug: vi.fn(actual.getDrillBySlug),
    getAdjacentDrills: vi.fn(actual.getAdjacentDrills),
  };
});

const SLUG = "like-button";
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

function likeButton(): Drill {
  const drill = getDrillBySlug(SLUG);
  if (!drill) throw new Error(`missing drill ${SLUG}`);
  return drill;
}

function neighbour(order: number, title: string): DrillMeta {
  return { ...likeButton().meta, slug: `drill-${order}`, order, title };
}

async function renderPage(slug = SLUG) {
  return render(await DrillPage(params(slug)));
}

/** The section whose h2 is `name`. */
function section(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name });
  const el = heading.closest("section");
  if (!el) throw new Error(`no section for ${name}`);
  return el;
}

describe("drill page: routing", () => {
  it("prerenders exactly the drills on disk", () => {
    expect(dynamicParams).toBe(false);
    expect(generateStaticParams()).toEqual(getAllDrills().map((d) => ({ slug: d.meta.slug })));
    expect(generateStaticParams()).toContainEqual({ slug: SLUG });
  });

  it("rejects an unknown slug with Next's not-found error", async () => {
    await expect(DrillPage(params("nope"))).rejects.toMatchObject(NOT_FOUND);
  });

  it("rejects a malformed slug without reading the disk", async () => {
    const spies = [
      vi.spyOn(fs, "existsSync"),
      vi.spyOn(fs, "readdirSync"),
      vi.spyOn(fs, "readFileSync"),
      vi.spyOn(fs, "statSync"),
    ];
    await expect(DrillPage(params("../x"))).rejects.toMatchObject(NOT_FOUND);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("titles the page with the drill title and describes it with its summary", async () => {
    const meta = await generateMetadata(params(SLUG));
    expect(meta.title).toBe("Like button");
    expect(meta.description).toBe(likeButton().meta.summary);
  });
});

describe("drill page: content", () => {
  it("shows the title and the meta line", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Like button$/);
    expect(
      screen.getByText("DRILL 1 · 8 MIN · array state, immutable updates", { exact: true }),
    ).toBeInTheDocument();
  });

  it("puts the sections in order", async () => {
    await renderPage();
    const sections = ["THE PULL REQUEST", "STARTER CODE", "HINTS", "THE FIX"];
    const names = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent)
      .filter((t) => t !== null && sections.includes(t));
    expect(names).toEqual(sections);
  });

  it("renders the brief as markdown under THE PULL REQUEST", async () => {
    await renderPage();
    const brief = section("THE PULL REQUEST");
    expect(brief).toHaveTextContent("This PR runs, but it isn't ready to merge.");
    expect(within(brief).getByRole("heading", { name: "What the feature should do" })).toBeInTheDocument();
    expect(within(brief).getAllByRole("listitem")).toHaveLength(4);
    expect(brief.querySelector("code")).toHaveTextContent("App.tsx");
  });

  it("shows each starter file under STARTER CODE, labelled and highlighted", async () => {
    await renderPage();
    const starter = section("STARTER CODE");
    expect(within(starter).getByText("App.tsx", { exact: true })).toBeInTheDocument();
    expect(starter).not.toHaveTextContent("READ-ONLY");
    const pre = starter.querySelector("pre.shiki.tokyo-night");
    expect(pre).not.toBeNull();
    expect(pre).toHaveTextContent("likedIds.push(postId);");
    expect(pre?.querySelector("span[style]")).not.toBeNull();
  });

  it("labels a read-only file READ-ONLY", async () => {
    const drill = likeButton();
    vi.mocked(getDrillBySlug).mockReturnValueOnce({
      ...drill,
      files: [...drill.files, { path: "api.ts", code: "export const x = 1;\n", readOnly: true }],
    });
    await renderPage();
    const starter = section("STARTER CODE");
    const label = within(starter).getByText("api.ts", { exact: true }).closest("figcaption");
    expect(label).toHaveTextContent("READ-ONLY");
    const app = within(starter).getByText("App.tsx", { exact: true }).closest("figcaption");
    expect(app).not.toHaveTextContent("READ-ONLY");
  });

  it("never renders the checks", async () => {
    const { container } = await renderPage();
    expect(container).not.toHaveTextContent("App.test.tsx");
    expect(container).not.toHaveTextContent("un-likes only the post that was clicked");
    expect(container).not.toHaveTextContent("drillbox:test");
  });

  it("shows the hints button with no hint text yet", async () => {
    await renderPage();
    const hints = section("HINTS");
    expect(within(hints).getByRole("button", { name: "REVEAL HINT 1 OF 3" })).toBeInTheDocument();
    for (const hint of likeButton().meta.hints) {
      expect(hints).not.toHaveTextContent(hint);
    }
  });

  it("keeps the fix hidden behind REVEAL THE FIX", async () => {
    await renderPage();
    const fix = section("THE FIX");
    expect(fix).toHaveTextContent(
      "The fixed code, with an explanation of each bug and the rule to remember. Try the drill first.",
    );
    const solutionCode = fix.querySelector("pre.shiki.tokyo-night");
    expect(solutionCode).toHaveTextContent("setLikedIds([...likedIds, postId]);");
    expect(solutionCode).not.toBeVisible();
    expect(within(fix).getByText("Liking a post changed nothing on screen")).not.toBeVisible();
  });

  it("shows the solution files and explanation after the reveal", async () => {
    await renderPage();
    const fix = section("THE FIX");
    fireEvent.click(within(fix).getByRole("button", { name: "REVEAL THE FIX" }));
    expect(within(fix).queryByRole("button")).toBeNull();
    expect(within(fix).getByText("App.tsx", { exact: true })).toBeVisible();
    expect(fix.querySelector("pre.shiki.tokyo-night")).toBeVisible();
    expect(
      within(fix).getByRole("heading", { name: "Un-liking a post removed the wrong ones" }),
    ).toBeVisible();
  });

  it("has no completion control", async () => {
    const { container } = await renderPage();
    expect(container).not.toHaveTextContent(/mark as done/i);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "REVEAL HINT 1 OF 3",
      "REVEAL THE FIX",
    ]);
  });
});

describe("drill page: navigation", () => {
  it("links both neighbours of a middle drill and all drills", async () => {
    vi.mocked(getAdjacentDrills).mockReturnValueOnce({
      prev: neighbour(1, "Earlier drill"),
      next: neighbour(3, "Later drill"),
    });
    await renderPage();
    const nav = screen.getByRole("navigation", { name: "Adjacent drills" });
    expect(within(nav).getByRole("link", { name: "◀ Earlier drill" })).toHaveAttribute(
      "href",
      "/drills/drill-1",
    );
    expect(within(nav).getByRole("link", { name: "Later drill ▶" })).toHaveAttribute(
      "href",
      "/drills/drill-3",
    );
    expect(within(nav).getByRole("link", { name: "ALL DRILLS" })).toHaveAttribute("href", "/drills");
  });

  it("omits the missing side at the ends", async () => {
    vi.mocked(getAdjacentDrills).mockReturnValueOnce({ prev: null, next: neighbour(2, "Later drill") });
    await renderPage();
    let nav = screen.getByRole("navigation", { name: "Adjacent drills" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "ALL DRILLS",
      "Later drill ▶",
    ]);

    cleanup();
    vi.mocked(getAdjacentDrills).mockReturnValueOnce({ prev: neighbour(0, "Earlier drill"), next: null });
    await renderPage();
    nav = screen.getByRole("navigation", { name: "Adjacent drills" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "◀ Earlier drill",
      "ALL DRILLS",
    ]);
  });
});
