# Stop at walls: live check

- **Run on:** 2026-11-16 (Task 3 of `docs/room-planner/plans/2026-11-16-stop-at-walls.md`,
  with its Amendments 1 and 2).
- **Commit under test (final run):** `80ef8c1`, branch `undo-redo` (`git rev-parse --short
  HEAD` printed `80ef8c1` at the start of run 3). `80ef8c1` is a plan-document edit on top of
  the fix commit `423c224`, which is the last commit that changes anything under
  `room-planner/`. Nothing changed during the run.
- **Browser:** the Playwright test browser (its own profile), viewport 1440×900, one tab. The
  check is one script (kept outside the repo) that drives `page.mouse` and `page.keyboard` and
  computes each row's pass or fail from what it reads.
- **No other input:** before run 3 the script watched the page for 15 s and saw 0 trusted
  pointer or key events. During the run it counted every trusted `pointerdown` the page
  received against the ones it sent itself; they matched for every row.
- **Server:** `npx next dev -p 3478` on `localhost` (already running, hot reload on this
  branch).
- **How values were read:** "stored" is
  `JSON.parse(localStorage.getItem('room-planner:plan:v1'))`, read 500 ms after the last
  change (also while a drag is held: the plan is saved during the drag). On a fresh page
  nothing is stored yet, so the fresh positions are the seeded plan's (bed `(72, 42.5)`, desk
  `(131, 131.5)` at 90°); the script checked the bed's fresh position against its box on
  screen (`(72, 42.5)` read back from pixels). `hx`, `hy` are half the bounding box of the
  stored `w`, `d`, `angle`. The plan scale (px per inch) is the width of the plan's width
  dimension line over the stored outline's width, measured again after every change of room
  size (2.93 px/in for the 144 × 168 room and the angled room, 2.86 at 147.5 wide, 3.52 at 120
  wide). "Not red" means the piece's plan button has no `is-conflict` class and its sidebar
  row has no conflict tag and no `Outside the room` text. "Exactly" means equal after rounding
  to 0.01. "Fresh" means the key is removed, the page reloaded, `Side by side` chosen and
  focus removed from that layout option.
- **Screenshots:** `docs/room-planner/verification/shots-stop-at-walls/` (2 files, both taken
  in run 3 and read by the implementer). `bed-in-corner.png` (W1): the bed is flush in the top
  right corner, drawn in the selected blue, not red, and the stage reads `Everything fits`.
  `desk-at-angled-wall.png` (X3): the angled room, the desk selected (blue, not red) with its
  bottom right corner on the angled wall, `Everything fits`.

## Runs

| Run | Commit | Result |
|---|---|---|
| 1 | `8a77545` | 12 of 14 W rows and X1 passed. W6 and W7 failed because of how the rows were written, not the app (below). |
| 2 | `2197e99` (plan Amendment 1; no code change) | All 14 W rows and X1 pass. |
| 3 | `80ef8c1` (code from `423c224`) | Run again because `423c224` carries the whole-change review's fixes (plan Amendment 2): the asked-for place is no longer clamped to the room's box for a piece that starts inside, arrow-key nudges move straight only, and the slide along an angled wall follows the pointer more closely. Rows W2, W12 and W13 strengthened, rows X2 and X3 added. All 14 W rows and X1–X3 pass. This is the run recorded in the table. |

### What failed in run 1

- **W6:** the row said to type `12' 3.5"` into sidebar wall 1. That field is
  `<input type="number">` read as decimal feet, so it kept only `123.5` (refused as too long)
  and the room stayed 144 wide. Amendment 1 types `12.2916666667` (147.5 in) instead.
- **W7:** the desk stopped inside the L, flush against the cut-out wall, but was red with
  `Overlaps Low platform bed, queen`: the seeded bed stays partly in the cut-out of the
  L-shape room and the desk overlapped it by 9 × 1 in (an unchanged conflict rule).
  Amendment 1 deletes the bed first.

No change to the app for either.

### How the run-3 rows were done

- **W2** now presses ArrowLeft once (away from the right wall) and ArrowRight once (back to
  flush) before the blocked presses. Those two presses are one keyed undo step, so W3's single
  `Undo` would take back that step instead of the drag. To keep W3 testing what it tests (the
  blocked presses add no step), W2 clicks `Undo` once after the press back: that removes the
  away-and-back step, the bed stays flush and `Undo` stays enabled (the drag's step remains).
  The bed was still selected after that `Undo`, so no click was needed before the blocked
  presses.
- **X2 and X3** build the angled room by dragging `Corner 3` (the bottom right corner) 48 in
  left with Alt held (no angle snap). The stored outline is then
  `(0,0) (144,0) (96,168) (0,168)`: the right wall runs from `(144,0)` to `(96,168)`. After
  `Done` the bed is deleted, because the slide along that wall can carry the desk up into it.
  The desk then sits partly outside the new room (`(131, 131.5)`), and a piece that starts
  outside goes where it is asked without a stop, so one drag first parks it inside at
  `(60, 125.5)` (not red). The rows' own steps start from there.
- **X1's pass bar:** all 60 pointer moves are handled, the desk ends with every corner inside
  the outline, and no frame gap during the drag is 100 ms or longer.

## Rows (run 3, `80ef8c1`)

| Row | What was done | What was read | Result |
|-----|---------------|---------------|--------|
| W1 | Fresh. Pressed on the bed, moved the pointer in 8 steps to 300 px right of and 300 px above the room's top right corner, released. | Stored bed `(112, 42.5)`; `hx` 32, `hy` 42.5, so `144 − hx` = 112 and `hy` = 42.5. No conflict class or tag. `bed-in-corner.png`. | Pass |
| W2 | Bed still selected. ArrowLeft once; ArrowRight once; `Undo` once (see above); then ArrowRight 3 times, ArrowUp 3 times. | After ArrowLeft `(111, 42.5)` (moved by the 1 in step); after ArrowRight `(112, 42.5)` (flush); after the `Undo` `(112, 42.5)` and `Undo` still enabled; bed selected (`aria-pressed="true"`) before and after the blocked presses; after them `(112, 42.5)`. | Pass |
| W3 | Clicked `Undo` once. | Bed `(72, 42.5)` (its fresh position); `Undo` has `aria-disabled="true"`. | Pass |
| W4 | Fresh. Pressed on the desk, moved 30 px left and to 400 px below the bottom wall, released. | Stored desk `(121, 140.5)` at 90°; `hy` 27.5, so `168 − hy` = 140.5. The pointer asked for x = 131 − 30 / 2.93 = 120.76; stored 121 is 0.24 in from it. Not red. | Pass |
| W5 | Fresh, bed into the corner as W1 (stored `(112, 42.5)`). Pressed on the bed, moved to 200 px right of the right wall and 80 px down, released. | Stored `(112, 69.5)`; x = `144 − hx`; the pointer asked for y = 42.5 + 80 / 2.93 = 69.8, stored 69.5 is 0.3 in from it and greater than `hy`. | Pass |
| W6 | Fresh, `Edit room`. Clicked sidebar `Wall 1`, selected its text, typed `12.2916666667`; `Done`; scale measured again (2.86 px/in); dragged the bed 300 px past the right wall. | Outline `(0,0) (147.5,0) (147.5,168) (0,168)`, room 147.5 wide. Stored bed `(115.5, 42.5)` = `147.5 − hx` exactly. Not red. | Pass |
| W7 | Fresh, `Edit room`, `L-shape`, `Done`. Clicked the bed, pressed Delete (only the desk left). The script computed the cut-out from the stored outline `(0,0) (72,0) (72,84) (144,84) (144,168) (0,168)`: reflex corner `(72, 84)`, missing corner `(144, 0)`, middle `(108, 42)`. Dragged the desk from `(131, 131.5)` towards that point. | Stored desk `(108, 111.5)` at 90°; footprint corners `(95,139) (121,139) (121,84) (95,84)`, all inside the outline; its side `(121,84)–(95,84)` lies on the cut-out wall `(72,84)–(144,84)`. No conflict class or tag. | Pass |
| W8 | Fresh, `Edit room`, `Add box` (stored at `(72, 84)`, 24 wide, rotation 0). Dragged it 300 px past the left wall. | Stored obstacle `(12, 84)`; `hx` 12. Its row in the room features list reads `Box` with no conflict tag; its plan box has no `is-conflict` class. | Pass |
| W9 | Fresh. Bed into the corner (stored `(112, 42.5)`). `Edit room`, dragged the right wall 24 in left, `Done`. | Outline `(0,0) (120,0) (120,168) (0,168)`; bed still `(112, 42.5)`; plan button `is-conflict`, sidebar tag `Outside the room`. | Pass |
| W10 | Scale measured again (3.52 px/in). Dragged the bed 5 px left. | Bed `(112, 42.5)` → `(111, 42.5)`; still `is-conflict` with `Outside the room`. | Pass |
| W11 | Dragged the bed 150 px left, then 400 px right. | After the first drag `(68, 42.5)`, not red. After the second `(88, 42.5)` = `120 − hx` exactly, not red. | Pass |
| W12 | Fresh. Bed into the corner, pressed R once. | Before the press `(112, 42.5)` at 0° = `(144 − hx, hy)`; after `(112, 42.5)` at 90°. | Pass |
| W13 | Fresh. One drag of the bed into the corner; clicked `Undo` once. | Before the `Undo` `(112, 42.5)` = `(144 − hx, hy)`; after it `(72, 42.5)`. | Pass |
| W14 | Console and requests for the whole run. | 0 console errors, warnings or page errors (only the dev-mode React DevTools info line); every request went to `localhost:3478`. | Pass |
| X1 | Fresh, `Edit room`, `L-shape`, `Done`. Pressed on the desk and moved the pointer in 60 steps to `(134, 10)`, deep in the cut-out past its corner; released. A capture-phase window listener marked each `pointermove`'s start and a window listener added after the press (so after the drag's own) marked its end; a `requestAnimationFrame` loop recorded frame gaps. | 60 moves; longest `pointermove` handling 2.4 ms (mean 0.46 ms); longest frame gap 34.6 ms, mean 33.3 ms over 67 frames, none over 50 ms. Desk ended at `(131, 111.5)`, flush under the cut-out wall and against the right wall, every corner inside. The drag ran without a stall: judged from the numbers, not by eye (the longest gap is within 1.3 ms of the mean, so frames came at a steady ~30 per second in this test browser). | Pass |
| X2 | Angled room as above; desk parked at `(60, 125.5)`. The wall's outward normal is `(0.962, 0.275)`, so ArrowRight pushes into it. Dragged the desk 100 in to the right (it stopped at the wall); then, with the desk selected, pressed ArrowRight 10 times, reading the stored position after each press. | After the drag `(92.77, 106.3)` (the drag slid it up along the wall); its nearest footprint corner is 0.0014 in from the angled wall. After each of the 10 presses `(92.77, 106.3)`: y never changed, and no press moved it (it was already flush, so the position stopped changing from the first press). Footprint inside; not red. | Pass |
| X3 | Same room built again (outline identical to X2's); desk parked at `(60, 125.5)`. Pressed on the desk and moved the pointer in 40 steps along the wall's outward normal to plan point `(253.19, 180.7)`, 320 px right of the room's box; held, read, released, read. | While held: stored `(85.15, 132.97)` at 90°; footprint `(72.15,160.47) (98.15,160.47) (98.15,105.47) (72.15,105.47)`, every corner inside; nearest corner 0.0014 in from the angled wall. Straight-line stop from `(60, 125.5)` towards the pointer: t = 0.1306, `(85.23, 132.71)`; the stored centre is 0.27 in from it. After release the same `(85.15, 132.97)`. Not red. `desk-at-angled-wall.png`. | Pass |

## Not covered by this check

- Safari and Firefox were not run; only the Playwright Chromium test browser.
- Touch and pen input were not run; only mouse pointer events.
- Pieces turned to an angle other than a multiple of 90° were not run live.
- In X2 the desk was already flush when the presses began, so no press moved it; a nudge that
  moves part of a step into an angled wall was not seen live (W2 shows a full step and a
  return to flush against a straight wall).
- Obstacle nudging with the arrow keys and cylinder obstacles were not run live.
- The sidebar wall field takes decimal feet only; a feet-and-inches entry such as `12' 3.5"`
  is not supported by that field (seen in run 1), and this check does not cover any other way
  of typing one.
- X1's timing is from the dev server in the test browser; a production build was not timed.
