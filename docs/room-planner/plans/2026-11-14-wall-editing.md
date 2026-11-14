# Wall editing (slice D) Implementation Plan

> **For executors:** execute with soltero-skills:lean-sdd. The Task Dependency
> Table below is the scheduling and review-depth contract.

**Goal:** In room mode, walls can be selected, dragged sideways and given a typed length on
the plan, with every angle kept and a choice of which end moves.

**Spec:** `docs/room-planner/specs/2026-11-14-wall-editing-design.md` (approved by the owner
on 2026-11-14).

**Architecture:** One new pure function, `slideWall`, moves a wall along its normal while
its ends travel along the neighbouring walls' lines; wall dragging, keyboard sliding and
typed lengths all go through it. `rehomeOpenings` is generalised so doors and windows follow
edits that add or remove more than one corner. UI state (selected wall, which end moves)
lives in `uiStore`; nothing new is stored in the plan and the saved format stays at version 3.

**Tech stack / test runner:** Next.js 15, React 19, TypeScript, Zustand 5, Vitest + React
Testing Library + jsdom. One file: `npx vitest run <file>`. Everything:
`npm run check` (typecheck, lint, tests, build). Repo root:
`/Users/franciscosoltero/Desktop/Code/Portfolio Website`. Branch: `wall-editing`.

## Global Constraints

- Units are inches. Plan x runs right, y runs DOWN. Outline corners are `{ id, x, y }` with
  positive signed area. A wall's id is its starting corner's id. For a wall with unit
  direction `u`, the inward normal is `n = (−u.y, u.x)`.
- Every stored number is rounded to 0.01 (`round2`). Every outline edit returns an
  `OutlineResult` built by the existing `settle` in `domain/outline.ts` (normalise, then
  validate); every stored outline goes through `usePlanStore.getState().applyOutline`. The
  editor never stores what `parsePlan` refuses. No change to `planSchema.ts`; the saved
  format stays at version 3.
- Nothing under `room-planner/domain/` or `room-planner/view/` imports three.js or React.
- Only the primary mouse button edits in room mode. Room-mode drags use `useRoomModeDrag`.
- A pointer press that selects something on the plan also moves keyboard focus to a control
  for that thing (lesson 16 of slice C). For walls that control is the wall's length label,
  which Task 8 adds; Task 7 alone does not meet this rule and is not released without Task 8.
- Existing tests pass unchanged unless a task's "Test changes" line names them.
- Implementers stage only their own listed paths. Commits end with the trailer lines the
  dispatch gives. Never touch `Multiplayer_AI_Sprite.aseprite`.
- No new dependency. `/room-planner` First Load JS stays between 104 and 106 kB; the build
  output of `npm run check` prints it, and Tasks 13 and 15 quote that line.
- Fixtures used in the tables below (ids in order):
  - `R`: `c1 (0,0)`, `c2 (144,0)`, `c3 (144,168)`, `c4 (0,168)`.
  - `T`: `c1 (0,0)`, `m1 (48,0)`, `m2 (96,0)`, `c2 (144,0)`, `c3 (144,168)`, `c4 (0,168)`.
  - `U`: `c1 (0,0)`, `x1 (48,0)`, `m1 (48,24)`, `x2 (96,24)`, `m2 (96,0)`, `c2 (144,0)`,
    `c3 (144,168)`, `c4 (0,168)`.
  - `Q`: `q1 (0,0)`, `q2 (100,0)`, `q3 (150,50)`, `q4 (150,150)`, `q5 (0,150)`.
  - `D`: `d1 (0,0)`, `d2 (33.33,14.29)`, `d3 (70,30)`, `d4 (70,100)`, `d5 (0,100)`.
  - `V`: `v1 (0,0)`, `v2 (100,0)`, `v3 (100,100)`, `v4 (108,100)`, `v5 (108,150)`, `v6 (0,150)`.
  - `M64`: 64 corners: `k0 … k61` at `(10·k, 0)` for k = 0 to 61, then `a (610,100)`, `b (0,100)`.
  - `IDS`: `{ start: 'x1', end: 'x2' }`.

## Task Dependency Table

| Task | Files touched | Depends on | Risk tier |
|------|---------------|------------|-----------|
| 1. `slideWall` and its helpers | `room-planner/config.ts`, `room-planner/domain/outline.ts`, `room-planner/domain/outline.test.ts` | — | judgment |
| 2. Openings follow multi-corner edits | `room-planner/domain/openings.ts`, `room-planner/domain/openings.test.ts` | 1 | judgment |
| 3. Typed length keeps angles | `room-planner/domain/outline.ts`, `room-planner/domain/outline.test.ts`, `room-planner/components/Sidebar/WallList.test.tsx`, `room-planner/state/stores.test.ts`, `room-planner/domain/planRoundTrip.test.ts` | 1, 2 | standard |
| 4. UI state: selected wall, which end moves | `room-planner/state/uiStore.ts`, `room-planner/state/stores.test.ts` | 3 | standard |
| 5. Actions | `room-planner/state/actions.ts`, `room-planner/state/stores.test.ts` | 1, 2, 3, 4 | standard |
| 6. Keyboard | `room-planner/hooks/useKeyboardShortcuts.ts`, `room-planner/hooks/useKeyboardShortcuts.test.tsx` | 5 | standard |
| 7. Select, drag and double-click a wall | `room-planner/components/Stage/RoomEditLayer.tsx`, `room-planner/components/Stage/RoomEditLayer.test.tsx`, `room-planner/components/Stage/stage.css` | 5 | judgment |
| 8. Wall length labels | `room-planner/components/Stage/WallLengthLabels.tsx`, `room-planner/components/Stage/WallLengthLabels.test.tsx`, `room-planner/components/Stage/RoomEditLayer.tsx`, `room-planner/components/Stage/RoomEditLayer.test.tsx`, `room-planner/components/Stage/stage.css`, `room-planner/config.ts` | 6, 7 | standard |
| 9. On-plan length editor | `room-planner/components/Stage/WallLengthLabels.tsx`, `room-planner/components/Stage/WallLengthLabels.test.tsx`, `room-planner/components/Stage/stage.css` | 8 | judgment |
| 10. Moving-end marks and dimension-line offset | `room-planner/components/Stage/WallLengthLabels.tsx`, `room-planner/components/Stage/WallLengthLabels.test.tsx`, `room-planner/components/Stage/PlanView.tsx`, `room-planner/components/Stage/PlanView.test.tsx`, `room-planner/components/Stage/stage.css`, `room-planner/config.ts` | 9 | standard |
| 11. Sidebar: which-end control, row selects its wall, hint | `room-planner/components/Sidebar/WallList.tsx`, `room-planner/components/Sidebar/WallList.test.tsx`, `room-planner/components/Sidebar/RoomSection.tsx`, `room-planner/components/Sidebar/RoomSection.test.tsx`, `room-planner/components/Sidebar/sidebar.css` | 5 | standard |
| 12. Round trip with slid walls | `room-planner/domain/planRoundTrip.test.ts` | 5 | mechanical |
| 13. Deferred findings | the files named in `.soltero/lean-sdd/2026-11-14-wall-editing/deferred.md`, each of which is already listed in Tasks 1 to 12 | 1–12 | standard |
| 14. Live check | `docs/room-planner/verification/2026-11-14-wall-editing-live-check.md`, `docs/room-planner/verification/shots-wall-editing/` | 13 | judgment |
| 15. Docs | `docs/room-planner/mistakes-and-fixes.md`, `docs/room-planner/README.md`, `README.md`, `CLAUDE.md` | 14 | mechanical |

All tasks run one at a time, in the order of their numbers. Files shared between tasks:
`outline.ts` and `outline.test.ts` (1, 3); `config.ts` (1, 8, 10); `stores.test.ts`
(3, 4, 5); `planRoundTrip.test.ts` (3, 12); `WallList.test.tsx` (3, 11);
`RoomEditLayer.tsx` and its test (7, 8); `WallLengthLabels.tsx` and its test (8, 9, 10);
`stage.css` (7, 8, 9, 10). Task 11's files are disjoint from Tasks 6 to 10, but it still
runs after Task 10 so only one writer is active.

**Rollback.** Each task is one commit (plus fix commits); `git revert` undoes it. Reverts
run newest first: Tasks 2 to 12 consume Task 1's and Task 3's interfaces, so Task 1 cannot
be reverted alone. No task changes stored data, so a revert never strands a saved plan.
Nothing reaches users until the pull request is merged; the whole slice is undone by
reverting that merge. No feature flag is used: the change is client-side editing behaviour
only, and Tasks 2 and 3 change two existing behaviours on purpose (see "Decisions made in
this plan" 2 and 5), which the pull request body must name.

**Done when:** every task's Verify passes; `npm run check` exits 0 on the final commit; its
build output shows `/room-planner` First Load JS between 104 and 106 kB; every live-check
row W1 to W22 is recorded as pass; the whole-branch review has no open Critical or
Important finding.

---

## Task 1: `slideWall` and its helpers

**Spec:** Behaviour 1 (rows 2 to 6), "How it is built" bullets 1, 2 and 4.

**Files:**
- Modify: `room-planner/config.ts`
- Modify: `room-planner/domain/outline.ts`
- Test: `room-planner/domain/outline.test.ts`

**Interfaces:**
- Consumes: the existing `settle`, `unchanged`, `notFinite`, `wallsOf`, `Wall`,
  `OutlineResult` in `domain/outline.ts`; `Corner`, `Point` from `domain/types.ts`.
- Produces:
  - `CONFIG.sameDirectionSlack: 0.005` and `CONFIG.wallDragThresholdPx: 4`.
  - `export function wallFrame(wall: Wall): { u: Point; n: Point }` (unit direction and
    inward normal; a zero-length wall gives `u = (1, 0)`, `n = (0, 1)`).
  - `export function sameDirection(u: Point, v: Point): boolean`: for unit vectors,
    `|u.x·v.y − u.y·v.x| ≤ CONFIG.sameDirectionSlack` and `u·v > 0`.
  - `export function slideWall(outline: readonly Corner[], wallId: string, distance: number, ids: { start: string; end: string }): OutlineResult`
  - `export function wallSlideStops(outline: readonly Corner[], wallId: string): number[]`
  - `export function snapSlideDistance(raw: number, stops: readonly number[]): number`

**`slideWall` rules.** Wall W runs from A (index i) to B (i+1); P is the corner before A,
N the corner after B; `u`, `n` are W's frame; `d = distance`; `p = unit(A − P)`;
`q = unit(N − B)`.

1. `d` not finite → `notFinite()`. Unknown wall → `unchanged(outline)`. `|d| < 0.005` →
   `unchanged(outline)`.
2. Start end. If `sameDirection(p, u)`: a new corner `{ id: ids.start }` at A's old
   position is inserted just before A, and A moves to `A + n·d`. Otherwise A moves to
   `A + p·(d / (p·n))`; if that point is within 0.01 of P, A takes P's exact coordinates
   and P is removed from the outline.
3. End end. If `sameDirection(q, u)`: a new corner `{ id: ids.end }` at `B + n·d` is
   inserted just after A (between A and B), and B stays. Otherwise B moves to
   `B + q·(d / (q·n))`; if that point is within 0.01 of N, B is removed from the outline
   (W then ends at N, which stays).
4. Every other corner keeps its id, position and order. The result is `settle(candidate)`,
   so every existing outline rule (short wall, too few, too many, too large, crossing)
   applies without new code.

The core, for exactness (start end; the end end mirrors it):

```ts
const pn = p.x * n.x + p.y * n.y;
if (sameDirection(p, u)) {
  inserted = { id: ids.start, x: A.x, y: A.y };
  movedA = { id: A.id, x: A.x + n.x * d, y: A.y + n.y * d };
} else {
  const t = d / pn;
  movedA = { id: A.id, x: A.x + p.x * t, y: A.y + p.y * t };
  if (Math.hypot(movedA.x - P.x, movedA.y - P.y) <= 0.01) {
    movedA = { id: A.id, x: P.x, y: P.y };
    removed.add(P.id);
  }
}
```

**`wallSlideStops`**: the distances at which a neighbour's length reaches zero: for a start
neighbour that is not `sameDirection`, `−|A − P| · (p·n)`; for an end neighbour that is not
`sameDirection`, `|N − B| · (q·n)`. Returned rounded to 0.0001, without duplicates, ascending.
Unknown wall → `[]`.

**`snapSlideDistance(raw, stops)`**: the stop nearest to `raw` when one lies within
`CONFIG.cornerSnap / 2` of it (inclusive); otherwise `raw` rounded to the nearest multiple
of `CONFIG.cornerSnap`. A non-finite `raw` is returned as it is.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Plain slide, top wall | `slideWall(R, 'c1', 12, IDS)` | ok: `c1 (0,12)`, `c2 (144,12)`, `c3`, `c4` unchanged |
| Plain slide, outward | `slideWall(R, 'c2', -24, IDS)` | ok: `c1 (0,0)`, `c2 (168,0)`, `c3 (168,168)`, `c4 (0,168)` |
| Same-direction neighbours make a step | `slideWall(T, 'm1', 24, IDS)` | ok and equal to `U` |
| Sliding back removes the step | `slideWall(U, 'm1', -24, IDS)` | ok and equal to `T` |
| Sliding through makes a bump | `slideWall(U, 'm1', -36, IDS)` | ok: as `U` but `m1 (48,-12)`, `x2 (96,-12)` |
| Diagonal neighbour | `slideWall(Q, 'q1', 10, IDS)` | ok: `q1 (0,10)`, `q2 (110,10)`, others unchanged |
| Neighbour used up | `slideWall(Q, 'q1', 50, IDS)` | ok, 4 corners: `q1 (0,50)`, `q3 (150,50)`, `q4`, `q5` |
| Nearly the same direction counts as the same | `slideWall(D, 'd2', 10, IDS)` | ok, 6 corners: `d1`, `x1 (33.33,14.29)`, `d2 (29.39,23.48)`, `d3 (70,40.88)`, `d4`, `d5` |
| Short wall | `slideWall(R, 'c1', 163, IDS)` | `{ ok: false, problem: 'short-wall' }` |
| Too few | `slideWall(R, 'c1', 168, IDS)` | `{ ok: false, problem: 'too-few' }` |
| Too many | `slideWall(M64, 'k1', 10, IDS)` (two corners would be added to 64) | `{ ok: false, problem: 'too-many' }` |
| Too large | `slideWall(R, 'c1', -600, IDS)` | `{ ok: false, problem: 'too-large' }` |
| Crossing | `slideWall(Q, 'q1', 120, IDS)` | `{ ok: false, problem: 'crossing' }` |
| Not finite | `distance` `NaN` or `Infinity` | `{ ok: false, problem: 'too-large' }` |
| Unknown wall, zero distance | `slideWall(R, 'zz', 12, IDS)`; `slideWall(R, 'c1', 0, IDS)` | ok, outline equal to `R` |
| Ids | every ok case above | no id other than `ids.start` / `ids.end` is new; every wall id present before and after is the same wall |
| No drift | `slideWall(Q, 'q1', 10, IDS)` then `slideWall(result, 'q1', -10, IDS)`, repeated 20 times | every corner within 0.02 of `Q` |
| Input untouched | frozen input outline | no mutation (no throw) |
| Stops | `wallSlideStops(R, 'c1')`; `(Q, 'q1')`; `(U, 'm1')`; `(T, 'm1')`; unknown wall | `[168]`; `[50, 150]`; `[-24]`; `[]`; `[]` |
| Snap to a stop | `snapSlideDistance(10.6, [10.3])`; `snapSlideDistance(9.8, [10.3])` | `10.3`; `10.3` |
| Snap to the grid | `snapSlideDistance(9.7, [10.3])`; `snapSlideDistance(3.4, [])` | `10`; `3` |
| Frame | `wallFrame` of `R`'s walls `c1`, `c2`, `c3`, `c4` | `n` = `(0,1)`, `(-1,0)`, `(0,-1)`, `(1,0)` |

**Verify:** `npx vitest run room-planner/domain/outline.test.ts` → all pass; `npm run check`
→ exit 0.
**Commit:** `feat(room-planner): slide a wall along its normal, keeping every angle`

## Task 2: Openings follow multi-corner edits

**Spec:** "How it is built" bullet 3; Behaviour 1 row "Doors and windows".

**Files:**
- Modify: `room-planner/domain/openings.ts`
- Test: `room-planner/domain/openings.test.ts`

**Interfaces:**
- Consumes: `sameDirection` and `LIMIT_SLACK` from `domain/outline.ts` (Task 1 / existing);
  the existing private `rehomedOffset`, `settle`, `refuse`, `rehomeReversed`, `sameIds` in
  `domain/openings.ts`.
- Produces: `rehomeOpenings(before, after, openings)` with the same signature and the wider
  rule below. The private `rehomeAdded` is replaced by the general rule.

**Rule (replaces everything after the "reversed" branch).** No openings → ok, empty. Same
ids in the same order → `settle(after, openings)`. Same ids reversed → `rehomeReversed`.
Otherwise let `common` be the ids present in both outlines. If `common` is empty, or the
`before` ids filtered to `common` are not in the same order as the `after` ids filtered to
`common`, refuse `shape-has-openings`. Otherwise, for each opening `o` on wall `w`:

1. `w` is not in `after` → refuse `corner-has-openings`.
2. In `before`, wall `w` ran from corner `w` to corner `c`. In `after`, let `c2` be the
   first corner after `w` that is in `common`, and `chain` the `after` corners from `w` to
   `c2` inclusive (so `chain.length − 2` corners were added on it).
3. If `c2 ≠ c` (one or more corners after `w` were removed): the opening is kept only when
   `sameDirection(unit(before[c] − before[w]), unit(after[c2] − after[w]))`; otherwise
   refuse `corner-has-openings`.
4. If `chain.length = 2`: keep `o` unchanged.
5. If corners were added and the chain is straight (every chain segment is
   `sameDirection` as the first): let `t(j)` be the distance of chain corner `j` from `w`
   along the chain (`t(0) = 0`) and `len(j) = t(j+1) − t(j)`. An opening with
   `o.offset ≥ t(j) − LIMIT_SLACK` and `o.offset + o.width ≤ t(j+1) + LIMIT_SLACK` goes to
   the wall starting at chain corner `j`, with offset
   `rehomedOffset(o.offset − t(j), len(j), o.width)`; for `j = 0` the opening is kept
   unchanged, as today. An opening that fits no single segment refuses `corner-in-opening`.
6. If corners were added and the chain is not straight: keep `o` unchanged (it stays on
   `w` with its offset).

The first refusal in opening order wins. Then `settle(after, moved)`.

This cannot leave an opening without a wall: an opening is kept only on a wall id that
exists in `after`, and `settle` refuses any opening that does not fit that wall.

**Behavior** (`D1` is the test file's door on `c1`, offset 20, width 32; `win(id, wall, offset, width = 36)`):

| Case | Input / state | Expected |
|------|---------------|----------|
| Existing behaviour | every existing `rehomeOpenings` test | passes unchanged |
| Step created (two corners added) | before `T`, after `U`; door on `c1` offset 8 width 32, door on `m1` offset 8 width 32, window on `m2` offset 6 | ok, the three openings unchanged |
| Step removed (two corners removed) | before `U`, after `T`, the same three openings | ok, unchanged |
| Opening on a removed step | before `U`, after `T`, a window `win('w', 'x1', 0, 12)` | `corner-has-openings` |
| Wall slid, neighbour used up | before `Q`, after `q1 (0,50)`, `q3 (150,50)`, `q4`, `q5`; door on `q1` offset 10 width 32 | ok, unchanged |
| Opening on the used-up wall | the same outlines; `win('w', 'q2', 10, 36)` | `corner-has-openings` |
| Two corners added on one straight wall | before `R`, after `c1`, `n1 (40,0)`, `n2 (100,0)`, `c2`, `c3`, `c4`; `win('a', 'c1', 50)`; `win('b', 'c1', 104)`; `win('c', 'c1', 2)` | ok: `a` on `n1` offset 10; `b` on `n2` offset 4; `c` on `c1` offset 2 |
| Opening across an added corner | the same outlines, `D1` (20 to 52) | `corner-in-opening` |
| Corner in line removed, door before it | before `T`, after `T` without `m1`; door on `c1` offset 8 width 32 | ok, unchanged (new: the wall keeps its direction) |
| Corner in line removed, door on its wall | the same outlines; door on `m1` offset 8 width 32 | `corner-has-openings` |
| Corner removed, direction changes | before `R`, after `R` without `c2`, `D1` | `corner-has-openings` (as today) |
| No common ids | before `R`, after four corners with new ids, `D1` | `shape-has-openings` (as today) |
| Common ids out of order | before `R`, after `c1 (0,0)`, `c3 (144,0)`, `c2 (144,168)`, `c4 (0,168)`, `D1` | `shape-has-openings` |
| Slid wall too short for its door | before `Q`, after `q1 (70,0)`, `q2`, `q3`, `q4`, `q5 (70,150)` (wall `q1` is 30 long); door on `q1` offset 0 width 32 | `opening-off-wall` |
| Input untouched | frozen openings and outlines | no mutation |

**Verify:** `npx vitest run room-planner/domain/openings.test.ts room-planner/state/stores.test.ts room-planner/domain/planRoundTrip.test.ts`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): doors and windows follow edits that add or remove several corners`

## Task 3: Typed length keeps angles

**Spec:** Behaviour 3 (rows 4 to 6).

**Files:**
- Modify: `room-planner/domain/outline.ts`
- Test: `room-planner/domain/outline.test.ts`
- Modify: `room-planner/components/Sidebar/WallList.test.tsx` (expectations only, see Test changes)
- Modify: `room-planner/state/stores.test.ts` (expectations only)
- Modify: `room-planner/domain/planRoundTrip.test.ts` (expectations only)

**Interfaces:**
- Consumes: `slideWall`, `wallFrame`, `sameDirection` (Task 1). Task 2 must be in place
  first, because the sidebar's typed lengths reach the store through `applyOutline`, which
  re-homes openings, and a typed length can now add or remove two corners.
- Produces:
  - `export type LengthAnchor = 'start' | 'both' | 'end';`
  - `setWallLength(outline: readonly Corner[], wallId: string, length: number, anchor: LengthAnchor = 'end', newId: () => string = () => crypto.randomUUID()): OutlineResult`
    (the first three parameters are unchanged, so existing callers compile).

**Rules.** Let W be the wall, `u` its direction, `L` its current length, `Δ = length − L`.
The existing early refusals keep their order and results (not finite → too-large, unknown
wall → unchanged, below `CONFIG.wallMin` → short-wall, zero-length wall → short-wall).

- Moving the end by `δ` (`moveEnd`): let M be the next wall (B → N). If
  `sameDirection(unit(N − B), u)`: B moves to `B + u·δ` and nothing else changes. Otherwise
  the result is `slideWall(outline, M.id, δ · (u · nM), { start: newId(), end: newId() })`,
  where `nM` is M's inward normal.
- Moving the start by `δ` (`moveStart`): let K be the previous wall (P → A). If
  `sameDirection(unit(A − P), u)`: A moves to `A − u·δ`. Otherwise the result is
  `slideWall(outline, K.id, −δ · (u · nK), { start: newId(), end: newId() })`.
- `'end'` = `moveEnd(Δ)`; `'start'` = `moveStart(Δ)`; `'both'` = `moveStart(Δ/2)` and then,
  on its accepted outline, `moveEnd(Δ/2)`; a refusal of either step refuses the whole edit
  with that problem and nothing is changed.
- Each step's result is settled (rounded and validated).

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| End, rectangle | `setWallLength(R, 'c1', 120)` | ok: `c1 (0,0)`, `c2 (120,0)`, `c3 (120,168)`, `c4 (0,168)` |
| Start, rectangle | `setWallLength(R, 'c1', 120, 'start')` | ok: `c1 (24,0)`, `c2 (144,0)`, `c3 (144,168)`, `c4 (24,168)` |
| Both, rectangle | `setWallLength(R, 'c1', 120, 'both')` | ok: `c1 (12,0)`, `c2 (132,0)`, `c3 (132,168)`, `c4 (12,168)` |
| End, diagonal neighbour | `setWallLength(Q, 'q1', 110)` | ok: `q2 (110,0)`, `q3 (150,40)`, others unchanged |
| Start, perpendicular neighbour | `setWallLength(Q, 'q1', 110, 'start')` | ok: `q1 (-10,0)`, `q5 (-10,150)`, others unchanged |
| Same-direction neighbour at the end | `setWallLength(T, 'm1', 60)` | ok: `m2 (108,0)`, every other corner unchanged, 6 corners |
| Same-direction neighbours, both | `setWallLength(T, 'm1', 60, 'both')` | ok: `m1 (42,0)`, `m2 (102,0)`, others unchanged |
| Angles kept | each ok case above | every wall id present before and after has the same direction within `CONFIG.sameDirectionSlack` |
| Length reached | each ok case above | the wall's length is within 0.02 of the requested length |
| Same length | `setWallLength(R, 'c1', 144, 'both')` | ok, equal to `R` |
| Refusals | length `5.9`; `-1`; `NaN`; unknown wall | short-wall; short-wall; too-large; ok and equal to the input |
| Too large | `setWallLength(R, 'c1', 800)` | `{ ok: false, problem: 'too-large' }` |
| Start alone is fine | `setWallLength(V, 'v1', 112, 'start')` | ok: `v1 (-12,0)`, `v6 (-12,150)`, others unchanged |
| Both, second step refused | `setWallLength(V, 'v1', 112, 'both')` (the end step would leave wall `v3` 2 in long) | `{ ok: false, problem: 'short-wall' }` |
| `newId` | `setWallLength(R, 'c1', 120, 'end', () => 'unused')` | no corner has the id `unused` |

**Test changes.** After the change, run the four test files of this task. An existing
assertion may be changed only if it now fails and it asserts the result of a typed wall
length (`setWallLength`, or typing in a wall row); it is changed to the value these rules
give. Known in advance: in `outline.test.ts`, "moves only the wall end corner along the
wall" now expects `c1 (0,0)`, `c2 (120,0)`, `c3 (120,168)`, `c4 (0,168)` and is renamed
"moves the wall end and slides the next wall"; "keeps the direction of an angled wall"
keeps its expected `c2 (60,80)`. A refusal test whose input no longer refuses for the named
reason keeps its name and gets a new input that does. The report lists every changed
assertion with its old and new value. A file with no failing assertion is left untouched.

**Verify:** `npx vitest run room-planner/domain/outline.test.ts room-planner/components/Sidebar room-planner/state room-planner/domain/planRoundTrip.test.ts`
→ all pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): a typed wall length keeps every angle and can move either end`

## Task 4: UI state: selected wall, which end moves

**Spec:** "How it is built" bullet 5; Behaviour 1 row 1; Behaviour 3 rows 1 and 2.

**Files:**
- Modify: `room-planner/state/uiStore.ts`
- Test: `room-planner/state/stores.test.ts`

**Interfaces:**
- Consumes: `LengthAnchor` from `domain/outline.ts` (Task 3).
- Produces, on `UiState`:
  - `selectedWallId: string | null` (initial `null`)
  - `lengthAnchor: LengthAnchor` (initial `'end'`)
  - `selectWall(id: string | null): void`
  - `setLengthAnchor(a: LengthAnchor): void`

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Select a wall | `selectWall('c1')` with a corner, opening or obstacle selected | `selectedWallId` `'c1'`; the other three selections `null` |
| Clear | `selectWall(null)` | only `selectedWallId` becomes `null` |
| Other selections clear the wall | `selectCorner('c2')`, `selectOpening('d')`, `selectObstacle('o')` with a wall selected | `selectedWallId` `null` |
| Clearing another selection | `selectCorner(null)` with a wall selected | the wall stays selected |
| Arming a tool | `setRoomTool('door')` with a wall selected | `selectedWallId` `null` |
| Leaving room mode | `setMode('furnish')` | `selectedWallId` `null`; `lengthAnchor` unchanged |
| Anchor | `setLengthAnchor('both')` | `lengthAnchor` `'both'` |
| Reset | `reset()` | `selectedWallId` `null`, `lengthAnchor` `'end'` |

**Verify:** `npx vitest run room-planner/state/stores.test.ts` → all pass; `npm run check`
→ exit 0.
**Commit:** `feat(room-planner): UI state for the selected wall and which end a length moves`

## Task 5: Actions

**Spec:** Behaviour 1 (snapping, refusals, doors and windows), "How it is built" bullet 4.

**Files:**
- Modify: `room-planner/state/actions.ts`
- Test: `room-planner/state/stores.test.ts`

**Interfaces:**
- Consumes: `slideWall`, `wallSlideStops`, `snapSlideDistance`, `wallFrame`, `wallsOf`,
  `LIMIT_SLACK` from `domain/outline.ts` (Task 1 / existing); `setWallLength` (Task 3);
  `selectedWallId`, `lengthAnchor` (Task 4); the existing private `applyRoomEdit`,
  `recordRoomOutcome`, `hasCorner` in `state/actions.ts`.
- Produces, exported from `state/actions.ts`:
  - `export interface WallSlide { wallId: string; outline: readonly Corner[]; ids: { start: string; end: string }; stops: readonly number[]; normal: Point }`
  - `startWallSlide(wallId: string): WallSlide | null`: a snapshot of the stored outline,
    fresh ids from `crypto.randomUUID()`, `wallSlideStops` and the wall's inward normal;
    `null` for an unknown wall.
  - `slideWallTo(slide: WallSlide, rawDistance: number): void`: applies
    `slideWall(slide.outline, slide.wallId, snapSlideDistance(rawDistance, slide.stops), slide.ids)`
    through `applyRoomEdit`.
  - `slideSelectedWallToward(direction: Point, step: number): void` (rule below).
  - `setWallLengthTo(wallId: string, inches: number): boolean`: an unknown wall returns
    `false` and changes nothing, the room problem included. `inches > CONFIG.roomMax + LIMIT_SLACK`
    records `too-large` and returns `false`. Otherwise applies
    `setWallLength(outline, wallId, inches, useUiStore.getState().lengthAnchor)` through
    `applyRoomEdit` and returns whether it was accepted.

**`slideSelectedWallToward` rule.** Let W be the selected wall in the stored outline (none,
or an id not in the outline → return, changing nothing). `along = direction · n`, with `n`
W's inward normal. `|along| < 1e-9` → return, changing nothing, the room problem included.
`d = sign(along) × step`. Among `wallSlideStops(outline, W.id)`, if any stop `s` has the
sign of `d` and `0 < |s| < |d|`, `d` becomes the such stop with the smallest `|s|`. No
grid snapping is applied (as for the existing corner nudge). The edit is
`slideWall(outline, W.id, d, { start: crypto.randomUUID(), end: crypto.randomUUID() })`
through `applyRoomEdit`, computed from the stored outline at the time of the key press.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Slide follows the snapshot | store `R`; `s = startWallSlide('c1')`; `slideWallTo(s, 11.6)`; then `slideWallTo(s, 3.2)` | outline `c1 (0,12)`, `c2 (144,12)`; then `c1 (0,3)`, `c2 (144,3)` |
| Back to the start | then `slideWallTo(s, 0.2)` | outline equal to `R`; room problem `null` |
| Step made and removed within one slide | store `T`; `s = startWallSlide('m1')`; `slideWallTo(s, 24)`; `slideWallTo(s, 0)`; `slideWallTo(s, 24)` | 8 corners including the ids `s.ids.start` and `s.ids.end`; then equal to `T`; then the same 8 corners with the same ids |
| Refused step | store `R`; `slideWallTo(s, 12)` then `slideWallTo(s, 165)` | outline stays at the 12 in result; room problem is `ROOM_PROBLEM_TEXT['short-wall']`; a following `slideWallTo(s, 20)` is accepted and clears it |
| Stop is magnetic | store `Q`; `s = startWallSlide('q1')`; `slideWallTo(s, 49.7)` | 4 corners, `q1 (0,50)` |
| Doors follow | store `T` with a door on `m1` (offset 8, width 32) and a window on `c1` (offset 4, width 36); `slideWallTo(startWallSlide('m1'), 24)` | accepted; both openings unchanged in the store |
| Door blocks | store `R` with a door on `c2` offset 100 width 32; `slideWallTo(startWallSlide('c1'), 60)` | refused: outline unchanged, problem `ROOM_PROBLEM_TEXT['opening-off-wall']` |
| Furniture is not moved | store `R` with an item whose footprint centre is `(72, 10)`; `slideWallTo(startWallSlide('c1'), 40)` | the item's stored position is unchanged; `findConflicts` reports it as `Outside the room` |
| Unknown wall | `startWallSlide('zz')` | `null` |
| Keyboard slide | store `R`, wall `c1` selected; `slideSelectedWallToward({ x: 0, y: 1 }, 1)` | `c1 (0,1)`, `c2 (144,1)` |
| Keyboard, opposite | then `slideSelectedWallToward({ x: 0, y: -1 }, 12)` | `c1 (0,-11)`, `c2 (144,-11)` |
| Keyboard, along the wall | `slideSelectedWallToward({ x: 1, y: 0 }, 1)` on wall `c1` | nothing changes, the room problem included |
| Keyboard lands on a stop | store `U` with the step 6.4 deep (`m1 (48,6.4)`, `x2 (96,6.4)`), wall `m1` selected (its stop is −6.4); `slideSelectedWallToward({ x: 0, y: -1 }, 12)` | the outline equals `T` (the step is removed; the wall does not jump 12 in to a bump) |
| Keyboard, no wall | no wall selected, or the selected id is not in the outline | nothing changes |
| Typed length uses the anchor | store `R`; `setLengthAnchor('start')`; `setWallLengthTo('c1', 120)` | `true`; outline `c1 (24,0)`, `c2 (144,0)`, `c3 (144,168)`, `c4 (24,168)` |
| Typed length refused | `setWallLengthTo('c1', 5)`; `setWallLengthTo('c1', 721)` | `false`, problem short-wall text; `false`, problem too-large text; outline unchanged |
| Typed length, unknown wall | `setWallLengthTo('zz', 100)` with a room problem set | `false`; the outline and the room problem are unchanged |

**Verify:** `npx vitest run room-planner/state/stores.test.ts` → all pass; `npm run check`
→ exit 0.
**Commit:** `feat(room-planner): actions for sliding a wall and typing its length`

## Task 6: Keyboard

**Spec:** Behaviour 2 row "Keyboard".

**Files:**
- Modify: `room-planner/hooks/useKeyboardShortcuts.ts`
- Test: `room-planner/hooks/useKeyboardShortcuts.test.tsx`

**Interfaces:**
- Consumes: `slideSelectedWallToward` (Task 5); `selectedWallId`, `selectWall` (Task 4);
  `CONFIG.nudgeStep` (1) and `CONFIG.nudgeStepLarge` (12).
- Produces: no new exports. In `onRoomKeyDown`, a selected wall counts as a room selection.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Arrow | room mode, store `R`, wall `c1` selected, focus on `document.body`; `ArrowDown` | `slideSelectedWallToward({ x: 0, y: 1 }, 1)`: `c1 (0,1)`, `c2 (144,1)`; `preventDefault` called |
| Shift+Arrow | then `Shift+ArrowDown` | the wall moves a further 12 in |
| Arrow along the wall | `ArrowRight` with wall `c1` selected | outline unchanged; `preventDefault` still called (as for a door) |
| In a field | wall selected, focus in an `<input type="number">` or a radio; `ArrowDown` | the wall does not move; `preventDefault` not called |
| Escape | wall selected, tool `corner`; `Escape` | `selectedWallId` `null` |
| Escape with a tool armed | door tool armed; `Escape` | the tool is disarmed (as today) |
| Delete | wall selected; `Delete` or `Backspace` | outline unchanged; the wall stays selected |
| `R` key | wall selected; `r` | nothing changes |
| Furnish mode | furnish mode; `ArrowDown` | the existing furnish behaviour; no wall moves |
| Existing shortcuts | every existing shortcut test | passes unchanged |

**Verify:** `npx vitest run room-planner/hooks/useKeyboardShortcuts.test.tsx` → all pass;
`npm run check` → exit 0.
**Commit:** `feat(room-planner): arrow keys slide the selected wall`

## Task 7: Select, drag and double-click a wall

**Spec:** Behaviour 1 (all rows).

**Files:**
- Modify: `room-planner/components/Stage/RoomEditLayer.tsx`
- Test: `room-planner/components/Stage/RoomEditLayer.test.tsx`
- Modify: `room-planner/components/Stage/stage.css`

**Interfaces:**
- Consumes: `startWallSlide`, `slideWallTo`, `WallSlide`, `addCornerOnWall`,
  `placeOpeningOnWall` from `state/actions.ts` (Task 5 / existing); `selectedWallId`,
  `selectWall` (Task 4); `CONFIG.wallDragThresholdPx` (Task 1); the existing
  `useRoomModeDrag`, `isPrimaryPress` in `RoomEditLayer.tsx`.
- Produces: on each `.room-wall-hit`, the class `is-selected` while its wall is selected.
  No new exports. Keyboard focus on a wall press is added by Task 8 (see Global Constraints).

**Behavior** (tool `corner` unless stated; `scale` is the layout's px per inch; the drag's
raw distance is `(dx · n.x + dy · n.y) / scale` with `n` from `WallSlide.normal`):

| Case | Input / state | Expected |
|------|---------------|----------|
| Press selects | primary pointer down on wall `c1`'s band | `selectedWallId` `'c1'`; no corner added; the press does not reach the backdrop |
| Click adds nothing | pointer down then pointer up with no move | outline unchanged, 4 corners |
| Under the threshold | pointer down, move 3 px, up | outline unchanged |
| Drag slides | pointer down on the top wall of `R`, move by `(0, 12·scale + 0.4)` px | outline `c1 (0,12)`, `c2 (144,12)` |
| Only the normal counts | on the top wall, move by `(50, 12·scale)` px | the same outline as the row above |
| Vertical wall | on the right wall (`c2`), move by `(-24·scale, 7)` px | `c2 (120,0)`, `c3 (120,168)` |
| Past the threshold, then back | move 10 px down, then back to 1 px | the wall follows back (outline equal to the start); it does not stick at the threshold |
| Layout frozen | during the drag | `FreezePlanLayoutContext` called with the layout at pointer down and with `null` at pointer up |
| Refused step | a move that would leave a 5 in wall | outline stays at the last accepted step; `roomProblem` set; a later valid move clears it |
| Mode left mid-drag | mode set to `furnish` during the drag | later moves edit nothing |
| Double-click adds a corner | `doubleClick` on the top wall at the pane point of plan `(60, 0)` | a corner is added at `(60, 0)` and selected (5 corners) |
| Double-click near a wall end | `doubleClick` within 6 in of the wall's end | nothing added; `roomProblem` is the short-wall text |
| Tool armed | door tool armed; pointer down on a wall; then a 20 px move | a door is placed (as today); the wall is not selected and does not slide |
| Tool armed, double-click | door tool armed; `doubleClick` on a wall | no corner added |
| Secondary button | pointer down with `button: 2` | nothing selected, nothing frozen, nothing moved |
| Selected class | wall `c2` selected | only its band has `is-selected` |
| Backdrop | pointer down on the backdrop | `selectedWallId` `null`, as the other room selections |
| Styles (asserted on the stylesheet text, as the file's existing stacking test does) | `stage.css` | a rule `.room-wall-hit.is-selected` with `background: color-mix(in srgb, var(--color-accent) 40%, transparent);`; `.room-wall-hit` has `cursor: grab;` (was `copy`); `.room-edit-layer.is-placing .room-wall-hit` keeps `cursor: crosshair;` |

**Test changes:** the two existing tests "pointer down on a wall adds a corner at the
pointer position in plan inches and selects it" and "pointer down on a wall within 6 in of
its end adds nothing and gives the reason" are rewritten to use a double-click, with the
same expected results. No other existing test changes.

**Verify:** `npx vitest run room-planner/components/Stage/RoomEditLayer.test.tsx` → all
pass; `npm run check` → exit 0.
**Commit:** `feat(room-planner): click selects a wall, drag slides it, double-click adds a corner`

## Task 8: Wall length labels

**Spec:** Behaviour 2 rows 1, 5 and 6.

**Files:**
- Create: `room-planner/components/Stage/WallLengthLabels.tsx`
- Test: `room-planner/components/Stage/WallLengthLabels.test.tsx`
- Modify: `room-planner/components/Stage/RoomEditLayer.tsx`
- Test: `room-planner/components/Stage/RoomEditLayer.test.tsx`
- Modify: `room-planner/components/Stage/stage.css`
- Modify: `room-planner/config.ts`

**Interfaces:**
- Consumes: `selectedWallId`, `selectWall` (Task 4); `wallFrame`, `wallsOf` from
  `domain/outline.ts`; `fmtLen` from `domain/units.ts`; `toPane`, `PlanLayout` from
  `view/planLayout.ts`; the arrow-key handling of Task 6.
- Produces:
  - `export function WallLengthLabels({ layout }: { layout: PlanLayout }): JSX.Element`,
    rendered by `RoomEditLayer` after the wall bands and before the opening handles.
  - `CONFIG.wallLabelOffsetPx: 18`.
  - Each label is `button.room-wall-label` with `data-wall-label-id="<wall id>"`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| One label per wall | `R`, units `ft` | 4 `button.room-wall-label`, text `fmtLen(wall.length, units)`, accessible name `Wall <n>, <that text>` |
| Position | each label | its inline `left` / `top` are the wall's midpoint in pane px moved `CONFIG.wallLabelOffsetPx` along `−n` (outside the room) |
| Units | units changed to `m` | the label texts follow |
| Selected | wall `c2` selected | its label has `aria-pressed="true"`, the others `"false"` |
| Focus selects | a label receives focus | its wall is selected |
| Press does not clear | pointer down on a label | does not reach the backdrop |
| Wall press focuses its label | primary pointer down on wall `c1`'s band (in `RoomEditLayer`) | `document.activeElement` is the label with `data-wall-label-id="c1"` |
| Arrow after a wall press | focus first on a sidebar-style radio; press wall `c1`'s band; `ArrowDown` (with `useKeyboardShortcuts` mounted) | the wall slides 1 in; the radio does not change |
| Stacking | DOM order in the layer | backdrop, wall bands, labels, opening handles, corner handles; the existing stacking test still passes, extended with the labels at `z-index: 6` |
| Styles (asserted on the stylesheet text) | `stage.css` | `.room-wall-label` has `position: absolute;`, `transform: translate(-50%, -50%);`, `font-family: var(--font-heading);`, `font-size: 12px;`, `background: var(--color-bg);`, `pointer-events: auto;`; `.room-wall-label[aria-pressed="true"]` has `color: var(--color-accent-700);`; `.room-wall-label:focus-visible` has `outline: 2px solid var(--color-accent-700);` and `outline-offset: 3px;` (the same ring as `.room-corner:focus-visible`) |

**Verify:** `npx vitest run room-planner/components/Stage` → all pass; `npm run check` →
exit 0.
**Commit:** `feat(room-planner): wall length labels on the plan`

## Task 9: On-plan length editor

**Spec:** Behaviour 2 rows 2 to 4; Behaviour 3 rows 1 and 2.

**Files:**
- Modify: `room-planner/components/Stage/WallLengthLabels.tsx`
- Test: `room-planner/components/Stage/WallLengthLabels.test.tsx`
- Modify: `room-planner/components/Stage/stage.css`

**Interfaces:**
- Consumes: `setWallLengthTo` from `state/actions.ts` (Task 5); `lengthAnchor`,
  `setLengthAnchor` (Task 4); `roomInputStr`, `roomInputStep`, `roomUnitLabel`,
  `parseLengthInput` from `domain/units.ts`; `wallFrame` (Task 1).
- Produces: no new exports. The editor is `div.room-wall-editor` inside `WallLengthLabels`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Open the editor | click a label, or Enter on it | the label is replaced by a `role="group"` named `Wall <n> length` holding a number input (accessible name `Wall <n> length`, value `roomInputStr(length, units)`, step `roomInputStep(units)`, focused, its text selected), the unit suffix `roomUnitLabel(units)`, and a `role="radiogroup"` named `Which end moves` |
| Which-end radios | editor open on wall `n` of an outline with `k` corners | three `role="radio"` buttons in the order start, both, end, named `Corner <n> end`, `Both ends`, `Corner <n mod k + 1> end`; `aria-checked` follows `lengthAnchor`; choosing one calls `setLengthAnchor` and keeps the editor open with its draft |
| Arrows along the wall | the three radios | their visible content is `←`, `↔`, `→` inside a `span` with inline `transform: rotate(<wall angle>deg)`, the angle being `atan2(u.y, u.x)` in degrees, so the arrows point along the wall |
| Enter applies | type a valid length, Enter | `setWallLengthTo(wallId, inches)`; on `true` the editor closes and focus returns to that wall's label |
| Not on each keystroke | typing without Enter | the outline does not change |
| Leaving applies | focus moves outside the editor group | the same as Enter, without moving focus back |
| Moving inside the group | focus moves from the input to a which-end radio | nothing is applied; the editor stays open |
| Refused | Enter with a length that is refused (`0.1` in `ft`) | the outline is unchanged; the editor stays open with the typed text; `roomProblem` holds the reason |
| Unchanged or unreadable | Enter with the stored length (within 0.01 in); focus leaving with text that does not parse | the editor closes; `setWallLengthTo` is not called |
| Escape | Escape in the input | the editor closes, nothing is applied, focus returns to the label, the wall stays selected (the key event's propagation is stopped) |
| One editor | open the editor on another wall | the first closes without applying |
| Wall gone | the edited wall's id leaves the outline | the editor is not rendered |
| Styles (asserted on the stylesheet text) | `stage.css` | `.room-wall-editor` has `position: absolute;`, `transform: translate(-50%, -50%);`, `z-index: 9;` (above `.room-corner` at 8), `pointer-events: auto;` |

The on-plan length is typed in the room units exactly as the sidebar wall list does
(`parseLengthInput`). User text is only ever parsed to a number; nothing typed is rendered
as HTML.

**Verify:** `npx vitest run room-planner/components/Stage` → all pass; `npm run check` →
exit 0.
**Commit:** `feat(room-planner): type a wall length on the plan and choose which end moves`

## Task 10: Moving-end marks and dimension-line offset

**Spec:** Behaviour 3 row 3; "Decisions made in this plan" 1.

**Files:**
- Modify: `room-planner/components/Stage/WallLengthLabels.tsx`
- Test: `room-planner/components/Stage/WallLengthLabels.test.tsx`
- Modify: `room-planner/components/Stage/PlanView.tsx`
- Test: `room-planner/components/Stage/PlanView.test.tsx`
- Modify: `room-planner/components/Stage/stage.css`
- Modify: `room-planner/config.ts`

**Interfaces:**
- Consumes: `selectedWallId`, `lengthAnchor` (Task 4); `wallsOf`; `toPane`.
- Produces: `CONFIG.dimOffsetRoomExtra: 22`; `span.room-wall-moving-end` elements.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Mark, end | wall `c1` of `R` selected, anchor `end` | one `span.room-wall-moving-end` with `aria-hidden="true"`, inline `left` / `top` at `c2` in pane px |
| Mark, start | anchor `start` | one mark at `c1` |
| Mark, both | anchor `both` | two marks, at `c1` and `c2` |
| No wall selected, or an unknown id | — | no mark |
| Overall dimension lines, room mode | `PlanView` in room mode, not inset | the `.plan-dim-w` line's inline `top` is `boundsTopLeft.y − (CONFIG.dimOffset + CONFIG.dimOffsetRoomExtra)`; `.plan-dim-l`'s `left` likewise |
| Overall dimension lines, inset | room mode, inset pane | the same with `CONFIG.dimOffsetInset` |
| Outside room mode | furnish mode | the lines are where they are today; the existing `PlanView` dimension tests pass unchanged |
| Styles (asserted on the stylesheet text) | `stage.css` | `.room-wall-moving-end` has `position: absolute;`, `width: 26px;`, `height: 26px;`, `transform: translate(-50%, -50%);`, `border: 2px dashed var(--color-accent);`, `border-radius: 50%;`, `pointer-events: none;`, `z-index: 7;` |

**Verify:** `npx vitest run room-planner/components/Stage` → all pass; `npm run check` →
exit 0.
**Commit:** `feat(room-planner): mark the wall end a typed length will move`

## Task 11: Sidebar: which-end control, row selects its wall, hint

**Spec:** Behaviour 3 rows 2 and 3; section 4 (hint text).

**Files:**
- Modify: `room-planner/components/Sidebar/WallList.tsx`
- Test: `room-planner/components/Sidebar/WallList.test.tsx`
- Modify: `room-planner/components/Sidebar/RoomSection.tsx`
- Test: `room-planner/components/Sidebar/RoomSection.test.tsx`
- Modify: `room-planner/components/Sidebar/sidebar.css`

**Interfaces:**
- Consumes: `setWallLengthTo` (Task 5); `lengthAnchor`, `setLengthAnchor`, `selectWall`
  (Task 4); the existing `Segmented` component in `components/ui/Segmented.tsx`.
- Produces: no new exports. `WallList`'s private `applyWallLength` is removed in favour of
  `setWallLengthTo`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Control | above the wall rows | a `Segmented` with `name="length-anchor"`, `aria-label="A typed length moves"`, options `Start`, `Both`, `End` (values `start`, `both`, `end`), value from `lengthAnchor`, `onChange` → `setLengthAnchor` |
| Note | under the control | a `p.wall-list-note` with the text `Wall N starts at corner N. In Edit room, the plan marks the end that moves.` |
| Typing uses the anchor | anchor `start`, `R`, units `ft`, change wall 1's input to `10` | outline `c1 (24,0)`, `c2 (144,0)`, `c3 (144,168)`, `c4 (24,168)` |
| Typing keeps angles | anchor `end`, `R`, change wall 1's input to `10` | `c2 (120,0)`, `c3 (120,168)` |
| Refusal | change wall 1's input to `0.1` | outline unchanged; `roomProblem` is the short-wall text |
| Row selects its wall | room mode; wall 2's input receives focus | `selectedWallId` is wall 2's id |
| Outside room mode | furnish mode; a wall input receives focus | `selectedWallId` stays `null` |
| Existing rows | draft re-seeding, units, the `+` button, door and window rows | every existing `WallList` test passes unchanged |
| Styles (asserted on the stylesheet text) | `sidebar.css` | `.wall-list-note` has `font-size: 12px;` and `color: var(--color-text-muted);` if that token exists in the sidebar styles, otherwise the colour used by the section's existing help text; the report names the token used |

**Exact values:** `ROOM_MODE_HELP` in `RoomSection.tsx` becomes
`Drag a wall to move it. Drag a corner to change an angle. Double-click a wall to add a corner. Click a length to type it. Hold Alt to turn off angle snapping.`

**Test changes:** the `RoomSection.test.tsx` assertion on the old hint text takes the new
text. No other existing assertion changes.

**Verify:** `npx vitest run room-planner/components/Sidebar` → all pass; `npm run check` →
exit 0.
**Commit:** `feat(room-planner): choose which end a typed wall length moves, from the sidebar`

## Task 12: Round trip with slid walls

**Spec:** "How it is built" last bullet (the editor never stores what the loader refuses).

**Files:**
- Test: `room-planner/domain/planRoundTrip.test.ts`

**Interfaces:**
- Consumes: `startWallSlide`, `slideWallTo`, `setWallLengthTo` (Task 5); `setLengthAnchor`
  (Task 4); the file's existing round-trip helper.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Step with openings | store `T` with a door on `m1` (offset 8, width 32) and a window on `c1` (offset 4, width 36); `slideWallTo(startWallSlide('m1'), 24)`; serialise; `parsePlan` | parses; the parsed outline, openings and obstacles equal the store's |
| Diagonal slide, then a typed length | store `Q`; `slideWallTo(startWallSlide('q1'), 10)`; `setLengthAnchor('both')`; `setWallLengthTo('q2', 60)` returns `true` | parses and is equal |
| Used-up neighbour | store `Q`; `slideWallTo(startWallSlide('q1'), 49.7)` | parses and is equal; 4 corners |
| Far from the origin | store `R` moved to x 1300 to 1444, y 0 to 168; `slideWallTo(startWallSlide('c2'), -10)` | refused (room problem is the too-large text); the stored plan still parses |

**Verify:** `npx vitest run room-planner/domain/planRoundTrip.test.ts` → all pass;
`npm run check` → exit 0.
**Commit:** `test(room-planner): plans with slid walls survive save and load`

## Task 13: Deferred findings

**Spec:** none; process task (slice C lesson 6: fix deferred findings before the live check).

**Input, supplied by the controller:** the file
`.soltero/lean-sdd/2026-11-14-wall-editing/deferred.md`, written by the controller from the
ledger's `minor (deferred)` and `parked` lines of Tasks 1 to 12. One numbered line per
finding: the task it came from, the file and function, and the finding. The controller
refuses to list a file that is not in Tasks 1 to 12's file lists; such a finding goes to the
owner instead.

**Files:** exactly the files named in `deferred.md`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Each numbered finding | a line of `deferred.md` | either fixed, with a test that fails before the fix and passes after when the fix changes behaviour (the report names the test), or left, with a one-line reason in the report |
| Accounting | the report | lists every finding number once, as `fixed` or `left`; the two counts add up to the number of lines in `deferred.md` |
| Nothing deferred | `deferred.md` has no numbered line | no dispatch; the ledger records `Task 13: complete (nothing deferred)` |

**Verify:** `npm run check` → exit 0; the report quotes the build line for `/room-planner`
(First Load JS between 104 and 106 kB).
**Commit:** `fix(room-planner): review findings on wall editing`

## Task 14: Live check

**Spec:** "Verification"; every Behaviour section.

**Files:**
- Create: `docs/room-planner/verification/2026-11-14-wall-editing-live-check.md`
- Create: `docs/room-planner/verification/shots-wall-editing/` (screenshots named by row)

Run by the controller in the automated test browser (its own profile, not the owner's)
against `npx next dev -p 3478` on `localhost`, at 1440×900. Rows run in order; "Fresh"
means: remove the `room-planner:plan:v1` key, reload, press `Edit room`. That key on
`localhost:3478` in the test browser's profile is the only thing this task deletes; it
holds test data only. The stored outline is read from `localStorage` after 500 ms. Each row
is recorded as pass or fail with what was read. A failed row is fixed through one fix
dispatch and re-run; rows are never edited to match the app.

| Row | Steps | Expected |
|-----|-------|----------|
| W1 | Fresh. Click the middle of the top wall. | That wall's band has the class `is-selected`; the stored outline still has 4 corners; `document.activeElement` is that wall's label. |
| W2 | Press `ArrowDown` twice. | The stored top corners are 2 in lower than at W1; walls 2 and 4 in the sidebar read 2 in shorter; the sidebar control that had focus before W1 is unchanged. |
| W3 | Drag the right wall 24 in to the left (by `24 × scale` px). | Walls 1 and 3 are 24 in shorter; the stored outline is an axis-aligned rectangle. |
| W4 | Double-click the top wall about a third along, then about two thirds along. | 6 stored corners; the 4 original corners have not moved. |
| W5 | Drag the piece of the top wall between the two new corners 24 in into the room. | 8 stored corners; the piece is 24 in lower; every stored wall is horizontal or vertical. Screenshot. |
| W6 | Without releasing between, drag the same piece back until it is in line, then release. | 6 stored corners, equal to the outline after W4. |
| W7 | Drag it 24 in into the room, release; in a second drag pull it back in line. | 6 stored corners, equal to the outline after W4. |
| W8 | Click the label of the bottom wall, type a length 1 ft longer, press Enter (which-end at `End`). | The bottom wall is 1 ft longer; the two corners of the neighbouring wall at its end both moved 12 in; every stored wall is horizontal or vertical. |
| W9 | Open the same label, choose the other single end in the which-end control, type 1 ft shorter, Enter. | Before Enter, the `.room-wall-moving-end` mark is at that other end; after Enter, the corners at that end moved 12 in and the corners moved in W8 did not. |
| W10 | Open a label, type a length, press Escape. | The stored outline is unchanged; the label shows the old length; focus is on the label. |
| W11 | Open a label, type `0.1`, Enter. | The stored outline is unchanged; the editor is still open; the sidebar shows the short-wall reason. Escape closes it. |
| W12 | Fresh. Arm the door tool, click the top wall; arm the window tool, click the right wall. Then drag the top wall 12 in into the room. | The stored door is still on the top wall's id with the same offset; the window is on the right wall's id; the top corners are 12 in lower. |
| W13 | Drag the left wall right until the top wall would be shorter than the door needs, keep dragging 50 px further, release. | The stored top wall is still long enough for the door; the sidebar shows the door reason while dragging past the limit; the stored plan has the door. |
| W14 | In the sidebar set `A typed length moves` to `Both`, focus wall 1's field. | Wall 1's band has `is-selected`; two `.room-wall-moving-end` marks are shown. Type a length 2 ft shorter: both side walls' corners moved 12 in towards each other. |
| W15 | Fresh. Drag the top-right corner 30 in right and 30 in down so two walls are diagonal; then drag the bottom wall 12 in into the room. | The stored directions of both diagonal walls are the same before and after the wall drag (to 0.01); the bottom wall is still horizontal. |
| W16 | Click a wall once, then press `Delete`. | The stored outline is unchanged. `Escape` removes the `is-selected` class. |
| W17 | Right-click a wall. | No band has `is-selected`; the stored outline is unchanged. |
| W18 | Reload the page. | The stored outline equals the one after W15; no notice is shown. |
| W19 | Fresh. Drag the top wall 60 in into the room (over the bed), then leave Edit room. | The bed's stored position is unchanged; the conflicts count shows the bed as outside the room; no `.room-wall-label` exists; the two `.plan-dim` lines are at `CONFIG.dimOffset` from the room; the desk can be dragged. |
| W20 | Fresh. Rebuild the W5 notch room. Open the 3D view, then the Blueprint view. | Screenshot of each, in which the notch is visible in the top wall (the controller reads both screenshots and states what they show); the console has no error. |
| W21 | With the W20 room, type a longer length for the notch's bottom piece in the sidebar with which-end at `Both`. | The piece is longer by the typed amount, half at each end; 8 stored corners; every stored wall is horizontal or vertical. |
| W22 | Console and network across the whole run. | No console error or warning from the app; every request goes to `localhost:3478`. |

**Verify:** all 22 rows recorded with what was read; no row left failing.
**Commit:** `docs(room-planner): live check of wall editing`

## Task 15: Docs

**Spec:** project rule: every mistake and fix is recorded under `docs/`.

**Files:**
- Modify: `docs/room-planner/mistakes-and-fixes.md`
- Modify: `docs/room-planner/README.md`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Input, supplied by the controller:** `.soltero/lean-sdd/2026-11-14-wall-editing/mistakes-handover.md`
(plan defects, review findings, live-check defects, numbered) and the last `npm run check`
output.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Mistakes | each numbered handover item | one entry under a new heading `## 2026-11-14 — Wall editing`, in the file's existing entry format; the number of entries equals the number of handover items |
| Room planner README, behaviour | the editor section | names each of: click selects a wall; drag slides it; double-click adds a corner; length labels and the on-plan editor; the which-end choice; arrow keys with Shift for 12 in |
| Room planner README, known limits | "Known limits" | includes: double-tap to add a corner is not verified on a touch device; no alignment guides, locked lengths or undo; plus every limit in the handover |
| Room planner README, rule changes | a short "Changed behaviour" note | states decisions 2 and 5 of this plan |
| Root `README.md` and `CLAUDE.md` | their room planner lines | one line each mentions wall dragging and on-plan lengths; `git diff --stat` shows no other section changed |
| Accuracy | test count and bundle size | the quoted test count and First Load JS equal the numbers in the supplied `npm run check` output |

**Verify:** `npm run check` → exit 0; the report quotes the test-count line and the
`/room-planner` build line it used.
**Commit:** `docs(room-planner): wall editing, its limits and the lessons from building it`

---

## Spec coverage

| Spec item | Task |
|---|---|
| 1. Click selects; press-and-drag slides; threshold 4 px | 7 |
| 1. Snapping to `cornerSnap`; magnetic return in line | 1 (`snapSlideDistance`, `wallSlideStops`), 5 |
| 1. Same-direction neighbour makes a connecting wall; dragging back removes it, also in a later drag | 1, 5, 14 (W5 to W7) |
| 1. Refusals (short wall, crossing, too large, too many corners, door or window does not fit) keep the last accepted position with the reason | 1, 5, 7 |
| 1. Doors and windows stay on their walls | 2, 5, 14 (W12, W13) |
| 1. Furniture and obstacles not moved; left outside is flagged | 5 (row "Furniture is not moved"), 14 (W19) |
| 1. Double-click adds a corner; tool armed; secondary button | 7 |
| 2. Labels in room mode | 8 |
| 2. Click or Enter to edit, Enter / leaving applies, Escape, refusal keeps the field | 9 |
| 2. Keyboard: arrows slide the wall | 5, 6, 8 |
| 2. Not outside room mode | 8 (labels live in `RoomEditLayer`, which only renders in room mode), 14 (W19) |
| 3. Three choices drawn as arrows along the wall, default end, session only | 4, 9, 11 |
| 3. Marks on the plan; sidebar row selects its wall | 10, 11 |
| 3. One end / both / same-direction neighbour; rectangle fields unchanged | 3 |
| 4. Hint text | 11 |
| Defaults 1 to 4 | 1 and 7 (threshold), 8 (labels always shown), 4 (reset), 7 (no angle snap: `slideWallTo` takes no Alt option) |
| Default 5 (double-tap on touch) | 7 uses the browser's `dblclick`; not verified on a touch device; Task 15 lists it under "Known limits" |
| Saved format unchanged | 12 |

## Decisions made in this plan (not in the spec)

1. In room mode the two overall dimension lines move 22 px further out, so they do not sit
   on top of the new wall labels (Task 10).
2. Removing a corner that lies in a straight run no longer refuses because of a door on the
   wall before it: the wall keeps its direction, so the door's place is unambiguous. A door
   on the removed corner's own wall still refuses (Task 2).
3. Arrow keys act on the selected wall wherever focus is, except in a form field, the same
   way they already act on a selected corner, door or obstacle; Shift takes the existing
   12 in step. Pressing a wall focuses its label (Tasks 6 and 8).
4. Two directions within 0.005 (about 0.3°) count as the same direction, because corners
   are stored to 0.01 in and a corner added on a diagonal wall is not exactly on its line
   (Task 1).
5. A typed wall length in the sidebar also keeps angles now, for every room; before, it
   tilted the next wall (Task 3).
6. A keyboard step that would pass the point where a connecting wall reaches zero length
   stops at that point, so the connecting wall is removed and the wall does not jump past
   it (Task 5).

## Amendments (made while building)

1. **Tasks 1, 8 and 10 may also edit `room-planner/domain/catalog.test.ts`.** Its test
   "CONFIG has exactly the listed values" compares the whole of `CONFIG`, so every task that
   adds a `CONFIG` key adds the same key and value to that test's list, and changes nothing
   else in the file. Found by Task 1's implementer (the plan's file lists missed a pinned
   test again; same class as slice C's Amendment 3).
2. **`slideWall` refuses a slide that turns the room inside out (Task 1, rule 4).** Found by
   Task 1's reviewer: sliding a wall past the opposite side gave a candidate with negative
   signed area, which `normaliseOutline` reversed and accepted, so wall ids named different
   walls (`slideWall(R, 'c1', 174, IDS)` was accepted as a thin strip below the old bottom
   wall). New rule, checked on the candidate before `settle`: if the candidate's signed
   area is not positive, or the slid wall's own direction is reversed
   (`(B' − A') · u ≤ 0`, with A' and B' the slid wall's ends in the candidate), the result
   is `{ ok: false, problem: 'crossing' }`. The single-neighbour bump (`U`, `m1`, −36) is
   unaffected. New behaviour rows: `slideWall(R, 'c1', 174, IDS)`, `slideWall(R, 'c1', 200, IDS)`
   and `slideWall(Q, 'q1', 160, IDS)` → `crossing`; for the triangle `t1 (0,0)`, `t2 (120,0)`,
   `t3 (60,100)`, `slideWall(TRI, 't1', 110, IDS)` → `crossing` and
   `slideWall(TRI, 't1', 50, IDS)` → ok with `t1 (30,50)`, `t2 (90,50)`, `t3` unchanged.
3. **Task 2, rule 5: only added corners split a straight chain.** Read literally, the rule
   refused `corner-in-opening` for an opening that runs past the chain's last corner, where
   an existing test expects `opening-off-wall` (the old behaviour). Ruling: an opening is
   placed on the segment that the added corners assign it to (its start decides when it lies
   past the chain's end), and `settle` then refuses a misfit as `opening-off-wall`. Only an
   opening lying across an added corner refuses `corner-in-opening`. Found by Task 2's
   implementer; the plan author's rule contradicted a test the same task says must pass.
4. **Task 2, rule 6 gets a direction guard, and an opening on an unknown wall never throws.**
   Found by Task 2's reviewer. (a) When corners were added and the chain is not straight, the
   opening is kept on `w` only if the chain's first segment keeps the wall's old direction:
   `sameDirection(unit(before[c] − before[w]), unit(chain[1] − chain[0]))`; otherwise the
   edit refuses `corner-has-openings`. No edit in this slice produces such a chain, but
   without the guard a later edit could leave a door on a different physical wall
   (before `R`, after `c1 (0,0)`, `x (0,-30)`, `y (144,-30)`, `c2 (144,0)`, `c3`, `c4`, a
   window on `c1`: was accepted on the now-vertical wall; must refuse). (b) An opening whose
   `wallId` is not a corner of `before` is left unchanged for `settle` to judge, as the old
   code did; it used to work and threw a `TypeError` after Task 2.
5. **Task 11 also updates the room-mode hint in the selection bar.** The plan changed the
   sidebar hint and missed a second one: `ROOM_HINT` in `room-planner/components/SelectionBar.tsx`
   (pinned in `room-planner/components/bars.test.tsx`) still said "Click a wall to add a
   corner". Seen by the controller in a screenshot after Task 7. Task 11 may edit those two
   files for this only. New text:
   `Drag a wall to move it, or a corner to change an angle. Double-click a wall to add a corner, or pick a door or window to place. Select something and press Delete to remove it.`
   The constant in `bars.test.tsx` takes the same text.
6. **Task 8 may narrow one existing test to corner buttons.** The test "renders one button
   per corner, named Corner <n>, centred on the corner" in `RoomEditLayer.test.tsx` collected
   every button in the layer; the wall labels are buttons too. It now selects
   `button.room-corner` and keeps its expected list. Found by Task 8's implementer; again a
   pinned test the plan's "Test changes" missed.
7. **The wall labels must look clickable (Task 9 adds the styles).** Seen by the controller
   in a screenshot after Task 8: the labels were plain 12 px text, hard to tell from the
   overall dimension text and with no hint that they can be clicked. Task 9 adds to
   `.room-wall-label` in `stage.css`: `padding: 1px 6px;`,
   `border: 1px solid color-mix(in srgb, var(--color-text) 35%, transparent);`,
   `border-radius: 3px;`, `cursor: text;`, and a rule `.room-wall-label:hover` with
   `border-color: var(--color-accent);`. Asserted on the stylesheet text like the other
   style rows. (The overlap with the overall dimension lines is what Task 10 fixes.)
