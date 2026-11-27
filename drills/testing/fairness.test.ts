import { spawnSync } from "child_process";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  checkFileSlug,
  evaluateFairness,
  parseVitestReport,
  withExtraReasons,
  type CheckOutcome,
  type VariantRun,
} from "./fairness";

const checks = (...statuses: CheckOutcome["status"][]): CheckOutcome[] =>
  statuses.map((status, i) => ({ name: `check ${i + 1}`, status }));

const run = (slug: string, outcomes: CheckOutcome[], collected = true): VariantRun => ({
  slug,
  collected,
  checks: outcomes,
});

const failedLine = (slug: string, reasons: string[]) =>
  `fairness: ${slug} FAILED — ${reasons.join("; ")}`;

describe("evaluateFairness", () => {
  it("passes a drill that is red on starter and green on solution", () => {
    const [v] = evaluateFairness(
      [run("demo", checks("failed", "failed", "passed", "passed"))],
      [run("demo", checks("passed", "passed", "passed", "passed"))],
      ["demo"]
    );
    expect(v).toEqual({
      slug: "demo",
      ok: true,
      reasons: [],
      line: "fairness: demo OK (starter 2/4 failing, solution 4/4 passing)",
    });
  });

  it("fails a drill whose starter already passes every check", () => {
    const [v] = evaluateFairness(
      [run("demo", checks("passed", "passed"))],
      [run("demo", checks("passed", "passed"))],
      ["demo"]
    );
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual(["starter passes every check"]);
    expect(v.line).toBe(failedLine("demo", ["starter passes every check"]));
  });

  it("fails a drill whose solution fails a check, naming each failing check", () => {
    const [v] = evaluateFairness(
      [run("demo", checks("failed", "failed", "failed"))],
      [run("demo", checks("passed", "failed", "failed"))],
      ["demo"]
    );
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual(["solution fails: check 2", "solution fails: check 3"]);
    expect(v.line).toBe(failedLine("demo", v.reasons));
  });

  it("fails a drill whose starter did not load", () => {
    const [v] = evaluateFairness(
      [run("demo", [], false)],
      [run("demo", checks("passed"))],
      ["demo"]
    );
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual(["starter failed to load"]);
  });

  it("fails a drill whose solution did not load", () => {
    const [v] = evaluateFairness(
      [run("demo", checks("failed"))],
      [run("demo", [], false)],
      ["demo"]
    );
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual(["solution failed to load"]);
  });

  it("fails a drill with no checks in either run", () => {
    const noStarterChecks = evaluateFairness([run("demo", [])], [run("demo", checks("passed"))], ["demo"]);
    const noSolutionChecks = evaluateFairness([run("demo", checks("failed"))], [run("demo", [])], ["demo"]);
    expect(noStarterChecks[0].reasons).toEqual(["no checks found"]);
    expect(noSolutionChecks[0].reasons).toEqual(["no checks found"]);
    expect(noStarterChecks[0].ok).toBe(false);
  });

  it("fails a drill whose check names differ between the runs", () => {
    const [v] = evaluateFairness(
      [run("demo", [{ name: "a", status: "failed" }, { name: "b", status: "passed" }])],
      [run("demo", [{ name: "a", status: "passed" }, { name: "c", status: "passed" }])],
      ["demo"]
    );
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual(["check names differ between starter and solution"]);
  });

  it("fails a drill missing from a run", () => {
    const [noStarter] = evaluateFairness([], [run("demo", checks("passed"))], ["demo"]);
    const [noSolution] = evaluateFairness([run("demo", checks("failed"))], [], ["demo"]);
    expect(noStarter.reasons).toEqual(["no results for starter"]);
    expect(noSolution.reasons).toEqual(["no results for solution"]);
    expect(noSolution.line).toBe(failedLine("demo", ["no results for solution"]));
  });

  it("returns one verdict per slug, in the order given", () => {
    const verdicts = evaluateFairness(
      [run("a", checks("failed")), run("b", checks("failed"))],
      [run("a", checks("passed")), run("b", checks("passed"))],
      ["b", "a"]
    );
    expect(verdicts.map((v) => v.slug)).toEqual(["b", "a"]);
  });
});

describe("withExtraReasons", () => {
  const ok = evaluateFairness([run("demo", checks("failed"))], [run("demo", checks("passed"))], ["demo"])[0];

  it("leaves a verdict unchanged when there are no extra reasons", () => {
    expect(withExtraReasons(ok, [])).toEqual(ok);
  });

  it("turns check-lint problems into reasons on an otherwise fair drill", () => {
    const v = withExtraReasons(ok, ["forbidden import: vitest", "forbidden call: vi."]);
    expect(v.ok).toBe(false);
    expect(v.reasons).toEqual(["forbidden import: vitest", "forbidden call: vi."]);
    expect(v.line).toBe(failedLine("demo", v.reasons));
  });

  it("appends to a failing verdict's reasons", () => {
    const failing = evaluateFairness([run("demo", checks("passed"))], [run("demo", checks("passed"))], ["demo"])[0];
    const v = withExtraReasons(failing, ["solution raised an unhandled error"]);
    expect(v.reasons).toEqual(["starter passes every check", "solution raised an unhandled error"]);
    expect(v.line).toBe(failedLine("demo", v.reasons));
  });
});

describe("checkFileSlug", () => {
  const dir = path.join("/repo", "content", "drills");

  it("returns the slug of a check file inside a drill", () => {
    expect(checkFileSlug(path.join(dir, "like-button", "checks", "App.test.tsx"), dir)).toBe("like-button");
  });

  it("returns null for files outside a drill's checks folder", () => {
    expect(checkFileSlug(path.join(dir, "like-button", "starter", "App.tsx"), dir)).toBeNull();
    expect(checkFileSlug(path.join("/repo", "lib", "drills.test.ts"), dir)).toBeNull();
    expect(checkFileSlug(path.join(dir, "Bad Slug", "checks", "App.test.tsx"), dir)).toBeNull();
  });
});

describe("parseVitestReport", () => {
  const dir = path.join("/repo", "content", "drills");
  const file = (slug: string, name = "App.test.tsx") => path.join(dir, slug, "checks", name);
  const assertion = (title: string, status: string) => ({ title, fullName: `Demo ${title}`, status });

  it("groups per-check outcomes by drill, using the check name", () => {
    const report = {
      testResults: [
        {
          name: file("alpha"),
          status: "failed",
          message: "",
          assertionResults: [assertion("one", "passed"), assertion("two", "failed")],
        },
        { name: file("beta"), status: "passed", message: "", assertionResults: [assertion("three", "passed")] },
      ],
    };
    expect(parseVitestReport(report, dir)).toEqual([
      { slug: "alpha", collected: true, checks: [{ name: "one", status: "passed" }, { name: "two", status: "failed" }] },
      { slug: "beta", collected: true, checks: [{ name: "three", status: "passed" }] },
    ]);
  });

  it("counts a skipped or todo check as not passing", () => {
    const report = {
      testResults: [
        { name: file("alpha"), status: "passed", message: "", assertionResults: [assertion("one", "skipped"), assertion("two", "todo")] },
      ],
    };
    expect(parseVitestReport(report, dir)[0].checks.map((c) => c.status)).toEqual(["failed", "failed"]);
  });

  it("marks a drill not collected when a check file failed to load", () => {
    const report = {
      testResults: [
        { name: file("alpha"), status: "failed", message: "Transform failed", assertionResults: [] },
      ],
    };
    expect(parseVitestReport(report, dir)).toEqual([{ slug: "alpha", collected: false, checks: [] }]);
  });

  it("ignores files outside the drills directory", () => {
    const report = {
      testResults: [{ name: "/elsewhere/x.test.tsx", status: "passed", message: "", assertionResults: [] }],
    };
    expect(parseVitestReport(report, dir)).toEqual([]);
  });

  it("throws on something that is not a vitest JSON report", () => {
    expect(() => parseVitestReport({ nope: true }, dir)).toThrow("not a vitest JSON report");
    expect(() => parseVitestReport(null, dir)).toThrow("not a vitest JSON report");
  });
});

describe("scripts/drills-fairness.mts", () => {
  const script = path.join(process.cwd(), "scripts", "drills-fairness.mts");
  const runScript = (slug: string) =>
    spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      env: { ...process.env, DRILL_SLUG: slug },
      encoding: "utf-8",
    });

  it.each(["Not A Slug", "../etc", "no-such-drill"])("rejects DRILL_SLUG=%s as an unknown drill", (slug) => {
    const result = runScript(slug);
    expect(result.stderr).toContain(`Unknown drill: ${slug}`);
    expect(result.stdout).not.toContain("fairness:");
    expect(result.status).toBe(1);
  });
});
