# Undo and redo: live check

- **Run on:** 2026-11-16 (Task 8 of `docs/room-planner/plans/2026-11-16-undo-redo.md`).
- **Commit under test (final run):** `35af5f1`, branch `undo-redo`. Nothing under
  `room-planner/` changed after this run.
- **Browser:** the Playwright test browser (its own profile, so the reload and `Reset plan`
  rows touch no real saved plan), viewport 1440×900, one tab. The check is one script (kept
  outside the repo) that drives `page.mouse` and `page.keyboard` and computes each row's
  pass or fail from what it reads.
- **Server:** `npx next dev -p 3478` on `localhost`.
- **How values were read:** "stored" is
  `JSON.parse(localStorage.getItem('room-planner:plan:v1'))`, read 500 ms after the last
  change. Furniture positions are the stored centre `(x, y)` in inches; outlines are
  `(x, y)` per corner, in order. "Fresh" means the key is removed, the page reloaded and
  `Side by side` chosen (plus `Edit room` for the room-mode rows). The plan scale is
  measured again after every change of the room's size. "Mod" is Cmd on macOS and Ctrl
  elsewhere; the run used Cmd.
- **Screenshots:** `docs/room-planner/verification/shots-undo-redo/` (2 files). The
  controller read both.

## Runs

| Run | Commit | Result |
|---|---|---|
| 1 | `b7c256b` | 19 of 20 rows passed. U4 failed because of the script, not the app (below). |
| 2 | `b7c256b` | All 20 rows pass. |
| 3 | `35af5f1` (final-review fix) | All 20 rows pass with the same values as run 2, and the extra row X1 passes. This is the run recorded in the table. |

### What failed in run 1

- **U4:** five ArrowRight presses did not move the bed. The script had just clicked the
  `Side by side` layout option, which is a radio button and kept keyboard focus; arrow keys
  belong to a focused radio button (that rule is older than this work), so they never
  reached the bed. The script now removes focus from the layout option after choosing it.
  No change to the app.

## Rows (run 3, `35af5f1`)

| Row | What was done | What was read | Result |
|-----|---------------|---------------|--------|
| U1 | Fresh page. | `Undo` and `Redo` both have `aria-disabled="true"`. `header-greyed.png`. | Pass |
| U2 | Dragged the desk 40 px left and 30 px up; pressed Mod+Z. | Stored desk after the drag `(117, 121.5)`; after the key `(131, 131.5)`, and the desk's box on screen is back at its starting pixel. `Redo` enabled. | Pass |
| U3 | Shift+Mod+Z. | Desk at `(117, 121.5)` again. | Pass |
| U4 | Clicked the bed, pressed ArrowRight 5 times quickly, clicked `Undo` once. | Bed `(72, 42.5)` → `(77, 42.5)` → `(72, 42.5)`. | Pass |
| U5 | ArrowRight, waited 1.5 s, ArrowRight; `Undo` once. | Bed at `(74, 42.5)` after the two presses, `(73, 42.5)` after one undo: only the second press was taken back. `header-both-enabled.png`. | Pass |
| U6 | Fresh, room mode. Dragged the right wall 24 in left; `Undo`. | Outline `(0,0) (120,0) (120,168) (0,168)`, then `(0,0) (144,0) (144,168) (0,168)`. | Pass |
| U7 | Double-clicked the top wall; `Undo`. | 5 corners, then the 4-corner rectangle. | Pass |
| U8 | Clicked sidebar wall 1, selected its text, typed `1` then `0`; clicked `Undo` once. | After typing: 120 wide. After one undo: 144 wide, and the field shows `12`. | Pass |
| U9 | Clicked the top wall's label, typed 11, Enter; with focus on the label pressed Mod+Z. | `(0,0) (132,0) (132,168) (0,168)`, then the 144-wide rectangle. | Pass |
| U10 | Furnish mode: dragged the desk (one step). Pressed `Edit room`, focused the sidebar wall 1 field and pressed Mod+Z without typing. | Stored desk `(120, 114.5)` before and after the key: the plan step was not taken back. `Undo` still enabled. | Pass |
| U11 | Fresh, room mode. Placed a door on the top wall, dragged the top wall 12 in into the room, clicked `Undo` twice. | After the edits: 1 opening, outline `(0,12) (144,12) (144,168) (0,168)`. After two undos: no opening, the starting rectangle, `Undo` greyed out. | Pass |
| U12 | Starting shape `L-shape`; `Undo`. | 6 corners, then the rectangle. | Pass |
| U13 | Dragged the right wall 24 in left, pressed `Done`, pressed Mod+Z. | Outline back to 144 wide; the page is still in furnish mode (`Edit room` is shown). | Pass |
| U14 | Fresh. Clicked the desk, Delete; `Undo`; dragged the bed. | 1 item, then 2 items; `Redo` enabled before the drag and greyed out after it. | Pass |
| U15 | Fresh. Switched units to m / cm, dragged the desk, `Undo`. | Desk back at `(131, 131.5)` and at its starting pixel; stored `units` is still `m`. | Pass |
| U16 | Fresh. Three drags, then reload. | Stored items equal before and after the reload; `Undo` greyed out. | Pass |
| U17 | Fresh. Pressed on the desk, moved 30 px left, pressed Mod+Z while holding, moved 30 px more, released; then `Undo` once. | At release the desk's box had moved 58.6 px (60 px, less the 1 in grid step), stored `(111, 131.5)`: the key did not stop the drag. One undo put the box back at its starting pixel and left `Undo` greyed out. | Pass |
| U18 | Dragged the desk, pressed `Reset plan` and confirmed. | `Undo` enabled before; `Undo` and `Redo` greyed out after (by design: the spec says `Reset plan` clears the history). | Pass |
| U19 | Fresh. Two drags. Focused `Undo` and pressed Enter until it greyed out, then once more. | 2 presses; `document.activeElement` is still the `Undo` button; the status element reads `Undone`. | Pass |
| U20 | Console and requests for the whole run. | 0 console errors, warnings or page errors; every request went to `localhost:3478`. | Pass |
| X1 | Fresh, room mode. Clicked the top wall's label, typed 13, Enter; pressed ArrowDown once; clicked `Undo` once, then once more. | After Enter `(0,0) (156,0) (156,168) (0,168)`; after the arrow the top wall is at y = 1; after one undo the outline equals the one after Enter (only the slide was taken back, the typed length stayed); after the second undo the starting rectangle, and `Undo` is greyed out. (The final review found that before its fix one undo took back both.) | Pass |

## Not covered by this check

- Row X1's defect was not seen failing in this browser: the row was added after the fix.
  The failing case is recorded by unit tests (flow row F19), which failed before the fix.

- Safari and Firefox were not run. The case where a clicked button does not take focus
  (Safari) is covered by unit tests only.
- No screen reader was run. That `Undone` and `Redone` are spoken is covered only by tests
  of the status element's text.
- Keyboards whose Z key types a non-Latin letter are covered by unit tests only.
