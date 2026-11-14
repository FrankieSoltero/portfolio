# Live check — 2026-11-12

Task 20 of `Docs/plans/2026-11-12-room-planner-workspace.md`. The app (`npm run dev`, Vite 8.3.8,
http://localhost:5173/) and the prototype (`npx serve design_handoff_room_planner -l 4173`,
`Room Planner.dc.html`) were driven in the same Chromium through the Playwright browser tools at a
1440×900 viewport, device pixel ratio 1. Tree under test: `feat/workspace-slice` at 89700c9 plus the
lighting change (28be032). The L1 re-run used 89c7f93. App state was read from the live stores with
`await import('/src/state/uiStore.ts')` / `planStore.ts` in `browser_evaluate` (Vite serves one module
instance per URL, so this is the same store the UI uses).

## Rows

| Row | Action | Expected in the app | Result | Observation |
|-----|--------|---------------------|--------|-------------|
| L1 | Load the page | 3D view fills the stage with a bed and a desk in a room with a plank floor; plan inset bottom-right labelled `Plan`; tag `Everything fits`; console has 0 errors and 0 warnings | Pass (after fix 89c7f93) | Visual checks, first run: canvas 1100×729 at (340, 115.08) fills the stage; bed, desk and plank floor rendered; inset pane at (1044, 508.08, 380×320) labelled `Plan` (shown uppercase by CSS); tag `Everything fits`; store state: layout inset, realistic, nothing selected, camera yaw −0.65 / pitch 0.55 / zoom 1. First run failed on the console: the first load in the profile logged `Failed to load resource: 404 (Not Found) @ http://localhost:5173/favicon.ico`. Root cause: `index.html` declared no icon, so the browser requested `/favicon.ico`. Re-run after the fix. Chrome caches a favicon miss per origin, so each state was loaded on a dev server at a port never used before, in a fresh isolated browser context. (1) Before the fix, the old `index.html` (no icon link) on `npx vite --port 5181`, context `l1-prefix`: console showed `Errors: 1, Warnings: 0`, and the error was `Failed to load resource: … 404 (Not Found) @ http://localhost:5181/favicon.ico`. This shows the context does request the favicon. (2) After the fix, `index.html` with `<link rel="icon" href="data:," />` on `--port 5182`, context `l1-postfix`: console showed `Errors: 0, Warnings: 0` (only the two Vite debug lines and React's DevTools info line); the DOM has `<link rel="icon" href="data:,">`; there are no `favicon` resource entries; tag `Everything fits`. Reloaded in the same context at 1440×900 (DPR 1, canvas 1100×729): no console error or warning and no HTTP response ≥ 400. The Playwright network-request tool does not list browser-initiated favicon fetches, so the evidence for the 404 is the console line, not the network log. |
| L2 | Click `Swap` | plan becomes the main view, inset is labelled `3D`; click again restores L1 | Pass | After Swap: plan pane 1100×729 at z 1, inset (1044, 508.08, 380×320) at z 8 labelled `3D` and showing the WebGL room; `insetSwapped` true. Second click: inset labelled `Plan` again, 3D main, `insetSwapped` false. |
| L3 | Choose `Side by side` | plan on the left half, 3D on the right half, one divider line | Pass | Plan pane (340, 115.08, 550×729); 3D pane (890, 115.08, 550×729) with class `pane-divider`; one vertical rule at x = 890 in the screenshot, no other. |
| L4 | Choose `Tabs`, then `3D check`, then `2D plan` | one pane at a time; the hint text switches between the 3D and 2D copy | Pass | A `View` radio group appears (`2D plan / 3D check`). Exactly one `.pane` (1100×729) each time. `3D check`: 1 canvas, hint "Drag to orbit, scroll to zoom. Pick a piece from the list to highlight it." `2D plan`: 0 canvases, hint "Drag a piece on the plan to move it, or nudge it with the arrow keys. Select one to see its clearance to each wall. R rotates, Delete removes. Drag the 3D view to orbit." |
| L5 | Back to inset; drag in the 3D view; scroll over it | the room orbits with the pointer; scrolling zooms and the page does not scroll | Pass | Pointer drag of (+100, +40) px: yaw −0.65 → −1.45, pitch 0.55 → 0.79 (0.008 and 0.006 rad/px); the mid-drag sample (−1.05, 0.67) shows it follows live. Wheel −200 → zoom 1.49; wheel +400 → 0.67. These steps are twice the nominal delta: exp(0.2) would give 1.22, but the browser tool delivered double the stated wheel delta. `ThreeView.test.tsx` pins one wheel event to exactly one `zoomCamera` step. A passive window listener saw `defaultPrevented === true` on the wheel event; `scrollX/scrollY` stayed 0 and no element had a scroll offset. |
| L6 | Choose `Blueprint` | line drawing of the same room from the same angle, with `12′ 0″`, `14′ 0″`, `8′ 0″` labels; `Realistic` restores the WebGL view | Pass | Blueprint canvas 1100×729 shows the hairline room, bed and desk from the same camera (room corners at the same screen points as the realistic view: back corner ≈ (697, 260), front corner ≈ (665, 728)), labels `14′ 0″`, `12′ 0″`, `8′ 0″`. `Realistic` brings the WebGL render back; store `renderStyle` = realistic. |
| L7 | Swap so the plan is main; drag the bed | it follows the pointer in 1 in steps and stops at the walls; dashed clearance lines with distance chips appear | Pass | Plan scale 515.14 px / 144 in = 3.577 px/in. Pointer (+50, +25) px moved the bed from (40, 0) to (54, 7) in = 13.98 / 6.99 in rounded; intermediate samples 41/1, 43/2, 45/3, 50/5 are whole inches. Dragging far up-left stops at (0, 0); far down-right stops at (80, 83) = (144 − 64, 168 − 85). During the drag 4 `plan-clearance` elements with dashed borders and chips `4′ 6″`, `2′ 2″`, `6′ 4″` (54, 26, 76 in) appear. |
| L8 | Drag the bed onto the desk | both list rows show an `Overlaps …` tag; top tag reads `2 conflicts`; both boxes are hatched on the plan | Pass | Bed dropped at (80, 72). Rows: "Low platform bed, queen … Overlaps Tack writing desk" and "Tack writing desk … Overlaps Low platform bed, queen". Top tag `2 conflicts`. Both plan boxes have class `is-conflict` with a `repeating-linear-gradient(45deg, …)` background. |
| L9 | Drag the right wall handle left past the desk | Width input and the dimension label update while dragging; the wall stays under the pointer; the desk shows `Outside the room` | Pass | Handle at x 941.57. While held: pointer 901.6 → wall 898.6, Width `11`, label `11′ 0″`; 851.6 → 855.7, `10`, `10′ 0″`; 801.6 → 802.0, `8.75`, `8′ 9″`; 781.6 → 780.6, `8.25`, `8′ 3″` (wall within one 3 in snap, ≤ 10.7 px, of the pointer). After release: desk row `Outside the room` (the bed too, since 40 + 64 > 99 in), tag `2 conflicts`. |
| L10 | Select the desk; press `R`, arrow keys, Shift+arrow, then `Delete` | rotates 90°; moves 1 in per arrow press and 12 in with Shift; then is removed and the total drops by `$420` | Pass | Desk (118, 104, rot 1). `R` → rot 2 at (89, 119). ← → x 88; ↑ → y 118; Shift+← → x 76; Shift+↑ → y 106; → → x 77; Shift+↓ → y 118. `Delete` → desk gone from the store and the list; total `$1,310` → `$890`. |
| L11 | Click `Sofa`, wait, click `Place in room` | loading card for about 1 s, then the preview card; the sofa appears centred and selected in both views | Pass | 100 ms after the click: "SHOP.EXAMPLE / Reading the product page for name, size and price…". `Place in room` appeared 1044 ms after the click. Preview: Alder 3-seat sofa, $1,290, "3D model from retailer", inputs 84 / 36 / 33. Placed at (30, 66) = ((144 − 84)/2, (168 − 36)/2); selected in the store, `is-selected` on the plan, accent outline in the 3D view, selection bar "Alder 3-seat sofa 84 × 36 × 33 in". |
| L12 | Click `Page without sizes`; then type `nope` and click `Fetch` | preview with the missing-dimensions note and `No price`; then the invalid-link message | Pass | Preview: MARKET.EXAMPLE, "Untitled product", `No price`, "No model, shown as a sized box", "This page didn't list dimensions. Enter them from the product description." Then `nope` + Fetch: "That doesn't look like a link. Paste the full product URL." (the existing preview stays, as in prototype line 429). |
| L13 | Toggle `m / cm` | every length label, input and list row switches to metric; nothing moves on the plan | Pass | Inputs 12/14/8 ft → 3.66/4.27/2.44 m; note "Floor area 15.6 m²"; rows "163 × 216 × 97 cm", "140 × 66 × 76 cm"; plan labels `3.66 m`, `4.27 m`, chips `1.02 m`, `1.02 m`, `2.11 m`; selection bar "163 × 216 × 97 cm"; blueprint labels `3.66 m`, `4.27 m`, `2.44 m`; preview inputs "Width (cm)" etc. Every plan rectangle identical before and after (string compare of all `getBoundingClientRect`s → equal); stored items unchanged. |
| L14 | Resize the window to 1100×700 and back | both views refit without overflow or blank canvas | Pass | 1100×700: document 1100×700 (no scroll), no element past the viewport; 3D pane 760×529 with canvas 760×529; inset 274×233; room drawn. Swapped at that size: inset canvas 273×232 rendered. Back at 1440×900: canvas 1100×729, inset 380×320, plan room (1138, 556, 192×224) — the same as before. |
| L15 | Compare each region with the prototype at 1440×900 | header, sidebar, top bar, stage and selection bar match the prototype in position and size to within 2 px, measured with the browser inspector on: sidebar width, header height, inset rectangle, room rectangle on the plan | Pass | Same script in both pages, structural selectors (the prototype has no class names): `header`; `aside`; top bar = `main.children[0]`; stage = `main.children[1]`; selection/hint bar = `main.children[2]`; inset = the stage child whose computed `z-index` is 8; plan room = first descendant of the plan pane with a 2 px solid top border wider than 50 px. Prototype → app (x, y, w, h): header 0,0,1440,57.54 → identical; sidebar 0,57.54,340,842.46 → identical; top bar 340,57.54,1100,57.54 → identical; stage 340,115.08,1100,728.92 → identical; bottom bar 340,844,1100,56 → identical (also with the bed selected); inset 1044,508.08,380,320 → identical; plan room in the inset 1139,557.08,192,224 → 1138,556.08,192,224 (1 px left and up, within 2 px); plan room as main view 426.42,179.08,515.14,601 → identical. |

Result: all 15 rows pass. L1 failed on the first run (favicon 404); it passed on the re-run after fix 89c7f93.

## Fixes made under this task

| Row | Root cause | Files | Test | Commit |
|---|---|---|---|---|
| L1 | `index.html` declared no icon, so the browser's automatic `/favicon.ico` request 404'd and logged a console error on first load | `index.html` (adds `<link rel="icon" href="data:," />`) | `src/indexHtml.test.ts`: asserts a `<link rel="icon"` is present (seen failing before the fix) and that the page shell references no external `http(s)://` resource | 89c7f93 |

## Lighting

Captures, default view (L1 state: realistic style, inset layout, nothing selected, camera yaw −0.65 /
pitch 0.55 / zoom 1), 1440×900, DPR 1, pointer parked over the header:

- `Docs/verification/lighting-prototype.png` — prototype (three r128).
- `Docs/verification/lighting-app.png` — app with the final values below.

Method: the two intensities were varied live (CONFIG mutated through the module, then the 3D pane
remounted so `SceneRenderer` re-read it) and each capture was compared with the prototype capture on
the mean luma (0–255) of the same screen regions. The geometry of the two renders is identical, so the
regions line up.

| Region (page px) | Prototype | Start 2.45 / 1.95 | Final 3.0 / 1.7 |
|---|---|---|---|
| Left wall (450–510, 340–460), hemisphere only | 255.0 | 241.0 | 251.0 |
| Back wall (760–880, 340–420) | 236.0 | 220.0 | 235.0 |
| Floor, lit (640–740, 600–660) | 197.3 | 194.2 | 201.2 |
| Floor, desk shadow (825–860, 510–535) | 172.9 | 160.9 | 176.0 |
| Shadow strength (shadow / lit) | 0.876 | 0.828 | 0.875 |
| Whole 3D area (420–990, 240–740) | 230.0 | 219.6 | 225.5 |
| Bed cover (600–700, 450–500) | 225.1 | 165.0 | 171.9 |
| Desk top (820–890, 470–495) | 225.1 | 171.2 | 178.5 |

RMS difference over walls, floor and shadow: 12.3 at the starting values, 3.3 at the final values
(14 combinations tried between 2.45–3.3 hemisphere and 1.5–2.4 sun; 3.0 / 1.7 had the lowest error and
the closest shadow strength).

What lighting cannot close: furniture is still darker and more saturated than in the prototype (bed
cover 172 vs 225). three r128 has no colour management, so the prototype feeds material hex colours
to the shader as if they were already linear and then sRGB-encodes the output, which washes them out.
three 0.187 converts the same hex colours from sRGB to linear first, so they render at their true
values. The floor uses an sRGB-tagged texture in both versions, so it already matched. Making furniture
match would need a colour-handling change, not a light change (for example, setting material
colours with `LinearSRGBColorSpace` to copy r128). The owner decided against it (see below).

Starting values: hemisphere 2.45, sun 1.95 (the handoff's 0.78 and 0.62 × π).
Final values in `src/config.ts`: **hemisphere 3.0, sun 1.7**.

Owner lighting approval: **APPROVED on 2026-11-12.** The project owner saw both captures and the
values (hemisphere 3.0, sun 1.7). The furniture-colour difference was explained: the app shows the
handoff's listed material hex values accurately, while the prototype's three r128 washed them out.
Asked which look they wanted, the owner chose, verbatim: "Approve the app as is (Recommended)".
Furniture-colour decision: keep colour-managed materials. Do not copy r128's wash-out.

## Other observations (not row failures)

- On the first app load in this session the store showed zoom 0.679 with no wheel input from the
  test. On 10+ later loads it was always 1. Not reproduced, so treated as stray input to the
  visible browser window, not as an app defect.
- `npm run build` warns that the lazy `ThreeView` chunk is 545 kB (> 500 kB). This was there before
  this task; it is the three.js chunk that Seam 4 deliberately splits out.
