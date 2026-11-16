# Design: more intuitive wall editing (slice D)

Date: 2026-11-14. Status: approved by the owner on 2026-11-14.
Branch: `wall-editing`, from `main` after pull request #1 was merged. Delivered as its own
pull request.

## Why

Research on seven comparable planners (Planner 5D, Floorplanner, Houzz Pro, magicplan,
Live Home 3D, Space Designer 3D, IKEA Kreativ) showed a common pattern: people move walls
and type lengths directly on the plan. Ours makes them drag corners and type lengths in the
sidebar, and two details work against them:

- A plain click on a wall adds a corner, so stray clicks change the room.
- A typed wall length moves only that wall's end corner, which tilts the next wall unless
  the room is a plain rectangle.

## Owner decisions (2026-11-14)

| Question | Answer |
|---|---|
| Plain click on a wall | Selects the wall. Drag moves it. Double-click adds a corner. |
| Typed length | Keeps every angle: the neighbouring wall slides. The user picks which end moves. |
| Scope | Three changes: drag walls, type a length on the plan, choose which end moves. |
| Delivery | Pull request #1 merged first; this is a new pull request. |

## Behaviour

All of this applies in room mode ("Edit room"). Nothing changes outside it.

### 1. Select and drag a wall

| Case | Result |
|---|---|
| Click a wall (press and release within 4 px) | The wall is selected and highlighted. Any selected corner, door, window or obstacle is deselected. |
| Press a wall and move more than 4 px | The wall slides at right angles to itself, following the pointer. Its direction never changes. Each end travels along its neighbouring wall's line, so the neighbours get longer or shorter and no angle changes. |
| Snapping | The slide distance snaps to the same grid as corner drags (`CONFIG.cornerSnap`). |
| A neighbour runs in the same direction as the dragged wall (for example after a corner was added mid-wall) | A short connecting wall at right angles is created at that end, so the dragged wall steps in or out. This is how a notch or an L-shape is made: add two corners, drag the piece between them. |
| The wall is dragged back in line with that neighbour (within one snap step) | The connecting wall is removed and the two walls are in line again. This also works in a later drag. |
| The slide would break a rule (a wall shorter than the minimum, walls crossing, room larger than the limit, more corners than the limit, a door or window that no longer fits) | That step is refused: the room stays at the last accepted position and the existing reason text is shown, as for corner drags today. |
| Doors and windows | They stay on their walls. Those on the dragged wall move with it. |
| Furniture and obstacles | Not moved. Anything now outside the room is flagged as a conflict, as today. |
| Double-click a wall | Adds a corner at that point (what a single click does today). |
| Door or window tool armed | A click on a wall places it, as today. Dragging a wall is off while a tool is armed. |
| Secondary mouse button | Does nothing, as today. |

### 2. Length labels on the plan

| Case | Result |
|---|---|
| Room mode | Every wall shows its length beside its midpoint, on the outside of the room, in the current units. The two overall dimension lines stay. |
| Click a label, or press Enter on it | The wall is selected and the label becomes a text field holding the length, with the which-end control beside it. |
| Enter or leaving the field | The length is applied. A refused length leaves the room unchanged, shows the reason, and keeps the field open with what was typed. |
| Escape | Closes the field without changing anything. |
| Keyboard | Labels are buttons in the tab order, named "Wall N, length". With a label focused, the arrow keys slide the wall one snap step in the direction of the arrow on screen; an arrow along the wall does nothing. |
| Outside room mode | No per-wall labels (unchanged). |

The on-plan field applies on Enter, not on each keystroke, so the room does not move under
the field while the user is typing. The sidebar wall list stays and keeps applying as the
user types.

### 3. Which end moves

| Case | Result |
|---|---|
| Control | Three choices: the start end, both ends, the end end. On the plan they are arrows pointing along the selected wall. Default: the end end (the corner that moves today). |
| Where | Beside the on-plan length field, and once above the sidebar wall list. One setting for the session; it is not saved with the plan. |
| Preview | While a wall is selected, the end or ends that will move are marked on the plan. Focusing a sidebar wall row selects that wall, so the mark is visible there too. |
| Applying a length, one end | That end moves along the wall's own direction and the neighbouring wall at that end slides with it, keeping its direction. Every angle in the room stays the same. |
| Applying a length, both ends | Half the change at each end. |
| The neighbour at the moving end runs in the same direction as the wall | Only the shared corner moves along the line; the neighbour gets shorter or longer. |
| Rectangle width and length fields | Unchanged. |

### 4. Hint text

The room-mode hint becomes: "Drag a wall to move it. Drag a corner to change an angle.
Double-click a wall to add a corner. Click a length to type it. Hold Alt to turn off angle
snapping."

## How it is built

- One new pure function in `domain/outline.ts`, `slideWall(outline, wallId, distance, newIds)`,
  returns the same `OutlineResult` as the other edits. Wall dragging, keyboard sliding and
  typed lengths all use it; a typed length is a slide of the neighbouring wall by the
  distance that gives the wanted length. `setWallLength` gets an `anchor` argument
  (`'start' | 'both' | 'end'`).
- Wall ids are kept. A wall's id is its starting corner's id, so when a connecting wall is
  created at a wall's start, the moved corner keeps the id and the fixed point gets the new
  one. Doors and windows therefore stay attached.
- `rehomeOpenings` is extended for the two new cases: two corners added in one edit, and a
  connecting wall removed while the wall before it has doors or windows.
- A drag computes each step from the outline at the start of the drag, with new corner ids
  made once per drag, so moving back and forth does not pile up corners.
- New UI state in `uiStore`: `selectedWallId` and `lengthAnchor`. Nothing new is stored in
  the plan; the saved format stays at version 3.
- `RoomEditLayer` gets the click, drag and double-click handling and the labels.
  Everything passes through `applyOutline`, so the rule "the editor never stores what the
  loader refuses" holds without new checks.

## Defaults chosen here (say if you want any changed)

1. The click-or-drag threshold is 4 px.
2. Labels sit outside the room and are always shown in room mode, even on short walls
   where two labels may touch.
3. The which-end setting resets to "end" on reload.
4. A wall drag does not snap to angles (its angle cannot change) and Alt has no effect on it.
5. On touch screens, double-tap adds a corner; the sidebar "+" button remains the other way.

## Not in this slice

- Alignment guide lines while dragging.
- Locking a typed length.
- Undo.
- A phone layout.

## Risks

- **Double-click and drag on one target.** A double-click must not start a slide; covered
  by the 4 px threshold and tests of each gesture.
- **Geometry at awkward angles.** When a neighbour is nearly, but not exactly, in the same
  direction, its line meets the moved wall very far away. Such a step is refused by the
  existing size limits; tests pin the near-parallel case.
- **Stored numbers are rounded to 0.01.** A slide along a diagonal neighbour can leave a
  wall a hundredth of a degree off. Tests pin that repeated slides do not drift.

## Verification

Unit tests for `slideWall` and the length anchor (worked examples for a rectangle, an
L-shape, a diagonal neighbour, a same-direction neighbour, merge-back, each refusal);
component tests for click, drag, double-click, label editing and keyboard; `npm run check`;
a live check in the browser with rows that start from pointer actions, including doors and
windows on dragged walls; whole-slice review before the pull request.
