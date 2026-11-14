# Mistakes and fixes

A running log of mistakes made on this project and how they were fixed, so the same
mistake is not repeated. Newest entries go at the bottom.

Entry format:

```
## <short title>
- **Date:** YYYY-MM-DD
- **What happened:**
- **Root cause:**
- **Fix:**
- **How to avoid:**
```

---

## create-vite 9 scaffolds Oxlint, not ESLint, by default
- **Date:** 2026-11-12
- **What happened:** `npm create vite@latest rp-scaffold -- --template react-ts`
  (create-vite 9.3.4) produced no `eslint.config.js` and no `src/vite-env.d.ts`. It wrote
  `.oxlintrc.json`, a `lint` script of `oxlint`, and `typescript@~7.0.2`. The plan expects
  ESLint with typescript-eslint, react-hooks and react-refresh. typescript-eslint 8 does
  not support TypeScript 7, so adding ESLint on top of that output would have mixed
  incompatible versions.
- **Root cause:** create-vite 9 made Oxlint the default linter for React templates. ESLint
  is now opt-in through the `--eslint` flag. That variant pins `typescript@~6.0.3` and
  `typescript-eslint@^8.72.1`, which work together. Since Vite 8, the template also gets
  Vite client types from `"types": ["vite/client"]` in `tsconfig.app.json`, so it no
  longer ships `src/vite-env.d.ts`.
- **Fix:** Re-scaffolded with
  `npm create vite@latest rp-scaffold -- --template react-ts --eslint --no-interactive`
  and copied that output, so every tooling version is still the template's tested set.
  Nothing was hand-pinned. Created `src/vite-env.d.ts` by hand with
  `/// <reference types="vite/client" />`, because the plan lists it. It repeats the
  tsconfig `types` entry and does no harm.
- **How to avoid:** Run `npm create vite@latest -- --help` before scaffolding and check
  the linter flag. Do not assume a template still ships a file just because older versions
  did.

## Triple-slash `vitest/config` reference fails lint
- **Date:** 2026-11-12
- **What happened:** `vite.config.ts` began with `/// <reference types="vitest/config" />`
  so it could type the `test` block. `eslint .` failed with
  `@typescript-eslint/triple-slash-reference`.
- **Root cause:** typescript-eslint's recommended config bans triple-slash type
  references when an `import` can do the same job.
- **Fix:** Import `defineConfig` (and `configDefaults`) from `vitest/config` instead of
  `vite`. That gives the same typing without the reference.
- **How to avoid:** In config files, get Vitest types from the `vitest/config` import,
  not from a triple-slash reference.

## three 0.187 removed PCFSoftShadowMap
- **Date:** 2026-11-12
- **What happened:** The plan told Task 16 to set `renderer.shadowMap.type = PCFSoftShadowMap`,
  copied from the prototype (three r128). In three 0.187 that constant has been deprecated since
  r186. `WebGLShadowMap.js` warns "PCFSoftShadowMap has been removed. Using PCFShadowMap instead."
  and falls back to `PCFShadowMap`, so the app would have printed a console warning on every load.
- **Root cause:** The plan's three.js API was written from memory of an older release, not checked
  against the installed package.
- **Fix:** Caught in the Task 16 review. The renderer uses `PCFShadowMap` (commit 3cb0b1d) and the
  plan was amended to match (commit 6bbaecd).
- **How to avoid:** Before putting any three.js constant or API in a plan, check the installed
  package's type definitions and source (`node_modules/three/src/...`).

## Light intensities are not comparable across three.js versions
- **Date:** 2026-11-12
- **What happened:** The handoff gives a hemisphere light of 0.78 and a sun of 0.62 (three r128).
  The app started from those values × π: hemisphere 2.45, sun 1.95. In the live comparison
  (Task 20) the floor matched the prototype, but the walls were about 15 levels darker (back wall
  220 vs 236 mean luma) and shadows were stronger (shadow/lit 0.828 vs 0.876).
- **Root cause:** Two changes between r128 and 0.187. (1) Lights became physically based: r128
  multiplied light intensity by π inside the shader, 0.187 does not, so ×π is only the starting
  point. (2) r128 had no colour management. It fed material hex colours (walls, furniture) to the
  shader as if they were already linear and then sRGB-encoded the result, which brightens them.
  0.187 converts those colours from sRGB to linear first. The floor texture is tagged sRGB in both
  versions, so it already matched. The walls did not, and a plain ×π could not fix both.
- **Fix:** Tuned the two values against the prototype capture by measuring screen regions:
  hemisphere **3.0**, sun **1.7** (RMS error over walls, floor and shadow 12.3 → 3.3; shadow/lit
  0.875 vs 0.876). Recorded in `src/config.ts` and `Docs/verification/2026-11-12-live-check.md`;
  the owner approved these values on 2026-11-12 (quoted in
  `Docs/verification/2026-11-12-live-check.md`). Furniture renders darker and more saturated than
  in the prototype because three 0.187 converts sRGB material colours where r128 did not; the
  owner chose to keep colour-managed materials ("Approve the app as is").
- **How to avoid:** When porting a three.js scene across versions, compare captures side by side
  in the browser and measure them. Do not convert intensities with a formula alone. Check
  `ColorManagement` and the colour space of every texture and material colour as well.

## Room handles snap to 3 in
- **Date:** 2026-11-12
- **What happened:** A Task 14 `PlanView` test dragged the bottom room handle and first expected
  a room length of 148 in, worked out by hand from the pointer distance. The app gave 147, so the
  test failed.
- **Root cause:** Room edge handles snap with `snapRoomDim` to `CONFIG.roomHandleSnap` (3 in), and
  148 snaps to 147. The test was wrong, not the code.
- **Fix:** `src/components/Stage/PlanView.test.tsx` now asserts that
  `snapRoomDim(168 - 56.19 / SCALE)` equals 147 and that the store's `room.l` equals 147.
- **How to avoid:** Work out expected values with the same snap function the code uses
  (`snapRoomDim`, `CONFIG.furnitureSnap`), not by hand.

## First load logged a favicon 404
- **Date:** 2026-11-12
- **What happened:** In the Task 20 live check, row L1 ("console has 0 errors") failed. The first
  load of the app in a browser profile logged `Failed to load resource: 404 (Not Found) @
  http://localhost:5173/favicon.ico`. Later loads were clean only because Chrome caches the miss
  per origin, which hid the problem.
- **Root cause:** The scaffold dropped the Vite template's `public/` favicon and removed its
  `<link rel="icon">` from `index.html` without declaring that there is no icon. With no icon
  declared, browsers request `/favicon.ico`.
- **Fix:** `index.html` declares an empty icon, `<link rel="icon" href="data:," />` (no file, no
  network request). `src/indexHtml.test.ts` asserts the icon link is present and that the shell
  references no external `http(s)://` resource. Commit 89c7f93. Re-checked on a dev server at a
  port never used before, in a fresh browser context: the old file logged the 404, the new file
  logged 0 errors and 0 warnings.
- **How to avoid:** When removing template assets, keep the page's declarations consistent. If
  there is no icon, say so. To check a console-clean row, use a fresh origin as well as a fresh
  context, because favicon misses are cached per origin.

## WebGLRenderer.dispose() does not release the GL context
- **Date:** 2026-11-12
- **What happened:** Every Realistic ↔ Blueprint toggle, and every 2D plan ↔ 3D switch in the Tabs
  layout, unmounted `ThreeView` and created a new WebGL context on a new canvas. The old contexts,
  and their GPU memory including the 2048×2048 shadow map, stayed alive until garbage collection.
  Enough toggles reach the browser's live-context cap (about 16 in Chrome), which logs "Too many
  active WebGL contexts. Oldest context will be lost." Found in the final whole-branch review, not
  by the tests or the live check.
- **Root cause:** In three 0.187, `WebGLRenderer.dispose()` frees the renderer's own resources and
  listeners but does not release the GL context (`node_modules/three/src/renderers/WebGLRenderer.js`).
  Only `forceContextLoss()` does, through the `WEBGL_lose_context` extension. The tests use a fake
  renderer, so nothing in the suite could see a context outlive its view.
- **Fix:** `SceneRenderer.dispose()` now calls `renderer.forceContextLoss()` after
  `renderer.dispose()`, runs at most once, and `update()` does nothing after it. `ThreeView` adds its
  `webglcontextlost` listener in the renderer-creation effect and removes it before disposing, so
  its own forced loss is not reported as "WebGL unavailable". Final-fix group 1, commit 155554c.
- **How to avoid:** When a component owns a WebGL renderer, call `forceContextLoss()` on teardown
  and remove any context-lost listeners first. In the live check, exercise repeated mount and
  unmount of every WebGL view and confirm the console stays clean.

## 2026-11-13 — Move into the portfolio

### Plan assumed `npm audit fix` would clear `postcss`
- **Date:** 2026-11-13
- **What happened:** Task 1 was planned to end at 0 critical, 1 high. After `npm audit fix` there were 2 high: `zod` and `postcss`.
- **Root cause:** The planner read `fixAvailable: true` in `npm audit --json` for `postcss` as "fixable without a breaking change". `next@15.5.29`, the newest 15.x, pins `postcss` to exactly `8.4.31`; the advisory covers `<=8.5.22`; npm's only real fix was Next.js 16.
- **Fix:** The implementer stopped and reported instead of forcing it. The owner chose an `overrides` entry pinning `postcss` under `next` to `8.5.33` (plan Amendment 1). Build and papers HTML were verified identical.
- **How to avoid:** Before writing an audit target into a plan, run `npm audit fix --dry-run` and read what it would actually change. Remove the override when Next.js is upgraded to 16.

### Plan's audit target contradicted the spec
- **Date:** 2026-11-13
- **What happened:** The first plan-review round blocked the plan: the spec said the audit "must stay at 0 findings", but the portfolio already had 11 findings before this work.
- **Root cause:** The spec was written before running `npm audit` on the portfolio.
- **Fix:** The owner amended the target (non-breaking fixes plus the zod 3 to 4 upgrade; the 4 low KaTeX findings stay).
- **How to avoid:** Measure the baseline of any "must stay at N" requirement before writing it.

### Vitest config named `vitest.config.ts` printed a warning on every run
- **Date:** 2026-11-13
- **What happened:** "ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)".
- **Root cause:** The portfolio's `package.json` has no `"type": "module"`, so Vite loads a `.ts` config as CommonJS. The standalone planner had `"type": "module"`.
- **Fix:** Renamed to `vitest.config.mts` (plan Amendment 2). The file is outside `tsconfig.json`'s include, so `npm run typecheck` does not cover it.
- **How to avoid:** When moving tooling between packages, compare `"type"` in `package.json` first.

### npm saved installed versions instead of the planned ranges
- **Date:** 2026-11-13
- **What happened:** After `npm install <pkg>@^x.y.z`, six dev dependency ranges in `package.json` read as the installed version (for example `^6.3.0`), not the plan's range.
- **Root cause:** npm rewrites the saved range to the resolved version.
- **Fix:** Ranges reset by hand to the plan's values, then `npm install` to resync the lockfile.
- **How to avoid:** After installing, diff `package.json` against the intended ranges.

### A broad `pkill -f next-server` was used to stop a test server
- **Date:** 2026-11-13
- **What happened:** In Task 2 the implementer stopped its server with a targeted kill and also a broad `pkill`.
- **Root cause:** Habit; no other server happened to be running.
- **Fix:** Standing instructions now say to stop a server only by its PID or port (`lsof -ti :<port> | xargs kill`).
- **How to avoid:** Several agents can share one working tree; never kill by process name.

### Scripted CSS replace matched a substring
- **Date:** 2026-11-13
- **What happened:** In Task 5 a scripted replace of `body { margin: 0;` also matched inside `.card-body { margin: 0;`.
- **Root cause:** The pattern was not anchored to the start of a line.
- **Fix:** A per-replacement "exactly one match" assertion stopped the script before it wrote anything; patterns were then anchored on a newline. The resulting diff was reviewed line by line.
- **How to avoid:** Assert the match count of every scripted replacement.

### GNU-only `sed` syntax silently did nothing on macOS
- **Date:** 2026-11-13
- **What happened:** In Task 7 a mutation check used `sed '0,/re/s//…/'`; BSD sed did not apply it, so the mutated run showed all tests passing.
- **Root cause:** GNU-only address syntax.
- **Fix:** Re-ran with a plain substitution and confirmed with `grep` that the mutation was applied; the test then failed as expected.
- **How to avoid:** After a scripted mutation, confirm the file changed before trusting a green run.

### Try again called `reset()`, which cannot retry a failed chunk load
- **Date:** 2026-11-13
- **What happened:** The plan had the load-failure screen's `Try again` button call Next's `reset()`. Caught by the task review, not by tests.
- **Root cause:** Under the App Router, `next/dynamic` wraps the loader in one `React.lazy` created at module scope, and React caches a rejected import for good, so `reset()` re-renders into the same error.
- **Fix:** The button reloads the page (`window.location.reload()`), plan Amendment 3. Verified live in Task 11 row P10: with the planner chunk aborted the error screen showed; after removing the abort, `Try again` started a new document (navigation type `reload`) and the planner loaded.
- **How to avoid:** For any retry UI, check where the failed promise is cached before choosing how to retry; verify the retry live with a blocked request.

### A canonical link was planned without checking where the site URL comes from
- **Date:** 2026-11-13
- **What happened:** The plan added `alternates.canonical` to the new page.
- **Root cause:** `lib/site.ts` falls back to the per-deployment `VERCEL_URL` when `NEXT_PUBLIC_SITE_URL` is unset, so a static page could ship a canonical pointing at a deployment address; it would have been the site's first canonical link.
- **Fix:** Removed (plan Amendment 3); the fallback is listed as a follow-up.
- **How to avoid:** Before emitting absolute URLs, trace the base URL's source in every environment.

### Plan asserted a clean console on `/` without measuring `main` first
- **Date:** 2026-11-13
- **What happened:** Task 11 row P2 expected "console has 0 errors" on `/`. The first load logged one error, `Failed to load resource: … 404 (Not Found) @ http://localhost:3000/favicon.ico`, so the row failed and the task stopped as BLOCKED. `/` on `main` (7ed434e) logs the same single error: the 404 predates this work, and the move added nothing.
- **Root cause:** The plan wrote a "zero errors" expectation for a page the change does not own without loading that page on `main` to see its baseline. (The 404 itself comes from `public/index.html` declaring no icon while the site ships no favicon.)
- **Fix:** Plan Amendment 4: P2's console clause now reads "the console shows no error or warning that the same page on `main` (port 3001) does not also show". P2 passes under it. The missing favicon is a follow-up outside this plan's files.
- **How to avoid:** Before writing a "zero errors" (or any "must stay at N") expectation, measure the baseline on `main` in a fresh browser context, and write the expectation relative to it.
- **See also:** this is the same symptom as the 2026-11-12 entry "First load logged a favicon 404", recurring on a different page (the homepage); that entry's lesson was not applied to the homepage.

### A log line went stale after a later task changed the fact it stated
- **Date:** 2026-11-13
- **What happened:** Task 1 wrote "Left as-is: `zod` 3.x" in `docs/fixes-log.md`. Task 2 then upgraded zod and added its own subsection without revisiting Task 1's line, so the audit record contradicted itself. The Task 2 review caught it and the final review confirmed it.
- **Root cause:** Task 2 changed a fact that an earlier log entry stated, and only added new text instead of checking the older entry.
- **Fix:** The Task 1 line now says it was left as-is at that step and points to the zod upgrade subsection.
- **How to avoid:** When a task changes a fact an earlier log entry states, update that entry in the same commit.
