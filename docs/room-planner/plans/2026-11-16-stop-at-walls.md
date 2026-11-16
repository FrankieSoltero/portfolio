# Stop at walls Implementation Plan

> **For executors:** execute with soltero-skills:lean-sdd. The Task Dependency
> Table below is the scheduling and review-depth contract.

**Goal:** A piece of furniture or an obstacle that is moved from inside the room stops
flush against the room's walls and never ends partly outside.

**Spec:** `docs/room-planner/specs/2026-11-16-stop-at-walls-design.md` (approved by the
owner on 2026-11-16).

**Architecture:** One new pure function, `stopAtWalls` in `room-planner/domain/wallStop.ts`,
decides where a move ends from the piece's shape, its start, the place asked for and the
room's outline. The four move functions (`moveItem`, `shiftItem`, `moveObstacle`,
`shiftObstacle`) call it and take the room's outline in place of its bounding box. The plan
store passes the outline. Nothing new is stored; the saved format stays at version 3.

**Tech stack / test runner:** Next.js 15, React 19, TypeScript, Zustand 5, Vitest + React
Testing Library + jsdom. One file: `npx vitest run <file>` from the repo root. Everything:
`npm run check` (typecheck, lint, tests, build). Repo root:
`/Users/franciscosoltero/Desktop/Code/Portfolio Website`. Branch: `undo-redo` (the owner
chose to add this work to pull request #3).

## Global Constraints

- "Inside" always means `convexInsidePolygon(shape, outline, eps)` from
  `room-planner/domain/polygon.ts`. No second definition of inside is written.
- New CONFIG values, exact: `wallStopEpsilon: 1e-6`, `wallStopIterations: 26`.
- Every stored position stays rounded to 0.01 (`round2`).
- The conflict rules in `room-planner/domain/conflicts.ts` do not change, and no conflict
  text changes.
- Turning a piece, changing the room, typed values and the placement of new pieces behave
  exactly as before this plan.
- Nothing under `room-planner/domain/` imports React, Zustand, three.js or anything under
  `room-planner/state/`.
- No change to `planSchema.ts`, to `browserPlanStore.ts` or to the storage key. No new
  dependency. `/room-planner` First Load JS stays between 104 and 107 kB; the build output
  of `npm run check` prints it, and Task 4 quotes that line.
- Existing tests pass unchanged unless a task's "Test changes" line allows the change.
  Before finishing, each implementer greps the tests for every function, constant and
  string the task adds or changes and reports any pinned test outside its list.
- Tests first: in Tasks 1 and 2 the tests for the behavior table are written and seen to
  fail before the implementation, and the task report quotes the failing run.
- Rollback: one commit per task on branch `undo-redo`; the work reaches the live site only
  through pull request #3, which the owner merges. Reverting this plan's commits (or the
  merge) removes the feature. No stored data is touched, so no flag and no migration.
- Implementers stage only their own listed paths. Commits end with the trailer lines the
  dispatch gives. Never touch `Multiplayer_AI_Sprite.aseprite`.
- A dev server may be running on port 3478. Stop it by port
  (`lsof -ti tcp:3478 | xargs kill`) before `npm run check`; never stop a process by name.

## Task Dependency Table

| Task | Files touched | Depends on | Risk tier |
|------|---------------|------------|-----------|
| 1. The stop function | `room-planner/config.ts`, `room-planner/domain/catalog.test.ts`, `room-planner/domain/wallStop.ts`, `room-planner/domain/wallStop.test.ts` | — | judgment |
| 2. Moves use it | `room-planner/domain/geometry.ts`, `room-planner/domain/geometry.test.ts`, `room-planner/domain/obstacles.ts`, `room-planner/domain/obstacles.test.ts`, `room-planner/state/planStore.ts`, `room-planner/state/stores.test.ts`, `room-planner/state/actions.ts`, `room-planner/components/Stage/PlanView.test.tsx`, `room-planner/hooks/useKeyboardShortcuts.test.tsx`, `room-planner/state/history.flow.test.tsx` | 1 | standard |
| 3. Live check | `docs/room-planner/verification/2026-11-16-stop-at-walls-live-check.md`, `docs/room-planner/verification/shots-stop-at-walls/` | 2 | judgment |
| 4. Docs | `docs/room-planner/mistakes-and-fixes.md`, `docs/room-planner/README.md`, `docs/room-planner/specs/2026-11-16-stop-at-walls-design.md` | 3 | mechanical |

All tasks run one at a time, in the order of their numbers.

---

## Task 1: The stop function

**Spec:** "How it works" steps 1 to 4; "Behaviour" rows 1 to 7, 10 and 11.

**Files:**
- Modify: `room-planner/config.ts`
- Test: `room-planner/domain/catalog.test.ts`
- Create: `room-planner/domain/wallStop.ts`
- Test: `room-planner/domain/wallStop.test.ts`

**Interfaces:**
- Consumes: `convexInsidePolygon`, `round2` from `room-planner/domain/polygon.ts`; `CONFIG`; `Point` from `room-planner/domain/types.ts`.
- Produces: `export function stopAtWalls(shapeAt: (centre: Point) => readonly Point[], from: Point, to: Point, outline: readonly Point[]): Point`. `shapeAt` returns the piece's convex outline when its centre is at the given point. The result has both coordinates rounded to 0.01. `CONFIG.wallStopEpsilon`, `CONFIG.wallStopIterations`.

**Behavior:**

The rule, in order (`inside(c, eps)` is `convexInsidePolygon(shapeAt(c), outline, eps)`):

1. `to` is first rounded to 0.01.
2. If `inside(from, CONFIG.conflictEpsilon)` is false, return `to`.
3. `eps` is `CONFIG.wallStopEpsilon` when `inside(from, CONFIG.wallStopEpsilon)` is true,
   otherwise `CONFIG.conflictEpsilon` (a piece stored up to 0.01 over a wall still slides).
4. If `inside(to, eps)`, return `to`.
5. "Furthest fit from p towards q" (p is inside): `q` if `inside(q, eps)`; otherwise halve
   the segment `CONFIG.wallStopIterations` times keeping the inside end, then round both
   coordinates to the nearest 0.01; if that is not inside, round each coordinate towards
   `p` instead; if that is not inside, the result is `p`.
6. Candidates, each built with step 5:
   - x then y: from `from` towards `(to.x, from.y)`, then from there towards `(that x, to.y)`;
   - y then x: the same with the axes swapped;
   - one slide per distinct wall direction of the outline that is not parallel to an axis:
     with `u` the wall's unit direction and `k = (to − from) · u`, from `from` towards
     `from + k·u` with both coordinates rounded to 0.01 (skipped when `k` is 0).
7. Return the candidate nearest to `to` (straight-line distance); on a tie the earliest in
   the order of step 6.

Rooms used below. R = `(0,0) (144,0) (144,168) (0,168)`. L =
`(0,0) (144,0) (144,84) (72,84) (72,168) (0,168)`. A (one angled wall, on the line
x + y = 244) = `(0,0) (144,0) (144,100) (76,168) (0,168)`. A piece `w×d` is the unturned
rectangle of that size centred on the point, unless a turn is given.

| Case | Input / state | Expected |
|---|---|---|
| Fits | R, 60×80, from (72,84), to (90,90) | (90,90) |
| Past one wall | R, 60×80, from (72,84), to (200,84) | (114,84) |
| Into a corner | R, 60×80, from (72,84), to (200,−50) | (114,40) |
| Each wall | R, 60×80, from (72,84), to (−50,84) / (72,−50) / (72,400) | (30,84) / (72,40) / (72,128) |
| Room not a whole inch | outline `(0,0) (147.5,0) (147.5,168) (0,168)`, 60×80, from (72,84), to (130,84) | (117.5,84) |
| Piece not a whole inch | R, 60.5×80, from (72,84), to (130,84) | (113.75,84) |
| Quarter turn | R, 60×80 turned 90°, from (72,84), to (200,0) | (104,30) |
| Turned 30° | R, 60×80 turned 30°, from (72,84), to (200,84) | result `p` has `p.y = 84`; `inside(p, 1e-6)` is true; `inside((p.x + 0.02, 84), 1e-6)` is false |
| Slide along a wall | R, 60×80, from (114,84), to (130,100) | (114,100) |
| L cut-out | L, 40×40, from (36,126), to (100,126) | (52,126) |
| Jump across the cut-out | L, 40×40, from (36,140), to (110,40) | (110,40) |
| Angled wall, first touch | A, 40×40, from (100,100), to (110,100) | (104,100) |
| Angled wall, slide | A, 40×40, from (104,100), to (130,100) | (117,87) |
| Starts outside | R, 60×80, from (140,84), to (200,84) | (200,84) |
| Too big to fit | R, 200×200, from (72,84), to (10,10) | (10,10) |
| Starts 0.01 over a wall | R, 60×80, from (114.01,84), to (114.01,100) | (114.01,100) |
| Starts 0.01 over, pushed in | R, 60×80, from (114.01,84), to (120,84) | (114.01,84) |
| `to` not rounded | R, 60×80, from (72,84), to (90.004,90.006) | (90,90.01) |
| No move | R, 60×80, from (114,84), to (114,84) | (114,84) |
| CONFIG pin | `catalog.test.ts` config snapshot | gains `wallStopEpsilon: 1e-6`, `wallStopIterations: 26` |

**Test changes:** `room-planner/domain/catalog.test.ts` gains the two new CONFIG values in
its pinned object. No other existing test changes.

**Verify:** `npx vitest run room-planner/domain/wallStop.test.ts room-planner/domain/catalog.test.ts`
→ all pass; `npx tsc --noEmit` → exit 0.

**Commit:** `Room planner: a function that stops a moved piece at the room's walls`

---

## Task 2: Moves use it

**Spec:** "How it works" last paragraph; "Behaviour" rows 1 to 4, 8 to 11; "What does not
change".

**Files:**
- Modify: `room-planner/domain/geometry.ts`
- Test: `room-planner/domain/geometry.test.ts`
- Modify: `room-planner/domain/obstacles.ts`
- Test: `room-planner/domain/obstacles.test.ts`
- Modify: `room-planner/state/planStore.ts`
- Test: `room-planner/state/stores.test.ts`
- Modify: `room-planner/state/actions.ts`
- Test: `room-planner/components/Stage/PlanView.test.tsx`
- Test: `room-planner/hooks/useKeyboardShortcuts.test.tsx`
- Test: `room-planner/state/history.flow.test.tsx`

**Interfaces:**
- Consumes: `stopAtWalls(shapeAt, from, to, outline)` from Task 1; `footprintCorners`, `itemFootprint`, `roomOutline`, `roomBounds` from `room-planner/domain/shape.ts`; `obstaclePolygon` from `room-planner/domain/obstacles.ts`; `boundsOf` from `room-planner/domain/polygon.ts`.
- Produces: `moveItem(item: Item, x: number, y: number, outline: readonly Point[], snap: number): Item`; `shiftItem(item: Item, dx: number, dy: number, outline: readonly Point[]): Item`; `placeItem(item: Item, x: number, y: number, bounds: Bounds, snap: number): Item` (the body `moveItem` has before this task, used only by the store's `addItem`); `moveObstacle(o: Obstacle, x: number, y: number, outline: readonly Point[], snap: number): Obstacle`; `shiftObstacle(o: Obstacle, dx: number, dy: number, outline: readonly Point[]): Obstacle`. The store's action names and signatures (`moveItemTo`, `moveItemBy`, `moveObstacleTo`, `moveObstacleBy`, `addItem`) do not change.

**Behavior:**

Each of the four move functions first computes the place it returns today, with the bounds
taken as `boundsOf(outline)` (grid snap and centre clamp for `move…`, centre clamp for
`shift…`), and then returns the piece at
`stopAtWalls(shapeAt, {x: piece.x, y: piece.y}, thatPlace, outline)`. `shapeAt` is
`footprintCorners(itemFootprint({...item, x, y}))` for furniture and
`obstaclePolygon({...o, x, y})` for an obstacle. The store passes `roomOutline(s.room)`.
Room R and the piece sizes are those of Task 1; furniture `w` is the first number, `d` the
second, `angle` 0.

| Case | Input / state | Expected |
|---|---|---|
| Move inside | R, 60×80 at (72,84), `moveItem` to (90.4, 90.3), snap 1 | same result as before this task: (90,90) |
| Move past a wall | R, 60×80 at (72,84), `moveItem` to (130.4, 84.3), snap 1 | (114,84) |
| Wall beats the grid | outline 147.5 wide, 60×80 at (72,84), `moveItem` to (140,84), snap 1 | (117.5,84) |
| Nudge into a wall | R, 60×80 at (113.5,84), `shiftItem` by (1,0) | (114,84) |
| Nudge at a wall | R, 60×80 at (114,84), `shiftItem` by (1,0) | (114,84) |
| Rug | same as "Move past a wall" with `kind: 'rug'` | (114,84) |
| Piece that starts outside | R, 60×80 at (140,84), `moveItem` to (150.2,84), snap 1 | the result the function gave before this task: (144,84) |
| Box obstacle | R, box 24×24 at (72,84), `moveObstacle` to (−30,84), snap 1 | (12,84) |
| Column obstacle | R, cylinder width 12 at (72,84), `shiftObstacle` by (100,0) | (138,84) |
| New piece | `addItem` in the default room | the same stored position as before this task (existing tests unchanged) |
| Store: blocked nudge | default plan, a piece flush at a wall, `moveItemBy` into the wall | the store's `items` array is the same reference as before the call |
| Store: drag past a wall | `moveItemTo` far outside the room for a piece that starts inside | `findConflicts` gives no `Outside the room` for that piece |
| Store: obstacle | `moveObstacleTo` far outside for an obstacle that starts inside | `findPlanIssues` gives no `Outside the room` for it |
| Undo | history flow: a nudge that a wall blocks completely | adds no undo step |
| Turning | piece flush in a corner, `rotateItemBy(…, 30)` | position unchanged (existing behaviour) |

Doc comments that say only the centre is kept inside (in `geometry.ts`, `obstacles.ts`,
`planStore.ts`, `actions.ts`) are rewritten to state the new rule.

**Test changes:** new tests for the behavior table are added to the listed test files. An existing test in the six listed test files may change only where it (a) calls
one of the four move functions with a bounds argument (it now passes an outline), or (b)
expects a piece that starts inside the room to end partly outside after a move or nudge.
For (b) the test either expects the flush position, or, where the test needs a piece
outside the room, places it there through `usePlanStore.getState().reset(...)` or by
shrinking the room. Every changed test is listed in the task report with the reason. A test
outside these six files that fails is reported to the controller, not edited.

**Verify:** `npx vitest run room-planner` → all pass; `npx tsc --noEmit` → exit 0;
`npx eslint room-planner` → no errors.

**Commit:** `Room planner: moved furniture and obstacles stop at the walls`

---

## Task 3: Live check

**Spec:** "Testing" last bullet.

**Files:**
- Create: `docs/room-planner/verification/2026-11-16-stop-at-walls-live-check.md`
- Create: `docs/room-planner/verification/shots-stop-at-walls/`

**Interfaces:**
- Consumes: the finished feature after Task 2.
- Produces: the live-check record Task 4 links to.

**Behavior:**

Run against `npx next dev -p 3478` in the Playwright test browser (its own profile) at
1440×900, on the final code commit, with real pointer and key events, as one script kept
outside the repo. "Stored" is the parsed value of `localStorage['room-planner:plan:v1']`,
read 500 ms after the last change. "Fresh" removes that key, reloads and chooses
`Side by side`, then removes keyboard focus from the layout option. `hx`, `hy` are half the
width and half the length of the piece's bounding box, computed by the script from the
stored `w`, `d` and `angle`. "Not red" means the piece's sidebar row and its plan button
carry no conflict text (`Outside the room` appears nowhere in the page text for it). The
plan scale is measured again after any change of room size. Record each row as done / read
/ result, in the format of
`docs/room-planner/verification/2026-11-16-undo-redo-live-check.md`. A failed row is
reported to the controller, not fixed in this task; after a fix the whole table is run
again, and the recorded table is a run on the final commit.

| Row | Do | Expect |
|---|---|---|
| W1 | Fresh. Drag the bed towards the top right, releasing 300 px beyond the room's corner in both directions | stored bed `x = 144 − hx`, `y = hy` exactly; not red; screenshot `bed-in-corner.png` |
| W2 | Bed selected: press ArrowRight 3 times, then ArrowUp 3 times | stored bed unchanged |
| W3 | Click `Undo` once | bed at its fresh position; `Undo` greyed out (the blocked presses added no step) |
| W4 | Fresh. Drag the desk 400 px below the bottom wall | stored desk `y = 168 − hy`; `x` within 1 in of where the pointer's x asked; not red |
| W5 | Bed in the top right corner (as W1). Press on it, move the pointer 200 px right of the wall and 80 px down, release | stored `x = 144 − hx`; `y` greater than `hy` by the 80 px in plan inches, within 1 in |
| W6 | Fresh, `Edit room`. Type `12' 3.5"` into sidebar wall 1, `Done`. Drag the bed 300 px past the right wall | room 147.5 wide; stored bed `x = 147.5 − hx` exactly; not red |
| W7 | Fresh, `Edit room`, starting shape `L-shape`, `Done`. Drag the desk to the middle of the cut-out (the script computes that point from the stored outline) | every corner of the desk's footprint is inside the stored outline within 0.01 in; at least one footprint side is within 0.01 in of a cut-out wall; not red |
| W8 | Fresh, `Edit room`. Add a box obstacle and drag it 300 px past the left wall | stored obstacle `x = 12` (half its 24 in width); no conflict text for it |
| W9 | Fresh. Bed into the top right corner. `Edit room`, drag the right wall 24 in left, `Done` | the bed's stored position is unchanged and it is red (`Outside the room`) |
| W10 | Continue W9: drag the bed 5 px left | it moves (stored `x` smaller) and is still red |
| W11 | Continue: drag the bed 150 px left, then 400 px right | after the first drag not red; after the second stored `x = 120 − hx` exactly and not red |
| W12 | Fresh. Bed into the top right corner, press R once | stored `x`, `y` unchanged; stored angle changed (turning is not pushed back) |
| W13 | Fresh. Drag the bed into the corner (one drag); click `Undo` once | bed at its fresh position |
| W14 | Console and requests for the whole run | 0 console errors, warnings or page errors; every request to `localhost:3478` |

**Verify:** the record has rows W1 to W14, each marked Pass, and names the commit under
test; `git rev-parse --short HEAD` printed at the start of the run matches it. A row that
fails means the task is not done.

**Commit:** `Room planner: stop at walls live check`

---

## Task 4: Docs

**Spec:** none of the spec's behaviour; this is the project rule that every change records
its mistakes and keeps the planner README current.

**Files:**
- Modify: `docs/room-planner/mistakes-and-fixes.md`
- Modify: `docs/room-planner/README.md`
- Modify: `docs/room-planner/specs/2026-11-16-stop-at-walls-design.md`

**Interfaces:**
- Consumes: the live-check record of Task 3 and the controller's `mistakes-handover.md` in the plan's lean-sdd workspace.
- Produces: nothing new.

**Behavior:**

| File | Change |
|---|---|
| `docs/room-planner/mistakes-and-fixes.md` | a section `## 2026-11-16 — Stop at walls`, one entry per item in the controller's `mistakes-handover.md`, in the file's entry format; the first entry records that the first slice's "conflict, not a clamp" decision was reversed and why |
| `docs/room-planner/README.md` | the editor description says moved furniture and obstacles stop at walls, and lists what is not pushed back (turning, room changes, pieces already outside); "Known limits" gains the angled-wall lag; the checks line gets the new test-file count, test count and First Load JS; links to this spec, this plan, the plan review (`docs/room-planner/plan-reviews/2026-11-16-stop-at-walls-review.md`) and the live check |
| `docs/room-planner/specs/2026-11-16-stop-at-walls-design.md` | "Known limits" is brought in line with what the live check found (no change if it already is) |

**Verify:** `npm run check` → exit 0; the numbers quoted in the README match its output.

**Commit:** `Room planner: docs for stop at walls`

---

## Plan done

The plan is done when all of these hold on the final commit of `undo-redo`:

- every task's Verify line passed;
- `npm run check` exits 0 and prints `/room-planner` First Load JS between 104 and 107 kB;
- the live-check record shows W1 to W14 as Pass on the final code commit;
- the whole-branch review of lean-sdd (over this plan's commits) has no open Critical or
  Important finding.

Pull request #3 is then updated. It is merged only when the owner says so.
