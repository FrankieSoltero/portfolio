# Sharing: live check

- **Run on:** 2026-11-17, 21:46 to 21:53 UTC (Task 6 of the sharing plan, rows S1 to S18).
- **Commit checked:** `c9d134d` (`feat(room-planner): Share panel and shared-plan banner`), branch
  `sharing`. `git log` printed `c9d134d` as head before and after the run; nothing under
  `room-planner/` changed during it.
- **Browser:** the Playwright Chromium build, version 156.0.8078.82. Every row ran in its own new
  browser context (its own empty storage), driven through `page.mouse`, `page.keyboard` and locator
  clicks. WebGL was available (the 3D canvas was drawn by `three.js r187`; no fallback note).
- **Viewport:** 1440 × 900 in every context (`innerWidth`, `innerHeight` read back as `[1440, 900]`),
  device pixel ratio 1.
- **URL:** `http://localhost:3478/room-planner`, served by the `npx next dev -p 3478` server that was
  already running (not started, stopped or restarted).
- **How values were read:** "stored" is `localStorage.getItem('room-planner:plan:v1')`, read 800 ms
  after the last change. "Plan position" is an item's box centre on screen converted to plan inches
  through the plan's dimension lines (`.plan-dim-w`, `.plan-dim-l`) and the outline's bounding box.
  "Notice" is `.notice-text`, "banner" is `.shared-banner-text`; "`#plan=`" means `location.href`
  contains `#plan=`. Downloads were caught with Playwright's `download` event and saved with
  `saveAs`; the PNGs were decoded with Pillow (a scratch script outside the repo) and looked at with
  an image viewer. The page background is `--color-bg` on `.room-planner`: `#f2f2f3`.
- **The share link used in S1 to S9:** 470 characters,
  `http://localhost:3478/room-planner#plan=1.rZHNTsMwEIRfJZrz…ee1M4HWWme5fgF` (the seeded plan:
  bed `(72, 42.5)` at 0°, desk `(131, 131.5)` at 90°, 12 × 14 ft rectangle).

## Failures first

- **S11 (one check of seven):** the pixel at the exact centre of the bed's footprint is `#1a1c2c`, not
  `#e4e8ee`. The picture writes each item's name centred on its footprint (`planPicture.ts`,
  `name()`: `textAlign = 'center'`, `textBaseline = 'middle'` at the footprint centre), so the
  centre pixel `(520, 585)` falls on the ink of "Low platform bed, queen" (the label's ink spans
  rows 576 to 598). The fill `#e4e8ee` is there just off the text: `(520, 550)`, `(520, 620)` and
  `(520, 800)` are all `#e4e8ee`, and 257 of the 441 pixels in the 21 × 21 box around the centre are
  `#e4e8ee` (87 are `#1a1c2c`, the rest anti-aliasing). Every other S11 check passed. Recorded as
  FAILED as the row is written; whether the row should probe a point off the label is for the
  controller.

No other row failed.

## Rows

| Row | What was done | Expected | Result | What was seen |
|---|---|---|---|---|
| S1 | New context, clipboard-read and clipboard-write granted for `http://localhost:3478`. Opened the planner (stored value `null`, nothing saved yet), clicked `Share`, clicked `Copy link`, read the clipboard with `navigator.clipboard.readText()`. | Clipboard holds an address starting `http://localhost:3478/room-planner#plan=1.`; button reads `Copied`. | Pass | The panel `Share this plan` opened with `Copy link`, `Download floor plan`, `Download 3D view` and an empty status; focus went to `Copy link`. 300 ms after the click the button read `Copied`; the clipboard held a 470-character address starting `http://localhost:3478/room-planner#plan=1.rZHNTsMwEIRfJZrzUjW_…`. 2.5 s later the button read `Copy link` again. |
| S2 | New context (empty storage); went straight to the S1 address. | Bed and desk at the sender's positions; notice `Opened a shared plan.`; no banner; no `#plan=`; the saved key holds the plan. | Pass | Plan positions bed `(72, 42.5)`, desk `(131, 131.5)`, the same as the sender's (sender's screen boxes give the same plan positions; bed-to-desk offset 59 × 89 in on both). Notice `Opened a shared plan.`; no `.shared-banner`; address `http://localhost:3478/room-planner` (no fragment). Stored: `schemaVersion` 3, keys `schemaVersion, units, room, items, openings, obstacles`, outline `(0,0) (144,0) (144,168) (0,168)`, bed `(72, 42.5)` angle 0, desk `(131, 131.5)` angle 90. |
| S3 | New context: opened the planner, dragged the bed 40 px left and 40 px down (stored bed `(42, 72.5)`), then `about:blank`, then the S1 address. | Banner with the first text; plan shows the shared positions; the saved key still holds the moved bed. | Pass | Banner `Viewing a shared plan. Your own plan is untouched, and changes here are not saved.` with buttons `Keep this plan`, `Back to my plan`; no notice; address keeps `#plan=1.rZHN…`. Plan positions bed `(72, 42.5)`, desk `(131, 131.5)`. Stored string identical to the one read before opening the link (bed `(42, 72.5)`, desk `(131, 131.5)`). Undo disabled. |
| S4 | In the S3 page: dragged the desk 30 px left and 30 px up, waited 2 s, reloaded. | Saved key unchanged before and after; after reload the shared plan as in the link. | Pass | After the drag the plan showed the desk at `(106, 106.5)`. Stored string after 2 s identical to before the drag, and identical after the reload (bed `(42, 72.5)`, desk `(131, 131.5)`). After the reload: the same banner and both buttons, `#plan=` still in the address, plan positions bed `(72, 42.5)`, desk `(131, 131.5)` (the desk move was not kept). |
| S5 | In the S3 page after S4: clicked `Keep this plan` (the banner then showed `Replace my plan`, `Cancel`, `Back to my plan`), clicked `Replace my plan`. | Banner gone; no `#plan=`; saved key equals the shared plan; Undo greyed out. | Pass | No `.shared-banner`, no notice; address `http://localhost:3478/room-planner`. Stored plan equal to the plan S2 saved from the same link (`JSON.stringify(JSON.parse(…))` equal): bed `(72, 42.5)`, desk `(131, 131.5)`. Undo `aria-disabled="true"` (greyed). |
| S6 | New context: same set-up as S3 (bed moved to `(42, 72.5)`, then `about:blank`, then the link), then `Back to my plan`. | The moved bed is back; banner gone; no `#plan=`. | Pass | In the preview: the same banner, plan bed `(72, 42.5)`. After `Back to my plan`: plan bed `(41.99, 72.5)` (screen rounding of the stored `(42, 72.5)`), desk `(131, 131.5)`; no banner, no notice; address `http://localhost:3478/room-planner`; stored string unchanged. |
| S7 | In the S6 context (own plan has the moved bed): `about:blank`, then the S1 address with its last 10 characters removed (ends `…5288-0W4Lt2SjTTJee1M`). | Own plan; notice `This shared link could not be read.`; no `#plan=`. | Pass | Notice `This shared link could not be read.`; no banner; address `http://localhost:3478/room-planner`; plan bed `(42, 72.5)`, desk `(131, 131.5)` (own plan); stored string unchanged. |
| S8 | Same context: `about:blank`, then `http://localhost:3478/room-planner#plan=9.AAAA`. | Own plan; notice `This shared link was made with a newer version of the planner.` | Pass | Notice `This shared link was made with a newer version of the planner.`; no banner; address without `#plan=`; plan bed `(42, 72.5)`, desk `(131, 131.5)`; stored string unchanged. |
| S9 | Same context, planner open at `/room-planner` (no fragment): set `window.__marker`, then ran `location.hash = '#plan=1.rZHN…'` (the S1 fragment) in the page. | The page reloads and the link opens. | Pass | A `load` event fired; `window.__marker` was gone afterwards; `performance.getEntriesByType('navigation')[0].type` was `reload`. The link opened as a preview: banner `Viewing a shared plan. Your own plan is untouched, and changes here are not saved.`, `#plan=` in the address, plan bed `(72, 42.5)`, desk `(131, 131.5)`. |
| S10 | New context (clipboard granted), `Side by side` layout. `Edit room` → `L-shape`; `Add door`, clicked wall 5 (bottom) → `Door on wall 5`; `Add window`, clicked wall 6 (left) → `Window on wall 6`; `Add column` → `Column`; `Done`. Moved the bed to `(36, 42.5)` and the desk to `(33.67, 138.07)`, then `Shift+R` on the desk (angle 90 → 105). Stage read `Everything fits`. `Share` → `Copy link` (`Copied`, 956-character link starting `…#plan=1.rZS`); opened that address in a new empty context. | Every stored field equal to the sender's. | Pass | The receiver showed `Opened a shared plan.` and no fragment. Field-by-field comparison of the two stored plans: all 76 leaf values equal, no missing or extra keys (outline of 6 corners with their ids `(0,0) (72,0) (72,84) (144,84) (144,168) (0,168)`, height 96, units `ft`, bed `(36, 42.5)` 0°, desk `(33.67, 138.07)` 105°, door on wall `dd3d2e71…` offset 20 width 32 height 80 hinge `start` swing `in`, window on wall `d2c66c79…` offset 30 width 36 sill 36 height 48, column `cylinder` `(72, 120.75)` 12 × 12 × 96, all ids and model fields). The two strings are the same length (1431) but not byte-identical: only the key order inside the obstacle object differs (`id,shape,x,y,rotation,elevation,label,…` saved by the sender, `id,shape,label,x,y,rotation,width,depth,height,elevation` by the receiver). |
| S11 | In the S10 sender (stage `Everything fits`): `Share` → `Download floor plan`. Saved as `shots-sharing/room-plan.png`, decoded, looked at. | Named `room-plan.png`; longer side exactly 2000 px; (4, 4) `#ffffff`; bed footprint centre `#e4e8ee`; middle of a wall with no opening `#1a1c2c`; no `#fbdada` or `#b3261e` in a 50-px grid; elements listed as seen. | **FAILED** | Suggested name `room-plan.png`. Size 1760 × 2000 (longer side 2000). Picture scale 10 px/in, origin (160, 160). (4, 4) = `#ffffff`. **Bed centre (36, 42.5) → pixel (520, 585) = `#1a1c2c`** (the bed's name label; see Failures first). Wall middles: wall 1 (36, 0) → (520, 160) `#1a1c2c`; wall 2 (72, 42) → (880, 580) `#1a1c2c`; wall 3 (108, 84) → (1240, 1000) `#1a1c2c`; wall 4 (144, 126) → (1600, 1420) `#1a1c2c`. 50-px grid: 1440 samples, 0 `#fbdada` or `#b3261e` (also 0 such pixels in the whole image). Looking at the image: door swing arc **seen** (bottom wall, white gap, leaf and quarter arc); window line **seen** (blue line on the left wall, `(160, 1360)` = `#2f6fb0`); every item's name **seen** (`Low platform bed, queen`, `Tack writing desk` turned with the desk, `Column`); a length on every wall **seen** (`6′ 0″`, `7′ 0″`, `6′ 0″`, `7′ 0″`, `12′ 0″`, `14′ 0″`), but on the three vertical walls the length runs into the wall line (see Other observations); the credit line **seen** (`Room Planner · frankiesoltero.com/room-planner`, bottom left). |
| S12 | Same page, `Side by side`, render style `Realistic` (checked), WebGL available: `Download 3D view`. Saved as `shots-sharing/room-3d.png`. | Named `room-3d.png`; size equals the 3D canvas's `width`/`height`; (2, 2) equals the page background; on a 20-px grid ≥ 20% differ from the background and ≥ 50 distinct colours; floor, walls, bed, desk listed. | Pass | Suggested name `room-3d.png`. The 3D canvas (`data-engine="three.js r187"`) had `width` 550, `height` 729; the PNG is 550 × 729. (2, 2) = `#f2f2f3` = `--color-bg` (opaque); the other three corners too. 20-px grid: 1036 samples, 259 differ (25.00%), 61 distinct colours. Looking at the image: floor **seen** (wood planks, L-shape), walls **seen** (the back walls of the L, cut-away view), bed **seen** (frame, green cover, pillows), desk **seen** (turned, with the selection outline since it was selected); the column is also visible. |
| S13 | Clicked `Blueprint` in the render style control (that pointer down closed the Share panel, as designed), reopened `Share`, `Download 3D view`. Saved as `shots-sharing/room-3d-blueprint.png`. | Size equals the blueprint canvas's attributes; (2, 2) equals the background; ≥ 1% of a 20-px grid differ; outline, bed, desk listed. | Pass | Suggested name `room-3d.png` (saved under the record's name). Render style checked `blueprint`; the pane's canvas had `width` 550, `height` 729; the PNG is 550 × 729. (2, 2) = `#f2f2f3` (all four corners). 20-px grid: 1036 samples, 233 differ (22.49%), 24 distinct colours. Looking at the image: the room's outline **seen** (L-shape in line drawing, floor grid, `14′ 0″`, `12′ 0″`, `8′ 0″` labels), bed **seen**, desk **seen** (pale blue, with the tag `Tack writing desk · 2′ 6″ tall`). |
| S14 | Same page: layout `Tabs` (clicked, then blurred); the `View` group showed `2D plan` checked. Opened `Share`, read `Download 3D view`, force-clicked it and waited 2 s. | `Download 3D view` greyed with its reason. | Pass | `aria-disabled="true"`, `aria-describedby` pointing at the text `Show the 3D view to save a picture of it.` shown under it; opacity 0.45 and `cursor: not-allowed` (the other buttons: opacity 1, `pointer`). The click made no download. Screenshot `tabs-plan-share-panel.png`. |
| S15 | Same page, panel open, desk selected (`aria-pressed="true"`, selection bar `Tack writing desk 55 × 26 × 30 in`); focus in the panel (on `Download 3D view`). Pressed Escape. | Panel closes; the piece stays selected. | Pass | The dialog was gone; the desk still `aria-pressed="true"` and the selection bar still showed `Tack writing desk … Angle … Rotate 90° … Remove`; focus moved to the `Share` button (`aria-expanded="false"`). |
| S16 | New context. Without a grant, Chromium reported `clipboard-write` as `granted` and `Copy link` read `Copied`, so the permission could not be used to block it. Instead, closed the panel, replaced `navigator.clipboard.writeText` in the page with a function returning a rejected promise (`NotAllowedError`), waited 2.2 s, reopened `Share`, clicked `Copy link`. | The fallback field shows the link, selected. | Pass | The button stayed `Copy link`; a read-only text field labelled `Share link` appeared under it with the full 470-character link (equal to the S1 link), focused, selection 0 to 470 (all of it). Screenshot `clipboard-fallback.png`. |
| S17 | Console and network listeners on every page and context of the run (S1 to S18, plus one extra load of the link to list websockets), and the MCP tool's console log. | 0 errors and 0 warnings; the only host requested is `localhost:3478`. | Pass | 0 console errors, 0 console warnings, 0 page errors (the MCP console log also reported 0 errors and 0 warnings). 222 requests, all to `localhost:3478`. The only websocket was `ws://localhost:3478/_next/webpack-hmr` (the dev server's hot reload). The downloads made no request. |
| S18 | Measured at 1440 × 900 in four states: no bar (S1 sender), notice only (S2, `Opened a shared plan.`), banner only (S3/S9 preview), banner and notice (a context whose `localStorage` getter throws `SecurityError`, opening the link: notice `This browser is blocking storage, so changes will not be saved.` above banner `Viewing a shared plan. Changes here are not saved.` with only `Back to my plan`). | `scrollHeight <= innerHeight`; `.stage` bottom within 1 px of `.app-main` bottom minus the selection bar's height; sidebar bottom within 1 px of `innerHeight`. | Pass | All four states: `scrollHeight` 900, `innerHeight` 900; `.stage` bottom 844, `.app-main` bottom 900, `.selection-bar` height 56 (900 − 56 = 844, difference 0); `.sidebar` bottom 900. In the banner-and-notice state the header is 57.5 px, notice 47 px, banner 47 px, `.app-body` top 151.5 px. Screenshot `banner-and-notice.png`. |

## Other observations

- **Wall lengths collide with vertical walls in the floor plan picture.** `wallLengths` writes each
  length centred `LENGTH_OFFSET` (34 px) outside the wall's midpoint. On horizontal walls that is
  clear, but on vertical walls the text is about 70 px wide, so its near half (35 px) reaches into
  the 10-px wall line: `14′ 0″` on the left wall loses its `″` behind the wall, and both `7′ 0″`
  labels (wall 2, wall 4) have their `7` half covered by the wall. Seen in `room-plan.png` at
  (90 to 160, 1000), (880 to 950, 580) and (1600 to 1670, 1420).
- **The saved 3D pictures include the selection.** The desk was selected when the 3D view was
  downloaded, so `room-3d.png` has the blue selection outline around it and
  `room-3d-blueprint.png` has the dark `Tack writing desk · 2′ 6″ tall` tag over it. A visitor
  sharing a picture may not expect the selection in it.
- **Clicking the render style closes the Share panel.** Any pointer down outside the panel closes
  it (designed behaviour), so switching `Realistic` / `Blueprint` before downloading takes a second
  `Share` click.
- **S10 stored strings differ in key order only.** The receiver saves the obstacle with its keys in a
  different order from the sender; every value is equal and the saved format is unchanged.
- **Dev-only:** the Next.js dev badge (`N`) sits over the bottom left of the sidebar; it is not part
  of the production page.

## Saved images

All in `docs/room-planner/verification/shots-sharing/`, each looked at after saving:

- `room-plan.png` (S11, the downloaded floor plan, 1760 × 2000).
- `room-3d.png` (S12, the downloaded realistic 3D view, 550 × 729).
- `room-3d-blueprint.png` (S13, the downloaded blueprint 3D view, 550 × 729; downloaded as
  `room-3d.png`).
- `tabs-plan-share-panel.png` (S14, page screenshot: `Tabs` layout on `2D plan`, panel open,
  `Download 3D view` greyed with its reason).
- `clipboard-fallback.png` (S16, page screenshot: the `Share link` field with the link selected).
- `banner-and-notice.png` (S18, page screenshot: storage notice and view-only banner together).
