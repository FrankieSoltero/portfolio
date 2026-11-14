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
