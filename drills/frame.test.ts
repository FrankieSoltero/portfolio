import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFrame, jsAdapter } from "drillbox/frame";
import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { FRAME_CSP_HEADER, FRAME_URL } from "./frame";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "build-drill-frame.mts");
const BUILT_FRAME = path.join(ROOT, "public", "drillbox", "frame.html");
const FRAME_POLICY_PREFIX = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'";

const tempRoots: string[] = [];

/**
 * A throwaway project root holding a copy of the script, so running it never touches
 * this repository's public/. node_modules is a symlink so `drillbox/frame` resolves.
 */
function tempProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drill-frame-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "scripts"));
  fs.copyFileSync(SCRIPT, path.join(root, "scripts", "build-drill-frame.mts"));
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(root, "node_modules"), "dir");
  return root;
}

/** A short fingerprint, so a mismatch on the ~1 MB page does not print the page. */
function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function runScript(root: string) {
  return spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", path.join(root, "scripts", "build-drill-frame.mts")],
    { cwd: root, encoding: "utf-8" },
  );
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("frame constants", () => {
  it("names the frame URL and its response header policy", () => {
    expect(FRAME_URL).toBe("/drillbox/frame.html");
    expect(FRAME_CSP_HEADER).toBe("sandbox allow-scripts; frame-ancestors 'self'");
  });
});

describe("scripts/build-drill-frame.mts", () => {
  it("creates public/drillbox/ and writes the React frame page", () => {
    const root = tempProject();
    const result = runScript(root);
    const out = path.join(root, "public", "drillbox", "frame.html");

    expect(result.status).toBe(0);
    const html = fs.readFileSync(out, "utf-8");
    expect(sha256(html)).toBe(sha256(buildFrame({ adapters: [jsAdapter({ react: true })] })));
    expect(result.stdout).toBe(`drill frame: public/drillbox/frame.html (${fs.statSync(out).size} bytes)\n`);
  }, 30_000);

  it("reports a failed write and exits 1", () => {
    const root = tempProject();
    // A directory where the file should go makes the write fail.
    fs.mkdirSync(path.join(root, "public", "drillbox", "frame.html"), { recursive: true });
    const result = runScript(root);

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/^drill frame: FAILED — .+\n$/);
  }, 30_000);
});

describe("package.json and .gitignore", () => {
  it("runs the frame script before every build and dev start", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.frame).toBe(
      "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/build-drill-frame.mts",
    );
    expect(pkg.scripts.prebuild).toBe("npm run frame");
    expect(pkg.scripts.predev).toBe("npm run frame");
  });

  it("ignores the generated frame directory", () => {
    const lines = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf-8").split("\n");
    const comment = lines.indexOf("# Drillbox sandbox frame, written by npm run frame");
    expect(comment).toBeGreaterThanOrEqual(0);
    expect(lines[comment + 1]).toBe("public/drillbox/");
  });
});

describe("next.config.ts headers()", () => {
  it("serves the frame page with only the sandboxing policy and keeps the site-wide headers", async () => {
    const entries = await nextConfig.headers!();

    expect(entries.map((e) => e.source)).toEqual(["/:path*", FRAME_URL]);
    expect(entries[1].headers).toEqual([{ key: "Content-Security-Policy", value: FRAME_CSP_HEADER }]);
    expect(entries[0].headers.map((h) => h.key)).toEqual([
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
  });
});

describe("built frame page", () => {
  it("carries its own policy and loads nothing from the network", (ctx) => {
    if (!fs.existsSync(BUILT_FRAME)) {
      ctx.skip("public/drillbox/frame.html is missing: run npm run frame first");
    }
    const doc = new DOMParser().parseFromString(fs.readFileSync(BUILT_FRAME, "utf-8"), "text/html");

    const meta = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
    expect(meta?.getAttribute("content")?.startsWith(FRAME_POLICY_PREFIX)).toBe(true);

    const remote = [...doc.querySelectorAll("[src], [href]")]
      .flatMap((el) => [el.getAttribute("src"), el.getAttribute("href")])
      .filter((url): url is string => url !== null && /^\s*https?:\/\//i.test(url));
    expect(remote).toEqual([]);
  });
});
