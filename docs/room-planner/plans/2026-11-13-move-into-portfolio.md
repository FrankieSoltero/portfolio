# Room Planner: Move Into the Portfolio — Implementation Plan

> **For executors:** execute with soltero-skills:lean-sdd. The Task Dependency
> Table below is the scheduling and review-depth contract.

**Goal:** The existing Room Planner runs unchanged at `/room-planner` inside the
portfolio's Next.js app, with its tests, a quest card that links to it, and its docs.

**Architecture:** The planner's source is copied into a top-level `room-planner/`
folder and keeps its internal layout. A new App Router route renders it as a
client-only component (server rendering off). The planner's global CSS is scoped to a
`.room-planner` wrapper so it cannot affect the other two sections.

**Spec:** `docs/room-planner/specs/2026-11-13-portfolio-move-and-room-editor-design.md`,
section "Slice A" (a table; tasks cite its rows by their first-column name). Slices B
to D are out of scope here.

**Tech stack / test runner:** Next.js 15.5 (App Router), React 19, TypeScript 5.9,
Vitest 5 with jsdom and React Testing Library, ESLint 10 flat config. One test file:
`npx vitest run <file>`. Everything: `npm run check`.

## Global Constraints

- Repo root is the portfolio repository (the folder holding `next.config.ts`). All
  paths are relative to it. Branch: `room-planner`. Never commit on `main`.
- **Source of the copy:** the standalone planner repository at commit `a95387b`,
  `https://github.com/FrankieSoltero/room-planner`. A local clone sits beside this
  repo at `../Room Planner Website`. Before copying, confirm
  `git -C "../Room Planner Website" rev-parse --short HEAD` prints `a95387b`. Copy
  only git-tracked files (`git -C "../Room Planner Website" ls-files`). Never modify
  anything in that folder.
- **Never edit** `public/support.js`, `public/vendor/**`, `app/papers/**`,
  `components/papers/**`, `content/**`, `app/globals.css`, `app/layout.tsx`, or
  anything under `docs/room-planner/design_handoff/` after it is copied. `lib/**` is
  edited only by Task 2 and `public/index.html` only by Task 8, each only as that
  task states.
- The planner's behaviour does not change. No test may be deleted or weakened except
  where a task names the test and the reason. After Task 4 the planner suite is
  **445 tests in 28 files** (the standalone 447 in 29, minus the 2 tests of
  `indexHtml.test.ts`, which guards a file that does not exist here).
- **Test first.** In Tasks 5 to 8 the task's new or changed tests are written first
  and seen failing for the expected reason before the production edit; the report
  quotes the failing output.
- TypeScript stays at the portfolio's installed `^5` (5.9.x). Do not raise it.
- Install only the packages a task names, at the ranges it names.
- No secrets, no environment variables, no network calls at runtime. No external
  runtime resource (fonts, scripts, images) may be added to the planner route.
- User-provided strings stay rendered as React text. No `dangerouslySetInnerHTML`.
- Stage explicit paths only (`git add <path>…`). Never `git add -A`, `git add .` or
  `git commit -a`. The untracked `Multiplayer_AI_Sprite.aseprite` at the repo root is
  the owner's file: never stage, move or delete it.
- Never run `next build` while a `next dev` server is running in this repo (both
  write `.next/`). Tasks 8, 9 and 10 do not run `next build`.
- One commit per task, with the message the task gives (Task 11 may add one commit
  per defect it fixes). Record every mistake and its fix in
  `docs/room-planner/mistakes-and-fixes.md` (it exists after Task 9; before that,
  put the entry in the task report and Task 10 appends it).
- 8-bit page rules (`CLAUDE.md`, `STYLE_GUIDE.md`) apply to `public/index.html`:
  inline styles only, Sweetie-16 colours only, no logic inside `{{ }}` holes.
- The page title suffix ` · Francisco Soltero` comes from the existing title template
  in `app/layout.tsx`, which is not edited.

## Amendment 1 (2026-11-13, owner decision during Task 1)

The plan assumed `npm audit fix` would clear `postcss`. It does not: `next@15.5.29`,
the newest 15.x, pins `postcss@8.4.31`, and the advisory covers `<=8.5.22`; npm's only
offered fix is Next.js 16. The owner chose to pin a patched `postcss` instead. Task 1
therefore also adds an `overrides` entry in `package.json` forcing `postcss` under
`next` to the newest patched 8.5.x release (8.5.23 or later). The expected audit
result after Task 1 is unchanged (`0 1 4`: zod is the one high), with `next` no longer
listed as moderate. If the build or the papers HTML comparison differs with the
override in place, Task 1 stops and reports. A Next.js 16 upgrade is a follow-up for
the pull request description; when it lands, the override is removed.

## Task Dependency Table

| Task | Files touched | Depends on | Risk tier |
|------|---------------|------------|-----------|
| 1. Non-breaking security updates | `package.json`, `package-lock.json`, `docs/fixes-log.md` | — | standard |
| 2. Upgrade zod to version 4 | `package.json`, `package-lock.json`, `lib/papers.ts`, `docs/fixes-log.md` | 1 | standard |
| 3. Test and lint tooling | `package.json`, `package-lock.json`, `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`, `.gitignore` | 2 | standard |
| 4. Source copy | `room-planner/**` | 3 | standard |
| 5. Style scoping and token reader | `room-planner/styles/industry.css`, `room-planner/styles/app.css`, `room-planner/styles/tokens.ts`, `room-planner/styles/tokens.test.ts`, `room-planner/styles/scoping.test.ts`, `room-planner/components/Stage/ThreeView.test.tsx`, `room-planner/components/Stage/BlueprintView.test.tsx` | 4 | standard |
| 6. Planner root component | `room-planner/PlannerRoot.tsx`, `room-planner/PlannerRoot.test.tsx` | 5 | standard |
| 7. Route | `app/room-planner/page.tsx`, `app/room-planner/PlannerLoader.tsx`, `app/room-planner/PlannerLoader.test.tsx`, `app/room-planner/error.tsx`, `app/room-planner/error.test.tsx`, `vitest.config.ts` | 6 | judgment |
| 8. Quest card and sitemap | `public/index.html`, `app/sitemap.ts`, `room-planner/site/siteIntegration.test.ts` | 4 | standard |
| 9. Docs copy | `docs/room-planner/specs/2026-11-12-room-planner-workspace-design.md`, `docs/room-planner/plans/2026-11-12-room-planner-workspace.md`, `docs/room-planner/plan-reviews/2026-11-12-room-planner-workspace-review.md`, `docs/room-planner/verification/`, `docs/room-planner/mistakes-and-fixes.md`, `docs/room-planner/design_handoff/**` | 4 | mechanical |
| 10. Docs for the new section | `docs/room-planner/README.md`, `docs/room-planner/mistakes-and-fixes.md`, `README.md`, `CLAUDE.md` | 7, 8, 9 | mechanical |
| 11. Live verification | `docs/room-planner/verification/2026-11-13-portfolio-live-check.md`, `docs/room-planner/mistakes-and-fixes.md`, `room-planner/**`, `app/room-planner/**` | 10 | judgment |

Tasks 1 to 4 all write `package.json`, `package-lock.json` or the tree they install
into, and are serial. Tasks 8 and 9 touch files disjoint from each other and from
Tasks 5, 6 and 7, install nothing, and do not run `next build`; they may run
concurrently with Tasks 5 to 7. Because of that, no task's expected test-file or test
total after Task 4 is stated as an exact number: "all pass, none skipped" is the check.

---

## Task 1: Non-breaking security updates

**Spec:** Slice A, row "Dependencies" (audit target as amended by the owner).

`npm audit --omit=dev` on `main` reports 11 findings that predate this work: 1
critical (`next`), 6 high (`js-yaml`, `nanoid`, `postcss`, `sharp`, `source-map-js`,
`zod`), 4 low (`katex`, `rehype-katex`, `remark-math`, `micromark-extension-math`).

**Blast radius:** the audit fix updates `next` within `^15` and transitive runtime
packages used by the live `/` and `/papers` pages. The original lockfile stays
recoverable as `git show main:package-lock.json`. Papers regressions are caught here
by the build and the HTML comparison below, and again in Task 11 row P7.

**Files:**
- Modify: `package.json` (only if the audit fix changes a range)
- Modify: `package-lock.json`
- Modify: `docs/fixes-log.md`

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Baseline HTML | before any change: `npm run build`, `npx next start -p 3100`, then `curl -s localhost:3100/papers` and `curl -s localhost:3100/papers/grokking` saved outside the repo; stop the server | two files saved |
| Record before | `npm audit --omit=dev` | the findings list is in the task report |
| Fix | `npm audit fix` (never `--force`) | lockfile updated within existing semver ranges; no direct dependency changes major version |
| Record after | `npm audit --omit=dev` | 0 critical; exactly 1 high (`zod`); 4 low. If the result differs, stop and report (status BLOCKED) |
| Build still works | `npm run build` | exit 0; route list contains `/papers`, `/papers/[slug]`, `/papers/feed.xml`, `/sitemap.xml` |
| Papers unchanged | rebuild, restart on port 3100, fetch the same two URLs; compare with the baseline after removing `/_next/static/…` asset paths and build ids from both (state the exact `sed` used in the report) | the visible text and element structure are identical. Any other difference: stop and report |
| Log | — | `docs/fixes-log.md` gains a dated section `## 2026-11-13 — Dependency audit before the Room Planner move` with before and after counts by severity and the packages updated |

**Verify:** `npm run build` → exit 0. `npm audit --omit=dev --json | node -e "const v=JSON.parse(require('fs').readFileSync(0)).metadata.vulnerabilities;console.log(v.critical,v.high,v.low)"` → `0 1 4`.
**Commit:** `chore(deps): apply non-breaking security updates`

**Rollback:** `git revert` the commit; the lockfile returns to its prior state.

## Task 2: Upgrade zod to version 4

**Spec:** Slice A, row "Dependencies" (owner decision 2026-11-13: also upgrade zod).

The last high finding is GHSA-mrhx-c7xc-m3w5 in `zod` below 4.6.6. `zod` is imported
only by `lib/papers.ts`, which validates paper frontmatter at build time.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `lib/papers.ts` (only what zod 4 requires)
- Modify: `docs/fixes-log.md`

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Version | `package.json` | `"zod": "^4.6.7"`; installed version is 4.6.7 or later |
| Schema meaning | `reproSchema`, `paperMetaSchema` in `lib/papers.ts` | accept and reject exactly the same frontmatter as before: same fields, same required and optional status, same `YYYY-MM-DD` date rule and message, same enums, URL fields still must be URLs. Change an API call only where zod 4 removed or renamed it; a deprecation notice alone is not a reason |
| Exported types | `ReproMeta`, `PaperMeta` | unchanged shape; `npm run build` type-checks every consumer |
| Valid content | `npm run build` with the repo's content | exit 0; same route list as Task 1 |
| Invalid content | temporarily set `date: "2026/01/01"` in `content/papers/grokking.mdx`, run `npm run build` | build fails with a message that starts `Invalid frontmatter in content/papers/grokking.mdx:` and names `date` and `date must be YYYY-MM-DD`. Then restore the file: `git diff --stat content/` is empty |
| Papers unchanged | the same two-URL HTML comparison as Task 1, against Task 1's post-fix output | identical after the same normalisation |
| Audit | `npm audit --omit=dev` | 0 critical, 0 high, 4 low |
| Log | `docs/fixes-log.md` | the section Task 1 added gains the zod upgrade, what changed in `lib/papers.ts` (or "no code change needed"), and the 4 remaining low findings with package, advisory id and the reason they stay: each fix is a breaking change to the papers math rendering |

**Verify:** `npm run build` → exit 0. The audit one-liner from Task 1 → `0 0 4`.
`git diff --stat content/` → empty.
**Commit:** `chore(deps): upgrade zod to 4 to clear GHSA-mrhx-c7xc-m3w5`

**Rollback:** `git revert` the commit; zod returns to version 3.

## Task 3: Test and lint tooling

**Spec:** Slice A, rows "Dependencies" and "Checks".

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `eslint.config.mjs`
- Modify: `tsconfig.json`
- Modify: `next.config.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: npm scripts `typecheck`, `lint`, `test`, `check`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Dependencies | `package.json` | gains the packages under Exact values, nothing else |
| Scripts | `package.json` | `"typecheck": "tsc --noEmit"`, `"lint": "eslint --no-error-on-unmatched-pattern room-planner app/room-planner"`, `"test": "vitest run --passWithNoTests"`, `"check": "npm run typecheck && npm run lint && npm run test && npm run build"`. The old `"lint": "next lint"` is replaced: it has no config in this repo and prompts interactively |
| Vitest config | `vitest.config.ts` | `@vitejs/plugin-react`; `environment: 'jsdom'`; `setupFiles: ['room-planner/test/setup.ts']`; `css: false`; `include: ['room-planner/**/*.test.{ts,tsx}']`; alias `@` → repo root |
| Setup file not there yet | `room-planner/test/setup.ts` arrives in Task 4 | with no test files, `npm run test` exits 0 and reports no tests |
| ESLint config | `eslint.config.mjs` | flat config; applies to `**/*.{ts,tsx}`; extends `js.configs.recommended`, `tseslint.configs.recommended`, `reactHooks.configs.flat.recommended`; browser globals; global ignores `.next`, `node_modules`, `public`, `docs`, `papers-scaffold`. No `react-refresh` plugin (it is Vite-specific) |
| Next build and lint | `next.config.ts` | gains `eslint: { ignoreDuringBuilds: true }` with a comment: linting runs through `npm run lint`, and the flat config has no Next plugin. `git diff next.config.ts` shows only that addition |
| TypeScript scope | `tsconfig.json` | `exclude` gains `"docs"`. Nothing else changes |
| Git ignore | `.gitignore` | gains `coverage/` |
| Audit | `npm audit --omit=dev` | still `0 0 4`; `npm audit` (with dev packages) shows no critical or high finding in a package this task added. If one appears, stop and report |

**Exact values:**

Runtime dependencies to add: `three@^0.187.0`, `zustand@^5.1.0`,
`lucide-react@^1.72.0`, `@fontsource/barlow@^5.3.0`,
`@fontsource/barlow-condensed@^5.3.0`.

Dev dependencies to add: `vitest@^5.1.0`, `vite@^8.3.6`,
`@vitejs/plugin-react@^6.1.2`, `jsdom@^31.0.0`, `@testing-library/react@^16.3.3`,
`@testing-library/jest-dom@^7.0.1`, `@testing-library/user-event@^14.6.10`,
`@types/three@^0.187.0`, `eslint@^10.14.0`, `@eslint/js@^10.0.1`,
`typescript-eslint@^8.72.1`, `eslint-plugin-react-hooks@^7.1.1`, `globals@^17.13.0`.

**Verify:** `npm run check` → exit 0 (no tests yet; build lists the same routes as
Task 2). The audit one-liner → `0 0 4`.
**Commit:** `chore(room-planner): add test and lint tooling for the planner`

**Rollback:** `git revert` the commit.

## Task 4: Source copy

**Spec:** Slice A, rows "Location" and "History".

**Files:**
- Create: `room-planner/**` (the file set is defined by the Copy and Exclusions rows)

**Interfaces:**
- Produces: the folder `room-planner/` whose contents are the standalone repo's
  `src/` contents at the same relative paths (`src/App.tsx` → `room-planner/App.tsx`,
  `src/domain/types.ts` → `room-planner/domain/types.ts`, `src/test/setup.ts` →
  `room-planner/test/setup.ts`, and so on). Default export from
  `room-planner/App.tsx`: `export default function App(): JSX.Element`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Copy | every git-tracked file under `src/` in the source repo | present under `room-planner/` at the same relative path |
| Exclusions | `src/main.tsx`, `src/vite-env.d.ts`, `src/indexHtml.test.ts` | not copied (Vite entry, Vite types, and a guard for Vite's `index.html`) |
| Copy is exact | `diff -r "../Room Planner Website/src" room-planner`, run straight after copying and before any edit | reports only the three excluded files. The output is quoted in the report |
| JSX in tests | `tsconfig.json` has `"jsx": "preserve"` for Next | tests compile JSX. If the React plugin alone does not do it, set the automatic JSX runtime in `vitest.config.ts` (then that file is part of this commit); do not change `tsconfig.json`'s `jsx` |
| Types under Next | `npm run typecheck` | exit 0 with the portfolio's compiler options. If a copied file fails under TypeScript 5.9 or these options, fix the smallest thing in that file, list every changed file and line in the report, and do not loosen `tsconfig.json`. Those files then differ from the source; that is expected |
| Tests | `npm run test` | `Test Files 28 passed (28)`, `Tests 445 passed (445)`, none skipped |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0; same routes as before this task |

**Verify:** `npm run check` → exit 0, with `Test Files 28 passed (28)` and
`Tests 445 passed (445)`.
**Commit:** `feat(room-planner): copy the planner source into the portfolio`

The commit body states: source `https://github.com/FrankieSoltero/room-planner` at
`a95387b`, where the earlier history lives.

**Rollback:** `git revert` the commit. Nothing outside `room-planner/` changes.

## Task 5: Style scoping and token reader

**Spec:** Slice A, row "Style isolation".

The planner's stylesheets set rules on `:root`, `body`, `*` and bare elements. Scope
them so no rule can match an element outside the planner.

**Files:**
- Modify: `room-planner/styles/industry.css`
- Modify: `room-planner/styles/app.css`
- Modify: `room-planner/styles/tokens.ts`
- Modify: `room-planner/styles/tokens.test.ts`
- Create: `room-planner/styles/scoping.test.ts`
- Modify: `room-planner/components/Stage/ThreeView.test.tsx` (only if it sets CSS variables on the document root)
- Modify: `room-planner/components/Stage/BlueprintView.test.tsx` (only if it sets CSS variables on the document root)

**Interfaces:**
- Produces: `export const PLANNER_ROOT_CLASS = 'room-planner'` in
  `room-planner/styles/tokens.ts`.
- Produces: `export function readTokens(): Tokens | null` — same name and return type
  as before; now reads the variables from the first element matching
  `.room-planner`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Token variables | `:root { --color-bg: … }` block in `industry.css` | selector becomes `.room-planner`; declarations unchanged |
| Base text rules | the two `body { … }` rules | selector becomes `:where(.room-planner)`; declarations unchanged |
| Box sizing | `*, *::before, *::after` | becomes `:where(.room-planner), :where(.room-planner) *, :where(.room-planner) *::before, :where(.room-planner) *::after` |
| Bare elements | `h1`…`h6`, `p`, `a`, `img`, `figure`, `figcaption`, and any other selector with no class | each gains the prefix `:where(.room-planner) ` (descendant). `:where` adds no specificity, so every class rule wins exactly as it does today |
| Pseudo-only | `:focus`, `:focus-visible`, `::selection` | become `:where(.room-planner) :focus`, `:where(.room-planner) :focus-visible`, `:where(.room-planner) ::selection` |
| Class rules | any selector that already contains a class (`.btn`, `textarea.input`, …) | unchanged |
| App root | `#root { min-height: 100vh; }` in `app.css` | selector becomes `.room-planner`; declaration unchanged |
| At-rules | rules inside `@media` or `@supports` | same treatment as top-level rules |
| Scoping test: selectors | every selector of every rule in every `room-planner/**/*.css` file (comments stripped, at-rule preludes and `@keyframes` steps skipped) | contains a class selector or `:where(.room-planner)`; none contains `:root`, `html`, `body` or `#root` |
| Scoping test: collisions | class names defined in `room-planner/**/*.css` versus class names defined in `app/papers/papers.css` | no name in common |
| Collision found | the collision test fails | do not rename anything; stop and report the names (status NEEDS_CONTEXT) |
| Tokens read | an element with class `room-planner` exists and has the variables set on it | `readTokens()` returns them trimmed |
| Tokens not ready | wrapper exists, `--color-text` unset | `readTokens()` returns `null` |
| No wrapper | no `.room-planner` element in the document | `readTokens()` returns `null`, does not throw |
| Existing tests | tests that set variables on `document.documentElement` | updated to create a `.room-planner` element and set them there; assertions otherwise unchanged. No existing test is removed |

**Verify:** `npx vitest run room-planner/styles` → all pass, including
`scoping.test.ts` and the three `readTokens` cases; `npm run test` → all pass, none
skipped; `npm run typecheck` and `npm run lint` → exit 0.
**Commit:** `refactor(room-planner): scope planner styles to a wrapper element`

**Rollback:** `git revert` the commit.

## Task 6: Planner root component

**Spec:** Slice A, rows "Route" (the wrapper) and "Fonts".

**Files:**
- Create: `room-planner/PlannerRoot.tsx`
- Test: `room-planner/PlannerRoot.test.tsx`

**Interfaces:**
- Consumes: `export default function App(): JSX.Element` from
  `room-planner/App.tsx`; `PLANNER_ROOT_CLASS` from `room-planner/styles/tokens.ts`.
- Produces: `export default function PlannerRoot(): JSX.Element` in
  `room-planner/PlannerRoot.tsx`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Wrapper | `<PlannerRoot />` rendered | exactly one element with class `room-planner`; the `.app` shell and the header text `Room planner` are inside it |
| Class source | the wrapper's class | comes from `PLANNER_ROOT_CLASS`, not a second string literal |
| Stylesheets | imports at the top of `PlannerRoot.tsx` | `@fontsource/barlow/400.css`, `@fontsource/barlow/500.css`, `@fontsource/barlow/700.css`, `@fontsource/barlow-condensed/400.css`, `@fontsource/barlow-condensed/600.css`, then `./styles/industry.css`, then `./styles/app.css`, in that order (the same set and order as the standalone `main.tsx`) |
| Import test | the test reads `PlannerRoot.tsx` as text | the seven import lines appear in that order, and no import or string in the file contains `http://` or `https://` |

**Verify:** `npx vitest run room-planner/PlannerRoot.test.tsx` → pass;
`npm run typecheck && npm run lint` → exit 0.
**Commit:** `feat(room-planner): add the planner root component`

**Rollback:** `git revert` the commit.

## Task 7: Route

**Spec:** Slice A, rows "Route" and "Load failure".

**Files:**
- Create: `app/room-planner/page.tsx`
- Create: `app/room-planner/PlannerLoader.tsx`
- Test: `app/room-planner/PlannerLoader.test.tsx`
- Create: `app/room-planner/error.tsx`
- Test: `app/room-planner/error.test.tsx`
- Modify: `vitest.config.ts` (the test include list gains the pattern for test files under the route folder, "app/room-planner/**/*.test.{ts,tsx}")

**Interfaces:**
- Consumes: `export default function PlannerRoot(): JSX.Element` from
  `room-planner/PlannerRoot.tsx`.
- Produces: `export function PlannerLoading(): JSX.Element` and
  `export default function PlannerLoader(): JSX.Element` in
  `app/room-planner/PlannerLoader.tsx`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Client only | `app/room-planner/PlannerLoader.tsx` | starts with `'use client'`; loads `@/room-planner/PlannerRoot` with `next/dynamic`, `ssr: false`, `loading: PlannerLoading` |
| Loading state | `<PlannerLoading />` rendered | one `<p role="status">` with the exact text `Loading the room planner…` and the inline style under Exact values |
| Page | `app/room-planner/page.tsx` | server component; renders `<PlannerLoader />` and nothing else |
| Metadata | page `metadata` export | `title: 'Room Planner'`; `description: 'Lay out a room to scale, place furniture, and check the fit in 3D.'`; `alternates: { canonical: '/room-planner' }`; `icons: { icon: 'data:,' }` (stops the browser requesting `/favicon.ico`, which would log a console error) |
| Load failure | `app/room-planner/error.tsx`, a client component with the standard `{ error, reset }` props | renders a `<div role="alert">` with the text `The room planner failed to load.` and a `<button type="button">` labelled `Try again`, using the same inline colours as the loading state |
| Retry | click `Try again` | `reset` is called once |
| No leak | `error.tsx` rendered with `new Error('secret detail')` | the text `secret detail` is not in the document. The error is passed to `console.error` once, in an effect, so it reaches the browser console only |
| Build output | `npm run build` | exit 0; `/room-planner` is listed as a static route |
| Server HTML | `curl -s localhost:3000/room-planner` under `next start` | contains `Loading the room planner…` and `<title>Room Planner · Francisco Soltero</title>`; does not contain `class="app-body"` (the planner is not server-rendered) |
| 3D chunk | the script URLs in that HTML | none of the files they point to contains the string `WebGLRenderer`: three.js is not in the first-load JavaScript (the planner's `React.lazy` import of `ThreeView` is untouched) |

**Exact values:** loading and error text style:
`{ margin: 0, minHeight: '100vh', padding: '24px', fontFamily: 'system-ui, sans-serif', fontSize: '15px', lineHeight: 1.5, color: '#f4f4f4', background: '#1a1c2c' }`
(the page ground and text colours already set in `app/globals.css`; contrast about 15:1).

**Verify:**
`npx vitest run app/room-planner` → pass. `npm run check` → exit 0 with
`/room-planner` in the route list. Then with `npx next start -p 3000` running:
- `curl -s localhost:3000/room-planner | grep -c 'Loading the room planner…'` → `1`
- `curl -s localhost:3000/room-planner | grep -c '<title>Room Planner · Francisco Soltero</title>'` → `1`
- `curl -s localhost:3000/room-planner | grep -c 'class="app-body"'` → `0`
- `for u in $(curl -s localhost:3000/room-planner | grep -o '/_next/static/chunks/[^"]*\.js' | sort -u); do curl -s "localhost:3000$u" | grep -c WebGLRenderer; done` → every line is `0`, and at least one line is printed

Stop the server afterwards.
**Commit:** `feat(room-planner): serve the planner at /room-planner`

**Rollback:** `git revert` the commit; the route disappears, nothing else is affected.

## Task 8: Quest card and sitemap

**Spec:** Slice A, rows "Quest card" and "Site plumbing" (sitemap).

**Files:**
- Modify: `public/index.html`
- Modify: `app/sitemap.ts`
- Test: `room-planner/site/siteIntegration.test.ts`

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| New quest | the array that starts with the literal text `const quests = [` in `public/index.html` (6 entries) | the entry under Exact values is inserted as the second entry, directly after the `Multiplayer AI` entry |
| Sprite slot | the new entry has no `sprite` field | the existing template then shows the striped `[ sprite ]` placeholder, which is the spec's "placeholder sprite slot". No template change is needed for it |
| Counts | the return object of `renderVals()` | `questCount: 7, clearedCount: 7` |
| Play link | quest card template: the `<sc-if value="{{ q.href }}">…</sc-if>` block that holds the `GITHUB →` link inside the quest grid's `<sc-for list="{{ quests }}">` | that block is wrapped, together with a new block placed before it, in `<span style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">`. The new block is `<sc-if value="{{ q.play }}"><a href="{{ q.play }}" …>PLAY →</a></sc-if>`, where the `<a>` carries the same `style`, `style-hover` and `style-focus` attribute values as the `GITHUB →` link in that block and has no `target` and no `rel` (same tab, same site) |
| Other quests | the six existing entries | unchanged; none has `play`, so none shows a `PLAY →` link |
| No logic in holes | new template text | only `{{ q.play }}`; no expressions |
| Style Tile | `public/Style Tile.dc.html` | unchanged. Its quest card preview has no link row to mirror; confirm with `grep -c "GITHUB" "public/Style Tile.dc.html"` → `0` and quote it in the report. If the count is not 0, stop and report (NEEDS_CONTEXT) |
| Sitemap | `app/sitemap.ts` | the returned array gains `{ url: \`${siteUrl}/room-planner\` }` directly after the `/papers` entry; the header comment mentions the planner |
| Test | `room-planner/site/siteIntegration.test.ts` (`// @vitest-environment node`, reads the two files as text) | asserts: `public/index.html` contains `title: 'Room Planner'` and `play: '/room-planner'`; contains `questCount: 7, clearedCount: 7`; contains exactly one `PLAY →`, and the `<a` tag that holds it has no `target=`; `app/sitemap.ts` contains `/room-planner` |
| Rest of the page | `git diff --stat public/index.html` and the diff itself | only the quest entry, the two counts and the link block change |

**Exact values:**

```js
{ title: 'Room Planner', rarity: 'RARE', color: '#73eff7', status: 'LIVE', statusColor: '#a7f070', diff: 'DIFFICULTY ●●●○', blurb: "Lay out a room to scale, drop in furniture, and check the fit in 3D. Flags pieces that overlap or don't fit, in a plan view and a WebGL view.", tags: ['React', 'three.js', 'TypeScript'], reward: 'playable in your browser', href: 'https://github.com/FrankieSoltero/portfolio/tree/main/room-planner', play: '/room-planner' },
```

**Verify:** `npx vitest run room-planner/site` → pass.
`node -e "new Function(require('fs').readFileSync('public/index.html','utf8').match(/const quests = \[[\s\S]*?\n    \];/)[0])"` → exit 0 (the array still parses).
`git diff main --stat -- "public/Style Tile.dc.html" public/support.js public/vendor` → empty.
**Commit:** `feat(site): add the Room Planner quest card and sitemap entry`

**Rollback:** `git revert` the commit; `/` returns to its current content.

## Task 9: Docs copy

**Spec:** Slice A, row "Docs".

**Files:**
- Create: `docs/room-planner/specs/2026-11-12-room-planner-workspace-design.md`
- Create: `docs/room-planner/plans/2026-11-12-room-planner-workspace.md`
- Create: `docs/room-planner/plan-reviews/2026-11-12-room-planner-workspace-review.md`
- Create: `docs/room-planner/verification/` (the three files in the source repo's verification folder)
- Create: `docs/room-planner/mistakes-and-fixes.md`
- Create: `docs/room-planner/design_handoff/**`

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Docs copy | every git-tracked file under `Docs/` in the source repo | present under `docs/room-planner/` at the same relative path, byte-identical |
| Handoff copy | every git-tracked file under `design_handoff_room_planner/` in the source repo | present under `docs/room-planner/design_handoff/` at the same relative path, byte-identical |
| Do not overwrite | `docs/room-planner/specs/2026-11-13-*`, `docs/room-planner/plans/2026-11-13-*`, `docs/room-planner/plan-reviews/2026-11-13-*` | already in this repo; untouched (`git status --short` does not list them as modified) |
| Not served | `public/` | `git status --short public` prints nothing |

**Verify:**
`for f in $(git -C "../Room Planner Website" ls-files Docs); do cmp "../Room Planner Website/$f" "docs/room-planner/${f#Docs/}" || echo DIFF $f; done` → no output.
`diff -r "../Room Planner Website/design_handoff_room_planner" docs/room-planner/design_handoff` → no output.
`git status --short public` → no output.
**Commit:** `docs(room-planner): copy the planner docs and design handoff`

**Rollback:** `git revert` the commit.

## Task 10: Docs for the new section

**Spec:** Slice A, rows "Site plumbing" (README, CLAUDE.md) and "Docs".

**Files:**
- Create: `docs/room-planner/README.md`
- Modify: `docs/room-planner/mistakes-and-fixes.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Index | `docs/room-planner/README.md` | lists each subfolder in one line each. States: documents dated 2026-11-12 were written in the standalone repository, where the code lived in `src/`; that folder is `room-planner/` here. States that `design_handoff/` is a read-only design reference that is not built or served |
| Mistakes log | `docs/room-planner/mistakes-and-fixes.md` | gains the heading `## 2026-11-13 — Move into the portfolio` followed by every entry earlier task reports handed over, or the line `No mistakes recorded in Tasks 1 to 9.` Earlier content is unchanged |
| Root README | `README.md` | the intro lists three sections, adding `/room-planner` (a room layout tool: 2D plan and 3D check, React and three.js, client-side only). "Run locally" mentions `/room-planner`. "Structure" gains `room-planner/`, `app/room-planner/`, `docs/room-planner/`. A new `## Checks` section documents `npm run check`, `npm test` and `npm run lint` |
| CLAUDE.md | `CLAUDE.md` | the "Two sections" heading and text become three sections. A `/room-planner` entry states: source in `room-planner/`, route in `app/room-planner/`, its own design language (the Industry design system in `room-planner/styles/industry.css`, not the 8-bit skin), styles must stay scoped to `.room-planner` (enforced by `room-planner/styles/scoping.test.ts`), run `npm run check` before committing, docs in `docs/room-planner/` |

**Verify:**
`grep -c "room-planner" README.md` → 5 or more; `grep -c "^## Checks" README.md` → `1`;
`grep -c "npm run check" README.md CLAUDE.md` → 1 or more for each file;
`grep -c "scoping.test.ts" CLAUDE.md` → 1 or more;
`grep -c "^## 2026-11-13 — Move into the portfolio" docs/room-planner/mistakes-and-fixes.md` → `1`;
`grep -c "design_handoff" docs/room-planner/README.md` → 1 or more.
**Commit:** `docs(room-planner): document the planner section`

**Rollback:** `git revert` the commit.

## Task 11: Live verification

**Spec:** Slice A, "Verification for A".

Drive the built site in a real browser and record the result. The task's product is
the record. Fixing is conditional: only if a row fails, and then only as the Rules
below allow.

**Files:**
- Create: `docs/room-planner/verification/2026-11-13-portfolio-live-check.md`
- Modify: `docs/room-planner/mistakes-and-fixes.md` (one entry per defect found)
- Modify: `room-planner/**` (only for a defect a row exposes, with a failing test first)
- Modify: `app/room-planner/**` (only for a defect a row exposes, with a failing test first)

**Setup:** `npm run build && npx next start -p 3000`. Chromium through the Playwright
browser tools, viewport 1440×900, device pixel ratio 1. Stop the server when done.

**Behavior:**

| Row | Action | Expected |
|-----|--------|----------|
| P1 | `curl -s http://localhost:3000/ \| cmp - public/index.html` | no output, exit 0: the 8-bit page is served byte-identical to the file |
| P2 | Open `/`; find the quest grid | a `Room Planner` card is second in the grid with badge `RARE`, status `LIVE`, links `PLAY →` and `GITHUB →`; the header reads `7 quests · 7 cleared`; exactly one `PLAY →` link is on the page; console has 0 errors |
| P3 | Click `PLAY →` | the same tab navigates to `/room-planner`; an element `.room-planner .app` exists |
| P4 | On `/room-planner`, read `document.title` and the network log | title is `Room Planner · Francisco Soltero`; every request is same-origin; no request returns 4xx or 5xx; console has 0 errors and 0 warnings |
| P5 | On `/room-planner`, read computed styles | `getComputedStyle(document.querySelector('.app')).fontFamily` starts with `Barlow`; `document.fonts.check('15px Barlow')` is true; `getComputedStyle(document.querySelector('.room-planner')).getPropertyValue('--color-text').trim()` is `#1d1f20` |
| P6 | Open `/papers` in a fresh tab | none of `document.styleSheets` holds a rule whose selector text contains `.room-planner`, `.app-body` or `.btn`; `getComputedStyle(document.body).backgroundColor` is `rgb(26, 28, 44)` |
| P7 | Build `main` in a separate checkout (`git worktree add ../portfolio-main-check main`, `npm ci`, `npm run build`, `npx next start -p 3001`). On both servers open `/papers` and `/papers/grokking` and read `getComputedStyle` of `body`, `.papers`, `.papers-home` and the first `h1`: `fontFamily`, `fontSize`, `color`, `backgroundColor`, `boxSizing`, `margin` | every value is equal between the two servers. Afterwards stop that server and run `git worktree remove ../portfolio-main-check` |
| P8 | On `/room-planner`, run `window.next.router.push('/papers')` in the page (a client-side navigation, so stylesheets loaded for the planner stay loaded), wait for `.papers`, and read the same properties of the same four elements as P7 | every value equals the fresh-tab value from P7 on port 3000 |
| P9 | `curl -s http://localhost:3000/sitemap.xml` | contains `/room-planner` |
| P10 | On `/room-planner`, abort the request for the planner's dynamic chunk (Playwright `route` on the chunk URL seen in P4's network log) and reload | the page shows `The room planner failed to load.` and a `Try again` button; no stack trace or error message text is shown. Remove the abort and click `Try again`, or reload: the planner appears |
| L1–L14 | Repeat rows L1 to L14 of `docs/room-planner/verification/2026-11-12-live-check.md` against `http://localhost:3000/room-planner`, with each row's Action and Expected text taken verbatim from that file | each row's Expected holds |
| L15 | At 1440×900 measure on `/room-planner` the regions L15 of the 2026-11-12 file measured for the app: sidebar width, header height, inset rectangle, room rectangle on the plan | each within 2 px of the value recorded for the app in that file |

**Record format:** the file has one table with columns Row, Action, Expected, Result
(`Pass` or `Fail`), Observation (the measured value or quoted text, not "looks
right"). It states the commit under test, the browser and viewport. A row that failed
and was fixed is recorded as `Pass (after fix <hash>)` with the root cause, the test
added and the fix commit in a "Fixes made under this task" table.

**Rules:**
- A failing row is a defect: reproduce, find the root cause, write a failing test,
  fix, re-run the row. One commit per defect: `fix(room-planner): <what>`. At most
  three defects are fixed inside this task; a fourth means stop and report (BLOCKED).
- A failure in P1, P6, P7 or P8 means the move changed another section. Stop and
  report (BLOCKED) instead of editing files outside `room-planner/**` and
  `app/room-planner/**`.
- Do not mark a row Pass without the observation that shows it.

**Verify:** every row's Result in the record begins with `Pass`; `npm run check` →
exit 0 on the final commit; `git status --short` shows only
`Multiplayer_AI_Sprite.aseprite` untracked; `git worktree list` shows one worktree.
**Commit:** `docs(room-planner): record the portfolio live check`

**Rollback:** the record is documentation; fix commits revert individually.

---

## Done criteria

1. `npm run check` exits 0 on the branch head: typecheck, lint, all tests passing with
   none skipped (the 445 copied tests plus those Tasks 5 to 8 add), and `next build`
   listing `/room-planner`.
2. Every row's Result in the Task 11 record begins with `Pass`.
3. `npm audit --omit=dev` reports 0 critical, 0 high and 4 low (the audit one-liner
   prints `0 0 4`), and the 4 low findings are listed in `docs/fixes-log.md`.
4. `git diff main --stat -- app/papers components/papers content app/layout.tsx app/globals.css public/support.js public/vendor`
   is empty, and `git diff main -- lib` shows only Task 2's zod changes.
5. `git diff main -- public/index.html` shows only the quest entry, the counts and the
   `PLAY →` link block.

## Controller steps after Task 11 (not executor tasks)

1. Run lean-sdd's final whole-branch review and its single fix pass.
2. Push the branch and open the pull request:
   `git push -u origin room-planner`, then `gh pr create --base main --head room-planner`.
   The description states: what moved and where; the audit result (critical and high
   cleared, the 4 low findings and why they stay); the zod 3 to 4 upgrade; the
   follow-up "Content-Security-Policy for the whole site" (deferred by the spec); the
   post-merge steps below.
   Check: `gh pr view --json state,headRefName,baseRefName --jq '.state+" "+.headRefName+" "+.baseRefName'`
   → `OPEN room-planner main`; `gh pr view --json body --jq .body | grep -c -i "content-security-policy"` → 1 or more.
3. Merging is the owner's action.

## After the pull request is merged (controller, with the owner's go-ahead)

1. Confirm `https://frankiesoltero.com/room-planner` loads with a clean console and
   `https://frankiesoltero.com/` shows the new card.
2. **If that check fails:** revert the merge on `main` (`git revert -m 1 <merge-sha>`
   for a merge commit, `git revert <sha>` for a squash), push, and let Vercel
   redeploy. Do not archive anything.
3. Only after the live check passes, in `FrankieSoltero/room-planner`: confirm commit
   `a95387b` is on its `main` (`git ls-remote` shows it or a descendant), add a line
   at the top of its README pointing to
   `https://github.com/FrankieSoltero/portfolio/tree/main/room-planner`, push, then
   archive it with `gh repo archive`. Archiving makes the repository read-only; it is
   reversible with `gh repo unarchive`.

## Spec traceability

| Spec item (Slice A row) | Task |
|---|---|
| Location: source in `room-planner/`, tests move with it | 4 |
| Route: server page, client-only planner, lazy three.js chunk | 6, 7 |
| Style isolation: scoped to `.room-planner`; token reader reads the wrapper | 5; checked live in 11 (P6 to P8) |
| Fonts self-hosted through `@fontsource` | 3 (packages), 6 (imports), 11 (P4, P5) |
| Dependencies and audit target (as amended) | 1, 2, 3; Done criterion 3 |
| Checks: `npm test`, `npm run check`, lint for the planner | 3 |
| Quest card, placeholder sprite slot, `PLAY →` link, counts | 8 |
| Site plumbing: sitemap, README, CLAUDE.md | 8, 10 |
| Docs and design handoff move | 9, 10 |
| History: plain copy, commit message links the old repo | 4 |
| Load failure screen (owner-approved addition) | 7; checked live in 11 (P10) |
| Security headers: existing ones apply, CSP deferred | no task; recorded in the pull request (controller step 2) |
| Old repo archived after the live route is verified | "After the pull request is merged", step 3 |
| Delivery: branch `room-planner`, one pull request | controller step 2 |
| Verification: check passes, L1–L15 repeated, `/` and `/papers` unchanged | 11 |
