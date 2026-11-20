import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDrillsDir, writeDrill } from "@/drills/testing/fixtures/loader/drillFixture";
import {
  DRILLS_DIR,
  getAdjacentDrills,
  getAllDrills,
  getDrillBySlug,
  toExercise,
} from "./drills";

let root: string;

beforeEach(() => {
  root = makeDrillsDir();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("DRILLS_DIR", () => {
  it("points at content/drills under the working directory", () => {
    expect(DRILLS_DIR).toBe(path.join(process.cwd(), "content", "drills"));
  });
});

describe("getAllDrills", () => {
  it("returns [] when the directory does not exist", () => {
    expect(getAllDrills(path.join(root, "nope"))).toEqual([]);
  });

  it("returns drills sorted by order", () => {
    writeDrill(root, "beta", { meta: { order: 2 } });
    writeDrill(root, "alpha", { meta: { order: 1 } });
    writeDrill(root, "gamma", { meta: { order: 3 } });
    expect(getAllDrills(root).map((d) => d.meta.order)).toEqual([1, 2, 3]);
    expect(getAllDrills(root).map((d) => d.meta.slug)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("skips folders starting with _ or .", () => {
    writeDrill(root, "real");
    writeDrill(root, "_draft", { meta: { order: 2 } });
    writeDrill(root, ".hidden", { meta: { order: 3 } });
    expect(getAllDrills(root).map((d) => d.meta.slug)).toEqual(["real"]);
  });

  it("loads brief, explanation, starter, solution and checks", () => {
    writeDrill(root, "full", { files: { "starter/utils.ts": "export const u = 1;\n" } });
    const [drill] = getAllDrills(root);
    expect(drill.brief).toBe("# Brief\n");
    expect(drill.explanation).toBe("# Explanation\n");
    expect(drill.files.map((f) => f.path)).toEqual(["App.tsx", "api.ts", "utils.ts"]);
    expect(drill.solutionFiles.map((f) => f.path)).toEqual(["App.tsx"]);
    expect(drill.solutionFiles[0].code).toContain("fixed");
    expect(drill.checks).toEqual({ "App.test.tsx": "// check source\n" });
  });

  it("marks api.ts read-only and App.tsx editable", () => {
    writeDrill(root, "ro");
    const [drill] = getAllDrills(root);
    expect(drill.files.find((f) => f.path === "api.ts")?.readOnly).toBe(true);
    expect(drill.files.find((f) => f.path === "App.tsx")?.readOnly).toBe(false);
  });

  it.each([
    ["difficulty 4", { difficulty: 4 }, "difficulty"],
    ["empty hints", { hints: [] }, "hints"],
    ["missing title", { title: undefined }, "title"],
  ])("throws listing each issue for invalid meta (%s)", (_name, meta, field) => {
    writeDrill(root, "bad-meta", { meta });
    expect(() => getAllDrills(root)).toThrow(/^Invalid drill bad-meta:\n {2}- /);
    expect(() => getAllDrills(root)).toThrow(new RegExp(`\\n {2}- ${field}: \\S`));
  });

  it("lists every issue when meta has several problems", () => {
    writeDrill(root, "bad-meta", { meta: { difficulty: 4, hints: [] } });
    let message = "";
    try {
      getAllDrills(root);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/^Invalid drill bad-meta:/);
    expect(message).toMatch(/\n {2}- difficulty: /);
    expect(message).toMatch(/\n {2}- hints: /);
  });

  it("rejects unknown keys in meta.json", () => {
    writeDrill(root, "extra-key", { meta: { colour: "red" } });
    expect(() => getAllDrills(root)).toThrow(/^Invalid drill extra-key:[\s\S]*colour/);
  });

  it.each([
    ["brief.md"],
    ["explanation.md"],
    ["starter/App.tsx"],
    ["solution/App.tsx"],
    ["checks/App.test.tsx"],
  ])("throws naming the missing required file (%s)", (missing) => {
    writeDrill(root, "incomplete", { files: { [missing]: null } });
    const named = missing.startsWith("checks/") ? "checks/*.test.tsx" : missing;
    expect(() => getAllDrills(root)).toThrow(/^Invalid drill incomplete:/);
    expect(() => getAllDrills(root)).toThrow(named);
  });

  it("throws on a duplicate order", () => {
    writeDrill(root, "first", { meta: { order: 2 } });
    writeDrill(root, "second", { meta: { order: 2 } });
    expect(() => getAllDrills(root)).toThrow("Duplicate drill order 2: first, second");
  });

  it("throws when a folder name is not a slug", () => {
    writeDrill(root, "Bad_Name");
    expect(() => getAllDrills(root)).toThrow("Invalid drill folder name: Bad_Name");
  });
});

describe("getDrillBySlug", () => {
  it("returns the drill for a known slug", () => {
    writeDrill(root, "known");
    expect(getDrillBySlug("known", root)?.meta.slug).toBe("known");
  });

  it("returns null for a bad slug without touching the filesystem", () => {
    const inner = path.join(root, "inner");
    fs.mkdirSync(inner);
    writeDrill(root, "x");
    const spies = [
      vi.spyOn(fs, "existsSync"),
      vi.spyOn(fs, "readdirSync"),
      vi.spyOn(fs, "readFileSync"),
      vi.spyOn(fs, "statSync"),
    ];
    expect(getDrillBySlug("../x", inner)).toBeNull();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("returns null for a valid slug with no folder", () => {
    writeDrill(root, "present");
    expect(getDrillBySlug("absent", root)).toBeNull();
  });
});

describe("getAdjacentDrills", () => {
  beforeEach(() => {
    writeDrill(root, "one", { meta: { order: 1 } });
    writeDrill(root, "two", { meta: { order: 2 } });
    writeDrill(root, "three", { meta: { order: 3 } });
  });

  it("gives the lower order as prev and the higher as next", () => {
    const { prev, next } = getAdjacentDrills("two", root);
    expect(prev?.slug).toBe("one");
    expect(next?.slug).toBe("three");
  });

  it("gives null at both ends", () => {
    expect(getAdjacentDrills("one", root).prev).toBeNull();
    expect(getAdjacentDrills("three", root).next).toBeNull();
  });
});

describe("toExercise", () => {
  it("maps a drill to the Drillbox exercise format", () => {
    writeDrill(root, "exercise");
    const drill = getAllDrills(root)[0];
    expect(toExercise(drill)).toEqual({
      id: "exercise",
      language: "js",
      files: {
        "App.tsx": { code: drill.files[0].code },
        "api.ts": { code: "export const api = {};\n", readOnly: true },
      },
      entry: "App.tsx",
      checks: { "App.test.tsx": "// check source\n" },
      options: { react: true },
    });
    expect("readOnly" in toExercise(drill).files["App.tsx"]).toBe(false);
  });
});
