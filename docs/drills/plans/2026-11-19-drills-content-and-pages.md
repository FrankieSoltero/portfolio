# Drills: content, verification and pages (runner-independent slice) — Implementation Plan

> **For executors:** execute with soltero-skills:lean-sdd. The Task Dependency
> Table below is the scheduling and review-depth contract.

**Goal:** build the ten React review drills as verified content, plus the `/drills`
pages and progress store, without depending on the
Drillbox runner. Nothing in this plan is released: the section goes live only once drills
run in the browser (runner-integration plan).

**Architecture:** each drill is a folder of plain files under `content/drills/<slug>/`,
loaded and validated at build time by `lib/drills.ts`. A separate vitest configuration
runs each drill's check files against its `starter/` or its `solution/`, and a fairness script fails the build unless every drill is red on the
starter and green on the solution. The pages render the brief, starter code, hints and
solution statically. Completion, streak and progress display arrive with the runner; this
slice only records which solutions were revealed, in `localStorage`.

**Tech stack / test runner:** Next.js 15 App Router, React 19, TypeScript strict, zod 4,
vitest 5 + Testing Library, shiki. Unit tests: `npx vitest run <file>`. Drill checks:
`npm run test:drills` (all) or `DRILL_SLUG=<slug> npm run test:drills` (one).

Spec: `docs/drills/specs/2026-11-19-react-drills-design.md`. Runner spec (not built in
this plan): `docs/drills/specs/2026-11-19-code-runner-design.md`.

## Spec traceability

| Spec section (`2026-11-19-react-drills-design.md`) | Tasks |
|------|-------|
| Drill content (folder format, meta, brief, starter, checks, solution, explanation) | 2, 8–17 |
| Drill fairness test (red on starter, green on solution) | 3, 8–17 |
| The ten drills | 8–17 |
| Progress and pacing (`drills:progress:v1`, streak, today's drill) | 4 (store only; display deferred) |
| Routes `/drills`, `/drills/[slug]`; brief, hints, solution reveal | 6, 7 |
| Hybrid 8-bit skin scoped to `.drills` | 5 |
| Docs folder and lessons log | 18 |

**Deviations from the spec, with reasons:**
- The spec says shared tokens are "reused from the papers stylesheet rather than copied".
  Task 5 moves them into `app/hybrid-skin.css`, imported by both sections, because a
  drills page cannot import `papers.css` without also taking every papers rule. This
  edits two papers files; Task 5 pins every token value so `/papers` cannot change.
- No manual "mark as done" and no release in this plan (owner decisions, 2026-11-20).
- No local practice command and no "run locally" note (owner decision, 2026-11-20: the
  drills will not be used until they run in the browser). The spec's note is dropped.
- `profile-switcher` and `comment-threads` are 12 minutes, above the spec's 10-minute
  target for non-capstone drills (owner decision, 2026-11-20: three bugs each).

**Deferred to the runner-integration plan (in the spec, not built here):** the in-browser
workspace with `Run checks` and `Reset code`; draft code saved under
`drills:code:v1:<slug>`; sandbox-failure and error-boundary handling; marking drills done;
streak, progress count, done badges and "today's drill"; the quest card; the home
navigation link; the sitemap entries; the merge and deploy.

## Global Constraints

- **Out of scope here:** the Drillbox runner, any editor or in-browser execution, and
  everything that depends on knowing a drill was solved: marking drills done, the streak,
  the progress count, done badges and "today's drill". There is no manual "mark as done"
  control (owner decision, 2026-11-20). The home-page quest card also waits for the runner.
- **Not released by this plan** (owner decision, 2026-11-20: no deploy until drills run
  in the browser). The branch `drills-content` is never merged into `main` and never
  pushed by this plan: a merge triggers the Vercel production deploy and a push creates a
  public Vercel preview. The home navigation link, the sitemap entries and the merge all
  belong to the runner-integration plan, which builds on this branch. `public/index.html`
  and `app/sitemap.ts` are not edited here. The pages are viewed with `npm run dev` only.
- Slugs match `^[a-z0-9]+(?:-[a-z0-9]+)*$` and are validated before any filesystem access.
- Storage key: `drills:progress:v1`. Nothing is sent to a server. Storage access is always
  inside `try`/`catch`; unreadable or invalid data is treated as empty.
- Dates are local calendar dates formatted `YYYY-MM-DD`.
- All drills CSS is scoped under a `.drills` root class. No `border-radius`, no blurred
  shadows; colours only from the Sweetie-16 tokens; body prose and code never in pixel type.
- Drill source files are TypeScript: `App.tsx`, `api.ts`, `App.test.tsx`.
- **Check-file subset:** check files import only from `drillbox:test`
  (`describe`, `it`, `expect`, `beforeEach`, `afterEach`), `@testing-library/react`
  (`render`, `screen`, `within`, `fireEvent`, `act`, `waitFor`), `./App` and `./api`.
  No `vi.*`, no `jest.*`, no fake timers, no `@testing-library/user-event`.
- **Check names describe behaviour, never the cause.** No check name contains the words
  `stale`, `mutat`, `closure`, `key`, `race`, `cleanup`, `spread` or `derive`.
- Every check finishes in under 3000 ms and no drill's starter may hang or loop without
  bound under checks.
- Every user-visible string a check relies on is stated in that drill's `brief.md`.
- Fake API latency in auto mode: a random delay between 200 and 1200 ms.
- Scripts run with `node` directly on `.mts` files (Node 22.18 or newer strips types).
- `npm run check` must pass at the end of every task.
- Commits are made on the local feature branch `drills-content`, created from `main`.
- **Rollback:** each task is one commit on that local branch, so `git revert <commit>`
  undoes a task and deleting the branch undoes the plan. `package.json`, `tsconfig.json`,
  `vitest.config.mts`, `CLAUDE.md` and the two papers files are shared with
  `main` and change only on this branch; `main` and the live site are untouched throughout.
- **Dependencies:** nothing is installed. `zod`, `shiki`, `next-mdx-remote`, `jsdom`,
  `@testing-library/react`, `@testing-library/jest-dom` and `vitest` are already in
  `package.json`; Task 1 confirms this and stops if one is missing.

## Done criteria (whole plan)

| Check | Command | Expected |
|-------|---------|----------|
| Everything green | `npm run check` | exits 0 |
| Fairness | `npm run test:drills` | ten `fairness: <slug> OK` lines, exit 0 |
| Built pages | `npm run test:drills-pages` (after a build) | `drills pages: 11 OK`, exit 0 |
| On the branch | `git branch --show-current` | `drills-content` |
| Not pushed | `git ls-remote --heads origin drills-content` | no output |
| Not merged | `git merge-base --is-ancestor drills-content main; echo $?` | `1` |
| Release files untouched | `git diff main -- public/index.html app/sitemap.ts` | empty |

## Task Dependency Table

| Task | Files touched | Depends on | Risk tier |
|------|---------------|------------|-----------|
| 1. Tooling wiring | `package.json`, `tsconfig.json`, `tsconfig.drills.json`, `vitest.config.mts`, `scripts/drills-fairness.mts` | — | mechanical |
| 2. Drill loader | `lib/drills.ts`, `lib/drills.test.ts`, `drills/testing/fixtures/loader/**` | 1 | standard |
| 3. Check harness | `vitest.drills.config.mts`, `drills/testing/resolver.ts`, `drills/testing/resolver.test.ts`, `drills/testing/fairness.ts`, `drills/testing/fairness.test.ts`, `drills/testing/drillbox-test.ts`, `drills/testing/drillbox-test.d.ts`, `drills/testing/setup.ts`, `drills/testing/api-control.ts`, `drills/testing/api-control.test.ts`, `drills/testing/check-lint.ts`, `drills/testing/check-lint.test.ts`, `scripts/drills-fairness.mts` | 1, 2 | judgment |
| 4. Progress store | `drills/progress.ts`, `drills/progress.test.ts`, `drills/useProgress.ts`, `drills/useProgress.test.tsx` | 1 | standard |
| 5. Skin and layout | `app/hybrid-skin.css`, `app/papers/papers.css`, `app/papers/layout.tsx`, `app/drills/layout.tsx`, `app/drills/drills.css`, `drills/components/DrillsShell.tsx`, `drills/components/DrillsShell.test.tsx`, `drills/metadata.ts`, `drills/metadata.test.ts`, `drills/styles/scoping.test.ts`, `drills/styles/tokens.test.ts` | 1 | standard |
| 6. Index page | `app/drills/page.tsx`, `drills/components/DrillList.tsx`, `drills/components/DrillList.test.tsx` | 2, 5 | standard |
| 7. Drill page | `app/drills/[slug]/page.tsx`, `app/drills/[slug]/page.test.ts`, `drills/components/HintList.tsx`, `drills/components/SolutionReveal.tsx`, `drills/components/HintList.test.tsx`, `drills/components/SolutionReveal.test.tsx`, `scripts/drills-pages-check.mts`, `package.json` | 1, 2, 4, 5, 6, 8 | judgment |
| 8. Drill 1 `like-button` | `content/drills/like-button/**` | 2, 3 | standard |
| 9. Drill 2 `click-counter` | `content/drills/click-counter/**` | 2, 3 | standard |
| 10. Drill 3 `notes-by-id` | `content/drills/notes-by-id/**` | 2, 3 | standard |
| 11. Drill 4 `card-with-button` | `content/drills/card-with-button/**` | 2, 3 | standard |
| 12. Drill 5 `removable-list` | `content/drills/removable-list/**` | 2, 3 | standard |
| 13. Drill 6 `cart-total` | `content/drills/cart-total/**` | 2, 3 | standard |
| 14. Drill 7 `profile-switcher` | `content/drills/profile-switcher/**` | 2, 3 | standard |
| 15. Drill 8 `comment-threads` | `content/drills/comment-threads/**` | 2, 3 | standard |
| 16. Drill 9 `search-filters` | `content/drills/search-filters/**` | 2, 3 | standard |
| 17. Drill 10 `posts-feed` | `content/drills/posts-feed/**` | 2, 3 | judgment |
| 18. Docs | `CLAUDE.md`, `docs/drills/README.md`, `docs/drills/mistakes-and-fixes.md` | 1–17 | mechanical |
| 19. Section styles (added during execution) | `app/drills/drills.css` | 5, 6, 7 | standard |

Task 19 was added during execution because no task owned the page styles; its brief is kept in the execution ledger.

Tasks 8–17 touch disjoint folders and may execute and be reviewed concurrently. Tasks 4
and 5 are disjoint from 2 and 3. Task 7 follows Task 6 and Task 8 because its built-page
check needs the index page and one real drill; it is the only task besides Task 1 that
edits `package.json`.

---

## Task 1: Tooling wiring

**Files:**
- Modify: `package.json`, `tsconfig.json`, `vitest.config.mts`
- Create: `tsconfig.drills.json`, `scripts/drills-fairness.mts` (stub, replaced in Task 3)

**Interfaces:**
- Produces: npm script `test:drills`; the vitest `include` globs later tasks'
  unit tests rely on.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Unit tests discovered | a `*.test.ts(x)` under `drills/`, `app/drills/` or `lib/` | run by `npm test` |
| Drill checks not in unit run | files under `content/drills/**/checks/` | never collected by `npm test` |
| Main typecheck ignores drill content | `tsc --noEmit` | does not read `content/drills` |
| Starter typecheck | `tsc --noEmit -p tsconfig.drills.json` | type-checks `content/drills/*/starter/**` only; passes with zero matching files |
| Dependencies present | `npm ls zod shiki next-mdx-remote jsdom @testing-library/react @testing-library/jest-dom vitest` | exits 0 with every package listed; if one is missing, stop and report instead of installing |

**Exact values:**
- `scripts.typecheck`: `tsc --noEmit && tsc --noEmit -p tsconfig.drills.json`
- `scripts.lint`: `eslint --no-error-on-unmatched-pattern room-planner app/room-planner drills app/drills lib/drills.ts scripts`
- `scripts.test:drills`: `node scripts/drills-fairness.mts`
- `scripts.check`: `npm run typecheck && npm run lint && npm run test && npm run test:drills && npm run build`
- `tsconfig.json` `exclude` gains `"content/drills"`.
- `tsconfig.drills.json`: `extends` `./tsconfig.json`; `include`
  `["content/drills/*/starter/**/*.ts", "content/drills/*/starter/**/*.tsx"]`; `exclude`
  `["node_modules"]`; `compilerOptions.incremental` `false`.
- `vitest.config.mts` `include` gains `drills/**/*.test.{ts,tsx}`,
  `app/drills/**/*.test.{ts,tsx}`, `lib/**/*.test.ts`.
- Until Task 3 lands, `scripts/drills-fairness.mts` does not exist: create it in this task
  as a stub that prints `fairness: no drills yet` and exits 0, so `npm run check` passes.

**Verify:** `npm run check` → exits 0.
**Commit:** `chore(drills): wire typecheck, lint and test scripts`

---

## Task 2: Drill loader

**Files:**
- Create: `lib/drills.ts`, `lib/drills.test.ts`, `drills/testing/fixtures/loader/**`

**Interfaces:**
- Produces:

```ts
export interface DrillMeta {
  slug: string;            // folder name
  title: string;
  order: number;           // integer >= 1, unique across drills
  summary: string;
  skills: string[];        // at least 1
  difficulty: 1 | 2 | 3;
  minutes: number;         // integer 1..60
  hints: string[];         // 1..5
}
export interface DrillFile { path: string; code: string; readOnly: boolean }
export interface Drill {
  meta: DrillMeta;
  brief: string;                 // raw markdown
  explanation: string;           // raw markdown
  files: DrillFile[];            // starter/, sorted: App.tsx first, then by path
  solutionFiles: DrillFile[];    // solution/ only (files that differ from starter)
  checks: Record<string, string>; // checks/ path -> source
}
export interface Exercise {       // Drillbox exercise format, runner spec "Exercise format"
  id: string;
  language: "js";
  files: Record<string, { code: string; readOnly?: boolean }>;
  entry: "App.tsx";
  checks: Record<string, string>;
  options: { react: true };
}
export const DRILLS_DIR: string;  // <cwd>/content/drills
export function getAllDrills(dir?: string): Drill[];           // sorted by meta.order
export function getDrillBySlug(slug: string, dir?: string): Drill | null;
export function getAdjacentDrills(slug: string, dir?: string): { prev: DrillMeta | null; next: DrillMeta | null };
export function toExercise(drill: Drill): Exercise;
```

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Missing directory | `dir` does not exist | `getAllDrills` returns `[]` |
| Ordering | drills with `order` 2, 1, 3 | returned as 1, 2, 3 |
| Ignored folders | folder name starts with `_` or `.` | skipped |
| Read-only files | starter contains `api.ts` | that file has `readOnly: true`; `App.tsx` has `false` |
| Bad slug lookup | `getDrillBySlug("../x")` | `null`, no filesystem access |
| Unknown slug | valid shape, no folder | `null` |
| Invalid meta | `difficulty: 4`, or `hints: []`, or missing `title` | throws; message starts `Invalid drill <slug>:` and lists each issue as `  - <path>: <message>` |
| Missing required file | no `brief.md`, `explanation.md`, `starter/App.tsx`, `solution/App.tsx`, or zero `checks/*.test.tsx` | throws `Invalid drill <slug>:` naming the missing path |
| Duplicate order | two drills share `order` | throws `Duplicate drill order <n>: <slugA>, <slugB>` |
| Folder name not a slug | folder `Bad_Name` | throws `Invalid drill folder name: Bad_Name` |
| Adjacent | middle drill | `prev` is lower order, `next` is higher; ends give `null` |
| toExercise | any drill | `id` = slug; `files` keyed by path with `readOnly` only when true; `checks` copied; `entry` `"App.tsx"` |

**Exact values:** `meta.json` holds every `DrillMeta` field except `slug`. Unknown keys in
`meta.json` are rejected (strict object).

**Verify:** `npx vitest run lib/drills.test.ts` → all pass.
**Commit:** `feat(drills): typed, validated drill content loader`

---

## Task 3: Check harness and fairness gate

**Files:**
- Create: `drills/testing/check-lint.ts`, `drills/testing/check-lint.test.ts`, `vitest.drills.config.mts`, `drills/testing/resolver.ts`, `drills/testing/resolver.test.ts`, `drills/testing/fairness.ts`, `drills/testing/fairness.test.ts`, `drills/testing/drillbox-test.ts`, `drills/testing/drillbox-test.d.ts`, `drills/testing/setup.ts`, `drills/testing/api-control.ts`, `drills/testing/api-control.test.ts`
- Modify: `scripts/drills-fairness.mts` (replace the Task 1 stub)

**Interfaces:**
- Consumes: `getAllDrills(dir?: string): Drill[]` from `lib/drills.ts`.
- Produces:

```ts
// drills/testing/resolver.ts
export type DrillVariant = "starter" | "solution";
/** Absolute path a relative import inside a drill resolves to, or null to defer. */
export function resolveDrillImport(args: {
  source: string; importer: string; variant: DrillVariant;
  drillsDir: string;
  exists: (absPath: string) => boolean;
}): string | null;
export function drillResolver(variant: DrillVariant): import("vite").Plugin;

// drills/testing/fairness.ts
export interface CheckOutcome { name: string; status: "passed" | "failed" }
export interface VariantRun { slug: string; collected: boolean; checks: CheckOutcome[] }
export interface FairnessVerdict { slug: string; ok: boolean; reasons: string[]; line: string }
export function evaluateFairness(starter: VariantRun[], solution: VariantRun[], slugs: string[]): FairnessVerdict[];

// drills/testing/api-control.ts  (drill authors copy this file's body into each api.ts)
export interface ApiControl {
  setManual(): void;
  reset(): void;
  pending(): string[];
  calls(): string[];
  release(label: string): void;
  fail(label: string, message?: string): void;
}
export function createApi(): {
  control: ApiControl;
  request<T>(label: string, value: T): Promise<T>;
};

// drills/testing/check-lint.ts
/** Problems in one check file's source; empty when it obeys the Global Constraints. */
export function lintCheckFile(source: string): string[];
```

**Behavior — `lintCheckFile`:**

| Case | Input | Expected |
|------|-------|----------|
| Clean file | imports only from `drillbox:test`, `@testing-library/react`, `./App`, `./api` | `[]` |
| Other import | `import { vi } from "vitest"` | `["forbidden import: vitest"]` |
| Banned call | source contains `vi.` or `jest.` | `["forbidden call: vi."]` / `["forbidden call: jest."]` |
| Banned word in a check name | `it("does not use a stale value", …)` | `["check name gives away the cause: does not use a stale value"]`; banned words are `stale`, `mutat`, `closure`, `key`, `race`, `cleanup`, `spread`, `derive`, matched case-insensitively inside the first string argument of `it(` |
| Several problems | two of the above | both messages, in source order |

**Behavior — resolver** (importer inside `<drillsDir>/<slug>/{checks,solution,starter}/`; `source` starts with `./`; extensions tried: `.tsx`, `.ts`):

| Case | Variant | Expected |
|------|---------|----------|
| Check imports `./App` | `starter` | `<slug>/starter/App.tsx` |
| Check imports `./App` | `solution` | `<slug>/solution/App.tsx` |
| Check imports `./api`, solution has no `api.ts` | `solution` | `<slug>/starter/api.ts` |
| `solution/App.tsx` imports `./api` | `solution` | `<slug>/starter/api.ts` |
| Non-relative source, or importer outside a drill | any | `null` |
| Source escapes the drill (`../other/App`) | any | `null` |

**Behavior — `evaluateFairness`:**

| Case | Input | Expected |
|------|-------|----------|
| Fair drill | starter 2 failed + 2 passed; solution 4 passed | `ok: true`; `line` = `fairness: <slug> OK (starter 2/4 failing, solution 4/4 passing)` |
| Already solved | starter 0 failed | `ok: false`; reason `starter passes every check` |
| Unsolvable | solution 1 failed | `ok: false`; reason `solution fails: <check name>` per failing check |
| Starter does not compile | starter `collected: false` | `ok: false`; reason `starter failed to load` |
| Solution does not compile | solution `collected: false` | `ok: false`; reason `solution failed to load` |
| No checks | zero checks in either run | `ok: false`; reason `no checks found` |
| Check sets differ | names differ between runs | `ok: false`; reason `check names differ between starter and solution` |
| Drill missing from a run | slug in `slugs`, absent from a run | `ok: false`; reason `no results for starter` / `no results for solution` |
| Failing `line` | any not-ok verdict | `fairness: <slug> FAILED — <reasons joined by "; ">` |

**Behavior — `createApi`:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Auto mode (default) | `request("a", 1)` | resolves `1` after 200–1200 ms; `calls()` is `["a"]`; never listed in `pending()` |
| Manual mode | `setManual()` then `request("a", 1)` | stays pending; `pending()` is `["a"]` |
| Release | `release("a")` | that promise resolves with its value; removed from `pending()` |
| Same label twice | two pending `"a"` | `release("a")` resolves the oldest only |
| Fail | `fail("a")` / `fail("a", "boom")` | rejects with `Error("Request failed")` / `Error("boom")` |
| Nothing pending | `release("x")` or `fail("x")` | throws `Error("No pending call: x")` |
| Reset | `reset()` | auto mode; `pending()` and `calls()` empty; earlier pending promises never settle |

**Behavior — scripts and config:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Variant selection | env `DRILL_VARIANT` = `starter` / `solution` | `vitest.drills.config.mts` installs `drillResolver` for it; unset or other value → config throws `DRILL_VARIANT must be starter or solution` |
| Check discovery | env `DRILL_SLUG` unset / set | `include` is `content/drills/*/checks/**/*.test.tsx` / `content/drills/<slug>/checks/**/*.test.tsx` |
| Alias | import of `drillbox:test` | resolves to `drills/testing/drillbox-test.ts`, which re-exports `describe, it, expect, beforeEach, afterEach` from vitest |
| Check lint in the gate | any drill's check file has `lintCheckFile` problems | that drill's verdict is not ok, with each problem as a reason |
| Fairness run | `npm run test:drills` | runs the config once per variant (`starter`, `solution`) with the JSON reporter into a temp file, feeds results to `evaluateFairness`, prints one `line` per drill, exits 1 if any verdict is not ok, else 0 |
| Vitest exit code | vitest exits non-zero because checks failed | ignored; only the parsed per-check results decide the verdict |
| Unhandled rejections | a starter leaves a rejected promise unhandled | tolerated for the `starter` variant (`dangerouslyIgnoreUnhandledErrors: true`); for `solution` they fail the run and the drill's verdict gets the reason `solution raised an unhandled error` |
| Zero drills | no drill folders | prints `fairness: no drills yet`, exits 0 |
| Bad `DRILL_SLUG` | not a slug, or no such drill | prints `Unknown drill: <value>`, exits 1 |

**Exact values:** `testTimeout` 3000; environment `jsdom`; setup file registers
`@testing-library/jest-dom/vitest` and Testing Library `cleanup` after each test.
`drillbox-test.d.ts` declares module `drillbox:test` with the same five exports typed from
vitest. The script spawns vitest with an argument array, never a shell string, and passes
the slug only through the validated environment variable.

**Verify:** `npx vitest run drills/testing` → all pass; `npm run test:drills` → prints
`fairness: no drills yet` (before any drill task) and exits 0.
**Commit:** `feat(drills): check harness and fairness gate`

---

## Task 4: Progress store

**Files:**
- Create: `drills/progress.ts`, `drills/progress.test.ts`, `drills/useProgress.ts`, `drills/useProgress.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface DrillRecord { completedOn: string | null; revealed: boolean }
export interface DrillProgress { version: 1; drills: Record<string, DrillRecord> }
export type DrillStatus = "todo" | "done" | "done-with-help";
export const PROGRESS_KEY = "drills:progress:v1";
export const EMPTY_PROGRESS: DrillProgress;
export function parseProgress(raw: string | null): DrillProgress;
export function markCompleted(p: DrillProgress, slug: string, today: string): DrillProgress;
export function markRevealed(p: DrillProgress, slug: string): DrillProgress;
export function drillStatus(p: DrillProgress, slug: string): DrillStatus;
export function todaysDrill(orderedSlugs: string[], p: DrillProgress): string | null;
export function completedCount(orderedSlugs: string[], p: DrillProgress): number;
export function streak(p: DrillProgress, today: string): number;
export function localDate(d: Date): string;
// drills/useProgress.ts
export function useProgress(): {
  progress: DrillProgress; ready: boolean;
  complete(slug: string): void; reveal(slug: string): void;
};
```

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Parse null / invalid JSON / wrong shape / `version: 2` | — | `EMPTY_PROGRESS` |
| Parse bad date | `completedOn: "yesterday"` | `EMPTY_PROGRESS` |
| Complete | not completed, today `2026-11-19` | `completedOn: "2026-11-19"`; input object not mutated |
| Complete again | already completed `2026-11-18` | date stays `2026-11-18` |
| Reveal before completing | — | `revealed: true`, `completedOn: null` |
| Reveal after completing | completed, `revealed: false` | unchanged |
| Status | completed + not revealed / completed + revealed / otherwise | `done` / `done-with-help` / `todo` |
| Today's drill | slugs `[a,b,c]`, `a` done | `b`; all done → `null` |
| Completed count | records for slugs not in the list | not counted |
| Streak, none | no completions | `0` |
| Streak, today only | completion on `2026-11-19`, today `2026-11-19` | `1` |
| Streak, yesterday only | completion on `2026-11-18`, today `2026-11-19` | `1` |
| Streak, run | `11-17`, `11-18`, `11-19`, today `11-19` | `3` |
| Streak, broken | `11-15`, `11-16`, `11-18`, today `11-19` | `1` |
| Streak, stale | latest `11-17`, today `11-19` | `0` |
| Streak, two on one day | two drills on `11-19` | `1` |
| Streak across months | `2026-10-31`, `2026-11-01`, today `2026-11-01` | `2` |
| `localDate` | `new Date(2026, 0, 5, 23, 59)` | `"2026-01-05"` |
| Hook, first render | — | `ready: false`, `progress` = `EMPTY_PROGRESS` (matches server render) |
| Hook, after mount | stored valid progress | `ready: true`, `progress` loaded |
| Hook, `complete` / `reveal` | — | state updated and written to `PROGRESS_KEY` |
| Hook, storage throws on read or write | — | no throw; state still updates in memory |

In this slice only `reveal` is called from a page (Task 7). `complete`, the streak and the
other readers are built and tested here so the runner integration can use them unchanged.

**Verify:** `npx vitest run drills/progress.test.ts drills/useProgress.test.tsx` → all pass.
**Commit:** `feat(drills): progress, streak and today's-drill store`

---

## Task 5: Shared skin tokens and drills layout

**Files:**
- Create: `app/hybrid-skin.css`, `app/drills/layout.tsx`, `app/drills/drills.css`, `drills/components/DrillsShell.tsx`, `drills/components/DrillsShell.test.tsx`, `drills/metadata.ts`, `drills/metadata.test.ts`, `drills/styles/scoping.test.ts`, `drills/styles/tokens.test.ts`
- Modify: `app/papers/papers.css`, `app/papers/layout.tsx`

**Interfaces:**
- Produces: root element `<div className="drills …font variables">`; CSS custom
  properties `--night --panel --deep --dim --steel --mist --white --cyan --slime --gold
  --ember --frame4 --frame3` available under `.drills`; font variables `--font-sans`,
  `--font-code`, `--font-pixel`, `--font-mono`; content container class `drills-page`;
  `export function DrillsShell(props: { children: React.ReactNode }): JSX.Element`
  (header, `<main className="drills-page">`, footer; no hooks; rendered by the layout
  inside the root element); `export const drillsMetadata: Metadata` in
  `drills/metadata.ts`, re-exported by the layout as `metadata`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Token extraction | the palette and frame custom properties in `.papers` | moved unchanged to `app/hybrid-skin.css` under `:where(.papers, .drills)`; `papers.css` keeps every other declaration; both layouts import `hybrid-skin.css` before their own stylesheet |
| Token values pinned | `drills/styles/tokens.test.ts` reads the three CSS files as text | `hybrid-skin.css` declares, under `:where(.papers, .drills)`, exactly the 13 properties in **Exact values** with exactly those values; `papers.css` declares none of those 13 names; `drills.css` declares none of them |
| Import order pinned | same test reads `app/papers/layout.tsx` and `app/drills/layout.tsx` as text | each imports `hybrid-skin.css` on a line before its own stylesheet |
| Papers unchanged | `git diff main -- app/papers/papers.css` | only the 13 token declarations (and their comment) removed from the `.papers` rule; no other line changed. With the pinned values and import order, the computed colours and frames on `/papers` are the same as before |
| Scoping | every selector in `app/drills/drills.css` | starts with `.drills` (test parses the file and fails on any that does not; `@keyframes` names start with `drills-`) |
| Banned styles | `drills.css` | contains no `border-radius` and no `blur(`; test enforces |
| Header | `DrillsShell` rendered in a test | home link text `◀ FRANCISCO SOLTERO` to `/` (plain `<a>`), wordmark `DRILLS` linking to `/drills` |
| Footer | `DrillsShell` rendered in a test | text `react review drills · find the bugs, fix the PR` |
| Metadata | `drillsMetadata` | `title.template` `%s · Drills · Francisco Soltero`, `title.default` `Drills`; no `robots` key |
| Fonts | — | same four `next/font/google` families, weights and variable names as `app/papers/layout.tsx` |

**Exact values:** the 13 tokens, copied from `app/papers/papers.css` on `main`:
`--night: #1a1c2c`, `--panel: #0e1530`, `--deep: #29366f`, `--dim: #333c57`,
`--steel: #566c86`, `--mist: #94b0c2`, `--white: #f4f4f4`, `--cyan: #73eff7`,
`--slime: #a7f070`, `--gold: #ffcd75`, `--ember: #ef7d57`,
`--frame4: 0 -4px #000, 0 4px #000, -4px 0 #000, 4px 0 #000`,
`--frame3: 0 -3px #000, 0 3px #000, -3px 0 #000, 3px 0 #000`.
`:where()` adds no specificity, so every existing papers rule keeps winning as before.

**Rollback:** `git revert` of this task's commit restores both papers files exactly.

**Verify:** `npx vitest run drills/styles drills/components/DrillsShell.test.tsx drills/metadata.test.ts`
→ all pass; `git diff main --stat -- app/papers` → only `papers.css` and `layout.tsx`
listed; `npm run build` → succeeds.
**Commit:** `feat(drills): shared hybrid-skin tokens and drills section shell`

---

## Task 6: Index page

**Files:**
- Create: `app/drills/page.tsx`, `drills/components/DrillList.tsx`, `drills/components/DrillList.test.tsx`

**Interfaces:**
- Consumes: `getAllDrills(): Drill[]`, `DrillMeta`.
- Produces: `export function DrillList(props: { drills: DrillMeta[] }): JSX.Element`
  (no hooks, no client state). `app/drills/page.tsx` is a static server component that
  passes the metas.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Heading and intro | — | `<h1>` `REACT REVIEW DRILLS`; intro `Each drill is a pull request that runs but isn't ready to merge. Read the brief, find what's wrong, fix it.` |
| List | 10 drills | one entry per drill in `order`: number, title linking to `/drills/<slug>`, summary, skills, `<minutes> MIN`, difficulty as filled/empty pips out of 3 with `aria-label` `Difficulty <n> of 3` |
| No progress UI | any | no streak, no done count, no status badges, no "today's drill" card |
| No drills | empty list | text `No drills yet.` |
| Page metadata | — | `description` = the intro sentence (verified on the built page by Task 7's `test:drills-pages`) |

**Verify:** `npx vitest run drills/components/DrillList.test.tsx` → all pass.
**Commit:** `feat(drills): index page listing every drill`

---

## Task 7: Drill page

**Files:**
- Create: `app/drills/[slug]/page.tsx`, `app/drills/[slug]/page.test.ts`, `drills/components/HintList.tsx`, `drills/components/SolutionReveal.tsx`, `drills/components/HintList.test.tsx`, `drills/components/SolutionReveal.test.tsx`, `scripts/drills-pages-check.mts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `getAllDrills`, `getDrillBySlug`, `getAdjacentDrills`, `Drill`;
  `useProgress()` (only its `reveal`).
- Produces:

```ts
export function HintList(props: { hints: string[] }): JSX.Element;
export function SolutionReveal(props: { slug: string; children: React.ReactNode }): JSX.Element;
```

`HintList.tsx` and `SolutionReveal.tsx` start with `"use client"` (they hold state;
`SolutionReveal` calls `useProgress`). `app/drills/[slug]/page.tsx` stays a server
component: shiki and `next-mdx-remote/rsc` run only there, and the highlighted solution
reaches `SolutionReveal` as already-rendered `children`. The page exports
`dynamicParams`, `generateStaticParams` and `generateMetadata`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Static params | `page.test.ts` imports the page module | `dynamicParams === false`; `generateStaticParams()` returns `{ slug }` for every drill from `getAllDrills()` |
| Unknown or malformed slug | `page.test.ts` calls the default export with `params` resolving to `{ slug: "nope" }` and to `{ slug: "../x" }` | each call rejects (Next's not-found error), and nothing is read from disk for the malformed one |
| Metadata | `page.test.ts` calls `generateMetadata` for `like-button` | `title` `Like button`; `description` = that drill's summary |
| Header | — | `<h1>` title; meta line `DRILL <order> · <minutes> MIN · <skills joined by ", ">` |
| Brief | `brief.md` | rendered as markdown under heading `THE PULL REQUEST` |
| Starter files | each `drill.files` entry | under heading `STARTER CODE`; one block per file with its path as a label; `readOnly` files also labelled `READ-ONLY`; highlighted with shiki (`tsx`, theme `tokyo-night`); checks are never rendered. This section is a stand-in the runner-integration plan replaces with the workspace before release |
| Hints, initial | 3 hints | none visible; button `REVEAL HINT 1 OF 3` |
| Hints, click | click twice | hints 1 and 2 visible in order; button `REVEAL HINT 3 OF 3` |
| Hints, exhausted | all revealed | button removed |
| Solution, initial | — | button `REVEAL THE FIX`; solution code and explanation not visible (`hidden`) |
| Solution, reveal | click | children shown; `reveal(slug)` called once; button removed |
| Solution content | — | heading `THE FIX`; each `solutionFiles` entry highlighted like starter files; `explanation.md` rendered as markdown |
| No completion control | any | the page has no "mark as done" button and shows no done state |
| Prev / next | middle drill | links `◀ <prev title>` and `<next title> ▶`; ends omit the missing side; plus `ALL DRILLS` link to `/drills` |

**Exact values:** highlighted HTML comes only from shiki run on repository files at build
time; no request data reaches `dangerouslySetInnerHTML`. Markdown is rendered with
`next-mdx-remote/rsc`, so `brief.md` and `explanation.md` must not contain raw `{`, `}` or
`<` outside code spans and fenced code (Tasks 8–17 inherit this).
`package.json`: `scripts.test:drills-pages` is `node scripts/drills-pages-check.mts`, and
`scripts.check` becomes
`npm run typecheck && npm run lint && npm run test && npm run test:drills && npm run build && npm run test:drills-pages`.
The expected count is the number of drill folders on disk when the task runs, plus one
(`drills pages: 2 OK` if only `like-button` exists yet).

**Verify:** `npx vitest run drills/components "app/drills/[slug]/page.test.ts"` → all pass;
`npm run build && npm run test:drills-pages` → `drills pages: <drills on disk + 1> OK`, exit 0.
**Commit:** `feat(drills): drill page with brief, starter code, hints and solution`

**Behavior — `scripts/drills-pages-check.mts`** (run as `npm run test:drills-pages`; reads
the HTML that `next build` wrote; `<` `>` `&` in expected strings are compared after
HTML-unescaping the file):

| Case | Input / state | Expected |
|------|---------------|----------|
| No build | `.next/server/app/drills.html` missing | prints `drills pages: run npm run build first`, exits 1 |
| Index page | `.next/server/app/drills.html` | contains `REACT REVIEW DRILLS`, every drill's title, an `href="/drills/<slug>"` per drill, and a `<meta name="description"` whose content is the intro sentence |
| Each drill page | `.next/server/app/drills/<slug>.html` for every drill from `getAllDrills()` | file exists and contains: the title inside an `<h1`; `DRILL <order> · <minutes> MIN · <skills joined by ", ">`; `THE PULL REQUEST`; `STARTER CODE`; `REVEAL HINT 1 OF 3`; `REVEAL THE FIX`; `THE FIX`; `ALL DRILLS`; each `drill.files` path as a label; `READ-ONLY` if and only if the drill has a read-only file; `◀ <prev title>` and `<next title> ▶` exactly when that neighbour exists |
| Checks never rendered | each drill page | does not contain `App.test.tsx` or any check name from that drill |
| No completion control | each drill page | does not contain `mark as done` (case-insensitive) |
| Shell and metadata | each drill page | contains `◀ FRANCISCO SOLTERO`, the footer text, and `<title>` equal to `<drill title> · Drills · Francisco Soltero` |
| Nothing extra | `.next/server/app/drills/` | holds an `.html` file for each drill slug and for no other name |
| Result | all pass / any fail | prints `drills pages: <n> OK` (n = drills + 1), exits 0 / prints one `drills pages: FAILED <page> — <what is missing>` line per problem, exits 1 |

---

## Tasks 8–17: drill content — shared contract

Every drill task creates exactly this tree under `content/drills/<slug>/`:

| File | Contract |
|------|----------|
| `meta.json` | the values in the task's **Meta** line; exactly 3 hints, gentle to strong: hint 1 names where to look, hint 2 names the symptom's cause in plain words, hint 3 names the technique; no hint contains code |
| `brief.md` | opens with `This PR runs, but it isn't ready to merge.`; a numbered list `What the feature should do` matching the task's **Feature** list and stating every label from **UI contract** plus every other on-screen string its checks read (item, product, user and post names, prices, comment bodies, counter and error texts from the **API** and **Exact values** lines); never lists the bugs, and contains none of the banned check-name words from the Global Constraints (reviewer-checked against the **Planted bugs** line) |
| `starter/App.tsx` | default-exports `App`; implements the feature with exactly the **Planted bugs**; compiles and type-checks; no `className`, no `style` prop and no CSS import; "no other defects" is defined by the gate: every check marked green in the task's table passes on the starter, every check marked red fails, and each planted bug is the cause of at least one red check (the reviewer confirms the bug-to-check mapping) |
| `starter/api.ts` | only for drills with an **API** line: the body of `drills/testing/api-control.ts` copied verbatim, then `const { control, request } = createApi(); export const apiControl = control;` and the listed functions, each calling `request(<label>, <canned data>)` |
| `solution/App.tsx` | the fixed component; changes only what the bugs require |
| `checks/App.test.tsx` | one `it` per row of **Checks**, with that exact name, inside `describe("<title>")`; drills with an API call `apiControl.setManual()` in `beforeEach` and `apiControl.reset()` in `afterEach`, and wrap every `release`/`fail` in `await act(async () => { … })` |
| `explanation.md` | one `##` section per planted bug, each with the four labelled paragraphs `What you saw`, `Why`, `The fix`, `Rule to remember` |

Each drill task's **Verify** is `DRILL_SLUG=<slug> npm run test:drills` → prints
`fairness: <slug> OK (starter <f>/<n> failing, solution <n>/<n> passing)` where `<f>` is
the number of checks marked **red** below, and `npm run typecheck` → exits 0.
**Commit:** `content(drills): <slug>`.

In the tables below, **Starter** says whether the check must fail (`red`) or pass
(`green`) against `starter/`. Every check passes against `solution/`.

---

## Task 8: Drill 1 — `like-button`

**Files:**
- Create: `content/drills/like-button/**`

**Meta:** title `Like button`; order 1; difficulty 1; minutes 8; skills
`["array state", "immutable updates"]`; summary `A like button that doesn't light up, and won't un-like.`

**Feature:** three posts (`First post`, `Second post`, `Third post`), each with a button;
a line `Liked: <n>`.
**UI contract:** button accessible name `Like <title>` when not liked, `Unlike <title>`
when liked; count text `Liked: 0`.
**Planted bugs:** (1) liking calls `likedIds.push(id)` then `setLikedIds(likedIds)`;
(2) un-liking filters with `id === postId`, keeping only the clicked post.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `shows every post as not liked to begin with` | render | three `Like …` buttons; `Liked: 0` | green |
| `marks a post as liked when its button is clicked` | click `Like First post` | `Unlike First post` present; `Liked: 1` | red |
| `keeps earlier likes when another post is liked` | like first, then third | both `Unlike …`; `Liked: 2` | red |
| `un-likes only the post that was clicked` | like first and second, click `Unlike First post` | `Like First post`, `Unlike Second post`; `Liked: 1` | red |

---

## Task 9: Drill 2 — `click-counter`

**Files:**
- Create: `content/drills/click-counter/**`

**Meta:** title `Click counter`; order 2; difficulty 1; minutes 8; skills
`["functional updates", "state in async code"]`; summary `A counter that loses clicks.`

**Feature:** `Count: <n>`; buttons `Add 1`, `Add 3`, `Add 1 after saving`.
**API:** `saveClick(): Promise<void>` → label `save`.
**Planted bugs:** (1) `Add 3` calls `setCount(count + 1)` three times; (2) the delayed
handler does `await saveClick(); setCount(count + 1)`.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `starts at zero` | render | `Count: 0` | green |
| `adds one` | click `Add 1` | `Count: 1` | green |
| `adds three in one click` | click `Add 3` | `Count: 3` | red |
| `keeps clicks made while a save is in progress` | click `Add 1 after saving`, click `Add 1` twice, release `save` | `Count: 3` | red |
| `counts two saves started back to back` | click `Add 1 after saving` twice, release `save` twice | `Count: 2` | red |

---

## Task 10: Drill 3 — `notes-by-id`

**Files:**
- Create: `content/drills/notes-by-id/**`

**Meta:** title `Notes by id`; order 3; difficulty 1; minutes 10; skills
`["object state", "computed keys", "derived values"]`; summary `Saving one note wipes the others.`

**Feature:** three tasks (`Write tests`, `Fix build`, `Ship it`); each has a text input,
a `Save` button and, once saved, the note and a `Clear` button; a line `Notes saved: <n>`
counting tasks that currently have a note.
**UI contract:** input label `Note for <task>`; buttons `Save note for <task>`,
`Clear note for <task>`; saved note text `Note: <text>`; count `Notes saved: 0`.
**Planted bugs:** (1) save does `setNotes({ [taskId]: text })`; (2) clear does
`delete notes[taskId]; setNotes(notes)`; (3) the count is separate state incremented on
every save and never decremented.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `shows a saved note under its task` | save `mock the api` for `Write tests` | `Note: mock the api`; `Notes saved: 1` | green |
| `keeps earlier notes when another is saved` | save notes for two tasks | both notes shown; `Notes saved: 2` | red |
| `counts a task once when its note is saved again` | save twice for one task with different text | latest text shown; `Notes saved: 1` | red |
| `clears only the chosen note` | save for two tasks, clear one | cleared note gone, other remains; `Notes saved: 1` | red |

---

## Task 11: Drill 4 — `card-with-button`

**Files:**
- Create: `content/drills/card-with-button/**`

**Meta:** title `Card with a button`; order 4; difficulty 1; minutes 8; skills
`["event bubbling", "semantic buttons"]`; summary `Adding to the cart keeps changing the selection.`

**Feature:** three products (`Lamp`, `Desk`, `Chair`); selecting one shows
`Selected: <name>` (initially `Selected: none`); each has an add-to-cart button;
`Cart: <n>`. Selection must work from the keyboard.
**UI contract:** buttons `Select <name>` and `Add <name> to cart`.
**Planted bugs:** (1) selection is an `onClick` on the card's wrapping `<div>` that
contains the add button, so adding also selects; (2) there is no `Select <name>` button,
only the clickable `<div>` with the text `Select <name>`.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `starts with nothing selected and an empty cart` | render | `Selected: none`; `Cart: 0` | green |
| `adds to the cart` | click `Add Desk to cart` | `Cart: 1` | green |
| `leaves the selection alone when adding to the cart` | click `Add Desk to cart` | `Selected: none` | red |
| `offers a button to select each product` | `getByRole("button", { name: "Select Lamp" })`, click it | `Selected: Lamp` | red |
| `keeps the selection when a different product is added` | select `Lamp`, add `Chair` | `Selected: Lamp`; `Cart: 1` | red |

---

## Task 12: Drill 5 — `removable-list`

**Files:**
- Create: `content/drills/removable-list/**`

**Meta:** title `Removable list`; order 5; difficulty 2; minutes 10; skills
`["list keys", "stable ids"]`; summary `Remove a guest and someone else's checkbox changes.`

**Feature:** guest list starting `Ada`, `Grace`, `Linus` (in that order); each row is its
own component holding a `Plus one` checkbox in local state, and a remove button; a text
input and `Add guest` button add a guest at the **top**.
**UI contract:** checkbox label `Plus one for <name>`; button `Remove <name>`; input label
`Guest name`; button `Add guest`.
**Planted bugs:** (1) rows use `key={index}`; (2) a new guest's id is
`guests.length + 1`, which repeats after a removal, and removal filters by id.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `lists the guests in order` | render | rows `Ada`, `Grace`, `Linus` | green |
| `keeps other guests' plus-one choices when one is removed` | tick `Grace`, remove `Ada` | `Plus one for Grace` checked; `Plus one for Linus` unchecked | red |
| `keeps existing choices when a guest is added at the top` | tick `Ada`, add `Alan` | `Plus one for Ada` checked; `Plus one for Alan` unchecked | red |
| `removes only the chosen guest after earlier changes` | remove `Ada`, add `Alan`, remove `Alan` | rows `Grace`, `Linus` | red |

---

## Task 13: Drill 6 — `cart-total`

**Files:**
- Create: `content/drills/cart-total/**`

**Meta:** title `Cart total`; order 6; difficulty 2; minutes 10; skills
`["derived state", "single source of truth"]`; summary `The total drifts away from what's in the cart.`

**Feature:** cart lines with quantity controls and remove; `Items: <n>` (sum of
quantities); `Total: $<x.xx>`; a `10% off` checkbox applied to the whole total. The
decrease button is disabled at quantity 1.
**UI contract:** buttons `Increase <name>`, `Decrease <name>`, `Remove <name>`; checkbox
label `10% off`; per-line text `<name> × <qty>`.
**Planted bugs:** (1) `itemCount` and `total` are separate state, updated by increase
only, not by decrease or remove; (2) the discount multiplies the stored total by `0.9`
when ticked and divides by `0.9` when unticked, so changes made while it is on are wrong.

**Exact values:** prices in cents: `Notebook` 450, `Pen` 125, `Bag` 2999; every quantity
starts at 1. Money is computed in integer cents and the discounted total is
`Math.round(cents * 0.9)`.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `shows the starting items and total` | render | `Items: 3`; `Total: $35.74` | green |
| `updates items and total when a quantity goes up` | increase `Pen` | `Items: 4`; `Total: $36.99` | green |
| `updates items and total when a quantity goes down` | increase `Pen`, decrease `Pen` | `Items: 3`; `Total: $35.74` | red |
| `updates items and total when a line is removed` | remove `Bag` | `Items: 2`; `Total: $5.75` | red |
| `applies the discount to the whole total` | tick `10% off` | `Total: $32.17` | green |
| `applies the discount to changes made while it is on` | tick `10% off`, increase `Notebook` | `Total: $36.22` | red |
| `returns to the full total when the discount is turned off` | tick, increase `Notebook`, untick | `Total: $40.24` | red |

---

## Task 14: Drill 7 — `profile-switcher`

**Files:**
- Create: `content/drills/profile-switcher/**`

**Meta:** title `Profile switcher`; order 7; difficulty 2; minutes 12; skills
`["useEffect", "effect cleanup", "loading and error states"]`; summary `Switch users quickly and the wrong profile shows up.`

**Feature:** buttons for three users; the selected user's profile loads and shows name
and role; `Loading…` while loading; an error message if loading fails. User 1 is selected
on mount.
**UI contract:** buttons `Show Ada`, `Show Grace`, `Show Linus`; profile as
`<h2>` name and a line `Role: <role>`; loading text `Loading…`; error text
`Could not load profile` in an element with `role="alert"`.
**API:** `type User = { id: number; name: string; role: string }`;
`fetchUser(id: number): Promise<User>` → label `user:<id>`; users
`1 Ada / Engineer`, `2 Grace / Admiral`, `3 Linus / Maintainer`.
**Planted bugs:** (1) the effect has no cleanup, so a late response overwrites a newer
one; (2) loading is set only on mount, so the old profile stays up with no `Loading…`
after switching; (3) there is no rejection handling, so a failure leaves the previous
state on screen forever.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `shows Loading… and then the first profile` | render; release `user:1` | `Loading…` first; then heading `Ada`, `Role: Engineer` | green |
| `shows Loading… while a newly chosen profile is on its way` | release `user:1`; click `Show Grace` | `Loading…` shown; heading `Ada` not shown | red |
| `shows the last chosen profile whatever order responses arrive in` | click `Show Grace`, click `Show Linus`; release `user:3`, `user:2`, `user:1` | heading `Linus` | red |
| `shows an error when the profile cannot be loaded` | fail `user:1` | alert `Could not load profile`; no `Loading…` | red |
| `recovers when another user is chosen after an error` | fail `user:1`; click `Show Grace`; release `user:2` | heading `Grace`; no alert | green |

---

## Task 15: Drill 8 — `comment-threads`

**Files:**
- Create: `content/drills/comment-threads/**`

**Meta:** title `Comment threads`; order 8; difficulty 3; minutes 12; skills
`["state keyed by id", "event-handler races", "derived counts"]`; summary `Comments show up under the wrong post.`

**Feature:** three posts; a button per post opens its comments directly below it; one
thread open at a time; `Threads loaded: <n>` counts distinct threads fetched; a thread
already fetched is not requested again; `Loading comments…` while the open thread loads.
**UI contract:** button `Show comments for <title>`; each post is a `<section>` with
`aria-label` = its title; comments are `<li>` items inside that section; loading text
`Loading comments…`; counter `Threads loaded: 0`.
**API:** `type Comment = { id: number; postId: number; body: string }` (ids `postId * 10 + 1` and
`postId * 10 + 2`); `fetchComments(postId: number): Promise<Comment[]>` → label `comments:<id>`;
posts `1 Alpha`, `2 Beta`, `3 Gamma`; two comments per post with bodies
`<Title> comment 1`, `<Title> comment 2`.
**Planted bugs:** (1) one shared `comments` array plus `selectedPostId` set on click, with
no loading state, so a late response lands under the wrong post and the previous thread
shows while the new one loads;
(2) the counter is `setThreadsLoaded(threadsLoaded + 1)` on every response; (3) nothing
is cached, so reopening refetches.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `opens the comments under the post that was clicked` | click Alpha; release `comments:1` | `Alpha comment 1` inside section `Alpha`; `Threads loaded: 1` | green |
| `does not show another post's comments while a thread loads` | open Alpha, release; click Beta | section `Beta` shows `Loading comments…` and no `Alpha comment 1` | red |
| `shows the last clicked post's comments whatever order responses arrive in` | click Alpha, click Beta; release `comments:2`, then `comments:1` | section `Beta` has `Beta comment 1`; no `Alpha comment 1` anywhere; `Threads loaded: 2` | red |
| `counts each thread once` | click Alpha, release `comments:1`; click Beta, release `comments:2`; assert `Threads loaded: 2`; click Alpha again; if `apiControl.pending()` includes `comments:1`, release it | `Threads loaded: 2` (the starter refetches, so its released response makes it `3`) | red |
| `does not request a thread it already has` | open Alpha, release; open Beta, release; open Alpha | `apiControl.calls()` is `["comments:1", "comments:2"]`; Alpha's comments shown at once | red |

---

## Task 16: Drill 9 — `search-filters`

**Files:**
- Create: `content/drills/search-filters/**`

**Meta:** title `Search filters`; order 9; difficulty 2; minutes 10; skills
`["effect dependencies", "object identity", "derived values"]`; summary `One search turns into a flood of requests.`

**Feature:** a text input and an `In stock only` checkbox; results load for the current
filters and list product names; `Results: <n>`.
**UI contract:** input label `Search products`; checkbox label `In stock only`; results
as `<li>` items; count `Results: 0`.
**API:** `type Product = { id: number; name: string; inStock: boolean }` (ids 1, 2, 3 in the
order listed); `searchProducts(filters: { query: string; inStock: boolean }): Promise<Product[]>`
→ label `search:<query>:<inStock>` (for example `search::false`, `search:lamp:true`);
canned catalogue: `Lamp` (in stock), `Lantern` (out of stock), `Desk` (in stock);
matching is case-insensitive substring on name.
**Planted bugs:** (1) the effect depends on a `filters` object created during render, so
every state update triggers another request; (2) `Results: <n>` is separate state set by
an effect with an empty dependency array, so it stays at its first value.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `shows results for the starting filters` | render; release `search::false` | `Lamp`, `Lantern`, `Desk` listed | green |
| `asks once for the current filters` | render; release `search::false`; wait for the list | `apiControl.calls()` is exactly `["search::false"]` | red |
| `asks again when the query changes` | after first load, type `la`; release `search:la:false` | `Lamp`, `Lantern` listed; calls are exactly `["search::false", "search:la:false"]` | red |
| `asks again when In stock only is ticked` | after first load, tick; release `search::true` | `Lamp`, `Desk` listed; calls are exactly `["search::false", "search::true"]` | red |
| `shows a count that matches the list` | after first load | `Results: 3` | red |

**Exact values:** typing is a single `fireEvent.change` to the final value. Under manual
mode the starter makes exactly one extra request per released response, so it cannot loop
without bound. Neither starter nor solution clears the visible list while a request is
pending.

---

## Task 17: Drill 10 — `posts-feed` (capstone)

**Files:**
- Create: `content/drills/posts-feed/**`

**Meta:** title `Posts feed`; order 10; difficulty 3; minutes 25; skills
`["array state", "state keyed by id", "event bubbling", "list keys", "races", "error states"]`;
summary `A whole feature PR: posts, authors, likes and comment threads. It runs. It isn't ready.`

**Feature:**
1. Show every post's title, with its author's name under it (`Author: <name>`, or
   `Author: …` until authors have loaded).
2. A like button per post that toggles.
3. A comments button per post that opens that post's comments directly below it; one
   thread open at a time; `Loading comments…` while it loads; if it fails,
   `Could not load comments` in a `role="alert"` under that post.
4. `Threads loaded: <n>` counts distinct threads fetched.
5. Each post has a `Pin` checkbox held in the post row's own state.
6. A `Newest first` checkbox reverses the list order.

**UI contract:** each post is a `<section>` with `aria-label` = its title; buttons
`Like <title>` / `Unlike <title>`, `Show comments for <title>`; checkbox labels
`Pin <title>`, `Newest first`; comments as `<li>`; counter `Threads loaded: 0`.
**API:** `type Post = { id: number; title: string; userId: number }`;
`type User = { id: number; name: string }`;
`type Comment = { id: number; postId: number; body: string }` (ids `postId * 10 + 1`,
`postId * 10 + 2`); `fetchPosts(): Promise<Post[]>` → label `posts`;
`fetchUsers(): Promise<User[]>` → label `users`;
`fetchComments(postId: number): Promise<Comment[]>` → label `comments:<id>`. Posts `1 Alpha` (user 1), `2 Beta` (user 2),
`3 Gamma` (user 1); users `1 Ada`, `2 Grace`; two comments per post, bodies
`<Title> comment 1`, `<Title> comment 2`.
**Planted bugs:** (1) the comments click handler is on the post's wrapping element, so
liking or pinning also opens comments; (2) liking pushes into the existing array and
there is no un-like branch; (3) one shared `comments` array with `selectedPostId` set on
click; (4) `setThreadsLoaded(threadsLoaded + 1)` on every response, no cache;
(5) rows use `key={index}`; (6) a failed comments request is never handled.

This drill is written from scratch: its data, labels and structure are the ones above,
and no company, interviewer or third-party API is named anywhere in its files.

Every check below first releases `posts` and then `users` before its listed action,
except the two author checks, which state their own releases.

| Check | Action | Expected | Starter |
|-------|--------|----------|---------|
| `shows each post with its author` | release `posts`, `users` | section `Alpha` has `Author: Ada`; `Beta` has `Author: Grace` | green |
| `shows a placeholder author until authors arrive` | release `posts` only | section `Alpha` has `Author: …` | green |
| `likes and un-likes a post` | click `Like Alpha`, then `Unlike Alpha` | `Unlike Alpha` after the first click; `Like Alpha` after the second | red |
| `does not open comments when a post is liked` | click `Like Alpha` | `apiControl.calls()` has no `comments:1`; no `Loading comments…` | red |
| `shows the last clicked post's comments whatever order responses arrive in` | click comments for Alpha, then Beta; release `comments:2`, `comments:1` | `Beta comment 1` in section `Beta`; no `Alpha comment 1` anywhere | red |
| `counts each thread once and does not ask twice` | open Alpha, release `comments:1`; open Beta, release `comments:2`; open Alpha; if `apiControl.pending()` includes `comments:1`, release it | `Threads loaded: 2`; `apiControl.calls()` contains `comments:1` exactly once | red |
| `keeps a pin on its post when the order is reversed` | tick `Pin Alpha`; tick `Newest first` | `Pin Alpha` checked; `Pin Gamma` unchecked; first section is `Gamma` | red |
| `shows an error under the post when its comments fail` | click comments for Alpha; fail `comments:1` | alert `Could not load comments` inside section `Alpha`; no `Loading comments…` | red |
| `loads the comments on a second try after a failure` | fail `comments:1`; click comments for Alpha again; release `comments:1` | alert `Could not load comments` inside section `Alpha` after the failure; then `Alpha comment 1` shown; no alert | red |

---

## Task 18: Docs

**Files:**
- Modify: `CLAUDE.md`
- Create: `docs/drills/README.md`, `docs/drills/mistakes-and-fixes.md`

**Behavior:**

| Case | Expected |
|------|----------|
| `CLAUDE.md` section list | heading becomes `## Four sections (8-bit, papers, room planner, drills)` with a `/drills` bullet covering: content in `content/drills/<slug>/`, loader `lib/drills.ts`, hybrid skin scoped to `.drills`, storage key `drills:progress:v1`, **not released yet**: lives on the unmerged branch `drills-content`, with no navigation link and no sitemap entry until the Drillbox runner integration adds the in-browser workspace and progress display, `npm run test:drills` as the fairness gate, `npm run test:drills-pages` as the built-page check |
| `docs/drills/README.md` | how to add a drill (folder tree, check-file subset, naming rule for checks, the fairness gate), how to run one drill's checks (`DRILL_SLUG=<slug> npm run test:drills`), and links to both specs and this plan |
| `docs/drills/mistakes-and-fixes.md` | created with the table header `Date / Area / Mistake / Fix or rule`, plus one row for each thing that went wrong during this plan's execution; if nothing did, exactly one row `<date> / plan execution / none recorded / —` |

**Verify:** `npm run check` → exits 0; `npm run test:drills` → ten `fairness: <slug> OK` lines;
`grep -c "^## Four sections (8-bit, papers, room planner, drills)" CLAUDE.md` → `1`;
`grep -c "drills-content" CLAUDE.md` → at least `1`;
`grep -c "Date / Area / Mistake / Fix or rule\|| Date | Area | Mistake | Fix or rule |" docs/drills/mistakes-and-fixes.md` → `1`;
`grep -c "specs/2026-11-19" docs/drills/README.md` → `2`; then every row of **Done criteria (whole plan)**.
**Commit:** `docs(drills): section orientation, authoring guide and lessons log`
