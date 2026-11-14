# Room Planner: move into the portfolio, then build the room editor

Date: 2026-11-13. Status: awaiting owner approval.
Supersedes the separate-deploy idea discussed earlier the same day (never built).

## Owner decisions (2026-11-13)

- The planner is part of frankiesoltero.com, not its own site: same repo
  (`FrankieSoltero/portfolio`), same Vercel deploy, at `/room-planner`.
- Rooms can have straight walls at any angle.
- The room editor also covers doors, windows, fixed obstacles and uneven ceilings.
- Plans are saved in the browser. Accounts and cloud saving are a later piece.
- `FrankieSoltero/room-planner` is archived once the portfolio version is live.

## Roadmap

Each slice is planned, reviewed, built and merged on its own.

| Slice | Result | Designed in |
|---|---|---|
| A. Move | Today's planner, unchanged, live at `/room-planner` with a quest card | this document |
| B. Room shape and saving | Any-angle room outline, free item rotation, plan kept in the browser | this document |
| C. Openings and obstacles | Doors, windows, fixed obstacles | this document |
| D. Ceilings | Ceiling height zones and slopes | its own short design |
| Later | Accounts and cloud saving, real product lookup, real 3D models | not designed |

## Slice A: move into the portfolio

| Area | Design |
|---|---|
| Location | Planner source moves to a top-level `room-planner/` folder in the portfolio repo, keeping its internal layout (`domain`, `view`, `state`, `services`, `hooks`, `three`, `components`, `styles`). Tests move with it. |
| Route | `app/room-planner/page.tsx` is a server component carrying the page title and description. It renders a client component that loads the planner with server rendering turned off, because the planner needs the browser (canvas, WebGL, `crypto.randomUUID`). The three.js view stays a lazily loaded chunk. |
| Style isolation | The planner stylesheet currently sets rules on `:root`, `body` and `*`. In the portfolio these are scoped to a `.room-planner` wrapper so they cannot leak into `/papers` or error pages. The token reader for the 3D views reads from that wrapper instead of the document root. |
| Fonts | Barlow and Barlow Condensed stay self-hosted through `@fontsource`. No third-party font request. |
| Dependencies | Added to the portfolio: `three`, `zustand`, `lucide-react`, the two `@fontsource` packages; dev: `vitest`, Testing Library, `jsdom`, `@types/three`. Audit target, amended by the owner on 2026-11-13: the portfolio already had 11 findings before this work (1 critical, 6 high, 4 low). This slice applies the non-breaking fixes and upgrades `zod` from 3 to 4, which leaves 0 critical and 0 high. The 4 low findings in the KaTeX packages need breaking upgrades of the papers math rendering; they stay, listed in the pull request. No package this slice adds may carry a finding. |
| Checks | The portfolio gains `npm test` (Vitest, planner tests only) and `npm run check` (typecheck, lint, tests, build). The planner's lint rules apply to `room-planner/` only. |
| Quest card | New "Room Planner" entry in the `quests` array: rarity RARE, status LIVE, tags React, three.js, TypeScript, placeholder sprite slot, reward "playable in your browser". The card template gains an optional `play` field rendering `PLAY →` beside `GITHUB →`, same tab. Counts go from 6 to 7. |
| Site plumbing | `/room-planner` added to the sitemap. README and CLAUDE.md describe the third section. The 8-bit page and `/papers` are otherwise untouched. |
| Docs | The planner's specs, plans, review, verification records and mistakes log move to `docs/room-planner/`. The design handoff folder moves to `docs/room-planner/design_handoff/` as reference and is excluded from the build. |
| History | Plain copy in one commit. The 35-commit history stays in the archived repo, which the commit message links to. |
| Load failure | Added with the owner's approval on 2026-11-13: if the planner's code fails to load or throws while rendering, the route shows "The room planner failed to load." and a "Try again" button, not the framework's default error page. |
| Security headers | The portfolio's existing headers apply. A Content-Security-Policy is not added in this slice: Next.js needs per-request nonces for one, which affects the whole site. Recorded as a follow-up. |
| Old repo | After the PR is merged and the live route is verified: its README gets a pointer to the portfolio, then it is archived. |
| Delivery | Branch `room-planner` in the portfolio, one pull request. Merging deploys it. |

Verification for A: `npm run check` exits 0 in the portfolio; all planner tests pass
there; the live check rows L1 to L15 are repeated against `/room-planner` under
`next start`; `/` is byte-identical apart from the quest changes; `/papers` renders
as before, including after navigating to it from the planner.

## Slice B: room shape and saving

| Area | Design |
|---|---|
| Data | `room` becomes `{ outline: Point[], height }`: corners in inches, in order, at least 3. Plan `schemaVersion` goes to 2; a version 1 rectangle is converted on load. |
| Editing | An "Edit room" mode on the 2D plan. Drag a corner to move it. Click a wall to add a corner. Select a corner and press Delete to remove it. Corners snap to 1 inch, and walls snap to 15-degree directions unless Alt is held. |
| Exact sizes | The sidebar lists every wall with its length. Typing a length moves the wall's far corner along the wall's direction. Width and length inputs remain only while the room is a rectangle. |
| Starting shapes | Rectangle, L-shape and a notched rectangle as one-click starting points. |
| Validity | A shape whose walls cross is refused: the drag stops at the last valid position and the sidebar says why. |
| Item rotation | Items rotate to any angle. `R` turns 90 degrees as today, Shift+R turns 15 degrees, and the selection bar gets an angle field. Angled walls are of little use without this. |
| Fit checks | An item conflicts when any part of it is outside the outline or overlaps another item, using the true rotated footprints. Clearance lines measure to the nearest wall. |
| Views | The plan, the Styled 3D view and the Blueprint view all draw the outline: one wall per edge, a floor in the outline's shape, the camera framed on its bounding box. |
| Saving | The plan saves automatically to `localStorage` under a versioned key, and loads on return. Stored data is treated as untrusted: it is validated against the schema and discarded with a notice if invalid. A "Reset plan" button, with a confirmation, clears it. Nothing is sent to a server, and no personal data is stored. |
| Seam | Saving goes through a `PlanStore` interface with the browser version as its one implementation, so cloud saving can replace it later. |

## Slice C: openings and obstacles

Status: approved by the owner on 2026-11-13. Owner answers on 2026-11-13: doors have a swing arc
that flags blockers; windows flag furniture that covers them; obstacles are
floor-standing boxes, raised boxes and round columns. Everything else in this table
is a default chosen by the designer.

Amendment to slice B that this slice needs: each outline corner carries a stable
`id` (`outline: Corner[]`, `Corner = { id, x, y }`), so a door or window can name its
wall and survive corners being added elsewhere. A wall is identified by the id of
its starting corner.

| Area | Design |
|---|---|
| Data | The plan gains `openings: Opening[]` and `obstacles: Obstacle[]`. `schemaVersion` goes to 3; a version 2 plan loads with both lists empty. |
| Door | `{ id, kind: 'door', wallId, offset, width, height, hinge: 'start' or 'end', swing: 'in' or 'out' }`. `offset` is inches along the wall from its starting corner to the near edge of the opening. Defaults: 32 in wide, 80 in high, swings in. |
| Window | `{ id, kind: 'window', wallId, offset, width, sill, height }`. Defaults: 36 in wide, sill at 36 in, 48 in high. |
| Obstacle | `{ id, shape: 'box' or 'cylinder', label, x, y, rotation, width, depth, height, elevation }`. A cylinder uses `width` as its diameter. `elevation` is the height of its underside above the floor; 0 means floor-standing. |
| Placing | In "Edit room" mode the sidebar offers Add door, Add window, Add box, Add column. A door or window is placed by clicking a wall and slides along it by dragging; it snaps to 1 in. Obstacles drag and rotate like furniture, but only in "Edit room" mode; outside it they cannot be selected or moved. Each has exact-size fields in the sidebar, and Delete removes the selected one. |
| Opening validity | An opening must fit inside its wall and must not overlap another opening on that wall. A corner drag or typed wall length that would break this stops at the last valid position and the sidebar says why. Deleting a corner whose two walls carry an opening is refused with the reason. Adding a corner to a wall keeps each opening on the part it lies on; a corner cannot be added inside an opening. |
| Door check | A door that swings in reserves its quarter-circle arc (radius equal to its width). A door that swings out reserves a strip its own width and 24 in deep inside the room. Furniture or an obstacle inside the reserved area is a conflict. |
| Window check | Furniture taller than the sill that sits within 6 in of the wall in front of the window gets a warning: shown in amber, listed in the sidebar, and not counted as a conflict. |
| Obstacle check | Furniture conflicts with an obstacle when their footprints overlap and their height ranges overlap. Furniture shorter than a raised obstacle's underside may sit beneath it. An obstacle partly outside the outline, or taller than the room, is flagged. |
| Views | Plan: doors show as a gap with the swing arc, windows as a double line, obstacles as hatched shapes with their label. Styled 3D and Blueprint: walls have the door and window holes cut out, windows get a glass pane in the Styled view, obstacles draw as plain boxes and cylinders at their elevation. |
| Saving | Same browser storage as slice B. Stored openings and obstacles are validated like the rest of the plan; a plan with more than 64 corners, 64 openings or 64 obstacles is rejected as invalid. Labels are plain text, limited to 40 characters, and rendered as text only. |

Out of scope for C: sliding and pocket doors; door swings other than 90 degrees;
openings in obstacles; ceilings (slice D).

## Delivery of B and C (owner request, 2026-11-13)

B and C are built on the `room-planner` branch on top of slice A and ship in the same
pull request, merged once after both have passed their checks. Each is still planned,
reviewed and built as its own slice.

## Out of scope for A and B

Doors, windows, obstacles, ceilings (slices C and D); curved walls; accounts; real
product lookup; real 3D models; export and import of plan files.
