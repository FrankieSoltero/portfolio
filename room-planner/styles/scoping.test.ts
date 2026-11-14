// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Guards the style isolation of the planner inside the portfolio: every planner rule must be
// scoped to the `.room-planner` wrapper (or to a class of its own), and no planner class may
// share a name with the /papers stylesheet. The Vitest config sets `css: false`, so the
// stylesheets are read from disk as text and parsed here.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNER_DIR = join(REPO_ROOT, 'room-planner');
const PAPERS_CSS = join(REPO_ROOT, 'app/papers/papers.css');
const SCOPE = ':where(.room-planner)';

/** At-rules whose block holds ordinary style rules. */
const GROUPING_AT_RULES = /^@(media|supports|container|layer|scope|document)\b/i;

interface StyleRule {
  /** The selector list, split on top-level commas and trimmed. */
  selectors: string[];
}

/** Returns the index of the `}` matching the `{` at `open`, honouring strings. */
function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced "{" at offset ${open}`);
}

/** Returns the index of the closing quote of the string starting at `start`. */
function skipString(css: string, start: number): number {
  const quote = css[start];
  for (let i = start + 1; i < css.length; i++) {
    if (css[i] === '\\') i++;
    else if (css[i] === quote) return i;
  }
  throw new Error(`Unterminated string at offset ${start}`);
}

/** Splits a selector list on commas that are not inside (), [] or a string. */
function splitSelectorList(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (ch === '"' || ch === "'") i = skipString(prelude, i);
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(prelude.slice(start));
  return parts.map((part) => part.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

/**
 * Parses a stylesheet into its style rules. Comments are stripped; rules inside grouping
 * at-rules (`@media`, `@supports`, …) are walked; `@keyframes` steps and other at-rule
 * blocks (`@font-face`, …) and statements (`@import …;`) are skipped. Nested style rules
 * (CSS nesting) are not supported and throw, so they cannot slip past the checks.
 */
function parseRules(source: string): StyleRule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: StyleRule[] = [];
  const walk = (text: string) => {
    let i = 0;
    let preludeStart = 0;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"' || ch === "'") {
        i = skipString(text, i) + 1;
      } else if (ch === ';') {
        preludeStart = ++i; // an at-rule statement such as @import or @charset
      } else if (ch === '{') {
        const close = matchingBrace(text, i);
        const prelude = text.slice(preludeStart, i).trim();
        const body = text.slice(i + 1, close);
        if (prelude.startsWith('@')) {
          if (GROUPING_AT_RULES.test(prelude)) walk(body);
          // @keyframes, @font-face, @page …: no selectors to check.
        } else {
          if (withoutStrings(body).includes('{')) {
            throw new Error(`Nested rule inside "${prelude}" is not supported`);
          }
          rules.push({ selectors: splitSelectorList(prelude) });
        }
        i = close + 1;
        preludeStart = i;
      } else {
        i++;
      }
    }
  };
  walk(css);
  return rules;
}

/** Replaces every quoted string with an empty one. */
function withoutStrings(text: string): string {
  return text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
}

/** Removes strings, attribute selectors and functional pseudo-class arguments from a selector. */
function stripArguments(selector: string): string {
  let out = withoutStrings(selector).replace(/\[[^\]]*\]/g, '[]');
  // Innermost parentheses first, repeated until none remain.
  while (/\([^()]*\)/.test(out)) out = out.replace(/\([^()]*\)/g, '');
  return out;
}

/** Class names a selector defines (outside strings and attribute values). */
function classNames(selector: string): string[] {
  const text = withoutStrings(selector).replace(/\[[^\]]*\]/g, '[]');
  return [...text.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}

/** Why a selector is not scoped to the planner, or null when it is. */
function scopingProblem(selector: string): string | null {
  const bare = stripArguments(selector);
  if (/:root(?![\w-])/.test(selector)) return 'targets :root';
  if (/(^|[\s>+~])html(?![\w-])/.test(bare)) return 'targets html';
  if (/(^|[\s>+~])body(?![\w-])/.test(bare)) return 'targets body';
  if (/#root(?![\w-])/.test(selector)) return 'targets #root';
  if (selector.startsWith(SCOPE)) return null;
  if (/\.-?[A-Za-z_]/.test(bare)) return null;
  return `has no class and no ${SCOPE} prefix`;
}

function listCssFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.css'))
    .map((name) => join(dir, name))
    .sort();
}

const plannerFiles = listCssFiles(PLANNER_DIR);

describe('the CSS parser used by these tests', () => {
  it('strips comments, splits selector lists and walks @media and @supports', () => {
    const css = `/* a { } */ a, b:is(.x, .y) { color: red; }
      @media (min-width: 1px) { .c { content: "}{," } }
      @supports (display: grid) { @media print { d { x: y; } } }`;
    expect(parseRules(css).map((r) => r.selectors)).toEqual([['a', 'b:is(.x, .y)'], ['.c'], ['d']]);
  });

  it('skips @keyframes steps, @font-face and at-rule statements', () => {
    const css = `@import url("x.css"); @keyframes spin { from { a: b; } 50% { a: c; } to { a: d; } }
      @font-face { font-family: X; } .e { a: b; }`;
    expect(parseRules(css).map((r) => r.selectors)).toEqual([['.e']]);
  });

  it('flags unscoped selectors and accepts scoped ones', () => {
    expect(scopingProblem(':root')).toBe('targets :root');
    expect(scopingProblem('body')).toBe('targets body');
    expect(scopingProblem('html .x')).toBe('targets html');
    expect(scopingProblem('#root')).toBe('targets #root');
    expect(scopingProblem('h1')).toMatch(/no class/);
    expect(scopingProblem('*::before')).toMatch(/no class/);
    expect(scopingProblem('a[href$=".pdf"]')).toMatch(/no class/);
    expect(scopingProblem('div:not(.x)')).toMatch(/no class/);
    expect(scopingProblem(':where(.room-planner) h1')).toBeNull();
    expect(scopingProblem(':where(.room-planner)')).toBeNull();
    expect(scopingProblem('textarea.input')).toBeNull();
    expect(scopingProblem('.room-planner')).toBeNull();
    expect(scopingProblem('.body-text')).toBeNull();
  });

  it('extracts class names but not file extensions inside attribute values', () => {
    expect(classNames('.a.b > c:not(.d)[href$=".pdf"]')).toEqual(['a', 'b', 'd']);
  });
});

describe('planner stylesheet scoping', () => {
  it('finds the planner stylesheets', () => {
    const names = plannerFiles.map((file) => relative(REPO_ROOT, file));
    expect(names).toContain('room-planner/styles/industry.css');
    expect(names).toContain('room-planner/styles/app.css');
  });

  it.each(plannerFiles.map((file) => [relative(REPO_ROOT, file), file]))(
    'every selector in %s is scoped to the planner',
    (_name, file) => {
      const rules = parseRules(readFileSync(file, 'utf8'));
      expect(rules.length).toBeGreaterThan(0);
      const problems = rules
        .flatMap((rule) => rule.selectors)
        .map((selector) => ({ selector, problem: scopingProblem(selector) }))
        .filter((entry) => entry.problem !== null)
        .map((entry) => `${entry.selector} — ${entry.problem}`);
      expect(problems).toEqual([]);
    },
  );

  it('defines no class name that app/papers/papers.css also defines', () => {
    const defined = (file: string) =>
      new Set(parseRules(readFileSync(file, 'utf8')).flatMap((r) => r.selectors.flatMap(classNames)));
    const papers = defined(PAPERS_CSS);
    expect(papers.size).toBeGreaterThan(0);
    const planner = new Set(plannerFiles.flatMap((file) => [...defined(file)]));
    expect(planner.size).toBeGreaterThan(0);
    expect([...planner].filter((name) => papers.has(name)).sort()).toEqual([]);
  });
});
