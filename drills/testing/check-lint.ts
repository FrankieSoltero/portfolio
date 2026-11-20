// drills/testing/check-lint.ts
// Static checks a drill's check file must pass before the fairness gate trusts it.
// Enforces the plan's check-file subset (allowed imports, no vi./jest.) and the rule
// that a check name describes behaviour, never the cause of the bug.

/** The only modules a check file may import. */
const ALLOWED_IMPORTS = new Set(["drillbox:test", "@testing-library/react", "./App", "./api"]);

/** Words a check name may not contain (case-insensitive substrings). */
const BANNED_WORDS = ["stale", "mutat", "closure", "key", "race", "cleanup", "spread", "derive"];

/** `from "x"`, `import "x"`, `import("x")` and `require("x")`. */
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(["'])([^"'\n]+)\1/g;
/** `vi.` or `jest.` as a whole identifier. */
const BANNED_CALL_RE = /\b(vi|jest)\./g;
/** The first string argument of `it(`: a single-, double- or back-quoted literal. */
const CHECK_NAME_RE = /\bit\s*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

interface Problem {
  at: number;
  message: string;
}

/** Problems in one check file's source; empty when it obeys the Global Constraints. */
export function lintCheckFile(source: string): string[] {
  const problems: Problem[] = [];

  for (const m of source.matchAll(IMPORT_RE)) {
    if (!ALLOWED_IMPORTS.has(m[2])) problems.push({ at: m.index, message: `forbidden import: ${m[2]}` });
  }
  for (const m of source.matchAll(BANNED_CALL_RE)) {
    problems.push({ at: m.index, message: `forbidden call: ${m[1]}.` });
  }
  for (const m of source.matchAll(CHECK_NAME_RE)) {
    const name = m[2];
    const lower = name.toLowerCase();
    if (BANNED_WORDS.some((word) => lower.includes(word))) {
      problems.push({ at: m.index, message: `check name gives away the cause: ${name}` });
    }
  }

  const messages = problems.sort((a, b) => a.at - b.at).map((p) => p.message);
  return [...new Set(messages)];
}
