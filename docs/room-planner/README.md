# Room Planner docs

Documentation for the `/room-planner` section: a room layout tool (2D plan and 3D check,
React and three.js, client-side only). Source is in `room-planner/`, the route is in
`app/room-planner/`.

Documents dated 2026-11-12 were written in the standalone repository, where the code
lived in `src/`. That folder is `room-planner/` in this repository.

## What the planner does

- **The room is an outline.** It is a closed outline of straight walls, edited in "Edit room"
  mode. Drag a corner to move it. Click a wall, or use the add button in the wall list, to add
  a corner at that wall. Press Delete to remove the selected corner. Wall lengths can be typed
  in the sidebar. Three starting shapes (rectangle, L-shape, notched) are one click away. A
  shape that would be invalid, such as one with crossing walls, is refused and the reason is
  shown in the sidebar.
- **Furniture rotates to any angle.** R turns the selected piece by 90°, Shift+R by 15°, and
  the Angle field takes any value.
- **Fit checks use the true footprints.** Rotated pieces are checked against the outline and
  against each other using their real rotated footprints.
- **The plan is saved in the browser.** Changes are saved automatically in `localStorage`
  under the key `room-planner:plan:v1`. The stored data is treated as untrusted and validated
  on load (`room-planner/domain/planSchema.ts`). It is never sent to a server. "Reset plan"
  erases it.

Known limits, recorded by the plan review and the live check:

- The layout is designed for desktop widths. It does not reflow on a phone.
- The Blueprint view's hidden-surface order is approximate in very concave rooms.
- Two tabs open at once overwrite each other's saved plan.

## Folders and files

- `specs/` — design specs for the planner and for its move into the portfolio.
- `plans/` — implementation plans, one per spec. The room shape and saving work is in
  [`plans/2026-11-13-room-shape-and-saving.md`](plans/2026-11-13-room-shape-and-saving.md).
- `plan-reviews/` — plan-review verdicts for those plans. The review of the room shape and
  saving plan is
  [`plan-reviews/2026-11-13-room-shape-and-saving-review.md`](plan-reviews/2026-11-13-room-shape-and-saving-review.md).
- `verification/` — live-check notes and the captures they cite. The room shape and saving
  check is
  [`verification/2026-11-13-room-shape-live-check.md`](verification/2026-11-13-room-shape-live-check.md).
- `design_handoff/` — the original design reference (prototype, design system, README).
  It is read-only: it is not built or served.
- `mistakes-and-fixes.md` — running log of mistakes and how they were fixed.
