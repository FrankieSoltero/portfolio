# Furniture generator: live check

- **Run on:** 2026-11-20, by the controller session (the live check after Task 8 of the furniture
  generator plan, rows 1 to 9).
- **Commit checked:** `0f59505`, branch `furniture-generator`. The option sweep in row 2 was run at
  `797edc2`, before the final fixes.
- **Browser:** Playwright Chromium.
- **Viewports:** 1280 × 860 and 1440 × 900.
- **URL:** `http://localhost:3478/room-planner`, served by `npx next dev`.
- **Console errors over the whole run:** 0.
- **The check will be repeated on the Vercel preview before the pull request is offered for
  merge.** See "Preview run" below.

## Failures first

No row failed. One finding came out of row 4: round pieces were visibly 16-sided in `room-plan.png`.
It is fixed by commit `66acec5` (`fix(room-planner): draw round pieces smoothly in the floor-plan
picture`), which draws them with 48 points in the picture. Re-check after the fix: pending.

## Rows

| Row | What was done | Expected | Result | What was seen |
|---|---|---|---|---|
| 1 | Added each of the 11 types in an empty room. | Each appears in the list, on the plan and in 3D; no console error. | Pass | 11 rows in the list and 11 pieces on the plan, 2 of them drawn round (the round rug and the round table). No conflicts were flagged in the composed room and there was no notice. |
| 2 | For each type, picked every value of every option once (run at `797edc2`). | After each pick one piece on the plan, the plan matches the 3D view, no console error. | Pass | 97 option picks across the 11 types. After each pick there was exactly one piece on the plan, every option group had one value selected, there was no console error and the sidebar's `scrollWidth - clientWidth` was 0. A round table top was drawn round with 5 part lines; a round rug with a border was drawn round with 1 part line. |
| 3 | Set main and accent colour by swatch and by custom colour on one piece; undo. | Both views show the new colours; one undo per swatch pick; one undo for a custom-colour drag. | Pass | The swatch `Navy` stored `#2f4057`, and the Undo button returned `#6f7f8c`. Three custom-colour inputs in a row stored `#abcdef`, and one Ctrl+Z with the colour input focused returned `#6f7f8c`. Changing Type to Bed and pressing Ctrl+Z with the dropdown focused returned `sofa`. |
| 4 | Downloaded both pictures with the pieces placed. | `room-plan.png` and `room-3d.png` download, are non-empty and show the pieces; round pieces are round in the floor-plan picture. | Pass, with a finding | Both files downloaded and show all 11 pieces. Round pieces were visibly 16-sided in `room-plan.png`; fixed by `66acec5`. Re-check after the fix: pending. |
| 5 | Copied a share link and opened it with empty storage. | The same pieces, styles and colours appear. | Pass | The copied link is 1,620 characters and starts `http://localhost:3478/room-planner#plan=1.`. Opened with empty storage: 11 pieces, plan version 4, and every piece's type, position, size, angle, style and colours identical to the original. Notice `Opened a shared plan.` |
| 6 | At 1280 px, selected a sofa and opened every option group. | `document.querySelector('.sidebar').scrollWidth <= clientWidth`; no control cut off. | Pass | With a sofa selected (six option groups, two colour rows): sidebar `scrollWidth` 339 and `clientWidth` 339; editor 312 and 312; 0 controls outside the editor's box. |
| 7 | Opened a version 3 share link made on the live site (a bed and a desk). | It opens; the bed and desk have their default style and earlier colours; position and size unchanged. | Pass | Both pieces are present with their names. Stored as version 4. The bed has its default style `{headboard: low, finish: panel, footboard: no, base: platform}` and colours `#8a9a8b` / `#a67c52`; the desk has `{supports: legs, drawers: right}` and `#b98d5e` / `#2b2b2d`. Positions (72, 42.5) and (131, 131.5); sizes and angles unchanged. |
| 8 | Put a version 3 saved plan in storage and loaded the planner. | The plan loads with default recipes; after one edit the stored plan is version 4. | Pass | The plan loaded with its bed. Stored version 3 before any edit and version 4 after one option change (headboard tall). Position and size unchanged; no notice. |
| 9 | Blueprint style on, with one of each type. | Every piece is drawn; no console error. | Pass | Every piece was drawn; no console error. |

## Also checked

- Escape from an option inside the editor deselects the piece and leaves focus on the piece's row.
- Console errors over the whole run: 0.

## Not checked

- Safari and Firefox.
- Touch input.
- A plan near the 200-piece limit in a browser.

## Preview run

Pending.

## Summary

| Row | Result |
|---|---|
| 1 | Pass |
| 2 | Pass |
| 3 | Pass |
| 4 | Pass (finding fixed by `66acec5`; re-check pending) |
| 5 | Pass |
| 6 | Pass |
| 7 | Pass |
| 8 | Pass |
| 9 | Pass |
