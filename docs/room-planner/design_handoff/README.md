# Handoff: Room Planner (thin slice)

## Overview

A web app where a user enters their room's dimensions, adds furniture by pasting product links, arranges the pieces on a 2D plan, and checks the result in a 3D view before buying anything. This handoff covers the first thin slice: one workspace screen with the whole flow at shallow depth.

**Your task:** set up a Vite + React + TypeScript front end and recreate this screen in it.

## About the design files

`Room Planner.dc.html` is a **design reference built in HTML**. It is a working prototype showing the intended look and behaviour, not production code. Do not ship it or port its file structure. Recreate it in a Vite + React + TypeScript project using normal React patterns (components, hooks, typed state).

To view the prototype, serve this folder over HTTP (for example `npx serve .`) and open `Room Planner.dc.html`. It needs `support.js` and the `_ds/` folder beside it, both included.

All logic is in the `class Component extends DCLogic` block near the bottom of the file. The markup above it is the template; `{{ name }}` holes are filled from that class's `renderVals()`. Read the class for exact maths; this README summarises it.

## Fidelity

**High fidelity.** Colours, type, spacing and interactions are final. Match them. The visual language comes from the "Industry" design system in `_ds/…/styles.css` (tokens and component classes) and `_ds/…/readme.md` (rules).

## Suggested setup

- `npm create vite@latest room-planner -- --template react-ts`
- Dependencies: `three` (current version, ES modules). `@react-three/fiber` is optional; the prototype uses plain three.js rendering on demand, which is simple to keep.
- State: one store for the plan (Zustand, or `useReducer` + context). Shape is given under State below.
- Styling: copy `_ds/…/styles.css` into `src/styles/industry.css` and import it once in `main.tsx`. It provides CSS variables and the classes `.btn`, `.input`, `.field`, `.seg`, `.card`, `.tag`, `.nav`, `.blueprint`. Use those classes and `var(--*)` tokens; do not hard-code hex values. CSS Modules or plain CSS for layout is fine.
- Fonts: the stylesheet imports Barlow and Barlow Condensed from Google Fonts.
- Icons: Lucide at `strokeWidth={1.5}` (`lucide-react`). Used: `RotateCw`, `Trash2`.
- No backend yet. The product-link lookup is mocked on the client behind one async function (see Link lookup) so a real API can replace it.

Suggested structure:

```
src/
  main.tsx, App.tsx
  styles/industry.css
  state/planStore.ts        room, items, selection, units, view settings
  lib/units.ts              formatting and parsing
  lib/geometry.ts           footprint, rotation, snapping, conflicts, plan layout
  lib/productLookup.ts      mocked link lookup (async)
  lib/furnitureModels.ts    parametric three.js builders
  components/
    Header.tsx
    Sidebar/RoomSection.tsx, AddFurnitureSection.tsx, ItemList.tsx
    Stage/Stage.tsx, PlanView.tsx, ThreeView.tsx, BlueprintView.tsx, InsetFrame.tsx
    SelectionBar.tsx
```

## Screen: Workspace

The app is a single full-viewport screen (`height: 100vh`, `min-height: 620px`).

### Layout

- Root: CSS grid, rows `auto minmax(0,1fr)`.
- **Header** (`.nav`): padding 10.2px 13.6px, bottom border 1px `--color-divider`. Left: brand text "Room planner" (`.nav-brand`, Barlow Condensed 600, 18px). Right: muted label "Units" (12px) and a segmented control `ft / in` | `m / cm`.
- **Body**: grid, columns `minmax(260px, 340px) minmax(0, 1fr)`.
- **Sidebar** (left column): flex column, gap 27.2px, padding 20.4px 13.6px, right border 1px `--color-divider`, scrolls vertically.
- **Main** (right column): grid, rows `auto minmax(0,1fr) auto`: top bar, stage, selection bar.

### Sidebar sections

Each section has an `h6` heading (13px, uppercase, letter-spacing 0.08em) made of a number in `--color-accent-700` and a title.

**01 Room**
- Three `.field` inputs in a 3-column grid (gap 6.8px): Width, Length, Ceiling. `type="number"`, unit suffix (`ft` or `m`) shown inside the input at right (12px muted). Step 0.25 for ft, 0.05 for m.
- Below: 12px muted text "Floor area {area}. You can also drag the room's edge handles on the plan." Area is `sq ft` (rounded) or `m²` (1 decimal).

**02 Add furniture from a link**
- Row: text input (placeholder "Paste a product link") and a primary button "Fetch" (`.btn.btn-primary.blueprint` with four `<i class="corner tl|tr|bl|br">` marks). Enter in the input triggers Fetch. Button is disabled while loading.
- Error line (12px, `--color-accent-900`): "That doesn't look like a link. Paste the full product URL."
- Idle state: 12px muted "No link handy? Try a sample:" then three `.btn.btn-secondary` buttons (13px): "Sofa", "Bookshelf", "Page without sizes".
- Loading state: a `.card.blueprint` with the link's hostname as `.card-kicker` and body "Reading the product page for name, size and price…". Lasts about 900ms in the mock.
- Preview state: a `.card.blueprint` containing
  - a 64×64 photo placeholder (1px divider border, 45° hairline hatch, mono 10px "photo"). Replace with the real product image when available.
  - hostname (`.card-kicker`, `--color-accent-700`), product name (`.card-title`, 17px), price (`.card-meta`), and a `.tag.tag-outline` stating the model source: "3D model from retailer", "Model built from photos", or "No model, shown as a sized box".
  - if dimensions could not be read: 12px note "This page didn't list dimensions. Enter them from the product description."
  - three number inputs: Width, Depth, Height (in `in` or `cm`), pre-filled and editable.
  - actions: primary "Place in room" (blueprint button) and ghost "Discard".

**03 In this room**
- Empty: 13px muted "Nothing placed yet."
- One row per item (a `<button>`, bottom border 1px divider, padding 6.8px): name (Barlow Condensed 600, 15px), price right-aligned (13px), dimensions line (12px muted, e.g. `64 × 85 × 38 in`). If the item has a conflict, a tag below (background `--color-accent-900`, text `--color-bg`) with the reason. Selected row background: accent at 16% alpha. Hover: accent at 10%.
- Footer row: muted "Total, nothing bought yet" and the bold sum of prices.

### Top bar

Padding 10.2px 13.6px, bottom border 1px divider, `justify-content: space-between`.
- Left: layout segmented control: "3D + plan inset" (default) | "Side by side" | "Tabs".
- Only in Tabs layout: a second segmented control "2D plan" | "3D check".
- Right: status tag. No conflicts: `.tag.tag-accent` "Everything fits". Otherwise a dark tag (`--color-accent-900` on `--color-bg` text): "1 conflict" / "N conflicts".

### Stage

A relatively positioned box filling the middle row, `overflow: hidden`. Measure it with a `ResizeObserver`; both views are laid out from its pixel size (`sw`, `sh`). It holds a **plan pane** and a **3D pane**, positioned by layout mode:

- **Inset (default):** 3D pane fills the stage. Plan pane is an inset at bottom-right, 16px from the edges, width `clamp(220, 36% of sw, 380)`, height `clamp(200, 44% of sh, 320)`, z-index above the main pane, 1px `--color-text` border, `--color-bg` background, `--shadow-md`, with blueprint corner marks. The inset has a 10px uppercase label top-left ("Plan" or "3D") and a small "Swap" button top-right that exchanges which view is main and which is inset.
  - The main view must be fitted into the area **not covered by the inset**: use a "safe width" of `sw − insetWidth − 32` for fitting and centring, while the pane element itself stays full size.
- **Side by side:** plan on the left half, 3D on the right half, 1px divider between.
- **Tabs:** one pane fills the stage, chosen by the 2D/3D control.

#### Plan pane (2D)

- Fit: `scale = min((paneW − 2m) / room.w, (paneH − 2m) / room.l)` px per inch, margin `m` = 64 (48 when inset). Room is centred in the pane (in the safe area when it is the main pane in inset layout).
- Room rectangle: 2px `--color-text` border, fill `--color-neutral-100`, grid lines every 12 in (ft mode) or 50 cm (metric) at text colour 9% alpha, blueprint corner marks.
- Dimension lines: above the room (width) and left of it (length), offset 30px (22px when inset): 1px line with 9px end ticks and a centred label (Barlow Condensed 600, 14px) on a `--color-bg` chip. The length label is rotated −90°.
- Furniture: one absolutely positioned box per item at its footprint. 1px `--color-text` border, `--color-bg` fill (rugs: accent 14% mixed into bg). Inner hairlines (text at 30% alpha) trace the piece's parts (arms, back, pillows). Centred label when the box is larger than 84×38px: name (Barlow Condensed 600, 13px) and dimensions (10px, `--color-neutral-700`).
  - Selected: 2px `--color-accent` border, raised z-index.
  - Conflict: 1.5px dashed `--color-text` border and a 45° hatch fill.
  - Rugs render below other pieces.
- Clearance lines (selected item only, can be turned off): dashed 1px `--color-accent-700` lines from the middle of each side of the item to the facing wall, each with a chip (background `--color-accent-700`, text `--color-bg`, 10px) showing the distance. Hide the chip when the gap is under 34px; skip gaps under 0.5 in.
- Room resize handles: a 12×32px handle centred on the right wall (`cursor: ew-resize`) and a 32×12px handle centred on the bottom wall (`ns-resize`). 1.5px `--color-accent` border, `--color-bg` fill, `--color-accent-200` on hover.

#### 3D pane

Two render styles, switched by a segmented control at the pane's top-left (13.6px inset; hidden when the pane is the small inset): **Realistic** (default) and **Blueprint**.

Shared camera: orbit around the point `(room.w/2, room.l/2, room.h × 0.35)`.
- `distance = hypot(w, l, h) × 1.55 / zoom`
- position = centre + distance × (`cos(pitch)·sin(yaw)`, `cos(pitch)·cos(yaw)` toward the plan's bottom wall, `sin(pitch)` up)
- defaults: yaw −0.65 rad, pitch 0.55 rad, zoom 1
- focal length in px = `min(safeW, paneH) × 1.25`, so vertical FOV = `2·atan(paneH / 2 / focal)`
- In inset layout, shift the view centre left by `(paneW − safeW) / 2` px (`camera.setViewOffset`).

**Realistic (three.js, WebGL):**
- Units are inches. Plan x → three X, plan y → three Z, height → three Y.
- Renderer: antialias, transparent background, sRGB output, soft shadow maps. Render on demand (after state changes), no animation loop.
- Lights: hemisphere light (white sky, `#d8d2c8` ground, about 0.78) and one directional light (about 0.62) at `(0, 2.4h, 1.4l)` aimed at the floor centre, casting shadows with an orthographic shadow camera sized to the room diagonal.
- Room: floor plane with a procedurally drawn plank texture (8 in planks, warm oak, repeated), four wall planes facing **inward** and single-sided, so walls between the camera and the room are culled automatically. Wall colour `--color-neutral-100`. Walls receive but do not cast shadows.
- Furniture: parametric models built from boxes, sized exactly to each item's width, depth and height (builders in `buildFurniture` in the prototype): sofa and lounge chair (legs, base, back, arms, seat and back cushions), bed (frame, headboard, mattress, duvet, two pillows), desk (top, four legs, drawer), coffee table (top, legs, lower shelf), bookshelf (sides, back, shelves about every 14 in, seeded random books), rug (two thin layers), unknown item (plain box). Material colours are in the `looks` table in the prototype.
- Each item group sits at the centre of its footprint and rotates `−rot × 90°` about the vertical axis. Cache groups per item and rebuild only when kind or dimensions change; moving and rotating only updates the transform.
- Selected item: a box outline around its bounds in `--color-accent-700`. Conflicting item: the same outline in `--color-text`.

**Blueprint (2D canvas line drawing):** the same scene drawn as hairline boxes with flat tinted faces, a floor grid, dashed outlines for the hidden near walls, and room dimension labels. It reuses the same camera maths and a painter's sort of axis-aligned boxes (`drawBlueprint` and `front` in the prototype). This is secondary; build Realistic first.

**Real product models (later):** the design intends a tiered source per item: (1) the retailer's own GLB/USDZ when the product page has one, (2) a model generated from product photos, (3) a parametric template stretched to the listed size, (4) a sized box. This slice only implements tiers 3 and 4 and labels the tier in the preview card. Structure `ThreeView` so an item can supply a loaded GLB scene instead of a parametric group.

### Selection bar (bottom)

Min-height 56px, padding 6.8px 13.6px, top border 1px divider.
- Item selected: name (Barlow Condensed 600, 17px), dimensions (13px muted), conflict reason if any (13px, weight 500, `--color-accent-900`); on the right `.btn.btn-secondary` "Rotate 90°" with `RotateCw` icon and `.btn.btn-ghost` "Remove" with `Trash2` icon.
- Nothing selected, plan visible: 13px muted "Drag a piece on the plan to move it. Select one to see its clearance to each wall. R rotates, Delete removes. Drag the 3D view to orbit."
- Nothing selected, only 3D visible: "Drag to orbit, scroll to zoom. Pick a piece from the list to highlight it."

## Interactions and behaviour

- **Room inputs:** typing updates the room live when the value parses to between 36 in and 720 in (3 ft to 60 ft). Keep the raw text as a draft string so partial input is not reformatted.
- **Room handles:** drag changes width or length, snapped to 3 in, clamped to 36–720 in. While dragging, freeze the plan's scale and origin so the wall follows the pointer; refit on release.
- **Move furniture:** pointer-drag on the plan. Position snaps to the snap increment (default 1 in) and is clamped inside the room. Pointer down also selects the item.
- **Select:** click an item on the plan or a row in the list. Click empty plan space or press Escape to deselect.
- **Rotate:** button or `R`. Rotates 90° about the footprint centre, then clamps into the room.
- **Remove:** button or `Delete` / `Backspace`. Ignore these keys while focus is in a text or number input.
- **Orbit:** pointer-drag on the 3D view: `yaw −= dx × 0.008`, `pitch += dy × 0.006`, pitch clamped to 0.12–1.45 rad. Wheel zooms: `zoom ×= exp(−deltaY × 0.001)`, clamped to 0.6–2.5.
- **Units toggle:** switches all labels and inputs. Values are stored in inches and never change when units change.
- **Place in room:** adds the previewed item at the room centre with rotation 0, selects it, and resets the link field to idle.
- **Conflicts** (recomputed on every change, one reason per item, checked in this order):
  1. footprint extends past a wall: "Outside the room" (possible after the room is made smaller; dragging cannot cause it)
  2. item height greater than ceiling: "Taller than the ceiling"
  3. footprint overlaps another non-rug item: "Overlaps {other item's name}" (rugs never conflict by overlap)
- Focus, hover and pressed states come from the stylesheet. Do not restyle them.
- Responsive: the sidebar column shrinks from 340px to 260px; the stage reflows from its measured size. No mobile layout in this slice.

## State

All lengths are stored in **inches**.

```ts
type Units = 'ft' | 'm';
type Kind = 'sofa' | 'chair' | 'bed' | 'desk' | 'table' | 'shelf' | 'rug' | 'box';

interface Room { w: number; l: number; h: number }          // width (x), length (y), ceiling height

interface Item {
  id: number;
  kind: Kind;
  name: string;
  host: string;            // retailer hostname from the pasted link
  price: number | null;
  w: number; d: number; h: number;   // unrotated width, depth, height
  x: number; y: number;    // top-left of the rotated footprint, from the room's top-left corner
  rot: 0 | 1 | 2 | 3;      // quarter turns
}

interface PlanState {
  units: Units;
  room: Room;
  items: Item[];
  selectedId: number | null;
  layout: 'inset' | 'split' | 'tabs';
  insetSwapped: boolean;
  tab: '2d' | '3d';
  renderStyle: 'realistic' | 'blueprint';
  camera: { yaw: number; pitch: number; zoom: number };
  lookup:
    | { status: 'idle' }
    | { status: 'loading'; host: string }
    | { status: 'preview'; product: ProductPreview }
    | { status: 'error'; message: string };
}
```

Initial state: room 144 × 168 × 96 in (12 × 14 × 8 ft); two items: a bed (64 × 85 × 38, at x 40, y 0, rot 0, $890) and a desk (55 × 26 × 30, at x 118, y 104, rot 1, $420).

Geometry rules:
- Footprint: `rot` odd → `[d, w]`, else `[w, d]`.
- The piece's back edge is the `y = 0` side at rot 0 (headboard, sofa back).
- Part rectangles are defined as fractions `[u0, u1, v0, v1, z0, z1]` of width, depth and height (table `parts` in the prototype) and mapped through rotation by `mapPart`.

Unit formatting (`lib/units.ts`):
- ft mode lengths: `12′ 6″` (feet and whole inches; under a foot shows inches only).
- metric lengths: metres with 2 decimals from 100 cm up, otherwise whole cm.
- Furniture dimensions: `W × D × H in` (1 decimal max) or `cm` (whole).
- Room inputs: decimal feet or metres, 2 decimals.

## Link lookup (mock)

`lookupProduct(url: string): Promise<ProductPreview>` in `lib/productLookup.ts`.

- Validate by parsing as a URL (prepend `https://` if missing); the hostname must contain a dot. Otherwise reject with the error message above.
- Resolve after about 900ms.
- Match a keyword in the URL against a small catalogue (first match wins, in this order): `sofa|couch|sectional`, `desk`, `shelf|bookcase|shelving`, `bed`, `chair`, `rug`, `table`.

| Kind | Name | W × D × H (in) | Price | Model source |
|---|---|---|---|---|
| sofa | Alder 3-seat sofa | 84 × 36 × 33 | $1,290 | 3D model from retailer |
| desk | Tack writing desk | 55 × 26 × 30 | $420 | 3D model from retailer |
| shelf | Girder bookshelf | 36 × 13 × 78 | $310 | Model built from photos |
| bed | Low platform bed, queen | 64 × 85 × 38 | $890 | 3D model from retailer |
| chair | Brace lounge chair | 30 × 32 × 31 | $540 | Model built from photos |
| rug | Flatweave rug | 60 × 96 × 0.5 | $340 | Model built from photos |
| table | Slab coffee table | 44 × 24 × 16 | $260 | Model built from photos |

- No match: kind `box`, name from the last URL path segment (or "Untitled product" if empty or numeric), size 36 × 24 × 30, no price ("No price"), `known: false`, model source "No model, shown as a sized box".
- Sample links: `https://shop.example/living/alder-3-seat-sofa`, `https://shop.example/storage/girder-bookshelf`, `https://market.example/item/48213`.

All product names, prices and retailers here are placeholders. Keep the function's signature stable so a real scraping or lookup API can replace the mock.

## Design tokens

Use the variables in `styles.css`. Key values:

- Ground `--color-bg` #f2f2f3, surface `--color-surface` #e9e9ea, text `--color-text` #1d1f20, accent `--color-accent` #5980a6, divider = text at 16% alpha.
- Accent ramp: 100 #eef6ff, 200 #d6ebff, 300 #b5d9fd, 400 #94bce3, 500 #749dc4, 600 #597ea3, 700 #416180, 800 #2c455d, 900 #1d2d3d.
- Neutral ramp: 100 #f5f5f8, 200 #e7e7ea, 300 #d4d4d7, 400 #b7b7ba, 500 #98989b, 600 #7a7a7d, 700 #5d5d60, 800 #424244, 900 #2b2b2d.
- Fonts: headings Barlow Condensed 600; body Barlow 400/500/700; base 15px, line-height 1.55.
- Spacing: 3.4, 6.8, 10.2, 13.6, 20.4, 27.2 px (`--space-1,2,3,4,6,8`).
- Corners are square on all components. Shadows: `--shadow-sm/md/lg`.
- Rules from the design system: frames are hairline line drawings with "+" registration marks; the primary button is the only solid accent fill; no decorative colour beyond the steel accent; body-size accent text uses `--color-accent-700`.
- 3D material colours (product imagery, not UI tokens): sofa #6f7f8c / cushions #7e8e9b / legs #3b2f27; chair #b5673f / #c0744c / #2e2a27; bed duvet #8a9a8b, frame #a67c52, linen #f3f1ec; desk top #b98d5e, legs #2b2b2d; table #6b4a33; shelf #ddd8ce with books #7c8a96 #b9a48a #5f6b5c #a2584a #d8d2c4; rug #c9b8a3 / #ded2c2; unknown box #c9ccd1.

## Assets

No image assets. The product photo is a drawn placeholder. Icons are Lucide (`RotateCw`, `Trash2`). The floor texture is generated on a canvas at runtime.

## Out of scope for this slice

Doors and windows, non-rectangular rooms, free-angle rotation, selecting items by clicking in 3D, saving and loading, accounts, real product lookup and real 3D product models.

## Files

- `Room Planner.dc.html`: the prototype (template plus logic class).
- `support.js`: prototype runtime, needed only to open the prototype. Do not port.
- `_ds/industry-…/styles.css`: design tokens and component classes. Copy into the app.
- `_ds/industry-…/readme.md`: design system rules.
- `_ds/industry-…/_ds_bundle.js`: loaded by the prototype; not needed in the app.
