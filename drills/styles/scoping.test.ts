// Keeps app/drills/drills.css inside its section: every selector starts with the
// `.drills` root class, every @keyframes name starts with `drills-`, and the skin's
// banned styles (rounded corners, blurred shadows) never appear. CSS processing is off
// under vitest, so the file is parsed as text.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface Block { prelude: string; body: string }

/** Top-level `prelude { body }` blocks of a comment-free stylesheet fragment. */
function blocks(css: string): Block[] {
  const out: Block[] = [];
  let prelude = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === ";") {
      prelude = ""; // a block-less statement such as @import
    } else if (ch === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        j++;
      }
      out.push({ prelude: prelude.trim(), body: css.slice(i + 1, j - 1) });
      prelude = "";
      i = j;
      continue;
    } else {
      prelude += ch;
    }
    i++;
  }
  return out;
}

/** Splits a selector list on commas that are not inside parentheses. */
function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

const ROOT = /^\.drills(?![\w-])/;

/** Every selector and keyframes name that escapes the `.drills` scope, plus the count checked. */
function scopeViolations(source: string): { violations: string[]; checked: number } {
  const violations: string[] = [];
  let checked = 0;
  const visit = (css: string) => {
    for (const { prelude, body } of blocks(css)) {
      const keyframes = /^@(?:-webkit-)?keyframes\s+(\S+)/.exec(prelude);
      if (keyframes) {
        checked++;
        if (!keyframes[1].startsWith("drills-")) violations.push(prelude);
      } else if (prelude.startsWith("@")) {
        visit(body); // @media, @supports, @container, @layer: check what is inside
      } else {
        for (const selector of splitSelectors(prelude)) {
          checked++;
          if (!ROOT.test(selector)) violations.push(selector);
        }
      }
    }
  };
  visit(source.replace(/\/\*[\s\S]*?\*\//g, ""));
  return { violations, checked };
}

const DRILLS_CSS = fs.readFileSync(path.join(process.cwd(), "app", "drills", "drills.css"), "utf-8");

describe("drills.css scoping", () => {
  it("flags selectors and keyframes outside the .drills scope", () => {
    const sample = `
      .drills a { color: red; }
      .drills-page { flex: 1; }
      body { margin: 0; }
      @media (min-width: 40rem) { .drills h1, h2 { font-size: 2rem; } }
      @keyframes spin { from { opacity: 0; } to { opacity: 1; } }
      @keyframes drills-blink { 50% { opacity: 0; } }
    `;
    expect(scopeViolations(sample).violations).toEqual([
      ".drills-page",
      "body",
      "h2",
      "@keyframes spin",
    ]);
  });

  it("starts every selector with .drills and every @keyframes name with drills-", () => {
    const { violations, checked } = scopeViolations(DRILLS_CSS);
    expect(checked).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it("uses no border-radius and no blur()", () => {
    expect(DRILLS_CSS).not.toMatch(/border-radius/);
    expect(DRILLS_CSS).not.toMatch(/blur\(/);
  });
});
