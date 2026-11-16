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

## 2026-11-13 — Room shape and saving

The first 13 entries are plan defects, each caught by an implementer stopping or by a reviewer
and fixed by a plan amendment. The entries after them are implementers' mistakes, with the
task named in the title.

### Plan review took four runs
- **Date:** 2026-11-13
- **What happened:** The plan failed its review three times on errors in hand-written worked examples and in the order-dependent live-check rows (for example: two boxes "overlapping" at a distance where they do not; a row acting on a bed that an earlier row's fixture had removed). It failed a fourth time on an oversized task.
- **Root cause:** Examples were written without being recomputed, and rows were edited without re-reading the rows around them.
- **Fix:** Every numeric example was re-derived by hand. The oversized data-switch task was split in four.
- **How to avoid:** Compute every example before writing it into a plan, and re-read neighbouring rows after editing one.

### Missed call sites of a changed function (plan Amendment 1)
- **Date:** 2026-11-13
- **What happened:** Task 2 changed the signature of `computeCameraPose`. The plan did not list the four test files that call it.
- **Root cause:** The callers were not searched for when the task was written.
- **Fix:** Plan Amendment 1 added the four test files to the task.
- **How to avoid:** Grep for every caller of a function before writing a task that changes its signature.

### Field name clash in `SceneInput` and `BlueprintInput` (plan Amendment 2)
- **Date:** 2026-11-13
- **What happened:** The plan named the room's height `height` in `SceneInput` and `BlueprintInput`, which already used `height` for the pane size.
- **Root cause:** The interface being extended was not read before the new field was named.
- **Fix:** Plan Amendment 2 renamed the new field.
- **How to avoid:** Read the interface being extended before naming new fields.

### A colour rule changed existing behaviour (plan Amendment 3)
- **Date:** 2026-11-13
- **What happened:** The plan coloured blueprint sides by edge index. That reversed the shades of quarter-turned furniture.
- **Root cause:** The generalised rule was not checked against the existing quarter-turn cases.
- **Fix:** Sides are coloured by the plan axis they face.
- **How to avoid:** Check a generalised rule against the existing quarter-turn cases before adopting it.

### A test that pins the whole config object (plan Amendment 4)
- **Date:** 2026-11-13
- **What happened:** Adding constants to `config.ts` failed `catalog.test.ts`, which the plan had not listed.
- **Root cause:** No search was made for tests that snapshot the whole object.
- **Fix:** Plan Amendment 4 added the test to the task.
- **How to avoid:** Search for tests that snapshot a whole object before planning to extend it.

### Non-finite input was not specified (plan Amendment 4)
- **Date:** 2026-11-13
- **What happened:** The outline operations accepted NaN targets until an implementer pointed it out.
- **Root cause:** The plan did not say what each operation does with non-finite numbers.
- **Fix:** Plan Amendment 4 specified the behaviour for non-finite input.
- **How to avoid:** Say what every operation does with non-finite numbers.

### Old-shape references left outside the data-switch task (plan Amendments 5 and 6)
- **Date:** 2026-11-13
- **What happened:** Overrides and assertions on `rot` and `setRoomDim`, and a `Rotate 90°` click handler, were outside the data-switch task's file list.
- **Root cause:** Production and test code were not searched for every removed name.
- **Fix:** Plan Amendments 5 and 6 added them to the task.
- **How to avoid:** Before a data-shape change, grep both production and test code for every removed name.

### The snapping rule was wrong twice (plan Amendments 6 and 7)
- **Date:** 2026-11-13
- **What happened:** First the plan snapped a piece's centre, so a piece with an odd dimension could not sit flush against a wall. The replacement, which snapped the bounding box's corner on every move, made arrow-key nudges move 1.5 in after a rotation.
- **Root cause:** Each replacement rule was checked against one interaction, not against all of them.
- **Fix:** Final rule: drags snap the bounding box's corner, nudges move by the exact step, and rotation keeps the centre.
- **How to avoid:** When replacing a behaviour, list every existing interaction (drag, nudge, rotate) and work an example for each before fixing the rule.

### The painter's sort assumed an antisymmetric comparison
- **Date:** 2026-11-13
- **What happened:** The plan's `frontOf` axis order let two prisms each be "in front" of the other. The sort treated that as a cycle and drew a turned piece over a shelf that should hide it. A reviewer reproduced it.
- **Root cause:** The comparison was assumed to be antisymmetric and was not checked.
- **Fix:** The sort ignores mutually in-front pairs.
- **How to avoid:** When generalising a comparison, check that it stays antisymmetric, or make the consumer tolerate ties.

### No keyboard way to add a corner (plan Amendment 8)
- **Date:** 2026-11-13
- **What happened:** The plan made adding a corner pointer-only, which broke its own accessibility rule.
- **Root cause:** The new action was not checked against the keyboard rule while it was planned.
- **Fix:** An `Add a corner` button per wall.
- **How to avoid:** Check each new action against the keyboard rule while planning it.

### Double load under StrictMode
- **Date:** 2026-11-13
- **What happened:** The persistence design let React's double effect run call `load()` twice. The first call removed an unreadable plan and the second reported `empty`, so the notice never showed in development.
- **Root cause:** An effect that calls a function with side effects was not designed for a double run.
- **Fix:** The implementer loads once.
- **How to avoid:** Design any effect that calls a function with side effects for a double run.

### Two live-check rows were written wrongly (plan Amendment 10)
- **Date:** 2026-11-13
- **What happened:** Row B15 expected a migrated plan to be written back on load, which the design says does not happen. Row B18 expected no third-party request in a session that also visits the home page, which loads Google Fonts.
- **Root cause:** The expectations were not derived from the design text, and the network check was not scoped to the route under test.
- **Fix:** Plan Amendment 10 corrected both rows.
- **How to avoid:** Derive each row's expectation from the design text, and scope a network check to the route under test.

### The fix pass was planned after the live verification (plan Amendment 9)
- **Date:** 2026-11-13
- **What happened:** The plan put the fix pass after the live verification, so the check would have run on code that then changed.
- **Root cause:** The order of the last tasks was not checked against what each one changes.
- **Fix:** Plan Amendment 9: known findings are fixed first.
- **How to avoid:** Put the live check after the last planned code change.

### An invalid mutation check hid a coverage gap (Task 3)
- **Date:** 2026-11-13
- **What happened:** The first mutation for "clearances use the outline" replaced `outline` with `roomOutline({ w: 144, l: 168, h: 96 })`. That still went through the mocked `roomOutline`, so the mutation survived and proved nothing. Re-running it exposed that the view's clearance call had no test with a non-seed outline.
- **Root cause:** The mutation used the same seam the test replaces. The seed room and the bounding box give identical gaps, which hid the gap in coverage.
- **Fix:** The mutation was re-run with a literal rectangle array and the new test failed as it should. A test was added: `runs the clearance lines to the walls of the outline, not of the bounding box` (16 in to the cut-out wall, not 40).
- **How to avoid:** Write a mutation that does not go through the seam the test replaces, and check that it fails before trusting it.

### A temporary probe test was briefly in the repo (Task 3)
- **Date:** 2026-11-13
- **What happened:** To check how jsdom handles `clipPath` and `transform`, a probe test (`room-planner/zz-probe.test.ts`) was copied into the repo. It was deleted immediately (`ls room-planner/zz*` printed no matches) and was never staged.
- **Root cause:** Vitest only collects tests inside the repo.
- **Fix:** The file was deleted.
- **How to avoid:** Use an inline check inside an existing test run instead of a probe file.

### A tolerance test tested a gap, not an overlap (Task 5)
- **Date:** 2026-11-13
- **What happened:** The first "touching within 0.01" test used a box starting at 10.005, which is strictly separated from the box ending at 10. It passed even with the tolerance removed.
- **Root cause:** The test covered a gap, not an overlap inside the tolerance.
- **Fix:** The second box now starts at 9.995 (0.005 overlap). The tolerance mutation makes the test fail.
- **How to avoid:** Run a mutation that removes the tolerance and check that the test fails.

### Mutation runs that tested nothing (Task 13)
- **Date:** 2026-11-13
- **What happened:** The first mutation run on the keyboard hook used `$f.test.tsx` with `$f` set to the `.ts` file. That path does not exist, so vitest ran no tests and printed nothing. The empty output was noticed.
- **Root cause:** The test path was built from the source path's variable.
- **Fix:** An explicit test-file variable was used and both mutations were re-run. They failed as expected.
- **How to avoid:** Name the test file explicitly, and treat an empty test run as a failure of the check.

### A mutation that did not compile (Task 13)
- **Date:** 2026-11-13
- **What happened:** The first Alt-ordering mutation on `RoomEditLayer` produced a syntax error (TS1109), so every test file failed to load and the result proved nothing.
- **Root cause:** A careless string splice.
- **Fix:** A mutation that only moves the listener registration after `startDrag` and drops capture was used. It compiled and failed exactly one test, the Alt row. Both files were restored from backups and `diff -q` confirmed it. Production code was never committed with a mutation in it.
- **How to avoid:** Check that a mutated file compiles, and that the failure is the intended one, before trusting the result.

### A flaky test filtered random UUIDs by the prefix `c` (Task 14)
- **Date:** 2026-11-13
- **What happened:** The test "adds and selects a corner at the midpoint …" failed intermittently, about 1 run in 6. It was found while running mutation checks, when a mutation run reported an extra, unrelated failure; the unmutated suite was then run 6 times.
- **Root cause:** To keep only the old corners, the test filtered corner ids with `startsWith('c')`. A random UUID from `crypto.randomUUID()` sometimes starts with `c`, so it was kept too.
- **Fix:** The test now asserts the ids at indexes 0, 1, 3 and 4 directly, and checks that the new id is not one of c1 to c4. After the fix, 8 consecutive runs plus 3 more Verify runs all passed.
- **How to avoid:** Never pattern-match on random ids in tests; assert by position or identity.

### An off-by-one in an oversized-load fixture (Task 17)
- **Date:** 2026-11-13
- **What happened:** `'{' + ' '.repeat(max - 1) + '}x'` is max+2 characters, so the fixture's own length assertion failed on the first run.
- **Root cause:** The two-character suffix was miscounted.
- **Fix:** The fixture is now a valid serialised document padded with spaces to exactly max+1, which also proves that the size gate, not a parse failure, discards it.
- **How to avoid:** Build a boundary fixture from a valid document and assert its length.

### A wrong unit literal in a test fixture (Task 17)
- **Date:** 2026-11-13
- **What happened:** `units: 'in'` in the overwrite test failed `tsc` during `npm run check`. Vitest does not typecheck, so the test run was green.
- **Root cause:** Inches were assumed to be a unit option. `Units` is `'ft' | 'm'`.
- **Fix:** The fixture uses `'m'`.
- **How to avoid:** Check the domain type before writing literals in fixtures. A green Vitest run is not a green typecheck.

### Restore step edited the backup instead of restoring from it (Task 18)
- **Date:** 2026-11-13
- **What happened:** During the Notice mutation check, the restore step ran `sed` on the backup copy instead of restoring from it. That left a second mutant (no null return) in place, and the follow-up `Write` was refused because the file had changed since it was read. The first `npm run check` then failed 3 tests.
- **Root cause:** The mutate and restore steps were chained in one shell command and the backup was edited.
- **Fix:** The file was read and the `if (notice === null) return null;` line was restored with an exact edit. The four test files were re-run (35 passed) and `npm run check` exited 0 before the commit.
- **How to avoid:** Restore from the backup with a plain copy, in a separate step, and confirm the file matches it.

### The App notice test used an ambiguous role lookup (Task 18)
- **Date:** 2026-11-13
- **What happened:** The first draft of the App notice test used `getByRole('status')`. The failing run showed that `RoomSection` keeps an empty `.room-problem[role=status]` always mounted, so the lookup was ambiguous.
- **Root cause:** The test assumed only one `status` element would be mounted.
- **Fix:** The test finds `.notice` and asserts `role="status"` on it. The loading test keeps `getByRole('status')`, because the workspace is not mounted while loading.
- **How to avoid:** Run a new test and read its failure before relying on a lookup.

### A double-click test combined `user.dblClick` with an extra click (Task 19)
- **Date:** 2026-11-13
- **What happened:** The test saw `onConfirm` called twice.
- **Root cause:** The unkeyed fragment `armed ? <>[confirm, cancel]</> : <button>` lets React reuse the confirm `<button>` DOM node as the label button. The double click's second click therefore re-armed the component, and the third click (an extra `fireEvent.click`) confirmed again. Three clicks is not a double click.
- **Fix:** The test was split into a realistic `dblClick` test and a separate test that sends two clicks inside one `act()`, so both reach the armed button before the re-render. The `armedRef` guard is what makes the second one pass, as mutation M1 shows. `key`s were briefly added to the buttons, but no test could tell them apart, so they were removed instead of shipping untested code.
- **How to avoid:** Send the number of clicks a user would send. Do not keep code that no test can tell apart from its absence.

### The `ended` flag was not covered by any test (Task 19b)
- **Date:** 2026-11-13
- **What happened:** The first fix only returned early in the move callback while the mode was not `'room'`. A mutation run that removed `ended ||` stayed green.
- **Root cause:** No test covered room mode coming back before pointer up, when the old drag would resume editing.
- **Fix:** An assertion for that case was added and watched failing against the first fix. The move callback now ends the drag (`endDrag()`) the first time it sees a non-room mode.
- **How to avoid:** Run a mutation on every guard added in a fix, and add the test the mutation shows is missing.

### A test leaked store wrappers into later tests (Task 19b)
- **Date:** 2026-11-13
- **What happened:** The first version of the test wrapped the stores' `reset` methods with `setState`, which merges, so the wrappers would have stayed on the stores after the test.
- **Root cause:** `setState` merges instead of restoring, so the wrapped methods were never put back.
- **Fix:** The original methods are restored in `try/finally`.
- **How to avoid:** Restore anything a test replaces on a shared store in `try/finally`.

## 2026-11-14 — Openings and obstacles

The first six entries are plan defects fixed by plan amendments. Two were found while building
(the test fixture and the lint entries, Task 4). The rest were found in review, in screenshots or in
the live check, with the task named in the title. Items left as they are are listed under "Known
limits" and "Open questions for the owner (slice C)" in `docs/room-planner/README.md`.

### Rounding a re-homed opening pushed it off a diagonal wall (plan Amendment 2)
- **Date:** 2026-11-14
- **What happened:** The plan rounded a re-homed offset to 0.01. On a diagonal wall the length is irrational, so `round2` could put the opening's far edge past the wall's end and the edit was refused. A first fix used `floor2`, but floating-point noise defeated it (a 12 in diagonal wall was refused).
- **Root cause:** A rounding rule was chosen without checking it against a wall whose length is not a multiple of 0.01.
- **Fix:** Plan Amendment 2: the offset is clamped only when the raw offset is within 0.01 of the allowed interval; otherwise it is a genuine misfit and the edit is refused.
- **How to avoid:** Test a rounding rule on a diagonal wall and on a wall exactly as long as the opening.

### The controller's first ruling on that fix was wrong (plan Amendment 2)
- **Date:** 2026-11-14
- **What happened:** The first ruling clamped the offset unconditionally. That turned genuine misfits (an opening that no longer fits its wall) into silent slides. The implementer caught it in the next round.
- **Root cause:** The clamp was meant to absorb rounding noise but had no stated tolerance, so it absorbed real errors too.
- **Fix:** The clamp applies only within 0.01 in of the allowed interval. Farther out, the opening is refused as `opening-off-wall`.
- **How to avoid:** A clamp that absorbs rounding noise needs a stated tolerance.

### A pinned test file was missing from a task's file list (plan Amendment 3)
- **Date:** 2026-11-14
- **What happened:** `PlanSection.test.tsx` spells out the stored document's keys. Adding `openings` and `obstacles` to the document broke it, and Task 5 could not edit it.
- **Root cause:** The tests were not searched for the key list when the file list was written.
- **Fix:** Plan Amendment 3 added the file to Task 5, changed only to gain the two keys.
- **How to avoid:** When a task changes a stored shape, grep the tests for the key list before fixing the task's file list.

### An earlier task's test contradicted a later task (plan Amendment 4)
- **Date:** 2026-11-14
- **What happened:** Task 8 asserted that obstacles are never focusable. Task 9 makes them focusable in room mode, so the assertion became wrong.
- **Root cause:** A test of behaviour that was only true until a later task was written without saying which task lifts it.
- **Fix:** Plan Amendment 4 added `PlanView.test.tsx` to Task 9: obstacles have `tabindex="0"` in room mode and none in furnish mode.
- **How to avoid:** Write a "not yet" test per mode from the start, or name the task that lifts it.

### A pure helper was placed in a three.js module (plan Amendment 5)
- **Date:** 2026-11-14
- **What happened:** The plan put `wallHoles` in `three/roomMesh.ts`. The Blueprint view is the non-WebGL fallback and is in the main bundle, so importing it would have pulled three.js into the first load.
- **Root cause:** The plan did not check which bundle each consumer belongs to.
- **Fix:** The controller caught it before the Blueprint task. `wallHoles` moved to the pure module `room-planner/view/wallHoles.ts`, which `roomMesh.ts` re-exports. A test asserts that nothing under `room-planner/view/` or `room-planner/domain/` imports three.js. First Load JS stayed at 105 kB.
- **How to avoid:** Before placing a helper, check every consumer's bundle, and keep a test on the import boundary.

### Findings were deferred to the end again (plan Amendment 6)
- **Date:** 2026-11-14
- **What happened:** Slice B fixed its deferred findings after the live check, so the check ran on code that was not final. This slice inserted Task 12b (pre-verification fixes) before Task 13.
- **Root cause:** Fixes were planned after the check instead of before it.
- **Fix:** Plan Amendment 6 added Task 12b. Task 13b later fixed the live-check defects, and the failed rows were re-run.
- **How to avoid:** Fix review findings before the live check, so it runs on final code.

### An obstacle could be stored where the loader refuses it (Task 6)
- **Date:** 2026-11-14
- **What happened:** `applyObstacles` stored a centre as given. A centre outside ±1440 makes `parsePlan` refuse the document, so every later save would fail.
- **Root cause:** The new stored field had no write-side limit. It is the same class as slice B's "editor can save what the loader refuses".
- **Fix:** The store clamps the centre into the room's bounds, and a round-trip test step covers it.
- **How to avoid:** Every new stored field gets its write-side limit and a round-trip case in the same task.

### Windows were nearly invisible on the plan (Task 8)
- **Date:** 2026-11-14
- **What happened:** The spec's "double line" lay on top of the 2 px wall line and could hardly be seen. It was found in a screenshot.
- **Root cause:** Unit tests assert coordinates, not whether a drawing reads.
- **Fix:** A window is now a band in the plan's background colour with three thin lines (Task 12b).
- **How to avoid:** Look at a screenshot of every visual task, including fix rounds.

### A door opening was hard to see in the Styled view (Task 11)
- **Date:** 2026-11-14
- **What happened:** The hole showed the page background, which is almost the wall's colour. It was found in a screenshot.
- **Root cause:** Geometry tests do not show whether an opening reads.
- **Fix:** Each door and window hole got a thin dark frame.
- **How to avoid:** Look at a screenshot of every visual task.

### That fix introduced a floating frame (Task 12b)
- **Date:** 2026-11-14
- **What happened:** The frame was built from `LineSegments`, which are not back-face culled, so it stayed visible when its wall was culled. It was found in a screenshot.
- **Root cause:** The frame was not a child of the wall's culled mesh and used a material that is not culled.
- **Fix:** The frame is thin wall-aligned mesh strips with a front-side material, as a child of the wall.
- **How to avoid:** Check a visual fix from the angles where its parent is hidden, not only from the front.

### The Blueprint underside rule was wider than specified (Task 12)
- **Date:** 2026-11-14
- **What happened:** The rule applied to raised furniture parts too, which changed the drawing of tall desks at low camera angles. The implementer's report said it never triggers for furniture; the reviewer computed a case where it does.
- **Root cause:** A claim in a report was not checked with a computed case.
- **Fix:** The underside is drawn only for obstacle prisms (Task 12b).
- **How to avoid:** A report's "never happens" needs a worked case, not an assertion.

### A secondary mouse button started drags in room mode (Task 9)
- **Date:** 2026-11-14
- **What happened:** If the context menu swallowed the pointer up, the dragged thing kept following the cursor.
- **Root cause:** Any button started a drag.
- **Fix:** Only the primary button selects or drags in room mode, checked before any selection or listener (Task 12b).
- **How to avoid:** Check the button before starting any drag.

### Two helpers were written twice
- **Date:** 2026-11-14
- **What happened:** The half-extent and snap helper existed in `geometry.ts` and `obstacles.ts`, and the empty-label name (`Box` / `Column`) in two components.
- **Root cause:** Each task wrote what it needed without searching for an existing helper.
- **Fix:** Merged into one exported helper each (Task 12b).
- **How to avoid:** Grep for an existing helper before writing a new one.

### A test fixture put a column on the bed (Task 4)
- **Date:** 2026-11-14
- **What happened:** An unrelated conflict appeared in the expected output.
- **Root cause:** The fixture's column was placed without checking what else is at that spot in the seeded room.
- **Fix:** The fixture was moved.
- **How to avoid:** Place a fixture away from the seeded furniture, or assert on the one conflict that matters.

### An unused test helper failed lint (Task 4)
- **Date:** 2026-11-14
- **What happened:** Lint failed at the end of the task on a helper no test used.
- **Root cause:** Only the tests were run before the final check.
- **Fix:** The helper was removed.
- **How to avoid:** Run lint before the final check, not only the tests.

### Pressing a door handle on the plan did not focus it (live check C5, fixed in Task 13b)
- **Date:** 2026-11-14
- **What happened:** The pointer-down handler prevents the default, so focus stayed on the last sidebar field. Arrow keys then changed that field (the hinge radio) instead of sliding the door.
- **Root cause:** Unit tests focus the handle explicitly, so they passed.
- **Fix:** A primary press now focuses the handle, obstacle or corner.
- **How to avoid:** A keyboard row in a live check must start from a pointer action, as a person would.

### A door's leaf and arc were hidden under furniture (live check X1, fixed in Task 13b)
- **Date:** 2026-11-14
- **What happened:** The plan drew room features beneath furniture, so in the one case where the arc matters (furniture blocking the door) it could not be seen.
- **Root cause:** The layer order was chosen on paper and not tried with a conflicting piece.
- **Fix:** Door leaf and arc are drawn in a layer above furniture that ignores pointer input. Door gaps, windows and obstacles stay under the furniture.
- **How to avoid:** Try the case a feature exists for before settling its drawing order.

### Two sidebar rows could both read `Door on wall 1` (Task 13b)
- **Date:** 2026-11-14
- **What happened:** The plan handles were numbered `(k of m)` but the sidebar rows were not.
- **Root cause:** The two components built the name separately.
- **Fix:** Both use `openingName` in `room-planner/domain/openings.ts`; openings on one wall are numbered together by offset.
- **How to avoid:** Build a user-visible name in one function.

### Editing one obstacle moved another (final review)
- **Date:** 2026-11-14
- **What happened:** An outline edit leaves obstacles where they are and flags any left outside the room. Adding, relabelling, resizing or rotating a different obstacle then moved that one back to the room's edge: a box at x 120 jumped to x 108 after the room was narrowed to 108 in and a column was added.
- **Root cause:** The clamp added for "An obstacle could be stored where the loader refuses it" (Task 6) was applied to the whole list in `applyObstacles` instead of to the obstacle being moved, and it clamped into the room rather than to the loader's bound.
- **Fix:** `applyObstacles` clamps each centre only to ±`CONFIG.coordMax` (the bound `parsePlan` enforces) and refuses a centre that is not finite. The clamp into the room stays in `moveObstacleTo` and `moveObstacleBy`. A store test and a round-trip test edit a second obstacle beside one left outside the room.
- **How to avoid:** A fix for "X can be stored out of range" must bound only the value being written, and its test must include an untouched neighbour.

### The arrow keys slid a door against the arrow on some walls (final review)
- **Date:** 2026-11-14
- **What happened:** With a door or window selected, ArrowRight always raised its offset. On the bottom wall, which runs right to left, the door moved left on screen, and on the left wall ArrowDown moved it up.
- **Root cause:** The plan's table specified sliding along the wall's direction, but the code mapped Right and Down to +1 and Left and Up to −1. No unit test or live-check row used the keyboard on a right-to-left or bottom-to-top wall.
- **Fix:** An arrow changes the offset by sign(arrow · u) × step, where u is the wall's direction; an arrow across the wall does nothing. Tests cover all four walls of the seeded room and a 45° wall.
- **How to avoid:** Test a direction-dependent control on a wall running each way, and include one such wall in the live check.

## 2026-11-14 — Wall editing

Seventeen entries. The first five are plan defects found while building (fixed by plan Amendments 1 to 6, or by a ruling in Task 7). Entries 6 to 8 were found in review, 9 to 11 by looking at the running app, 12 to 16 in the live check (Task 14), and 17 in the final whole-branch review. Items left as they are are listed under "Known limits" in `docs/room-planner/README.md`.

### Pinned tests were missing from file lists, three times (plan Amendments 1, 5 and 6)
- **Date:** 2026-11-14
- **What happened:** A test that compares the whole of `CONFIG` (`catalog.test.ts`), a second copy of the room-mode hint in the selection bar (`SelectionBar.tsx`, pinned in `bars.test.tsx`), and a test that lists every button in the editor layer were each outside the task that had to change them. Slice C recorded the same mistake (its Amendment 3).
- **Root cause:** The file lists were written by grepping for the key list only. That rule was too narrow: a task also adds constants, strings and element roles that other tests pin.
- **Fix:** Plan Amendments 1, 5 and 6 added each test file to the task that changes what it pins.
- **How to avoid:** Before fixing a task's file list, grep the tests for every constant, string and element role the task adds or changes.

### A wall could be slid through the far side of the room (plan Amendment 2)
- **Date:** 2026-11-14
- **What happened:** The plan said the existing outline rules cover every bad slide. They did not. A slide past the opposite wall gives an outline with negative area, which the normaliser reverses and accepts, so wall ids then named different walls. Task 1's reviewer found it with a probe (`slideWall(R, 'c1', 174)`).
- **Root cause:** The plan checked the new edit against the validation rules but not against the normaliser, which silently repairs a reversed outline.
- **Fix:** Plan Amendment 2: a candidate whose area is not positive, or whose slid wall has reversed, is refused.
- **How to avoid:** When a new edit can change a shape's orientation, say what happens to it. "Validation covers it" must be checked against the normaliser too.

### A rule in the plan contradicted a test the same task had to keep (plan Amendment 3)
- **Date:** 2026-11-14
- **What happened:** The chain rule for openings, read literally, refused with a different reason than an existing test expects. The implementer kept the test and reported it.
- **Root cause:** The new rule was written without being run against the existing tests of the function.
- **Fix:** Plan Amendment 3 made the rule agree with the existing test.
- **How to avoid:** Run a new rule against the existing tests of the function before putting it in a plan.

### The openings rule had no direction guard and could throw (plan Amendment 4)
- **Date:** 2026-11-14
- **What happened:** When added corners turned a wall, an opening was kept on the wall id even if that wall now ran another way. An opening on a wall missing from the earlier outline threw a `TypeError` where the old code returned a result. Neither is reachable from today's edits. Task 2's reviewer found both.
- **Root cause:** The rule covered the cases the slice produces and left the others undefined.
- **Fix:** Plan Amendment 4 added the direction guard, and an opening on an unknown wall is left unchanged for validation to judge.
- **How to avoid:** A rule that takes two outlines should say what it does for every pair, including ones no current edit produces.

### The controller suggested a fix that could not work in a browser (Task 7)
- **Date:** 2026-11-14
- **What happened:** For "a press that slid is not a double-click" the controller proposed one flag, reset on every press. In a real browser the second press of a double-click comes before `dblclick`, so the flag would always have been reset. The implementer kept flags for the last two presses.
- **Root cause:** The fix was written from how events are assumed to arrive, not from the browser's order.
- **Fix:** The layer remembers whether each of the last two primary presses on a wall did anything else. The re-review walked six real event sequences.
- **How to avoid:** Write a fix that depends on event order from the browser's order, and have the reviewer walk the real sequences.

### A click followed by a quick drag added a corner (Task 7)
- **Date:** 2026-11-14
- **What happened:** The browser counts the second press as a double-click, so `dblclick` fired on release, right after the slide, and a corner was added.
- **Root cause:** The first version treated every `dblclick` as a request to add a corner.
- **Fix:** A corner is added only when neither of the two presses it is made of slid the wall or placed an opening (see the previous entry).
- **How to avoid:** Test a click followed by a drag, not only a drag and a double-click on their own.

### Clicking a length label did not select its wall in Safari and in Firefox on macOS (Task 9)
- **Date:** 2026-11-14
- **What happened:** Selection happened on focus only. Those browsers do not focus a clicked button. jsdom does, so the tests passed.
- **Root cause:** Selection relied on focus as a side effect of a click.
- **Fix:** The label also selects its wall when it is clicked, not only when it takes focus.
- **How to avoid:** Do not rely on focus as a side effect of a click. Select on the press, and treat jsdom focus behaviour as unproven for real browsers.

### Enter on text that is not a number closed the on-plan editor (Task 9)
- **Date:** 2026-11-14
- **What happened:** Pressing Enter on text that is not a number closed the on-plan editor. A press on the editor's own padding moved focus to the page, which applied the value and closed it.
- **Root cause:** The editor did not handle text that is not a number on Enter, and a press on its own padding was not kept inside it.
- **Fix:** Enter on text that is not a number no longer closes the editor, and a press inside the editor no longer moves focus away.
- **How to avoid:** List every way focus can leave an editor, and say for each whether it applies, cancels or does nothing.

### The length labels did not look clickable (after Task 8, plan Amendment 7)
- **Date:** 2026-11-14
- **What happened:** The labels were plain 12 px text, like the dimension text beside them. It was found by looking at the running app.
- **Root cause:** Unit tests check that a label exists and works, not that it looks like something to click.
- **Fix:** Plan Amendment 7: a bordered chip with a hover colour.
- **How to avoid:** Look at the running app after every task that adds a control.

### The which-end control in the sidebar had no visible label (after Task 11)
- **Date:** 2026-11-14
- **What happened:** The control's name existed only for screen readers, so a sighted user saw three buttons with no hint what they did.
- **Root cause:** The accessible name was checked and the visible text was not.
- **Fix:** The control was given a visible label.
- **How to avoid:** For every control, check the visible text as well as the accessible name.

### In the inset pane the overall width dimension was clipped (after Task 10)
- **Date:** 2026-11-14
- **What happened:** The plan moved the dimension lines 22 px out to make room for the labels. The inset pane's margin is only 48 px, so the overall width dimension was clipped.
- **Root cause:** The new offset was chosen for the large pane and not checked against the inset one.
- **Fix:** A smaller extra offset in the inset pane.
- **How to avoid:** Check a layout change in every pane size the plan can be shown in.

### A label covered the middle of its own vertical wall (live-check rows W3 and W12, plan Amendment 8)
- **Date:** 2026-11-14
- **What happened:** The label was centred 18 px outside the wall. On a vertical wall its width (about 40 px) put it over the wall's hit band, so pressing the middle of the wall opened the label instead of dragging the wall, and blocked placing a door or window there.
- **Root cause:** Unit tests check positions, not overlap.
- **Fix:** Plan Amendment 8: the label is placed by its near edge, and labels ignore the pointer while a tool is armed.
- **How to avoid:** Check what is under the pointer at the middle of every hit target (`document.elementFromPoint`) in the live check.

### A door moved when a different wall was dragged (live-check row W13, plan Amendment 8)
- **Date:** 2026-11-14
- **What happened:** Openings keep an offset from their wall's start corner, so sliding the neighbouring wall at that corner carried the door along its wall.
- **Root cause:** The spec did not say what should happen and the plan did not ask.
- **Fix:** An opening keeps its place in the room when its wall's start slides along the wall. An edit that would push it past the wall's end is refused. At first this also changed corner drags along a wall, typed lengths and the rectangle width and length fields (see "Changed behaviour" in `docs/room-planner/README.md`). The whole-branch review then found the first fix made corner drags depend on their path; the rule now applies only to edits that ask for it (plan Amendment 10).
- **How to avoid:** For every edit that moves a point other things are measured from, the plan must state what those things do.

### The first label fix still overlapped the overall length dimension in the inset pane, and reached the hit band on diagonal walls (plan Amendment 9)
- **Date:** 2026-11-14
- **What happened:** Screenshots of the second live-check run showed a label on a vertical wall over the overall length dimension in the inset pane, and a label touching the hit band on diagonal walls.
- **Root cause:** The first fix moved the label by its near edge for horizontal and vertical walls only. A label's width still varied with the wall's direction.
- **Fix:** Plan Amendment 9: every label is turned to run along its wall, so each takes the same 18 px strip.
- **How to avoid:** Fix the cause for every wall direction, and read the screenshots of a fix round.

### The live-check script used a stale scale
- **Date:** 2026-11-14
- **What happened:** After a row changed the room's size the plan re-fitted, and later drags used the old pixels-per-inch value, so "24 in" drags moved 20 in. The rows were right and the script was wrong.
- **Root cause:** The script measured the scale once.
- **Fix:** The script measures the scale after every size change.
- **How to avoid:** In a script that drives the mouse, measure the scale again after anything that can re-fit the plan.

### The first live-check run was not on final code
- **Date:** 2026-11-14
- **What happened:** Rows W19 to W22 were run only after two fix rounds, and the whole table was re-run on the last commit.
- **Root cause:** The first run happened before the fixes it prompted, as slice B's check did.
- **Fix:** The recorded run is run 3, on commit `c6d5f3b`, with nothing under `room-planner/` changed after it.
- **How to avoid:** The recorded run is always the one on the final commit.

### A typed length was lost when the field was left by dragging something (final review)
- **Date:** 2026-11-14
- **What happened:** With an on-plan length field open and a length typed but not applied, pressing another wall, a corner or a door and dragging it undid the typed length. The drag took its starting values before focus moved; moving focus applied the open field; the first drag move then recomputed from the older starting values and undid it.
- **Root cause:** Two steps, each correct alone, ran in the wrong order.
- **Fix:** A press moves focus first, then reads the drag's starting values (plan Amendment 10). A press on the wall whose own field is open leaves the field first.
- **How to avoid:** When an action can trigger another edit as a side effect, read state after the side effect.

## 2026-11-16 — Undo and redo

Nine entries. Entries 1 to 4 are plan defects found while building (fixed by plan Amendments 1 to 4, or in Task 5's fix round). Entry 5 is a controller finding that prescribed the wrong mechanism (Task 7). Entry 6 was found in the final whole-branch review, and entries 7 to 9 are process mistakes. Items left as they are are listed under "Known limits of undo and redo (slice E)" in `docs/room-planner/README.md`.

### The plan prescribed a screen-reader pattern that is often silent (plan Amendment 1)
- **Date:** 2026-11-16
- **What happened:** The plan said the "Undone" / "Redone" status element should be a new element on every announcement. Screen readers often skip a live region that is inserted together with its text, so the spec's "each undo and redo is announced" was not reliably met. Task 5's reviewer found it.
- **Root cause:** The plan author wrote a mechanism from memory without checking how live regions behave.
- **Fix:** Plan Amendment 1: one status element that is in the page from the first render. Only its text changes. A repeated word differs by a trailing non-breaking space.
- **How to avoid:** For any accessibility mechanism in a plan, state the behaviour wanted and name the known-good pattern. A persistent live region whose text changes is the default.

### Two different things shared one key (plan Amendment 2)
- **Date:** 2026-11-16
- **What happened:** The plan keyed a run of key presses by the selected thing's id. A wall's id is its starting corner's id, so a corner and the wall starting at it shared a key. A nudge of one followed within a second by a slide of the other became one undo step. Task 4's implementer found it.
- **Root cause:** The plan forgot a convention the code base states in its own notes: wall id = start corner id.
- **Fix:** Plan Amendment 2: the key includes the kind of thing (`'keys:' + kind + ':' + id`).
- **How to avoid:** When ids are used as keys across kinds of things, check whether the kinds share an id space.

### The undo keys only worked on Latin keyboard layouts (plan Amendment 3)
- **Date:** 2026-11-16
- **What happened:** The plan matched the letter typed (`e.key`). On a layout where the Z key types another letter, Cmd/Ctrl+Z did nothing. Task 4's reviewer found it.
- **Root cause:** The plan did not say what a letter shortcut does on a non-Latin layout.
- **Fix:** Plan Amendment 3: when the key typed is not a Latin letter, the physical key (`e.code`) decides. When it is a Latin letter, it alone decides, so Dvorak and AZERTY keep working by letter.
- **How to avoid:** For a letter shortcut, decide up front what happens on non-Latin layouts.

### The plan put the buttons "beside the title" without reading the header's layout (plan Amendment 4, Task 5 fix round)
- **Date:** 2026-11-16
- **What happened:** The brand has `margin-right: auto`, so buttons added after it landed at the far right, next to the units control. The implementer found it.
- **Root cause:** The plan gave the new element's CSS without reading the header's existing layout rules.
- **Fix:** Plan Amendment 4: one more rule that removes the brand's auto margin inside the header, and `margin-right: auto` on the button group.
- **How to avoid:** When a plan places a new element in an existing bar, read that bar's layout rules first and list the CSS needed.

### A deferred finding prescribed the wrong mechanism (Task 7, item 1)
- **Date:** 2026-11-16
- **What happened:** The controller's item said "skip the update whose references equal the restored plan". That is wrong when another listener was registered before the history. The implementer chose a rule that is right in both orders, and the reviewer confirmed it with a probe.
- **Root cause:** The finding named a mechanism instead of the behaviour wanted.
- **Fix:** The implementer's rule, which holds whichever listener was registered first.
- **How to avoid:** Write a finding as the behaviour wanted and how to check it. Leave the mechanism to the person who has the code open.

### A typing step stayed open after its field was removed from the page (final review, plan Amendment 5)
- **Date:** 2026-11-16
- **What happened:** The step for a text field was closed only when the field lost focus. A focused field that is removed from the page (the on-plan length editor after Enter or Escape) fires no "focus left" event, so its step stayed open and every later key press joined it. Type a length, press Enter, slide the wall with an arrow key, and one Undo took back both. No task review could see it: the hook's review saw only the hook, and the editor is from an earlier slice. The first two live-check runs missed it too, because row U9 undid only once.
- **Root cause:** The plan assumed leaving a field always fires `focusout`.
- **Fix:** Plan Amendment 5: the step is closed whenever focus is found on something that is not a text field (on focus moving to another element, and on any press or key while no text field is focused). Covered by flow test F19 and live-check row X1.
- **How to avoid:** For anything tied to focus, list the ways focus can end without an event (the element is removed, disabled or hidden). Make live-check rows continue past the first undo.

### The plan review blocked round 1 for the same reason as slice D's
- **Date:** 2026-11-16
- **What happened:** Round 1 scored 84.7 (pass is 85). The causes were live-check rows without a measurable result and a deferred-findings task with no bounds. Slice D's round 1 was blocked on a vague deferred task too.
- **Root cause:** The new plan did not start from the previous plan's final wording for those two parts.
- **Fix:** The rows were given values and the task was bounded.
- **How to avoid:** Start the next plan's deferred-findings task and live-check rows from the previous plan's final wording.

### The plan's task blocks did not use the format the structure checker reads
- **Date:** 2026-11-16
- **What happened:** The file lists were written as a sentence. The checker expects one `- Create:` / `- Modify:` / `- Test:` line per file, and it reported 27 "file drift" warnings.
- **Root cause:** The task blocks were not copied from a plan the checker had accepted.
- **Fix:** The blocks were reformatted before the review.
- **How to avoid:** Copy a task block from the last plan that passed the checker.

### The live-check script failed a row that the app passed (row U4)
- **Date:** 2026-11-16
- **What happened:** The script clicked the `Side by side` layout option, a radio button, which kept keyboard focus. Arrow keys belong to a focused radio, so they never reached the selected bed. Row U4 failed in run 1.
- **Root cause:** The script did not account for where keyboard focus was after the click. This is the same class as slice D's "stale scale" script mistake: the rows were right, the script was wrong.
- **Fix:** The script removes focus from the option after choosing it.
- **How to avoid:** In a script, after clicking a control, say where keyboard focus is before sending keys.

### The which-end control was stretched across the sidebar (found by the owner)
- **Date:** 2026-11-16
- **What happened:** In the sidebar, the "A typed length moves" control (Start, Both, End) had
  its border drawn across the full sidebar width, leaving empty bordered space after "End".
  It shipped that way in the wall-editing slice; the owner noticed it while trying undo.
- **Root cause:** The control sits in `.wall-list`, a column flex box. Children of a column
  flex box stretch to its width unless told not to, and the control's own `inline-flex` does
  not stop that. The slice D screenshots showed it, and nobody read them for this.
- **Fix:** `.wall-list > .seg { align-self: flex-start; }` in `sidebar.css`, with a test. In
  the browser the control is now 153 px wide in a 312 px list, ending at its last option.
- **How to avoid:** When a control is placed in a column flex box, decide its width on
  purpose. When reading a screenshot, check each bordered control ends where its content ends.
