# Room Planner workspace: design (slice 1)

Date: 2026-11-12
Status: approved 2026-11-12; amended the same day (arrow-key nudge, lighting sign-off, file names)
Source: `design_handoff_room_planner/README.md` and `Room Planner.dc.html` (the prototype)

## Goal

Build the full workspace screen from the design handoff as a Vite + React + TypeScript
front end, with no backend, structured so a real lookup API, real 3D models and
saving can be added later without rewriting the UI.

Decisions already made by the owner:

- Scope is the **full handoff screen**: all three layout modes and both 3D render styles.
- Scalability means **seams only**: no backend, no persistence in this slice.

## Scope

In scope: everything under "Screen: Workspace", "Interactions and behaviour",
"State", "Link lookup (mock)" and "Design tokens" in the handoff README. The README
is the behavioural contract; where it and the prototype disagree, the prototype's
maths wins and the difference is recorded in `Docs/mistakes-and-fixes.md`.

Out of scope (unchanged from the handoff): doors and windows, non-rectangular rooms,
free-angle rotation, picking items in 3D, saving and loading, accounts, real product
lookup, real 3D product models, mobile layout.

## Project layout

The app is scaffolded at the project root, next to the handoff folder, and the root
becomes a git repository. The handoff folder stays untouched as the reference.

```
Room Planner Website/
  design_handoff_room_planner/     reference only, never imported
  Docs/
    specs/                         this file
    mistakes-and-fixes.md          running log of mistakes and fixes
  index.html, package.json, vite.config.ts, tsconfig*.json, eslint.config.js
  README.md                        project readme
  src/
    main.tsx, App.tsx
    styles/industry.css            copied from the handoff, fonts import removed
    styles/app.css                 layout only, tokens only
    styles/tokens.ts               reads CSS token values for the two 3D views
    config.ts                      limits and tunables (see Constants)
    domain/
      types.ts                     PlanDocument, Room, Item, Kind, Units
      units.ts                     formatting and parsing
      geometry.ts                  footprint, mapPart, clampSnap, rotate, place
      conflicts.ts                 conflict detection
      catalog.ts                   part tables and material looks per Kind
    view/
      panes.ts                     stage → pane rectangles for the three layouts
      planLayout.ts                plan scale and origin, clearance lines
      camera.ts                    shared orbit camera maths
      blueprintScene.ts            box list, painter's sort, projection
      blueprintDraw.ts             canvas drawing routine for the blueprint view
    services/
      productLookup.ts             ProductLookup interface, URL validation
      mockProductLookup.ts         the mocked provider
    three/
      roomMesh.ts, furnitureModels.ts, modelSource.ts, SceneRenderer.ts
    state/
      planStore.ts                 the document: units, room, items
      uiStore.ts                   selection, layout, camera, lookup, drafts
      selectors.ts                 conflicts, totals, derived view data
    components/
      Header.tsx
      Sidebar/RoomSection.tsx, AddFurnitureSection.tsx, ItemList.tsx
      Stage/Stage.tsx, PlanView.tsx, ThreeView.tsx, BlueprintView.tsx, InsetFrame.tsx
      TopBar.tsx, SelectionBar.tsx
      ui/Segmented.tsx, BlueprintCorners.tsx
    hooks/startDrag.ts, useElementSize.ts, useKeyboardShortcuts.ts

Sidebar and stage components each have a small CSS file beside them.
```

`domain/` and `view/` are pure TypeScript with no React, DOM or three.js imports.
That is where the maths lives and where most tests are.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite 8, React 19, TypeScript strict | as the handoff asks |
| State | Zustand 5 | handoff suggestion; selector subscriptions keep drags cheap |
| 3D | `three` 0.187 as ES modules, no react-three-fiber | prototype is plain three.js rendering on demand; fewer moving parts |
| Icons | `lucide-react`, `strokeWidth={1.5}` | handoff |
| Fonts | Barlow and Barlow Condensed self-hosted via `@fontsource` | see Decisions |
| Tests | Vitest + React Testing Library (jsdom) | unit and component level |
| Lint | ESLint flat config with typescript-eslint and react-hooks | |

## Scalability seams

These are the only places this slice does more than the prototype. Each one is an
interface with a single implementation today.

1. **Plan document separate from view state.** `planStore` holds a serializable
   `PlanDocument { schemaVersion: 1, units, room, items }`. Selection, layout mode,
   camera, lookup status and input drafts live in `uiStore`. Saving, sharing, undo
   and server sync later operate on the document alone, and `schemaVersion` gives
   migrations a hook.
2. **Product lookup provider.** `ProductLookup = { lookup(url, { signal }): Promise<ProductPreview> }`.
   The UI depends on the interface; `mockProductLookup` is the one provider. URL
   validation (`parseProductUrl`) is separate from the provider and stays client-side
   when a real API arrives. Failures are a typed `LookupError` with a `code`, so the
   UI maps codes to copy instead of showing raw error text.
3. **Model source per item.** `Item.model` records the tier
   (`'retailer' | 'generated' | 'parametric' | 'box'`) and an optional asset URL.
   `resolveModel(item)` returns a three.js group. Today it always builds the
   parametric template or the box. `SceneRenderer` caches whatever it returns by a
   model key, so a loaded GLB can be returned later with the parametric model as the
   placeholder while it loads.
4. **One renderer object, not render code in a component.** `SceneRenderer` owns the
   WebGL renderer, scene, caches and disposal. `ThreeView` is a thin React wrapper
   that feeds it state and calls `render()`. The three.js code is loaded as a lazy
   chunk so the sidebar and plan are usable before it arrives.
5. **Shared camera and layout maths.** The realistic and blueprint views take the
   same `CameraPose` from `view/camera.ts`, so they cannot drift apart.

## State

Lengths are stored in inches and never change when units change.

```ts
type Units = 'ft' | 'm';
type Kind = 'sofa' | 'chair' | 'bed' | 'desk' | 'table' | 'shelf' | 'rug' | 'box';
type ModelTier = 'retailer' | 'generated' | 'parametric' | 'box';

interface Room { w: number; l: number; h: number }

interface Item {
  id: string;                       // crypto.randomUUID()
  kind: Kind;
  name: string;
  host: string;
  sourceUrl: string | null;
  price: number | null;
  w: number; d: number; h: number;  // unrotated
  x: number; y: number;             // top-left of rotated footprint
  rot: 0 | 1 | 2 | 3;
  model: { tier: ModelTier; label: string; assetUrl: string | null };
}

interface PlanDocument { schemaVersion: 1; units: Units; room: Room; items: Item[] }

interface UiState {
  selectedId: string | null;
  layout: 'inset' | 'split' | 'tabs';
  insetSwapped: boolean;
  tab: '2d' | '3d';
  renderStyle: 'realistic' | 'blueprint';
  camera: { yaw: number; pitch: number; zoom: number };
  lookup:
    | { status: 'idle' }
    | { status: 'loading'; host: string }
    | { status: 'preview'; product: ProductPreview }
    | { status: 'error'; code: LookupErrorCode };
}
```

Initial document: room 144 × 168 × 96, a bed (64 × 85 × 38 at 40, 0, rot 0, $890)
and a desk (55 × 26 × 30 at 118, 104, rot 1, $420). Input draft strings (room and
preview dimensions, the URL field) are local component state, re-seeded when units
change or a room handle is dragged.

## Behaviour

All behaviour follows the handoff README. Points where the prototype is more exact
than the README, which the implementation follows:

- Plan scale has a floor of 0.2 px per inch; inset safe width has a floor of 200 px.
- Preview dimensions accept values greater than 0 and up to 240 in.
- Clearance lines are hidden when the selected item is "Outside the room".
- Item labels on the plan show only when the box is larger than 84 × 38 px; part
  hairlines show only for kinds with more than one part.
- Conflict tests use a 0.01 in tolerance, so touching pieces do not conflict.
- The keyboard handler ignores keys when focus is in an input, textarea or select,
  except radio inputs (the segmented controls).
- Blueprint view also labels the selected item with its name and height.
- Hostnames have a leading `www.` removed.

Additions for production readiness:

- **Stale lookups are dropped.** Starting a new lookup, discarding, or unmounting
  aborts the previous one, so a slow response cannot overwrite a newer state.
- **WebGL failure falls back.** If the WebGL context cannot be created or is lost,
  the 3D pane switches to the Blueprint style and shows a one-line note. An error
  boundary around the 3D pane keeps the rest of the screen working.
- **Device pixel ratio** is capped at 2 for both 3D styles.
- **Arrow keys nudge the selected item** (owner request, 2026-11-12): 1 in per
  press, 12 in with Shift, clamped to the room. Arrow keys are ignored while focus is
  in any input. The 2D hint in the selection bar gains "or nudge it with the arrow
  keys". Room edge handles stay pointer-only; the sidebar inputs are their keyboard
  route.

## three.js port notes

The prototype targets three r128 globals; the app uses the current release.

- `outputEncoding` and `texture.encoding` become `outputColorSpace` and `texture.colorSpace`.
- Light intensities are not directly comparable since lights became physically based.
  The starting values are the README's 0.78 and 0.62 multiplied by π. The final values
  are tuned against the prototype and are accepted when the owner approves a
  side-by-side comparison in the browser (owner decision, 2026-11-12). They are
  recorded in `config.ts`.
- `preserveDrawingBuffer` is not carried over; it was a prototype tooling need.
- Token colours for 3D come from `getComputedStyle` once the stylesheet has loaded.

## Constants (`config.ts`)

| Name | Value |
| --- | --- |
| Room dimension limits | 36 to 720 in |
| Room handle snap | 3 in |
| Furniture snap | 1 in |
| Preview dimension limit | greater than 0, up to 240 in |
| Show clearances | on |
| Mock lookup delay | 900 ms |
| Camera defaults | yaw −0.65, pitch 0.55, zoom 1 |
| Pitch clamp, zoom clamp | 0.12 to 1.45 rad, 0.6 to 2.5 |

The prototype's `snapInches`, `showClearances` and `startEmpty` were design-tool
props. They become constants, not user-facing settings.

## Security and privacy

- Pasted links are parsed with `URL`; only `http:` and `https:` are accepted and the
  hostname must contain a dot. Nothing is fetched in this slice.
- Product names, hostnames and slugs are rendered as React text, never as HTML.
- No secrets, no PII, no storage, no analytics, no network calls after page load.
- Fonts are self-hosted, so no visitor IP addresses go to Google Fonts.
- A real lookup API later must run server-side with SSRF protection, rate limiting
  and an allow-list of schemes. That is noted here so the seam is not wired straight
  to a browser-side fetch.

## Testing

Tests are written first, per behaviour.

- **Pure modules (most of the coverage):** units formatting and parsing in both
  systems; footprint, `mapPart` for all four rotations, snap and clamp, rotate about
  centre; conflicts in the specified order including rug exemptions and the
  tolerance; pane rectangles for inset, swapped inset, split and tabs; plan scale and
  origin including the safe area; clearance lines; camera pose; blueprint box
  ordering; URL validation and every catalogue keyword in match order.
- **Stores:** place, move, rotate, remove, room resize, units toggle leaving stored
  inches unchanged.
- **Components:** the lookup flow (idle, loading, preview, error, discard, place)
  with a fake provider and fake timers; item list and totals; keyboard shortcuts
  including the focus-in-input rule; top bar status tag.
- **Live check:** the built app is opened in a browser beside the prototype and each
  layout, both render styles, drag, resize, orbit and zoom are exercised before the
  slice is called done. WebGL output is checked by eye, not by unit test.

## Decisions for approval

Each of these is a default I chose. Say so if you want a different one.

1. **App at the project root, with `git init` there.** Alternative: a `room-planner/`
   subfolder, which is better only if this folder will hold other packages.
2. **Item ids are UUID strings, not the README's incrementing numbers.** Numbers
   collide as soon as plans are saved, merged or synced. The bookshelf's seeded book
   layout hashes the id instead of multiplying it.
3. **Two stores (document and UI) instead of the README's single `PlanState`.** Same
   fields, split along the line a backend would need.
4. **Fonts self-hosted through `@fontsource`,** removing the Google Fonts `@import`
   from the copied stylesheet. Rendering is identical; it avoids a third-party
   request and a GDPR question.
5. **Plain three.js, no react-three-fiber.** Revisit if 3D interaction (picking,
   dragging in 3D) comes into scope.
6. **`Item` gains `sourceUrl` and `model`** beyond the README's shape, for the lookup
   and model seams.
7. **WebGL fallback to Blueprint** is new behaviour not in the handoff.
8. **Vitest + React Testing Library only; no Playwright suite yet.** The live check
   is manual in this slice.
