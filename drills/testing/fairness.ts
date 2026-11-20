// drills/testing/fairness.ts
// The fairness gate's verdicts. A drill is fair when its checks load against both
// starter/ and solution/, at least one check fails on the starter, and every check
// passes on the solution. scripts/drills-fairness.mts runs vitest once per variant,
// turns each JSON report into VariantRuns with parseVitestReport, and prints each
// verdict's line.
//
// No local imports: scripts/drills-fairness.mts loads this file with plain `node`.

import path from "node:path";

export interface CheckOutcome { name: string; status: "passed" | "failed" }
export interface VariantRun { slug: string; collected: boolean; checks: CheckOutcome[] }
export interface FairnessVerdict { slug: string; ok: boolean; reasons: string[]; line: string }

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function evaluateFairness(
  starter: VariantRun[],
  solution: VariantRun[],
  slugs: string[]
): FairnessVerdict[] {
  return slugs.map((slug) => {
    const s = starter.find((r) => r.slug === slug);
    const f = solution.find((r) => r.slug === slug);
    const reasons: string[] = [];

    if (!s) reasons.push("no results for starter");
    if (!f) reasons.push("no results for solution");
    if (s && !s.collected) reasons.push("starter failed to load");
    if (f && !f.collected) reasons.push("solution failed to load");

    if (s?.collected && f?.collected) {
      if (s.checks.length === 0 || f.checks.length === 0) {
        reasons.push("no checks found");
      } else {
        if (!sameNames(s.checks, f.checks)) {
          reasons.push("check names differ between starter and solution");
        }
        if (countFailed(s.checks) === 0) reasons.push("starter passes every check");
        for (const c of f.checks) {
          if (c.status === "failed") reasons.push(`solution fails: ${c.name}`);
        }
      }
    }

    if (reasons.length > 0 || !s || !f) return failed(slug, reasons);
    const n = s.checks.length;
    const passing = f.checks.length - countFailed(f.checks);
    return {
      slug,
      ok: true,
      reasons: [],
      line: `fairness: ${slug} OK (starter ${countFailed(s.checks)}/${n} failing, solution ${passing}/${f.checks.length} passing)`,
    };
  });
}

/** `verdict` with `extra` reasons appended (check-lint problems, unhandled errors). */
export function withExtraReasons(verdict: FairnessVerdict, extra: string[]): FairnessVerdict {
  if (extra.length === 0) return verdict;
  return failed(verdict.slug, [...verdict.reasons, ...extra]);
}

/** Slug of the drill a check file belongs to, or null if it is not `<drillsDir>/<slug>/checks/…`. */
export function checkFileSlug(file: string, drillsDir: string): string | null {
  const rel = path.relative(drillsDir, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const [slug, folder, ...rest] = rel.split(path.sep);
  if (!SLUG_RE.test(slug) || folder !== "checks" || rest.length === 0) return null;
  return slug;
}

interface ReportAssertion { title: string; status: string }
interface ReportFile { name: string; status: string; assertionResults: ReportAssertion[] }

/** Per-drill runs from a vitest `--reporter=json` report; files outside drills are ignored. */
export function parseVitestReport(report: unknown, drillsDir: string): VariantRun[] {
  if (!isReport(report)) throw new Error("not a vitest JSON report");
  const runs = new Map<string, VariantRun>();
  for (const file of report.testResults) {
    const slug = checkFileSlug(file.name, drillsDir);
    if (slug === null) continue;
    const run = runs.get(slug) ?? { slug, collected: true, checks: [] };
    // A file that failed with no tests collected could not be loaded (syntax error,
    // missing import, a throw at the top level).
    if (file.status === "failed" && file.assertionResults.length === 0) run.collected = false;
    for (const a of file.assertionResults) {
      run.checks.push({ name: a.title, status: a.status === "passed" ? "passed" : "failed" });
    }
    runs.set(slug, run);
  }
  return [...runs.values()];
}

function failed(slug: string, reasons: string[]): FairnessVerdict {
  return { slug, ok: false, reasons, line: `fairness: ${slug} FAILED — ${reasons.join("; ")}` };
}

function countFailed(checks: CheckOutcome[]): number {
  return checks.filter((c) => c.status === "failed").length;
}

function sameNames(a: CheckOutcome[], b: CheckOutcome[]): boolean {
  const names = (checks: CheckOutcome[]) => checks.map((c) => c.name).sort().join("\n");
  return a.length === b.length && names(a) === names(b);
}

function isReport(value: unknown): value is { testResults: ReportFile[] } {
  if (typeof value !== "object" || value === null) return false;
  const files = (value as { testResults?: unknown }).testResults;
  return (
    Array.isArray(files) &&
    files.every(
      (f) =>
        typeof f === "object" && f !== null &&
        typeof f.name === "string" && typeof f.status === "string" &&
        Array.isArray(f.assertionResults) &&
        f.assertionResults.every(
          (a: unknown) =>
            typeof a === "object" && a !== null &&
            typeof (a as ReportAssertion).title === "string" &&
            typeof (a as ReportAssertion).status === "string"
        )
    )
  );
}
