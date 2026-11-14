# Room Planner: Doors, Windows and Obstacles — Implementation Plan

> **For executors:** execute with soltero-skills:lean-sdd. The Task Dependency
> Table below is the scheduling and review-depth contract.

**Goal:** A room can carry doors and windows on its walls and fixed obstacles on its
floor; furniture that blocks a door or overlaps an obstacle is a conflict, and furniture
that covers a window gets a warning.

**Architecture:** Pure domain modules come first (opening geometry and the rule that
keeps an opening on its wall when the outline changes; obstacle geometry; the fit
checks). Then one task adds the two new lists to the stored plan (schema version 3).
Store operations, the plan view, the room editor, the sidebar and the two 3D views are
built on top, each reading resolved geometry through small accessor functions as
slice B's views do.

**Spec:** `docs/room-planner/specs/2026-11-13-portfolio-move-and-room-editor-design.md`,
section "Slice C: openings and obstacles" (a table; tasks cite its rows by their
first-column name) and "Delivery of B and C". Slice D (ceilings) is out of scope.

**Builds on:** slice B at commit `1a96c56` (plan
`docs/room-planner/plans/2026-11-13-room-shape-and-saving.md`).

**Tech stack / test runner:** Next.js 15.5, React 19, TypeScript 5.9, Zustand 5,
three 0.187, zod 4, Vitest 5 with jsdom and React Testing Library. One test file:
`npx vitest run <file>`. Everything: `npm run check`.

## Global Constraints

- Repo root is the portfolio repository. All paths are relative to it. Branch:
  `room-planner`. Never commit on `main`.
- Only files under `room-planner/` and `docs/room-planner/` change, plus `README.md`
  and `CLAUDE.md` in Task 14. Never edit `app/**`, `lib/**`, `public/**`,
  `components/**`, `content/**`, `package.json` or `package-lock.json`. No package is
  installed.
- All lengths are inches. Plan space: x right, y **down**. Angles are degrees
  clockwise on the plan in `[0, 360)`. Outline corners have positive signed area; for
  a wall from `a` to `b` the unit direction is `u = (b − a)/|b − a|` and the inward
  unit normal is `n = (−u.y, u.x)`. A wall's `id` is the `id` of its starting corner.
- Touching is not overlapping and not outside: geometric comparisons use
  `CONFIG.conflictEpsilon` (0.01). Stored numbers are rounded to 0.01 (`round2`).
- **Test first.** Each task's new or changed tests are written first and seen failing
  for the expected reason before the production edit; the report quotes the failing
  output. No existing test is deleted or weakened except where the task re-specifies
  its subject; the report lists each changed `expect(` line with the reason.
- Every task ends with `npm run check` exiting 0 (typecheck, lint, all tests passing
  with none skipped, build listing `/room-planner`). Tasks run strictly one at a
  time, in number order.
- **Pinned tests.** `room-planner/domain/catalog.test.ts` pins the whole `CONFIG`
  object: a task that adds constants adds exactly those to its expected object.
  `room-planner/styles/scoping.test.ts` scans every planner stylesheet: new rules use a
  planner class selector, no nesting; do not edit that test. Other pinned tests are
  named in the task that must update them.
- **One gate for stored data.** Nothing read from storage reaches the stores except
  through `parsePlan`. Every limit `parsePlan` enforces is also enforced when editing,
  from the same constant, and `room-planner/domain/planRoundTrip.test.ts` proves it.
- User-provided and stored strings (obstacle labels) are rendered as React text only.
  No `dangerouslySetInnerHTML`, no `window.confirm`, `alert` or `prompt`. No network
  calls, no secrets, no new storage key.
- Views read room, item, opening and obstacle geometry only through
  `room-planner/domain/shape.ts` and the accessor functions this plan adds.
- Every new interactive control is reachable by keyboard and has an accessible name.
  A control whose name changes with state has no `aria-pressed`.
- New tunable numbers go in `room-planner/config.ts` under the names this plan gives.
- Before changing a function's signature, search for every caller and every test of
  it (`grep -rn "<name>" room-planner`) and list them in the report.
- Stage explicit paths only. Never `git add -A`, `git add .` or `git commit -a`.
  Never stage, move or delete `Multiplayer_AI_Sprite.aseprite`. Stop a local server
  only by its port. Never run `next build` while a `next dev` server runs here.
- One commit per task, with the message the task gives. Record every mistake and its
  fix in the task report; Task 14 appends them to
  `docs/room-planner/mistakes-and-fixes.md` under
  `## 2026-11-14 — Openings and obstacles`.

## Decisions this plan makes that refine or add to the spec

1. **Field names follow the spec** (`offset`, `width`, `height`, `sill`, `rotation`,
   `depth`, `elevation`), although items use `w`, `d`, `h`, `angle`.
2. **Sizes allowed** (the spec gives defaults only): opening width 12 to 240; door and
   window height 12 to 240; sill 0 to 240; obstacle width and depth 1 to 240, height 1
   to 720, elevation 0 to 720; label 0 to 40 characters.
3. **Starting shapes are refused while the room has a door or window,** with the
   reason shown, because they replace every wall. The spec does not cover this case.
4. **Outline reversal.** When an edit flips the outline's order (possible when a
   corner is dragged across the opposite wall of a triangle), each opening stays on
   its physical wall: its `wallId` becomes the id of the wall's other end corner, its
   `offset` becomes `length − offset − width`, and a door's `hinge` flips.
5. **Rugs** are exempt from the door and obstacle checks, as they are from furniture
   overlap. The window warning applies to any furniture taller than the sill.
6. **Obstacles do not conflict with each other.** An obstacle is flagged only when it
   is partly outside the outline, taller than the room, or inside a door's reserved
   area.
7. **A door or window taller than the ceiling** (after the ceiling is lowered) is
   drawn up to the ceiling and flagged `Taller than the ceiling`; the ceiling edit is
   not refused.
8. **Placing.** `Add door` or `Add window` arms a tool; the next wall click places the
   opening centred on the click, moved along the wall to fit. While a tool is armed
   each wall row has a button that places it at the wall's midpoint (keyboard path).
   Escape disarms. `Add box` and `Add column` place at once, at the room's interior
   point.
9. **Warnings and obstacle flags are listed in the sidebar's Room section** (room
   mode) and item warnings beside the item in "In this room". The top-bar count
   includes furniture and obstacle conflicts and excludes warnings.
10. **Cylinders are drawn as 16-sided prisms** in the plan checks and the Blueprint
    view, and as true cylinders in the Styled view. A door's swing arc is checked as a
    polygon of 8 segments.
11. **The storage key is unchanged** (`room-planner:plan:v1`); the document's
    `schemaVersion` becomes 3 and a version 2 document loads with both lists empty.
13. **A raised obstacle's underside is drawn in the Blueprint view** when the camera
    is below it.
14. **An obstacle blocks a door only if it starts below the door's top**
    (`elevation < door.height`).
12. **Release gate.** Unchanged from slice B: the pull request merges once, after this
    slice's Done criteria hold and the owner approves.

## Amendment 1 (2026-11-14, controller notes applied after the plan review passed)

The review passed the plan (85.7) and listed minor points. These clarifications bind
the tasks named; they add no new scope.

1. **Warning colour (Tasks 8 and 10).** The design system has no amber token. Task 8
   adds two custom properties to the existing `.room-planner` rule that holds the
   colour tokens in `room-planner/styles/industry.css`: `--color-warning: #8a5300`
   (text and outlines) and `--color-warning-100: #fff1d0` (tag background). Task 8's
   file list therefore also includes `room-planner/styles/industry.css`, for that
   addition only. `.plan-item.is-warning` and `.item-row-warning` use them.
2. **Obstacles are hatched on the plan (Task 8).** `.plan-obstacle` has a diagonal
   hatch fill (a `repeating-linear-gradient`) as the spec says; a test asserts the
   class, and live row C14 records that the hatch is visible.
3. **Decision 9, corrected wording.** Flags on obstacles and openings are listed in
   the Room section's list in room mode. A furniture warning is shown beside the item
   in "In this room" (and as the amber outline on the plan), not in the Room section.
4. **Top-bar count.** `room-planner/components/TopBar.tsx` is not edited: it counts
   the keys of `useConflicts()`, which after Task 6 holds furniture, obstacle and
   opening conflicts, so all three are counted. Warnings are a separate map and are
   not counted.
5. **Blueprint underside (Task 12)** and the height condition in the obstacle
   `Blocks a door` rule (Task 4) are plan decisions, added here as decisions 13 and 14.
6. **Commits named.** `6ed5e96` is the reviewed head of slice A, the last commit
   before the planner's slices B and C; Done criterion 3 diffs against it to show
   that nothing outside the planner changed in either slice. `1a96c56` is the head of
   slice B, which this plan builds on.
7. **Version 3 and rollback.** Nothing ships before the single merge, so only
   developer browsers can hold a version 3 document. If this slice were reverted, the
   slice B code would treat such a document as "newer": it would leave it untouched,
   show the newer-version notice and not save. No feature flag is used; the version 2
   to version 3 load path is the compatibility step and is one-way.
8. **Live check, made deterministic (Task 13).**
   - Run it in a browser profile whose `localhost:3210` storage may be wiped.
   - C1: click the top wall at its midpoint (plan point `(72, 0)`); expected stored
     offset 56.
   - C2: expected unconditionally: the bed reads `Blocks a door`.
   - C7: before setting the sill, slide the window to offset 110 (ArrowRight, 44
     presses, or Shift+ArrowRight three times then eight single presses); expected
     unconditionally: the desk reads `Covers a window`.
   - C14 passes when: the stored document is unchanged by switching views; in the
     Styled view a pixel sampled at the door's projected centre differs from the wall
     colour sampled beside it, and likewise inside the window; in Blueprint the same
     two samples differ from the far-wall fill; the box and the column are visible in
     both screenshots.
   - "Visible focus style" means a computed `outline-style` other than `none`, or a
     non-`none` `box-shadow`, on the focused element.
   - The controller re-runs C2, C9 and C15; the record is accepted when each re-run's
     Result matches the recorded one.
9. **Task 14 inputs.** The handover file is
   `.soltero/lean-sdd/2026-11-14-openings-and-obstacles/mistakes-handover.md`; the
   review is `docs/room-planner/plan-reviews/2026-11-14-openings-and-obstacles-review.md`;
   the live record is `docs/room-planner/verification/2026-11-14-openings-live-check.md`.
   Its Verify also greps `docs/room-planner/README.md` for `door`, `window`,
   `schemaVersion` and each of the three link targets (at least one match each).
10. **Source files of consumed helpers.** `convexOverlap`, `convexInsidePolygon`,
    `interiorPoint`, `round2`: `room-planner/domain/polygon.ts`. `itemFootprint`,
    `footprintCorners`, `roomOutline`, `roomHeight`, `roomBounds`:
    `room-planner/domain/shape.ts`. `moveItem`, `storedAngle`:
    `room-planner/domain/geometry.ts`. `startDrag`: `room-planner/hooks/startDrag.ts`.
    The existing furniture-overlap rule and its text are in `conflictsAmong` in
    `room-planner/domain/conflicts.ts` (`OUTSIDE_THE_ROOM`, `Taller than the ceiling`,
    `Overlaps <name>`).
11. **Fix pass.** If Task 13 records a `Fail`, the controller dispatches one fix task
    ("Task 13b"), reviewed like any other, then re-runs the failed rows before Task 14.

## Amendment 2 (2026-11-14, controller ruling after the Task 2 review)

Task 2's rules rounded a re-homed offset with `round2`, which can round up by 0.005
and push an opening past the end of a diagonal wall, so a legitimate corner insert or
outline reversal was refused. Corrected rule: after an offset is recomputed by
`rehomeOpenings` (the reversed and corner-added cases), it is rounded and then clamped
into `[0, L − width]`, where `L` is the length of the opening's wall in the new
outline, rounded down to 0.01 with a tolerance for floating-point noise. The same
tolerant rounding-down is used wherever a width or an upper offset bound is derived
from a wall's length, so a wall exactly 12 in long takes a 12 in opening.

Refined on the same day after the first fix: the clamp absorbs rounding noise only. It
applies when the unrounded offset is within 0.01 in of `[0, L − width]`; an offset
farther outside is left as it is, so the opening is refused as `opening-off-wall`
(an edit that would squeeze an opening off its wall is refused, never turned into a
slide).

## Amendment 3 (2026-11-14, controller ruling during Task 5)

1. Task 5's file list also includes
   `room-planner/components/Sidebar/PlanSection.test.tsx`, whose helper spells out the
   document's keys: it gains `openings` and `obstacles` and changes in no other way.
2. When `parsePlan` reverses a stored outline that was given in negative order, the
   openings are carried onto their walls with `rehomeOpenings(given, normalised, openings)`
   before they are validated, so they stay on the same physical walls.

## Amendment 4 (2026-11-14, controller ruling during Task 9)

Task 8 added a test in `room-planner/components/Stage/PlanView.test.tsx` asserting that
no obstacle element is focusable in either mode. Task 9 makes obstacles buttons in room
mode, which re-specifies that assertion. Task 9's file list also includes
`PlanView.test.tsx` for that one test: door and window drawings are never focusable;
obstacles have `tabindex="0"` in room mode and no `tabindex` in furnish mode.

## Task Dependency Table

| Task | Files touched | Depends on | Risk tier |
|------|---------------|------------|-----------|
| 1. Types and limits | `room-planner/domain/types.ts`, `room-planner/config.ts`, `room-planner/domain/catalog.test.ts` | — | mechanical |
| 2. Opening geometry and wall re-homing | `room-planner/domain/openings.ts`, `room-planner/domain/openings.test.ts` | 1 | judgment |
| 3. Obstacle geometry | `room-planner/domain/obstacles.ts`, `room-planner/domain/obstacles.test.ts` | 1 | standard |
| 4. Fit checks | `room-planner/domain/conflicts.ts`, `room-planner/domain/conflicts.test.ts` | 2, 3 | judgment |
| 5. Stored plan version 3 | `room-planner/domain/types.ts`, `room-planner/domain/catalog.ts`, `room-planner/domain/catalog.test.ts`, `room-planner/domain/planSchema.ts`, `room-planner/domain/planSchema.test.ts`, `room-planner/state/planStore.ts`, `room-planner/state/stores.test.ts`, `room-planner/services/browserPlanStore.ts`, `room-planner/services/browserPlanStore.test.ts`, `room-planner/hooks/usePlanPersistence.ts`, `room-planner/hooks/usePlanPersistence.test.tsx`, `room-planner/test/fixtures.ts`, `room-planner/test/fixtures.test.ts`, `room-planner/test/fakePlanStore.ts`, `room-planner/domain/planRoundTrip.test.ts` | 2, 3 | judgment |
| 6. Plan store operations | `room-planner/state/planStore.ts`, `room-planner/state/stores.test.ts`, `room-planner/state/actions.ts`, `room-planner/state/selectors.ts`, `room-planner/components/Sidebar/RoomSection.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx`, `room-planner/components/Sidebar/WallList.tsx`, `room-planner/components/Sidebar/WallList.test.tsx`, `room-planner/domain/planRoundTrip.test.ts` | 4, 5 | judgment |
| 7. Editing state and actions | `room-planner/state/uiStore.ts`, `room-planner/state/actions.ts`, `room-planner/state/stores.test.ts` | 6 | standard |
| 8. Plan drawing | `room-planner/view/planLayout.ts`, `room-planner/view/planLayout.test.ts`, `room-planner/view/planFeatures.ts`, `room-planner/view/planFeatures.test.ts`, `room-planner/components/Stage/PlanView.tsx`, `room-planner/components/Stage/PlanView.test.tsx`, `room-planner/components/Stage/PlanFeatures.tsx`, `room-planner/components/Stage/PlanFeatures.test.tsx`, `room-planner/components/Stage/stage.css` | 6 | judgment |
| 9. Room editor interactions | `room-planner/components/Stage/RoomEditLayer.tsx`, `room-planner/components/Stage/RoomEditLayer.test.tsx`, `room-planner/components/Stage/PlanFeatures.tsx`, `room-planner/components/Stage/PlanFeatures.test.tsx`, `room-planner/components/Stage/stage.css`, `room-planner/hooks/useKeyboardShortcuts.ts`, `room-planner/hooks/useKeyboardShortcuts.test.tsx` | 7, 8 | judgment |
| 10. Sidebar | `room-planner/components/Sidebar/RoomFeatures.tsx`, `room-planner/components/Sidebar/RoomFeatures.test.tsx`, `room-planner/components/Sidebar/RoomSection.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx`, `room-planner/components/Sidebar/WallList.tsx`, `room-planner/components/Sidebar/WallList.test.tsx`, `room-planner/components/Sidebar/ItemList.tsx`, `room-planner/components/Sidebar/Sidebar.test.tsx`, `room-planner/components/Sidebar/sidebar.css`, `room-planner/components/Sidebar/itemList.css`, `room-planner/components/SelectionBar.tsx`, `room-planner/components/bars.test.tsx` | 7 | standard |
| 11. Styled 3D | `room-planner/three/roomMesh.ts`, `room-planner/three/roomMesh.test.ts`, `room-planner/three/obstacleMesh.ts`, `room-planner/three/obstacleMesh.test.ts`, `room-planner/three/SceneRenderer.ts`, `room-planner/three/SceneRenderer.test.ts`, `room-planner/components/Stage/ThreeView.tsx`, `room-planner/components/Stage/ThreeView.test.tsx` | 6 | judgment |
| 12. Blueprint | `room-planner/view/blueprintScene.ts`, `room-planner/view/blueprintScene.test.ts`, `room-planner/view/blueprintDraw.ts`, `room-planner/view/blueprintDraw.test.ts`, `room-planner/components/Stage/BlueprintView.tsx`, `room-planner/components/Stage/BlueprintView.test.tsx` | 6, 11 | judgment |
| 13. Live verification | `docs/room-planner/verification/2026-11-14-openings-live-check.md`, `docs/room-planner/verification/shots-openings/` | 9, 10, 11, 12 | judgment |
| 14. Docs | `docs/room-planner/mistakes-and-fixes.md`, `docs/room-planner/README.md`, `README.md`, `CLAUDE.md` | 13 | mechanical |

**Execution order: strictly serial, 1 to 14 in number order.** Every task ends with
`npm run check`, which runs `next build`; no two tasks may run at once. Task 13
changes no code: a defect it finds is recorded as `Fail` with reproduction steps and
fixed by the controller's fix pass, after which the affected rows are re-run.

---

## Task 1: Types and limits

**Spec:** Slice C rows "Door", "Window", "Obstacle", "Saving" (the caps).

**Files:**
- Modify: `room-planner/domain/types.ts` (additions only)
- Modify: `room-planner/config.ts`
- Modify: `room-planner/domain/catalog.test.ts` (the pinned config object only)

**Interfaces:**
- Produces, in `types.ts`:
  - `export interface Door { id: string; kind: 'door'; wallId: string; offset: number; width: number; height: number; hinge: 'start' | 'end'; swing: 'in' | 'out' }`
  - `export interface WindowOpening { id: string; kind: 'window'; wallId: string; offset: number; width: number; sill: number; height: number }`
  - `export type Opening = Door | WindowOpening`
  - `export interface Obstacle { id: string; shape: 'box' | 'cylinder'; label: string; x: number; y: number; rotation: number; width: number; depth: number; height: number; elevation: number }` (`x`, `y` are the centre; a cylinder's diameter is `width`, and its `depth` equals its `width`)
  - `export type RoomTool = 'corner' | 'door' | 'window'`
  - `export interface PlanIssues { conflicts: Conflicts; warnings: Conflicts }`
- Produces, in `config.ts`: `maxOpenings: 64`, `maxObstacles: 64`,
  `openingWidthMin: 12`, `openingWidthMax: 240`, `openingHeightMin: 12`,
  `openingHeightMax: 240`, `sillMax: 240`, `obstacleSizeMin: 1`,
  `obstacleSizeMax: 240`, `obstacleHeightMax: 720`, `obstacleLabelMax: 40`,
  `doorClearDepth: 24`, `windowZoneDepth: 6`, `arcSegments: 8`,
  `cylinderSegments: 16`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Types compile | a `Door`, a `WindowOpening` and an `Obstacle` literal in a type-level test or a `satisfies` expression in `catalog.test.ts` | `npm run typecheck` passes; a literal with `kind: 'gate'` fails to compile (checked with `// @ts-expect-error`) |
| Config pinned | `catalog.test.ts`'s expected `CONFIG` | contains exactly the 15 new constants with the values above; the test passes |
| Nothing else | `PlanDocument`, every existing type | unchanged in this task |

**Verify:** `npx vitest run room-planner/domain/catalog.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): add opening and obstacle types and limits`
**Rollback:** `git revert` the commit.

## Task 2: Opening geometry and wall re-homing

**Spec:** Slice C rows "Door", "Window", "Opening validity", "Placing" (snap to 1 in).

Pure functions. No store, no DOM.

**Files:**
- Create: `room-planner/domain/openings.ts`
- Create: `room-planner/domain/openings.test.ts`

**Interfaces:**
- Consumes: `Opening`, `Door`, `WindowOpening` (Task 1); `Corner`, `Point`;
  `wallsOf`, `Wall` from `room-planner/domain/outline.ts`; `round2`; `CONFIG`.
- Produces:
  - `export type OpeningProblem = 'opening-off-wall' | 'opening-overlap' | 'opening-size' | 'too-many-openings' | 'corner-in-opening' | 'corner-has-openings' | 'shape-has-openings'`
  - `export const OPENING_PROBLEM_TEXT: Readonly<Record<OpeningProblem, string>>`
  - `export type OpeningsResult = { ok: true; openings: Opening[] } | { ok: false; problem: OpeningProblem }`
  - `export const DOOR_DEFAULTS: Readonly<{ width: 32; height: 80; hinge: 'start'; swing: 'in' }>`
  - `export const WINDOW_DEFAULTS: Readonly<{ width: 36; sill: 36; height: 48 }>`
  - `export interface OpeningSpan { a: Point; b: Point; u: Point; n: Point; wallIndex: number }` (`a`, `b` are the opening's two ends on its wall, `a` nearer the wall's start; `u` the wall's unit direction; `n` its inward unit normal)
  - `openingSpan(outline: readonly Corner[], opening: Opening): OpeningSpan | null` (`null` when the wall id is not in the outline)
  - `validateOpenings(outline: readonly Corner[], openings: readonly Opening[]): OpeningProblem | null`
  - `addOpening(outline: readonly Corner[], openings: readonly Opening[], kind: 'door' | 'window', wallId: string, at: Point, newId: string): OpeningsResult`
  - `slideOpening(outline: readonly Corner[], openings: readonly Opening[], id: string, offset: number): OpeningsResult`
  - `updateOpening(outline: readonly Corner[], openings: readonly Opening[], id: string, patch: Partial<Pick<Door, 'width' | 'height' | 'hinge' | 'swing'>> | Partial<Pick<WindowOpening, 'width' | 'height' | 'sill'>>): OpeningsResult`
  - `removeOpening(openings: readonly Opening[], id: string): Opening[]`
  - `rehomeOpenings(before: readonly Corner[], after: readonly Corner[], openings: readonly Opening[]): OpeningsResult`

**Exact values:**

`OPENING_PROBLEM_TEXT`:

| Problem | Text |
|---|---|
| `opening-off-wall` | `That would leave a door or window without room on its wall.` |
| `opening-overlap` | `Doors and windows cannot overlap.` |
| `opening-size` | `That size is not allowed.` |
| `too-many-openings` | `A room can have at most 64 doors and windows.` |
| `corner-in-opening` | `A corner cannot go inside a door or window.` |
| `corner-has-openings` | `Remove the doors and windows on these walls first.` |
| `shape-has-openings` | `Remove the doors and windows before starting from a shape.` |

Rules:
- An opening **fits** when `offset ≥ 0` and `offset + width ≤ wall length`, both
  within `LIMIT_SLACK`. Two openings on one wall **overlap** when their
  `[offset, offset + width]` intervals share more than `conflictEpsilon`.
- `validateOpenings` reports, in this order: `too-many-openings` (more than
  `maxOpenings`), `opening-size` (any width, height or sill outside the Task 1 limits,
  or not finite), `opening-off-wall` (unknown `wallId` or not fitting), then
  `opening-overlap`.
- `addOpening`: the new opening has the kind's defaults; its width is the default, or
  the wall's length if the wall is shorter than the default but at least
  `openingWidthMin`; its offset is `round(t − width/2)` where `t` is the distance of
  `at`'s projection along the wall, then clamped into `[0, length − width]`; the
  result is validated.
- `slideOpening`: the offset is rounded to 1 in and clamped into
  `[0, length − width]`; refused with `opening-overlap` if it would overlap another.
- `rehomeOpenings` compares the corner ids of `before` and `after`:
  - **Same ids, same order:** openings keep `wallId` and `offset`; validated on `after`.
  - **Same ids, reversed order** (`after` is `before` reversed): an opening on the
    wall from `A` to `B` gets `wallId = B.id`, `offset = round2(length − offset − width)`
    with the new length, and a door's `hinge` flips; then validated.
  - **One id added** (`N`, between `A` and `B` where `before` had the wall `A→B`),
    with `t = |N − A|`: an opening on wall `A` with `offset + width ≤ t` stays; with
    `offset ≥ t` it gets `wallId = N.id`, `offset = round2(offset − t)`; otherwise the
    result is `corner-in-opening`. Then validated.
  - **One id removed** (`C`, whose previous corner is `P`): if any opening is on wall
    `P` or wall `C` the result is `corner-has-openings`; otherwise unchanged.
  - **Anything else** (ids replaced): `shape-has-openings` if `openings` is not empty;
    otherwise `ok` with the empty list.
  - With no openings every case is `ok` with the empty list.

**Behavior** (room `R` = corners `c1 (0,0)`, `c2 (144,0)`, `c3 (144,168)`,
`c4 (0,168)`; door `D1` = `{ id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' }`):

| Case | Input / state | Expected |
|------|---------------|----------|
| Span on the top wall | `openingSpan(R, D1)` | `a (20,0)`, `b (52,0)`, `u (1,0)`, `n (0,1)`, `wallIndex 0` |
| Span on the left wall | an opening on `c4`, offset 60, width 32 | `a (0,108)`, `b (0,76)`, `u (0,−1)`, `n (1,0)`, `wallIndex 3` |
| Span, unknown wall | `wallId: 'zz'` | `null` |
| Valid | `R`, `[D1]` | `validateOpenings` → `null` |
| Flush at the wall's end | offset 112, width 32 on `c1` (ends at 144) | `null` |
| Off the wall | offset 113, width 32 on `c1` | `opening-off-wall` |
| Negative offset | offset −1 | `opening-off-wall` |
| Overlap | `D1` and a window on `c1` at offset 50, width 36 | `opening-overlap` |
| Touching | `D1` and a window on `c1` at offset 52 | `null` |
| Size | width 11; width 241; door height 11; sill 241; width `NaN` | each `opening-size` |
| Too many | 65 valid openings | `too-many-openings` |
| Add a door | `addOpening(R, [], 'door', 'c1', (72, 5), 'n1')` | one door: `wallId 'c1'`, `offset 56` (72 − 16), `width 32`, `height 80`, `hinge 'start'`, `swing 'in'`, `id 'n1'` |
| Add near the wall's end | `at (140, 0)` | `offset 112` (clamped) |
| Add a window | `'window'`, `'c2'`, `at (144, 118)` | `wallId 'c2'`, `offset 100` (118 − 18), `width 36`, `sill 36`, `height 48` |
| Add on a short wall | a wall 20 long, door | `width 20`, `offset 0` |
| Add on a wall under 12 | a wall 10 long | `opening-off-wall` |
| Add where it overlaps | `[D1]`, door at `(40, 0)` (offset 24) | `opening-overlap` |
| Add, 65th | 64 openings | `too-many-openings` |
| Slide | `slideOpening(R, [D1], 'd1', 60.4)` | offset 60 |
| Slide past the end | offset 500 | offset 112 |
| Slide into another | `D1` and a window at offset 60 width 36; slide `d1` to 40 | `opening-overlap` |
| Update | `updateOpening(R, [D1], 'd1', { width: 36, hinge: 'end' })` | width 36, hinge `'end'`, other fields unchanged |
| Update too wide | `{ width: 130 }` (20 + 130 > 144) | `opening-off-wall` |
| Unknown id | slide or update of an id not in the list | `ok` with the list unchanged |
| Remove | `removeOpening([D1], 'd1')` | `[]`; an unknown id returns an equal list |
| Re-home, corner moved | `before R`, `after` = `R` with `c2` at `(100, 0)`, `[D1]` | `ok`, `D1` unchanged |
| Re-home, wall too short | `c2` moved to `(50, 0)` (length 50 < 52) | `opening-off-wall`; moved to `(52, 0)` → `ok` |
| Re-home, corner added after | `after` inserts `n1 (60, 0)` between `c1` and `c2` | `D1` stays on `c1`, offset 20 |
| Re-home, corner added before | `after` inserts `n1 (10, 0)` | `D1`: `wallId 'n1'`, offset 10 |
| Re-home, corner inside | `after` inserts `n1 (40, 0)` | `corner-in-opening` |
| Re-home, corner removed | `after` = `R` without `c2`; `D1` on `c1` | `corner-has-openings`; the same removal with `D1` on `c3` → `ok`, unchanged |
| Re-home, reversed | `before` = `t1 (0,0)`, `t2 (100,0)`, `t3 (0,100)`; door on `t1`, offset 10, width 30, hinge `'start'`; `after` = `[t3 (0,−100), t2 (100,0), t1 (0,0)]` | `wallId 't2'`, `offset 60` (100 − 10 − 30), hinge `'end'` |
| Re-home, replaced | `after` has all-new ids, `[D1]` | `shape-has-openings`; with `[]` → `ok`, `[]` |
| Immutability | every function | never mutates its inputs; untouched openings are returned with equal values |

**Verify:** `npx vitest run room-planner/domain/openings.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): add door and window geometry`
**Rollback:** `git revert` the commit.

## Task 3: Obstacle geometry

**Spec:** Slice C rows "Obstacle", "Placing".

**Files:**
- Create: `room-planner/domain/obstacles.ts`
- Create: `room-planner/domain/obstacles.test.ts`

**Interfaces:**
- Consumes: `Obstacle` (Task 1); `Footprint`, `footprintCorners` (`shape.ts`);
  `Bounds`, `Point`; `storedAngle` (`geometry.ts`); `round2`; `CONFIG`.
- Produces:
  - `export type ObstacleProblem = 'obstacle-size' | 'too-many-obstacles'`
  - `export const OBSTACLE_PROBLEM_TEXT: Readonly<Record<ObstacleProblem, string>>`
  - `export type ObstaclesResult = { ok: true; obstacles: Obstacle[] } | { ok: false; problem: ObstacleProblem }`
  - `obstacleFootprint(o: Obstacle): Footprint` (`{ cx: x, cy: y, w: width, d: depth, angle: rotation }`)
  - `obstaclePolygon(o: Obstacle): Point[]` (a box's four `footprintCorners`; a cylinder's `CONFIG.cylinderSegments` points on its circle, the first at angle 0 from the centre, going clockwise on the plan)
  - `validateObstacles(obstacles: readonly Obstacle[]): ObstacleProblem | null`
  - `newObstacle(shape: 'box' | 'cylinder', at: Point, roomHeight: number, newId: string): Obstacle`
  - `addObstacle(obstacles: readonly Obstacle[], obstacle: Obstacle): ObstaclesResult`
  - `moveObstacle(o: Obstacle, x: number, y: number, bounds: Bounds, snap: number): Obstacle` (the same rule as `moveItem`: the footprint's bounding-box minimum corner snaps to the grid, then the centre is clamped into the bounds)
  - `shiftObstacle(o: Obstacle, dx: number, dy: number, bounds: Bounds): Obstacle` (exact step, clamped)
  - `updateObstacle(obstacles: readonly Obstacle[], id: string, patch: Partial<Pick<Obstacle, 'label' | 'rotation' | 'width' | 'depth' | 'height' | 'elevation'>>): ObstaclesResult`

**Exact values:**

| Problem | Text |
|---|---|
| `obstacle-size` | `That size is not allowed.` |
| `too-many-obstacles` | `A room can have at most 64 obstacles.` |

`newObstacle`: box → `label 'Box'`, `width 24`, `depth 24`, `height 36`,
`elevation 0`, `rotation 0`; cylinder → `label 'Column'`, `width 12`, `depth 12`,
`height` = `roomHeight`, `elevation 0`, `rotation 0`; both centred at `at` rounded to
0.01.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Footprint | box at `(30, 130)`, 20 × 10, rotation 90 | `{ cx 30, cy 130, w 20, d 10, angle 90 }` |
| Box polygon | the same box | the four corners `footprintCorners` gives |
| Cylinder polygon | cylinder at `(50, 50)`, width 12 | 16 points, each 6 from `(50, 50)`; the first is `(56, 50)`; positive signed area |
| Valid | a default box and a default column for a 96 in room | `validateObstacles` → `null` |
| Sizes | width 0.5; width 241; depth 241; height 721; elevation −1; elevation 721; any `NaN` | each `obstacle-size` |
| Label | 41 characters | `obstacle-size`; 40 characters and the empty string are valid |
| Cylinder shape | a cylinder whose `depth` differs from its `width` | `obstacle-size` |
| Too many | 65 obstacles | `too-many-obstacles` |
| Add | `addObstacle([], newObstacle('box', (72, 84), 96, 'o1'))` | `ok`, one obstacle with the box defaults at `(72, 84)` |
| Add, 65th | 64 obstacles | `too-many-obstacles` |
| Move snaps | default box (24 × 24) moved to `(30.4, 50.6)` in bounds `0..144 × 0..168` | centre `(30, 51)` (min corner `(18.4, 38.6)` → `(18, 39)`) |
| Move clamps | moved to `(−50, 900)` | centre `(0, 168)` |
| Shift | `shiftObstacle(o, 1, 0, bounds)` | x increases by exactly 1 |
| Update | `{ elevation: 40, label: 'AC unit' }` | both set; other fields unchanged |
| Update a cylinder's width | `{ width: 18 }` on a cylinder | `width 18` and `depth 18` |
| Update rotation | `{ rotation: 450 }` | `rotation 90` (`storedAngle`) |
| Update refused | `{ height: 0 }` | `obstacle-size` |
| Unknown id | update of an id not in the list | `ok`, list unchanged |
| Immutability | every function | never mutates its inputs |

**Verify:** `npx vitest run room-planner/domain/obstacles.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): add obstacle geometry`
**Rollback:** `git revert` the commit.

## Task 4: Fit checks

**Spec:** Slice C rows "Door check", "Window check", "Obstacle check".

**Files:**
- Modify: `room-planner/domain/conflicts.ts`
- Modify: `room-planner/domain/conflicts.test.ts`

**Interfaces:**
- Consumes: `openingSpan` (Task 2); `obstaclePolygon` (Task 3); `convexOverlap`,
  `convexInsidePolygon`; `itemFootprint`, `footprintCorners`, `roomOutline`,
  `roomHeight`; `PlanIssues` (Task 1).
- Produces:
  - `doorReservedArea(door: Door, outline: readonly Corner[]): Point[] | null` (a convex polygon; `null` for an unknown wall)
  - `windowZone(win: WindowOpening, outline: readonly Corner[]): Point[] | null`
  - `findPlanIssues(items: readonly Item[], room: Room, openings: readonly Opening[], obstacles: readonly Obstacle[]): PlanIssues`
  - `findConflicts(items, room)` keeps its signature and returns
    `findPlanIssues(items, room, [], []).conflicts`.
  - `export const BLOCKS_A_DOOR = 'Blocks a door'`,
    `export const COVERS_A_WINDOW = 'Covers a window'`.

**Rules:**
- `doorReservedArea`, with the span's `a`, `b`, `u`, `n` and `w = door.width`:
  - swing `'in'`, hinge `'start'`: the polygon `a`, then `CONFIG.arcSegments + 1`
    points `a + w·(cos θ·u + sin θ·n)` for θ from 0° to 90° in equal steps.
  - swing `'in'`, hinge `'end'`: `b`, then points `b + w·(−cos θ·u + sin θ·n)`, θ from
    0° to 90°; the point order is then reversed so the area stays positive.
  - swing `'out'`: the rectangle `a`, `b`, `b + 24·n`, `a + 24·n`
    (`CONFIG.doorClearDepth`).
- `windowZone`: the rectangle `a`, `b`, `b + 6·n`, `a + 6·n`
  (`CONFIG.windowZoneDepth`).
- Per furniture item, the first failing check is its only conflict, in this order:
  outside the outline; taller than the ceiling; overlaps another non-rug item
  (existing rules and text); overlaps an obstacle — footprints overlap
  (`convexOverlap` with `obstaclePolygon`) **and** `item.h > obstacle.elevation + ε`
  — reason `Overlaps <label>`, or `Overlaps an obstacle` when the label is empty, for
  the first such obstacle in list order; inside a door's reserved area
  (`convexOverlap`) — reason `Blocks a door`. Rugs skip the last three.
- Per furniture item, independently of conflicts: `warnings[item.id]` is
  `Covers a window` when its footprint overlaps some window's zone and
  `item.h > window.sill + ε`.
- Per obstacle, the first failing check is its only conflict:
  `Outside the room` (its polygon is not inside the outline); `Taller than the ceiling`
  (`elevation + height > room height + ε`); `Blocks a door` (its polygon overlaps a
  door's reserved area and `elevation < door.height − ε`).
- Per opening: `conflicts[opening.id]` is `Taller than the ceiling` when a door's
  `height`, or a window's `sill + height`, exceeds the room height by more than ε.
- Ids of items, obstacles and openings share one `conflicts` map.

**Behavior** (room `R` as in Task 2, height 96; seed bed = footprint centre
`(72, 42.5)`, 64 × 85, angle 0, `h 38`; seed desk = centre `(131, 131.5)`, 55 × 26,
angle 90, `h 30`):

| Case | Input / state | Expected |
|------|---------------|----------|
| Existing behaviour | every existing `findConflicts` and `conflictsAmong` test | passes unchanged |
| Reserved area, in, hinge start | `D1` (wall `c1`, offset 20, width 32) | 10 points: `(20,0)`, then `(52,0)` … `(20,32)`; the point at 45° is `(42.627, 22.627)`; positive signed area |
| Reserved area, in, hinge end | `D1` with hinge `'end'` | contains `(52,0)`, `(20,0)` and `(52,32)`; the 45° point is `(29.373, 22.627)`; positive signed area |
| Reserved area, out | `D1` with swing `'out'` | `(20,0) (52,0) (52,24) (20,24)` |
| Window zone | window on `c2`, offset 100, width 36 | `(144,100) (144,136) (138,136) (138,100)` |
| Bed blocks the door | seed bed, `[D1]` | `conflicts['seed-bed']` is `Blocks a door` |
| Door clear of furniture | a door on `c4`, offset 60, width 32 (arc reaches x = 32); seed bed and desk | no conflict for either |
| Door swinging out | `D1` with swing `'out'`; seed bed (x 40–104, y 0–85) | `Blocks a door` (the strip x 20–52, y 0–24 overlaps the bed) |
| Rug in the arc | a rug overlapping `D1`'s arc | no conflict |
| Window not covered | window on `c2` offset 100 width 36 sill 36; seed desk (`h 30`) | no warning |
| Window covered | the same window with sill 24 | `warnings['seed-desk']` is `Covers a window`; `conflicts['seed-desk']` is absent |
| Window, furniture away | sill 24, an item taller than the sill whose footprint ends at x = 137.9 | no warning |
| Obstacle overlap | box 20 × 20 × 30 at `(72, 42.5)`, elevation 0, label `Radiator` | `conflicts['seed-bed']` is `Overlaps Radiator` |
| Obstacle, empty label | the same with label `''` | `Overlaps an obstacle` |
| Raised obstacle, furniture fits under | the box at elevation 40 (bed `h 38`) | no conflict |
| Raised obstacle, furniture too tall | the box at elevation 30 | `Overlaps Radiator` |
| Check order | a 20 × 20 × 30 item named `Crate` at `(72, 42.5)` listed after the seed bed, plus the `Radiator` box and `D1` | `conflicts['seed-bed']` is `Overlaps Crate` (furniture overlap comes before the obstacle and door checks) |
| Obstacle outside | a box centred at `(140, 84)`, 24 wide | `conflicts[<its id>]` is `Outside the room` |
| Obstacle too tall | height 60, elevation 40 in the 96 in room | `Taller than the ceiling`; height 56 → no conflict |
| Obstacle in a door's arc | a column at `(36, 14)` with `D1` | `Blocks a door` |
| Raised obstacle above the door | a box in the arc with elevation 80 (`D1` height 80) | no conflict |
| Opening too tall | a door of height 100 in the 96 in room | `conflicts[<door id>]` is `Taller than the ceiling` |
| Unknown wall | an opening whose `wallId` is not in the outline | ignored by every check; no throw |
| Empty lists | `findPlanIssues(items, room, [], [])` | `conflicts` equals `findConflicts(items, room)`; `warnings` is `{}` |

**Verify:** `npx vitest run room-planner/domain/conflicts.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): check furniture against doors, windows and obstacles`
**Rollback:** `git revert` the commit.

## Task 5: Stored plan version 3

**Spec:** Slice C rows "Data", "Saving".

Adds `openings` and `obstacles` to the stored document and to everything that
serialises, validates, compares or seeds it. No UI.

**Files:**
- Modify: `room-planner/domain/types.ts`
- Modify: `room-planner/domain/catalog.ts`, `room-planner/domain/catalog.test.ts`
- Modify: `room-planner/domain/planSchema.ts`, `room-planner/domain/planSchema.test.ts`
- Modify: `room-planner/state/planStore.ts`, `room-planner/state/stores.test.ts`
- Modify: `room-planner/services/browserPlanStore.ts`, `room-planner/services/browserPlanStore.test.ts`
- Modify: `room-planner/hooks/usePlanPersistence.ts`, `room-planner/hooks/usePlanPersistence.test.tsx`
- Modify: `room-planner/test/fixtures.ts`, `room-planner/test/fixtures.test.ts`
- Modify: `room-planner/test/fakePlanStore.ts`
- Modify: `room-planner/domain/planRoundTrip.test.ts`

**Interfaces:**
- Consumes: `validateOpenings` (Task 2), `validateObstacles` (Task 3), the Task 1
  limits.
- Changes: `PlanDocument` becomes
  `{ schemaVersion: 3; units: Units; room: Room; items: Item[]; openings: Opening[]; obstacles: Obstacle[] }`.
- `createInitialDocument()` returns `schemaVersion: 3`, `openings: []`, `obstacles: []`
  and is otherwise unchanged.
- `parsePlan` accepts versions 1, 2 and 3; `newer` is true only for an integer above 3.
- `planDoc(room, items, units?, openings?, obstacles?)` in `fixtures.ts` builds a
  version 3 document (the two lists default to empty).
- The plan store's state gains `openings` and `obstacles` (no operations yet);
  `reset(doc?)` and the internal document-fields helper carry all six fields.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Seed | `createInitialDocument()` | `schemaVersion 3`, `openings []`, `obstacles []`; room and items as before |
| Valid version 3 | the seed after a JSON round trip | `ok`, deep-equal |
| Version 2 | the version 2 seed (the seed with `schemaVersion: 2` and without the two lists) | `ok`, deep-equal to `createInitialDocument()` |
| Version 1 | the version 1 seed used by the existing test | `ok`, deep-equal to `createInitialDocument()` |
| Newer | `schemaVersion: 4` | `ok: false`, `newer: true`; `3.5`, `'3'`, `−1` → `newer: false` |
| Key lists | the parsed document's keys | `['schemaVersion','units','room','items','openings','obstacles']`; a door's keys `['id','kind','wallId','offset','width','height','hinge','swing']`; a window's `['id','kind','wallId','offset','width','sill','height']`; an obstacle's `['id','shape','label','x','y','rotation','width','depth','height','elevation']` |
| Valid door, window, obstacle | a version 3 document with `D1` (Task 2), a window on `c2` (offset 100, width 36, sill 36, height 48) and a default box | `ok`, deep-equal after a round trip |
| Unknown fields | extra keys on an opening or obstacle, including `__proto__` | dropped; plain prototypes |
| Opening rules | an opening on an unknown wall; one off its wall; two overlapping; 65 openings; width 11; `kind: 'gate'`; `hinge: 'left'`; a window given `hinge` | `ok: false` for each except the last, where the extra key is dropped |
| Obstacle rules | 65 obstacles; width 241; elevation −1; label of 41 characters; `shape: 'cone'`; a cylinder with `depth ≠ width`; `x` of 1441; non-finite numbers; a numeric string | `ok: false` for each |
| Ids | an opening id equal to an obstacle id or an item id or a corner id | `ok: false` (`duplicate-id`): ids are unique across corners, items, openings and obstacles |
| Rotation stored | obstacle `rotation: 450` | stored `90` |
| Reason is safe | a marker string in an obstacle label, an opening key name and a `wallId` | the reason never contains it; it matches the existing reason format; new field names (`openings`, `obstacles`, `wallId`, `offset`, `width`, `depth`, `sill`, `hinge`, `swing`, `shape`, `rotation`, `elevation`) appear by name, not as `?` |
| Never throws | the existing hostile sweep, extended with 10 hostile opening and obstacle inputs | `ok: false`, no throw |
| Save writes six fields | `browserPlanStore.save(doc)` | the stored JSON's keys are the six document fields; a document with an invalid opening is not written (returns `false`) |
| Autosave sees the lists | replacing `openings` or `obstacles` in the store by reference | one debounced `save` with all six fields; an unchanged reference causes none |
| Loaded plan applied | a loaded version 3 document with one door | the store holds that door; no save results from the load |
| Reset | `reset()` | all six fields equal the seed |
| Pinned tests | `catalog.test.ts` (seed), `planSchema.test.ts` (key lists, version rows), `browserPlanStore.test.ts` and `usePlanPersistence.test.tsx` (saved keys), `stores.test.ts` (`docOf`) | updated to six fields and version 3; each changed `expect(` line is listed in the report |
| Round trip | `planRoundTrip.test.ts` | every existing step still passes with version 3 |

**Verify:** `npx vitest run room-planner/domain room-planner/services room-planner/hooks room-planner/state room-planner/test`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): store doors, windows and obstacles in the plan`
**Rollback:** `git revert` the commit, after reverting later tasks in reverse order.

## Task 6: Plan store operations

**Spec:** Slice C rows "Opening validity", "Placing", "Door check", "Window check",
"Obstacle check" (the store and selector side).

**Files:**
- Modify: `room-planner/state/planStore.ts`, `room-planner/state/stores.test.ts`
- Modify: `room-planner/state/actions.ts`
- Modify: `room-planner/state/selectors.ts`
- Modify: `room-planner/components/Sidebar/RoomSection.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx`
- Modify: `room-planner/components/Sidebar/WallList.tsx`, `room-planner/components/Sidebar/WallList.test.tsx`
- Modify: `room-planner/domain/planRoundTrip.test.ts`

**Interfaces:**
- Consumes: Tasks 2 to 5.
- Changes, in `planStore.ts`:
  - `export type RoomProblem = OutlineProblem | OpeningProblem | ObstacleProblem`
  - `export const ROOM_PROBLEM_TEXT: Readonly<Record<RoomProblem, string>>` (the three text tables merged)
  - `applyOutline(result: OutlineResult): RoomProblem | null` — **was `boolean`**. `null` means accepted. A refused `result` returns its problem. An accepted outline is passed with the stored openings to `rehomeOpenings`; if that refuses, nothing changes and its problem is returned; otherwise the outline and the re-homed openings are stored together (one state update). An outline equal to the stored one writes nothing and returns `null`.
  - `applyOpenings(result: OpeningsResult): RoomProblem | null`
  - `applyObstacles(result: ObstaclesResult): RoomProblem | null`
  - `moveObstacleTo(id: string, x: number, y: number): void`, `moveObstacleBy(id: string, dx: number, dy: number): void` (through `moveObstacle` / `shiftObstacle` with `roomBounds` and `CONFIG.furnitureSnap`; unknown ids and non-finite input ignored; no change → same state object)
  - `removeOpening(id: string): void`, `removeObstacle(id: string): void`
- Changes, in `selectors.ts`: `useConflicts()` returns
  `findPlanIssues(items, room, openings, obstacles).conflicts`; new
  `useWarnings(): Conflicts` returns `.warnings`; both memoised on the four
  references, sharing one computation.
- Changes, in `actions.ts`: the private `applyRoomEdit` helper sets `roomProblem` from
  `ROOM_PROBLEM_TEXT[problem]` or clears it; its callers are unchanged in behaviour.
- `RoomSection.tsx` and `WallList.tsx`: every `applyOutline` caller reads the new
  return value (`null` = accepted) and shows `ROOM_PROBLEM_TEXT[problem]`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Callers found | `grep -rn "applyOutline" room-planner` | every production caller and test updated; the list is in the report |
| Outline accepted | `applyOutline(moveCorner(outline, 'c3', (160, 180)))` with no openings | `null`; outline stored |
| Outline refused by the outline rules | a crossing move | `'crossing'`; nothing changes |
| Corner move keeps a door | store has `D1`; move `c2` to `(100, 0)` | `null`; `D1` unchanged |
| Corner move squeezes a door | move `c2` to `(50, 0)` | `'opening-off-wall'`; outline and openings unchanged (same state object) |
| Wall length squeezes a door | `setWallLength(outline, 'c1', 40)` | `'opening-off-wall'` |
| Rectangle width squeezes a door | `setRectangleSize(outline, { w: 48 })` | `'opening-off-wall'` |
| Corner added on a door's wall | `insertCorner(outline, 'c1', (10, 0), 'n1')` | `null`; `D1` now `wallId 'n1'`, offset 10; outline and openings change in one update (one subscriber notification) |
| Corner added inside a door | `insertCorner(outline, 'c1', (40, 0), 'n1')` | `'corner-in-opening'` |
| Corner removed beside a door | `removeCorner(outline, 'c2')` | `'corner-has-openings'` |
| Starting shape with a door | an outline of all-new ids | `'shape-has-openings'`; with no openings → `null` |
| Sidebar shows the reason | each refusal above through the sidebar or the plan actions | `roomProblem` is the matching text from `ROOM_PROBLEM_TEXT` |
| Openings applied | `applyOpenings(addOpening(outline, openings, 'door', 'c1', (72, 5), id))` | `null`; one door stored |
| Openings refused | an `OpeningsResult` with `ok: false` | its problem; nothing changes |
| Obstacles applied / refused | likewise with `applyObstacles` | likewise |
| Move an obstacle | `moveObstacleTo(id, 30.4, 50.6)` on a default box | centre `(30, 51)`; `moveObstacleBy(id, 1, 0)` → x exactly 31 |
| Remove | `removeOpening`, `removeObstacle` | removed; unknown id → same state object |
| Conflicts selector | seed plus `D1` | `useConflicts()` has `seed-bed: 'Blocks a door'`; `useWarnings()` is `{}` |
| Warnings selector | seed plus a window on `c2` (offset 100, width 36, sill 24) | `useWarnings()` has `seed-desk: 'Covers a window'` |
| Round trip | `planRoundTrip.test.ts` extended: add, slide, update and remove a door and a window; add, move, nudge, update and remove a box and a column; every outline edit of the existing test repeated with a door on the affected wall; add openings and obstacles up to and past their caps | `parsePlan` accepts the document after every step |
| Existing tests | every other existing test | passes; `expect(` lines change only where they asserted `applyOutline`'s boolean |

**Verify:** `npx vitest run room-planner/state room-planner/components/Sidebar room-planner/domain/planRoundTrip.test.ts`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): keep doors and windows on their walls when the room changes`
**Rollback:** `git revert` the commit.

## Task 7: Editing state and actions

**Spec:** Slice C row "Placing".

**Files:**
- Modify: `room-planner/state/uiStore.ts`
- Modify: `room-planner/state/actions.ts`
- Modify: `room-planner/state/stores.test.ts`

**Interfaces:**
- Consumes: Task 6's store operations; `addOpening`, `slideOpening`, `updateOpening`
  (Task 2); `newObstacle`, `addObstacle`, `updateObstacle` (Task 3); `interiorPoint`.
- Produces, in `uiStore.ts` (`UiState`): `roomTool: RoomTool` (initial `'corner'`),
  `selectedOpeningId: string | null`, `selectedObstacleId: string | null` (initial
  `null`), `setRoomTool(t: RoomTool): void`, `selectOpening(id: string | null): void`,
  `selectObstacle(id: string | null): void`.
  - `selectCorner`, `selectOpening` and `selectObstacle` each clear the other two when
    given a non-null id.
  - `setMode('furnish')` also clears the two new selections and sets `roomTool` to
    `'corner'`; `reset()` restores all three.
- Produces, in `actions.ts` (each applies through the store and sets or clears
  `roomProblem` like the existing room actions):
  - `placeOpeningOnWall(wallId: string, at: Point): void` — uses the armed tool
    (`'door'` or `'window'`); the new id is `crypto.randomUUID()`; on success selects
    the opening and sets `roomTool` to `'corner'`; does nothing when the tool is
    `'corner'`.
  - `slideSelectedOpening(delta: number): void`, `slideOpeningTo(id: string, offset: number): void`
  - `updateSelectedOpening(patch): void` (the `updateOpening` patch type)
  - `addObstacleAtCentre(shape: 'box' | 'cylinder'): void` — at
    `interiorPoint(outline)`, height from the room; on success selects it.
  - `dragObstacleTo(id: string, x: number, y: number): void`, `nudgeSelectedObstacle(dx: number, dy: number): void`, `rotateSelectedObstacle(deg: number): void`, `updateSelectedObstacle(patch): void`
  - `removeSelectedRoomThing(): void` — removes the selected corner, opening or
    obstacle (whichever is selected) and clears that selection on success.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Selections are exclusive | `selectCorner('c1')` then `selectOpening('d1')` | `selectedCornerId` `null`, `selectedOpeningId` `'d1'`; likewise for each pair |
| Leaving room mode | `setMode('furnish')` with a tool armed and an obstacle selected | `roomTool` `'corner'`, both new selections `null` |
| Place a door | tool `'door'`; `placeOpeningOnWall('c1', (72, 5))` | one door at offset 56; selected; tool `'corner'`; `roomProblem` `null` |
| Place refused | tool `'door'`; a wall 10 in long | no opening; tool stays `'door'`; `roomProblem` is the `opening-off-wall` text |
| Place with no tool | tool `'corner'` | nothing changes |
| Slide the selected opening | `slideSelectedOpening(1)` on `D1` | offset 21; at the wall's end it stays and no problem is set |
| Update the selected door | `updateSelectedOpening({ swing: 'out' })` | swing `'out'` |
| Add a box | `addObstacleAtCentre('box')` in the seed room | a box at `(72, 84)`; selected |
| Add a column | `addObstacleAtCentre('cylinder')` | height 96 |
| Add refused | 64 obstacles | `roomProblem` is the `too-many-obstacles` text |
| Nudge, rotate, update an obstacle | `nudgeSelectedObstacle(1, 0)`, `rotateSelectedObstacle(15)`, `updateSelectedObstacle({ elevation: 40 })` | x + 1; rotation + 15; elevation 40 |
| Remove selected | with an opening selected; with an obstacle selected; with a corner selected | that thing is removed and its selection cleared; nothing selected → nothing changes |
| Remove a corner beside a door | corner `c2` selected, `D1` on `c1` | not removed; `roomProblem` is the `corner-has-openings` text |
| Existing behaviour | every existing UI store and action test | passes unchanged |

**Verify:** `npx vitest run room-planner/state/stores.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): add door, window and obstacle editing actions`
**Rollback:** `git revert` the commit.

## Task 8: Plan drawing

**Spec:** Slice C row "Views" (the plan).

Doors, windows and obstacles are drawn on the 2D plan in both modes. No interaction
in this task.

**Files:**
- Modify: `room-planner/view/planLayout.ts`, `room-planner/view/planLayout.test.ts`
- Create: `room-planner/view/planFeatures.ts`, `room-planner/view/planFeatures.test.ts`
- Modify: `room-planner/components/Stage/PlanView.tsx`, `room-planner/components/Stage/PlanView.test.tsx`
- Create: `room-planner/components/Stage/PlanFeatures.tsx`, `room-planner/components/Stage/PlanFeatures.test.tsx`
- Modify: `room-planner/components/Stage/stage.css`

**Interfaces:**
- Consumes: `openingSpan` (Task 2); `obstacleFootprint`, `obstaclePolygon` (Task 3);
  `doorReservedArea` (Task 4); `useConflicts`, `useWarnings` (Task 6); `toPane`,
  `planItemBox`.
- Produces, in `planLayout.ts`:
  `toPlan(p: Point, layout: PlanLayout): Point` (the inverse of `toPane`); the two
  inline conversions in `RoomEditLayer.tsx` are **not** changed in this task.
- Produces, in `planFeatures.ts` (pure, pane pixels):
  - `export interface DoorDrawing { id: string; gap: [Point, Point]; leaf: [Point, Point]; arc: string }` (`gap` = the opening's two ends; `leaf` = from the hinge to the open leaf's end; `arc` = an SVG path from the closed leaf's end to the open leaf's end, radius = width)
  - `export interface WindowDrawing { id: string; a: Point; b: Point; inner: [Point, Point] }` (`inner` = the same segment moved 3 px along the inward normal)
  - `doorDrawing(door, outline, layout): DoorDrawing | null`, `windowDrawing(win, outline, layout): WindowDrawing | null`
- Produces: `export function PlanFeatures({ layout }: { layout: PlanLayout }): JSX.Element`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| `toPlan` | `toPlan(toPane(p, layout), layout)` for three points and a layout with offsets | equals `p` to 1e-9 |
| Door drawing | `D1`, room `R`, layout `{ scale: 2, ox: 10, oy: 20 }` | `gap` `[(50, 20), (114, 20)]`; `leaf` `[(50, 20), (50, 84)]`; `arc` is `M 114 20 A 64 64 0 0 1 50 84` |
| Door drawing, hinge end | `D1` with hinge `'end'` | `leaf` `[(114, 20), (114, 84)]`; `arc` is `M 50 20 A 64 64 0 0 0 114 84` |
| Door swinging out | swing `'out'` | the leaf and arc are mirrored to the outside of the wall: `leaf` `[(50, 20), (50, −44)]`, `arc` `M 114 20 A 64 64 0 0 0 50 −44` |
| Window drawing | window on `c2`, offset 100, width 36, the same layout | `a (298, 220)`, `b (298, 292)`, `inner` `[(295, 220), (295, 292)]` |
| Unknown wall | an opening whose wall is missing | `null`; nothing drawn |
| Doors in the plan | a plan with `D1` | inside `svg.plan-features`: a `line.plan-door-gap` (drawn in the plan background colour over the wall), a `line.plan-door-leaf` and a `path.plan-door-arc`, each with `data-opening-id="d1"` |
| Windows in the plan | a plan with one window | two `line.plan-window` elements with its `data-opening-id` |
| Obstacles in the plan | a box and a column | one `div.plan-obstacle` each with `data-obstacle-id`, positioned by `planItemBox(obstacleFootprint(o), layout)` and rotated; the column also has class `is-round`; each shows its label as text when the box is wider than 48 px |
| Label is text | label `<img src=x onerror=alert(1)>` | rendered as visible text; no `img` element exists in the plan |
| Flags | an obstacle with a conflict | class `is-conflict`; an opening with a conflict → its lines have class `is-conflict` |
| Furniture warning | an item in `useWarnings()` and not in `useConflicts()` | its `div.plan-item` has class `is-warning`; an item in both has `is-conflict` only |
| Both modes | `mode` `'furnish'` and `'room'` | the drawings are present in both; in this task none of them handles pointer or key events, and none is focusable |
| Order | stacking | room, walls, openings, obstacles (below furniture), furniture, clearance lines, room-edit layer |
| Existing plan tests | `PlanView.test.tsx` | pass; queries that count `[data-item-id]` are unaffected because the new elements use other attributes |
| CSS | new rules | planner class selectors in the families `.plan-features`, `.plan-door-*`, `.plan-window`, `.plan-obstacle`, plus `.plan-item.is-warning`; the warning colour is an existing token chosen from `room-planner/styles/industry.css` (name it in the report; if no amber or warning token exists, define `--color-warning` on `.room-planner` in `stage.css`'s first rule and say so) |

**Verify:** `npx vitest run room-planner/view room-planner/components/Stage`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): draw doors, windows and obstacles on the plan`
**Rollback:** `git revert` the commit.

## Task 9: Room editor interactions

**Spec:** Slice C row "Placing".

**Files:**
- Modify: `room-planner/components/Stage/RoomEditLayer.tsx`, `room-planner/components/Stage/RoomEditLayer.test.tsx`
- Modify: `room-planner/components/Stage/PlanFeatures.tsx`, `room-planner/components/Stage/PlanFeatures.test.tsx`
- Modify: `room-planner/components/Stage/stage.css`
- Modify: `room-planner/hooks/useKeyboardShortcuts.ts`, `room-planner/hooks/useKeyboardShortcuts.test.tsx`

**Interfaces:**
- Consumes: Task 7's state and actions; Task 8's drawings; `toPlan`; `startDrag`.

**Behavior** (all in room mode unless stated):

| Case | Input / state | Expected |
|------|---------------|----------|
| Wall click, corner tool | `roomTool` `'corner'`; primary-button pointer down on a wall band | `addCornerOnWall` as today |
| Wall click, door tool | `roomTool` `'door'`; pointer down on wall `c1` at plan `(72, 5)` | `placeOpeningOnWall('c1', (72, 5))`; no corner is added |
| Secondary button | pointer down with `button !== 0` on a wall | nothing happens (corner tool too) |
| Opening handles | each opening | a `button.room-opening` centred on the opening, named `Door on wall <n>` or `Window on wall <n>` (`n` = wall index + 1), `aria-pressed` = selected; above the wall bands and below the corner handles |
| Select an opening | pointer down or Enter/Space on its handle | `selectOpening(id)` |
| Drag an opening | pointer down on its handle, move by `(dx, dy)` px | `slideOpeningTo(id, startOffset + ((dx, dy)/scale)·u)` on every move (the movement's component along the wall); the layout is frozen for the drag as for corners; the drag ends if room mode is left |
| Obstacles interactive | each obstacle in room mode | its `div.plan-obstacle` has `role="button"`, `tabIndex 0`, an accessible name (its label, or `Box` / `Column` when the label is empty), `aria-pressed` = selected; pointer down selects it and starts a drag calling `dragObstacleTo(id, x0 + dx/scale, y0 + dy/scale)` |
| Obstacles in furnish mode | `mode` `'furnish'` | not focusable, no role, pointer events pass through |
| Keys, opening selected | ArrowRight / ArrowDown; ArrowLeft / ArrowUp; with Shift | `slideSelectedOpening(+1)`; `(−1)`; ±12 |
| Keys, obstacle selected | arrows; Shift+arrows; `R`; Shift+`R` | `nudgeSelectedObstacle` by 1; by 12; `rotateSelectedObstacle(90)`; `(15)` |
| Delete / Backspace | a corner, opening or obstacle selected, focus outside a text field | `removeSelectedRoomThing()` |
| Escape | a tool armed | `setRoomTool('corner')`; otherwise clears the room selection as today |
| Form fields | focus in any input | arrows, `R` and Delete are ignored as today |
| Corner behaviour | every existing corner test (drag, Alt, freeze, refusal, keys) | passes unchanged |
| Furnish mode | every existing furnish-mode keyboard test | passes unchanged |
| Background click | pointer down on empty plan area | clears the corner, opening and obstacle selections |
| Cursor | a tool armed | the wall bands show a crosshair cursor (class `is-placing` on the layer) |
| CSS | new rules | `.room-opening*`, `.plan-obstacle` state rules, `.is-placing`; handles have a visible focus style and are at least 24 px across |

**Verify:** `npx vitest run room-planner/components/Stage room-planner/hooks`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): place and move doors, windows and obstacles on the plan`
**Rollback:** `git revert` the commit.

## Task 10: Sidebar

**Spec:** Slice C rows "Placing" (the buttons and exact-size fields), "Window check"
(listed in the sidebar), "Obstacle check" (flags).

**Files:**
- Create: `room-planner/components/Sidebar/RoomFeatures.tsx`, `room-planner/components/Sidebar/RoomFeatures.test.tsx`
- Modify: `room-planner/components/Sidebar/RoomSection.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx`
- Modify: `room-planner/components/Sidebar/WallList.tsx`, `room-planner/components/Sidebar/WallList.test.tsx`
- Modify: `room-planner/components/Sidebar/ItemList.tsx`
- Modify: `room-planner/components/Sidebar/Sidebar.test.tsx`
- Modify: `room-planner/components/Sidebar/sidebar.css`, `room-planner/components/Sidebar/itemList.css`
- Modify: `room-planner/components/SelectionBar.tsx`, `room-planner/components/bars.test.tsx`

**Interfaces:**
- Consumes: Task 7's state and actions; `useConflicts`, `useWarnings`; the unit
  helpers `parseLengthInput`, `roomInputStr`, `furnInputStr`, `parseFurnInput`.
- Produces: `export function RoomFeatures(): JSX.Element | null`, rendered by
  `RoomSection` after the wall list. It renders nothing in furnish mode.

**Exact values:**
- Buttons, in a group labelled `Add to the room`: `Add door`, `Add window`,
  `Add box`, `Add column`. While the door tool is armed the `Add door` button reads
  `Cancel door` (no `aria-pressed`); likewise `Cancel window`.
- Armed help text (`role="status"`): `Click a wall to place the door.` /
  `Click a wall to place the window.`
- Wall-row button while a tool is armed: accessible name
  `Place the door on wall <n>` / `Place the window on wall <n>`; it replaces the
  `Add a corner to wall <n>` button while armed.
- List heading: `Doors, windows and obstacles`; empty text: `None yet.`
- Row names: `Door on wall <n>`, `Window on wall <n>`, the obstacle's label, or
  `Box` / `Column` when the label is empty.
- Fields for the selected door: `Width`, `Height` (inches or centimetres, as the
  furniture fields), `Hinge` (`Start of wall` / `End of wall`), `Swing`
  (`Into the room` / `Out of the room`). Window: `Width`, `Sill`, `Height`.
  Obstacle: `Label` (text, `maxLength` 40), `Width`, `Depth` (box only),
  `Height`, `Off the floor`, `Angle` (degrees, box only). Each has a `Remove` button.
- Room-mode hint in the selection bar (plan visible):
  `Drag a corner to reshape the room. Click a wall to add a corner, or pick a door or window to place. Select something and press Delete to remove it.`
- Item warning tag: the warning text in a `span.tag.item-row-warning`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Hidden in furnish mode | `mode` `'furnish'` | `RoomFeatures` renders nothing |
| Arm and cancel | click `Add door`; click `Cancel door` | `roomTool` `'door'`, then `'corner'`; the status text appears and disappears |
| Place by keyboard | tool armed; activate `Place the door on wall 1` | a door centred on wall 1 (offset 56 in the seed room); tool disarmed |
| Add box, add column | click each | one obstacle each at the room's interior point, selected, its fields shown |
| List | a door, a window and a box | three rows in that order (openings first, then obstacles, each in stored order); clicking a row selects that thing |
| Flags in the list | an obstacle with a conflict; an opening with a conflict | the reason in a `span.tag` in its row |
| Door fields | selected door; type width 36; choose `End of wall`; choose `Out of the room` | `updateSelectedOpening` with each; a refused width keeps the typed text and shows the reason in the Room section's status element |
| Window fields | selected window; type sill 24 | sill 24 |
| Obstacle fields | selected box; type a label, a width, `Off the floor` 40, angle 30 | each stored; the label is stored as typed (cut to 40 characters by `maxLength`) |
| Column fields | selected column | no `Depth` and no `Angle` field; typing a width sets width and depth |
| Remove | click `Remove` for the selected thing | removed; fields gone |
| Units | units `m` | size fields show and parse centimetres, as the furniture size fields do |
| Starting shape with a door | click `L-shape` when the room has a door | the outline is unchanged; the status element reads `Remove the doors and windows before starting from a shape.` |
| Item warning | an item in `useWarnings()` | its row shows `Covers a window` in a `span.tag.item-row-warning`; an item with a conflict shows only the conflict |
| Selection bar hint | room mode, plan visible | the new hint text above |
| Sidebar headings | `Sidebar.test.tsx` | still exactly `01` to `04` (no `h6` is added; the list heading is not an `h6`) |
| Accessibility | every new control | a label or accessible name; the status element is the existing `role="status"` one |
| CSS | new rules | `.room-features*`, `.item-row-warning`; planner class selectors |

**Verify:** `npx vitest run room-planner/components/Sidebar room-planner/components/bars.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): add doors, windows and obstacles to the sidebar`
**Rollback:** `git revert` the commit.

## Task 11: Styled 3D

**Spec:** Slice C row "Views" (Styled 3D).

**Files:**
- Modify: `room-planner/three/roomMesh.ts`, `room-planner/three/roomMesh.test.ts`
- Create: `room-planner/three/obstacleMesh.ts`, `room-planner/three/obstacleMesh.test.ts`
- Modify: `room-planner/three/SceneRenderer.ts`, `room-planner/three/SceneRenderer.test.ts`
- Modify: `room-planner/components/Stage/ThreeView.tsx`, `room-planner/components/Stage/ThreeView.test.tsx`

**Interfaces:**
- Consumes: `openingSpan` (Task 2); `obstacleFootprint` (Task 3); the plan store's
  `openings` and `obstacles`.
- Produces, in `roomMesh.ts`:
  - `export interface WallHole { x0: number; x1: number; z0: number; z1: number; glass: boolean }` (`x` = distance along the wall from its start; `z` = height above the floor)
  - `wallHoles(outline: readonly Corner[], openings: readonly Opening[], height: number): WallHole[][]` (one list per wall, in wall order; a door is `z0 0`, `z1 min(height, room height)`; a window is `z0 sill`, `z1 min(sill + height, room height)`, `glass true`; a hole with `z1 ≤ z0` is dropped)
  - `buildRoom(outline: readonly Point[], height: number, tokens: Tokens, floorMap: THREE.Texture | null, holes?: readonly (readonly WallHole[])[]): THREE.Group` (the fifth argument is optional, so existing calls keep working)
- Produces, in `obstacleMesh.ts`: `buildObstacle(o: Obstacle, tokens: Tokens): THREE.Group`.
- Changes: `SceneInput` gains `openings: readonly Opening[]` and
  `obstacles: readonly Obstacle[]`, and its `outline` becomes `readonly Corner[]`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Holes computed | room `R` (height 96), `D1` and a window on `c2` (offset 100, width 36, sill 36, height 48) | wall 0: `[{ x0 20, x1 52, z0 0, z1 80, glass false }]`; wall 1: `[{ x0 100, x1 136, z0 36, z1 84, glass true }]`; walls 2 and 3: `[]` |
| Hole clamped to the ceiling | a door of height 100 | `z1 96` |
| Hole above the ceiling | a window with sill 100 | dropped |
| Wall with a hole | wall 0 built with the door hole | the wall mesh's geometry has no triangle covering the point 36 in along the wall, 40 in up; it does cover 10 in along, 40 in up, and 36 in along, 90 in up; it still faces inward |
| Glass | wall 1 built with the window hole | an extra mesh spanning the hole, facing inward, with a transparent material (`transparent true`, `opacity` below 1) |
| No holes | `buildRoom` called without the fifth argument, or with empty lists | the same meshes as before this task (existing tests unchanged) |
| Room rebuild key | an opening's offset, width, height, sill, or the list's length changes | the room is rebuilt and the old one disposed; equal values → no rebuild |
| Box obstacle | box 20 × 10 × 30 at `(30, 130)`, elevation 40, rotation 90 | a group at `(30, 0, 130)` with `rotation.y = −π/2`, holding a box mesh 20 × 30 × 10 whose centre is at height 55; casts and receives shadows |
| Cylinder obstacle | column width 12, height 96 | a cylinder mesh of radius 6 and height 96 centred at height 48 |
| Obstacle sync | obstacles added, changed, removed between updates | groups are created, rebuilt when size, shape or elevation changes, only moved when position or rotation changes, and disposed when removed |
| Obstacle highlight | an obstacle in `conflicts` | drawn with an outline box as conflicted furniture is |
| View component | `ThreeView` | passes `room.outline`, `openings` and `obstacles` from the store |
| Existing tests | disposal, sizing, one render per update, furniture | pass; fixtures gain the two new inputs |

**Verify:** `npx vitest run room-planner/three room-planner/components/Stage/ThreeView.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): cut doors and windows into the 3D walls and add obstacles`
**Rollback:** `git revert` the commit.

## Task 12: Blueprint

**Spec:** Slice C row "Views" (Blueprint).

**Files:**
- Modify: `room-planner/view/blueprintScene.ts`, `room-planner/view/blueprintScene.test.ts`
- Modify: `room-planner/view/blueprintDraw.ts`, `room-planner/view/blueprintDraw.test.ts`
- Modify: `room-planner/components/Stage/BlueprintView.tsx`, `room-planner/components/Stage/BlueprintView.test.tsx`

**Interfaces:**
- Consumes: `wallHoles`, `WallHole` (Task 11); `obstaclePolygon` (Task 3).
- Changes, in `blueprintScene.ts`: `Prism.pts` becomes `readonly Point[]` (a convex
  polygon of 3 or more points with positive signed area); `Prism` gains
  `obstacle?: true`; new `obstaclePrisms(obstacles: readonly Obstacle[]): Prism[]`
  (`itemId` = the obstacle's id, `kind 'box'`, `z0 elevation`,
  `z1 elevation + height`, `pts` = `obstaclePolygon`). `frontOf` and `sortPrisms`
  accept any such prism.
- Changes: `BlueprintInput` gains `openings: readonly Opening[]` and
  `obstacles: readonly Obstacle[]`, and its `outline` becomes `readonly Corner[]`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Four-sided prisms | every existing `frontOf`, `sortPrisms` and prism-drawing test | passes unchanged |
| Many-sided prism | a 16-sided column prism and a box prism side by side | `frontOf` decides by the camera's side; `sortPrisms` returns each once |
| Prism sides | a prism with `n` sides | each side whose outward normal faces the camera is drawn, for a four-sided prism in the existing side order, otherwise in index order; colours by the plan axis the side faces (the existing rule) |
| Obstacle prisms | box 20 × 10 × 30 at elevation 40 | `z0 40`, `z1 70`, 4 points; a column gives 16 points |
| Obstacles drawn | a plan with an obstacle | it is sorted and drawn with the furniture prisms; a raised obstacle also draws its underside when the camera is below `z0`; conflicted → the existing dashed stroke |
| Wall holes, far walls | a far wall with a door hole | the wall's fill leaves the hole empty (one path with the hole as an inner rectangle, filled with the `evenodd` rule) and the hole's edges are stroked |
| Wall holes, near walls | a near (dashed) wall with a hole | the hole's rectangle is stroked with the same dashed style |
| Window | a window hole | additionally a horizontal line across the hole at mid-height |
| No openings or obstacles | empty lists | the same canvas calls as before this task (existing draw tests unchanged apart from the two new inputs) |
| View component | `BlueprintView` | passes `room.outline`, `openings` and `obstacles` |

**Verify:** `npx vitest run room-planner/view room-planner/components/Stage/BlueprintView.test.tsx`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): draw doors, windows and obstacles in the blueprint`
**Rollback:** `git revert` the commit.

## Task 13: Live verification

**Spec:** every Slice C row, checked in a real browser. No code changes.

**Files:**
- Create: `docs/room-planner/verification/2026-11-14-openings-live-check.md`
- Create: `docs/room-planner/verification/shots-openings/` (screenshots)

**Interfaces:**
- Consumes: the finished app (Tasks 1 to 12).

**Procedure:** `npm run build`, then `npx next start -p 3210`; Chromium at 1440×900
against `http://localhost:3210/room-planner`; stop the server by port. Rows run in
order in one session; a row marked "Fresh" first removes the storage key
`room-planner:plan:v1` and reloads; other rows continue from the previous row.
"Stored" values are read from that key at least 500 ms after the last change. The
record is one table with columns `Row | What was done | What was observed | Evidence
| Result`, `Result` exactly `Pass` or `Fail`. A screenshot is supporting evidence
only. A defect is recorded as `Fail` with reproduction steps; it is not fixed in this
task.

**Behavior (rows of the record):**

| Row | Steps | Expected |
|-----|-------|----------|
| C1 | Fresh. `Edit room`; `Add door`; click the top wall near its middle | one stored door on wall `c1` with width 32, height 80, hinge `start`, swing `in`, offset between 40 and 72; the button reads `Add door` again; the plan shows a gap and an arc |
| C2 | Continue. `Done` | the bed's row and the selection bar (after selecting the bed) read `Blocks a door` if the stored door's `[offset, offset + 32]` range and arc reach the bed (x 40–104, y 0–85); the top bar shows at least `1 conflict` |
| C3 | `Edit room`; select the door; set `Swing` to `Out of the room`; then `Hinge` to `End of wall` | stored swing `out` and hinge `end`; the plan's arc is drawn outside the top wall |
| C4 | Drag the door's handle 100 px to the left | the stored offset decreased by `round(100/k)` (k = layout scale), never below 0 |
| C5 | With the door selected press ArrowRight three times, then Delete | offset + 3, then no openings stored |
| C6 | `Add window`; activate `Place the window on wall 2` with the keyboard | a stored window on `c2`, width 36, sill 36, height 48, offset 66 |
| C7 | Select the window; type sill `24` (inches); `Done` | stored sill 24; the desk's row shows `Covers a window` only if the window's range overlaps the desk's (y 104–159): if it does not, slide the window with ArrowRight until its offset is 110 and re-check; the top bar's conflict count does not include it |
| C8 | `Edit room`; drag corner 3 up until the right wall is shorter than the window's end | the drag stops; the status reads `That would leave a door or window without room on its wall.`; the stored outline is its last valid one |
| C9 | Click the right wall about 30 px below its top end to add a corner (corner tool, above the window); then, with that new corner selected, press Delete | the corner is added and the window keeps its physical position: its `wallId` is now the new corner's id and its `offset` is smaller by the new corner's distance from corner 2. Deleting the new corner is refused with `Remove the doors and windows on these walls first.` and the outline keeps the new corner |
| C10 | Click `L-shape` | refused: `Remove the doors and windows before starting from a shape.`; outline unchanged |
| C11 | `Add box`; type label `Radiator`, width 30, depth 8; drag it onto the bed; `Done` | the bed reads `Overlaps Radiator`; `Edit room`, set `Off the floor` to 40 → after `Done` the bed has no obstacle conflict |
| C12 | `Edit room`; `Add column`; drag it against the left wall so part of it is outside | its row reads `Outside the room`; the top-bar count includes it |
| C13 | Reload | the door-less room, the window, the box and the column are back exactly as stored; no notice |
| C14 | Styled view and Blueprint view (screenshots), with a door re-added on the top wall | the stored values are unchanged by viewing; the 3D canvas re-rendered after the door was added; record what is visible (a hole in the wall, glass in the window, the box and the column) |
| C15 | Set the key to a version 2 seeded document and reload; then to a version 3 document whose door has `wallId: "<img src=x onerror=alert(1)>"` and reload | first: the seeded plan, no notice, and after one nudge the key holds `schemaVersion 3` with empty `openings` and `obstacles`; second: the invalid-plan notice, no dialog, the key removed |
| C16 | Fresh. Keyboard only: `Edit room`, `Add door`, `Place the door on wall 1`, ArrowRight, Tab to the door's `Width` field and type 36, `Add box`, type a label, `Done` | each step works without a pointer; `document.activeElement` is the named control after each Tab step and has a visible focus style; the stored door has width 36 |
| C17 | Whole session | console free of errors and warnings on `/room-planner`; every request made on `/room-planner` goes to `localhost:3210`; `Object.keys(localStorage)` is `['room-planner:plan:v1']` or empty |
| C18 | Fresh. Obstacle label `<img src=x onerror=alert(1)>` typed into the Label field | no dialog; the plan and the list show the text literally (cut to 40 characters) |
| C19 | Slice B regression: Fresh; repeat slice B rows B2, B4, B7, B10 and B13 from `docs/room-planner/verification/2026-11-13-room-shape-live-check.md` | each behaves as recorded there |

**Verify:** the record has rows C1 to C19 with measured values; every `Fail` has
reproduction steps; the controller re-runs three rows before accepting the record.
**Commit:** `docs(room-planner): record the openings live check`
**Rollback:** `git revert` the commit.

## Task 14: Docs

**Spec:** project documentation rules in `CLAUDE.md`.

**Files:**
- Modify: `docs/room-planner/mistakes-and-fixes.md`
- Modify: `docs/room-planner/README.md`
- Modify: `README.md` (the Room Planner text only)
- Modify: `CLAUDE.md` (the Room Planner text only)

**Interfaces:**
- Consumes: the task reports of Tasks 1 to 13 and the controller's handover file of
  mistakes.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Mistakes log | every mistake in the handover | one entry each under `## 2026-11-14 — Openings and obstacles`, in the file's existing format |
| Planner docs | `docs/room-planner/README.md` | describes doors (swing arc, blockers flagged), windows (warning when covered), obstacles (boxes, raised boxes, columns), how each is placed and edited, what happens to openings when walls change, the stored document's version 3, and links this plan, its review and the Task 13 record |
| Site docs | `README.md`, `CLAUDE.md` | the Room Planner text mentions doors, windows and obstacles in one sentence; `CLAUDE.md` adds the rule that outline edits go through `applyOutline` so openings are re-homed |
| Unrelated text | the rest of `README.md` and `CLAUDE.md` | unchanged |

**Verify:** `grep -c "obstacle" docs/room-planner/README.md README.md CLAUDE.md` → at
least 1 in each; `ls` of the three linked paths succeeds; `npm run check` → exit 0.
**Commit:** `docs(room-planner): describe doors, windows and obstacles`
**Rollback:** `git revert` the commit.

## Done criteria

1. `npm run check` exits 0 on the branch head, with no skipped test.
2. Every row C1 to C19 of the Task 13 record has `Pass` in its Result column, after
   any fix pass and re-run.
3. `git diff 6ed5e96 --stat -- app lib public components content package.json package-lock.json`
   is empty.
4. `npm audit --omit=dev` still reports 0 critical, 0 high, 0 moderate and 4 low.
5. `grep -rn "dangerouslySetInnerHTML\|window.confirm\|innerHTML" room-planner --include='*.ts' --include='*.tsx'`
   prints nothing outside test files.
6. `planRoundTrip.test.ts` covers every store operation this plan adds.

## Spec traceability

| Spec item (Slice C row) | Task |
|---|---|
| Data: `openings`, `obstacles`; `schemaVersion` 3; version 2 loads with both empty | 1, 5; live C13, C15 |
| Door: fields and defaults | 1, 2; live C1 |
| Window: fields and defaults | 1, 2; live C6 |
| Obstacle: fields; cylinder uses `width` as diameter; `elevation` | 1, 3; live C11 |
| Placing: Add door, Add window, Add box, Add column; click a wall; slide; snap 1 in | 2, 7, 9, 10; live C1, C4, C6 |
| Placing: obstacles drag and rotate only in "Edit room" mode; exact-size fields; Delete removes | 7, 9, 10; live C5, C11, C16 |
| Opening validity: fits its wall; no overlap | 2, 5; live C8 |
| Opening validity: corner drag or typed length that breaks it stops, sidebar says why | 2, 6; live C8 |
| Opening validity: deleting a corner whose walls carry an opening is refused | 2, 6; live C9 |
| Opening validity: adding a corner keeps each opening on its part; not inside an opening | 2, 6; live C9 |
| Door check: arc for swing in; 24 in strip for swing out; furniture or obstacle inside is a conflict | 4, 6; live C2, C3 |
| Window check: furniture taller than the sill within 6 in gets an amber warning, listed, not counted | 4, 6, 8, 10; live C7 |
| Obstacle check: footprint and height overlap; fits under a raised obstacle; outside or too tall flagged | 4, 6; live C11, C12 |
| Views: plan (gap and arc, double line, hatched shapes with label) | 8; live C1, C14 |
| Views: Styled 3D and Blueprint (holes, glass, obstacles) | 11, 12; live C14 |
| Saving: same storage; validated; caps of 64; labels plain text of at most 40 characters, rendered as text | 1, 5, 8, 10; live C13, C15, C18 |
| Plan additions, not in the spec: decisions 2 to 11 | 2, 3, 4, 6, 7, 10 |
| Verification of every row in a browser | 13 |
| Project rule (docs kept current, mistakes log) | 14 |
