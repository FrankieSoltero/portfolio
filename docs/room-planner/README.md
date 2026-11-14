# Room Planner docs

Documentation for the `/room-planner` section: a room layout tool (2D plan and 3D check,
React and three.js, client-side only). Source is in `room-planner/`, the route is in
`app/room-planner/`.

Documents dated 2026-11-12 were written in the standalone repository, where the code
lived in `src/`. That folder is `room-planner/` in this repository.

## What the planner does

- **The room is an outline.** It is a closed outline of straight walls, edited in "Edit room"
  mode. Drag a corner to move it. Press Delete to remove the selected corner. Three starting
  shapes (rectangle, L-shape, notched) are one click away. A shape that would be invalid, such as
  one with crossing walls, is refused and the reason is shown in the sidebar.
  - **Walls are edited directly on the plan.** A click on a wall selects it. Pressing a wall and
    moving more than 4 px slides it at right angles to itself, and every angle in the room is
    kept: each end travels along its neighbouring wall. The distance snaps like a corner drag. If
    a neighbour runs the same way as the dragged wall (after a corner was added mid-wall), a short
    connecting wall is made at that end; dragging back in line removes it. A double-click on a wall
    adds a corner there, as does the add button (`+`) in the wall list. The arrow keys slide the
    selected wall by 1 in (Shift: 12 in) in the direction of the arrow on screen; an arrow along
    the wall does nothing. Escape clears the selection. A slide that would break a rule (a wall
    too short, crossing walls, a room or corner count over the limit, a door or window that no
    longer fits) stops at the last accepted position and the reason is shown. Furniture and
    obstacles do not move with a wall; anything left outside the room is flagged as usual.
  - **Each wall shows its length** on the plan, outside the room, in the current units. A click
    on it (or Enter on it, as each is a button in the tab order) opens a field with the length:
    Enter applies it and Escape cancels. A refused length leaves the field open with the reason.
    Leaving the field also applies it.
  - **Which end moves.** A typed length keeps every angle. A choice of three arrows along the wall
    (start, both ends, end; the default is the end) says which end moves. It is beside the
    on-plan field and above the sidebar wall list, is kept for the session only and is not saved
    with the plan. The end or ends that will move are marked on the plan, and focusing a wall's
    length field in the sidebar selects that wall so the mark shows.
  - Wall lengths can also be typed in the sidebar, where each keystroke applies. The two overall
    dimension lines stay and sit further from the room in room mode, clear of the wall labels.
    Door or window tools armed: a click on a wall places the opening and a wall is not dragged,
    and the length labels ignore the pointer.
- **Furniture rotates to any angle.** R turns the selected piece by 90°, Shift+R by 15°, and
  the Angle field takes any value.
- **Doors, windows and obstacles are added in "Edit room" mode.** The Room section of the sidebar
  has `Add door`, `Add window`, `Add box` and `Add column`.
  - A *door* is 32 in wide and 80 in high by default and swings in. `Add door` arms a tool and
    the next click on a wall places it, centred on the click and moved along the wall to fit. While
    the tool is armed each wall row has a button that places it at the wall's midpoint (the
    keyboard path); Escape disarms. A door is a gap in the wall on the plan. Its leaf and swing
    arc are drawn above the furniture, in a layer that ignores the pointer. A door that swings in
    reserves its quarter-circle arc; a door that swings out reserves a strip its own width and 24 in
    deep. Furniture or an obstacle inside the reserved area is a conflict, flagged and counted.
  - A *window* is 36 in wide, with its sill at 36 in and 48 in high. On the plan it is a band in the
    plan's background colour across the wall with three thin lines. Furniture taller than the sill
    and within 6 in of the wall in front of the window gets an amber warning. Warnings are
    listed in the sidebar and are not counted as conflicts.
  - An *obstacle* is a fixed box, a raised box (its `elevation` is above 0, so furniture shorter
    than the underside can sit beneath it) or a round column (a cylinder; `width` is its
    diameter; a new column is as tall as the room). It is drawn hatched with its label (plain text,
    at most 40 characters). Furniture conflicts with an obstacle when the footprints and
    the height ranges both overlap. An obstacle partly outside the room, taller than the room or
    inside a door's reserved area is flagged. Obstacles do not conflict with each other.
  - A door or window slides along its wall by dragging its handle or with the arrow keys, and
    snaps to 1 in. Each arrow moves it the way the arrow points on screen; an arrow across the
    wall does nothing. An obstacle is dragged and rotated like furniture, but only in "Edit room"
    mode. Each has exact-size fields in the sidebar, and Delete removes the selected one. In room
    mode only the primary mouse button selects or drags, and a press on a handle, obstacle or
    corner also focuses it. Openings on one wall are numbered together by offset, in the plan
    handles and in the sidebar rows (`Door on wall 1 (1 of 2)`). Obstacles that share a name are
    numbered by list order in the sidebar rows and the plan buttons' names (`Box (1 of 2)`); the
    label drawn on the plan is not numbered.
  - Openings must fit inside their wall and must not overlap. A corner drag, wall drag or typed
    wall length that would break this stops at the last valid position and the sidebar says why.
    An opening keeps its place in the room when the start of its wall slides along the wall (a
    wall drag, a corner drag along a wall, a typed length, the rectangle width and length fields),
    so a door does not travel when a neighbouring wall is dragged. An edit that would leave one
    past its wall's end is refused: "That would leave a door or window without room on its wall."
    Deleting a corner whose walls carry an opening is refused, unless the corner lies in a
    straight run (the wall keeps its direction). A corner added to a wall keeps each opening on the
    part it lies on, and cannot be added inside an opening. If an edit reverses the outline, each
    opening stays on its physical wall. A starting shape replaces every wall, so it is refused
    while the room has a door or window.
  - In the Styled 3D view the walls have the door and window holes cut out. Each hole has a thin
    dark frame, and windows have a glass pane. The Blueprint view cuts the same holes, draws
    obstacles, and draws a raised obstacle's underside when the camera is below it.
- **Fit checks use the true footprints.** Rotated pieces are checked against the outline and
  against each other using their real rotated footprints.
- **The plan is saved in the browser.** Changes are saved automatically in `localStorage`
  under the key `room-planner:plan:v1`. The stored data is treated as untrusted and validated
  on load (`room-planner/domain/planSchema.ts`). It is never sent to a server. "Reset plan"
  erases it. The stored document is `schemaVersion` 3 and carries `openings` and `obstacles`;
  a version 2 document loads with both lists empty. The key is unchanged.

Known limits. The Blueprint approximation and the two-tabs overwrite are decisions 5 and 9 of
the plan [`plans/2026-11-13-room-shape-and-saving.md`](plans/2026-11-13-room-shape-and-saving.md);
the desktop-only layout comes from the original design handoff
([`design_handoff/README.md`](design_handoff/README.md)).

- The layout is designed for desktop widths. It does not reflow on a phone.
- The Blueprint view's hidden-surface order is approximate in very concave rooms.
- Two tabs open at once overwrite each other's saved plan.
- Ctrl+click on macOS arrives as the primary button and still starts a drag.
- Drags are not tracked per pointer. Focus drops to the page when a focused handle is deleted.
- The Blueprint view's painter's sort is cubic in the worst case. 64 columns make that worst case
  about twice as slow.
- A whitespace-only obstacle label is shown as it is, so its accessible name is blank.
- In metric units a size is shown rounded to whole centimetres, and a size near a limit can be
  refused if re-typed as shown: a 12 in door width shows as 30 cm, and 30 cm is 11.81 in, under
  the 12 in minimum.
- The import-boundary test (nothing under `room-planner/view/` or `room-planner/domain/` imports
  three.js) does not catch a bare `'../three'` directory import or `require()`.

Known limits of wall editing (slice D):

- Double-tap to add a corner is not verified on a touch device (it relies on the browser's
  `dblclick`).
- There are no alignment guides, no locked lengths and no undo.
- On very short walls neighbouring length labels touch or overlap.
- A wall dragged towards a door or window stops at the last pointer position before it, not
  exactly at its edge.
- In Safari a click on another wall's label discards an open length field's text; in other
  browsers it applies it first.
- While an on-plan length field is kept open by a refused length and focus is elsewhere, Escape
  clears the selection and leaves the field open.
- A neighbouring wall that is almost, but not quite, in line with the dragged wall (more than
  about 0.3 degrees off) makes its corner travel far for a small drag; the size limits refuse
  the result.
- A typed length still applies on each keystroke in the sidebar (the on-plan field applies on
  Enter).

Changed behaviour (slice D, wall editing). These are on purpose:

- A typed wall length keeps every angle. It used to move only the end corner and tilt the next
  wall.
- Removing a corner that lies in a straight run is allowed with a door on the wall before it,
  because the wall keeps its direction. It used to be refused.
- Doors and windows keep their place in the room when the start of their wall moves along the
  wall: wall drags, corner drags along a wall, typed lengths and the rectangle width and length
  fields. Before, they kept their offset from the wall's start and travelled with it. An edit
  that would leave one past its wall's end is refused with "That would leave a door or window
  without room on its wall."
- A plain click on a wall selects it. It used to add a corner; that is now a double-click (or the
  `+` button in the sidebar).
- In room mode the overall dimension lines sit further from the room.

The checks on the final code: `npm run check` passes with 54 test files and 2045 tests, and the
build shows `/room-planner` at 105 kB First Load JS.

Open questions for the owner (slice C):

- Starting shapes are refused while doors or windows exist. Should they instead keep the openings
  that still fit?
- `Add box` and `Add column` place the obstacle at the room's interior point, which in the seeded
  room is on the bed. Should they find a free spot?
- Door arcs are drawn above furniture. The plan drew them under; this changed after the live check
  (row X1), because the arc could not be seen in the one case where it matters. Is this the
  wanted look?

The limits on a plan (200 items, 64 corners, coordinates within ±120 ft) are enforced both
when editing and when loading, so an edit can never produce a saved plan that fails to load.

## Folders and files

- `specs/` — design specs for the planner and for its move into the portfolio. The wall editing
  spec is [`specs/2026-11-14-wall-editing-design.md`](specs/2026-11-14-wall-editing-design.md).
- `plans/` — implementation plans, one per spec. The room shape and saving work is in
  [`plans/2026-11-13-room-shape-and-saving.md`](plans/2026-11-13-room-shape-and-saving.md). The
  doors, windows and obstacles work is in
  [`plans/2026-11-14-openings-and-obstacles.md`](plans/2026-11-14-openings-and-obstacles.md)
  (Amendments 1 to 6, plus the inserted fix tasks 12b and 13b). The wall editing work is in
  [`plans/2026-11-14-wall-editing.md`](plans/2026-11-14-wall-editing.md) (Amendments 1 to 9).
- `plan-reviews/` — plan-review verdicts for those plans. The review of the room shape and
  saving plan is
  [`plan-reviews/2026-11-13-room-shape-and-saving-review.md`](plan-reviews/2026-11-13-room-shape-and-saving-review.md).
  The review of the openings plan is
  [`plan-reviews/2026-11-14-openings-and-obstacles-review.md`](plan-reviews/2026-11-14-openings-and-obstacles-review.md).
  The review of the wall editing plan is
  [`plan-reviews/2026-11-14-wall-editing-review.md`](plan-reviews/2026-11-14-wall-editing-review.md).
- `verification/` — live-check notes and the captures they cite. The room shape and saving
  check is
  [`verification/2026-11-13-room-shape-live-check.md`](verification/2026-11-13-room-shape-live-check.md).
  The openings check has 24 rows: 22 passed and 2 failed on the first run (C5, X1); both were fixed
  and passed on the re-run
  ([`verification/2026-11-14-openings-live-check.md`](verification/2026-11-14-openings-live-check.md)).
  The wall editing check has 22 rows over three runs: run 1 failed W3, W12 and W13, and run 3, on
  the final commit, passed all 22
  ([`verification/2026-11-14-wall-editing-live-check.md`](verification/2026-11-14-wall-editing-live-check.md)).
- `design_handoff/` — the original design reference (prototype, design system, README).
  It is read-only: it is not built or served.
- `mistakes-and-fixes.md` — running log of mistakes and how they were fixed.
