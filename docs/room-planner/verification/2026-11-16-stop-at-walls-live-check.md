# Stop at walls: live check

- **Run on:** 2026-11-16 (Task 3 of `docs/room-planner/plans/2026-11-16-stop-at-walls.md`,
  with its Amendment 1).
- **Commit under test (final run):** `2197e99`, branch `undo-redo` (`git rev-parse --short
  HEAD` printed `2197e99` at the start of run 2). `2197e99` changes only the plan document;
  nothing under `room-planner/` changed since the code commit `8a77545`, and nothing changed
  during the run.
- **Browser:** the Playwright test browser (its own profile), viewport 1440×900, one tab. The
  check is one script (kept outside the repo) that drives `page.mouse` and `page.keyboard` and
  computes each row's pass or fail from what it reads.
- **No other input:** before run 2 the script watched the page for 15 s and saw 0 trusted
  pointer or key events. During the run it counted every trusted `pointerdown` the page
  received against the ones it sent itself; they matched for every row.
- **Server:** `npx next dev -p 3478` on `localhost` (already running, hot reload on this
  branch).
- **How values were read:** "stored" is
  `JSON.parse(localStorage.getItem('room-planner:plan:v1'))`, read 500 ms after the last
  change. On a fresh page nothing is stored yet, so the fresh positions are the seeded plan's
  (bed `(72, 42.5)`, desk `(131, 131.5)` at 90°); the script checked the bed's fresh position
  against its box on screen (`(72, 42.5)` read back from pixels). `hx`, `hy` are half the
  bounding box of the stored `w`, `d`, `angle`. The plan scale (px per inch) is the width of
  the plan's width dimension line over the stored outline's width, measured again after every
  change of room size (2.93 px/in for the 144 × 168 room, 2.86 at 147.5 wide, 3.52 at 120
  wide). "Not red" means the piece's plan button has no `is-conflict` class and its sidebar
  row has no conflict tag and no `Outside the room` text. "Exactly" means equal after rounding
  to 0.01. "Fresh" means the key is removed, the page reloaded, `Side by side` chosen and
  focus removed from that layout option.
- **Screenshots:** `docs/room-planner/verification/shots-stop-at-walls/bed-in-corner.png`
  (row W1, retaken in run 2). Read by the implementer: the bed is flush in the top right
  corner, drawn in the selected blue, not red, and the stage reads `Everything fits`.

## Runs

| Run | Commit | Result |
|---|---|---|
| 1 | `8a77545` | 12 of 14 W rows and X1 passed. W6 and W7 failed because of how the rows were written, not the app (below). |
| 2 | `2197e99` (plan Amendment 1; no code change) | All 14 W rows and X1 pass. This is the run recorded in the table. |

### What failed in run 1

- **W6:** the row said to type `12' 3.5"` into sidebar wall 1. That field is
  `<input type="number">` read as decimal feet, so it kept only `123.5` (refused as too long)
  and the room stayed 144 wide. Amendment 1 types `12.2916666667` (147.5 in) instead.
- **W7:** the desk stopped inside the L, flush against the cut-out wall, but was red with
  `Overlaps Low platform bed, queen`: the seeded bed stays partly in the cut-out of the
  L-shape room and the desk overlapped it by 9 × 1 in (an unchanged conflict rule).
  Amendment 1 deletes the bed first.

No change to the app.

## Rows (run 2, `2197e99`)

| Row | What was done | What was read | Result |
|-----|---------------|---------------|--------|
| W1 | Fresh. Pressed on the bed, moved the pointer in 8 steps to 300 px right of and 300 px above the room's top right corner, released. | Stored bed `(112, 42.5)`; `hx` 32, `hy` 42.5, so `144 − hx` = 112 and `hy` = 42.5. No conflict class or tag. `bed-in-corner.png`. | Pass |
| W2 | Bed still selected (`aria-pressed="true"`): ArrowRight 3 times, ArrowUp 3 times. | Stored bed `(112, 42.5)` before and after. | Pass |
| W3 | Clicked `Undo` once. | Bed `(72, 42.5)` (its fresh position); `Undo` has `aria-disabled="true"`. | Pass |
| W4 | Fresh. Pressed on the desk, moved 30 px left and to 400 px below the bottom wall, released. | Stored desk `(121, 140.5)` at 90°; `hy` 27.5, so `168 − hy` = 140.5. The pointer asked for x = 131 − 30 / 2.93 = 120.76; stored 121 is 0.24 in from it. Not red. | Pass |
| W5 | Fresh, bed into the corner as W1 (stored `(112, 42.5)`). Pressed on the bed, moved to 200 px right of the right wall and 80 px down, released. | Stored `(112, 69.5)`; x = `144 − hx`; the pointer asked for y = 42.5 + 80 / 2.93 = 69.8, stored 69.5 is 0.3 in from it and greater than `hy`. | Pass |
| W6 | Fresh, `Edit room`. Clicked sidebar `Wall 1`, selected its text, typed `12.2916666667`; `Done`; scale measured again (2.86 px/in); dragged the bed 300 px past the right wall. | Outline `(0,0) (147.5,0) (147.5,168) (0,168)`, room 147.5 wide. Stored bed `(115.5, 42.5)` = `147.5 − hx` exactly. Not red. | Pass |
| W7 | Fresh, `Edit room`, `L-shape`, `Done`. Clicked the bed, pressed Delete (only the desk left). The script computed the cut-out from the stored outline `(0,0) (72,0) (72,84) (144,84) (144,168) (0,168)`: reflex corner `(72, 84)`, missing corner `(144, 0)`, middle `(108, 42)`. Dragged the desk from `(131, 131.5)` towards that point. | Stored desk `(108, 111.5)` at 90°; footprint corners `(95,139) (121,139) (121,84) (95,84)`, all inside the outline; its side `(121,84)–(95,84)` lies on the cut-out wall `(72,84)–(144,84)`. No conflict class or tag. | Pass |
| W8 | Fresh, `Edit room`, `Add box` (stored at `(72, 84)`, 24 wide, rotation 0). Dragged it 300 px past the left wall. | Stored obstacle `(12, 84)`; `hx` 12. Its row in the room features list reads `Box` with no conflict tag; its plan box has no `is-conflict` class. | Pass |
| W9 | Fresh. Bed into the corner (stored `(112, 42.5)`). `Edit room`, dragged the right wall 24 in left, `Done`. | Outline `(0,0) (120,0) (120,168) (0,168)`; bed still `(112, 42.5)`; plan button `is-conflict`, sidebar tag `Outside the room`. | Pass |
| W10 | Scale measured again (3.52 px/in). Dragged the bed 5 px left. | Bed `(112, 42.5)` → `(111, 42.5)`; still `is-conflict` with `Outside the room`. | Pass |
| W11 | Dragged the bed 150 px left, then 400 px right. | After the first drag `(68, 42.5)`, not red. After the second `(88, 42.5)` = `120 − hx` exactly, not red. | Pass |
| W12 | Fresh. Bed into the corner, pressed R once. | Before `(112, 42.5)` at 0°; after `(112, 42.5)` at 90°. | Pass |
| W13 | Fresh. One drag of the bed into the corner (`(112, 42.5)`); clicked `Undo` once. | Bed `(72, 42.5)`. | Pass |
| W14 | Console and requests for the whole run. | 0 console errors, warnings or page errors (only the dev-mode React DevTools info line); every request went to `localhost:3478`. | Pass |
| X1 | Fresh, `Edit room`, `L-shape`, `Done`. Pressed on the desk and moved the pointer in 60 steps to `(134, 10)`, deep in the cut-out past its corner; released. A capture-phase window listener marked each `pointermove`'s start and a window listener added after the press (so after the drag's own) marked its end; a `requestAnimationFrame` loop recorded frame gaps. | 60 moves; longest `pointermove` handling 7.3 ms (mean 1.56 ms); longest frame gap 35 ms, mean 33.3 ms over 67 frames, none over 50 ms. Desk ended at `(131, 111.5)`, flush under the cut-out wall and against the right wall, every corner inside. The drag ran without a stall: judged from the numbers, not by eye (the longest gap is within 2 ms of the mean, so frames came at a steady ~30 per second in this test browser). | Pass |

## Not covered by this check

- Safari and Firefox were not run; only the Playwright Chromium test browser.
- Touch and pen input were not run; only mouse pointer events.
- Pieces turned to an angle other than a multiple of 90°, and walls that are not horizontal
  or vertical, were not run live.
- Obstacle nudging with the arrow keys and cylinder obstacles were not run live.
- The sidebar wall field takes decimal feet only; a feet-and-inches entry such as `12' 3.5"`
  is not supported by that field (seen in run 1), and this check does not cover any other way
  of typing one.
- X1's timing is from the dev server in the test browser; a production build was not timed.
