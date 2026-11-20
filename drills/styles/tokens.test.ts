// Pins the shared hybrid-skin tokens: app/hybrid-skin.css is the only place the 13
// Sweetie-16 palette and pixel-frame custom properties are declared, with the exact
// values /papers has always used, and both section layouts load it before their own
// stylesheet. CSS processing is off under vitest, so the files are read as text.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TOKENS: Record<string, string> = {
  "--night": "#1a1c2c",
  "--panel": "#0e1530",
  "--deep": "#29366f",
  "--dim": "#333c57",
  "--steel": "#566c86",
  "--mist": "#94b0c2",
  "--white": "#f4f4f4",
  "--cyan": "#73eff7",
  "--slime": "#a7f070",
  "--gold": "#ffcd75",
  "--ember": "#ef7d57",
  "--frame4": "0 -4px #000, 0 4px #000, -4px 0 #000, 4px 0 #000",
  "--frame3": "0 -3px #000, 0 3px #000, -3px 0 #000, 3px 0 #000",
};

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Custom-property names declared (not merely used via var()) anywhere in the file. */
function declaredCustomProperties(css: string): string[] {
  return [...stripComments(css).matchAll(/(?:^|[{;\s])(--[\w-]+)\s*:/g)].map((m) => m[1]);
}

/** Index of the first line containing `needle`, or -1. */
function lineOf(source: string, needle: string): number {
  return source.split("\n").findIndex((line) => line.includes(needle));
}

describe("hybrid-skin tokens", () => {
  it("declares exactly the 13 tokens, with the papers values, under :where(.papers, .drills)", () => {
    const css = stripComments(read("app/hybrid-skin.css"));
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    expect(rules).toHaveLength(1);
    const [, selector, body] = rules[0];
    expect(selector.trim().replace(/\s+/g, " ")).toBe(":where(.papers, .drills)");

    const declarations = Object.fromEntries(
      body
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const colon = d.indexOf(":");
          return [d.slice(0, colon).trim(), d.slice(colon + 1).trim().replace(/\s+/g, " ")];
        }),
    );
    expect(declarations).toEqual(TOKENS);
  });

  it("papers.css no longer declares any of the 13 tokens", () => {
    const declared = declaredCustomProperties(read("app/papers/papers.css"));
    expect(declared.filter((name) => name in TOKENS)).toEqual([]);
  });

  it("drills.css declares none of the 13 tokens", () => {
    const declared = declaredCustomProperties(read("app/drills/drills.css"));
    expect(declared.filter((name) => name in TOKENS)).toEqual([]);
  });
});

describe("stylesheet import order", () => {
  it.each([
    ["app/papers/layout.tsx", "./papers.css"],
    ["app/drills/layout.tsx", "./drills.css"],
  ])("%s imports hybrid-skin.css before %s", (layout, own) => {
    const source = read(layout);
    const skin = lineOf(source, '"../hybrid-skin.css"');
    const section = lineOf(source, `"${own}"`);
    expect(skin).toBeGreaterThanOrEqual(0);
    expect(section).toBeGreaterThanOrEqual(0);
    expect(skin).toBeLessThan(section);
  });
});
