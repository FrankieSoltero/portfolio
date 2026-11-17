# Stop at walls: design

- **Date:** 2026-11-16
- **Status:** approved by the owner on 2026-11-16
- **Delivery:** added to pull request #3 (branch `undo-redo`), by the owner's choice.

## The problem

A dragged piece of furniture can cross a wall. Only its centre is kept inside the room; the
rest leaves and the piece turns red ("Outside the room"). Putting a bed flush in a corner
means stopping the pointer on exactly the right 1 inch step. When the room's size or the
piece's size is not a whole number of inches, the flush position is not on the grid at all
and cannot be reached by dragging.

This was a decision of the first slice ("a footprint that leaves the room is a conflict, not
a clamp"). This design reverses it for moves.

## Owner's decisions (2026-11-16)

1. Every wall stops a piece, including the inner corner of an L-shape and angled walls.
2. Furniture and obstacles both stop at walls. Furniture may still overlap other furniture
   (that stays a red conflict, as now).
3. The change is added to pull request #3.

## Behaviour

**The rule.** A move that starts with the piece wholly inside the room never ends with any
part of it outside. The piece goes as far towards the pointer as it can and stops touching
the wall.

| Case | Result |
|---|---|
| Drag a piece past a wall | It stops flush against the wall. Keep dragging along the wall and it slides along it. |
| Drag into a corner | It stops flush against both walls. |
| Arrow-key nudge into a wall | The piece moves the part of the step that fits and stops flush. More presses do nothing. |
| Room or piece size is not a whole inch | The flush position is still reached: the wall wins over the 1 inch grid. |
| L-shape: drag into the cut-out | The piece stops against the cut-out's walls. |
| L-shape: drag quickly from one arm across the cut-out to the other arm | Allowed. If the place under the pointer fits, the piece goes there. |
| Angled wall | The piece stops touching the wall and slides along it as the drag goes on. |
| Rugs | Same as other furniture. |
| Obstacles (boxes and columns) | Same rule, for drags and nudges. |
| Piece that is already partly outside (after the room was made smaller, or from an older saved plan) | Moves freely, as today, and is red while outside. Once a move leaves it wholly inside, the rule applies again. |
| Piece too big to fit anywhere | Moves freely, as today, and stays red. |

Touching a wall is not a conflict today and stays that way, so a piece stopped by a wall is
never red because of the wall.

## What does not change

- **Turning a piece** (R key, angle field) near a wall can still leave a corner outside; the
  piece turns red, as today. It is not pushed back.
- **Changing the room** (moving a wall, typing a length, a starting shape) never moves
  furniture. A piece left outside turns red, as today.
- **Typed values** in the sidebar (an obstacle's size, a piece's angle) are stored as typed.
- **New pieces** are placed where they are today.
- **Furniture against furniture and furniture against obstacles:** still free to overlap,
  still a red conflict.
- **The conflict rules** and their wording. "Outside the room" stays for the cases above.
- **The saved-plan format.** Nothing new is stored. No package is added.
- **Undo and redo.** A drag is still one step.

## How it works

One new pure function in `room-planner/domain/` decides where a move ends. It takes the
piece's shape at its starting position, the place the move asks for, and the room's outline:

1. If the piece is not wholly inside at the start, return the place the move gave before
   this change (the asked-for place with its centre clamped into the room's bounding box). "Inside" allows the same 0.01 in of touching the conflict check allows, so a
   piece saved a hair over a wall still counts as inside and still slides.
2. If the piece fits at the asked-for place, return it.
3. Otherwise try several ways of getting close and keep the one that ends nearest the
   asked-for place: along x as far as fits and then along y; along y and then along x; and,
   for each angled wall, along that wall's direction. Each "as far as fits" is found by
   halving the distance 26 times. Moving one direction at a time is what makes the piece
   slide along a wall. (Refined while planning: the first draft had only "x then y", which
   would stick on an angled wall.)
4. The answer is stored to 0.01 in, as all positions are. If rounding would put the piece
   over the wall, it is rounded towards the start instead. A slide along an angled wall is
   found without rounding and then takes the 0.01 in point next to its end (rounded down or
   up in x and in y) that fits and is nearest the asked-for place. (Changed after the
   whole-change review: rounding the slide's end before testing it often put it over the
   wall, and the piece lagged the pointer by up to 5 in.)

`moveItem`, `shiftItem`, `moveObstacle` and `shiftObstacle` use it. They take the room's
outline in place of the room's bounding box. The grid snap still runs first, on the
asked-for place. For a piece that starts inside, the asked-for place is not clamped to the
room's bounding box (only to twice the planner's coordinate limit), so beyond an angled wall
the piece goes towards the pointer, not towards the box's corner. A piece that starts outside
is still clamped to the bounding box, as before.

An arrow-key nudge moves straight only: it goes as far along the step as fits and stops. It
never moves sideways along a wall, so a nudge into an angled wall keeps the other coordinate.
(Both changed after the whole-change review.)

Cost: about 0.1 ms per move in rooms of up to 6 corners; in a room where every wall is angled
about 0.4 ms (box) to 1.1 ms (column) at 16 corners and 4.3 ms (box) to 12.4 ms (column) at
64 corners, the most the planner allows (measured by a reviewer's probe on the development
machine; the probe is not kept in the repo). Since the asked-for place is no longer clamped
to the room's bounding box, a pointer beyond that box costs more in such a room: about 0.5 ms
to 1.7 ms at 16 corners and 6 ms to 17 ms at 64 corners (the same probe, run on the fix).

## Defaults I chose (say if any should differ)

- Turning is not pushed back from walls (above).
- A fast drag may jump a piece across an L-shape's cut-out (above).
- A piece that starts outside is not pulled in automatically; the owner drags it in.

## Testing

- Unit tests for the new function: rectangle (each wall, each corner), sizes that are not
  whole inches, a quarter-turned and a 30°-turned piece, an L-shape's cut-out, an angled
  wall, a start that is already outside, a piece too big to fit, a cylinder obstacle.
- Tests of the four move functions and of the store actions through them.
- Existing tests that expect a drag to leave the room are changed to start from a piece
  placed outside by a room change.
- A live browser check: bed into the top right corner (stored position is exactly flush, no
  red), a nudge into a wall, an L-shape cut-out, an obstacle, undo of a stopped drag.

## Known limits

- Along an angled wall the piece can lag the pointer slightly; the piece never crosses the
  wall. Measured over 60 drags into angled walls (3 rooms, 4 turns, 5 directions, 120 frames
  each, 7,200 frames), the piece's distance from where it settles once the pointer stops was
  above zero on 584 frames: 0.02 in or less on half of them, 0.05 in or less on 92%, and more
  than 0.71 in on one frame only (1.26 in). Before the whole-change review's fix it was
  typically 0.5 to 2 in, worst 5.3 in for two frames.
- A column is checked as a 16-sided outline, so against an angled wall its true circle can
  reach up to about 2% of its radius past the wall (0.23 in for a 24 in column); the conflict
  check uses the same outline.
- Turning a piece near a wall is not pushed back; it can turn red.
- Changing the room never moves furniture; a piece left outside turns red and drags freely
  until it is wholly inside again.
- A fast drag can carry a piece across an L-shape's cut-out to the other arm.
- Furniture still overlaps other furniture and obstacles (red), by the owner's choice.
- Cost grows with the number of angled walls: about 0.1 ms per move in rooms of up to 6
  corners; in a room where every wall is angled about 0.4 ms (box) to 1.1 ms (column) at 16
  corners and 4.3 ms (box) to 12.4 ms (column) at 64 corners, the most the planner allows
  (measured by a reviewer's probe on the development machine; the probe is not kept in the
  repo), and about 0.5 to 1.7 ms and 6 to 17 ms when the pointer is beyond the room's
  bounding box. The live check's longest pointer-move handling was 7.3 ms (mean 1.56 ms) in
  the L-shape room, most of it rendering.
- Safari and Firefox are not run, as for the rest of the planner.
