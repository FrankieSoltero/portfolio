# Room Planner Workspace Implementation Plan

> **For executors:** execute with soltero-skills:lean-sdd. The Task Dependency
> Table below is the scheduling and review-depth contract.

**Goal:** Recreate the full workspace screen from `design_handoff_room_planner/` as a
Vite + React + TypeScript front end with no backend.

**Architecture:** Pure TypeScript modules (`src/domain`, `src/view`) hold all maths
and are free of React, DOM and three.js imports. Two Zustand stores separate the
serializable plan document from view state. React components render from the stores;
the WebGL view is one `SceneRenderer` class behind a lazily loaded component.

**Tech stack / test runner:** Vite 8, React 19, TypeScript strict, Zustand 5,
three 0.187, lucide-react, @fontsource/barlow, @fontsource/barlow-condensed,
Vitest 5 + React Testing Library + jsdom, ESLint flat config.
Tests: `npx vitest run <file>`. Full gate: `npm run check`
(= `tsc -b --noEmit && eslint . && vitest run && vite build`).

**Spec:** `Docs/specs/2026-11-12-room-planner-workspace-design.md`

## Global Constraints

- Repo root is the project folder (the one holding `package.json`). All paths
  below are relative to it. Run every command from the root.
- `design_handoff_room_planner/` is read-only reference. Never import from it, never
  edit it. "Prototype" means `design_handoff_room_planner/Room Planner.dc.html`;
  "README" means `design_handoff_room_planner/README.md`. Line references are to the
  prototype.
- The README is the behaviour and visual contract (sizes, copy, colours). Where a task
  says "port from prototype lines A–B", reproduce that maths exactly in typed form.
  If README and prototype disagree, the prototype wins; add a line to
  `Docs/mistakes-and-fixes.md`.
- All lengths are stored in inches. Unit changes never change stored values.
- `src/domain/**` and `src/view/**` must not import `react`, `three`, or touch
  `window`/`document`.
- Styling uses classes from `src/styles/industry.css` and `var(--*)` tokens only.
  No hex colours in components or app CSS. The only hex values allowed are the 3D
  material colours in `src/domain/catalog.ts` and the hemisphere ground `#d8d2c8`.
- User-supplied strings (names, hosts, URLs) are rendered as React text only. No
  `dangerouslySetInnerHTML`.
- Test-first: each behaviour row gets an automated test that is seen failing before
  the implementation exists. The only exceptions are rows marked **(live)** and the
  Task 1 scaffold rows, which are checked by the commands or the Task 20 live rows
  named beside them.
- For the mock catalogue, the table in Task 8 is authoritative. It was copied from
  prototype lines 223–231 and agrees with the README table.
- Nothing in this plan deploys, migrates or stores data. Every task is one commit, and
  the rollback for any task is `git revert <that commit>`.
- TypeScript: no `any`, no non-null `!` on store lookups without a guard.
- Each task ends with `npx tsc -b --noEmit` and `npx eslint .` clean, plus its own
  Verify command.

## Task Dependency Table

| Task | Files touched | Depends on | Risk tier |
|------|---------------|------------|-----------|
| 1. Scaffold | `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/test/setup.ts`, `src/styles/industry.css`, `src/styles/app.css`, `Docs/mistakes-and-fixes.md`, `README.md` | — | standard |
| 2. Types and config | `src/domain/types.ts`, `src/config.ts`, `src/domain/catalog.ts`, `src/domain/catalog.test.ts`, `vite.config.ts` | 1 | mechanical |
| 3. Units | `src/domain/units.ts`, `src/domain/units.test.ts` | 2 | standard |
| 4. Geometry | `src/domain/geometry.ts`, `src/domain/geometry.test.ts` | 2 | standard |
| 5. Conflicts | `src/domain/conflicts.ts`, `src/domain/conflicts.test.ts` | 4 | standard |
| 6. Panes and plan layout | `src/view/panes.ts`, `src/view/panes.test.ts`, `src/view/planLayout.ts`, `src/view/planLayout.test.ts` | 3, 4 | standard |
| 7. Camera and blueprint scene | `src/view/camera.ts`, `src/view/camera.test.ts`, `src/view/blueprintScene.ts`, `src/view/blueprintScene.test.ts` | 4, 6 | judgment |
| 8. Product lookup | `src/services/productLookup.ts`, `src/services/productLookup.test.ts`, `src/services/mockProductLookup.ts`, `src/services/mockProductLookup.test.ts` | 2 | standard |
| 9. Stores | `src/state/planStore.ts`, `src/state/uiStore.ts`, `src/state/actions.ts`, `src/state/selectors.ts`, `src/state/stores.test.ts` | 4, 5, 8 | standard |
| 10. Hooks and UI primitives | `src/hooks/startDrag.ts`, `src/hooks/useElementSize.ts`, `src/hooks/useKeyboardShortcuts.ts`, `src/hooks/useKeyboardShortcuts.test.tsx`, `src/styles/tokens.ts`, `src/styles/tokens.test.ts`, `src/components/ui/Segmented.tsx`, `src/components/ui/BlueprintCorners.tsx`, `src/components/ui/ui.test.tsx` | 9 | standard |
| 11. Header and room section | `src/components/Header.tsx`, `src/components/Sidebar/RoomSection.tsx`, `src/components/Sidebar/sidebar.css`, `src/components/Sidebar/RoomSection.test.tsx` | 3, 9, 10 | standard |
| 12. Add-furniture section | `src/components/Sidebar/AddFurnitureSection.tsx`, `src/components/Sidebar/addFurniture.css`, `src/components/Sidebar/AddFurnitureSection.test.tsx` | 3, 8, 9, 10, 11 | judgment |
| 13. Item list and sidebar assembly | `src/components/Sidebar/ItemList.tsx`, `src/components/Sidebar/itemList.css`, `src/components/Sidebar/Sidebar.tsx`, `src/components/Sidebar/Sidebar.test.tsx` | 3, 9, 11, 12 | standard |
| 14. Plan view | `src/components/Stage/PlanView.tsx`, `src/components/Stage/InsetFrame.tsx`, `src/components/Stage/stage.css`, `src/components/Stage/PlanView.test.tsx` | 3, 6, 9, 10 | judgment |
| 15. 3D models | `src/three/roomMesh.ts`, `src/three/furnitureModels.ts`, `src/three/modelSource.ts`, `src/three/roomMesh.test.ts`, `src/three/furnitureModels.test.ts`, `src/three/modelSource.test.ts` | 2, 10 | standard |
| 16. Scene renderer and realistic view | `src/three/SceneRenderer.ts`, `src/components/Stage/ThreeView.tsx`, `src/three/SceneRenderer.test.ts`, `src/components/Stage/ThreeView.test.tsx` | 4, 7, 9, 10, 15 | judgment |
| 17. Blueprint 3D | `src/view/blueprintDraw.ts`, `src/components/Stage/BlueprintView.tsx`, `src/view/blueprintDraw.test.ts`, `src/components/Stage/BlueprintView.test.tsx` | 3, 4, 7, 9, 10 | judgment |
| 18. Stage | `src/components/Stage/Stage.tsx`, `src/components/Stage/stageShell.css`, `src/components/Stage/Stage.test.tsx` | 6, 9, 10, 14, 16, 17 | judgment |
| 19. Bars and app shell | `src/components/TopBar.tsx`, `src/components/SelectionBar.tsx`, `src/components/bars.test.tsx`, `src/App.test.tsx`, `src/App.tsx`, `src/styles/app.css`, `README.md` | 3, 8, 9, 10, 11, 13, 18 | judgment |
| 20. Live verification and lighting sign-off | `src/config.ts`, `Docs/mistakes-and-fixes.md`, `Docs/verification/2026-11-12-live-check.md`, `Docs/verification/lighting-prototype.png`, `Docs/verification/lighting-app.png` | 19 | judgment |

Disjoint sets that may run concurrently once their dependencies are met:
{3, 4, 8}; {5, 6}; {7, 9}; {14, 15}; {16, 17}.

---

## Task 1: Scaffold

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/vite-env.d.ts`
- Create: `src/test/setup.ts`
- Create: `src/styles/industry.css`
- Create: `src/styles/app.css`
- Create: `Docs/mistakes-and-fixes.md`
- Create: `README.md`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (`vitest run`), `typecheck`
  (`tsc -b --noEmit`), `lint` (`eslint .`), `check` (all four in the order typecheck,
  lint, test, build). Vitest configured in `vite.config.ts` with
  `environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`, `css: false`,
  and `exclude` covering `design_handoff_room_planner/**`.
  `src/test/setup.ts` imports `@testing-library/jest-dom/vitest` and installs a
  no-op `ResizeObserver` if missing.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Protect existing files first | repo root, before any scaffold file exists | `git init`, then a first commit `chore: add design handoff and docs` containing only `design_handoff_room_planner/` and `Docs/`. This commit is the backup: any later damage is undone with `git checkout -- design_handoff_room_planner Docs` |
| Scaffold | root already has `design_handoff_room_planner/`, `Docs/` | Run `npm create vite@latest rp-scaffold -- --template react-ts` in a new temporary directory outside the repo, then copy its `package.json`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.gitignore`, `src/main.tsx`, `src/vite-env.d.ts` into the repo root. Copy nothing else. Set `"name": "room-planner"` in `package.json` |
| Handoff untouched | after scaffold and install | `git status --porcelain design_handoff_room_planner` prints nothing |
| Stylesheet | `src/styles/industry.css` | Byte copy of `design_handoff_room_planner/_ds/industry-be146a4e-adb2-4c13-8c51-8590a0cfc099/styles.css` with only line 2 (the Google Fonts `@import`) removed |
| Fonts | `src/main.tsx` | Imports, before `industry.css`: `@fontsource/barlow/400.css`, `/500.css`, `/700.css`, `@fontsource/barlow-condensed/400.css`, `/600.css` |
| Placeholder app | `src/App.tsx` | Renders `<header class="nav"><span class="nav-brand">Room planner</span></header>` only |
| ESLint | `eslint.config.js` | typescript-eslint recommended + react-hooks + react-refresh; ignores `dist`, `design_handoff_room_planner` |
| tsconfig | `tsconfig.app.json` | `strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess` all true |
| Docs log | `Docs/mistakes-and-fixes.md` | Heading plus entry format: Date, What happened, Root cause, Fix, How to avoid |
| README | `README.md` | Project name, the six npm scripts (`dev`, `build`, `test`, `typecheck`, `lint`, `check`), pointer to spec and plan |
| HTML | `index.html` | `<title>Room planner</title>`, `lang="en"`, no external resources |

**Exact values:**
- Runtime dependencies: `react@^19.3.1`, `react-dom@^19.3.1`, `zustand@^5.1.0`,
  `three@^0.187.0`, `lucide-react@^1.72.0`, `@fontsource/barlow@^5.3.0`,
  `@fontsource/barlow-condensed@^5.3.0`.
- Dev dependencies added to the template: `@types/three@^0.187.0`, `vitest@^5.1.0`,
  `jsdom@^31.0.0`, `@testing-library/react@^16.3.3`,
  `@testing-library/user-event@^14.6.10`, `@testing-library/jest-dom@^7.0.1`.
- `vite`, `typescript`, `eslint`, `typescript-eslint`, the React ESLint plugins,
  `@vitejs/plugin-react` and the React type packages stay at the versions the Vite
  template writes, because the template is the tested-together set. Commit
  `package-lock.json`.
- `.gitignore`: `node_modules`, `dist`, `.DS_Store`, `*.local`, `coverage`.
- `vite.config.ts` test block includes `passWithNoTests: true` for this task only;
  Task 2 removes it.

**Verify:** each command from the repo root, with its expected result:
- `npm run check` → exits 0.
- `npm audit --omit=dev` → no high or critical.
- `git log --oneline | wc -l` → `2` after this task's commit; `git show --stat HEAD~1 --format=` lists only paths under `design_handoff_room_planner/` and `Docs/`.
- `git status --porcelain design_handoff_room_planner` → no output.
- `diff <(sed '2d' design_handoff_room_planner/_ds/industry-be146a4e-adb2-4c13-8c51-8590a0cfc099/styles.css) src/styles/industry.css` → no output.
- `grep -c "fonts.googleapis" src/styles/industry.css index.html` → `0` for both files.
- `grep -n "fontsource\|industry.css" src/main.tsx` → five `@fontsource` lines, then the `industry.css` line.
- `grep -c "<title>Room planner</title>" index.html` → `1`.
- `ls src/App.css src/assets 2>/dev/null` → no output.
**Commit:** `chore: scaffold Vite React TS app with Industry stylesheet`

---

## Task 2: Types and config

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/config.ts`
- Create: `src/domain/catalog.ts`
- Test: `src/domain/catalog.test.ts`
- Modify: `vite.config.ts`

**Interfaces — produces (`src/domain/types.ts`):**

```ts
export type Units = 'ft' | 'm';
export type Kind = 'sofa' | 'chair' | 'bed' | 'desk' | 'table' | 'shelf' | 'rug' | 'box';
export type Rot = 0 | 1 | 2 | 3;
export type ModelTier = 'retailer' | 'generated' | 'parametric' | 'box';
export type RoomAxis = 'w' | 'l' | 'h';
export interface Room { w: number; l: number; h: number }
export interface ItemModel { tier: ModelTier; label: string; assetUrl: string | null }
export interface Item {
  id: string; kind: Kind; name: string; host: string; sourceUrl: string | null;
  price: number | null; w: number; d: number; h: number;
  x: number; y: number; rot: Rot; model: ItemModel;
}
export interface PlanDocument { schemaVersion: 1; units: Units; room: Room; items: Item[] }
export interface ProductPreview {
  kind: Kind; name: string; host: string; sourceUrl: string; price: number | null;
  w: number; d: number; h: number; known: boolean; model: ItemModel;
}
export type LayoutMode = 'inset' | 'split' | 'tabs';
export type StageTab = '2d' | '3d';
export type RenderStyle = 'realistic' | 'blueprint';
export interface CameraState { yaw: number; pitch: number; zoom: number }
/** [u0,u1,v0,v1,z0,z1] fractions of width, depth, height; v=0 is the back edge */
export type PartRect = readonly [number, number, number, number, number, number];
export type Conflicts = Readonly<Record<string, string>>;
```

**Produces (`src/config.ts`):** `export const CONFIG` (`as const`) with exactly:
`roomMin: 36`, `roomMax: 720`, `roomHandleSnap: 3`, `furnitureSnap: 1`,
`previewDimMax: 240`, `showClearances: true`, `lookupDelayMs: 900`,
`camera: { yaw: -0.65, pitch: 0.55, zoom: 1 }`, `pitchMin: 0.12`, `pitchMax: 1.45`,
`zoomMin: 0.6`, `zoomMax: 2.5`, `orbitYawPerPx: 0.008`, `orbitPitchPerPx: 0.006`,
`zoomPerDelta: 0.001`, `planMargin: 64`, `planMarginInset: 48`, `dimOffset: 30`,
`dimOffsetInset: 22`, `insetGap: 16`, `minPlanScale: 0.2`, `minSafeWidth: 200`,
`conflictEpsilon: 0.01`, `maxPixelRatio: 2`, `nudgeStep: 1`, `nudgeStepLarge: 12`,
`hemiIntensity: 2.45`, `sunIntensity: 1.95`. The two intensities are the handoff's
0.78 and 0.62 multiplied by π, because three 0.187 uses physically based light units.
They are starting values; Task 20 owns the final values.

**Produces (`src/domain/catalog.ts`):**
- `export const PARTS: Record<Kind, readonly PartRect[]>` — copy prototype lines 233–240.
- `export const LOOKS: Record<Kind, { main?: string; soft?: string; wood?: string; metal?: string }>` — copy prototype lines 246–250.
- `export const LINEN = '#f3f1ec'`, `export const BOOK_COLOURS = ['#7c8a96','#b9a48a','#5f6b5c','#a2584a','#d8d2c4'] as const`.
- `export function createInitialDocument(): PlanDocument`

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Initial doc | `createInitialDocument()` | `schemaVersion 1`, `units 'ft'`, room `{w:144,l:168,h:96}`, two items below; returns a fresh object each call |
| Every kind has parts and looks | each `Kind` | `PARTS[k].length >= 1`, `LOOKS[k]` defined |
| Part fractions valid | every part | all six numbers within 0..1, `u0<u1`, `v0<v1`, `z0<z1` |
| Config values | `CONFIG` | every key listed above has exactly the listed value |
| No empty test runs | `vite.config.ts` | `passWithNoTests` removed, so a run that matches no tests fails |

**Exact values:** initial items —
`{ id:'seed-bed', kind:'bed', name:'Low platform bed, queen', host:'shop.example', sourceUrl:null, price:890, w:64, d:85, h:38, x:40, y:0, rot:0, model:{tier:'retailer', label:'3D model from retailer', assetUrl:null} }`
`{ id:'seed-desk', kind:'desk', name:'Tack writing desk', host:'shop.example', sourceUrl:null, price:420, w:55, d:26, h:30, x:118, y:104, rot:1, model:{tier:'retailer', label:'3D model from retailer', assetUrl:null} }`

**Verify:** `npx vitest run src/domain/catalog.test.ts` → every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(domain): plan document types, config and catalogue tables`

---

## Task 3: Units

**Files:**
- Create: `src/domain/units.ts`
- Test: `src/domain/units.test.ts`

**Interfaces:**
- Consumes: `Units`, `Room` from `types.ts`; `CONFIG`.
- Produces:
  - `fmtLen(inches: number, units: Units): string`
  - `roomInputStr(inches: number, units: Units): string`
  - `furnInputStr(inches: number, units: Units): string`
  - `fmtFurnDims(dims: { w: number; d: number; h: number }, units: Units): string`
  - `parseRoomInput(raw: string, units: Units): number | null` — inches, or null if not finite or outside `roomMin..roomMax`
  - `parseFurnInput(raw: string, units: Units): number | null` — inches, or null unless `0 < v <= previewDimMax`
  - `fmtArea(room: Room, units: Units): string`
  - `fmtMoney(price: number | null): string`
  - `gridStepInches(units: Units): number`
  - `roomUnitLabel(units): 'ft' | 'm'`, `furnUnitLabel(units): 'in' | 'cm'`, `roomInputStep(units): 0.25 | 0.05`

Port from prototype lines 300–312, 321–322, 328–329, 700, 707.

**Behavior:**

| Case | Input | Expected |
|------|-------|----------|
| ft whole | `fmtLen(144,'ft')` | `12′ 0″` |
| ft with inches | `fmtLen(150,'ft')` | `12′ 6″` |
| ft under a foot | `fmtLen(8,'ft')` | `8″` |
| ft rounds up to next foot | `fmtLen(11.6,'ft')` | `1′ 0″` |
| metric metres | `fmtLen(144,'m')` | `3.66 m` |
| metric cm | `fmtLen(30,'m')` | `76 cm` |
| room input ft | `roomInputStr(144,'ft')`, `(150,'ft')` | `12`, `12.5` |
| room input m | `roomInputStr(144,'m')` | `3.66` |
| furn input | `furnInputStr(0.5,'ft')`, `(64,'m')` | `0.5`, `163` |
| furn dims ft | `{w:64,d:85,h:38}`, `'ft'` | `64 × 85 × 38 in` |
| furn dims m | same, `'m'` | `163 × 216 × 97 cm` |
| parse room ok | `('12','ft')`, `('3.66','m')` | `144`, ≈`144.094` (within 0.01) |
| parse room limits | `('2.9','ft')`, `('61','ft')`, `('','ft')`, `('abc','ft')` | all `null` |
| parse room edges | `('3','ft')`, `('60','ft')` | `36`, `720` |
| parse furn | `('84','ft')`, `('0','ft')`, `('241','ft')`, `('100','m')` | `84`, `null`, `null`, ≈`39.37` |
| area | room 144×168: `'ft'`, `'m'` | `168 sq ft`, `15.6 m²` |
| money | `1290`, `null`, `0` | `$1,290`, `No price`, `$0` |
| grid step | `'ft'`, `'m'` | `12`, `50/2.54` |

**Exact values:** prime `′` is U+2032, double prime `″` is U+2033, multiplication
sign `×` is U+00D7, separated by single spaces. Money uses `toLocaleString('en-US')`.

**Verify:** `npx vitest run src/domain/units.test.ts` → every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(domain): unit formatting and parsing`

---

## Task 4: Geometry

**Files:**
- Create: `src/domain/geometry.ts`
- Test: `src/domain/geometry.test.ts`

**Interfaces:**
- Consumes: `Item`, `Room`, `Rot`, `PartRect`, `ProductPreview` types; `CONFIG`.
- Produces:
  - `footprint(item: Pick<Item, 'w' | 'd' | 'rot'>): [number, number]`
  - `mapPart(part: PartRect, rot: Rot): [number, number, number, number]` — returns `[u0,u1,v0,v1]` in footprint space
  - `clampSnap(v: number, max: number, snap: number): number`
  - `moveItem(item: Item, x: number, y: number, room: Room, snap: number): Item`
  - `rotateItem(item: Item, room: Room, snap: number): Item`
  - `centrePosition(dims: { w: number; d: number }, room: Room, snap: number): { x: number; y: number }`
  - `snapRoomDim(inches: number): number`

Port from prototype lines 335–342, 355, 394, 414–415, 402, 450.

**Behavior:**

| Case | Input | Expected |
|------|-------|----------|
| footprint even/odd | `{w:55,d:26,rot:0}`, `rot:1`, `rot:2`, `rot:3` | `[55,26]`, `[26,55]`, `[55,26]`, `[26,55]` |
| mapPart rot 0 | `[.1,.4,.2,.3,0,1]` | `[.1,.4,.2,.3]` |
| mapPart rot 1 | same | `[.7,.8,.1,.4]` |
| mapPart rot 2 | same | `[.6,.9,.7,.8]` |
| mapPart rot 3 | same | `[.2,.3,.6,.9]` |
| clampSnap rounds | `(10.4, 100, 1)`, `(10.5, 100, 1)`, `(13, 100, 6)` | `10`, `11`, `12` |
| clampSnap clamps | `(-5, 100, 1)`, `(150, 100, 1)`, `(5, -10, 1)` | `0`, `100`, `0` |
| moveItem clamps to room | bed (64×85) to `(200, -3)` in 144×168 | `x 80, y 0` |
| moveItem immutability | any | returns a new object; input unchanged |
| rotate seed desk | seed desk (55×26, rot 1, x 118, y 104) in 144×168, snap 1 | `rot 2, x 89, y 119` |
| rotate wraps | item with `rot 3` | `rot 0` |
| centre sofa | `{w:84,d:36}` in 144×168 | `{x:30,y:66}` |
| centre oversized | `{w:200,d:36}` in 144×168 | `x 0` |
| snapRoomDim | `100`, `20`, `1000`, `145.4` | `99`, `36`, `720`, `144` |

**Verify:** `npx vitest run src/domain/geometry.test.ts` → every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(domain): footprint, rotation, snapping and placement geometry`

---

## Task 5: Conflicts

**Files:**
- Create: `src/domain/conflicts.ts`
- Test: `src/domain/conflicts.test.ts`

**Interfaces:**
- Consumes: `footprint(item): [number, number]`; `Item`, `Room`, `Conflicts`; `CONFIG.conflictEpsilon`.
- Produces: `findConflicts(items: readonly Item[], room: Room): Conflicts` — keyed by
  item id, one reason per item, absent key means no conflict.

Port from prototype lines 362–377.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Initial document | seed bed and desk in 144×168×96 | `{}` |
| Outside | item with `x + footprintW > room.w` | `Outside the room` |
| Outside via negative | `x: -1` | `Outside the room` |
| Too tall | `h 100`, ceiling 96, inside room | `Taller than the ceiling` |
| Order: outside beats tall | outside and too tall | `Outside the room` |
| Order: tall beats overlap | too tall and overlapping | `Taller than the ceiling` |
| Overlap | two non-rug boxes overlapping by 1 in | both flagged, each `Overlaps {other.name}` |
| Touching edges | two boxes sharing an edge exactly | no conflict |
| Rug under furniture | rug overlapping a sofa | neither flagged |
| Rug outside room | rug past a wall | `Outside the room` |
| Rotation respected | item `rot 1` whose rotated footprint overlaps but unrotated would not | flagged |
| First hit named | A overlaps B and C, array order A,B,C | A's reason names B |

**Verify:** `npx vitest run src/domain/conflicts.test.ts` → every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(domain): conflict detection`

---

## Task 6: Panes and plan layout

**Files:**
- Create: `src/view/panes.ts`
- Test: `src/view/panes.test.ts`
- Create: `src/view/planLayout.ts`
- Test: `src/view/planLayout.test.ts`

**Interfaces:**
- Consumes: `footprint`; `fmtLen(inches, units): string`; types; `CONFIG`.
- Produces (`panes.ts`):
  ```ts
  export interface PaneRect { left: number; top: number; w: number; h: number; z: number;
    inset: boolean; divider: boolean; safeW: number }
  export interface Panes { plan: PaneRect | null; three: PaneRect | null }
  export function computePanes(sw: number, sh: number, layout: LayoutMode,
    tab: StageTab, insetSwapped: boolean): Panes
  ```
  `safeW` is always set: the usable width for fitting (equals `w` except for the main
  pane in inset layout).
- Produces (`planLayout.ts`):
  ```ts
  export interface PlanLayout { scale: number; ox: number; oy: number }
  export function computePlanLayout(room: Room, pane: PaneRect): PlanLayout
  export interface ClearanceLine { left: number; top: number; length: number;
    orientation: 'h' | 'v'; label: string; showLabel: boolean }
  export function computeClearances(item: Item, room: Room, layout: PlanLayout,
    units: Units): ClearanceLine[]
  ```
  Clearance coordinates are in pane pixels (already offset by `ox`, `oy`).

Port from prototype lines 345–354, 356–361, 691–699.

**Behavior:**

| Case | Input | Expected |
|------|-------|----------|
| Inset | `(1000, 600, 'inset', '2d', false)` | plan `{left:624, top:320, w:360, h:264, z:8, inset:true, divider:false, safeW:360}`; three `{left:0, top:0, w:1000, h:600, z:1, inset:false, divider:false, safeW:608}` |
| Inset swapped | same with `true` | plan and three exchanged |
| Inset clamps low | `(400, 300, 'inset', …)` | inset `w 220, h 200`; main `safeW 200` |
| Inset clamps high | `(2000, 1200, 'inset', …)` | inset `w 380, h 320` |
| Split | `(1001, 600, 'split', …)` | plan `{left:0,w:500}`, three `{left:500,w:501,divider:true}` |
| Tabs 2d / 3d | `'tabs'`, `'2d'` / `'3d'` | only plan / only three, full stage, other is `null` |
| Layout main pane | room 144×168, pane `{w:1000,h:600,safeW:608,inset:false}` | `scale ≈ 2.8095`, `ox ≈ 101.714`, `oy = 64` |
| Layout inset pane | room 144×168, pane `{w:360,h:264,safeW:360,inset:true}` | `scale = 1` (min of 1.8333 and 1), `ox = 108`, `oy = 48` |
| Scale floor | tiny pane `{w:100,h:100}` | `scale = 0.2` |
| Clearances, centred item | 24×24 item at (60,72) in 144×168, scale 2 | four lines; gaps 60, 60, 72, 72 in; labels `fmtLen` of each |
| Clearance skipped | item flush to left wall (`x 0`) | no left line (gap must be > 0.5) |
| Clearance label hidden | gap × scale ≤ 34 px | `showLabel false` |

**Verify:** `npx vitest run src/view/panes.test.ts src/view/planLayout.test.ts` → every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(view): stage pane rectangles and plan layout maths`

---

## Task 7: Camera and blueprint scene

**Files:**
- Create: `src/view/camera.ts`
- Test: `src/view/camera.test.ts`
- Create: `src/view/blueprintScene.ts`
- Test: `src/view/blueprintScene.test.ts`

**Interfaces:**
- Consumes: `PaneRect`; `footprint`, `mapPart`; `PARTS`; types; `CONFIG`.
- Produces (`camera.ts`):
  ```ts
  export type Vec3 = readonly [number, number, number];   // plan x, plan y, height
  export interface CameraPose { position: Vec3; target: Vec3; distance: number;
    focalPx: number; fovDeg: number; aspect: number; viewOffsetX: number }
  export function computeCameraPose(room: Room, camera: CameraState, pane: PaneRect): CameraPose
  export function orbitCamera(start: CameraState, dx: number, dy: number): CameraState
  export function zoomCamera(camera: CameraState, deltaY: number): CameraState
  ```
- Produces (`blueprintScene.ts`):
  ```ts
  export interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; itemId: string; kind: Kind }
  export function buildBoxes(items: readonly Item[]): { boxes: Box[]; rugs: Box[] }
  export function frontOf(a: Box, b: Box, cam: Vec3): -1 | 0 | 1
  export function sortBoxes(boxes: readonly Box[], cam: Vec3): Box[]   // far to near
  export function makeProjector(pose: CameraPose, safeW: number, paneH: number): (p: Vec3) => [number, number]
  ```

Port from prototype lines 572–575 (pose), 408 (orbit), 730 (zoom), 463–470 (`front`),
586–599 (projection), 621–641 (boxes and ordering).

**Behavior:**

| Case | Input | Expected |
|------|-------|----------|
| Pose target | room 144×168×96 | `target = [72, 84, 33.6]` |
| Pose distance | default camera | `hypot(144,168,96) × 1.55` ≈ `373.86` |
| Pose zoom | zoom 2 | distance halves |
| Pose position | default camera | `target + distance × [cos(p)·sin(yaw), cos(p)·cos(yaw), sin(p)]` |
| Focal and FOV | pane `safeW 608, h 600` | `focalPx 750`, `fovDeg ≈ 43.60` |
| Aspect | pane `w 1000, h 600` | `1000/600` |
| View offset | pane `w 1000, safeW 608` / `safeW = w` | `196` / `0` |
| Orbit | start default, `dx 100, dy 10` | `yaw −1.45, pitch 0.61` |
| Orbit pitch clamp | `dy 1000` / `dy −1000` | `1.45` / `0.12` |
| Zoom | `deltaY −100` from 1 | `exp(0.1)` ≈ `1.1052` |
| Zoom clamp | large negative / large positive delta | `2.5` / `0.6` |
| buildBoxes parts | seed bed | 4 boxes, z from `PARTS.bed` × 38, x/y offset by item position |
| buildBoxes rotation | seed desk (rot 1) | boxes use `mapPart(…, 1)` over footprint `[26,55]` |
| buildBoxes rugs | a rug item | appears in `rugs`, not `boxes` |
| frontOf separated in x | a entirely left of b, camera left of a | a is in front (`1`) |
| frontOf no separation | overlapping boxes | `0` |
| sortBoxes | two boxes on a line from the camera | farther one first |
| sortBoxes terminates | cyclic or ambiguous set | returns all boxes exactly once |
| Projector centre | project `pose.target` | `[safeW/2, paneH/2]` |

**Verify:** `npx vitest run src/view/camera.test.ts src/view/blueprintScene.test.ts` → every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(view): shared orbit camera and blueprint scene ordering`

---

## Task 8: Product lookup

**Files:**
- Create: `src/services/productLookup.ts`
- Test: `src/services/productLookup.test.ts`
- Create: `src/services/mockProductLookup.ts`
- Test: `src/services/mockProductLookup.test.ts`

**Interfaces:**
- Consumes: `ProductPreview`, `Kind`, `ItemModel`; `CONFIG.lookupDelayMs`.
- Produces (`productLookup.ts`):
  ```ts
  export type LookupErrorCode = 'invalid_url' | 'unavailable';
  export class LookupError extends Error { readonly code: LookupErrorCode; constructor(code: LookupErrorCode) }
  export const LOOKUP_MESSAGES: Record<LookupErrorCode, string>
  export interface ParsedProductUrl { url: string; host: string; path: string }
  export function parseProductUrl(raw: string): ParsedProductUrl      // throws LookupError('invalid_url')
  export interface ProductLookup { lookup(url: string, opts?: { signal?: AbortSignal }): Promise<ProductPreview> }
  ```
- Produces (`mockProductLookup.ts`):
  `export function createMockProductLookup(opts?: { delayMs?: number }): ProductLookup`,
  `export const SAMPLE_LINKS: { sofa: string; shelf: string; unknown: string }`.

Port from prototype lines 223–231, 251, 423–440.

**Behavior:**

| Case | Input | Expected |
|------|-------|----------|
| Parse full URL | `https://www.shop.example/a/b` | `host 'shop.example'`, `path '/a/b'` |
| Parse without scheme | `shop.example/x` | accepted, `url` starts `https://` |
| Trim | leading/trailing spaces | accepted |
| Reject no dot | `localhost`, `sofa` | `LookupError` code `invalid_url` |
| Reject empty | `''`, `'   '` | `invalid_url` |
| Reject other schemes | `javascript:alert(1)`, `ftp://a.b/c`, `data:text/html,x` | `invalid_url` |
| Mock invalid | `lookup('nope')` | rejects `invalid_url` without waiting |
| Mock delay | fake timers | pending before 900 ms, resolved after |
| Keyword order | URL containing both `sofa` and `table` | sofa |
| Each keyword | `couch`, `sectional`, `desk`, `bookcase`, `shelving`, `bed`, `chair`, `rug`, `table` | matching catalogue row |
| Case-insensitive | `…/SOFA-1` | sofa |
| Known product | sofa sample | `known true`, `sourceUrl` = parsed url, `host 'shop.example'` |
| Unknown slug | `https://market.example/living/blue-thing.html` | kind `box`, name `Blue thing`, 36×24×30, `price null`, `known false` |
| Unknown numeric | `https://market.example/item/48213` | name `Untitled product` |
| Unknown empty path | `https://market.example/` | name `Untitled product` |
| Abort | `signal` aborted before delay ends | rejects with a `DOMException` named `AbortError`; timer cleared |
| Already aborted | signal aborted before call | rejects `AbortError` immediately |

**Exact values:**
- `LOOKUP_MESSAGES.invalid_url = "That doesn't look like a link. Paste the full product URL."`
- `LOOKUP_MESSAGES.unavailable = "Couldn't read that page. Try again, or enter the product by hand later."`
- Catalogue, in match order (first match wins):

  | Kind | Keyword regex | Name | W × D × H (in) | Price |
  |---|---|---|---|---|
  | sofa | `sofa\|couch\|sectional` | Alder 3-seat sofa | 84 × 36 × 33 | 1290 |
  | desk | `desk` | Tack writing desk | 55 × 26 × 30 | 420 |
  | shelf | `shelf\|bookcase\|shelving` | Girder bookshelf | 36 × 13 × 78 | 310 |
  | bed | `bed` | Low platform bed, queen | 64 × 85 × 38 | 890 |
  | chair | `chair` | Brace lounge chair | 30 × 32 × 31 | 540 |
  | rug | `rug` | Flatweave rug | 60 × 96 × 0.5 | 340 |
  | table | `table` | Slab coffee table | 44 × 24 × 16 | 260 |
- Models: sofa, desk, bed → `{tier:'retailer', label:'3D model from retailer'}`;
  shelf, chair, rug, table → `{tier:'generated', label:'Model built from photos'}`;
  unknown → `{tier:'box', label:'No model, shown as a sized box'}`; `assetUrl: null` for all.
- `SAMPLE_LINKS`: `https://shop.example/living/alder-3-seat-sofa`,
  `https://shop.example/storage/girder-bookshelf`, `https://market.example/item/48213`.
- The keyword regex is tested against the whole normalised URL, as in the prototype.

**Verify:** `npx vitest run src/services` → every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(services): product lookup interface and mock provider`

---

## Task 9: Stores

**Files:**
- Create: `src/state/planStore.ts`
- Create: `src/state/uiStore.ts`
- Create: `src/state/actions.ts`
- Create: `src/state/selectors.ts`
- Test: `src/state/stores.test.ts`

**Interfaces:**
- Consumes: `createInitialDocument(): PlanDocument`; `moveItem`, `rotateItem`,
  `centrePosition`; `findConflicts(items, room): Conflicts`; `LookupErrorCode`;
  types; `CONFIG`.
- Produces (`planStore.ts`): `export const usePlanStore` (Zustand `create`) with state
  `PlanDocument` plus:
  `setUnits(units: Units): void`, `setRoomDim(axis: RoomAxis, inches: number): void`,
  `addItem(preview: ProductPreview): string` (returns new id),
  `moveItemTo(id: string, x: number, y: number): void`, `rotateItem(id: string): void`,
  `removeItem(id: string): void`, `reset(doc?: PlanDocument): void`.
- Produces (`uiStore.ts`): `export const useUiStore` with state
  ```ts
  selectedId: string | null; layout: LayoutMode; insetSwapped: boolean; tab: StageTab;
  renderStyle: RenderStyle; camera: CameraState; webglAvailable: boolean;
  lookup: { status: 'idle' } | { status: 'loading'; host: string }
        | { status: 'preview'; product: ProductPreview }
        | { status: 'error'; code: LookupErrorCode };
  ```
  and actions `select(id: string | null)`, `setLayout(l: LayoutMode)`, `toggleInsetSwap()`,
  `setTab(t: StageTab)`, `setRenderStyle(r: RenderStyle)`, `setCamera(c: CameraState)`,
  `setLookup(l: UiState['lookup'])`, `updatePreviewDim(axis: 'w' | 'd' | 'h', inches: number)`,
  `markWebglUnavailable()`, `reset()`. Export `type UiState`.
- Produces (`actions.ts`): `rotateSelected(): void`, `removeSelected(): void`,
  `placePreview(): void`, `nudgeSelected(dx: number, dy: number): void` (inches).
- Produces (`selectors.ts`): `useConflicts(): Conflicts` (memoized on `items` and
  `room` identity), `useSelectedItem(): Item | null`, `totalPrice(items: readonly Item[]): number`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Initial plan | fresh store | equals `createInitialDocument()` |
| Initial UI | fresh store | `selectedId null`, `layout 'inset'`, `insetSwapped false`, `tab '2d'`, `renderStyle 'realistic'`, camera `CONFIG.camera`, `webglAvailable true`, lookup idle |
| setUnits | `'m'` | units change; room and items deep-equal before |
| setRoomDim | `('w', 120)` | `room.w 120`; items untouched (not re-clamped) |
| addItem | sofa preview | appended at `centrePosition`, `rot 0`, id is a non-empty unique string, `sourceUrl` and `model` copied from preview |
| addItem ids unique | add twice | two different ids |
| moveItemTo | bed to `(200,-3)` | `x 80, y 0` |
| moveItemTo unknown id | `'nope'` | state unchanged, no throw |
| rotateItem | `'seed-desk'` | `rot 2, x 89, y 119` |
| removeItem | `'seed-bed'` | one item left |
| updatePreviewDim | lookup in preview, `('w', 90)` | `product.w 90`; no-op when not in preview |
| markWebglUnavailable | — | `webglAvailable false`, `renderStyle 'blueprint'` |
| setRenderStyle blocked | `'realistic'` while `webglAvailable false` | stays `'blueprint'` |
| rotateSelected / removeSelected | nothing selected | no-op |
| removeSelected | desk selected | item removed, `selectedId null` |
| placePreview | lookup in preview | item added, `selectedId` = new id, lookup `idle` |
| placePreview not in preview | lookup idle | no-op |
| nudgeSelected | bed selected (x 40, y 0), `(1, 0)` then `(0, 12)` | `x 41, y 0` then `x 41, y 12` |
| nudgeSelected clamps | bed selected, `(0, -5)` / `(500, 0)` | `y 0` / `x 80` |
| nudgeSelected no selection | nothing selected | no-op |
| totalPrice | seed items; item with `price null` | `1310`; null counts as 0 |
| useConflicts stable | re-render with unchanged items and room | same object reference |

**Exact values:** new ids come from `crypto.randomUUID()`.

**Verify:** `npx vitest run src/state/stores.test.ts` → every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(state): plan document store, UI store and cross-store actions`

---

## Task 10: Hooks and UI primitives

**Files:**
- Create: `src/hooks/startDrag.ts`
- Create: `src/hooks/useElementSize.ts`
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Test: `src/hooks/useKeyboardShortcuts.test.tsx`
- Create: `src/styles/tokens.ts`
- Test: `src/styles/tokens.test.ts`
- Create: `src/components/ui/Segmented.tsx`
- Create: `src/components/ui/BlueprintCorners.tsx`
- Test: `src/components/ui/ui.test.tsx`

**Interfaces:**
- Consumes: `useUiStore`, `rotateSelected()`, `removeSelected()`,
  `nudgeSelected(dx, dy)`; `CONFIG.nudgeStep`, `CONFIG.nudgeStepLarge`.
- Produces:
  - `startDrag(e: React.PointerEvent, onMove: (dx: number, dy: number) => void, onEnd?: () => void): void`
    — calls `preventDefault` and `stopPropagation`, tracks `pointermove`/`pointerup`/`pointercancel` on `window`, removes listeners on end.
  - `useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }]`
    — `ResizeObserver`; ignores changes of 1 px or less; initial `{800, 560}`.
  - `useKeyboardShortcuts(): void` — window `keydown` listener, removed on unmount.
  - `Segmented<T extends string>(props: { name: string; value: T; options: readonly { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; className?: string; style?: React.CSSProperties; 'aria-label': string })`
    — markup `<div class="seg" role="radiogroup"><label class="seg-opt"><input type="radio" …/>label</label>…</div>`.
  - `tokens.ts`: `export interface Tokens { bg: string; text: string; n100: string; n200: string; a100: string; a200: string; a300: string; a400: string; a700: string }`,
    `export function readTokens(): Tokens | null` — reads the CSS variables
    `--color-bg`, `--color-text`, `--color-neutral-100`, `--color-neutral-200`,
    `--color-accent-100`, `-200`, `-300`, `-400`, `-700` from `document.documentElement`
    with `getComputedStyle`; returns null while `--color-text` is empty.
  - `BlueprintCorners(): JSX.Element` — the four `<i class="corner tl|tr|bl|br" aria-hidden="true">`.

Port key rules from prototype lines 275–281, 380–386.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| R rotates | item selected, key `r` or `R` on body | `rotateSelected` effect observed in store |
| Delete removes | `Delete` or `Backspace` | item removed |
| Escape deselects | `Escape` | `selectedId null` |
| No selection | any of the keys | nothing changes |
| Focus in text input | `Backspace` with focus in `<input type="text">` or `type="number"`, `<textarea>`, `<select>` | ignored |
| Focus in radio | `r` with focus on a segmented radio | handled |
| Modifier keys | `Cmd+R` / `Ctrl+R` | ignored (browser reload must not rotate) |
| Arrow nudge | bed selected, `ArrowRight` / `ArrowLeft` / `ArrowDown` / `ArrowUp` | `nudgeSelected(1,0)` / `(-1,0)` / `(0,1)` / `(0,-1)` effect in the store; `defaultPrevented` true |
| Shift nudge | `Shift+ArrowRight` | moves 12 in |
| Arrows in any input | arrow key with focus in a text, number or radio input | ignored, so segmented controls keep native arrow behaviour |
| Arrows, no selection | arrow key, nothing selected | nothing changes; default not prevented |
| Tokens read | CSS variables set on `documentElement` | `readTokens()` returns them trimmed |
| Tokens not ready | `--color-text` unset | `readTokens()` returns `null` |
| Segmented renders | 3 options, value = 2nd | 3 radios, 2nd checked, same `name` |
| Segmented change | click 3rd | `onChange` called once with 3rd value |
| Segmented disabled | option `disabled` | radio disabled, not selectable |
| Corners | render | exactly 4 `i.corner`, classes tl, tr, bl, br |

**Verify:** `npx vitest run src/hooks src/components/ui src/styles` → every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(ui): drag, size and keyboard hooks, segmented control`

---

## Task 11: Header and room section

**Files:**
- Create: `src/components/Header.tsx`
- Create: `src/components/Sidebar/RoomSection.tsx`
- Create: `src/components/Sidebar/sidebar.css`
- Test: `src/components/Sidebar/RoomSection.test.tsx`

**Interfaces:**
- Consumes: `usePlanStore` (`units`, `room`, `setUnits`, `setRoomDim`);
  `roomInputStr`, `parseRoomInput`, `fmtArea`, `roomUnitLabel`, `roomInputStep`;
  `Segmented`.
- Produces: `Header(): JSX.Element`; `RoomSection(): JSX.Element` (a `<section>`).
  `sidebar.css` defines `.sidebar`, `.sidebar-section`, `.sidebar-heading`,
  `.sidebar-heading-num`, `.field-grid-3`, `.input-suffix-wrap`, `.input-suffix`,
  `.note` (12px muted) for reuse by Tasks 12 and 13.

Visual contract: README "Layout" and "01 Room"; exact markup in prototype lines 17–41.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Header | render | brand `Room planner`, label `Units`, segmented `ft / in` \| `m / cm` bound to `units` |
| Units toggle | click `m / cm` | `units 'm'`; stored room unchanged |
| Heading | render | `01` in `.sidebar-heading-num`, then `Room` |
| Room inputs initial | ft | values `12`, `14`, `8`; suffix `ft`; step `0.25`; labels `Width`, `Length`, `Ceiling` |
| Room inputs metric | units `m` | values `3.66`, `4.27`, `2.44`; suffix `m`; step `0.05` |
| Typing valid | Width → `10` | `room.w 120` immediately |
| Typing partial | Width → `10.` | input shows `10.`; `room.w 120` |
| Typing out of range | Width → `2` | room unchanged; input still shows `2` |
| External room change | `setRoomDim('w', 150)` from outside | Width input shows `12.5` |
| Area line | initial | `Floor area 168 sq ft. You can also drag the room's edge handles on the plan.` |
| Area metric | units `m` | `Floor area 15.6 m². …` |

**Exact values:** each input has a `<label htmlFor>`; the unit suffix is
`aria-hidden="true"`. Draft strings are component state, re-seeded when `units` or
the stored value changes to something the draft does not parse to.

**Verify:** `npx vitest run src/components/Sidebar/RoomSection.test.tsx` → every test
passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(sidebar): header with units toggle and room inputs`

---

## Task 12: Add-furniture section

**Files:**
- Create: `src/components/Sidebar/AddFurnitureSection.tsx`
- Create: `src/components/Sidebar/addFurniture.css`
- Test: `src/components/Sidebar/AddFurnitureSection.test.tsx`

**Interfaces:**
- Consumes: `useUiStore` (`lookup`, `setLookup`, `updatePreviewDim`), `usePlanStore`
  (`units`), `placePreview()`; `ProductLookup`, `parseProductUrl`, `LookupError`,
  `LOOKUP_MESSAGES`, `SAMPLE_LINKS`; `furnInputStr`, `parseFurnInput`, `fmtMoney`,
  `furnUnitLabel`; `BlueprintCorners`; classes from `sidebar.css` (Task 11).
- Produces: `AddFurnitureSection(props: { lookup: ProductLookup }): JSX.Element`.

Visual contract: README "02 Add furniture from a link"; exact markup in prototype
lines 43–91. Tests use a fake `ProductLookup` whose promises the test resolves.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Heading | render | `02` then `Add furniture from a link` |
| Idle | lookup idle | text `No link handy? Try a sample:` and buttons `Sofa`, `Bookshelf`, `Page without sizes` |
| Fetch invalid | type `nope`, click `Fetch` | error line `LOOKUP_MESSAGES.invalid_url`; provider not called |
| Error clears | type after an error | error line removed |
| Fetch valid | click `Sofa` | provider called with `SAMPLE_LINKS.sofa`; loading card kicker `shop.example`, body `Reading the product page for name, size and price…`; `Fetch` disabled; sample buttons hidden |
| Enter key | Enter in the link input | same as clicking `Fetch` |
| Preview | provider resolves the sofa | card shows `shop.example`, `Alder 3-seat sofa`, `$1,290`, tag `3D model from retailer`; inputs `Width (in)` `84`, `Depth (in)` `36`, `Height (in)` `33`; buttons `Place in room`, `Discard` |
| Preview unknown | provider resolves `known false`, `price null` | note `This page didn't list dimensions. Enter them from the product description.`; price `No price` |
| Preview edit | Width → `90` | `lookup.product.w 90` |
| Preview edit invalid | Width → `0` | `product.w` unchanged; input shows `0` |
| Preview units toggle | units → `m` during preview | labels `(cm)`, values `213`, `91`, `84` |
| Place | click `Place in room` | one item added and selected; lookup idle; link field empty |
| Discard | click `Discard` | lookup idle; link field empty; no item added |
| Provider failure | provider rejects with `new Error('x')` | error line `LOOKUP_MESSAGES.unavailable`; idle controls shown |
| Stale response | start A, then start B before A settles | A's `signal.aborted` is true; resolving A afterwards changes nothing; B's result is shown |
| Abort is silent | provider rejects with `AbortError` | no error line |
| Unmount mid-lookup | unmount while loading | signal aborted; no store update afterwards |
| Text safety | preview name `<img src=x onerror=alert(1)>` | shown as literal text; `container.querySelector('img')` is null |

**Exact values:** photo placeholder is the 64×64 hatched box with text `photo`
(prototype line 69), `aria-hidden="true"`. The link input has
`aria-label="Product link"` and placeholder `Paste a product link`. The error line has
`role="alert"`.

**Verify:** `npx vitest run src/components/Sidebar/AddFurnitureSection.test.tsx` →
every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(sidebar): product link lookup flow with preview and placement`

---

## Task 13: Item list and sidebar assembly

**Files:**
- Create: `src/components/Sidebar/ItemList.tsx`
- Create: `src/components/Sidebar/itemList.css`
- Create: `src/components/Sidebar/Sidebar.tsx`
- Test: `src/components/Sidebar/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `RoomSection(): JSX.Element`;
  `AddFurnitureSection(props: { lookup: ProductLookup }): JSX.Element`;
  `usePlanStore`, `useUiStore` (`selectedId`, `select`), `useConflicts()`,
  `totalPrice(items)`; `fmtFurnDims`, `fmtMoney`; `ProductLookup`.
- Produces: `ItemList(): JSX.Element`;
  `Sidebar(props: { lookup: ProductLookup }): JSX.Element` — an
  `<aside class="sidebar">` rendering `RoomSection`, `AddFurnitureSection`,
  `ItemList` in that order.

Visual contract: README "03 In this room"; exact markup in prototype lines 93–113.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Heading | render | `03` then `In this room` |
| Rows | initial doc | two `<button>` rows; first shows `Low platform bed, queen`, `$890`, `64 × 85 × 38 in` |
| Row select | click the desk row | `selectedId 'seed-desk'`; row has `aria-pressed="true"` and the selected class |
| Row conflict | desk moved onto the bed | tag `Overlaps Low platform bed, queen` under the desk row |
| No conflict tag | initial | no tag elements in rows |
| Empty | no items | `Nothing placed yet.` |
| Total | initial / item with `price null` added | `$1,310` / still `$1,310` |
| Total label | render | `Total, nothing bought yet` |
| Metric dims | units `m` | first row dims `163 × 216 × 97 cm` |
| Section order | `Sidebar` render | headings in DOM order `01`, `02`, `03` |
| Text safety | item named `<b>x</b>` | literal text; no `b` element inside the row |

**Verify:** `npx vitest run src/components/Sidebar/Sidebar.test.tsx` → every test
passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(sidebar): item list with conflicts and total, sidebar assembly`

---

## Task 14: Plan view

**Files:**
- Create: `src/components/Stage/PlanView.tsx`
- Create: `src/components/Stage/InsetFrame.tsx`
- Create: `src/components/Stage/stage.css`
- Test: `src/components/Stage/PlanView.test.tsx`

**Interfaces:**
- Consumes: `PaneRect`; `computePlanLayout(room, pane): PlanLayout`;
  `computeClearances(item, room, layout, units): ClearanceLine[]`; `footprint`,
  `mapPart`, `snapRoomDim`; `PARTS`; `fmtLen`, `fmtFurnDims`, `gridStepInches`;
  `usePlanStore`, `useUiStore`, `useConflicts()`; `startDrag`; `BlueprintCorners`;
  `CONFIG`.
- Produces:
  - `PlanView(props: { pane: PaneRect }): JSX.Element` — fills its parent; draws
    dimension lines, room, items, clearances and handles.
  - `InsetFrame(props: { label: 'Plan' | '3D'; onSwap: () => void }): JSX.Element`
    — corner marks, the 10px uppercase label top-left and the `Swap` button
    top-right. Rendered by the Stage (Task 18) inside whichever pane is the inset.

Visual contract: README "Plan pane (2D)"; exact styles in prototype lines 136–173 and
679–699. Tests pass a fixed `pane` so pixel positions are deterministic.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Items rendered | initial doc, pane `{w:1000,h:600,safeW:608,inset:false}` | two `[data-item-id]` boxes at `left = ox + x·scale`, `top = oy + y·scale`, sized footprint × scale |
| Dimension labels | initial, ft | `12′ 0″` and `14′ 0″` present |
| Dimension offset | main pane / inset pane | lines 30 px / 22 px outside the room |
| Grid | ft / m | room `background-size` `12·scale` px / `(50/2.54)·scale` px |
| Item label threshold | box larger than 84×38 px / not | name and dims rendered / not rendered |
| Part hairlines | bed / shelf | 4 inner outlines / none |
| Selected style | selected item | class `is-selected`; z-index 4 |
| Conflict style | conflicting, unselected | class `is-conflict` |
| Rug | rug item | class `is-rug`; z-index 1 (others 2) |
| Pointer down on item | `pointerdown` on the desk | `selectedId 'seed-desk'` |
| Drag | `pointerdown` on bed, then `pointermove` by `(+28.095, +56.19)` px at scale 2.8095 | bed at `x 50, y 20` |
| Drag clamps | move far right | `x = room.w − footprintW` |
| Empty click | `pointerdown` on the pane background | `selectedId null` |
| Clearances | bed selected | one line per result of `computeClearances`; chip text equals its `label`; chip absent when `showLabel false` |
| Clearances hidden | selected item is `Outside the room` | no clearance elements |
| Width handle | drag the right handle `+84.285` px at scale 2.8095 | `room.w 174` (144 + 30) |
| Frozen layout | during a handle drag | room box `left`/`top` and scale unchanged from drag start; after `pointerup` the layout is recomputed |
| Length handle | drag the bottom handle | `room.l` changes by `snapRoomDim` of the scaled delta |
| Handle titles | render | `title` `Drag to change width` and `Drag to change length` |
| InsetFrame | render with `label 'Plan'` | text `Plan`, button `Swap`; clicking calls `onSwap` once and does not fire the parent's `pointerdown` handler |

**Exact values:** CSS classes `is-selected` (2px `--color-accent` border),
`is-conflict` (1.5px dashed `--color-text` border, 45° hatch from prototype line 686),
`is-rug` (fill `color-mix(in srgb, var(--color-accent) 14%, var(--color-bg))`).
Handles: 12×32 and 32×12, 1.5px `--color-accent` border, hover
`--color-accent-200`. Items: `touch-action: none`, `cursor: grab`,
`role="button"`, `aria-label` = item name, `aria-pressed` = selected. Room handles
are pointer-only in this slice; the sidebar inputs are the keyboard route.

**Verify:** `npx vitest run src/components/Stage/PlanView.test.tsx` → every test
passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(stage): interactive 2D plan view`

---

## Task 15: 3D models

**Files:**
- Create: `src/three/roomMesh.ts`
- Create: `src/three/furnitureModels.ts`
- Create: `src/three/modelSource.ts`
- Test: `src/three/roomMesh.test.ts`
- Test: `src/three/furnitureModels.test.ts`
- Test: `src/three/modelSource.test.ts`

**Interfaces:**
- Consumes: `Tokens` from `src/styles/tokens.ts`; `LOOKS`, `LINEN`, `BOOK_COLOURS`;
  `Item`, `Room`, `Kind`.
- Produces:
  - `roomMesh.ts`: `buildRoom(room: Room, tokens: Tokens, floorMap: THREE.Texture | null): THREE.Group`;
    `createFloorTexture(room: Room): THREE.CanvasTexture | null` (null when a 2D
    canvas context is unavailable, as in jsdom).
  - `furnitureModels.ts`: `buildFurniture(item: Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h'>): THREE.Group`
    — origin at the footprint centre on the floor; x = width, z = depth, y = height;
    `group.userData.outline` is a hidden `THREE.LineSegments`.
    `hashSeed(id: string): number`.
  - `modelSource.ts`: `modelKey(item: Item): string`; `resolveModel(item: Item): THREE.Group`
    (always `buildFurniture` today; a comment marks where an `assetUrl` GLB would be
    returned instead).

Port from prototype lines 486–546, adapting to three 0.187. These modules build
objects only; they create no renderer, so they run under jsdom.

**Behavior:**

| Case | Input | Expected |
|------|-------|----------|
| Room meshes | `buildRoom({w:144,l:168,h:96}, tokens, null)` | 5 meshes: one floor, four walls |
| Floor | same | plane 144×168 at `(72, 0, 84)`, rotated flat, `receiveShadow true` |
| Walls inward | same | each wall's world normal points toward the room centre; material `side` is `FrontSide`; `castShadow false`, `receiveShadow true` |
| Wall colour | tokens `n100 '#f5f5f8'` | wall material colour equals it |
| Floor map | pass a texture | floor material `map` is that texture |
| Floor texture in jsdom | `createFloorTexture(room)` | returns `null` without throwing |
| Model bounds | `buildFurniture` for each `Kind` at its catalogue size (box: 36×24×30) | bounding box of meshes, outline excluded, lies within `w × h × d` (0.01 tolerance) and spans ≥ 95% of each axis; rug: full w and d, height ≤ 0.5 |
| Model origin | each kind | bounds centred on x and z at 0 (0.01 tolerance); min y ≥ 0 |
| Shadows | non-rug meshes / rug meshes | `castShadow true` / `false`; all `receiveShadow true` |
| Outline | each kind | `userData.outline.visible false`; box `(w+1.2) × (h+0.6) × (d+1.2)` centred at `y = h/2 + 0.3` |
| Shelf determinism | same id twice / two different ids | equal mesh counts and positions / both valid |
| hashSeed | `'seed-bed'`, a UUID, `''` | integer in `1..2147483646`; same input gives same output |
| modelKey stable | change `x`, `y`, `rot`, `name`, `price` | same key |
| modelKey changes | change `kind`, `w`, `d`, `h` or `model.assetUrl` | different key |
| resolveModel | seed bed | group equivalent to `buildFurniture(seed bed)` (same mesh count) |

**Exact values:** floor texture — 512² canvas, 8 rows of 64 px, seed 7, LCG
`seed = (seed × 16807) % 2147483647` (prototype lines 488–495);
`colorSpace = SRGBColorSpace`, wrap repeat, repeat `(W/64, L/64)`, anisotropy 4;
floor roughness 0.75. Walls roughness 1. Material roughness: default 0.92, wood 0.6,
metal 0.5, books 0.85. Outline material `LineBasicMaterial` (colour set by the
renderer in Task 16).

**Verify:** `npx vitest run src/three/roomMesh.test.ts src/three/furnitureModels.test.ts src/three/modelSource.test.ts`
→ every test passes, 0 skipped, at least one test per behaviour row.
**Commit:** `feat(three): room mesh and parametric furniture models`

---

## Task 16: Scene renderer and realistic view

**Files:**
- Create: `src/three/SceneRenderer.ts`
- Create: `src/components/Stage/ThreeView.tsx`
- Test: `src/three/SceneRenderer.test.ts`
- Test: `src/components/Stage/ThreeView.test.tsx`

**Interfaces:**
- Consumes: `buildRoom(room, tokens, floorMap)`, `createFloorTexture(room)`;
  `modelKey(item)`, `resolveModel(item)`; `Tokens`, `readTokens(): Tokens | null`;
  `PaneRect`; `CameraPose`, `computeCameraPose(room, camera, pane)`,
  `orbitCamera(start, dx, dy)`, `zoomCamera(camera, deltaY)`; `footprint`;
  `usePlanStore`, `useUiStore` (`camera`, `setCamera`, `selectedId`,
  `markWebglUnavailable`), `useConflicts()`; `startDrag`; `CONFIG`.
- Produces:
  ```ts
  export interface SceneInput { room: Room; items: readonly Item[]; selectedId: string | null;
    conflicts: Conflicts; pose: CameraPose; width: number; height: number; pixelRatio: number }
  export type RendererLike = Pick<THREE.WebGLRenderer,
    'setPixelRatio' | 'setSize' | 'render' | 'dispose' | 'shadowMap' | 'outputColorSpace'>
  export class SceneRenderer {
    constructor(canvas: HTMLCanvasElement, tokens: Tokens,
      createRenderer?: (canvas: HTMLCanvasElement) => RendererLike); // default builds THREE.WebGLRenderer; throws if WebGL is unavailable
    update(input: SceneInput): void;   // sync scene, then render exactly once
    dispose(): void;
  }
  ```
  `ThreeView.tsx`: `export default function ThreeView(props: { pane: PaneRect }): JSX.Element`.

Port from prototype lines 474–485 and 547–577. `SceneRenderer.test.ts` injects a fake
`createRenderer` whose `render(scene, camera)` records its arguments, and asserts on
the recorded scene and camera. `ThreeView.test.tsx` replaces `SceneRenderer` with
`vi.mock`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Renderer setup | construct with fake | `outputColorSpace = SRGBColorSpace`; `shadowMap.enabled true`; `shadowMap.type = PCFShadowMap` (amended 2026-11-12: three 0.187 removed `PCFSoftShadowMap` and warns at runtime; `PCFShadowMap` with `shadow.radius` gives the soft result) |
| Lights | first `update` | scene has one `HemisphereLight` and one `DirectionalLight` with `castShadow true` at the exact values below |
| One render per update | `update()` called once | fake `render` called exactly once |
| Item transform | seed desk (rot 1, footprint 26×55 at 118,104) | its group at `(131, 0, 131.5)`, `rotation.y = −π/2` |
| Group cache | second `update` with the desk moved | same group object in the scene; position updated |
| Group rebuild | second `update` with desk `w` changed | different group object; old one no longer in the scene |
| Item removed | second `update` without the desk | its group is not in the scene |
| Room rebuild | room dims change / unchanged | room group replaced / same object |
| Sun follows room | room 144×168×96 | sun at `(0, 230.4, 235.2)`, target `(72, 0, 84)`; shadow camera `±(hypot(144,168)/2 + 24)` |
| Outline selected | `selectedId` = desk | desk outline visible, colour `tokens.a700` |
| Outline conflict | desk in `conflicts`, not selected | visible, colour `tokens.text` |
| Outline none | neither | hidden |
| Camera | pose from `computeCameraPose` | camera `fov = pose.fovDeg`, `aspect = pose.aspect`; position = `(pose.position[0], pose.position[2], pose.position[1])` |
| View offset | `pose.viewOffsetX 196` / `0` | `camera.view.offsetX 196` and `enabled` / `camera.view` null or disabled |
| Resize | `width`/`height`/`pixelRatio` change / unchanged | `setPixelRatio` and `setSize(w, h, false)` called / not called again |
| Dispose | `dispose()` | fake `dispose` called once; scene emptied |
| ThreeView mounts | tokens ready | one `SceneRenderer` constructed; `update` called with store state |
| ThreeView pixel ratio | `devicePixelRatio 3` | `pixelRatio 2` passed |
| ThreeView redraw | store change | at most one `update` per animation frame |
| Orbit | `pointerdown` on canvas, move `(100, 10)` | `setCamera` with `yaw −1.45, pitch 0.61` |
| Wheel | wheel `deltaY −100` | `zoom ≈ 1.1052`; the event's `defaultPrevented` is true |
| WebGL unavailable | `SceneRenderer` constructor throws | `markWebglUnavailable()` called once; component renders without throwing |
| Context lost | `webglcontextlost` on the canvas | `markWebglUnavailable()` called |
| Unmount | unmount | `dispose()` called once; no `update` afterwards |
| Tokens not ready | `readTokens()` null on first frame, ready on the next | no renderer until tokens are ready, then one is created |
| Real WebGL output **(live)** | browser | checked in Task 20, rows L1, L5, L13, L14 |

**Exact values:**
- Default renderer: `new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })`.
- `HemisphereLight(0xffffff, 0xd8d2c8, CONFIG.hemiIntensity)`;
  `DirectionalLight(0xffffff, CONFIG.sunIntensity)` at `(0, 2.4·H, 1.4·L)` targeting
  `(W/2, 0, L/2)`; shadow map 2048², `bias −0.0006`, `normalBias 0.4`, `radius 3`;
  shadow camera near 1, far `hypot(W, L, H) × 5`.
- Camera: `near 1`, `far = pose.distance × 5`, `lookAt` the pose target mapped the
  same way as position. View offset call:
  `setViewOffset(width, height, viewOffsetX, 0, width, height)`.
- The wheel listener is attached with `{ passive: false }`.
- Light intensities are read from `CONFIG` only. This task does not tune them; Task 20
  owns tuning.

**Verify:** `npx vitest run src/three/SceneRenderer.test.ts src/components/Stage/ThreeView.test.tsx`
→ every test passes, 0 skipped, at least one test per non-live behaviour row.
**Commit:** `feat(three): on-demand scene renderer and realistic 3D view`

---

## Task 17: Blueprint 3D

**Files:**
- Create: `src/view/blueprintDraw.ts`
- Create: `src/components/Stage/BlueprintView.tsx`
- Test: `src/view/blueprintDraw.test.ts`
- Test: `src/components/Stage/BlueprintView.test.tsx`

**Interfaces:**
- Consumes: `Tokens` (type-only import), `readTokens(): Tokens | null`; `CameraPose`,
  `computeCameraPose`, `orbitCamera`, `zoomCamera`; `buildBoxes(items)`,
  `sortBoxes(boxes, cam)`, `makeProjector(pose, safeW, paneH)`, `Box`; `footprint`;
  `fmtLen`, `gridStepInches`; `usePlanStore`, `useUiStore`, `useConflicts()`;
  `startDrag`; `PaneRect`; `CONFIG`.
- Produces:
  - `blueprintDraw.ts`:
    ```ts
    export interface BlueprintInput { room: Room; items: readonly Item[]; selectedId: string | null;
      conflicts: Conflicts; units: Units; pose: CameraPose; width: number; safeW: number;
      height: number; tokens: Tokens }
    export function drawBlueprint(g: CanvasRenderingContext2D, input: BlueprintInput): void
    ```
    It receives the context as a parameter and touches no globals.
  - `BlueprintView(props: { pane: PaneRect }): JSX.Element`.

Port from prototype lines 578–666. `blueprintDraw.test.ts` passes a recording fake
context (an object that logs every method call and property set in order) and asserts
on the log. `BlueprintView.test.tsx` stubs `HTMLCanvasElement.prototype.getContext`
to return such a fake.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Clears first | any | first drawing call is `clearRect(0, 0, width, height)` |
| Floor | initial doc | first fill uses `tokens.n100`; its stroke uses `tokens.text`, `lineWidth 1.5` |
| Grid | ft, room 144×168 | 11 + 13 grid lines stroked at `globalAlpha 0.09` |
| Grid metric | m | lines every `50/2.54` in: 7 + 8 |
| Far walls | default camera | two walls filled `tokens.a100` at alpha 0.6, then outlined `tokens.text` |
| Near walls | default camera | two walls stroked with `setLineDash([4, 5])` at alpha 0.35, no fill, drawn after all boxes |
| Draw order | doc with a rug and the seed items | rug faces drawn before any non-rug box face; labels drawn last |
| Face culling | camera above and in front | each box draws its top face and only the side faces toward the camera (at most 3 faces per box) |
| Default faces | unselected box | top `tokens.bg`, sides `tokens.n200` and `tokens.a200`; stroke `tokens.text`, `lineWidth 1` |
| Rug top | rug | top `tokens.a100` |
| Selected box | desk selected | stroke `tokens.a700`, `lineWidth 1.6`; top `a200`, sides `a300` and `a400` |
| Conflict box | desk conflicting | its faces stroked with `setLineDash([5, 4])` |
| Room labels | initial, ft | `fillText` called with `12′ 0″`, `14′ 0″`, `8′ 0″` |
| Selected label | desk selected | `fillText` with `Tack writing desk · 2′ 6″ tall` on a `tokens.a700` chip |
| Canvas size | pane 1000×600, `devicePixelRatio 3` | canvas `width 2000`, `height 1200`; context transformed by 2 |
| Redraw | store change | at most one `drawBlueprint` call per animation frame |
| Orbit | `pointerdown` on canvas, move `(100, 10)` | `setCamera` with `yaw −1.45, pitch 0.61` |
| Wheel | wheel `deltaY −100` | `zoom ≈ 1.1052`; `defaultPrevented` true |
| Tokens not ready | `readTokens()` null, then ready | no draw, then one draw |
| Fonts | `document.fonts.ready` resolves | one extra redraw |
| Real canvas output **(live)** | browser | checked in Task 20, rows L6, L13, L14 |

**Exact values:** label font `600 13px "Barlow Condensed", system-ui, sans-serif`,
chip height 20, chip width = text width + 12, `textAlign 'center'`,
`textBaseline 'middle'`. Label positions: prototype lines 660–665.

**Verify:** `npx vitest run src/view/blueprintDraw.test.ts src/components/Stage/BlueprintView.test.tsx`
→ every test passes, 0 skipped, at least one test per non-live behaviour row.
**Commit:** `feat(stage): blueprint line-drawing 3D view`

---

## Task 18: Stage

**Files:**
- Create: `src/components/Stage/Stage.tsx`
- Create: `src/components/Stage/stageShell.css`
- Test: `src/components/Stage/Stage.test.tsx`

**Interfaces:**
- Consumes: `computePanes(sw, sh, layout, tab, insetSwapped): Panes`, `PaneRect`;
  `PlanView(props: { pane: PaneRect })`, `InsetFrame(props: { label: 'Plan' | '3D'; onSwap: () => void })`;
  default export `ThreeView(props: { pane: PaneRect })` loaded with `React.lazy`;
  `BlueprintView(props: { pane: PaneRect })`;
  `useElementSize<T>(): [RefObject<T | null>, { width: number; height: number }]`;
  `Segmented`; `useUiStore` (`layout`, `tab`, `insetSwapped`, `renderStyle`,
  `webglAvailable`, `toggleInsetSwap`, `setRenderStyle`, `markWebglUnavailable`).
- Produces: `Stage(): JSX.Element` — no props. Measures its own root element with
  `useElementSize` and positions the panes.

Visual contract: README "Stage"; prototype lines 134–196 and 673–675. Tests replace
`ThreeView` and `BlueprintView` with `vi.mock` stubs that render a marker element.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Inset placement | size 1000×600, layout `inset` | plan pane style `left 624px; top 320px; width 360px; height 264px; z-index 8`; 3D pane fills the stage |
| Inset pane style | inset pane | class `pane-inset` (1px `--color-text` border, `--color-bg` background, `--shadow-md`); contains `InsetFrame` with label `Plan` |
| Swap | click `Swap` | `insetSwapped true`; 3D pane becomes the inset with label `3D`; `selectedId` unchanged |
| Split | layout `split`, width 1001 | plan `left 0; width 500px`; 3D `left 500px; width 501px` with class `pane-divider` |
| Tabs | layout `tabs`, tab `2d` / `3d` | only the plan pane / only the 3D pane is in the DOM |
| Render control shown | 3D pane is main | segmented `Realistic` \| `Blueprint`, `Realistic` checked |
| Render control hidden | 3D pane is the inset | control absent |
| Style switch | choose `Blueprint` | blueprint marker present, realistic marker absent |
| Lazy 3D | first render | `Suspense` fallback is empty; plan pane is present before the lazy chunk resolves |
| WebGL unavailable | `webglAvailable false` | blueprint marker shown; `Realistic` radio disabled; note `3D rendering isn't available in this browser. Showing the blueprint view.` |
| Error boundary | `ThreeView` stub throws on render | `markWebglUnavailable()` called; blueprint marker shown; no uncaught error |
| Resize | element size changes | pane styles recomputed from the new size |

**Exact values:** the render-style control sits at `left: var(--space-4); top: var(--space-4)`,
`z-index 9`, `background: var(--color-bg)`. The stage root is
`position: relative; overflow: hidden; min-height: 0`. The WebGL note has
`role="status"`.

**Verify:** `npx vitest run src/components/Stage/Stage.test.tsx` → every test passes,
0 skipped, at least one test per behaviour row.
**Commit:** `feat(stage): pane layouts, swap, render style and WebGL fallback`

---

## Task 19: Bars and app shell

**Files:**
- Create: `src/components/TopBar.tsx`
- Create: `src/components/SelectionBar.tsx`
- Test: `src/components/bars.test.tsx`
- Test: `src/App.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: `Header(): JSX.Element`; `Sidebar(props: { lookup: ProductLookup })`;
  `Stage(): JSX.Element`; `createMockProductLookup(): ProductLookup`;
  `useKeyboardShortcuts(): void`; `Segmented`; `usePlanStore`, `useUiStore`,
  `useConflicts()`, `useSelectedItem()`, `rotateSelected()`, `removeSelected()`;
  `fmtFurnDims`; `RotateCw`, `Trash2` from `lucide-react`.
- Produces: `TopBar(): JSX.Element`, `SelectionBar(): JSX.Element` (no props, both
  read the stores); `App(): JSX.Element`, which creates the lookup provider once with
  `useState(() => createMockProductLookup())`, calls `useKeyboardShortcuts()`, and
  renders `Header`, `Sidebar`, then `<main>` with `TopBar`, `Stage`, `SelectionBar`.

Visual contract: README "Layout", "Top bar", "Selection bar"; prototype lines 16, 25,
116–132, 198–216.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Layout control | render | segmented `3D + plan inset` \| `Side by side` \| `Tabs`, first checked; choosing one sets `layout` |
| Tabs control | layout `tabs` / other | segmented `2D plan` \| `3D check` present / absent |
| Status clear | initial | element with classes `tag tag-accent`, text `Everything fits` |
| Status conflicts | 1 / 3 conflicts | text `1 conflict` / `3 conflicts`, class `tag-conflict` |
| Selected | desk selected | name `Tack writing desk`, dims `55 × 26 × 30 in`, buttons `Rotate 90°` and `Remove` |
| Selected conflict | selected item conflicts | reason text shown with class `selection-note` |
| Hint 2D | nothing selected, plan visible | `Drag a piece on the plan to move it, or nudge it with the arrow keys. Select one to see its clearance to each wall. R rotates, Delete removes. Drag the 3D view to orbit.` |
| Hint 3D | nothing selected, layout `tabs`, tab `3d` | `Drag to orbit, scroll to zoom. Pick a piece from the list to highlight it.` |
| Rotate button | click | desk `rot 2` |
| Remove button | click | desk removed; `selectedId null` |
| App structure | render `App` | `header.nav`, `aside.sidebar`, `main` present; root has class `app` |
| Keyboard wired | render `App`, select desk, press `r` | desk `rot 2` |
| Provider created once | re-render `App` | the same provider instance is passed to `Sidebar` |
| Full flow | in `App`: click `Sofa`, advance fake timers 900 ms, click `Place in room` | three rows in the item list; total `$2,600`; status `2 conflicts` (the centred sofa overlaps the bed) |

**Exact values:** `.app` — `display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100vh; min-height: 620px`.
`.app-body` — `grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); min-height: 0`.
`main` — `display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0`.
`.tag-conflict` — `background: var(--color-accent-900); color: var(--color-bg)`.
`.selection-note` — 13px, weight 500, `color: var(--color-accent-900)`.
Selection bar: `min-height: 56px`. Icons: `size={16} strokeWidth={1.5}`.
The 2D hint adds "or nudge it with the arrow keys" to the handoff copy; this is the
owner-approved arrow-key addition. `README.md` gains a "Keyboard" section listing R,
Delete/Backspace, Escape, arrows and Shift+arrows.

**Verify:** `npm run check` → exits 0, every test passes, 0 skipped, build succeeds.
Bundle split: `grep -l "WebGLRenderer" dist/assets/*.js` lists at least one file and
`grep -L "WebGLRenderer" dist/assets/index-*.js` lists the entry chunk.
`npm audit --omit=dev` → no high or critical.
**Commit:** `feat(app): top bar, selection bar and app shell`

---

## Task 20: Live verification and lighting sign-off

**Files:**
- Modify: `src/config.ts`
- Modify: `Docs/mistakes-and-fixes.md`
- Create: `Docs/verification/2026-11-12-live-check.md`
- Create: `Docs/verification/lighting-prototype.png`
- Create: `Docs/verification/lighting-app.png`

**Interfaces:**
- Consumes: the finished app (`npm run dev`); the prototype served with
  `npx serve design_handoff_room_planner` (open `Room Planner.dc.html`);
  `CONFIG.hemiIntensity`, `CONFIG.sunIntensity`.
- Produces: final values for `CONFIG.hemiIntensity` and `CONFIG.sunIntensity` in
  `src/config.ts`; a filled-in copy of the table below in
  `Docs/verification/2026-11-12-live-check.md` with a Pass/Fail column.

Both pages are opened in the same browser at a 1440×900 viewport. A row passes only
if the app shows the stated result. Any failed row is fixed in the owning task's
files with a failing test added first, then the row is re-run.

**Behavior (live rows):**

| Row | Action | Expected in the app |
|-----|--------|---------------------|
| L1 | Load the page | 3D view fills the stage with a bed and a desk in a room with a plank floor; plan inset bottom-right labelled `Plan`; tag `Everything fits`; console has 0 errors and 0 warnings |
| L2 | Click `Swap` | plan becomes the main view, inset is labelled `3D`; click again restores L1 |
| L3 | Choose `Side by side` | plan on the left half, 3D on the right half, one divider line |
| L4 | Choose `Tabs`, then `3D check`, then `2D plan` | one pane at a time; the hint text switches between the 3D and 2D copy |
| L5 | Back to inset; drag in the 3D view; scroll over it | the room orbits with the pointer; scrolling zooms and the page does not scroll |
| L6 | Choose `Blueprint` | line drawing of the same room from the same angle, with `12′ 0″`, `14′ 0″`, `8′ 0″` labels; `Realistic` restores the WebGL view |
| L7 | Swap so the plan is main; drag the bed | it follows the pointer in 1 in steps and stops at the walls; dashed clearance lines with distance chips appear |
| L8 | Drag the bed onto the desk | both list rows show an `Overlaps …` tag; top tag reads `2 conflicts`; both boxes are hatched on the plan |
| L9 | Drag the right wall handle left past the desk | Width input and the dimension label update while dragging; the wall stays under the pointer; the desk shows `Outside the room` |
| L10 | Select the desk; press `R`, arrow keys, Shift+arrow, then `Delete` | rotates 90°; moves 1 in per arrow press and 12 in with Shift; then is removed and the total drops by `$420` |
| L11 | Click `Sofa`, wait, click `Place in room` | loading card for about 1 s, then the preview card; the sofa appears centred and selected in both views |
| L12 | Click `Page without sizes`; then type `nope` and click `Fetch` | preview with the missing-dimensions note and `No price`; then the invalid-link message |
| L13 | Toggle `m / cm` | every length label, input and list row switches to metric; nothing moves on the plan |
| L14 | Resize the window to 1100×700 and back | both views refit without overflow or blank canvas |
| L15 | Compare each region with the prototype at 1440×900 | header, sidebar, top bar, stage and selection bar match the prototype in position and size to within 2 px, measured with the browser inspector on: sidebar width, header height, inset rectangle, room rectangle on the plan |

**Lighting sign-off (owner decision, recorded 2026-11-12):** the lighting is correct
when the project owner approves it.
1. With the starting values in `CONFIG`, capture the default view (L1) of the
   prototype and of the app at 1440×900 as `Docs/verification/lighting-prototype.png`
   and `Docs/verification/lighting-app.png`.
2. Adjust `CONFIG.hemiIntensity` and `CONFIG.sunIntensity` so the app capture is close
   to the prototype capture, and re-capture `lighting-app.png`.
3. Show the owner both captures and the two values, and ask for approval.
4. Pass condition: an explicit approving reply from the owner. If the owner asks for
   a change, apply it and repeat from step 2.
5. Write the approved values into `src/config.ts` and add an entry to
   `Docs/mistakes-and-fixes.md` giving the starting values, the final values and why
   they differ from the handoff's 0.78 and 0.62.

**Verify:** every row L1–L15 marked Pass in
`Docs/verification/2026-11-12-live-check.md`; the owner's lighting approval quoted in
that file; `npm run check` → exits 0 on the final tree.
**Commit:** `chore: live verification record and approved lighting values`

---

## Done criteria

The plan is done when all of these hold on the final commit:

1. `npm run check` exits 0 with 0 skipped tests.
2. `npm audit --omit=dev` reports no high or critical vulnerabilities.
3. `git status --porcelain design_handoff_room_planner` prints nothing and
   `git log --oneline -- design_handoff_room_planner` shows only the first commit.
4. Every row L1–L15 in `Docs/verification/2026-11-12-live-check.md` is marked Pass.
5. The owner's lighting approval is recorded in that file.

## Spec traceability

| Spec section | Requirement | Task(s) |
|--------------|-------------|---------|
| Project layout | app at root, git repo, handoff untouched | 1, Done criteria 3 |
| Stack | Vite, React, TS strict, Zustand, three, lucide, fontsource, Vitest, ESLint | 1 |
| Seam 1 | plan document separate from view state, `schemaVersion` | 2, 9 |
| Seam 2 | `ProductLookup` interface, separate URL validation, typed `LookupError` | 8, 12 |
| Seam 3 | `Item.model`, `resolveModel`, cache by model key | 2, 15, 16 |
| Seam 4 | `SceneRenderer` object, lazily loaded 3D chunk | 16, 18, 19 |
| Seam 5 | shared camera maths for both 3D styles | 7, 16, 17 |
| State | types, initial document, drafts as component state | 2, 9, 11, 12 |
| Behaviour | scale and safe-width floors | 2, 6 |
| Behaviour | preview dimension limits | 3, 12 |
| Behaviour | clearances hidden when outside the room | 6, 14 |
| Behaviour | label threshold, part hairlines | 14 |
| Behaviour | conflict tolerance and order | 5 |
| Behaviour | keyboard focus rule | 10 |
| Behaviour | blueprint selected-item label | 17 |
| Behaviour | `www.` stripped from hostnames | 8 |
| Additions | stale lookups dropped | 8, 12 |
| Additions | WebGL fallback and error boundary | 9, 16, 18 |
| Additions | pixel ratio capped at 2 | 16, 17 |
| Additions | arrow-key nudge (owner-approved 2026-11-12) | 2, 9, 10, 19 |
| three.js port notes | colour space, light units, no `preserveDrawingBuffer` | 15, 16, 20 |
| Constants | every value in the spec table | 2 |
| Security and privacy | URL scheme allow-list, text-only rendering, self-hosted fonts, no network | 1, 8, 12, 13 |
| Testing | pure modules, stores, components, live check | 2–19, 20 |
| Decisions 1–8 | root app and git; UUID ids; two stores; fontsource; plain three; `sourceUrl` and `model`; WebGL fallback; Vitest and RTL only | 1; 9; 9; 1; 16; 2; 18; 1 |
| Handoff README | header, sidebar, top bar, stage, plan, 3D, selection bar, interactions, lookup mock, tokens | 11–19 |

Files in this plan that the spec's layout did not list: `README.md` (project
readme), `src/styles/tokens.ts` (token reader shared by both 3D views),
`src/view/blueprintDraw.ts` (the canvas drawing routine, split from the component so
it can be tested), `src/hooks/startDrag.ts` (the spec called it `useDrag.ts`; it is a
plain function, not a hook) and the per-section CSS files. The spec's layout has been
updated to match.
