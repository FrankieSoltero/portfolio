# Room Planner: Room Shape, Free Rotation and Saving — Implementation Plan

> **For executors:** execute with soltero-skills:lean-sdd. The Task Dependency
> Table below is the scheduling and review-depth contract.

**Goal:** The room can be any closed outline of straight walls, furniture rotates to
any angle, and the plan is kept in the browser between visits.

**Architecture:** The work is done in two stages so every commit stays green. First
the three views (plan, Styled 3D, Blueprint) are changed to draw from explicit
geometry (an outline of points, and a `Footprint` per item) obtained through small
accessor functions, while the stored data keeps its current shape. Then one task
switches the stored data to the new shape and re-implements the accessors; the views
do not change in that task. Editing, the sidebar, rotation controls and saving are
built on top of the switched model.

**Spec:** `docs/room-planner/specs/2026-11-13-portfolio-move-and-room-editor-design.md`,
section "Slice B" (a table; tasks cite its rows by their first-column name), plus the
"Amendment to slice B" paragraph in section "Slice C" (corners carry an `id`). Slices
C and D are out of scope here.

**Tech stack / test runner:** Next.js 15.5, React 19, TypeScript 5.9, Zustand 5,
three 0.187, zod 4, Vitest 5 with jsdom and React Testing Library. One test file:
`npx vitest run <file>`. Everything: `npm run check`.

## Global Constraints

- Repo root is the portfolio repository. All paths are relative to it. Branch:
  `room-planner`. Never commit on `main`. The reviewed slice A head is `6ed5e96`.
- Only files under `room-planner/` and `docs/room-planner/` change, plus `README.md`
  and `CLAUDE.md` in Task 21. Never edit `app/**`, `lib/**`, `public/**`,
  `components/**`, `content/**`, `package.json` or `package-lock.json`. No package is
  installed: `zod` (already a dependency, `^4.6.7`) is the only library newly imported.
- All lengths are inches. Plan space: x to the right, y **down** the screen.
- **Angle convention:** degrees, clockwise as seen on the plan, normalised to
  `[0, 360)`. A local point `(lx, ly)` of an item centred at `(cx, cy)` with angle θ
  is at `(cx + lx·cos θ − ly·sin θ, cy + lx·sin θ + ly·cos θ)`.
- **Outline convention:** corners in order with positive signed area
  `½·Σ(xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)` (the rectangle `(0,0) (W,0) (W,L) (0,L)` is positive). For
  a wall from `a` to `b`, the inward unit normal is `(−(b.y−a.y), b.x−a.x) / |b−a|`.
  A wall's `id` is the `id` of its starting corner.
- Touching is not overlapping and not outside: every geometric comparison uses
  `CONFIG.conflictEpsilon` (0.01 in).
- Stored coordinates are rounded to 0.01 in.
- **Test first.** Each task's new or changed tests are written first and seen failing
  for the expected reason before the production edit; the report quotes the failing
  output. No existing test is deleted or weakened except where its subject is removed
  or re-specified by the task; the report lists each such test and the reason.
- Every task ends with `npm run check` exiting 0 (typecheck, lint, all tests passing
  with none skipped, build listing `/room-planner`).
- New CSS rules use a planner class selector. New class names, one family per task:
  `.plan-outline*` (Task 3), `.room-corner*`, `.room-wall-hit` (Task 13),
  `.wall-list`, `.wall-row`, `.room-problem`, `.shape-buttons` (Task 14),
  `.angle-field` (Task 15), `.notice*`, `.plan-loading` (Task 18), `.plan-section*`,
  `.confirm-button*` (Task 19). A name that collides with `app/papers/papers.css`
  (the scoping test fails) is renamed with a `rp-` prefix and reported. `room-planner/styles/scoping.test.ts`
  must keep passing; do not edit it.
- User-provided and stored strings are rendered as React text only. No
  `dangerouslySetInnerHTML`. No `window.confirm`, `alert` or `prompt`.
- No network calls, no secrets, no environment variables, no cookies. The only
  browser storage used is the one `localStorage` key Task 17 names.
- Data read from storage is untrusted: nothing from it reaches the stores except
  through `parsePlan` (Task 16).
- New tunable numbers go in `room-planner/config.ts` under the names this plan gives.
- Every new interactive control is reachable by keyboard and has an accessible name.
- Stage explicit paths only (`git add <path>…`). Never `git add -A`, `git add .` or
  `git commit -a`. Never stage, move or delete `Multiplayer_AI_Sprite.aseprite`.
- Stop a local server only by its port (`lsof -ti :<port> | xargs kill`), never by
  process name. Never run `next build` while a `next dev` server runs in this repo.
- One commit per task, with the message the task gives (Task 20 may add one commit
  per defect it fixes, and that commit's record entry names every file it touched). Record every mistake and its fix in
  `docs/room-planner/mistakes-and-fixes.md` under a heading
  `## 2026-11-13 — Room shape and saving`.

## Decisions this plan makes that refine or add to the spec

Items 1 to 3 change behaviour the spec describes or that slice A has. They were put
to the owner on 2026-11-13 and are proposals until the owner confirms them; each is
confined to the tasks named, so a different answer changes only those tasks.

1. **Angle snapping is magnetic (refines the spec's "walls snap to 15-degree
   directions unless Alt is held"; Tasks 6 and 13).** While a corner is dragged, a
   wall direction snaps to a multiple of 15° only when the pointer is within 8 px of
   that direction's line. Snapping every wall to 15° unconditionally would leave
   almost no reachable positions for a corner with two walls.
2. **Items are no longer clamped inside the room.** A move keeps the item's centre
   inside the outline's bounding box; a footprint that leaves the outline is reported
   as the conflict `Outside the room`.
3. **The two room edge handles on the plan are removed.** Corner handles in "Edit
   room" mode replace them. Width and length inputs remain while the room is a
   rectangle.
4. **Starting shapes are sized from the current bounding box** and replace the
   outline on one click, as the spec says. Furniture is left where it is.
5. **Blueprint view hidden-surface order is approximate for concave rooms:** walls
   facing the camera are drawn far to near before the furniture. A wall of a deeply
   concave room can be drawn behind furniture it should cover.
6. **The save seam is asynchronous** (`Promise`-returning) so a server-backed store
   can replace it without changing callers. Because loading is asynchronous the app
   shows `Loading your plan…` until it resolves.
7. **Notices.** The spec's "discarded with a notice" is implemented as a dismissible
   notice bar; the same bar reports that storage is blocked or that a stored plan
   came from a newer version of the planner.
8. **A plan saved by a newer version is left untouched** (not deleted, not
   overwritten): the planner starts from the seeded plan and does not save in that
   session. This protects a visitor's plan if a deploy is rolled back.
9. **Two tabs open at once overwrite each other's saved plan** (last write wins).
   Synchronising tabs is out of scope.
10. **Release gate.** Per the spec's "Delivery of B and C", this slice is not merged
    on its own: the pull request is merged once, after slice C has also passed its
    checks, Done criteria 1 to 5 here hold, and the owner approves it. After the
    deploy the controller opens the live route, confirms a clean console and that
    saving writes only `room-planner:plan:v1`; a console error or a failed load there
    is the trigger to revert the merge. A plan saved before a revert is read again,
    through `parsePlan`, when the slice is re-released. No feature flag is used: the route has no
    visitors' saved data before this release, and a revert of the merge restores
    slice A, which never reads the storage key.

## Amendment 1 (2026-11-13, controller ruling during Task 2)

The plan missed four existing test files that call `computeCameraPose` with the old
arguments. Task 2's file list also includes
`room-planner/components/Stage/ThreeView.test.tsx`,
`room-planner/three/SceneRenderer.test.ts`, `room-planner/view/blueprintDraw.test.ts`
and `room-planner/view/blueprintScene.test.ts`, for one change only: each call's room
argument becomes `roomBounds(room), roomHeight(room)`. No expected value changes.

## Amendment 2 (2026-11-13, controller ruling after Task 4)

`SceneInput` and `BlueprintInput` already had `width` and `height` fields for the
pane size in pixels, which clashes with the new room `height` field the plan names.
In both interfaces the pane-size fields are renamed `viewWidth` and `viewHeight`
(Task 4 for `SceneInput`, Task 5 for `BlueprintInput`); `outline` and `height` are the
room, as the tasks say.

## Amendment 3 (2026-11-13, controller ruling after Task 5)

Task 5's "Prism drawing" row coloured prism sides by the item's own edge index. That
reverses the two side colours for items at 90° and 270° compared with slice A, where
sides were coloured by the plan axis they face. The rule is replaced: a side whose
outward normal `(nx, ny)` has `|nx| > |ny|` uses the existing `sideX` colours, and
every other side uses the existing `sideY` colours. At 0°, 90°, 180° and 270° this
gives exactly the slice A colours.

## Amendment 4 (2026-11-14, controller ruling during Task 6)

1. `room-planner/domain/catalog.test.ts` pins the whole `CONFIG` object. Any task that
   adds constants to `room-planner/config.ts` (Tasks 6 and 17) also adds exactly those
   constants to that test's expected object, and may touch that file for nothing else.
2. Task 6, added behaviour: an outline with any coordinate that is not a finite number
   is invalid. `validateOutline` reports `too-large` for it, checked before every other
   rule, so `moveCorner`, `insertCorner`, `setWallLength` and `setRectangleSize` refuse
   a non-finite target or length with `too-large`.
3. Task 6, clarification: the wall-length and room-size limits are exact (6 in and
   720 in), not widened by `CONFIG.conflictEpsilon`.

## Amendment 5 (2026-11-14, controller ruling after Task 11)

Task 11 left some old-shape references in test files outside Task 12's list, because
they are overrides or assertions, not literals. Task 12's file list is extended with
these files, each for the stated change only:

| File | Change allowed in Task 12 |
|---|---|
| `room-planner/App.test.tsx`, `room-planner/components/bars.test.tsx` | assertions on `desk().rot` (1, then 2) become assertions on `desk().angle` (90, then 180); `setRoomDim('h', 36)` becomes `setRoomHeight(36)` |
| `room-planner/three/modelSource.test.ts` | the `['rot', { rot: 2 }]` case becomes `['angle', { angle: 180 }]` |
| `room-planner/view/blueprintDraw.test.ts` | `{ ...CRATE, rot: 1 }` becomes the same crate turned 90° about the centre it had as a quarter-turned item before (centre = old `x + d/2`, `y + w/2`), so no expected coordinate changes |
| `room-planner/view/blueprintScene.test.ts` | the imports of `footprint`, `mapPart` and `Rot` go; the cases that compared prisms with `mapPart` are re-expressed with `partCorners` or fixed expected values copied from the passing test; `{ ...i, rot }` becomes `{ ...i, angle }` with `angle = rot × 90` |
| `room-planner/domain/shape.test.ts` (already listed) | the remaining old-shape literal `{ x: 30, y: 50, w: 60, d: 40, rot }` is replaced as the "Task 2's mapping comparison" row says |

In every one of these files an `expect(` line may change only as the table states;
the report lists each changed assertion.

## Amendment 6 (2026-11-14, controller ruling during Task 12)

1. **Snapping rule for moves (replaces "centre snapped to `snap`").** Snapping the
   centre would stop a piece with an odd width or depth from ever sitting flush
   against a wall, which slice A allowed. `moveItem` instead snaps the minimum corner
   of the footprint's axis-aligned bounding box to the grid: with `hx`, `hy` the
   half-extents of that bounding box, the centre becomes
   `(round((x − hx)/snap)·snap + hx, round((y − hy)/snap)·snap + hy)`, then is clamped
   into the bounds. For quarter turns this is exactly slice A's behaviour. `addItem`
   places through the same rule. Task 12's rows change accordingly:
   `moveItemTo('seed-bed', 80.4, 50.6)` gives centre `(80, 50.5)`; the "Add item" row's
   `(72, 84)` holds for a preview whose width and depth are even.
2. **Task 12's file list is extended** with three files, each for one line:
   `room-planner/components/SelectionBar.tsx` (`onClick={() => rotateSelected()}`, as
   `rotateSelected` now takes an optional angle),
   `room-planner/components/Sidebar/Sidebar.test.tsx` (the desk is moved to its old
   placement's centre, `(53, 27.5)`), and `room-planner/three/SceneRenderer.test.ts`
   (`{ ...i, x: 33, y: 57.5 }`). No `expect(` line changes in the two test files.
3. In `PlanView.test.tsx`, `setRoomDim('w', 90)` becomes
   `applyOutline(setRectangleSize(room.outline, { w: 90 }))`.

## Amendment 7 (2026-11-14, controller ruling after the Task 12 review)

Amendment 6's snapping re-snaps on every move, so after a rotation that leaves the
bounding box off the grid, an arrow-key nudge moved a piece by 1.5 in and drifted it
sideways. Ruling:

1. **Nudges are exact.** The plan store gains `moveItemBy(id: string, dx: number, dy: number): void`:
   the centre moves by exactly `(dx, dy)`, is clamped into the outline's bounding box,
   and is rounded to 0.01. No grid snapping. `nudgeSelected` uses it. Non-finite
   deltas and unknown ids are ignored; a move that changes nothing leaves the state
   object unchanged.
2. **Drags snap** as Amendment 6 says (`moveItemTo`). Rotation keeps the centre.
3. **`applyOutline` does not notify for an identical outline:** when the `ok` result's
   corners equal the stored ones (same ids and coordinates in the same order) it
   returns `true` and leaves the state object unchanged.

## Amendment 8 (2026-11-14, controller ruling after Task 13)

Adding a corner was possible only by clicking a wall with a pointer, which breaks the
plan's own rule that every new control is reachable by keyboard. Task 14 adds, in
each wall row of the wall list, a button with the accessible name
`Add a corner to wall <n>` that calls `addCornerOnWall(wall.id, <the wall's midpoint>)`
(the Task 13 action). The button is shown only in room mode. A refusal shows the
reason in the section like any other.

## Amendment 9 (2026-11-14, controller ruling after Task 19)

The task reviews left minor findings that are worth fixing. So that the live
verification (Task 20) runs against the final code, they are fixed in an inserted
**Task 19b: Pre-verification fixes**, executed and reviewed between Tasks 19 and 20
(risk tier: judgment). One commit, message
`fix(room-planner): address review findings before the live check`. Items:

| # | Finding | Required behaviour |
|---|---|---|
| 1 | A corner drag keeps running if room mode is left mid-drag | once `mode` is not `'room'`, further pointer moves of that drag change nothing (no outline edit, no `roomProblem`), and the drag's listeners and the layout freeze are released |
| 2 | `WallList.tsx` copies unit constants and the parse formula from `units.ts` | `units.ts` exports the conversion without the room range check; `parseRoomInput` and the wall-length input both use it; no unit constant is defined outside `units.ts` |
| 3 | The selection bar's controls can overflow at about 320 px | `.selection-actions` wraps |
| 4 | `planSchema.ts` copies `CONFIG.roomMax` and `CONFIG.maxCorners` | the schema reads those two limits from `CONFIG`, or a test asserts they are equal |
| 5 | A change made within 300 ms of closing or reloading the tab is not saved | a pending save is flushed on `pagehide` and when `document.visibilityState` becomes `hidden`; never while `saveBlocked`; listeners removed on unmount |
| 6 | The cached load result is applied again when the effect re-runs (Fast Refresh) | a load result is applied at most once per store; a re-run after it was applied subscribes and sets `ready` without applying it again |
| 7 | Reset can be confirmed again while the first is still clearing storage | a second confirmation while a reset is in flight does nothing |

## Task Dependency Table

| Task | Files touched | Depends on | Risk tier |
|------|---------------|------------|-----------|
| 1. Polygon maths | `room-planner/domain/types.ts`, `room-planner/domain/polygon.ts`, `room-planner/domain/polygon.test.ts` | — | standard |
| 2. Shape accessors and camera bounds | `room-planner/domain/shape.ts`, `room-planner/domain/shape.test.ts`, `room-planner/view/camera.ts`, `room-planner/view/camera.test.ts`, `room-planner/components/Stage/ThreeView.tsx`, `room-planner/components/Stage/BlueprintView.tsx` | 1 | standard |
| 3. Plan view from geometry | `room-planner/view/planLayout.ts`, `room-planner/view/planLayout.test.ts`, `room-planner/components/Stage/PlanView.tsx`, `room-planner/components/Stage/PlanView.test.tsx`, `room-planner/components/Stage/stage.css` | 1, 2 | judgment |
| 4. Styled 3D from geometry | `room-planner/three/roomMesh.ts`, `room-planner/three/roomMesh.test.ts`, `room-planner/three/SceneRenderer.ts`, `room-planner/three/SceneRenderer.test.ts`, `room-planner/components/Stage/ThreeView.tsx`, `room-planner/components/Stage/ThreeView.test.tsx` | 1, 2 | standard |
| 5. Blueprint from geometry | `room-planner/view/blueprintScene.ts`, `room-planner/view/blueprintScene.test.ts`, `room-planner/view/blueprintDraw.ts`, `room-planner/view/blueprintDraw.test.ts`, `room-planner/components/Stage/BlueprintView.tsx`, `room-planner/components/Stage/BlueprintView.test.tsx` | 1, 2 | judgment |
| 6. Outline operations | `room-planner/domain/outline.ts`, `room-planner/domain/outline.test.ts`, `room-planner/config.ts` | 1 | judgment |
| 7. Remove the room edge handles | `room-planner/components/Stage/PlanView.tsx`, `room-planner/components/Stage/PlanView.test.tsx`, `room-planner/components/Stage/stage.css`, `room-planner/components/Sidebar/RoomSection.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx`, `room-planner/domain/geometry.ts`, `room-planner/domain/geometry.test.ts` | 3 | mechanical |
| 8. Editing state in the UI store | `room-planner/domain/types.ts`, `room-planner/state/uiStore.ts`, `room-planner/state/stores.test.ts` | 1 | standard |
| 9. Conflicts from geometry | `room-planner/domain/conflicts.ts`, `room-planner/domain/conflicts.test.ts` | 1, 2 | standard |
| 10. Floor area from the outline | `room-planner/domain/units.ts`, `room-planner/domain/units.test.ts`, `room-planner/components/Sidebar/RoomSection.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx` | 1, 2, 7 | mechanical |
| 11. Test fixture builders | `room-planner/test/fixtures.ts`, `room-planner/test/fixtures.test.ts`, `room-planner/App.test.tsx`, `room-planner/components/Sidebar/AddFurnitureSection.test.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx`, `room-planner/components/Sidebar/Sidebar.test.tsx`, `room-planner/components/Stage/PlanView.test.tsx`, `room-planner/components/bars.test.tsx`, `room-planner/domain/conflicts.test.ts`, `room-planner/domain/shape.test.ts`, `room-planner/hooks/useKeyboardShortcuts.test.tsx`, `room-planner/state/stores.test.ts`, `room-planner/three/SceneRenderer.test.ts`, `room-planner/three/furnitureModels.test.ts`, `room-planner/three/modelSource.test.ts`, `room-planner/three/roomMesh.test.ts`, `room-planner/view/blueprintDraw.test.ts`, `room-planner/view/blueprintScene.test.ts`, `room-planner/view/camera.test.ts`, `room-planner/view/planLayout.test.ts` | 2, 3, 4, 5, 8, 9, 10 | mechanical |
| 12. Data model switch | `room-planner/domain/types.ts`, `room-planner/domain/shape.ts`, `room-planner/domain/shape.test.ts`, `room-planner/domain/geometry.ts`, `room-planner/domain/geometry.test.ts`, `room-planner/domain/catalog.ts`, `room-planner/domain/catalog.test.ts`, `room-planner/state/planStore.ts`, `room-planner/state/actions.ts`, `room-planner/state/selectors.ts`, `room-planner/state/stores.test.ts`, `room-planner/components/Sidebar/RoomSection.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx`, `room-planner/components/Stage/PlanView.test.tsx`, `room-planner/hooks/useKeyboardShortcuts.test.tsx`, `room-planner/services/mockProductLookup.test.ts`, `room-planner/test/fixtures.ts`, `room-planner/test/fixtures.test.ts` | 1, 2, 6, 8, 9, 10, 11 | judgment |
| 13. Edit room mode on the plan | `room-planner/components/Stage/PlanView.tsx`, `room-planner/components/Stage/PlanView.test.tsx`, `room-planner/components/Stage/RoomEditLayer.tsx`, `room-planner/components/Stage/RoomEditLayer.test.tsx`, `room-planner/components/Stage/stage.css`, `room-planner/hooks/useKeyboardShortcuts.ts`, `room-planner/hooks/useKeyboardShortcuts.test.tsx`, `room-planner/state/actions.ts`, `room-planner/state/stores.test.ts` | 3, 6, 8, 12 | judgment |
| 14. Room section of the sidebar | `room-planner/components/Sidebar/RoomSection.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx`, `room-planner/components/Sidebar/WallList.tsx`, `room-planner/components/Sidebar/WallList.test.tsx`, `room-planner/components/Sidebar/sidebar.css` | 1, 6, 8, 12 | standard |
| 15. Free rotation controls | `room-planner/components/SelectionBar.tsx`, `room-planner/components/bars.test.tsx`, `room-planner/hooks/useKeyboardShortcuts.ts`, `room-planner/hooks/useKeyboardShortcuts.test.tsx`, `room-planner/styles/app.css` | 8, 12, 13 | standard |
| 16. Plan schema and migration | `room-planner/domain/planSchema.ts`, `room-planner/domain/planSchema.test.ts` | 2, 6, 12 | judgment |
| 17. Plan store seam and browser store | `room-planner/services/planStorage.ts`, `room-planner/services/browserPlanStore.ts`, `room-planner/services/browserPlanStore.test.ts`, `room-planner/config.ts` | 12, 16 | standard |
| 18. Loading and autosaving | `room-planner/hooks/usePlanPersistence.ts`, `room-planner/hooks/usePlanPersistence.test.tsx`, `room-planner/App.tsx`, `room-planner/App.test.tsx`, `room-planner/PlannerRoot.tsx`, `room-planner/PlannerRoot.test.tsx`, `room-planner/components/Notice.tsx`, `room-planner/components/Notice.test.tsx`, `room-planner/test/fakePlanStore.ts`, `room-planner/styles/app.css` | 8, 12, 15, 17 | judgment |
| 19. Plan section and reset | `room-planner/components/ui/ConfirmButton.tsx`, `room-planner/components/ui/ConfirmButton.test.tsx`, `room-planner/components/Sidebar/PlanSection.tsx`, `room-planner/components/Sidebar/PlanSection.test.tsx`, `room-planner/components/Sidebar/Sidebar.tsx`, `room-planner/components/Sidebar/Sidebar.test.tsx`, `room-planner/components/Sidebar/sidebar.css`, `room-planner/App.tsx`, `room-planner/App.test.tsx` | 14, 18 | standard |
| 20. Live verification | `docs/room-planner/verification/2026-11-13-room-shape-live-check.md`, `docs/room-planner/verification/shots-room-shape/`, `room-planner/**` | 19 | judgment |
| 21. Docs | `docs/room-planner/mistakes-and-fixes.md`, `docs/room-planner/README.md`, `README.md`, `CLAUDE.md` | 20 | mechanical |

**Execution order: strictly serial, 1 to 18 in number order.** Where a dependency
lists a task whose interfaces are not consumed (Task 18 on Task 15, Task 19 on Task 14), it orders edits
to a shared file (`app.css`, `sidebar.css`). Every task ends with
`npm run check`, which runs `next build` and writes `.next/`, so two tasks can never
run their check at the same moment; no task may run concurrently with another.

---

## Task 1: Polygon maths

**Spec:** Slice B rows "Data", "Validity", "Fit checks".

Pure geometry used by every later task. No store, no DOM.

**Files:**
- Modify: `room-planner/domain/types.ts` (additions only)
- Create: `room-planner/domain/polygon.ts`
- Create: `room-planner/domain/polygon.test.ts`

**Interfaces:**
- Produces, in `types.ts`: `export interface Point { x: number; y: number }`,
  `export interface Corner extends Point { id: string }`,
  `export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; w: number; l: number }`.
- Produces, in `polygon.ts`:
  - `signedArea(pts: readonly Point[]): number`
  - `polygonArea(pts: readonly Point[]): number` (absolute value)
  - `boundsOf(pts: readonly Point[]): Bounds`
  - `pointInPolygon(p: Point, pts: readonly Point[], eps: number): boolean` (a point within `eps` of the boundary is inside)
  - `distanceToSegment(p: Point, a: Point, b: Point): number`
  - `projectOntoSegment(p: Point, a: Point, b: Point): { point: Point; t: number }` (`t` clamped to `[0, 1]`)
  - `segmentsCross(a: Point, b: Point, c: Point, d: Point, eps: number): boolean` (true only for a crossing or overlap that is more than touching at an endpoint)
  - `isSimplePolygon(pts: readonly Point[], eps: number): boolean`
  - `convexOverlap(a: readonly Point[], b: readonly Point[], eps: number): boolean` (separating-axis test; overlap depth must exceed `eps` on every axis)
  - `convexInsidePolygon(inner: readonly Point[], outline: readonly Point[], eps: number): boolean`
  - `rayToPolygon(origin: Point, dir: Point, pts: readonly Point[]): number | null` (distance along the unit direction to the nearest edge hit, `null` when none)
  - `interiorPoint(pts: readonly Point[]): Point`
  - `round2(v: number): number` (to 0.01)

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Signed area, rectangle | `(0,0) (144,0) (144,168) (0,168)` | `24192` |
| Signed area, reversed | same corners in reverse | `−24192`; `polygonArea` → `24192` |
| L-shape area | `(0,0) (72,0) (72,84) (144,84) (144,168) (0,168)` | `18144` |
| Bounds | the L-shape | `{ minX: 0, minY: 0, maxX: 144, maxY: 168, w: 144, l: 168 }` |
| Point inside | `(10,10)` in the L-shape | `true` |
| Point in the cut-out | `(100,40)` in the L-shape | `false` |
| Point on a wall | `(72,40)` in the L-shape, eps 0.01 | `true` |
| Point just outside | `(72.02,40)` in the L-shape, eps 0.01 | `false` |
| Segments cross | `(0,0)-(10,10)` and `(0,10)-(10,0)` | `true` |
| Segments share an endpoint | `(0,0)-(10,0)` and `(10,0)-(10,10)` | `false` |
| Collinear overlap | `(0,0)-(10,0)` and `(5,0)-(15,0)` | `true` |
| T-touch | `(0,0)-(10,0)` and `(5,0)-(5,10)` | `false` |
| Simple polygon | rectangle; L-shape | `true` |
| Bow-tie | `(0,0) (10,10) (10,0) (0,10)` | `isSimplePolygon` → `false` |
| Fewer than 3 points | 2 points | `isSimplePolygon` → `false` |
| Rotated rectangles overlap | 20×20 at centre `(0,0)` angle 0 and 20×20 at centre `(18,0)` angle 45 (corners computed in the test) | `convexOverlap` → `true` |
| Rectangles touch | two 10×10 squares sharing an edge | `false` |
| Rectangles overlap by 0.02 | two 10×10 squares offset 9.98 | `true` |
| Rectangle flush in a corner | `(0,0) (10,0) (10,10) (0,10)` in the rectangle room | `convexInsidePolygon` → `true` |
| Rectangle pokes out | same square moved to x = −0.02 | `false` |
| Rectangle over the reflex corner | square `(60,70)-(90,100)` in the L-shape | `false` |
| Rectangle spanning the cut-out | rectangle `(10,90) (60,90) (60,160) (10,160)` wholly in the lower arm → `true`; rectangle `(60,10) (80,10) (80,100) (60,100)` (one corner in the cut-out and an edge across the reflex corner) → `false`; a thin rectangle whose four corners are inside but which crosses the cut-out of a U-shaped outline `(0,0) (30,0) (30,60) (60,60) (60,0) (90,0) (90,90) (0,90)`, namely `(10,10) (80,10) (80,20) (10,20)` | `false` |
| Ray hits the right wall | origin `(50,50)`, dir `(1,0)`, rectangle room | `94` |
| Ray in the L-shape | origin `(30,40)`, dir `(1,0)` | `42` (hits the wall at x = 72) |
| Ray pointing away from everything | origin outside, pointing away | `null` |
| Interior point, convex | rectangle room | the centroid `(72, 84)` |
| Interior point, centroid outside | the U-shaped outline above | a point for which `pointInPolygon` is `true` and whose distance to every wall exceeds 1 |
| `round2` | `12.3456`, `−0.004`, `7` | `12.35`, `0` (not `−0`), `7`; computed as `Math.round(v * 100) / 100` with a negative zero turned into `0` |

**Verify:** `npx vitest run room-planner/domain/polygon.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): add polygon geometry helpers`
**Rollback:** `git revert` the commit.

## Task 2: Shape accessors and camera bounds

**Spec:** Slice B rows "Views", "Item rotation" (groundwork).

Adds the accessor layer the views will read from, implemented over today's data
(`Room { w, l, h }`, `Item { x, y, rot }`), and makes the shared camera fit a bounding
box instead of a `Room`.

**Files:**
- Create: `room-planner/domain/shape.ts`
- Create: `room-planner/domain/shape.test.ts`
- Modify: `room-planner/view/camera.ts`
- Modify: `room-planner/view/camera.test.ts`
- Modify: `room-planner/components/Stage/ThreeView.tsx` (the camera pose call only)
- Modify: `room-planner/components/Stage/BlueprintView.tsx` (the camera pose call only)

**Interfaces:**
- Consumes: `Point`, `Bounds`, `boundsOf` from Task 1.
- Produces, in `shape.ts`:
  - `export interface Footprint { cx: number; cy: number; w: number; d: number; angle: number }` (`w`, `d` are the unrotated width and depth)
  - `roomOutline(room: Room): readonly Point[]`
  - `roomHeight(room: Room): number`
  - `roomBounds(room: Room): Bounds`
  - `itemFootprint(item: Pick<Item, 'x' | 'y' | 'w' | 'd' | 'rot'>): Footprint`
  - `footprintCorners(fp: Footprint): [Point, Point, Point, Point]` in the order back-left, back-right, front-right, front-left, where "back" is local `y = −d/2`
  - `partCorners(fp: Footprint, part: PartRect): [Point, Point, Point, Point]` (the part's `[u0,u1,v0,v1]` fractions of the unrotated footprint, rotated with it; same corner order)
  - `normaliseAngle(deg: number): number` into `[0, 360)`
- Changes, in `camera.ts`:
  `computeCameraPose(bounds: Bounds, height: number, camera: CameraState, pane: PaneRect): CameraPose`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Room outline | `{ w: 144, l: 168, h: 96 }` | `(0,0) (144,0) (144,168) (0,168)`; `roomHeight` → `96`; `roomBounds` → `w 144, l 168, minX 0, minY 0` |
| Footprint, unrotated | seed bed `{ x: 40, y: 0, w: 64, d: 85, rot: 0 }` | `{ cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 }` |
| Footprint, quarter turn | seed desk `{ x: 118, y: 104, w: 55, d: 26, rot: 1 }` | `{ cx: 131, cy: 131.5, w: 55, d: 26, angle: 90 }` |
| Corners at 0° | `{ cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 }` | `(40,0) (104,0) (104,85) (40,85)` |
| Corners at 90° | the desk footprint | `(144,104) (144,159) (118,159) (118,104)` |
| Corners at 45° | `{ cx: 0, cy: 0, w: 20, d: 20, angle: 45 }` | `(0,−14.142) (14.142,0) (0,14.142) (−14.142,0)` to 3 decimals |
| Corner order keeps positive area | any footprint, any angle | `signedArea(footprintCorners(fp)) > 0` |
| Part agrees with the old mapping | every part of every kind in `PARTS`, `rot` 0 to 3, a 60×40 item | with `[fw, fd] = footprint(item)` and `[m0, m1, m2, m3] = mapPart(part, rot)` from the existing code, the bounding box of `partCorners(itemFootprint(item), part)` has `minX = item.x + m0·fw`, `maxX = item.x + m1·fw`, `minY = item.y + m2·fd`, `maxY = item.y + m3·fd`, each to 1e-9 |
| Normalise angle | `−90`, `360`, `725`, `0` | `270`, `0`, `5`, `0` |
| Camera target | bounds of the 144×168 room, height 96 | target `[72, 84, 33.6]`; every other pose field equal to what the function returned before for `{ w: 144, l: 168, h: 96 }` |
| Camera for an offset outline | bounds `minX 20, minY 10, w 100, l 50`, height 96 | target `[70, 35, 33.6]`; distance uses `Math.hypot(100, 50, 96)` |
| Call sites | `ThreeView`, `BlueprintView` | pass `roomBounds(room)` and `roomHeight(room)`; their existing tests pass unchanged apart from any that assert the call's arguments |

**Verify:** `npx vitest run room-planner/domain/shape.test.ts room-planner/view/camera.test.ts`
→ all pass; `npm run check` → exit 0.
**Commit:** `refactor(room-planner): add shape accessors and fit the camera to bounds`
**Rollback:** `git revert` the commit.

## Task 3: Plan view from geometry

**Spec:** Slice B rows "Views", "Fit checks" (clearance lines), "Item rotation".

The 2D plan draws the outline as a polygon and each item as a rotated box. With
today's data the picture is unchanged for a rectangular room and quarter turns.

**Files:**
- Modify: `room-planner/view/planLayout.ts`
- Modify: `room-planner/view/planLayout.test.ts`
- Modify: `room-planner/components/Stage/PlanView.tsx`
- Modify: `room-planner/components/Stage/PlanView.test.tsx`
- Modify: `room-planner/components/Stage/stage.css`

**Interfaces:**
- Consumes: `Footprint`, `roomOutline`, `roomBounds`, `itemFootprint`,
  `footprintCorners` (Task 2); `rayToPolygon`, `Bounds`, `Point` (Task 1).
- Produces, in `planLayout.ts`:
  - `PlanLayout` unchanged in shape: `{ scale, ox, oy }`, where `(ox, oy)` is now the
    pane-pixel position of plan point `(0, 0)`.
  - `computePlanLayout(bounds: Bounds, pane: PaneRect): PlanLayout`
  - `toPane(p: Point, layout: PlanLayout): Point`
  - `export interface ClearanceLine { x1: number; y1: number; x2: number; y2: number; label: string; showLabel: boolean }` (pane pixels)
  - `computeClearances(fp: Footprint, outline: readonly Point[], layout: PlanLayout, units: Units): ClearanceLine[]`
  - `planItemBox(fp: Footprint, layout: PlanLayout): { left: number; top: number; width: number; height: number; rotateDeg: number }` (the unrotated box centred on the item, plus the CSS rotation)
  - `labelBox(fp: Footprint, layout: PlanLayout): { width: number; height: number; rotateDeg: number }` (see the label rows)

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Layout fits the bounds | every existing `computePlanLayout` case in `planLayout.test.ts` | passes with only the first argument changed from the room to `roomBounds(room)`; no expected number is edited |
| Layout with an offset outline | bounds `minX −24, minY 12, w 100, l 50` | the bounding box is centred in the safe area: `ox = (safeW − 100·scale)/2 + 24·scale`, `oy = (h − 50·scale)/2 − 12·scale` |
| Clearance lines, seed bed | footprint `{ cx 72, cy 42.5, w 64, d 85, angle 0 }`, rectangle room | three lines: left gap 40, right gap 40, front gap 83; the back gap (0) is skipped; each runs from the midpoint of that side along its outward normal to the wall |
| Clearance at an angle | footprint `{ cx 72, cy 84, w 20, d 20, angle 45 }`, rectangle room | four lines; each length equals `rayToPolygon(side midpoint, side outward normal, outline) × scale` |
| Clearance thresholds | unchanged | gaps of 0.5 in or less are skipped; `showLabel` only above 34 px |
| Clearance in an L-shape | footprint in the lower arm, right side facing the cut-out wall | the line stops at the nearest wall along the ray, not at the bounding box |
| Item box | footprint `{ cx 131, cy 131.5, w 55, d 26, angle 90 }`, scale 2, origin 0 | `{ left: 207, top: 237, width: 110, height: 52, rotateDeg: 90 }` |
| Item element | any item | positioned by `planItemBox`, with `transform: rotate(<deg>deg)` about its centre; part rectangles inside it use the part's unrotated fractions |
| Label upright at quarter turns | angle 0, 90, 180, 270 | the label text is upright (net rotation 0); its box is the footprint as it appears on screen (width and height swapped for 90 and 270) |
| Label at other angles | angle θ, with `q` = nearest multiple of 90 | label box sized for `q`, net rotation `θ − q` (between −45° and 45°) |
| Label threshold | unchanged numbers | shown only when the label box is wider than 84 px and taller than 38 px |
| Room drawing | outline from `roomOutline(room)` | the grid-backed room area is clipped with a `clip-path: polygon(…)` whose points are the outline corners in pane pixels, and an SVG polygon with the same points strokes every wall; for the rectangular seed room those points are the four corners of the rectangle the room element occupied before |
| Corner ticks | `BlueprintCorners` | rendered only when the outline is an axis-aligned rectangle |
| Dimension lines | the existing `.plan-dim-w` and `.plan-dim-l` elements | show the bounding box width and length; they keep their existing offset (`dimOffset` / `dimOffsetInset`) from the bounding box's top and left edges |
| Selection, drag, keyboard | existing tests for select, drag-to-move, Enter/Space | still pass; dragging still calls `moveItemTo` with the same arguments as before for unrotated and quarter-turned items |
| Edge handles | the two room handles | unchanged in this task |
| Conflict and selected classes | existing | unchanged |

**Verify:** `npx vitest run room-planner/view/planLayout.test.ts room-planner/components/Stage/PlanView.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `refactor(room-planner): draw the plan from an outline and rotated footprints`
**Rollback:** `git revert` the commit.

## Task 4: Styled 3D from geometry

**Spec:** Slice B row "Views".

**Files:**
- Modify: `room-planner/three/roomMesh.ts`
- Modify: `room-planner/three/roomMesh.test.ts`
- Modify: `room-planner/three/SceneRenderer.ts`
- Modify: `room-planner/three/SceneRenderer.test.ts`
- Modify: `room-planner/components/Stage/ThreeView.tsx`
- Modify: `room-planner/components/Stage/ThreeView.test.tsx`

**Interfaces:**
- Consumes: `roomOutline`, `roomHeight`, `roomBounds`, `itemFootprint` (Task 2);
  `Point`, `Bounds`, `boundsOf` (Task 1).
- Changes, in `roomMesh.ts`:
  - `createFloorTexture(): THREE.CanvasTexture | null` (no argument; `repeat` is `(1/64, 1/64)` so one repeat covers 64 in when UVs are in inches)
  - `buildRoom(outline: readonly Point[], height: number, tokens: Tokens, floorMap: THREE.Texture | null): THREE.Group`
- Changes, in `SceneRenderer.ts`: `SceneInput` replaces `room: Room` with
  `outline: readonly Point[]` and `height: number`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Floor shape | any outline | one floor mesh whose vertices, in world space, are the outline corners at `(x, 0, y)`; it faces up (+Y) and receives shadows |
| Floor UVs | any outline | each vertex's UV is `(x, y)` in inches, so the plank size matches the rectangular room of before (64 in per repeat) |
| Walls | outline with `n` corners | `n` single-sided wall meshes of height `height`, one per wall, each spanning its two corners and facing inward (its normal equals the wall's inward normal, with plan y mapped to Z) |
| Rectangle regression | outline of the 144×168 room, height 96 | four walls with the same positions and facing as before this task |
| L-shape | the 6-corner L-shape | 6 walls; the two walls at the reflex corner face into the room |
| Room rebuild key | outline or height changes by value | room rebuilt and the old one disposed; a new array with equal coordinates does not rebuild |
| Sun and shadow frustum | any outline | positioned from the bounding box: sun at `(minX, height·2.4, minY + l·1.4)`, target at the bounding-box centre on the floor, frustum half-size `hypot(w, l)/2 + 24` |
| Furniture pose | item footprint `{ cx, cy, angle }` | group at `(cx, 0, cy)`, `rotation.y = −angle·π/180` |
| View component | `ThreeView` | passes `outline: roomOutline(room)` and `height: roomHeight(room)` |
| Disposal, sizing, outline highlight, one render per update | existing tests | still pass |

**Verify:** `npx vitest run room-planner/three room-planner/components/Stage/ThreeView.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `refactor(room-planner): build the 3D room from an outline`
**Rollback:** `git revert` the commit.

## Task 5: Blueprint from geometry

**Spec:** Slice B row "Views".

**Files:**
- Modify: `room-planner/view/blueprintScene.ts`
- Modify: `room-planner/view/blueprintScene.test.ts`
- Modify: `room-planner/view/blueprintDraw.ts`
- Modify: `room-planner/view/blueprintDraw.test.ts`
- Modify: `room-planner/components/Stage/BlueprintView.tsx`
- Modify: `room-planner/components/Stage/BlueprintView.test.tsx`

**Interfaces:**
- Consumes: `itemFootprint`, `partCorners`, `roomOutline`, `roomHeight`,
  `roomBounds` (Task 2); `Point`, `boundsOf` (Task 1).
- Changes, in `blueprintScene.ts`:
  - `export interface Prism { pts: readonly [Point, Point, Point, Point]; z0: number; z1: number; itemId: string; kind: Kind }` replaces `Box`
  - `buildPrisms(items: readonly Item[]): { prisms: Prism[]; rugs: Prism[] }` replaces `buildBoxes`
  - `frontOf(a: Prism, b: Prism, cam: Vec3): -1 | 0 | 1`
  - `sortPrisms(prisms: readonly Prism[], cam: Vec3): Prism[]` replaces `sortBoxes`
  - `makeProjector` unchanged.
- Changes, in `blueprintDraw.ts`: `BlueprintInput` replaces `room: Room` with
  `outline: readonly Point[]` and `height: number`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Prisms from items | every kind, `rot` 0 to 3 | one prism per part; its four points are `partCorners(itemFootprint(item), part)`; `z0`, `z1` as before; rugs go to `rugs` |
| Front-of, separated in z | one prism wholly above another | same answers as before for the camera above or below |
| Front-of, separating axes | two prisms | candidate axes are z, then the edge normals of `a`, then of `b`; on the first axis where the prisms are separated (touching within 0.01 counts as separated), the prism on the camera's side is in front; if the camera lies between them on that axis the next axis is tried; `0` when no axis decides |
| Front-of regression | every axis-aligned case in the existing `frontOf` tests, rewritten as prisms | same results |
| Front-of, rotated | a 20×20 prism at 45° and a square beside it, separated only along a diagonal normal | decided (non-zero) and consistent with the camera's side |
| Sort | any input | each prism exactly once; terminates on a cycle by drawing the farthest remaining prism (existing rule) |
| Prism drawing | a prism | each side face whose outward normal points toward the camera is drawn, then the top when the camera is above `z1`; even edge indices (back and front) use the existing `sideY` colours (`a200`, or `a400` when selected) and odd indices (right and left) the existing `sideX` colours (`n200`, or `a300` when selected); selected and conflict styles unchanged |
| Floor | any outline | filled and stroked along the outline |
| Grid | any outline | grid lines span the bounding box and are clipped to the floor polygon (canvas `save`, `clip`, `restore`) |
| Walls | each wall of the outline | "far" when the camera is on the wall's inward side: filled and stroked, drawn far to near by wall-midpoint distance, before the furniture; otherwise "near": dashed outline drawn after the furniture |
| Rectangle regression | 144×168 room, the camera of the existing draw tests | every existing assertion in `blueprintDraw.test.ts` passes with only its input fixture converted; the single permitted exception is an assertion on the relative order of two far-wall polygons, which may be updated to far-to-near order and must be listed in the report |
| Labels | any outline | width and length labels show the bounding-box size at the bounding box's near sides; the height label sits at mid-height of the outline corner farthest from the camera; the selected-item label sits above the item's centre |
| View component | `BlueprintView` | passes `outline` and `height` |

**Verify:** `npx vitest run room-planner/view room-planner/components/Stage/BlueprintView.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `refactor(room-planner): draw the blueprint from an outline and rotated prisms`
**Rollback:** `git revert` the commit.

## Task 6: Outline operations

**Spec:** Slice B rows "Editing", "Exact sizes", "Starting shapes", "Validity".

Pure functions that produce a new outline or refuse. No store, no DOM.

**Files:**
- Create: `room-planner/domain/outline.ts`
- Create: `room-planner/domain/outline.test.ts`
- Modify: `room-planner/config.ts`

**Interfaces:**
- Consumes: `Corner`, `Point`, `isSimplePolygon`, `signedArea`, `boundsOf`,
  `projectOntoSegment`, `round2` (Task 1).
- Produces, in `config.ts`: `cornerSnap: 1`, `angleSnapDeg: 15`,
  `angleSnapTolerancePx: 8`, `wallMin: 6`, `maxCorners: 64`. (`roomMin: 36` and
  `roomMax: 720` already exist.)
- Produces, in `outline.ts`:
  - `export type OutlineProblem = 'crossing' | 'short-wall' | 'too-few' | 'too-many' | 'too-large'`
  - `export const OUTLINE_PROBLEM_TEXT: Readonly<Record<OutlineProblem, string>>`
  - `export type OutlineResult = { ok: true; outline: Corner[] } | { ok: false; problem: OutlineProblem }`
  - `export interface Wall { id: string; index: number; a: Corner; b: Corner; length: number }`
  - `wallsOf(outline: readonly Corner[]): Wall[]`
  - `validateOutline(outline: readonly Corner[]): OutlineProblem | null`
  - `normaliseOutline(outline: readonly Corner[]): Corner[]` (reverses the order when the signed area is negative; rounds coordinates with `round2`)
  - `snapCornerTarget(outline: readonly Corner[], id: string, target: Point, opts: { angleSnap: boolean; toleranceIn: number }): Point`
  - `moveCorner(outline: readonly Corner[], id: string, to: Point): OutlineResult`
  - `insertCorner(outline: readonly Corner[], wallId: string, at: Point, newId: string): OutlineResult`
  - `removeCorner(outline: readonly Corner[], id: string): OutlineResult`
  - `setWallLength(outline: readonly Corner[], wallId: string, length: number): OutlineResult`
  - `rectangleSize(outline: readonly Corner[]): { w: number; l: number } | null`
  - `setRectangleSize(outline: readonly Corner[], size: { w?: number; l?: number }): OutlineResult`
  - `export type StartingShape = 'rectangle' | 'l-shape' | 'notched'`
  - `startingShape(shape: StartingShape, w: number, l: number, newId: () => string): Corner[]`

**Exact values:**

`OUTLINE_PROBLEM_TEXT`:

| Problem | Text |
|---|---|
| `crossing` | `Walls cannot cross.` |
| `short-wall` | `That wall would be too short.` |
| `too-few` | `A room needs at least 3 corners.` |
| `too-many` | `A room can have at most 64 corners.` |
| `too-large` | `That would make the room too large.` |

Starting shapes for `w = 144`, `l = 168` (all start at `(0, 0)`; `Math.round` on every
derived coordinate):

| Shape | Corners |
|---|---|
| `rectangle` | `(0,0) (144,0) (144,168) (0,168)` |
| `l-shape` | `(0,0) (72,0) (72,84) (144,84) (144,168) (0,168)` (the top-right `w/2 × l/2` removed) |
| `notched` | `(0,0) (54,0) (54,21) (90,21) (90,0) (144,0) (144,168) (0,168)` (a notch `w/4` wide and `l/8` deep, centred on the top wall) |

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Walls | rectangle with ids `c1…c4` | 4 walls; wall `c1` runs `c1→c2`, length 144, index 0; wall `c4` runs `c4→c1` |
| Valid | rectangle, L-shape, notched | `validateOutline` → `null` |
| Too few | 2 corners | `too-few` |
| Too many | 65 corners of a valid convex polygon | `too-many` |
| Crossing | bow-tie | `crossing` |
| Short wall | two consecutive corners 5.99 apart | `short-wall`; exactly 6 apart → valid |
| Too large | bounding box 720.01 wide | `too-large`; exactly 720 → valid |
| Check order | an outline with several problems | reported in the order too-few, too-many, short-wall, too-large, crossing |
| Normalise | rectangle given in reverse order | reversed back so the signed area is positive; ids stay with their coordinates |
| Move corner | rectangle, move `c3` to `(160, 180)` | ok; only `c3` changes; other corners and all ids unchanged |
| Move corner rounds | target `(160.004, 180.006)` | stored `(160, 180.01)` |
| Move corner refused | rectangle; move `c3` to `(72, −50)` (the wall `c3→c4` then crosses the wall `c1→c2` near `(55.5, 0)`) | `{ ok: false, problem: 'crossing' }` |
| Move, unknown id | id not in the outline | ok with the outline unchanged |
| Snap to grid | target `(100.4, 49.6)`, `angleSnap: false` | `(100, 50)` |
| Angle snap, one wall | rectangle; dragging `c2` toward `(120, 2.9)` with tolerance 4 (within tolerance of the 0° line through `c1` only; the nearest 15° line through `c3` is more than 19 in away) | `(120, 0)` |
| Angle snap, both walls | dragging `c3` to within tolerance of the lines 0° from `c4` and 90° from `c2` | the intersection of the two lines |
| Angle snap, out of tolerance | pointer farther than the tolerance from every 15° line through either neighbour | the 1-in grid point |
| Angle snap, 45° | previous corner at `(0,0)`, target `(50.3, 49.5)`, the next corner far from any snap line | a point on the line `y = x` nearest the target |
| Insert corner | rectangle, wall `c1`, at `(60.3, 4)` | ok; a new corner with `newId` at `(60, 0)` (projected onto the wall, then snapped along it to 1 in from the wall's start) between `c1` and `c2`; 5 corners |
| Insert too close to an end | at a point less than 6 in from either end of the wall | `short-wall` |
| Insert, 65th corner | outline already has 64 | `too-many` |
| Remove corner | L-shape, remove the reflex corner `(72,84)` | ok when the result is valid; 5 corners |
| Remove from a triangle | 3 corners | `too-few` |
| Remove makes walls cross | a removal whose result self-crosses | `crossing` |
| Set wall length | rectangle, wall `c1` to 120 | ok; `c2` moves to `(120, 0)`; `c1` and all other corners unchanged (the room is no longer a rectangle) |
| Set wall length on an angled wall | wall from `(0,0)` to `(30,40)` (length 50) set to 100 | the end corner moves to `(60, 80)` |
| Set wall length refused | (a) length 5.9; (b) a length that makes walls cross; (c) a length that makes the bounding box wider than 720 | (a) `short-wall`; (b) `crossing`; (c) `too-large` |
| Rectangle size | rectangle | `{ w: 144, l: 168 }`; L-shape → `null`; a 4-corner outline that is not axis-aligned → `null`; an axis-aligned rectangle not starting at `(0,0)` or starting from another corner → its size |
| Set rectangle size | rectangle, `{ w: 120 }` | ok; the corners at the larger x move so the width is 120; the minimum-x and both y extents stay |
| Set rectangle size limits | `w` below 36 or above 720 | `too-large` for above; below 36 → `short-wall` |
| Set rectangle size on a non-rectangle | L-shape | ok with the outline unchanged |
| Starting shapes | each shape at 144×168 | the corners in the table, each with a distinct id from `newId`; `validateOutline` → `null`; positive signed area |
| Starting shape, small room | each shape at 36×36 | `validateOutline` → `null` (notch width `max(6, round(w/4))`, depth `max(6, round(l/8))`, starting at `x = round((w − width)/2)`; at 36×36 the `notched` corners are `(0,0) (14,0) (14,6) (23,6) (23,0) (36,0) (36,36) (0,36)`) |

**Verify:** `npx vitest run room-planner/domain/outline.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): add room outline operations`
**Rollback:** `git revert` the commit.

## Task 7: Remove the room edge handles

**Spec:** none directly. This is decision 3, a plan decision that removes a slice A
control; the spec's "Editing" row makes corner dragging the way to reshape the room.

**Files:**
- Modify: `room-planner/components/Stage/PlanView.tsx`
- Modify: `room-planner/components/Stage/PlanView.test.tsx`
- Modify: `room-planner/components/Stage/stage.css`
- Modify: `room-planner/components/Sidebar/RoomSection.tsx`
- Modify: `room-planner/components/Sidebar/RoomSection.test.tsx`
- Modify: `room-planner/domain/geometry.ts`
- Modify: `room-planner/domain/geometry.test.ts`

**Interfaces:**
- Consumes: `PlanView` as left by Task 3.
- Removes: `snapRoomDim` from `geometry.ts` (its only caller is the handle drag).

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Handles | the plan | no element with class `plan-handle`; the `.plan-handle` rules are gone from `stage.css` |
| Frozen layout | `PlanView` | the `frozen` layout state and `onHandleDown` are removed |
| Removed tests | tests of the handles and of `snapRoomDim` | deleted, each named in the report |
| Sidebar note | the Room section | reads `Floor area <area>.` with no mention of edge handles |
| Everything else | every other existing test | passes unchanged |

**Verify:** `grep -rn "plan-handle\|snapRoomDim" room-planner` → no output;
`npx vitest run room-planner/components room-planner/domain/geometry.test.ts` → all
pass; `npm run check` → exit 0.
**Commit:** `refactor(room-planner): remove the room edge handles`
**Rollback:** `git revert` the commit.

## Task 8: Editing state in the UI store

**Spec:** Slice B rows "Editing", "Validity" (state only).

**Files:**
- Modify: `room-planner/domain/types.ts` (addition only)
- Modify: `room-planner/state/uiStore.ts`
- Modify: `room-planner/state/stores.test.ts`

**Interfaces:**
- Produces, in `types.ts`: `export type EditMode = 'furnish' | 'room'`.
- Produces, in `uiStore.ts` (`UiState`): `mode: EditMode` (initial `'furnish'`),
  `selectedCornerId: string | null`, `roomProblem: string | null`,
  `notice: string | null` (all initially `null`), and the setters
  `setMode(m: EditMode): void`, `selectCorner(id: string | null): void`,
  `setRoomProblem(text: string | null): void`, `setNotice(text: string | null): void`.
  Also `saveBlocked: boolean` (initial `false`) with `setSaveBlocked(b: boolean): void`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Enter room mode | `setMode('room')` with an item selected | `mode` is `'room'`; `selectedId` becomes `null` |
| Leave room mode | `setMode('furnish')` with a corner selected and a problem shown | `selectedCornerId` and `roomProblem` become `null` |
| Setters | `selectCorner('c2')`, `setRoomProblem('x')`, `setNotice('y')` | each sets its field and nothing else |
| Reset | `reset()` | `mode` `'furnish'`; the three nullable fields `null`; `saveBlocked` `false` |
| Existing behaviour | every existing UI store test | passes unchanged |

**Verify:** `npx vitest run room-planner/state/stores.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): add room-editing state to the UI store`
**Rollback:** `git revert` the commit.

## Task 9: Conflicts from geometry

**Spec:** Slice B row "Fit checks".

Re-implements the conflict check on outlines and rotated footprints while the stored
data keeps today's shape, so the data switch (Task 12) does not touch it.

**Files:**
- Modify: `room-planner/domain/conflicts.ts`
- Modify: `room-planner/domain/conflicts.test.ts`

**Interfaces:**
- Consumes: `convexInsidePolygon`, `convexOverlap`, `Point` (Task 1); `Footprint`,
  `footprintCorners`, `itemFootprint`, `roomOutline`, `roomHeight` (Task 2).
- Produces:
  - `export interface ConflictEntry { id: string; name: string; kind: Kind; h: number; fp: Footprint }`
  - `conflictsAmong(entries: readonly ConflictEntry[], outline: readonly Point[], height: number): Conflicts`
  - `findConflicts(items: readonly Item[], room: Room): Conflicts` (same name and
    signature; now builds entries with `itemFootprint` and calls `conflictsAmong`
    with `roomOutline(room)` and `roomHeight(room)`). `OUTSIDE_THE_ROOM` is unchanged.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Existing behaviour | every existing `findConflicts` test | passes unchanged |
| Outside | an entry whose footprint corners are not inside the outline (`convexInsidePolygon` false) | `Outside the room` |
| Flush is fine | footprint `{ cx 72, cy 42.5, w 64, d 85, angle 0 }` in the 144×168 rectangle | no conflict |
| Over the reflex corner | footprint `{ cx 75, cy 85, w 30, d 30, angle 0 }` in the L-shape `(0,0) (72,0) (72,84) (144,84) (144,168) (0,168)` | `Outside the room` |
| Too tall | `h` greater than `height` | `Taller than the ceiling` |
| Overlap | two non-rug entries whose footprints overlap (`convexOverlap`) | each reports `Overlaps <name of the first other overlapping non-rug entry in array order>` |
| Rotated near miss | two 20×20 entries with centres `(40, 40)` and `(63, 40)` in the rectangle: (a) both at 0°; (b) the second at 45° | (a) no conflict (10 + 10 < 23); (b) both report `Overlaps <the other's name>` (14.142 + 10 > 23) |
| Rugs | a rug entry under a furniture entry | no overlap conflict for either; the rug is still checked against the outline and the height |
| Check order | an entry both outside and overlapping | `Outside the room` only |

**Verify:** `npx vitest run room-planner/domain/conflicts.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `refactor(room-planner): check conflicts on outlines and rotated footprints`
**Rollback:** `git revert` the commit.

## Task 10: Floor area from the outline

**Spec:** Slice B row "Exact sizes" (the area shown for any outline).

**Files:**
- Modify: `room-planner/domain/units.ts`
- Modify: `room-planner/domain/units.test.ts`
- Modify: `room-planner/components/Sidebar/RoomSection.tsx`
- Modify: `room-planner/components/Sidebar/RoomSection.test.tsx`

**Interfaces:**
- Consumes: `polygonArea` (Task 1); `roomOutline` (Task 2); the Room section as left
  by Task 7.
- Changes: `fmtArea(areaSqIn: number, units: Units): string` (was `fmtArea(room, units)`).

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Same text as before | `fmtArea(24192, 'ft')`, `fmtArea(24192, 'm')` | the exact strings the existing tests expect for a 144×168 room |
| Another area | `fmtArea(18144, 'ft')` | the same format with the number for 126 square feet |
| Room section | the note | built from `fmtArea(polygonArea(roomOutline(room)), units)`; the existing note tests pass unchanged |

**Verify:** `npx vitest run room-planner/domain/units.test.ts room-planner/components/Sidebar/RoomSection.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `refactor(room-planner): format floor area from a square-inch value`
**Rollback:** `git revert` the commit.

## Task 11: Test fixture builders

**Spec:** none directly; this bounds Task 12 (Slice B row "Data") by removing
hand-written room and item literals from the tests first.

**Files:**
- Create: `room-planner/test/fixtures.ts`
- Create: `room-planner/test/fixtures.test.ts`
- Modify: `room-planner/App.test.tsx`
- Modify: `room-planner/components/Sidebar/AddFurnitureSection.test.tsx`
- Modify: `room-planner/components/Sidebar/RoomSection.test.tsx`
- Modify: `room-planner/components/Sidebar/Sidebar.test.tsx`
- Modify: `room-planner/components/Stage/PlanView.test.tsx`
- Modify: `room-planner/components/bars.test.tsx`
- Modify: `room-planner/domain/conflicts.test.ts`
- Modify: `room-planner/domain/shape.test.ts`
- Modify: `room-planner/hooks/useKeyboardShortcuts.test.tsx`
- Modify: `room-planner/state/stores.test.ts`
- Modify: `room-planner/three/SceneRenderer.test.ts`
- Modify: `room-planner/three/furnitureModels.test.ts`
- Modify: `room-planner/three/modelSource.test.ts`
- Modify: `room-planner/three/roomMesh.test.ts`
- Modify: `room-planner/view/blueprintDraw.test.ts`
- Modify: `room-planner/view/blueprintScene.test.ts`
- Modify: `room-planner/view/camera.test.ts`
- Modify: `room-planner/view/planLayout.test.ts`

Every listed test file is changed in its fixtures only; no assertion changes.

**Interfaces:**
- Consumes: `itemFootprint`, `roomOutline`, `roomHeight` (Task 2) in its own tests.
- Produces, in `fixtures.ts`:
  - `rectRoom(w: number, l: number, h: number): Room`
  - `placedItem(spec: { id?: string; kind?: Kind; name?: string; w: number; d: number; h: number; cx: number; cy: number; angle?: number; price?: number | null }): Item`
    (`angle` defaults to 0; before Task 12 it must be a multiple of 90 and the
    builder throws otherwise; the item occupies the footprint centred at
    `(cx, cy)` turned by `angle`)
  - `planDoc(room: Room, items: Item[], units?: Units): PlanDocument`

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Builder round trip | `placedItem({ w: 55, d: 26, h: 30, cx: 131, cy: 131.5, angle: 90 })` | `itemFootprint(result)` is `{ cx: 131, cy: 131.5, w: 55, d: 26, angle: 90 }` |
| Rect room | `rectRoom(144, 168, 96)` | `roomOutline` gives `(0,0) (144,0) (144,168) (0,168)`; `roomHeight` gives 96 |
| Unsupported angle (until Task 12) | `angle: 45` | throws with a message naming Task 12 |
| Conversion | in each listed file, every literal that builds a room, or an item with a position | replaced by `rectRoom` / `placedItem` describing the same room and the same placement; a file with no such literal is left untouched and the report says so |
| Left alone | tests of `geometry.ts`, `catalog.ts` and `mockProductLookup.ts`, and product-preview literals | not converted (Task 12 re-specifies those modules) |
| No assertion changes | `git diff` of the listed test files | no added, removed or changed line containing `expect(`; the number of tests is unchanged |

**Verify:** `npm run test` → every test passes, and the count equals the count before
this task plus the tests in `fixtures.test.ts`; `git diff HEAD --stat` lists only
files named above;
`git diff HEAD -- room-planner ':!room-planner/test' | grep -E "^[+-].*expect\("` →
no output; `npm run check` → exit 0.
**Commit:** `test(room-planner): build room and item fixtures through helpers`
**Rollback:** `git revert` the commit.

## Task 12: Data model switch

**Spec:** Slice B rows "Data", "Item rotation"; Slice C paragraph
"Amendment to slice B".

Switches the stored plan to the outline model. The views are not edited except where
this task says: they already read through `shape.ts`.

**Files:**
- Modify: `room-planner/domain/types.ts`
- Modify: `room-planner/domain/shape.ts`
- Modify: `room-planner/domain/shape.test.ts`
- Modify: `room-planner/domain/geometry.ts`
- Modify: `room-planner/domain/geometry.test.ts`
- Modify: `room-planner/domain/catalog.ts`
- Modify: `room-planner/domain/catalog.test.ts`
- Modify: `room-planner/state/planStore.ts`
- Modify: `room-planner/state/actions.ts`
- Modify: `room-planner/state/selectors.ts`
- Modify: `room-planner/state/stores.test.ts`
- Modify: `room-planner/components/Sidebar/RoomSection.tsx`
- Modify: `room-planner/components/Sidebar/RoomSection.test.tsx`
- Modify: `room-planner/components/Stage/PlanView.test.tsx` (expected move arguments only)
- Modify: `room-planner/hooks/useKeyboardShortcuts.test.tsx` (expected positions after a nudge or rotate only)
- Modify: `room-planner/services/mockProductLookup.test.ts` (only if it builds a plan document)
- Modify: `room-planner/test/fixtures.ts`
- Modify: `room-planner/test/fixtures.test.ts`

No other file changes. `conflicts.ts`, `units.ts`, every view and every other test
file compile and pass untouched, because they read through `shape.ts` (Tasks 2 to 5,
9, 10) and build data through `fixtures.ts` (Task 11). If any other file fails to
compile or a test outside the list fails, stop and report NEEDS_CONTEXT with the
output; do not widen the file list.

**Interfaces:**
- Consumes: Task 1 (`polygon.ts`), Task 2 (`shape.ts`), Task 6 (`outline.ts`),
  Task 8 (UI store), Task 9 (`findConflicts`), Task 10 (`fmtArea`), Task 11
  (`fixtures.ts`).
- Changes, in `fixtures.ts`: `rectRoom` returns `{ outline, height }` with corner ids
  `c1…c4`; `placedItem` returns `{ x: cx, y: cy, angle }` and accepts any angle.
- Produces, in `types.ts`:
  - `export interface Room { outline: Corner[]; height: number }`
  - `Item`: `rot` is removed; `angle: number` is added; `x`, `y` are now the **centre**
    of the footprint. `Rot` and `RoomAxis` are removed.
  - `export interface PlanDocument { schemaVersion: 2; units: Units; room: Room; items: Item[] }`
- Changes, in `shape.ts`: `roomOutline` returns `room.outline`; `roomHeight` returns
  `room.height`; `itemFootprint(item: Pick<Item, 'x' | 'y' | 'w' | 'd' | 'angle'>)`
  returns `{ cx: x, cy: y, w, d, angle }`.
- Changes, in `geometry.ts`: `footprint`, `mapPart`, `rotateItem`, `centrePosition`
  and `clampSnap` are removed. Produces:
  - `moveItem(item: Item, x: number, y: number, bounds: Bounds, snap: number): Item` (centre snapped to `snap`, then clamped into the bounds)
  - `rotateItemBy(item: Item, deg: number): Item` (`angle = normaliseAngle(angle + deg)`; position unchanged)
  - `setItemAngle(item: Item, deg: number): Item`
- Changes, in `planStore.ts` (`PlanState`): `setRoomDim` is removed. Produces:
  - `setRoomHeight(inches: number): void`
  - `applyOutline(result: OutlineResult): boolean` (stores `result.outline` and returns `true` when `ok`; otherwise changes nothing and returns `false`)
  - `moveItemTo(id, x, y)` (now a centre), `rotateItemBy(id: string, deg: number): void`, `setItemAngle(id: string, deg: number): void`
  - `addItem`, `removeItem`, `setUnits`, `reset` keep their signatures.
- Changes, in `actions.ts`: `rotateSelected(deg = 90): void`.

**Exact values:**

Seeded document (`createInitialDocument()`):

```
schemaVersion: 2, units: 'ft',
room: { outline: [ {id:'c1',x:0,y:0}, {id:'c2',x:144,y:0}, {id:'c3',x:144,y:168}, {id:'c4',x:0,y:168} ], height: 96 }
seed-bed:  x: 72,  y: 42.5,  angle: 0    (w 64, d 85, h 38; other fields unchanged)
seed-desk: x: 131, y: 131.5, angle: 90   (w 55, d 26, h 30; other fields unchanged)
```

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Untouched files stay green | every test file not in the Files list | passes with no edit (`git diff --stat` lists only the Files above) |
| Conflicts after the switch | the seeded document; an item moved over a wall | `findConflicts` (not edited) gives no conflict for the seed and `Outside the room` for the moved item, through the new accessors |
| Plan drag after the switch | `PlanView` (not edited here) drags by adding the pointer delta to the stored `x`, `y` | still correct, because the stored point is now the centre and moves by the same delta; the drag tests pass with converted fixtures |
| Task 2's mapping comparison | the `shape.test.ts` case that compares `partCorners` with `mapPart` | replaced, because `mapPart` is removed, by fixed expected corners for the sofa's first part on a 60×40 item at 0°, 90°, 180° and 270°, copied from the values the Task 2 test produced; the report shows the values |
| Move item | `moveItemTo('seed-bed', 80.4, 50.6)` | centre `(80, 51)` |
| Move clamps to the bounds | `moveItemTo(id, −50, 900)` in the seed room | centre `(0, 168)`; the item is not lost outside the bounding box |
| Move, no change | same position | state object unchanged (no notification) |
| Rotate by | `rotateItemBy('seed-desk', 90)` | angle `180`; `x`, `y` unchanged |
| Rotate wraps | angle 350, by 15 | `5` |
| Set angle | `setItemAngle(id, −30)` | `330` |
| Add item | a preview added to the seed room | unrotated, centred on `interiorPoint(outline)` snapped to 1 in: `(72, 84)` |
| Add item in an L-shape | the L-shape outline | the item's centre is inside the outline |
| Room height | `setRoomHeight(108)` | `room.height` 108; same value → state unchanged |
| Apply outline | `applyOutline({ ok: true, outline })` | stored; returns `true` |
| Apply refused | `applyOutline({ ok: false, problem: 'crossing' })` | nothing changes; returns `false` |
| Reset | `reset()` | the seeded document; `reset(doc)` stores `doc` |
| Room section | the sidebar's Room section | Width and Length inputs are shown only while `rectangleSize(outline)` is not `null` and write through `applyOutline(setRectangleSize(…))`; Ceiling writes `setRoomHeight`; the same parsing, limits and draft behaviour as before; the note reads `Floor area <area>.` with the area from `polygonArea` |
| Rotate action | `rotateSelected()` | selected item turns 90°; `rotateSelected(15)` turns 15° |
| Nudge | `nudgeSelected(1, 0)` | centre moves 1 in |
| Removed names | repository search | no remaining import of `footprint`, `mapPart`, `rotateItem`, `centrePosition`, `clampSnap`, `setRoomDim`, `Rot` or `RoomAxis` under `room-planner/` |

**Verify:** `npx vitest run room-planner` → all pass, none skipped;
`grep -rnE "\b(mapPart|snapRoomDim|clampSnap|centrePosition|setRoomDim|RoomAxis|rotateItem|Rot)\b|\bfootprint\(" room-planner`
→ no output; `npm run check` → exit 0.
**Commit:** `feat(room-planner): store the room as an outline and items with a free angle`
This task is committed once, and only when `npm run check` is green. If it cannot be
made green, discard the working-tree changes to the files listed above
(`git checkout -- <those paths>`), leave the branch at Task 11's commit, and report
BLOCKED with the failing output.
**Rollback:** `git revert` the commit, after reverting Tasks 13 to 21 in reverse
order if they exist (they cannot stay without this task). Tasks 1 to 11 stay valid
without it.

## Task 13: Edit room mode on the plan

**Spec:** Slice B rows "Editing", "Validity".

**Files:**
- Modify: `room-planner/components/Stage/PlanView.tsx`
- Modify: `room-planner/components/Stage/PlanView.test.tsx`
- Create: `room-planner/components/Stage/RoomEditLayer.tsx`
- Create: `room-planner/components/Stage/RoomEditLayer.test.tsx`
- Modify: `room-planner/components/Stage/stage.css`
- Modify: `room-planner/hooks/useKeyboardShortcuts.ts`
- Modify: `room-planner/hooks/useKeyboardShortcuts.test.tsx`
- Modify: `room-planner/state/actions.ts`
- Modify: `room-planner/state/stores.test.ts`

**Interfaces:**
- Consumes: `mode`, `selectedCornerId`, `selectCorner`, `setRoomProblem`
  (Task 8); `applyOutline` (Task 12); `moveCorner`, `insertCorner`, `removeCorner`,
  `snapCornerTarget`, `wallsOf`, `OUTLINE_PROBLEM_TEXT` (Task 6); `PlanLayout`,
  `toPane` (Task 3).
- Produces, in `RoomEditLayer.tsx`:
  `export function RoomEditLayer({ layout }: { layout: PlanLayout }): JSX.Element`.
- Produces, in `actions.ts`:
  - `dragCornerTo(id: string, target: Point, opts: { angleSnap: boolean; toleranceIn: number }): void`
  - `addCornerOnWall(wallId: string, at: Point): void` (the new corner's id is `crypto.randomUUID()`; on success it becomes the selected corner)
  - `removeSelectedCorner(): void`
  - `nudgeSelectedCorner(dx: number, dy: number): void`
  Each applies the outline operation through `applyOutline`; on refusal it sets
  `roomProblem` to the problem's text, and on success it clears `roomProblem`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Layer shown | `mode === 'room'` | `PlanView` renders `RoomEditLayer`; in `'furnish'` mode it does not |
| Furniture in room mode | `mode === 'room'` | items are drawn dimmed, are not focusable, and pointer events on them do nothing |
| Corner handles | outline with `n` corners | `n` buttons, each with the accessible name `Corner <index + 1>` and `aria-pressed` reflecting selection |
| Select a corner | pointer down or Enter/Space on a handle | `selectedCornerId` is that corner |
| Drag a corner | pointer down on a handle, move by `(dx, dy)` px | `dragCornerTo(id, start + (dx, dy)/scale, { angleSnap: !altKey, toleranceIn: 8/scale })`; the layout is frozen from pointer down to pointer up so the room does not re-fit mid-drag |
| Alt held | pointer move with `altKey` true | `angleSnap: false` |
| Drag refused | a move that would make walls cross | the outline stays at its last valid position; `roomProblem` is `Walls cannot cross.` |
| Drag valid again | the pointer returns to a valid position | the corner follows; `roomProblem` is `null` |
| Wall hit targets | one per wall | pointer down on a wall (not on a handle) calls `addCornerOnWall(wall.id, the pointer position in plan inches)` |
| Add refused | a click within 6 in of a wall's end | no corner added; `roomProblem` is `That wall would be too short.` |
| Delete | corner selected, `Delete` or `Backspace` outside a text field | `removeSelectedCorner()`; on success the selection clears |
| Delete refused | a triangle | unchanged; `roomProblem` is `A room needs at least 3 corners.` |
| Arrows | corner selected | `nudgeSelectedCorner` by 1 in, 12 in with Shift, without angle snapping; ignored in any form field |
| Escape | corner selected | selection cleared |
| R in room mode | any | does nothing |
| Furnish-mode shortcuts | `mode === 'furnish'` | exactly as before this task |
| Background click | pointer down on empty plan area in room mode | corner selection cleared |
| Unknown corner | `dragCornerTo` with an id not in the outline | nothing changes |

**Verify:** `npx vitest run room-planner/components/Stage room-planner/hooks room-planner/state`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): edit the room outline on the plan`
**Rollback:** `git revert` the commit.

## Task 14: Room section of the sidebar

**Spec:** Slice B rows "Editing" (the mode switch), "Exact sizes", "Starting shapes",
"Validity" (the reason shown).

**Files:**
- Modify: `room-planner/components/Sidebar/RoomSection.tsx`
- Modify: `room-planner/components/Sidebar/RoomSection.test.tsx`
- Create: `room-planner/components/Sidebar/WallList.tsx`
- Create: `room-planner/components/Sidebar/WallList.test.tsx`
- Modify: `room-planner/components/Sidebar/sidebar.css`

**Interfaces:**
- Consumes: `mode`, `setMode`, `roomProblem`, `setRoomProblem`, `selectCorner`
  (Task 8); `applyOutline` (Task 12); `wallsOf`, `setWallLength`, `startingShape`, `StartingShape`,
  `OUTLINE_PROBLEM_TEXT` (Task 6); `boundsOf` (Task 1).
- Produces: `export function WallList(): JSX.Element`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Mode button | `mode === 'furnish'` | a button `Edit room` with `aria-pressed="false"`; clicking sets `mode` to `'room'` |
| Mode button, active | `mode === 'room'` | the button reads `Done` with `aria-pressed="true"`; clicking sets `'furnish'` |
| Wall list | any outline, in either mode | one row per wall: a label `Wall <index + 1>` and a length input in the current units, using the same input parsing and step as the room inputs |
| Type a length | a valid number in a wall's input | `applyOutline(setWallLength(outline, wall.id, inches))`; on refusal the outline is unchanged, the input keeps what was typed, and `roomProblem` shows the reason |
| Length out of range | under 6 in or over 720 in | not applied; `roomProblem` is `That wall would be too short.` or `That would make the room too large.` |
| Draft resync | the wall's length changes from elsewhere (a drag) | the input shows the new length unless it has focus and its text already parses to that length |
| Problem text | `roomProblem` not `null` | shown in the section in an element with `role="status"`; absent when `null` |
| Starting shapes | three buttons in a group labelled `Start from a shape`: `Rectangle`, `L-shape`, `Notched` | one click calls `applyOutline({ ok: true, outline: startingShape(shape, bounds.w, bounds.l, () => crypto.randomUUID()) })` with the current bounding-box size, and clears `roomProblem` and `selectedCornerId` |
| Rectangle-only inputs | a non-rectangular outline | Width and Length are absent; Ceiling stays |
| Note | any outline | `Floor area <area>.` followed, in room mode, by `Drag a corner to reshape the room. Click a wall to add a corner. Hold Alt to turn off angle snapping.` |

**Verify:** `npx vitest run room-planner/components/Sidebar room-planner/components/ui`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): add wall lengths, starting shapes and the edit switch to the sidebar`
**Rollback:** `git revert` the commit.

## Task 15: Free rotation controls

**Spec:** Slice B row "Item rotation".

**Files:**
- Modify: `room-planner/components/SelectionBar.tsx`
- Modify: `room-planner/components/bars.test.tsx`
- Modify: `room-planner/hooks/useKeyboardShortcuts.ts`
- Modify: `room-planner/hooks/useKeyboardShortcuts.test.tsx`
- Modify: `room-planner/styles/app.css`

**Interfaces:**
- Consumes: `rotateSelected(deg)`, `setItemAngle` (Task 12); `mode` (Task 8); the keyboard
  handler as left by Task 13.
- Produces: `rotateStepFine: 15` is **not** added to config; the two steps are
  `ROTATE_STEP_COARSE = 90` and `ROTATE_STEP_FINE = 15` in `useKeyboardShortcuts.ts`.

**Exact values:**

- 2D hint, furnish mode: `Drag a piece on the plan to move it, or nudge it with the arrow keys. Select one to see its clearance to each wall. R turns it 90°, Shift+R turns it 15°, Delete removes. Drag the 3D view to orbit.`
- Hint, room mode (plan visible): `Drag a corner to reshape the room. Click a wall to add a corner. Select a corner and press Delete to remove it.`
- 3D hint: unchanged.
- Angle field: label `Angle`, suffix `°`, `type="number"`, `min` 0, `max` 359, `step` 1.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| R | item selected, furnish mode, key `r` or `R` without Shift | turns 90° |
| Shift+R | key `R` with `shiftKey` | turns 15° |
| R in a text field | focus in the angle field or any text input | ignored |
| Angle field shows | selected item at 45° | the field's value is `45` |
| Angle field edits | type `30` | `setItemAngle(id, 30)` |
| Angle field, rejected input | `360`, `400`, `−10`, `−0.5`, empty, `abc` | the store is not written; the field keeps the typed text; it resyncs when the selection or the stored angle changes. The accepted interval is `[0, 360)`: `0`, `359`, `359.5` are accepted as typed |
| Angle field rounding | stored angle 22.5 | shows `22.5` |
| Rotate button | click `Rotate 90°` | turns 90° (unchanged) |
| Room mode | `mode === 'room'` | the bar shows the room-mode hint; no item controls |
| Nothing selected | furnish mode | the 2D or 3D hint as before, with the new 2D text |

**Verify:** `npx vitest run room-planner/components/bars.test.tsx room-planner/hooks/useKeyboardShortcuts.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): rotate furniture to any angle`
**Rollback:** `git revert` the commit.

## Task 16: Plan schema and migration

**Spec:** Slice B rows "Data" (version 1 conversion), "Saving" (validation).

**Files:**
- Create: `room-planner/domain/planSchema.ts`
- Create: `room-planner/domain/planSchema.test.ts`

**Interfaces:**
- Consumes: `PlanDocument` (Task 12); `validateOutline`, `normaliseOutline` (Task 6);
  `normaliseAngle` (Task 2); `zod`.
- Produces:
  `export type ParseResult = { ok: true; doc: PlanDocument } | { ok: false; newer: boolean; reason: string }`
  and `export function parsePlan(input: unknown): ParseResult`. `reason` is a short
  developer-facing description (which rule failed); it never contains the input.
  The returned `doc` is a new object containing only known fields.

**Exact values (limits):**

| Field | Rule |
|---|---|
| `schemaVersion` | `1` or `2`; anything else is invalid |
| `units` | `'ft'` or `'m'` |
| `room.height` (v1 `room.h`) | finite, 36 to 720 |
| v1 `room.w`, `room.l` | finite, 36 to 720 |
| `room.outline` | 3 to 64 corners; each `x`, `y` finite, −1440 to 1440; ids distinct; `validateOutline` returns `null` after `normaliseOutline` |
| any `id` | string matching `^[A-Za-z0-9_-]{1,64}$` |
| `items` | at most 200; ids distinct |
| item `kind` | one of the eight `Kind` values |
| item `name` | string, 1 to 200 characters |
| item `host` | string, 0 to 255 characters |
| item `sourceUrl`, `model.assetUrl` | `null`, or a string of at most 2048 characters that `new URL()` parses with protocol `http:` or `https:` |
| item `price` | `null`, or finite, 0 to 10,000,000 |
| item `w`, `d`, `h` | finite, greater than 0, at most 720 |
| item `x`, `y` | finite, −1440 to 1440 |
| item `angle` | finite; stored as `normaliseAngle(angle)` rounded to 0.01 |
| v1 item `rot` | 0, 1, 2 or 3 |
| item `model.tier` | one of the four `ModelTier` values |
| item `model.label` | string, 0 to 200 characters |

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Valid v2 | `createInitialDocument()` after a JSON round trip | `ok`, deep-equal to the input |
| v1 conversion, room | `{ schemaVersion: 1, room: { w: 144, l: 168, h: 96 }, … }` | outline `(0,0) (144,0) (144,168) (0,168)` with ids `c1…c4`; `height` 96; `schemaVersion` 2 |
| v1 conversion, items | v1 seed desk `{ x: 118, y: 104, w: 55, d: 26, rot: 1 }` | `x: 131, y: 131.5, angle: 90`; v1 seed bed `{ x: 40, y: 0, w: 64, d: 85, rot: 0 }` → `x: 72, y: 42.5, angle: 0` |
| v1 conversion, whole seed | the version 1 seeded document (as in `git show 6ed5e96:room-planner/domain/catalog.ts`) | deep-equal to `createInitialDocument()` |
| Unknown fields | extra keys at any level, including `__proto__` and `constructor` given as own keys in parsed JSON | dropped; the result has only known keys and a plain prototype |
| Not an object | `null`, a string, an array, a number | `ok: false` |
| Future version | `schemaVersion` an integer greater than 2 (`3`, `40`) | `ok: false` with `newer: true`; every other failure has `newer: false` |
| Crossing outline | a bow-tie outline | `ok: false` |
| Reversed outline | a valid outline in negative order | `ok`, normalised to positive order |
| Too many corners / items | 65 corners; 201 items | `ok: false` |
| Duplicate ids | two items or two corners with one id | `ok: false` |
| Hostile URL | `sourceUrl: 'javascript:alert(1)'`, `'data:text/html,…'`, `' https://x'` with a 3000-character tail | `ok: false` |
| Non-finite numbers | `NaN`, `Infinity`, numeric strings such as `'12'` | `ok: false` (no coercion) |
| Bad id characters | `id: '<img src=x>'` | `ok: false` |
| Angle normalised | `angle: 450` | `ok`, stored `90` |
| Reason is safe | any failing input containing the marker string `SECRET-MARKER` in a field | `reason` does not contain `SECRET-MARKER` |
| Never throws | each failing input above, and a deeply nested object | returns `ok: false`; does not throw |

**Verify:** `npx vitest run room-planner/domain/planSchema.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): validate and migrate stored plans`
**Rollback:** `git revert` the commit.

## Task 17: Plan store seam and browser store

**Spec:** Slice B rows "Saving", "Seam".

**Files:**
- Create: `room-planner/services/planStorage.ts`
- Create: `room-planner/services/browserPlanStore.ts`
- Create: `room-planner/services/browserPlanStore.test.ts`
- Modify: `room-planner/config.ts`

**Interfaces:**
- Consumes: `parsePlan` (Task 16); `PlanDocument` (Task 12).
- Produces, in `config.ts`: `planStorageKey: 'room-planner:plan:v1'`,
  `maxStoredChars: 524288`, `saveDebounceMs: 300`.
- Produces, in `planStorage.ts` (types only):
  - `export type LoadResult = { status: 'empty' } | { status: 'loaded'; doc: PlanDocument } | { status: 'invalid' } | { status: 'newer' } | { status: 'unavailable' }`
  - `export interface PlanStore { load(): Promise<LoadResult>; save(doc: PlanDocument): Promise<boolean>; clear(): Promise<void> }`
- Produces, in `browserPlanStore.ts`:
  `export function createBrowserPlanStore(storage?: () => Storage): PlanStore`
  (default `() => window.localStorage`; the getter is called inside each method, inside
  a `try`, because merely reading `window.localStorage` can throw).

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Nothing saved | key absent | `load()` → `{ status: 'empty' }` |
| Round trip | `save(doc)` then `load()` | `save` resolves `true`; `load` → `{ status: 'loaded', doc }` deep-equal to the saved document |
| What is written | `save(doc)` | exactly one key, `room-planner:plan:v1`, holding `JSON.stringify` of the four document fields (`schemaVersion`, `units`, `room`, `items`) and nothing else: no functions, no UI state |
| Version 1 stored | a version 1 document under the key | `loaded`, converted by `parsePlan` |
| Not JSON | the value `{oops` | `{ status: 'invalid' }`; the key is removed. This is permanent for the visitor and accepted for the same reason as the validation row below; the notice is the only signal |
| Fails validation | valid JSON that `parsePlan` rejects with `newer: false` | `{ status: 'invalid' }`; the key is removed. Accepted loss: the value could not be shown or repaired by this code, and leaving it would fail on every visit |
| Saved by a newer version | valid JSON that `parsePlan` rejects with `newer: true` | `{ status: 'newer' }`; the key is **not** removed or changed |
| Oversized | a stored string longer than 524288 characters | `{ status: 'invalid' }` without calling `JSON.parse`; the key is removed (same accepted loss) |
| Storage throws on access | the getter throws (blocked storage) | `load` → `{ status: 'unavailable' }`; `save` → `false`; `clear` resolves; nothing throws or rejects |
| Quota exceeded | `setItem` throws | `save` → `false` |
| Too big to save | the serialised document exceeds 524288 characters | `save` → `false`; nothing written |
| Clear | `clear()` | the key is removed; other keys are untouched |
| Logging | any failure | nothing from the stored value or the document is logged |

**Verify:** `npx vitest run room-planner/services/browserPlanStore.test.ts` → all
pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): add the plan store seam and a browser store`
**Rollback:** `git revert` the commit. Nothing calls the store until Task 18.

## Task 18: Loading and autosaving

**Spec:** Slice B rows "Saving", "Seam".

**Files:**
- Create: `room-planner/hooks/usePlanPersistence.ts`
- Create: `room-planner/hooks/usePlanPersistence.test.tsx`
- Modify: `room-planner/App.tsx`
- Modify: `room-planner/App.test.tsx`
- Modify: `room-planner/PlannerRoot.tsx`
- Modify: `room-planner/PlannerRoot.test.tsx`
- Create: `room-planner/components/Notice.tsx`
- Create: `room-planner/components/Notice.test.tsx`
- Create: `room-planner/test/fakePlanStore.ts`
- Modify: `room-planner/styles/app.css`

**Interfaces:**
- Consumes: `PlanStore`, `LoadResult`, `createBrowserPlanStore`, `saveDebounceMs`
  (Task 17); `notice`, `setNotice`, `saveBlocked`, `setSaveBlocked` (Task 8); `usePlanStore().reset` and the document
  fields (Task 12).
- Produces:
  - `export function usePlanPersistence(store: PlanStore): { ready: boolean }`
  - `App` gains a required prop `planStore: PlanStore` beside its existing props;
    `PlannerRoot` creates one `createBrowserPlanStore()` in a `useState` initialiser
    and passes it.
  - `export function Notice(): JSX.Element | null`, rendered by `App` above the
    workspace.

**Exact values:**

| Load result or event | Notice text |
|---|---|
| `invalid` | `Your saved plan could not be read, so the planner started fresh.` |
| `unavailable`, a rejected `load`, or a failed save | `This browser is blocking storage, so changes will not be saved.` |
| `newer` | `Your saved plan was made with a newer version of the planner. It has been left untouched, and changes in this session will not be saved.` |

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Load on mount | the store resolves `loaded` | the plan store holds that document before the workspace is first rendered; `ready` becomes `true` |
| Before ready | `load()` not yet resolved | `App` renders `Loading your plan…` in an element with `role="status"` and does not render the workspace; `save` has not been called |
| Empty | `empty` | the seeded document is used; `notice` stays `null` |
| Invalid | `invalid` | the seeded document is used; `notice` is the invalid text |
| Unavailable | `unavailable` | the seeded document is used; `notice` is the storage text; the workspace renders |
| Load rejects | `load` rejects | same as `unavailable`; no unhandled rejection |
| Newer | `newer` | the seeded document is used; `notice` is the newer-version text; `setSaveBlocked(true)` is called; no `save` call happens while `saveBlocked` is `true`, whatever changes are made |
| Autosave | after ready, three document changes 100 ms apart, then 300 ms of quiet (fake timers) | exactly one `save` call, with the document as it is after the third change |
| What is saved | the `save` argument | an object with exactly the keys `schemaVersion`, `units`, `room`, `items` |
| No save for UI state | selecting an item, changing layout, changing the camera, changing `mode` | no `save` call |
| No save of the load itself | the document applied from `load()` | no `save` call results from it |
| Save fails | `save` resolves `false`, or rejects | `notice` is the storage text; a second failure leaves it unchanged; no unhandled rejection |
| Unmount with a pending save | a change, then unmount before 300 ms | the pending save is flushed: `save` is called exactly once, immediately on unmount, and never again after the timer period |
| Unmount with nothing pending | unmount | no `save` call; the store subscription is removed (a later document change causes no `save`) |
| React StrictMode | the hook mounted under `<StrictMode>` | after the double effect run one subscription is active: one change produces exactly one `save` |
| Notice | `notice` not `null` | an element with `role="status"` holding the text and a button `Dismiss` that sets `notice` to `null`; `Notice` returns `null` when `notice` is `null` |
| Existing app tests | `App.test.tsx`, `PlannerRoot.test.tsx` | `App` tests pass `createFakePlanStore()` from `room-planner/test/fakePlanStore.ts` (an in-memory `PlanStore` whose `load` result and `save` outcome the test sets, and which records calls); `PlannerRoot` tests run against jsdom's `localStorage`, cleared before each test; all await readiness; no existing assertion is weakened |

**Verify:** `npx vitest run room-planner/hooks/usePlanPersistence.test.tsx room-planner/App.test.tsx room-planner/PlannerRoot.test.tsx room-planner/components/Notice.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): load and autosave the plan in the browser`
**Rollback:** `git revert` the commit (after Task 19's, if present). Without it the
planner runs unsaved, as in slice A. A plan already written under
`room-planner:plan:v1` in a developer's browser is then simply never read; no
released code has written that key.

## Task 19: Plan section and reset

**Spec:** Slice B row "Saving" ("Reset plan" with a confirmation).

**Files:**
- Create: `room-planner/components/ui/ConfirmButton.tsx`
- Create: `room-planner/components/ui/ConfirmButton.test.tsx`
- Create: `room-planner/components/Sidebar/PlanSection.tsx`
- Create: `room-planner/components/Sidebar/PlanSection.test.tsx`
- Modify: `room-planner/components/Sidebar/Sidebar.tsx`
- Modify: `room-planner/components/Sidebar/Sidebar.test.tsx`
- Modify: `room-planner/components/Sidebar/sidebar.css`
- Modify: `room-planner/App.tsx`
- Modify: `room-planner/App.test.tsx`

**Interfaces:**
- Consumes: `PlanStore` (Task 17); `App`'s `planStore` prop and `setNotice`
  (Tasks 18 and 8); `usePlanStore().reset`, `useUiStore().reset` (Tasks 12 and 8).
- Produces:
  - `export function ConfirmButton(props: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }): JSX.Element`
  - `export function PlanSection({ planStore }: { planStore: PlanStore }): JSX.Element`
  - `Sidebar` gains the prop `planStore: PlanStore` and renders `PlanSection` after
    the item list; `App` passes its `planStore` to `Sidebar`.

**Exact values:** heading number `04`, heading `Plan`, text
`Saved in this browser only. Nothing is sent anywhere.`, button label `Reset plan`,
confirm label `Erase everything and start over`, cancel label `Cancel`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Confirm button, idle | rendered | one button named `label` |
| Confirm button, armed | one click | a button named `confirmLabel` and a button `Cancel`; `onConfirm` not called; focus is on `Cancel` |
| Confirm | click `confirmLabel` | `onConfirm` called once; back to idle |
| Cancel | click `Cancel`, or press Escape while armed | back to idle with focus on the `label` button; `onConfirm` not called |
| Reset plan | confirm in the Plan section | in order: `planStore.clear()` is awaited, the plan store is reset to the seeded document, the UI store is reset (which sets `notice` to `null` and `saveBlocked` to `false`) |
| Reset when clear rejects | `clear` rejects | the plan and UI stores are still reset, and then `notice` is set to the storage text from Task 18; no unhandled rejection |
| Reset in a newer-version session | `saveBlocked` is `true` (Task 18) | the same as "Reset plan": the visitor has confirmed erasing, so the key is cleared and saving resumes because `saveBlocked` is now `false` |
| After a reset | the autosave runs | `save` is called with the seeded document |
| Sidebar order | rendered | Room, Add furniture, In this room, Plan |

**Verify:** `npx vitest run room-planner/components/ui/ConfirmButton.test.tsx room-planner/components/Sidebar room-planner/App.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): add the plan section with reset`
**Rollback:** `git revert` the commit.

## Task 20: Live verification

**Spec:** every Slice B row, checked in a real browser.

**Files:**
- Create: `docs/room-planner/verification/2026-11-13-room-shape-live-check.md`
- Create: `docs/room-planner/verification/shots-room-shape/` (screenshots)
- Modify: `room-planner/**` (only files listed in Tasks 1 to 19, and only to fix a defect a row below exposes; each fix is test-first, its own commit, and its record entry names every file touched)

**Interfaces:**
- Consumes: the finished app (Tasks 1 to 19).

**Procedure:** `npm run build`, then `npx next start -p 3210`; drive Chromium at
1440×900 against `http://localhost:3210/room-planner`; stop the server by port when
done. **Rows run in order in one browser session. A row marked "fresh" first clears
site storage and reloads; every other row continues from the state the previous row
left.** Record per row: what was done, what was observed (with the measured values
where the row names a measurement), a screenshot path where the row is visual, and
`Pass` or `Fail`. "Console clean" means no `error` or `warning` entries.

Fixture F2, used by B12: the seeded document with the outline replaced by the
L-shape `(0,0) (72,0) (72,84) (144,84) (144,168) (0,168)` (ids `c1` to `c6`) and its
items replaced by one `box` item as in F1 with `id: 'c'`, `name: 'Box C'`,
`x: 108, y: 126, angle: 0`.

A screenshot is supporting evidence only: a row passes or fails on the stored values,
DOM measurements or text its Expected cell names. Where a row mentions a 3D view, the
measurable check is that the 3D canvas's pixels differ from a capture taken
immediately before the step (the view re-rendered), plus the stored values.

Fixture F1, used by B11 (stored under the key `room-planner:plan:v1`): the seeded
document with its two items replaced by two items of kind `box`, each
`w: 20, d: 20, h: 20`, `price: null`, `sourceUrl: null`, `host: ''`,
`model: { tier: 'box', label: 'Box', assetUrl: null }`: `id: 'a'`, `name: 'Box A'`,
`x: 40, y: 40, angle: 0` and `id: 'b'`, `name: 'Box B'`, `x: 63, y: 40, angle: 0`.

**Behavior (rows of the record):**

| Row | Steps | Expected |
|-----|-------|----------|
| B1 | Fresh. Open the route | the seeded rectangular room with the bed and the desk; no notice; console clean |
| B2 | Click `Edit room`; holding Alt, drag corner 3 by (+60 px, +40 px) | corner 3's stored position is its start plus (60, 40) px divided by the layout scale, rounded to 1 in; the sidebar lengths of walls 2 and 3 equal the lengths computed from the stored corners; the 3D canvas re-rendered |
| B3 | Click the midpoint of wall 1; drag the new corner 60 px into the room | the stored outline has 5 corners and the sidebar lists 5 walls; the canvas re-rendered in the Styled style and again after switching to Blueprint |
| B4 | Fresh. `Edit room`. Drag corner 3 to a point 50 px above the midpoint of the top wall | on release the stored outline is unchanged from its last valid state (4 corners, `isSimplePolygon` true when evaluated on the stored coordinates); the sidebar shows `Walls cannot cross.` |
| B5 | Fresh. `Edit room`. Read the layout scale `k` (px per inch) and let `n = min(7, round(1.5·k))` px. Drag corner 3 by `n` px in x only and release; then repeat the same drag holding Alt | without Alt corner 3 is stored at `(144, 168)` (inside the 8 px snap tolerance); with Alt its stored x is `144 + round(n/k)`, which must not be 144 (if it is, the row is recorded as Fail and the scale reported) |
| B6 | Click the midpoint of wall 1 (5 corners). Select the new corner, press Delete; select corner 1, press Delete; press Delete on a selected corner again | 4 corners, then 3, then still 3 with the sidebar showing `A room needs at least 3 corners.` |
| B7 | Click starting shape `L-shape` | 6 walls listed; the Width and Length inputs are absent; the floor area equals the area of the bounding box minus one quarter of it, in the current units |
| B8 | Type a length 12 in longer than shown into wall 1's input | wall 1's end corner moves 12 in along the wall and no other corner moves (stored coordinates); the 3D canvas re-rendered |
| B9 | Click `Done`. Drag the bed so its centre is inside the cut-out of the L-shape | the plan item has the class `is-conflict`; the bed's list row and the selection bar read `Outside the room` |
| B10 | Select the desk; press Shift+R three times; then type `30` in the Angle field | stored angle 135, then 30, with the desk's stored x and y unchanged; the plan element's CSS rotation is 30deg; the canvas re-rendered in the Styled style and in Blueprint |
| B11 | Store fixture F1 under the key and reload. Select Box B; press Shift+R three times; then three more times | at 0°: neither box has a conflict. At 45°: both rows read `Overlaps …` naming the other box. At 90°: no conflict |
| B12 | Store fixture F2 under the key and reload. Select Box C | four clearance lines, one per side, each along that side's normal. Their lengths in inches (pixel length divided by the layout scale, within 0.5): back 32 (ending on the cut-out wall `y = 84`), right 26, front 32, left 98. The back line's label is `2′ 8″` (`fmtLen(32, 'ft')`) |
| B13 | Continue from B12 (Box C selected): press R, switch units to metres, wait 1 s, reload | after the reload the stored outline has 6 corners, Box C's angle is 90, units are `m`, and there is no notice |
| B14 | Set the key to `{"schemaVersion":2,"items":"<img src=x onerror=alert(1)>"}` and reload | the seeded plan; the notice `Your saved plan could not be read, so the planner started fresh.`; no dialog opened; after 1 s the key is absent or parses as a valid plan |
| B15 | Set the key to the version 1 seeded document (from `git show 6ed5e96:room-planner/domain/catalog.ts`) and reload | the bed's stored centre is `(72, 42.5)` at angle 0 and the desk's `(131, 131.5)` at angle 90; no notice |
| B16 | Set the key to `{"schemaVersion":3}` and reload; move the bed; wait 1 s | the newer-version notice; the key still holds exactly `{"schemaVersion":3}` |
| B17 | Fresh. Move the bed, wait 1 s, `Reset plan`, confirm, wait 1 s, reload | the seeded plan; the key is absent or holds the seeded document |
| B18 | Network log for the whole session | every request's host is `localhost:3210`; no request body or URL contains `schemaVersion` |
| B19 | Fresh. Keyboard only: Tab to `Edit room`, Enter; Tab to the handle `Corner 1`, Enter, ArrowRight, Delete; Tab to `Done`, Enter; Tab to the bed, Enter, R, Shift+R | after each Tab step `document.activeElement` is the named control and its computed outline or box-shadow is not `none`; corner 1 moved 1 in in x, then the outline has 3 corners; the bed's angle is 105 |
| B20 | Fresh. `Edit room`. In each of: inset layout, split layout, tabs layout (2D tab), and a 900 px wide window | for every corner handle, the centre of its bounding box is within 2 px of the pane position computed from the stored corner and the layout; the stage element's `scrollWidth` equals its `clientWidth` and `scrollHeight` equals its `clientHeight` |
| B21 | Open `/` and `/papers` in the same session | both load with the console as on slice A (one `/favicon.ico` 404 on `/` only); `Object.keys(localStorage)` contains no key other than `room-planner:plan:v1` |

**Verify:** the record has exactly 21 rows, B1 to B21, each holding the measured
values its Expected cell names; the record is one table whose last column is `Result`, holding exactly `Pass` or `Fail`; `grep -cE "\| Pass \|$" <record>` prints 21 and `grep -cE "\| Fail \|$" <record>` prints 0;
`npm run check` → exit 0 on the final commit. The controller re-runs three rows of its
own choosing before accepting the record.
**Commit:** `docs(room-planner): record the room shape live check`
**Rollback:** `git revert` the commit(s).

## Task 21: Docs

**Spec:** project documentation rules in `CLAUDE.md` (docs kept current; mistakes log).

**Files:**
- Modify: `docs/room-planner/mistakes-and-fixes.md`
- Modify: `docs/room-planner/README.md`
- Modify: `README.md` (the Room Planner paragraph only)
- Modify: `CLAUDE.md` (the Room Planner section only)

**Interfaces:**
- Consumes: the task reports of Tasks 1 to 20 (the controller hands over their
  mistake entries) and the Task 20 record.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Mistakes log | every mistake reported by Tasks 1 to 20 | one entry each (what happened, root cause, fix, lesson) under `## 2026-11-13 — Room shape and saving` |
| Section docs | `docs/room-planner/README.md`, `README.md`, `CLAUDE.md` | each states: the room is an outline edited in "Edit room" mode; furniture rotates to any angle; the plan is saved in the browser under `room-planner:plan:v1`, validated on load, and never sent to a server. `docs/room-planner/README.md` links this plan, `docs/room-planner/plan-reviews/2026-11-13-room-shape-and-saving-review.md` and `docs/room-planner/verification/2026-11-13-room-shape-live-check.md` |
| Unrelated text | the rest of `README.md` and `CLAUDE.md` | every hunk of `git diff -U0 README.md CLAUDE.md` lies between that file's Room Planner heading and the next heading of the same level |

**Verify:** `grep -c "room-planner:plan:v1" docs/room-planner/README.md README.md CLAUDE.md`
→ at least 1 in each; `grep -c "Edit room"` on the same three files → at least 1 in each; `ls` of the three linked paths succeeds (the review file is written by the controller before execution starts);
`npm run check` → exit 0.
**Commit:** `docs(room-planner): describe the room editor and browser saving`
**Rollback:** `git revert` the commit.

## Done criteria

1. `npm run check` exits 0 on the branch head, with no skipped test.
2. Every row B1 to B21 in the Task 20 record has `Pass` in its Result column.
3. `git diff 6ed5e96 --stat -- app lib public components content package.json package-lock.json`
   is empty.
4. `npm audit --omit=dev` still reports 0 critical, 0 high, 0 moderate and 4 low.
5. `grep -rn "dangerouslySetInnerHTML\|window.confirm\|innerHTML" room-planner --include=*.ts --include=*.tsx`
   prints nothing outside test files.

## Spec traceability

| Spec item (Slice B row) | Task |
|---|---|
| Data: `room` is `{ outline, height }`, at least 3 corners, corners carry ids (Slice C amendment) | 1, 12 |
| Data: `schemaVersion` 2; version 1 converted on load | 12, 16; live B15 |
| Editing: "Edit room" mode; drag a corner; click a wall to add; Delete removes | 8, 13, 14; live B2, B3, B6 |
| Editing: corners snap to 1 in; walls snap to 15° unless Alt (decision 1) | 6, 13; live B5 |
| Plan addition, not in the spec: the two edge handles are removed (decision 3) | 7 |
| Plan addition, not in the spec: items are kept by their centre inside the bounding box instead of being clamped inside the room (decision 2) | 12 |
| Plan addition, not in the spec: `Loading your plan…` state, the notice and Plan-section wording, the stored-data limits in Task 16 (200 items, URL and text lengths, price and coordinate ranges), the 524288-character cap, and leaving a newer-version plan untouched instead of discarding it (decisions 6 to 8) | 16, 17, 18; live B16 |
| Exact sizes: wall list with lengths; typing moves the far corner | 6, 14; live B8 |
| Exact sizes: width and length inputs only while rectangular | 6, 12, 14; live B7 |
| Starting shapes: rectangle, L-shape, notched, one click | 6, 14; live B7 |
| Validity: crossing walls refused, drag stops, sidebar says why | 6, 13, 14; live B4 |
| Item rotation: any angle; R 90°, Shift+R 15°, angle field | 12, 15; live B10 |
| Fit checks: true rotated footprints, outside the outline, overlaps | 1, 12; live B9, B11 |
| Fit checks: clearance lines to the nearest wall | 3; live B12 |
| Views: plan, Styled 3D and Blueprint draw the outline; camera framed on the bounding box | 2, 3, 4, 5; live B2, B3, B20 |
| Saving: automatic, versioned key, loads on return | 17, 18; live B13 |
| Saving: stored data untrusted, validated, discarded with a notice | 16, 17, 18; live B14 |
| Saving: "Reset plan" with a confirmation | 19; live B17 |
| Saving: nothing sent to a server; no personal data stored | 17, 18; live B18 |
| Seam: `PlanStore` interface with one browser implementation (decision 6) | 17, 18 |
| Project rule (`CLAUDE.md`: docs kept current, mistakes log), no Slice B row | 21 |
| Verification of every row above in a browser | 20 |
