# Wall editing: live check

- **Run on:** 2026-11-14 (Task 14 of `docs/room-planner/plans/2026-11-14-wall-editing.md`).
- **Commit under test (final run):** `228a3d3`, branch `wall-editing`. Nothing under
  `room-planner/` changed after this run.
- **Browser:** the Playwright test browser (its own profile), viewport 1440×900, one tab.
  The check is one script (kept outside the repo) that drives `page.mouse` and
  `page.keyboard` and computes each row's pass or fail from what it reads.
- **Server:** `npx next dev -p 3478` on `localhost`, stopped by port afterwards.
- **How values were read:** "stored" is
  `JSON.parse(localStorage.getItem('room-planner:plan:v1'))`, read 500 ms after the last
  change. Outlines are written as `(x, y)` in inches, in corner order. "Fresh" means the
  key is removed, the page reloaded, `Side by side` chosen and `Edit room` pressed. The
  layout scale is re-measured after every change of the room's size, because the plan
  re-fits (2.93 px/in for the starting room).
- **Screenshots:** `docs/room-planner/verification/shots-wall-editing/` (10 files). The
  controller read each one.

## Runs

| Run | Commit | Result |
|---|---|---|
| 1 | `167ceb7` | 18 rows run. W3, W12 and W13 failed (below). W14 was run on the state W13 left and is not counted. |
| 2 | `fd088fd` (first fix) | All 22 rows pass. The screenshots showed a label on a vertical wall overlapping the overall length dimension in the inset pane (not a failed row). |
| 3 | `c6d5f3b` (second fix) | All 22 rows pass. |
| 4 | `228a3d3` (final-review fix) | All 22 rows pass with the same values as run 3, and the two extra rows X1 and X2 pass. This is the run recorded in the table. |

### What failed in run 1

- **W3:** pressing the middle of the right wall opened that wall's length label and did
  not drag the wall. The label, centred 18 px outside the wall, is about 40 px wide and lay
  over the middle of the wall's hit band (`document.elementFromPoint` at the band's centre
  returned `room-wall-label`). Dragging from a quarter of the way along the wall worked.
- **W12:** with the window tool armed, the click on the middle of the right wall hit the
  same label, so no window was placed there.
- **W13:** dragging the left wall 49 in to the right moved the door on the top wall 49 in
  with it (the door kept its offset from the wall's start corner).

Fixes: plan Amendments 8 and 9 (labels placed clear of their wall and turned to run along
it; labels ignore the pointer while a tool is armed; an opening keeps its place in the room
when its wall's start slides along the wall).

## Rows (run 4, `228a3d3`)

| Row | What was done | What was read | Result |
|-----|---------------|---------------|--------|
| W1 | Fresh. A sidebar radio was focused first. Clicked the middle of the top wall. | Selected band: wall `c1`. Nothing stored yet (the room is unchanged), 4 corner handles. `document.activeElement` is the label with `data-wall-label-id="c1"`. | Pass |
| W2 | ArrowDown twice. | Stored outline `(0,2) (144,2) (144,168) (0,168)`. Sidebar walls 2 and 4 read `13.83` ft. The which-end control still has `End` checked. | Pass |
| W3 | Dragged the right wall from its midpoint 24 in to the left. | Element under the midpoint: `room-wall-hit`. Stored `(0,2) (120,2) (120,168) (0,168)`; sidebar walls 1 and 3 read `10`. | Pass |
| W4 | Double-clicked the top wall at 40 in and at 80 in. | Stored `(0,2) (40,2) (80,2) (120,2) (120,168) (0,168)`: 6 corners, the original four unmoved. | Pass |
| W5 | Dragged the piece between the new corners 24 in into the room, released. | 8 corners: `(0,2) (40,2) (40,26) (80,26) (80,2) (120,2) (120,168) (0,168)`; every wall horizontal or vertical. `W5-notch.png`. | Pass |
| W6 | A new drag took the piece back in line. | Stored outline equal to W4's (6 corners). | Pass |
| W7 | Dragged it in 24 in, released (8 corners), then dragged it back in line. | Stored outline equal to W4's. | Pass |
| W8 | Clicked the bottom wall's label, typed 11 for 10 ft, Enter (which-end at End). | `(-12,2) (40,2) (80,2) (120,2) (120,168) (-12,168)`: the left wall moved out 12 in; every wall horizontal or vertical. | Pass |
| W9 | Opened the same label, chose the first which-end arrow (the start end), typed 10, Enter. | Before Enter the moving-end mark was centred on `Corner 5`, the bottom wall's start. After: `… (108,2) (108,168) (-12,168)`: the right wall moved in 12 in; the corners moved in W8 did not. | Pass |
| W10 | Opened the left wall's label, typed 20, Escape. | Outline unchanged; the label reads `13′ 10″`; focus is on that label; no editor. | Pass |
| W11 | Opened the same label, typed `0.1`, Enter; then Escape. | Outline unchanged; the editor stayed open; the sidebar reads `That wall would be too short.`; Escape closed it. `W11-refused.png`. | Pass |
| W12 | Fresh. Armed the door tool, clicked the middle of the top wall; armed the window tool, clicked the middle of the right wall. Dragged the top wall 12 in into the room. | Before: door on `c1` offset 56, window on `c2` offset 66. After: outline `(0,12) (144,12) (144,168) (0,168)`; door on `c1` offset 56; window on `c2` offset 54 (the right wall's start moved 12 in down the wall, so the window is where it was in the room). | Pass |
| W13 | Dragged the left wall to the right, 80 in and 50 px more, read the sidebar, released. | While dragging past the limit: `That would leave a door or window without room on its wall.` Stored `(49,12) (144,12) (144,168) (49,168)`, door on `c1` offset 7: 49 + 7 = 56, so the door has not moved in the room and the wall stopped before it. The wall stopped at the last step the drag reported before the door's edge (the script moves in 8 steps), not exactly at it. `W13-door-stops-wall.png`. | Pass |
| W14 | Fresh. Sidebar: `Both`; focused wall 1's field; typed 10 for 12 ft. | On focus: band `c1` selected, 2 moving-end marks. Stored `(12,0) (132,0) (132,168) (12,168)`. `W14-sidebar-both.png`. | Pass |
| W15 | Fresh. Dragged `Corner 2` 30 in right and 30 in down, then dragged the bottom wall 12 in into the room. | Before `(0,0) (174,30) (144,168) (0,168)`, after `(0,0) (174,30) (146.61,156) (0,156)`. Wall directions the same before and after to 0.01: `(0.99,0.17) (-0.21,0.98) (-1,0) (0,-1)`; the bottom wall is horizontal, 12 in higher. `W15-diagonal.png`. | Pass |
| W16 | Clicked the left wall; Delete; Escape. | 1 band selected; outline unchanged after Delete; no band selected after Escape. | Pass |
| W17 | Right-clicked the left wall. | No band selected; outline unchanged. | Pass |
| W18 | Reloaded. | Stored outline equal to W15's; no notice. | Pass |
| W19 | Fresh. Dragged the top wall 60 in into the room, then `Done`. Dragged the desk. | Outline `(0,60) (144,60) (144,168) (0,168)`; the bed's stored record is unchanged; the top bar reads `1 conflict`; no `.room-wall-label`; the overall dimension lines sit 29.5 px from the walls (51.5 px in room mode); the desk's stored position changed after its drag. `W19-furnish-mode.png`. | Pass |
| W20 | Fresh. Double-clicked the top wall at 48 in and 96 in, dragged the piece 24 in in. Looked at the 3D view, then Blueprint. | Stored `(0,0) (48,0) (48,24) (96,24) (96,0) (144,0) (144,168) (0,168)` (8 corners). In `W20-notch-3d.png` the back wall steps towards the viewer between the two new corners; in `W20-notch-blueprint.png` the same step is drawn in the wall outline. | Pass |
| W21 | Sidebar: `Both`; typed 5 for 4 ft in wall 3 (the notch's bottom piece). | `(0,0) (42,0) (42,24) (102,24) (102,0) (144,0) (144,168) (0,168)`: 6 in at each end, 8 corners, every wall horizontal or vertical. `W21-notch-wider.png`, and `W21-inset-layout.png` for the labels in the inset pane. | Pass |
| W22 | Console and requests for the whole run. | 0 console errors, warnings or page errors; every request went to `localhost:3478`. | Pass |
| X1 | Fresh. Opened the top wall's label and typed 11 for 12 ft, without Enter; then pressed the left wall and dragged it 6 in into the room. | Stored `(6,0) (132,0) (132,168) (6,168)`: the typed length was applied when the field was left (right wall at 132) and the drag then moved the left wall 6 in; the top wall is 126 in. No editor open. (Before the final fix the drag undid the typed length.) | Pass |
| X2 | Fresh. Placed a door on the top wall (offset 56). With Alt held, dragged `Corner 1` 10 in right, then 20 in down, then back to where it started, in one drag. | Stored outline `(0,0) (144,0) (144,168) (0,168)`; the door is on `c1` at offset 56. (Before the final fix it ended at 46.) | Pass |

## Not covered by this check

- Double-tap on a touch screen (the browser's `dblclick`) was not tried on a touch device.
- Safari and Firefox were not run; the label-click fix for browsers that do not focus a
  clicked button is covered by unit tests only.
- On very short walls (the 2 ft sides of the notch in the inset pane) neighbouring labels
  touch or overlap; see `W21-inset-layout.png`.
