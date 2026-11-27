import fs from "fs";
import os from "os";
import path from "path";
import * as vitest from "vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as drillbox from "./drillbox-test";
import { drillResolver, resolveDrillImport, type DrillVariant } from "./resolver";

const drillsDir = path.join("/repo", "content", "drills");
const at = (...parts: string[]) => path.join(drillsDir, "demo", ...parts);

/** Resolves `source` from `importer` against a fake tree holding `files`. */
function resolve(source: string, importer: string, variant: DrillVariant, files: string[]) {
  const existing = new Set(files);
  return resolveDrillImport({ source, importer, variant, drillsDir, exists: (p) => existing.has(p) });
}

const CHECK = at("checks", "App.test.tsx");
const TREE = [at("starter", "App.tsx"), at("starter", "api.ts"), at("solution", "App.tsx")];

describe("resolveDrillImport", () => {
  it("points a check's ./App at the starter for the starter variant", () => {
    expect(resolve("./App", CHECK, "starter", TREE)).toBe(at("starter", "App.tsx"));
  });

  it("points a check's ./App at the solution for the solution variant", () => {
    expect(resolve("./App", CHECK, "solution", TREE)).toBe(at("solution", "App.tsx"));
  });

  it("falls back to the starter's api.ts when the solution has none", () => {
    expect(resolve("./api", CHECK, "solution", TREE)).toBe(at("starter", "api.ts"));
  });

  it("resolves the solution's own ./api import to the starter's api.ts", () => {
    expect(resolve("./api", at("solution", "App.tsx"), "solution", TREE)).toBe(at("starter", "api.ts"));
  });

  it("prefers a file the solution provides over the starter's", () => {
    const tree = [...TREE, at("solution", "api.ts")];
    expect(resolve("./api", CHECK, "solution", tree)).toBe(at("solution", "api.ts"));
  });

  it("does not fall back to the solution for the starter variant", () => {
    expect(resolve("./util", CHECK, "starter", [at("solution", "util.ts")])).toBeNull();
  });

  it("tries .tsx before .ts", () => {
    const tree = [at("starter", "App.ts"), at("starter", "App.tsx")];
    expect(resolve("./App", CHECK, "starter", tree)).toBe(at("starter", "App.tsx"));
    expect(resolve("./App", CHECK, "starter", [at("starter", "App.ts")])).toBe(at("starter", "App.ts"));
  });

  it("defers non-relative sources and importers outside a drill", () => {
    expect(resolve("react", CHECK, "starter", TREE)).toBeNull();
    expect(resolve("./App", path.join("/repo", "lib", "x.test.ts"), "starter", TREE)).toBeNull();
    expect(resolve("./App", path.join(drillsDir, "demo", "brief.md"), "starter", TREE)).toBeNull();
  });

  it("defers a source that escapes the drill", () => {
    const tree = [...TREE, path.join(drillsDir, "other", "starter", "App.tsx")];
    expect(resolve("../other/App", CHECK, "starter", tree)).toBeNull();
    expect(resolve("./../../other/starter/App", CHECK, "starter", tree)).toBeNull();
  });

  it("ignores a query string on the importer", () => {
    expect(resolve("./App", `${CHECK}?v=1`, "starter", TREE)).toBe(at("starter", "App.tsx"));
  });

  it("returns null when no candidate exists", () => {
    expect(resolve("./Missing", CHECK, "solution", TREE)).toBeNull();
  });
});

describe("drillResolver", () => {
  it("is a pre-enforced Vite plugin that defers imports outside drills", () => {
    const plugin = drillResolver("starter");
    expect(plugin.name).toBe("drills:resolver");
    expect(plugin.enforce).toBe("pre");
    const resolveId = plugin.resolveId as (source: string, importer?: string) => string | null;
    expect(resolveId("./App", path.join(process.cwd(), "lib", "x.ts"))).toBeNull();
    expect(resolveId("./App", undefined)).toBeNull();
  });
});

describe("vitest.drills.config.mts", () => {
  // A non-literal specifier keeps tsc from type-checking the .mts import.
  const configPath = path.join(process.cwd(), "vitest.drills.config.mts");

  interface DrillsConfig {
    plugins: { name: string }[];
    resolve: { alias: Record<string, string> };
    test: {
      include: string[];
      environment: string;
      setupFiles: string[];
      testTimeout: number;
      dangerouslyIgnoreUnhandledErrors: boolean;
      onUnhandledError?: (error: { VITEST_TEST_PATH?: string }) => void;
      fsModuleCache: boolean;
    };
  }

  async function loadConfig(env: Record<string, string | undefined>): Promise<DrillsConfig> {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.resetModules();
    const mod = (await import(/* @vite-ignore */ configPath)) as { default: DrillsConfig };
    return mod.default;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "", "both"])("throws when DRILL_VARIANT is %s", async (value) => {
    await expect(loadConfig({ DRILL_VARIANT: value, DRILL_SLUG: undefined })).rejects.toThrow(
      "DRILL_VARIANT must be starter or solution"
    );
  });

  it.each(["starter", "solution"])("installs the drill resolver for %s", async (variant) => {
    const config = await loadConfig({ DRILL_VARIANT: variant, DRILL_SLUG: undefined });
    expect(config.plugins.flat().map((p) => p.name)).toContain("drills:resolver");
  });

  it("collects every drill's checks when DRILL_SLUG is unset, one drill's when set", async () => {
    const all = await loadConfig({ DRILL_VARIANT: "starter", DRILL_SLUG: undefined });
    expect(all.test.include).toEqual(["content/drills/*/checks/**/*.test.tsx"]);
    const one = await loadConfig({ DRILL_VARIANT: "starter", DRILL_SLUG: "like-button" });
    expect(one.test.include).toEqual(["content/drills/like-button/checks/**/*.test.tsx"]);
  });

  it("refuses a DRILL_SLUG that is not a slug", async () => {
    await expect(loadConfig({ DRILL_VARIANT: "starter", DRILL_SLUG: "../x" })).rejects.toThrow(
      "Unknown drill: ../x"
    );
  });

  it("aliases drillbox:test and sets the exact test options", async () => {
    const config = await loadConfig({ DRILL_VARIANT: "starter", DRILL_SLUG: undefined });
    expect(config.resolve.alias["drillbox:test"]).toBe(
      path.join(process.cwd(), "drills", "testing", "drillbox-test.ts")
    );
    expect(config.test.environment).toBe("jsdom");
    expect(config.test.testTimeout).toBe(3000);
    expect(config.test.setupFiles).toEqual(["drills/testing/setup.ts"]);
  });

  // A check file's transform bakes in where ./App resolved, which differs per variant;
  // a transform cached by the starter run would point the solution run at the starter.
  it("never reuses cached transforms between variant runs", async () => {
    const config = await loadConfig({ DRILL_VARIANT: "solution", DRILL_SLUG: undefined });
    expect(config.test.fsModuleCache).toBe(false);
  });

  it("tolerates unhandled errors for starter only", async () => {
    const starter = await loadConfig({ DRILL_VARIANT: "starter", DRILL_SLUG: undefined });
    expect(starter.test.dangerouslyIgnoreUnhandledErrors).toBe(true);
    expect(starter.test.onUnhandledError).toBeUndefined();
    const solution = await loadConfig({ DRILL_VARIANT: "solution", DRILL_SLUG: undefined });
    expect(solution.test.dangerouslyIgnoreUnhandledErrors).toBe(false);
  });

  it("records the test file of each solution unhandled error in DRILL_UNHANDLED_LOG", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "drills-config-"));
    const log = path.join(dir, "unhandled.log");
    try {
      const config = await loadConfig({ DRILL_VARIANT: "solution", DRILL_SLUG: undefined, DRILL_UNHANDLED_LOG: log });
      config.test.onUnhandledError?.({ VITEST_TEST_PATH: "/repo/content/drills/demo/checks/App.test.tsx" });
      config.test.onUnhandledError?.({});
      expect(fs.readFileSync(log, "utf-8")).toBe('"/repo/content/drills/demo/checks/App.test.tsx"\nnull\n');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("drillbox:test", () => {
  it("re-exports exactly describe, it, expect, beforeEach and afterEach from vitest", () => {
    expect(Object.keys(drillbox).sort()).toEqual(["afterEach", "beforeEach", "describe", "expect", "it"]);
    expect(drillbox.describe).toBe(vitest.describe);
    expect(drillbox.it).toBe(vitest.it);
    expect(drillbox.expect).toBe(vitest.expect);
    expect(drillbox.beforeEach).toBe(vitest.beforeEach);
    expect(drillbox.afterEach).toBe(vitest.afterEach);
  });
});
