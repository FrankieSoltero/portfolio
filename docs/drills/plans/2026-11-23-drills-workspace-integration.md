# Drills: in-browser workspace on `/drills` — implementation plan

Date: 2026-11-23
Spec: `docs/drills/specs/2026-11-19-react-drills-design.md`, sections
"Drill page", "How code runs in the browser", "Progress and pacing", "Look and feel",
"Error handling", "Routes", "Testing". The owner approved the spec in conversation on
2026-11-19; the file's own status line still reads "awaiting approval" and this plan does
not edit it.
Earlier plan (done): `docs/drills/plans/2026-11-19-drills-content-and-pages.md`.

## Header

**Goal:** a visitor to `/drills/<slug>` edits the drill's code in the browser, sees a live
preview, runs the checks, and the drill is marked done by itself when every check passes.

**Architecture:** the portfolio installs the Drillbox package from a tarball kept in this
repository and renders its `Workspace` React component on the drill page, inside a client
component that keeps the visitor's code and progress in `localStorage`. The sandbox frame
page is written into `public/drillbox/frame.html` before every build and served from the
site's own origin with a sandboxing response header. The workspace is skinned with the
site's hybrid 8-bit values through Drillbox's `--dbx-*` custom properties.

**Tech stack:** Next.js 15 (App Router), React 19, TypeScript 5, zod 4, vitest 5 with
Testing Library, Playwright 1.65.1 (new, browser tests), Drillbox 0.0.0 at commit `40f9b05`
(local repository `~/Desktop/Code/drillbox`, branch `workspace-ui`).

**How tests are run:**

- `npm run check` — typecheck, lint, unit tests, drill fairness, `next build`, built-page
  check. Must exit 0 at the end of every task.
- `npm run test:e2e` — Playwright against a production build (added in Task 8). On this
  laptop run it as `caffeinate -dimsu npm run test:e2e` with the lid open; nothing may be
  listening on port 4310 before or after.

**Evidence gathered before planning (2026-11-23):** all ten drills in `content/drills`
were run through Drillbox's harness page in Chromium. Every starter failed at least one
check and every solution passed all of them:

| Drill | Starter | Solution |
|---|---|---|
| card-with-button | 2 of 5 | 5 of 5 |
| cart-total | 3 of 7 | 7 of 7 |
| click-counter | 2 of 5 | 5 of 5 |
| comment-threads | 1 of 5 | 5 of 5 |
| like-button | 1 of 4 | 4 of 4 |
| notes-by-id | 1 of 4 | 4 of 4 |
| posts-feed | 2 of 9 | 9 of 9 |
| profile-switcher | 2 of 5 | 5 of 5 |
| removable-list | 1 of 4 | 4 of 4 |
| search-filters | 1 of 5 | 5 of 5 |

## Scope

**In:** everything the spec's drill page and index page need once the runner exists: the
workspace, saved draft code, automatic completion, progress shown on the index and drill
pages, the navigation link, the quest card and the sitemap entries.

**Out (not in this plan):** merging `drills-content` into `main`, pushing, deploying
(the owner decides each; `soltero-skills:lean-finishing` after this plan); publishing
Drillbox to npm or to a public repository; any change to drill content
(`content/drills/**`); any change to the Drillbox repository; the Python adapter; switching
the `drillbox:test` alias in `vitest.drills.config.mts` to `drillbox/vitest` (the current
alias works and the browser sweep in Task 8 proves parity).

**Deviations from the spec, for the owner to confirm (each is a default, reversible in one
commit):**

1. **Checks do not run when the drill loads.** The spec says they do. The `Workspace`
   component has no way to start a run from outside, and in Firefox and Safari the frame
   shares the page's thread, so an automatic run of a starter that loops (search-filters)
   would stall the page as it opens. Checks run when the visitor presses `RUN CHECKS`; the
   live preview still starts by itself.
2. **Drillbox is installed from a tarball committed to this repository**
   (`vendor/drillbox-0.0.0-40f9b05.tgz`), not from "a pinned release": no release exists.
   This repository is public, so pushing the branch makes Drillbox's built code public
   (it is MIT-licensed and meant to be open source). Nothing is pushed by this plan.
3. **The retry button covers load failures only.** The spec asks for a retry button when
   the sandbox "fails to load or times out". A sandbox that froze cannot be recovered by
   the page (Drillbox `docs/browser-notes.md`); for that case the workspace shows its own
   alert, `The sandbox stopped responding. Close this tab and open the page again.`
4. **Check source is in the drill page's data.** The workspace needs the check files in
   the browser, so they are in the page's serialized props (inside `<script>` elements).
   They stay out of the visible markup and out of the editor's file tabs.
5. **Quest card copy and placement** on the home page (Task 10) are this plan's wording.

**Added by this plan, not in the spec:** browser tests with Playwright, including the
computed-style checks, screenshots and the visual-review file of Task 9 (the spec lists
unit tests only); the shared progress store of Task 4 (a defect fix the workspace makes
necessary); the streak and done-count badges in the drill page header and the auto-done
sentence under the hints (both are in the mockup the owner approved on 2026-11-22, kept at
`~/Desktop/Code/drillbox/.soltero/lean-sdd/2026-11-22-workspace-ui/mockup-drill-page.html`;
the spec does not mention a mockup); `TODAY` on the index entry of today's drill; the 5 kB
growth limit for other pages in Task 7; the documentation sections of Task 11.

## Global Constraints

Every task inherits these.

- Work in `~/Desktop/Code/portfolio-drills` (a git worktree) on branch `drills-content`.
  Never push, never merge, never create a tag, never switch branch.
- Stage explicit paths only (never `git add -A`, `git add .` or `git commit -a`). One
  commit per task, message as given in the task, ending with the two attribution lines the
  controller supplies.
- `npm run check` exits 0 before each commit. Write the test first and watch it fail
  (`soltero-skills:lean-tdd`).
- New dependencies: `drillbox` (Task 1) and `@playwright/test` 1.65.1 (Task 8) only.
- TypeScript strict; no `any`; no `@ts-ignore`; no new ESLint suppressions.
- Security:
  - The frame is only ever the one Drillbox creates: `<iframe sandbox="allow-scripts">`
    loaded from `/drillbox/frame.html`. No `allow-same-origin`, no `srcdoc`, no second
    iframe.
  - Everything read from `localStorage` is untrusted: validate it with zod, discard what
    does not match, never throw. Storage may be blocked or full: every access is wrapped.
  - No new `dangerouslySetInnerHTML`. No secrets, tokens or personal data in any file, in
    exercise data, or in a log. No request to a third party at run time.
  - No `console.log` of visitor code or progress.
- Storage keys (exact): progress `drills:progress:v1` (exists); draft code
  `drills:code:v1:<slug>`.
- Paths (exact): frame page file `public/drillbox/frame.html`, URL `/drillbox/frame.html`.
- Frame response header (exact):
  `Content-Security-Policy: sandbox allow-scripts; frame-ancestors 'self'`.
- Styles: every selector in a drills stylesheet starts with `.drills`; no `border-radius`,
  no `blur(`. Palette values come from `app/hybrid-skin.css` variables where one exists
  (`--night #1a1c2c`, `--panel #0e1530`, `--deep #29366f`, `--dim #333c57`,
  `--steel #566c86`, `--mist #94b0c2`, `--white #f4f4f4`, `--cyan #73eff7`,
  `--slime #a7f070`, `--gold #ffcd75`, `--ember #ef7d57`); `#b13e53` (fail red) and `#000`
  (frames) have no variable and are written as literals.
- Fonts come from the variables `app/drills/layout.tsx` sets: `--font-pixel` (Press Start
  2P), `--font-mono` (VT323), `--font-sans` (IBM Plex Sans), `--font-code` (IBM Plex Mono).
- Do not edit `content/drills/**`, anything under `room-planner/`, `app/papers/`,
  `app/room-planner/`, or the Drillbox repository. Task 1 runs build commands in the
  Drillbox repository; they write only its gitignored `dist/`.
- Rollback: each task is one commit; undo with `git revert <sha>`, newest first. A revert
  of Task 1 also reverts `package-lock.json` (run `npm ci` after). `public/drillbox/`,
  `.next/`, `test-results/` and `playwright-report/` are gitignored and rebuilt. After
  reverting Task 2, delete `public/drillbox/` by hand (nothing rebuilds or serves it any
  more). Reverting Task 10 removes the nav item, the quest card and the sitemap entries
  together. Nothing in this plan reaches the deployed site, so no rollback touches
  production.
- A mistake found and fixed during a task is described in that task's report (what went
  wrong, the fix, the lesson). Task 11 writes the rows in
  `docs/drills/mistakes-and-fixes.md` from those reports and from the `fix` commits; no
  earlier task edits that file.

## Task Dependency Table

| Task | Files | Depends on | Risk tier |
|------|-------|------------|-----------|
| 1. Vendor Drillbox | `vendor/drillbox-0.0.0-40f9b05.tgz`, `vendor/README.md`, `package.json`, `package-lock.json` | — | standard |
| 2. Frame page and its header | `scripts/build-drill-frame.mts`, `drills/frame.ts`, `drills/frame.test.ts`, `next.config.ts`, `package.json`, `.gitignore` | 1 | standard |
| 3. Draft code store | `drills/draft.ts`, `drills/draft.test.ts` | — | standard |
| 4. Shared progress store | `drills/useProgress.ts`, `drills/useProgress.test.tsx` | — | standard |
| 5. Exercise mapping checked against Drillbox | `lib/drills.ts`, `lib/drills.test.ts` | 1 | mechanical |
| 6. Progress display | `drills/components/ProgressBadges.tsx`, `drills/components/ProgressBadges.test.tsx`, `drills/components/DrillEntryStatus.tsx`, `drills/components/DrillEntryStatus.test.tsx`, `drills/components/DrillList.tsx`, `drills/components/DrillList.test.tsx`, `app/drills/drills.css` | 4 | standard |
| 7. Workspace on the drill page | `drills/components/WorkspaceHost.tsx`, `drills/components/WorkspaceHost.test.tsx`, `drills/components/DrillWorkspace.tsx`, `drills/components/DrillWorkspace.test.tsx`, `app/drills/[slug]/page.tsx`, `app/drills/[slug]/page.test.ts`, `scripts/drills-pages-check.mts`, `app/drills/drills.css` | 2, 3, 4, 5, 6 | judgment |
| 8. Browser tests: behaviour | `package.json`, `package-lock.json`, `playwright.config.ts`, `e2e/drills.spec.ts`, `e2e/helpers.ts`, `.gitignore` | 7 | judgment |
| 9. Workspace skin | `app/drills/workspace-theme.css`, `app/drills/layout.tsx`, `drills/styles/scoping.test.ts`, `e2e/drills-theme.spec.ts`, `docs/drills/workspace-visual-review.md` | 8 | judgment |
| 10. Navigation, quest card, sitemap | `public/index.html`, `app/sitemap.ts`, `scripts/drills-pages-check.mts` | 7 | standard |
| 11. Docs | `docs/drills/README.md`, `docs/drills/mistakes-and-fixes.md` | 9, 10 | standard |

Shared writes outside the Files column: every task runs `npm run check`, which writes
`.next/` and `public/drillbox/` (after Task 2). Tasks 1, 2 and 8 write `package.json` (1 and
8 also `package-lock.json` and `node_modules/`). Tasks 6 and 7 both write
`app/drills/drills.css`; Tasks 7 and 10 both write `scripts/drills-pages-check.mts`.
Because of `.next/`, no two implementers may run at the same time.

## Task 1: Vendor Drillbox

**Files**
- Create: `vendor/drillbox-0.0.0-40f9b05.tgz`, `vendor/README.md`
- Modify: `package.json`, `package-lock.json`

**Interfaces**
- Consumes: the Drillbox repository at `~/Desktop/Code/drillbox`, commit `40f9b05`
  (`git -C ~/Desktop/Code/drillbox rev-parse --short HEAD` must print `40f9b05` and
  `git -C ~/Desktop/Code/drillbox status --short` must print nothing; otherwise stop,
  BLOCKED).
- Produces: the imports `drillbox`, `drillbox/schema`, `drillbox/frame`,
  `drillbox/workspace`, `drillbox/workspace.css` resolve in this repository.

**Behavior**

| Case | Input / state | Expected |
|------|---------------|----------|
| Build the tarball | in the Drillbox repository: `npm ci && npm run build && npm run pack:check && npm pack` | `pack-check: ok (69 files)`; a file `drillbox-0.0.0.tgz`; move it (not copy) to `vendor/drillbox-0.0.0-40f9b05.tgz` here; the Drillbox tree is clean afterwards |
| No local paths inside | `tar -xzOf vendor/drillbox-0.0.0-40f9b05.tgz \| grep -c "/Users/"` | `0`. If not 0: stop, BLOCKED, report the matching file names |
| Dependency | `package.json` `dependencies` | gains `"drillbox": "file:vendor/drillbox-0.0.0-40f9b05.tgz"`; nothing else changes except what `npm install` writes to the lockfile |
| Peer versions | `npm ls react react-dom zod` | one version of each, no `invalid` or `UNMET` line |
| Audit | `npm audit --omit=dev` | its summary line is copied into the commit message; a high or critical finding in a package that Drillbox brought in stops the task (BLOCKED) |
| `vendor/README.md` | — | states: what the file is; the source commit `40f9b05` and branch `workspace-ui`; the tarball's SHA-256 (`shasum -a 256`); the licence (MIT; third-party notices are inside the package at `dist/frame-chunks/THIRD-PARTY-LICENSES.txt`); the five commands to rebuild and replace it; that the lockfile's integrity hash pins the content |

**Verify:** `npm ci && npm run check` → exit 0; `node -e "import('drillbox/frame').then(m => console.log(typeof m.buildFrame, typeof m.jsAdapter))"` → `function function`.
**Commit:** `chore(drills): vendor drillbox 0.0.0 (40f9b05)`

## Task 2: Frame page and its header

**Files**
- Create: `scripts/build-drill-frame.mts`, `drills/frame.ts`, `drills/frame.test.ts`
- Modify: `next.config.ts`, `package.json`, `.gitignore`

**Interfaces**
- Consumes: `buildFrame`, `jsAdapter` from `drillbox/frame` (Task 1).
- Produces: `drills/frame.ts` exports
  `FRAME_URL: "/drillbox/frame.html"` and
  `FRAME_CSP_HEADER: "sandbox allow-scripts; frame-ancestors 'self'"`.

**Behavior**

| Case | Input / state | Expected |
|------|---------------|----------|
| Script | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/build-drill-frame.mts` | creates `public/drillbox/` if missing; writes `public/drillbox/frame.html` = `buildFrame({ adapters: [jsAdapter({ react: true })] })`; prints `drill frame: public/drillbox/frame.html (<n> bytes)`; exit 0 |
| Script failure | `buildFrame` throws or the write fails | prints `drill frame: FAILED — <message>`; exit 1 |
| npm scripts | `package.json` | adds `"frame": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/build-drill-frame.mts"`, `"prebuild": "npm run frame"`, `"predev": "npm run frame"` |
| Ignore | `.gitignore` | adds `public/drillbox/` under a comment `# Drillbox sandbox frame, written by npm run frame` |
| Header | `next.config.ts` `headers()` | gains a second entry, after the existing one: `source: "/drillbox/frame.html"`, one header `Content-Security-Policy` with the exact value above. The existing entry is unchanged |
| Header test | `drills/frame.test.ts` imports `next.config.ts` and calls `headers()` | the entry for `/drillbox/frame.html` has exactly that one header and value, equal to `FRAME_CSP_HEADER`; the `/:path*` entry still has its four headers |
| Built file | after `npm run frame`, asserted in `drills/frame.test.ts` (the test skips with a clear message when the file is absent; `npm run check` runs the unit tests before the build, so Verify below runs it again after) | `public/drillbox/frame.html` contains a `<meta http-equiv="Content-Security-Policy"` element whose `content` begins with the policy prefix under "Exact values", and contains no `http://` or `https://` URL in a `src=` or `href=` attribute |

**Exact values:** the frame page's own policy begins
`default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'`.

**Verify:** `npm run check` → exit 0; then `npx vitest run drills/frame.test.ts` → all pass, none skipped; `test -f public/drillbox/frame.html && git status --short public` → prints nothing.
**Commit:** `feat(drills): build the sandbox frame page and serve it sandboxed`

## Task 3: Draft code store

**Files**
- Create: `drills/draft.ts`, `drills/draft.test.ts`

**Interfaces**
- Produces:

```ts
export const DRAFT_KEY_PREFIX = "drills:code:v1:";
export const MAX_DRAFT_FILE_CHARS = 200_000;
export type DraftFiles = Record<string, string>;
/** Stored text → files, keeping only `editablePaths`; null when absent, invalid or empty. */
export function parseDraft(raw: string | null, editablePaths: readonly string[]): DraftFiles | null;
export function loadDraft(slug: string, editablePaths: readonly string[]): DraftFiles | null;
/** Saves the files, or removes the key when every file equals `starter`. */
export function saveDraft(slug: string, files: DraftFiles, starter: DraftFiles): void;
export function clearDraft(slug: string): void;
```

**Behavior**

| Case | Input / state | Expected |
|------|---------------|----------|
| Stored shape | `saveDraft("like-button", { "App.tsx": "x" }, { "App.tsx": "y" })` | `localStorage["drills:code:v1:like-button"]` is `{"version":1,"files":{"App.tsx":"x"}}` |
| Same as starter | every file equals the starter's | the key is removed (this is how `RESET CODE` clears the draft) |
| Round trip | `loadDraft` after `saveDraft` | the same files |
| Absent | no key | `null` |
| Not JSON, wrong `version`, `files` not an object, a non-string value, an unknown top-level key | — | `null` (the whole draft is discarded) |
| Extra path | a key that is not in `editablePaths` (including `__proto__`, `constructor`) | that key is dropped; the rest is kept; the result has no inherited keys the caller could mistake for files (build it with `Object.create(null)` or check with `Object.hasOwn`) |
| Nothing left | no key of `editablePaths` present | `null` |
| Too long | a file longer than `MAX_DRAFT_FILE_CHARS` | on load: `null`; on save: nothing is written and the existing key is left as it is |
| Bad slug | a slug that does not match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` | `loadDraft` returns `null`; `saveDraft` and `clearDraft` do nothing |
| Storage throws | `getItem`, `setItem` or `removeItem` throws | no exception leaves the module; `loadDraft` returns `null` |

**Verify:** `npx vitest run drills/draft.test.ts` → all pass; `npm run check` → exit 0.
**Commit:** `feat(drills): save draft code per drill in the browser`

## Task 4: Shared progress store

**Traces to:** spec "Drill page" (done with help) and "Progress and pacing".

**Why:** `useProgress` keeps its own copy of progress per component. With the workspace on
the page, one component records "solution revealed" and another records "completed"; the
second would overwrite the first from a stale copy and "done with help" would be lost.

**Files**
- Modify: `drills/useProgress.ts`, `drills/useProgress.test.tsx`

**Interfaces**
- Produces: `useProgress()` keeps its signature
  `{ progress, ready, complete(slug), reveal(slug) }`. No new export.

**Behavior**

| Case | Input / state | Expected |
|------|---------------|----------|
| Existing behaviour | every existing test in `drills/useProgress.test.tsx` | still passes unchanged (first render `EMPTY_PROGRESS`, `ready: false`; storage errors swallowed) |
| Two components | two components in one tree each call `useProgress()`; one calls `reveal("a")`, then the other calls `complete("a")` | both show `drillStatus === "done-with-help"`; storage holds `revealed: true` and today's date |
| Live update | one component calls `complete("a")` | the other component re-renders with the new progress without remounting |
| Other tab | a `storage` event for `drills:progress:v1` | every mounted hook shows the newly stored progress (parsed with `parseProgress`); events for other keys are ignored |
| Stale write | storage was changed by another tab after mount, with no event delivered; this tab calls `complete("b")` | the write is based on what storage holds now (re-read before applying the change), so the other tab's record is kept |
| Unmount | the last component unmounts | the `storage` listener is removed |

**Verify:** `npx vitest run drills/useProgress.test.tsx drills/progress.test.ts` → all pass; `npm run check` → exit 0.
**Commit:** `fix(drills): one shared progress store for every component on the page`

## Task 5: Exercise mapping checked against Drillbox

**Files**
- Modify: `lib/drills.ts`, `lib/drills.test.ts`

**Interfaces**
- Consumes: `parseExercise`, `type Exercise` from `drillbox/schema` (Task 1).
- Produces: `toExercise(drill): Exercise` where `Exercise` is now the type imported from
  `drillbox/schema` and re-exported (`export type { Exercise }`); the local `Exercise`
  interface is deleted. The returned value is unchanged.

**Behavior**

| Case | Input / state | Expected |
|------|---------------|----------|
| Every drill | `getAllDrills()` mapped through `toExercise` | `parseExercise(x)` returns `{ ok: true }` for each of the ten; on failure the test prints the slug and the issues |
| Read-only flag | profile-switcher | `files["api.ts"].readOnly === true`; `files["App.tsx"]` has no `readOnly` key |
| Checks | every drill | `checks` has at least one key and none equals a key of `files` |

**Verify:** `npx vitest run lib/drills.test.ts` → all pass; `npm run check` → exit 0.
**Commit:** `refactor(drills): exercise type and validation from drillbox`

## Task 6: Progress display

**Files**
- Create: `drills/components/ProgressBadges.tsx`
- Create: `drills/components/ProgressBadges.test.tsx`
- Create: `drills/components/DrillEntryStatus.tsx`
- Create: `drills/components/DrillEntryStatus.test.tsx`
- Modify: `drills/components/DrillList.tsx`
- Modify: `drills/components/DrillList.test.tsx`
- Modify: `app/drills/drills.css`

**Interfaces**
- Consumes: `useProgress` (Task 4); `streak`, `completedCount`, `todaysDrill`, `drillStatus`,
  `localDate` from `drills/progress.ts`.
- Produces (both client components, `"use client"`):
  - `ProgressBadges({ slugs }: { slugs: string[] })` — `slugs` in drill order.
  - `DrillEntryStatus({ slug, slugs }: { slug: string; slugs: string[] })`.
  - `DrillList` stays a server component and renders one `ProgressBadges` in its header
    and one `DrillEntryStatus` per entry.

**Behavior**

| Case | Input / state | Expected |
|------|---------------|----------|
| Before storage is read | `ready === false` | both components render an empty element with their class (`drills-badges`, `drills-entry-status`) and no text, so server and first client render match |
| Badges | ready, 3 of 10 done, streak 4 | `<p class="drills-badges">` with two `<span class="drills-badge">`: `STREAK: 4 DAYS` (class `drills-badge-streak`) and `3 / 10 DONE` (class `drills-badge-done`) |
| Streak wording | streak 0 / 1 / 2 | `STREAK: 0 DAYS` / `STREAK: 1 DAY` / `STREAK: 2 DAYS` |
| Entry: not done, is today's drill | — | `TODAY` (class `drills-status-today`) |
| Entry: not done, not today's | — | nothing |
| Entry: done | — | `DONE` (class `drills-status-done`) |
| Entry: done after revealing the fix | — | `DONE WITH HELP` (class `drills-status-helped`) |
| Index states | nothing done / some done / all done | nothing done: first drill shows `TODAY`, badges `STREAK: 0 DAYS` and `0 / 10 DONE`; some: as above; all done: no entry shows `TODAY`, badges show `10 / 10 DONE` |
| Unknown records | progress holds a slug that is not a drill | ignored in the count |
| Styles | `.drills .drills-badges` | flex, wrap, gap 16px, `var(--font-mono)` 22px, margin 0; `.drills .drills-badge`: background `var(--panel)`, `box-shadow: 0 -3px #000, 0 3px #000, -3px 0 #000, 3px 0 #000`, padding `6px 14px`; streak colour `var(--slime)`, done colour `var(--gold)`; entry status: `var(--font-pixel)` 10px, `DONE` `var(--slime)`, `DONE WITH HELP` `var(--gold)`, `TODAY` `var(--cyan)`. The existing scoping and token tests still pass |

**Verify:** the Styles row is asserted in `drills/components/ProgressBadges.test.tsx` by reading `app/drills/drills.css` as text and matching each declaration listed (the way `drills/styles/tokens.test.ts` reads the stylesheet). `npx vitest run drills/components drills/styles` → all pass; `npm run check` → exit 0 (the built index page still passes `test:drills-pages`).
**Commit:** `feat(drills): streak, done count and per-drill status from saved progress`

## Task 7: Workspace on the drill page

**Files**
- Create: `drills/components/WorkspaceHost.tsx`
- Create: `drills/components/WorkspaceHost.test.tsx`
- Create: `drills/components/DrillWorkspace.tsx`
- Create: `drills/components/DrillWorkspace.test.tsx`
- Modify: `app/drills/[slug]/page.tsx`
- Modify: `app/drills/[slug]/page.test.ts`
- Modify: `scripts/drills-pages-check.mts`
- Modify: `app/drills/drills.css`

**Interfaces**
- Consumes: `Workspace` from `drillbox/workspace` and the stylesheet
  `drillbox/workspace.css`; `type Exercise` and `toExercise` (Task 5); `FRAME_URL`
  (Task 2); `loadDraft`, `saveDraft` (Task 3); `useProgress` (Task 4); `ProgressBadges`
  (Task 6). `Workspace` props used: `exercise`, `frameUrl`, `initialFiles`, `onChange`,
  `onResult`. `onResult` receives a summary with `status`, `passed`, `failed`, `total`.
  `initialFiles` is read only when the workspace mounts.
- Produces (client components):
  - `WorkspaceHost({ exercise }: { exercise: Exercise })` — default export as well, for
    `next/dynamic`. Imports `drillbox/workspace.css`.
  - `DrillWorkspace({ exercise, fallback }: { exercise: Exercise; fallback: React.ReactNode })`.

**Behavior — `WorkspaceHost`**

| Case | Input / state | Expected |
|------|---------------|----------|
| First render | before the draft is read | renders nothing (`null`); the draft is read in an effect with `loadDraft(exercise.id, editablePaths)` where `editablePaths` are the exercise's files that are neither `readOnly` nor `hidden` |
| With a draft | a valid draft exists | `<Workspace>` mounts with `initialFiles` = the draft, `frameUrl` = `FRAME_URL` |
| Without a draft | none | `<Workspace>` mounts with `initialFiles` undefined |
| Edit | `onChange(files)` | `saveDraft(exercise.id, files, starter)` where `starter` is the exercise's code for the same paths (so a reset removes the key) |
| All checks pass | `onResult` with `status: "completed"`, `total > 0`, `failed === 0`, `passed === total` | `complete(exercise.id)` once |
| Anything else | some failing, `total === 0`, or any other status (`compile-error`, `timeout`, `unavailable`, `stopped`, `invalid-exercise`, `unsupported-language`) | `complete` is not called |
| Already done | the drill was completed earlier | calling `complete` again changes nothing (`markCompleted` keeps the first date); no error |
| Another drill | `exercise.id` changes | the new drill's draft is read before its workspace mounts; one drill's code never appears in another (key the workspace by `exercise.id`) |

**Behavior — `DrillWorkspace`**

| Case | Input / state | Expected |
|------|---------------|----------|
| Loading | `WorkspaceHost` is loaded with `next/dynamic(() => import("./WorkspaceHost"), { ssr: false, loading })` | while it loads, and in the server-rendered HTML, `fallback` is shown |
| Loaded | — | the workspace replaces the fallback |
| Load or render failure | the import rejects, or the workspace throws while rendering | an error boundary shows `fallback`, the message `The workspace could not start. The starter code is below; your saved code is kept.` (`role="alert"`, class `drills-workspace-error`) and a `RETRY` button (class `drills-button`); `RETRY` remounts the workspace |
| Wrapper | always | a `<section class="drills-section drills-workspace">`; no heading of its own (the workspace renders its own `WORKSPACE` heading, the fallback its own `STARTER CODE` heading) |

**Behavior — page, built-page check, styles**

| Case | Input / state | Expected |
|------|---------------|----------|
| Page | `app/drills/[slug]/page.tsx` | the `STARTER CODE` section is replaced by `<DrillWorkspace exercise={toExercise(drill)} fallback={…}>` where the fallback is the existing section (`<h2>STARTER CODE</h2>` and `CodeFiles`); the stand-in comment is removed |
| Header | drill page header | inside `header.drills-drill-header`: a `<div class="drills-drill-heading">` around the existing title and meta line, then `ProgressBadges` with every drill's slug in order. Style in `app/drills/drills.css`: `.drills .drills-drill-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px 24px; }` (its existing margin rules stay), so the badges sit to the right and wrap below the title when there is no room |
| Auto-done note | after the hints, in the hints section | `<p class="drills-auto-done">The drill is marked done on its own when every check passes.</p>` (`var(--font-mono)` 20px, `var(--mist)`) |
| Built page: visible markup | `scripts/drills-pages-check.mts` | check file names and check names must be absent from the HTML **after removing every `<script …>…</script>` element** (they are allowed inside script elements); every other existing assertion is unchanged; add: the page contains `The drill is marked done on its own when every check passes.` |
| Built page: output line | `npm run test:drills-pages` | still `drills pages: 11 OK` |
| Other pages' bundles | `next build` route table | `/drills` and `/papers` first-load sizes do not grow by more than 5 kB from before this task (record both tables in the report); only `/drills/[slug]` carries the workspace |
| Hydration | browser console on a drill page | no hydration warning (verified in Task 8; here: unit tests render server markup equal to first client markup for `DrillWorkspace`) |

**Verify:** before the first edit, run `npm run build` and copy the route-table lines for `/drills` and `/papers` into the task report; after the last edit do the same. Pass: the First Load JS of each grew by at most 5 kB. `npx vitest run drills app/drills` → all pass; `npm run check` → exit 0 with `drills pages: 11 OK`. The Hydration row is closed by Task 8's "Clean console" case, not here.
**Commit:** `feat(drills): the in-browser workspace on every drill page`

## Task 8: Browser tests: behaviour

**Files**
- Create: `playwright.config.ts`, `e2e/drills.spec.ts`, `e2e/helpers.ts`
- Modify: `package.json`, `package-lock.json`, `.gitignore`

**Interfaces**
- Consumes: the built site. Reference for driving the workspace (read, do not import):
  `~/Desktop/Code/drillbox/e2e/workspace-helpers.ts` and `e2e/workspace.spec.ts`.
- Produces: `npm run test:e2e` (`playwright test`); `e2e/helpers.ts` exports helpers Task 9
  reuses: `openDrill(page, slug)`, `runChecks(page): Promise<string>` (the checks summary
  text once the run ends), `seedDraft(page, slug, files)`, `readProgress(page)`,
  `solutionFiles(slug)` (starter overlaid with `content/drills/<slug>/solution`).

**Exact values**
- `@playwright/test` `1.65.1`, exact, in `devDependencies`.
- Config: `testDir: "e2e"`; `baseURL: "http://127.0.0.1:4310"`; `webServer.command`:
  `npm run build && npx next start -H 127.0.0.1 -p 4310`, `reuseExistingServer: false`,
  `timeout: 240_000`; projects `chromium`, `firefox`, `webkit`; test timeout 90 s.
- `.gitignore` adds `test-results/` and `playwright-report/`.
- `package.json` `lint` script gains `e2e playwright.config.ts`.
- `eslint.config.mjs` is not changed: its one block already lints every `**/*.{ts,tsx}` file.

**Behavior** (all three browsers unless marked)

| Case | Input / state | Expected |
|------|---------------|----------|
| Workspace appears | `/drills/like-button` | a region named `WORKSPACE`; a tab `App.tsx`; the preview frame shows `Liked: 0`; no `STARTER CODE` heading remains |
| Frame is sandboxed | same page | every iframe in the workspace has `sandbox="allow-scripts"` exactly and a `src` ending `/drillbox/frame.html`; a request to `/drillbox/frame.html` answers 200 with `content-security-policy: sandbox allow-scripts; frame-ancestors 'self'` |
| Storage is out of reach | seed a draft whose `App.tsx` renders `String((() => { try { return localStorage.length } catch { return "blocked" } })())` | the preview shows `blocked` |
| Starter | press `RUN CHECKS` | the checks summary reads `1 OF 4 PASSING`; `drills:progress:v1` has no `completedOn` for `like-button` |
| Solve | seed the solution as the draft, reload, `RUN CHECKS` | `ALL CHECKS PASSING`; progress has `completedOn` = today's local date and `revealed: false`; the header badge reads `1 / 10 DONE` and `STREAK: 1 DAY` without a reload |
| Solve with help | press `REVEAL THE FIX`, then solve as above | `/drills` shows `DONE WITH HELP` on that entry |
| Index | after solving like-button without help | `/drills` shows `DONE` on Like button, `TODAY` on Click counter, `1 / 10 DONE` |
| Draft survives a reload | click at the end of the editor's first line, press Enter, type `// draft note`; poll (up to 5 s) until `localStorage["drills:code:v1:like-button"]` contains `// draft note`; reload | the editor's text contains `// draft note` |
| Reset clears the draft | after an edit: `RESET CODE`, then `CLICK AGAIN TO RESET` | the editor shows the starter; the key `drills:code:v1:like-button` is gone |
| Corrupt storage | set `drills:code:v1:like-button` to `{not json` and `drills:progress:v1` to `[]` before load | the page loads the starter, the workspace works, badges read `0 / 10 DONE` |
| Every starter (chromium) | each of the ten drills, `RUN CHECKS` | summary `<p> OF <t> PASSING` with the counts in the table at the top of this plan |
| Every solution (chromium) | each of the ten, solution seeded as the draft | `ALL CHECKS PASSING`; progress holds all ten after the loop; `/drills` reads `10 / 10 DONE` and no `TODAY` |
| Clean console | load `/drills` and `/drills/like-button`, run checks once | no console message of type `error` and no page error; no text matching `/hydrat/i` |
| Narrow | 390 × 844, `/drills/like-button` | `document.documentElement.scrollWidth <= 390` |
| Keyboard | Tab from the page top | focus reaches `RUN CHECKS`; Enter runs the checks (chromium and firefox; WebKit skips Tab-to-button, see Drillbox `docs/browser-notes.md`) |

**Verify:** `caffeinate -dimsu npm run test:e2e` → 0 failed, with the pass and skip counts per browser in the report; `lsof -nP -iTCP:4310 -sTCP:LISTEN` → nothing; `npm run check` → exit 0.
**Commit:** `test(drills): browser tests for the workspace, drafts and progress`

If a drill's counts differ from the table, or a solution does not pass in the browser:
stop and report BLOCKED with the output. Do not change drill content or the tests' expected
counts.

## Task 9: Workspace skin

**Traces to:** spec "How code runs in the browser" (themed through Drillbox's custom
properties) and "Look and feel"; the mockup named under "Added by this plan".

**Files**
- Create: `app/drills/workspace-theme.css`
- Create: `e2e/drills-theme.spec.ts`
- Create: `docs/drills/workspace-visual-review.md`
- Modify: `app/drills/layout.tsx`
- Modify: `drills/styles/scoping.test.ts`

**Interfaces**
- Consumes: the workspace's class names and custom properties (Drillbox README, "Theming");
  the worked example `~/Desktop/Code/drillbox/demo/theme-8bit.css` (its "Workspace
  variables" and "Workspace overrides" blocks; not its `.demo-*` page-shell rules);
  `e2e/helpers.ts` (Task 8).
- Produces: the stylesheet, imported in `app/drills/layout.tsx` after `./drills.css`.

**Exact values — variables**, set on `.drills .dbx-workspace`:

| Property | Value |
|---|---|
| `--dbx-bg` | `var(--night)` |
| `--dbx-panel`, `--dbx-editor-gutter-bg` | `var(--panel)` |
| `--dbx-panel-raised`, `--dbx-editor-selection` | `var(--deep)` |
| `--dbx-text`, `--dbx-fail-text`, `--dbx-secondary-text`, `--dbx-preview-bg` | `var(--white)` |
| `--dbx-text-dim`, `--dbx-editor-gutter-text`, `--dbx-syn-comment`, `--dbx-syn-punctuation` | `var(--mist)` |
| `--dbx-rule` | `#000` |
| `--dbx-rule-width` | `4px` |
| `--dbx-list-rule`, `--dbx-secondary-bg` | `var(--dim)` |
| `--dbx-accent`, `--dbx-syn-type`, `--dbx-syn-function` | `var(--cyan)` |
| `--dbx-pass`, `--dbx-primary-bg`, `--dbx-syn-string` | `var(--slime)` |
| `--dbx-fail` | `#b13e53` |
| `--dbx-warn`, `--dbx-focus`, `--dbx-editor-caret`, `--dbx-syn-number`, `--dbx-syn-attribute` | `var(--gold)` |
| `--dbx-primary-text` | `var(--night)` |
| `--dbx-syn-keyword`, `--dbx-syn-tag` | `var(--ember)` |
| `--dbx-editor-bracket` | `var(--steel)` |
| `--dbx-editor-active-line` | `rgba(41, 54, 111, 0.45)` |
| `--dbx-frame` | `0 -4px #000, 0 4px #000, -4px 0 #000, 4px 0 #000` |
| `--dbx-radius` | `0` |
| `--dbx-font-title` | `var(--font-pixel), monospace` |
| `--dbx-font-label` | `var(--font-mono), monospace` |
| `--dbx-font-body` | `var(--font-sans), system-ui, sans-serif` |
| `--dbx-font-code` | `var(--font-code), monospace` |
| `--dbx-title-size` / `--dbx-label-size` / `--dbx-body-size` | `13px` / `20px` / `16px` |
| `--dbx-button-size` / `--dbx-badge-size` / `--dbx-code-size` / `--dbx-detail-size` | `11px` / `10px` / `14px` / `13px` |
| `--dbx-weight-strong`, `--dbx-weight-medium` | `400` |
| `--dbx-transition` | `0s` |

**Behavior**

| Case | Input / state | Expected |
|------|---------------|----------|
| Overrides | every rule between the comment lines that open the "Workspace overrides" block and the end of `~/Desktop/Code/drillbox/demo/theme-8bit.css` (the block is the file's last 140 lines; every selector in it starts `.theme-8bit .dbx-`) | carried over rule for rule with `.theme-8bit` replaced by `.drills` and quoted font names replaced by the variables above; no rule whose selector contains `.demo-` |
| Site rules do not leak in | `app/drills/drills.css` styles bare elements under `.drills` (`h2`, `h3`, `p`, `ol`, `li`, `a`, `pre`, `:focus-visible`, `::selection`) | inside `.dbx-workspace` those elements look as they do on the Drillbox demo page. The implementer derives the reset rules from the computed-style rows below: start from `.drills .dbx-workspace :where(h2, h3, p, ol, ul, li, a, pre)` rules that undo each property a `.drills <element>` rule sets (margin, padding, font family, size, line height, colour, list style, text decoration), plus the workspace's focus outline, and add rules until every computed-style row passes in all three browsers. Each reset rule carries a comment naming the `drills.css` rule it undoes |
| Scoping test | `drills/styles/scoping.test.ts` | also reads `workspace-theme.css`: every selector starts with `.drills`, no `border-radius` (the property `--dbx-radius: 0` is allowed), no `blur(` |
| Computed styles (three browsers), `/drills/like-button` at 1280 × 900 after `RUN CHECKS` | — | workspace title: Press Start 2P, 13px, `rgb(115, 239, 247)`; `RUN CHECKS`: background `rgb(167, 240, 112)`, colour `rgb(26, 28, 44)`, 11px, height ≥ 44px, `border-radius: 0px`; `RESET CODE`: background `rgb(51, 60, 87)`; panel bars (`LIVE PREVIEW`, `CHECKS`): VT323, 20px, `rgb(148, 176, 194)`, margin 0, height 52px; selected tab: background `rgb(41, 54, 111)`, VT323 20px; editor text: IBM Plex Mono, 14px; `PASS` badge: `rgb(167, 240, 112)`, Press Start 2P 10px; `FAIL` badge: background `rgb(177, 62, 83)`; check name: IBM Plex Sans 16px; check list: `list-style-type: none`, no left padding from the site's `ol` rule; checks summary: `rgb(255, 205, 117)`; status line: not visible (1px clip) |
| Fonts loaded | `document.fonts.check` for each of the four families at the sizes above | `true` |
| Focus ring | keyboard focus on `RUN CHECKS` | a 2px outline in `rgb(255, 205, 117)` |
| Narrow | 390 × 844 | `document.documentElement.scrollWidth <= 390`; the top edges (`getBoundingClientRect().top`) of the editor panel, the preview panel and the checks panel strictly increase in that order, and each panel's left edge is the same |
| Screenshots (chromium) | 1280 × 900 full page after `RUN CHECKS`; 390 × 844 full page before a run | written to `test-results/drill-1280.png` and `test-results/drill-390.png` |
| Visual review | `docs/drills/workspace-visual-review.md` | one row per region, in this order: page header; title, meta line and badges; the pull request; workspace toolbar; file tabs; editor; live preview; checks; hints, fix and the auto-done note; neighbour links and footer; narrow layout (eleven rows). Columns: region, what the screenshot shows, differences from the approved mockup (the mockup's values are in the Drillbox repository's `docs/workspace-visual-review.md` and its plan `docs/plans/2026-11-22-workspace-ui.md`, Task 7) |

Task 9 is done when its Verify commands pass. The review file's "differences" column is
information for the owner, not a pass condition. After the task the controller looks at
both screenshots and the review file before telling the owner the page is ready to look
at; the verdict on the look is the owner's and does not gate the plan.

**Verify:** `caffeinate -dimsu npm run test:e2e` → 0 failed; `grep -c "^|" docs/drills/workspace-visual-review.md` → 13 (header, separator, eleven rows, in the order listed above); `npm run check` → exit 0.
**Commit:** `feat(drills): hybrid 8-bit skin for the workspace`

## Task 10: Navigation, quest card, sitemap

**Files**
- Modify: `public/index.html`, `app/sitemap.ts`, `scripts/drills-pages-check.mts`

**Interfaces**
- Consumes: `getAllDrills` from `lib/drills.ts`; `siteUrl` from `lib/site.ts`.

**Behavior**

| Case | Input / state | Expected |
|------|---------------|----------|
| Navigation | `navItems` in `public/index.html` | a new last item `{ label: 'DRILLS', href: '/drills' }`, after `PLANNER`; nothing else in the array changes |
| Quest card | `quests` in `public/index.html` | a new item directly after `Room Planner`, exactly the object under "Exact values" |
| Sitemap | `app/sitemap.ts` | adds `${siteUrl}/drills` after `/room-planner`, then one entry per drill `${siteUrl}/drills/<slug>` in drill order, with no `lastModified`; existing entries unchanged; the file's second line becomes `// Sitemap: the 8-bit homepage, the papers section, the room planner and the drills.` |
| Built sitemap | `scripts/drills-pages-check.mts` | also reads `.next/server/app/sitemap.xml.body` and fails with `drills pages: FAILED /sitemap.xml — <what>` when `/drills` or any drill URL is missing or listed twice; the success line is unchanged (`drills pages: 11 OK`) |
| Home page arrays intact | count the `{ label:` items inside `navItems` and the `{ title:` items inside `quests`, before and after the edit | `navItems`: 6 before, 7 after; `quests`: one more after than before (report both numbers); `git diff --numstat public/index.html` prints `3	1	public/index.html` (new nav line, the `PLANNER` line rewritten with a trailing comma, new quest line) |
| Home page in a browser | the controller opens `/` in the built site after this task | the `DRILLS` link is in the navigation and leads to `/drills`; the quest card is shown; no console error |

**Exact values — quest card**

```js
{ title: 'React Review Drills', rarity: 'RARE', color: '#a7f070', status: 'LIVE', statusColor: '#a7f070', diff: 'DIFFICULTY ●●○○', blurb: "Ten pull requests that run but are not ready to merge. Read the brief, fix the component in an editor in your browser, and watch the checks turn green. One a day, with a streak kept on your device.", tags: ['React', 'TypeScript'], reward: 'ten drills, playable in your browser', href: 'https://github.com/FrankieSoltero/portfolio/tree/main/content/drills', play: '/drills' },
```

**Verify:** `npm run check` → exit 0 with `drills pages: 11 OK`; `grep -c "/drills" .next/server/app/sitemap.xml.body` → 11; `grep -c "label: 'DRILLS', href: '/drills'" public/index.html` → 1; `grep -c "title: 'React Review Drills'" public/index.html` → 1. The "Home page in a browser" row is the controller's check after the task and does not gate the commit.
**Commit:** `feat(drills): link the drills from the home page and the sitemap`

## Task 11: Docs

**Traces to:** the owner's standing rule that every project documents its mistakes and
fixes; spec "How code runs in the browser" (what the sandbox protects).

**Files**
- Modify: `docs/drills/README.md`, `docs/drills/mistakes-and-fixes.md`

**Behavior**

| Case | Input / state | Expected |
|------|---------------|----------|
| `docs/drills/README.md` | — | new sections: "How the workspace is wired" (the components and what each owns: `DrillWorkspace`, `WorkspaceHost`, draft store, progress store, frame page, header); "Storage" (both keys, the stored shapes, that nothing leaves the browser); "Security" (sandbox attribute, the header, what the frame cannot reach, what is deliberately visible: check source in page data); "Updating Drillbox" (the commands from `vendor/README.md`); "Browser tests" (the command, the lid-open note, port 4310); "Differences from the spec" (the five deviations at the top of this plan, with whether the owner has confirmed each) |
| No stale text | the README's earlier statements that the page shows read-only starter code "until the runner exists" | rewritten to describe the fallback |
| `docs/drills/mistakes-and-fixes.md` | — | one row per `fix` commit made while executing this plan (`git log --oneline 0f9f6f7..HEAD --grep '^fix'`), each with the mistake, the fix and the lesson; plus a row for the shared-store bug Task 4 prevents |

**Verify:** `grep -c "^## " docs/drills/README.md` → at least 6 more than before the task (report both numbers); rows added = `grep -c '^|' docs/drills/mistakes-and-fixes.md` after minus before (report both); that number is at least `git log --oneline 0f9f6f7..HEAD --grep '^fix' | wc -l` plus one; `npm run check` → exit 0.
**Commit:** `docs(drills): workspace wiring, storage, security and how to update drillbox`

## Plan done when

- Tasks 1 to 11 are each one commit on `drills-content`, and each task's Verify line passed.
- On the final commit: `npm run check` exits 0 with `drills pages: 11 OK`, and
  `caffeinate -dimsu npm run test:e2e` reports 0 failed in Chromium, Firefox and WebKit.
- Nothing listens on port 4310; `git status --short` prints nothing.
- `docs/drills/workspace-visual-review.md` exists with its eleven rows, and
  `test-results/drill-1280.png` and `test-results/drill-390.png` exist.
- Not part of "done": the owner's opinion of the look, their answers on the five
  deviations, merging, pushing and deploying. Before any push the owner (or
  `soltero-skills:lean-finishing`) re-runs the two tarball checks of Task 1 (`/Users/`
  count 0, SHA-256 equal to `vendor/README.md`) and a secret scan of the branch, because
  publishing to a public repository cannot be undone.
- No feature flag is used: the new routes and the home-page links go live together at
  deploy and come out together by reverting the merge.

## Spec coverage

| Spec requirement | Task |
|---|---|
| Workspace: editor, live preview, checks panel; `Run checks`; `Reset code` | 7 (component from Drillbox), 8 |
| Checks run when the drill loads | deviation 1 |
| Drill marked done automatically when every check passes | 7, 8 |
| Revealing the solution first shows as "done with help" | 4, 6, 8 |
| Pinned Drillbox, `drillbox/workspace` | 1, 7 (deviation 2) |
| Loaded with `next/dynamic`, `ssr: false`, only on `/drills/[slug]` | 7 |
| Frame built at build time with the JS/TS adapter and React pack, served from the site's origin, nothing from a third party | 2, 8 |
| Themed to Sweetie-16 through Drillbox's custom properties; code in IBM Plex Mono | 9 |
| Sandboxed without `allow-same-origin`; no access to `localStorage`; no network | 2, 8 (Drillbox's own tests cover the network probes) |
| Drill folder maps onto the exercise format | 5 |
| Progress in `drills:progress:v1`, validated, never sent anywhere | exists; 4 |
| Today's drill; streak | exists; shown by 6 |
| Draft code under `drills:code:v1:<slug>`; `Reset code` clears it | 3, 7, 8 |
| Corrupt or unavailable storage | 3, 4, 8 |
| Hybrid 8-bit skin, scoped to `.drills` | 6, 9 |
| Sandbox fails to load: starter read-only, message, retry | 7 (deviation 3) |
| Code that does not compile or throws; page never crashes; error boundary | 7 (workspace shows problems), 8 |
| `/drills` and `/drills/[slug]` in the sitemap; `DRILLS` in the home navigation; quest card | 10 |
| Component tests for the index states | 6 |
| Narrow screens: stacks and still works | 8, 9 |
