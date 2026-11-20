# Furniture Generator Implementation Plan

> **For executors:** execute with soltero-skills:lean-sdd. The Task Dependency
> Table below is the scheduling and review-depth contract.

**Goal:** Every piece of furniture is built in the browser from a saved "recipe" (style options
and two colours) by a parts kit, drawn the same way in the 3D view, the floor plan, the blueprint
and the downloaded picture, and the visitor can add a piece by type and edit its name, size, type,
style and colours.

**Spec:** `docs/room-planner/specs/2026-11-20-furniture-generator-design.md` (approved by the
owner on 2026-11-20 with the words "yeah lets do it"; the spec's status line records it).

**Architecture:** A new pure module, `room-planner/domain/furniture/`, holds the recipe
definitions (`recipe.ts`) and one parts builder per furniture family (`parts/`). A part is plain
data in inches. Two thin adapters read parts: `three/furnitureModels.ts` (meshes) and
`domain/furniture/planParts.ts` (top views, used by the floor plan, the blueprint prisms and the picture).
Items gain `style` and `colours`; the saved plan moves to version 4 with an upgrade from version 3.
The fake product lookup (UI, service, UI-store state) is removed; furniture is added by type and
edited in the "In this room" list. No server code, no network request, no new dependency.

**Tech stack / test runner:** Next.js 15, React 19, TypeScript, Zustand 5, three.js, zod, Vitest +
React Testing Library + jsdom. One file: `npx vitest run <file>` from the repo root. Everything:
`npm run check` (typecheck, lint, tests, build). Repo root:
`/Users/franciscosoltero/Desktop/Code/Portfolio Website`. Branch: `furniture-generator` (from
`main` at `25195c0`).

## Global Constraints

- All lengths are inches. Local frame of a piece: origin at the footprint centre on the floor;
  `x` across the width in `[-w/2, w/2]`; `y` across the depth in `[-d/2, d/2]` with the **back
  edge at `-d/2`**; `z` up in `[0, h]`.
- No new npm dependency. Rounded boxes use
  `three/examples/jsm/geometries/RoundedBoxGeometry.js`, which ships with the installed `three`.
- `room-planner/domain/**` must not import `three`, React or anything from `components/`,
  `state/`, `view/` or `three/`.
- Strict TypeScript; no `any`, no non-null `!` on untrusted data, no `@ts-ignore`. ESLint clean.
- Everything read from a saved plan or a share link is untrusted and goes only through
  `parsePlan`. Style values and colours are rendered as data (attribute values, three.js colours),
  never as HTML or CSS text assembled from strings.
- Tests sit next to the code as `*.test.ts(x)`. Tests that need furniture use
  `furnishedDocument()` from `room-planner/test/fixtures.ts`.
- User-facing text: plain sentences, no em dashes, sentence case, matching the existing sidebar.
- Styling uses the existing CSS variables and classes in `room-planner/styles/` and
  `components/Sidebar/*.css`; no new fonts, no colour literals in CSS except inside swatches,
  whose colours come from `SWATCHES` at run time.
- Do not start a dev server. Do not push, merge or open pull requests.
- Stage only explicit paths (never `git add -A`, `git add .`, `git commit -a`). Never touch
  `Multiplayer_AI_Sprite.aseprite`, `HANDOFF.md`, `.soltero/`.
- Commit messages end with:
  `Co-Authored-By: <the implementing model's own name> <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_015TSBugnNtqeGNLtF4ZZCt3`.
- A task is done only when `npm run check` exits 0 on its last commit.

## Task Dependency Table

| Task | Files touched | Depends on | Risk tier |
|------|---------------|------------|-----------|
| 1. Recipe and plan format 4 | `room-planner/domain/types.ts`, `room-planner/domain/furniture/recipe.ts`, `room-planner/domain/furniture/recipe.test.ts`, `room-planner/domain/planSchema.ts`, `room-planner/domain/planSchema.test.ts`, `room-planner/domain/planRoundTrip.test.ts`, `room-planner/domain/catalog.ts`, `room-planner/domain/catalog.test.ts`, `room-planner/state/planStore.ts`, `room-planner/state/stores.test.ts`, `room-planner/services/mockProductLookup.ts`, `room-planner/test/fixtures.ts`, `room-planner/test/fixtures.test.ts`, `room-planner/three/modelSource.ts`, `room-planner/three/modelSource.test.ts` | — | judgment |
| 2. Parts core, sofa and chair | `room-planner/domain/furniture/parts/types.ts`, `room-planner/domain/furniture/parts/index.ts`, `room-planner/domain/furniture/parts/seating.ts`, `room-planner/domain/furniture/parts/beds.ts`, `room-planner/domain/furniture/parts/tables.ts`, `room-planner/domain/furniture/parts/storage.ts`, `room-planner/domain/furniture/parts/flat.ts`, `room-planner/domain/furniture/parts/invariants.test.ts`, `room-planner/domain/furniture/parts/seating.test.ts` | 1 | judgment |
| 3. Bed, desk and table parts | `room-planner/domain/furniture/parts/beds.ts`, `room-planner/domain/furniture/parts/tables.ts`, `room-planner/domain/furniture/parts/beds.test.ts`, `room-planner/domain/furniture/parts/tables.test.ts`, `room-planner/domain/furniture/parts/seating.test.ts` | 2 | standard |
| 4. Storage, rug and box parts | `room-planner/domain/furniture/parts/storage.ts`, `room-planner/domain/furniture/parts/flat.ts`, `room-planner/domain/furniture/parts/storage.test.ts`, `room-planner/domain/furniture/parts/flat.test.ts`, `room-planner/domain/furniture/parts/seating.test.ts` | 2, 3 | standard |
| 5. 3D meshes from parts | `room-planner/three/furnitureModels.ts`, `room-planner/three/furnitureModels.test.ts`, `room-planner/three/modelSource.ts`, `room-planner/three/modelSource.test.ts`, `room-planner/three/SceneRenderer.test.ts` | 2 | standard |
| 6. Plan, blueprint and picture from parts | `room-planner/domain/furniture/planParts.ts`, `room-planner/domain/furniture/planParts.test.ts`, `room-planner/domain/shape.ts`, `room-planner/domain/geometry.test.ts`, `room-planner/domain/catalog.ts`, `room-planner/domain/catalog.test.ts`, `room-planner/components/Stage/PlanView.tsx`, `room-planner/components/Stage/PlanView.test.tsx`, `room-planner/styles/app.css`, `room-planner/view/blueprintScene.ts`, `room-planner/view/blueprintScene.test.ts`, `room-planner/view/planPicture.ts`, `room-planner/view/planPicture.test.ts`, `room-planner/domain/types.ts` | 2, 5 | standard |
| 7. Store actions; lookup removed | `room-planner/state/planStore.ts`, `room-planner/state/actions.ts`, `room-planner/state/uiStore.ts`, `room-planner/state/stores.test.ts`, `room-planner/config.ts`, `room-planner/domain/types.ts`, `room-planner/services/mockProductLookup.ts`, `room-planner/services/mockProductLookup.test.ts`, `room-planner/App.tsx`, `room-planner/App.test.tsx`, `room-planner/PlannerRoot.test.tsx`, `room-planner/components/Sidebar/Sidebar.tsx`, `room-planner/components/Sidebar/Sidebar.test.tsx`, `room-planner/components/Sidebar/AddFurnitureSection.tsx`, `room-planner/components/Sidebar/addFurniture.css`, `room-planner/components/Sidebar/DimInput.tsx`, `room-planner/hooks/useKeyboardShortcuts.test.tsx`, `room-planner/state/history.flow.test.tsx` | 1, 6 | judgment |
| 8. Item editor | `room-planner/components/Sidebar/ItemEditor.tsx`, `room-planner/components/Sidebar/ItemEditor.test.tsx`, `room-planner/components/Sidebar/ItemList.tsx`, `room-planner/components/Sidebar/itemList.css`, `room-planner/components/Sidebar/Sidebar.test.tsx`, `room-planner/hooks/useKeyboardShortcuts.ts`, `room-planner/hooks/useKeyboardShortcuts.test.tsx` | 7 | judgment |
| 9. Docs | `docs/room-planner/README.md`, `docs/room-planner/mistakes-and-fixes.md`, `docs/fixes-log.md` | 3, 4, 5, 6, 8 | mechanical |

Notes for scheduling. Tasks 3 and 5 touch different files and may overlap, as may Tasks 4 and
5; Task 4 follows Task 3 because both edit the placeholders block in `seating.test.ts`. Task 6 follows
Task 5 because it deletes `LOOKS`, which Task 5 stops reading. Task 7 follows Task 6 because both
edit `domain/types.ts`. No task installs, migrates or generates anything; the only shared
artefact is `.next/`, written by `npm run check`, so two tasks must not run `npm run check` at
the same moment (tasks that overlap run their own test files with `npx vitest run` and the
controller serialises their final `npm run check`).

Every "Modify" path exists on `main` at `25195c0` except the files this plan creates
(`domain/furniture/**`, `components/Sidebar/ItemEditor*.tsx`, `components/Sidebar/DimInput.tsx`).

## Risks, rollback and done

- **Plan format 4 is a one-way change, approved in the spec ("The plan format moves to version
  4").** The upgrade from version 3 happens when a plan is read; the stored plan is rewritten as
  version 4 only by the normal autosave after the visitor's next edit, or by Keep on a shared
  plan. A build that only knows version 3 (the live site before the merge, or the site after a
  revert of the merge) treats a version 4 saved plan as "newer": it shows the existing notice
  "Your saved plan was made with a newer version of the planner. It has been left untouched, and
  changes in this session will not be saved." and never overwrites it; a version 4 share link
  shows "This shared link was made with a newer version of the planner." No data is lost in
  either direction, but after a revert a visitor who saved under version 4 cannot use that plan
  until the change is merged again. Before the merge, version 4 data exists only on the branch
  and its Vercel preview, whose browser storage is separate from the live site's.
- **No feature flag.** The change is client-only and reaches visitors only through the merge of
  the pull request, which happens on the owner's word after the live check below passes on the
  Vercel preview. A flag would have to keep two plan formats and two drawing paths alive.
- **Rollback unit.** Each task is one or more commits on the branch. A task whose
  `npm run check` cannot be made green within the executor's three fix rounds is reverted with
  `git revert` of its commits (never amended or reset on a pushed branch), the executor stops,
  and the owner is told. Task 5 shares no file with Tasks 3 and 4, so it reverts cleanly on its own; Tasks 3 and 4
  share one test block, so if Task 3 is reverted Task 4 is reverted first. After the merge,
  rollback is `git revert -m 1` of the merge commit on `main`, on the owner's word.
- **Deleted files.** `mockProductLookup.ts` and its test (Task 7) stay recoverable from the
  commits before Task 7. `services/productLookup.ts` is not touched.
- **Done.** The work is done when every task's Verify passes on the final commit, the final
  `npm run check` exits 0, and every row of "After the tasks" passes. A failed row blocks the
  pull request from being offered for merge.

## Spec coverage

| Spec section | Tasks |
|---|---|
| 1. The recipe (style options, colours, defaults) | 1 |
| 2. The parts kit (pure parts, 3D adapter, same parts from above, clamps, cache) | 2, 3, 4, 5, 6 |
| 3. Add furniture; link box removed | 7 |
| 3. Style controls; Undo; Type change | 7 (rules), 8 (controls) |
| 4. Saved plans and share links (version 4, strict validation, model fields kept) | 1 |
| Defaults 1 to 5 | 7 (1), 1 (2), 2 and 6 (3), 5 (4), 1 and 5 (5) |
| Error handling (bad recipe refused; option clamped; failed 3D build falls back) | 1, 2 to 4, 5 |
| Testing; Verification | every task's Behavior table; "After the tasks" |

Task 9 (docs) is housekeeping required by the repo's standing rules, not by the spec.

Why Tasks 1, 6 and 7 are not split further: each must leave `npm run check` green, and their
type changes do not compile piecemeal. Task 1 adds two required fields to `Item`, so the schema,
the fixtures, the one function that creates items and the model key must change in the same
commit. Task 6 deletes `PARTS`, which the three plan readers import, so they move together.
Task 7 replaces `addItem(preview)` and removes the lookup state its only caller used, so the
store, the section that calls it and the tests of both move together.

---

## Task 1: Recipe and plan format 4

**Files:**
- Modify: `room-planner/domain/types.ts`
- Create: `room-planner/domain/furniture/recipe.ts`
- Create: `room-planner/domain/furniture/recipe.test.ts`
- Modify: `room-planner/domain/planSchema.ts`
- Modify: `room-planner/domain/planSchema.test.ts`
- Modify: `room-planner/domain/planRoundTrip.test.ts`
- Modify: `room-planner/domain/catalog.ts`
- Modify: `room-planner/domain/catalog.test.ts`
- Modify: `room-planner/state/planStore.ts`
- Modify: `room-planner/state/stores.test.ts`
- Modify: `room-planner/services/mockProductLookup.ts`
- Modify: `room-planner/test/fixtures.ts`
- Modify: `room-planner/test/fixtures.test.ts`
- Modify: `room-planner/three/modelSource.ts`
- Modify: `room-planner/three/modelSource.test.ts`

**Interfaces**

Consumes: nothing from this plan.

Produces, in `domain/types.ts`:
```ts
export type Kind = 'sofa' | 'chair' | 'bed' | 'desk' | 'table' | 'shelf' | 'dresser' | 'nightstand' | 'tvstand' | 'rug' | 'box';
/** A piece's style: one string value per option key of its kind (see STYLE_OPTIONS). */
export type StyleValues = Readonly<Record<string, string>>;
/** `#rrggbb`, lower case. */
export interface ItemColours { main: string; accent: string }
// Item gains:  style: StyleValues; colours: ItemColours;
// PlanDocument.schemaVersion becomes 4.
```
Produces, in `domain/furniture/recipe.ts`:
```ts
export interface StyleOption { key: string; label: string; values: readonly { value: string; label: string }[]; fallback: string }
export const STYLE_OPTIONS: Readonly<Record<Kind, readonly StyleOption[]>>;
export const KIND_LABELS: Readonly<Record<Kind, string>>;
export const KIND_ORDER: readonly Kind[];
export const TYPICAL_SIZE: Readonly<Record<Kind, { w: number; d: number; h: number }>>;
export const SWATCHES: readonly { label: string; colour: string }[];
export const COLOUR_PATTERN: RegExp;                       // /^#[0-9a-f]{6}$/
export function defaultStyle(kind: Kind): StyleValues;
export function defaultColours(kind: Kind): ItemColours;
/** Full style for `kind`: `given` values where valid, the fallback for a missing key. Null when `given` has an unknown key or a value not in the option's list. */
export function completeStyle(kind: Kind, given: Readonly<Record<string, string>>): StyleValues | null;
/** Lower-cases a `#rrggbb` colour; null when it is not one. */
export function normaliseColour(text: string): string | null;
/** Mixes `colour` toward white by `amount` in [0, 1]; returns `#rrggbb`. */
export function lighten(colour: string, amount: number): string;
```
`planStore.addItem` keeps its signature in this task and sets
`style: defaultStyle(kind)`, `colours: defaultColours(kind)` on the new item.
`modelKey(item)` becomes `JSON.stringify([kind, w, d, h, assetUrl, style keys sorted with values, colours.main, colours.accent])`.

**Exact values**

`KIND_ORDER`: sofa, chair, bed, desk, table, shelf, dresser, nightstand, tvstand, rug, box.

`KIND_LABELS`: Sofa, Chair, Bed, Desk, Table, Shelf, Dresser, Nightstand, TV stand, Rug, Box.

`STYLE_OPTIONS` (key: values, **fallback in bold**; labels are the value in sentence case unless given):

| Kind | Options |
|---|---|
| sofa | `seats`: **auto**, 1, 2, 3, 4, 5 · `arms`: **track**, rounded, slim, none · `back`: low, **standard**, high · `cushions`: **loose**, tight · `legs`: **block**, tapered, metal, none · `chaise`: **none**, left, right |
| chair | `type` (label "Kind"): **armchair**, dining, office · `arms`: **yes**, no · `legs`: **block**, tapered, metal, pedestal |
| bed | `headboard`: none, **low**, tall · `finish` (label "Headboard finish"): **panel**, upholstered · `footboard`: yes, **no** · `base`: **platform**, legs, storage |
| desk | `supports`: **legs** (label "Four legs"), trestle, panels (label "Panel sides") · `drawers`: none, left, **right**, both |
| table | `top`: **rectangle**, round · `base`: **legs** (label "Four legs"), pedestal, trestle · `shelf` (label "Lower shelf"): **yes**, no |
| shelf | `shelves`: **auto**, 2, 3, 4, 5, 6, 7, 8 · `back` (label "Back panel"): **yes**, no · `books`: **yes**, no |
| dresser | `columns`: 1, **2**, 3 · `rows`: 2, **3**, 4, 5, 6 · `base`: **legs**, plinth · `handles`: **knob**, bar, none |
| nightstand | `drawers`: 0, **1**, 2 · `base`: **legs**, plinth |
| tvstand | `bays`: 2, **3**, 4 · `fronts`: open, **doors**, drawers · `base`: **legs**, plinth |
| rug | `shape`: **rectangle**, round · `border`: **yes**, no |
| box | (no options) |

`TYPICAL_SIZE` (w, d, h): sofa 84, 36, 33 · chair 30, 32, 31 · bed 64, 85, 38 · desk 55, 26, 30 ·
table 44, 24, 16 · shelf 36, 13, 78 · dresser 60, 18, 34 · nightstand 22, 16, 24 ·
tvstand 60, 16, 22 · rug 60, 96, 0.5 · box 36, 24, 30.

`defaultColours` (main, accent) — these are today's fixed per-type colours from `LOOKS`
(`main` or the wood/top colour as main; wood, metal or the soft tone as accent), so an upgraded
piece keeps its colours — sofa `#6f7f8c`, `#3b2f27` · chair `#b5673f`, `#2e2a27` ·
bed `#8a9a8b`, `#a67c52` · desk `#b98d5e`, `#2b2b2d` · table `#6b4a33`, `#6b4a33` ·
shelf `#ddd8ce`, `#ddd8ce` · dresser `#b98d5e`, `#2b2b2d` · nightstand `#b98d5e`, `#2b2b2d` ·
tvstand `#6b4a33`, `#2b2b2d` · rug `#c9b8a3`, `#ded2c2` · box `#c9ccd1`, `#c9ccd1`.

`SWATCHES`: Slate `#6f7f8c`, Sage `#8a9a8b`, Rust `#b5673f`, Sand `#c9b8a3`, Cream `#ddd8ce`,
Charcoal `#3a3d42`, Navy `#2f4057`, Oak `#b98d5e`, Walnut `#6b4a33`, Espresso `#3b2f27`,
Black metal `#2b2b2d`, Brass `#b08d57`, White `#f3f1ec`.

Plan format: `CURRENT_VERSION = 4`. A version 4 item is a version 3 item plus
`style: z.record(z.string().max(24), z.string().max(24))` with at most 12 keys and
`colours: z.object({ main, accent })` where each is a string of length 7. After the structural
parse, per item: `completeStyle(kind, style)` null → refuse `items.style: unknown`;
`normaliseColour` null → refuse `items.colours: colour`. Version 3 → 4 upgrade: every item gets
`defaultStyle(kind)` and `defaultColours(kind)`; everything else is unchanged. Versions 1 and 2
keep upgrading through the existing chain. `FIELD_NAMES` gains `style`, `colours`, `main`,
`accent`, and every option key above. `KIND_SET` gains the three new kinds. Because the kind list is shared by every version's schema,
a version 1, 2 or 3 document naming a new kind is accepted too; this is a side effect of sharing
the list, not a spec requirement, and no planner ever wrote such a document.

`catalog.ts`: `PARTS` and `LOOKS` gain entries for dresser, nightstand and tvstand equal to the
`box` entry (Task 5 stops reading `LOOKS`; Task 6 deletes both). `mockProductLookup.ts`: only the type changes
needed to compile (`CatalogueKind` excludes the three new kinds as well as box).

**Behavior**

| Case | Input / state | Expected |
|---|---|---|
| Defaults complete | every kind | `defaultStyle(kind)` has exactly the kind's option keys, each the fallback; `completeStyle(kind, {})` equals it |
| Missing key | sofa, `{ arms: 'slim' }` | full sofa style with `arms: 'slim'`, other keys fallback |
| Unknown key | sofa, `{ wheels: 'yes' }` | `null` |
| Unknown value | sofa, `{ arms: 'huge' }` | `null` |
| Key of another kind | rug, `{ arms: 'slim' }` | `null` |
| Prototype keys | any kind, `{ __proto__: 'x' }` or `{ constructor: 'x' }` given as own keys of a parsed JSON object | `null`, no throw |
| Colour forms | `'#6F7F8C'` → `'#6f7f8c'`; `'6f7f8c'`, `'#fff'`, `'#6f7f8g'`, `'red'`, `'#6f7f8c '` → `null` |
| lighten | `lighten('#000000', 0)` → `'#000000'`; `lighten('#000000', 1)` → `'#ffffff'`; `lighten('#6f7f8c', 0.08)` is a valid colour, each channel ≥ the input's |
| v3 upgrade | the version 3 furnished plan (bed, desk) | parses to version 4; bed has `defaultStyle('bed')`, `defaultColours('bed')`; positions and sizes unchanged |
| v1, v2 upgrade | the existing v1 and v2 seed documents in `planSchema.test.ts` | parse to the version 4 `furnishedDocument()` |
| v4 round trip | `furnishedDocument()` with a sofa added with non-default style and colours | `parsePlan(JSON.parse(JSON.stringify(doc)))` equals `doc` |
| v4 partial style | item with `style: {}` | accepted; item has the full default style |
| v4 bad style | item with `style: { arms: 'huge' }` for a sofa | refused, `newer: false` |
| v4 bad colour | `colours.main: 'url(x)'`, or 7 characters not hex, or a number | refused |
| v4 missing fields | item without `style` or without `colours` | refused |
| v4 oversized style | 13 keys, or a 25-character value | refused |
| Newer | `schemaVersion: 5` | `{ ok: false, newer: true }` |
| Upper-case colour | `colours.main: '#6F7F8C'` | accepted, stored `#6f7f8c` |
| Store default | `addItem` of a sofa preview | new item has `defaultStyle('sofa')`, `defaultColours('sofa')` |
| Model key | two items equal except `style.arms`, or except `colours.accent` | different `modelKey`; equal except position → same key |
| Fixture | `furnishedDocument()` | `schemaVersion: 4`; bed and desk carry their default style and colours |

**Verify:** `npm run check` exits 0. Expected: all test files pass; the test count is higher than 2,560.

**Commit:** `feat(room-planner): furniture recipe and plan format 4`

---

## Task 2: Parts core, sofa and chair

**Files:**
- Create: `room-planner/domain/furniture/parts/types.ts`
- Create: `room-planner/domain/furniture/parts/index.ts`
- Create: `room-planner/domain/furniture/parts/seating.ts`
- Create: `room-planner/domain/furniture/parts/beds.ts`
- Create: `room-planner/domain/furniture/parts/tables.ts`
- Create: `room-planner/domain/furniture/parts/storage.ts`
- Create: `room-planner/domain/furniture/parts/flat.ts`
- Create: `room-planner/domain/furniture/parts/invariants.test.ts`
- Create: `room-planner/domain/furniture/parts/seating.test.ts`

**Interfaces**

Consumes (Task 1): `Kind`, `StyleValues`, `STYLE_OPTIONS`, `defaultStyle`, `KIND_ORDER`, `TYPICAL_SIZE`.

Produces, in `parts/types.ts`:
```ts
export type PartShape = 'box' | 'rounded' | 'cylinder';
/** Which colour a part takes: main, soft (main lightened), accent, linen (bedding white), or a book colour by index. */
export type PartSlot = 'main' | 'soft' | 'accent' | 'linen' | 'book0' | 'book1' | 'book2' | 'book3' | 'book4';
export interface Part {
  shape: PartShape;
  /** Centre of the part in x and y, and its bottom in z (local frame, inches). */
  cx: number; cy: number; z0: number;
  /** Full extents in x, y and z. A cylinder stands on the z axis; sx and sy are its diameters. */
  sx: number; sy: number; sz: number;
  slot: PartSlot;
  /** 'rounded' only: edge radius, at most half the smallest extent. */
  radius?: number;
  /** 'cylinder' only: bottom diameter ÷ top diameter in (0, 1]; absent means 1. */
  taper?: number;
  /** True for small decoration (books, handles) that plan views and the blueprint leave out. */
  detail?: true;
}
export interface PieceSize { w: number; d: number; h: number }
export type PartsBuilder = (size: PieceSize, style: StyleValues, seed: number) => Part[];
/** A part helper set every builder file uses. */
export function box(slot: PartSlot, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Part;
export function rounded(slot: PartSlot, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, radius: number): Part;
export function cylinder(slot: PartSlot, cx: number, cy: number, z0: number, z1: number, diameter: number, taper?: number): Part;
/** Four legs inset from the footprint corners: square boxes for 'block', tapered cylinders for 'tapered', thin cylinders for 'metal'. */
export function fourLegs(size: PieceSize, type: 'block' | 'tapered' | 'metal', top: number, inset: number): Part[];
export function clamp(value: number, min: number, max: number): number;
```
Produces, in `parts/index.ts`:
```ts
/** Parts of a piece in its local frame. Unknown or incomplete style values fall back to the kind's defaults; never throws. */
export function buildParts(kind: Kind, size: PieceSize, style: StyleValues, seed?: number): Part[];
```
`seating.ts` exports `sofaParts: PartsBuilder`, `chairParts: PartsBuilder`. `beds.ts` exports
`bedParts`; `tables.ts` exports `deskParts`, `tableParts`; `storage.ts` exports `shelfParts`,
`dresserParts`, `nightstandParts`, `tvstandParts`; `flat.ts` exports `rugParts`, `boxParts`.
In this task the builders outside `seating.ts` are placeholders that return one `box` part of
slot `main` filling the whole size (Tasks 3 and 4 replace them without changing `index.ts`).

**Exact values**

- Every part must lie inside the piece: `|cx| + sx/2 ≤ w/2 + 1e-6`, same for y with `d`, and
  `0 ≤ z0`, `z0 + sz ≤ h + 1e-6`. Every extent `> 0`. `radius ≤ min(sx, sy, sz) / 2`.
- Part count per piece ≤ 200.
- `seed` (default 1) only varies decoration (books); geometry that is not `detail` must not
  depend on it.
- Sofa: seat-top height `clamp(0.5 * h, 6, 20)`; leg height `clamp(0.15 * h, 1, 7)` (0 for
  `legs: none`, body reaches the floor); arm width track `clamp(0.1 * w, 3, 9)`, rounded the same
  with `rounded` parts, slim half of track, none 0; back top: low `0.75 * h`, standard `0.9 * h`,
  high `h`; back depth `clamp(0.24 * d, 3, 10)`. Seat count for `auto`:
  `clamp(round((w - 2 * armWidth) / 26), 1, 5)`; an explicit count is clamped so each seat
  cushion is at least 14 wide (minimum 1). `cushions: loose` gives one `rounded` back cushion per
  seat in slot `soft`; `tight` gives one back part across all seats. Seat cushions are `rounded`,
  slot `soft`.
- Chaise (`left`/`right`, sofa only): the seat at that end runs the full depth to the front edge
  and that end has no arm in front of the back; the other seats' cushions and body end at
  `clamp(0.62 * d, 12, d - 4)` from the back edge so the chaise visibly sticks out. When `w < 60` the chaise
  option is ignored (drawn as `none`). "Left" is `x < 0`.
- Chair `armchair`: sofa rules with one seat. `dining`: seat top `clamp(0.5 * h, 6, 19)`, thin
  seat (≤ 3 thick), back from seat to `h` at the back edge at most 2.5 deep, arms only when
  `arms: yes` (thin rails), four legs unless `pedestal`. `office`: `pedestal` shape regardless of
  `legs` (a central column on a round base at most `min(w, d)` wide), seat and back as dining but
  `rounded`.
- `pedestal`: one cylinder column of diameter `clamp(0.14 * min(w, d), 1.5, 5)` on a cylinder
  base of diameter `0.7 * min(w, d)` and height `clamp(0.06 * h, 0.75, 2)`.

**Behavior**

| Case | Input | Expected |
|---|---|---|
| Invariants, all kinds | every kind in `KIND_ORDER` × every single-option variation of its default style (one option changed at a time, every value) × sizes: `TYPICAL_SIZE`, `{1, 1, 0.25}`, `{720, 720, 720}`, `{240, 12, 12}`, `{12, 240, 40}` | parts list non-empty; every invariant under "Exact values" holds |
| Deterministic | same kind, size, style, seed twice | deep-equal lists |
| Seed | different seed | non-`detail` parts deep-equal |
| Bad style | `buildParts('sofa', size, { arms: 'huge' })`, `buildParts('sofa', size, {})` | equal to the default-style result; no throw |
| Sofa seats auto | sofa 84 wide default | 3 seat cushions; 30 wide → 1; 240 wide → 5 |
| Sofa seats explicit | `seats: '5'` on a 40-wide sofa | clamped: every seat cushion ≥ 14 wide |
| Sofa arms none | `arms: none` | the only `main`-slot part whose top is above the seat-top height is the back frame (the one `main` part touching `y = -d/2` whose top is the back top); back cushions are slot `soft` and not counted |
| Sofa legs none | `legs: none` | lowest `z0` of the body is 0 and there are no leg parts |
| Sofa back | low, standard, high | the back frame part's top is `0.75h`, `0.9h`, `h`; no part exceeds `h` |
| Sofa cushions | loose vs tight, 3 seats | 3 back-cushion parts vs 1 |
| Chaise | `chaise: left`, 96 × 62 | one seat part reaches `y = d/2`; no arm part in front of the back on the left; mirrored for `right` |
| Chaise narrow | `chaise: left`, 50 wide | same parts as `chaise: none` |
| Chair kinds | armchair, dining, office | armchair has two arm parts when `arms: yes`; dining seat ≤ 3 thick; office has one column cylinder and a base cylinder |
| Placeholders | `buildParts('bed', size, defaultStyle('bed'))` | exactly one box part filling the size. This row lives in `seating.test.ts` under a `describe('placeholders')` block listing every kind not yet built; Tasks 3 and 4 each delete their kinds from it (Task 4 deletes the block) |
| Collision ignores style | `itemFootprint` and the conflict check for a sofa with `chaise: left` vs `none` | identical footprint and conflicts (the collision outline is the full `w` × `d` rectangle) |

Each Behavior row is written as a failing test before the builder code that satisfies it (the
repo's test-first rule); this holds for every task in this plan.

**Verify:** `npx vitest run room-planner/domain/furniture` passes; `npm run check` exits 0.

**Commit:** `feat(room-planner): parts kit core with sofa and chair`

---

## Task 3: Bed, desk and table parts

**Files:**
- Modify: `room-planner/domain/furniture/parts/beds.ts`
- Modify: `room-planner/domain/furniture/parts/tables.ts`
- Create: `room-planner/domain/furniture/parts/beds.test.ts`
- Create: `room-planner/domain/furniture/parts/tables.test.ts`
- Modify: `room-planner/domain/furniture/parts/seating.test.ts`

**Interfaces**

Consumes (Task 2): `Part`, `PieceSize`, `PartsBuilder`, `box`, `rounded`, `cylinder`, `fourLegs`,
`clamp`. Produces: real `bedParts`, `deskParts`, `tableParts` with the same exported names and
types (so `parts/index.ts` is not edited).

**Exact values**

- Bed: `h` is the headboard top when there is a headboard, else the top of the pillows.
  Pillow thickness `clamp(0.1 * h, 0.05, 5)` (never more than a third of `h`). Mattress top
  `clamp(0.55 * h, 4, 26)` (capped at `h` minus the pillow thickness) with a headboard, else
  `h` minus the pillow thickness. Headboard
  top: `tall` → `h`; `low` → `min(h, mattress top + clamp(0.3 * h, 4, 14))`; `none` → no
  headboard part. Headboard thickness `clamp(0.03 * d, 1, 3)` at the back edge. `finish:
  upholstered` → headboard is `rounded`, slot `main`; `panel` → `box`, slot `accent`.
  `footboard: yes` → a part at the front edge to `mattress top + clamp(0.08 * h, 1, 6)`.
  `base`: `platform` → frame box from the floor gap `clamp(0.06 * h, 0.5, 3)`, slot `accent`;
  `legs` → four `block` legs `clamp(0.2 * h, 2, 9)` high under a frame `clamp(0.08 * h, 1, 4)` thick; `storage` → frame to the
  floor with two `detail` drawer-front parts on each long side. Mattress: `rounded`, slot
  `linen`. Duvet: `rounded`, slot `main`, covering the front 68% of the mattress. Pillows:
  `rounded`, slot `linen`, 1 when `w < 48`, else 2.
- Desk: top thickness `clamp(0.05 * h, 0.75, 2)`, slot `main`. `supports: legs` → four `metal`
  legs, slot `accent`; `trestle` → at each end, inset `clamp(0.08 * w, 1, 6)` from the side: one foot bar on the floor
  (`x` thickness `t = clamp(0.03 * w, 0.75, 2)`, spanning 80% of the depth, height `t`) and one
  post (`t` × `t`, centred in depth, from the foot bar to the underside of the top), all `box`,
  slot `accent` — 2 foot bars + 2 posts; `panels` → two full-depth side panels, slot `main`. `drawers`: a drawer
  box under the top on the named side(s), width `clamp(0.3 * w, 8, 20)`, height
  `clamp(0.2 * h, 3, 8)`, slot `main`, plus a `detail` handle in slot `accent`; when
  `w < 30` `both` is drawn as `right`; when `w < 20` drawers are omitted.
- Table: top thickness `clamp(0.06 * h, 0.75, 2.5)`. `top: round` → a `cylinder` with `sx = w`,
  `sy = d`; `rectangle` → `rounded` with radius `min(0.5, thickness / 2)`. `base: legs` → four
  `tapered` legs (for a round top inset so they sit under the ellipse:
  inset ≥ `0.15 * w` and `0.15 * d`); `pedestal` → the Task 2 pedestal rule; `trestle` → the desk's trestle rule (2 foot bars + 2 posts).
  `shelf: yes` → a lower shelf at `0.3 * h`, omitted when `h < 12` or `base` is `pedestal`.

**Behavior**

| Case | Input | Expected |
|---|---|---|
| Invariants | covered by `invariants.test.ts` (Task 2) for these kinds, now on real geometry | still pass |
| Headboard | none / low / tall, 64 × 85 × 38 | 0 headboard parts / top < h / top = h |
| Headboard finish | upholstered vs panel | `rounded` + `main` vs `box` + `accent` |
| Footboard | yes vs no | one part touching `y = d/2` above the mattress top vs none |
| Bed base | platform, legs, storage | no leg parts; four leg parts; body reaches `z = 0` and 4 `detail` drawer fronts |
| Pillows | w 38 vs 64 | 1 vs 2 pillow parts |
| Tiny bed | 1 × 1 × 0.25 | non-empty, inside bounds |
| Desk supports | legs, trestle, panels | 4 cylinder legs; 2 foot bars + 2 posts; 2 panels spanning the depth |
| Desk drawers | none, left, right, both at w 55 | 0, 1 (x < 0), 1 (x > 0), 2 drawer boxes |
| Narrow desk | both at w 28; any at w 18 | 1 drawer box; 0 |
| Table top | rectangle vs round, 44 × 24 | `rounded` vs `cylinder` with `sx 44`, `sy 24` |
| Table base | legs, pedestal, trestle | 4 tapered cylinders; 1 column + 1 base cylinder; 2 foot bars + 2 posts, slot `accent` |
| Lower shelf | yes at h 16; yes at h 10; yes with pedestal | 1 shelf part; none; none |
| Round top legs | round, legs | every leg centre satisfies `(cx / (w/2))² + (cy / (d/2))² ≤ 1` |

Also delete `bed`, `desk` and `table` from the placeholders block in `seating.test.ts`
(add `room-planner/domain/furniture/parts/seating.test.ts` to this task's files).

**Verify:** `npx vitest run room-planner/domain/furniture` passes; `npm run check` exits 0.

**Commit:** `feat(room-planner): bed, desk and table parts`

---

## Task 4: Storage, rug and box parts

**Files:**
- Modify: `room-planner/domain/furniture/parts/storage.ts`
- Modify: `room-planner/domain/furniture/parts/flat.ts`
- Create: `room-planner/domain/furniture/parts/storage.test.ts`
- Create: `room-planner/domain/furniture/parts/flat.test.ts`
- Modify: `room-planner/domain/furniture/parts/seating.test.ts`

**Interfaces**

Consumes (Task 2): as Task 3. Produces: real `shelfParts`, `dresserParts`, `nightstandParts`,
`tvstandParts`, `rugParts`, `boxParts`, same names and types.

**Exact values**

- Panel thickness for all storage: `clamp(0.03 * min(w, h), 0.5, 1)`.
- Base, for dresser, nightstand, tvstand: `legs` → four `tapered` legs, slot `accent`, height
  `clamp(0.14 * h, 1.5, 6)`; `plinth` → a recessed box `clamp(0.08 * h, 1, 3)` high, inset 1 from
  the front, slot `accent`. The cabinet body sits on top, slot `main`.
- Shelf: two sides, a top, a bottom and shelves, slot `main`; `shelves: auto` →
  `clamp(round(h / 14), 2, 8)` openings; an explicit count is clamped so each opening is at
  least 5 high (minimum 1). `back: yes` → a back panel `min(0.4, d / 4)` thick. `books: yes` →
  `detail` book parts in slots `book0`–`book4`, placed by a small deterministic generator from
  `seed` (same recurrence as today: `seed = seed * 16807 % 2147483647`), filling 55–95% of each
  opening's width, at most 150 book parts in total; `no` → none.
- Dresser: `columns` × `rows` drawer fronts, each a `box` 0.4 proud of the body, slot `soft`,
  with a 0.3 gap between fronts; each front at least 3 high and 5 wide, otherwise rows then
  columns are reduced until they fit (minimum 1 × 1). `handles: knob` → one `detail` cylinder
  per front; `bar` → one `detail` box per front, width 40% of the front; `none` → none. Handles
  are slot `accent`.
- Nightstand: fronts, gaps and knobs follow the dresser's front and knob rules with one column.
  `drawers` 0 → open box with one shelf at half the cabinet height; 1 → one drawer front over the
  top half of the cabinet, open bay below; 2 → two equal fronts. Knob: `detail` cylinder,
  diameter `clamp(0.06 * w, 0.5, 1.25)`, 0.5 proud, centred on its front (the dresser's knob is
  the same).
- TV stand: `bays` equal-width bays separated by dividers. `fronts: open` → each bay open with
  one shelf when `h ≥ 14`; `doors` → one door front per bay with a `detail` knob; `drawers` →
  one drawer front per bay with a `detail` bar handle. Bays are reduced until each is at least 8
  wide (minimum 1).
- Rug: thickness is the piece's `h`. `shape: round` → `cylinder` with `sx = w`, `sy = d`, slot
  `main`; `rectangle` → `box`. `border: yes` → the outer part in slot `main` and an inner part
  inset `clamp(0.07 * min(w, d), 1, 5)` in slot `soft`, raised to the full `h` while the outer
  part is `0.8 * h`; `no` → one part.
- Box: one `box` part, slot `main`, filling the size.

**Behavior**

| Case | Input | Expected |
|---|---|---|
| Invariants | `invariants.test.ts` on real geometry | still pass |
| Shelf count | auto at h 78; `8` at h 30; `2` | 6 openings (7 horizontal boards incl. top and bottom); clamped so each opening ≥ 5; 2 openings |
| Shelf back | yes vs no | one part at the back edge spanning the height vs none |
| Books | yes vs no | some `detail` parts in book slots, ≤ 150 vs none |
| Books and seed | seeds 1 and 2 | book parts differ; non-detail parts equal |
| Dresser grid | 2 × 3; 3 × 6 at 60 × 18 × 34; 3 × 6 at 12 × 12 × 12 | 6 fronts; 18 fronts; reduced so every front ≥ 3 high and ≥ 5 wide |
| Handles | knob, bar, none on 2 × 3 | 6 detail cylinders; 6 detail boxes; 0 |
| Dresser base | legs vs plinth | 4 tapered cylinders vs 1 recessed box at z 0 |
| Nightstand | 0, 1, 2 | 0, 1, 2 drawer fronts |
| TV stand bays | 3 at w 60; 4 at w 20 | 2 dividers; reduced to 2 bays |
| TV stand fronts | open, doors, drawers | 0 fronts; one front per bay with a cylinder; one front per bay with a bar |
| Rug | rectangle/round × border yes/no | box or cylinder; 2 parts or 1; inner part slot `soft` |
| Rug thin | h 0.25 | parts within `[0, 0.25]`, every `sz > 0` |
| Box | any size | exactly one box filling it |

Also delete the remaining placeholders block from `seating.test.ts`. Tasks 3 and 4 both edit
that one block, so the executor runs Task 4 after Task 3 (the table's dependency says so).

**Verify:** `npx vitest run room-planner/domain/furniture` passes; `npm run check` exits 0.

**Commit:** `feat(room-planner): storage, rug and box parts`

---

## Task 5: 3D meshes from parts

**Files:**
- Modify: `room-planner/three/furnitureModels.ts`
- Modify: `room-planner/three/furnitureModels.test.ts`
- Modify: `room-planner/three/modelSource.ts`
- Modify: `room-planner/three/modelSource.test.ts`
- Modify: `room-planner/three/SceneRenderer.test.ts`

**Interfaces**

Consumes: `buildParts`, `Part`, `PartSlot` (Task 2); `lighten`, `Item.style`, `Item.colours`
(Task 1); `hashSeed` (already in `furnitureModels.ts`, kept and exported); `LINEN`,
`BOOK_COLOURS` from `domain/catalog.ts`.

Produces:
```ts
/** Builds the piece's model from its parts. Never throws: when the parts or a geometry fail, returns a plain box of the item's size in its main colour. `userData.outline` holds the hidden selection box, as before. */
export function buildFurniture(item: Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h' | 'style' | 'colours'>): THREE.Group;
```
`resolveModel(item)` keeps its signature and calls it.

**Exact values**

- Axes: local part `x` → three `x`; part `y` (depth, back at `-d/2`) → three `z`; part `z` → three
  `y`. A part's mesh position is `(cx, z0 + sz/2, cy)`.
- Geometry: `box` → `BoxGeometry(sx, sz, sy)`; `rounded` → `RoundedBoxGeometry(sx, sz, sy, 2,
  radius)`; `cylinder` → `CylinderGeometry(0.5, 0.5 * (taper ?? 1), 1, 20)` scaled
  `(sx, sz, sy)` (top radius first, so a taper below 1 narrows the bottom).
- Colours by slot: `main` → `colours.main`; `soft` → `lighten(colours.main, 0.08)`; `accent` →
  `colours.accent`; `linen` → `LINEN`; `bookN` → `BOOK_COLOURS[N]`.
- Materials: one `MeshStandardMaterial` per slot per piece (shared by that piece's parts),
  roughness 0.92 for main, soft and linen, 0.6 for accent, 0.85 for books.
- Shadows: every mesh `castShadow` and `receiveShadow` true, except a `rug` piece's meshes, which
  do not cast.
- Seed for `buildParts`: `hashSeed(item.id)`.
- The selection outline is unchanged: `EdgesGeometry(BoxGeometry(w + 1.2, h + 0.6, d + 1.2))`,
  `position.y = h / 2 + 0.3`, hidden, at `group.userData.outline`.
- `LOOKS` is no longer read by this file (Task 6 removes it with `PARTS`).

**Behavior**

| Case | Input | Expected |
|---|---|---|
| Mesh per part | default sofa item | group has one mesh per part plus the outline; each mesh's position and bounding size match its part under the axis mapping |
| Colours | `colours: { main: '#112233', accent: '#445566' }` | main-slot meshes' material colour is `#112233`, accent `#445566`, soft equals `lighten('#112233', 0.08)` |
| Shared materials | default dresser | number of distinct materials ≤ number of distinct slots used |
| Rounded | part with `shape: 'rounded'` | geometry is a `RoundedBoxGeometry` whose bounding box equals `(sx, sz, sy)` within 1e-3 |
| Taper | tapered leg | bounding box matches; bottom ring narrower than top |
| Rug shadows | rug item | no mesh casts a shadow |
| Fallback | `buildParts` made to throw (module mock) | group has exactly one box mesh of `(w, h, d)` plus the outline; no throw |
| Outline | any | `userData.outline` present, hidden, size as above |
| Renderer | `SceneRenderer.update` with an item whose `style` then changes | the model is rebuilt (different `modelKey`); unchanged style and a move → not rebuilt |
| Disposal | existing SceneRenderer disposal tests | still pass with the new geometries and materials |

**Verify:** `npx vitest run room-planner/three` passes; `npm run check` exits 0.

**Commit:** `feat(room-planner): build 3D furniture from parts`

---

## Task 6: Plan, blueprint and picture from parts

**Files:**
- Create: `room-planner/domain/furniture/planParts.ts`
- Create: `room-planner/domain/furniture/planParts.test.ts`
- Modify: `room-planner/domain/shape.ts`
- Modify: `room-planner/domain/geometry.test.ts`
- Modify: `room-planner/domain/catalog.ts`
- Modify: `room-planner/domain/catalog.test.ts`
- Modify: `room-planner/components/Stage/PlanView.tsx`
- Modify: `room-planner/components/Stage/PlanView.test.tsx`
- Modify: `room-planner/styles/app.css`
- Modify: `room-planner/view/blueprintScene.ts`
- Modify: `room-planner/view/blueprintScene.test.ts`
- Modify: `room-planner/view/planPicture.ts`
- Modify: `room-planner/view/planPicture.test.ts`
- Modify: `room-planner/domain/types.ts`

**Interfaces**

Consumes: `buildParts`, `Part` (Task 2); `Item.style` (Task 1); Task 5's `furnitureModels.ts` no longer reading `LOOKS`; `Footprint`, `itemFootprint`,
`partCorners` (`domain/shape.ts`).

Produces, in `planParts.ts`:
```ts
/** A part seen from above: its rectangle as fractions of the footprint ([u0,u1,v0,v1], v = 0 at the back), whether it is round, and its height range in inches. */
export interface PlanPart { rect: readonly [number, number, number, number]; round: boolean; z0: number; z1: number }
/** The piece's non-detail parts from above, lowest top first. A piece whose only part fills the footprint returns that one part. */
export function planParts(item: Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h' | 'style'>): PlanPart[];
```
Produces, in `shape.ts`:
```ts
/** Corners of a plan part on the plan, turned with the footprint: 4 for a rectangle, 16 for a round part (an ellipse inscribed in its rectangle). */
export function planPartOutline(fp: Footprint, part: PlanPart): Point[];
```
`PARTS`, `LOOKS` and the `PartRect` type are deleted from `catalog.ts`/`types.ts`;
`partCorners` is replaced by `planPartOutline`. `LINEN` and `BOOK_COLOURS` stay in `catalog.ts`.

**Exact values**

- `planParts` drops parts with `detail: true`, and merges nothing. Fractions:
  `u0 = (cx − sx/2) / w + 0.5`, `v0 = (cy − sy/2) / d + 0.5`, clamped to `[0, 1]`.
- At most 40 plan parts per piece; when there are more, the 40 with the largest top-view area
  are kept, order preserved.
- `PlanView`: each plan part is an `<i class="plan-part">` positioned by percentages as today; a
  round part also gets class `is-round` (`border-radius: 50%` in `app.css`). A piece with exactly
  one plan part that fills the footprint renders no `<i>` (as today for single-part kinds) unless
  that part is round, in which case the piece's own box gets class `is-round`.
- Blueprint (`buildPrisms`): one prism per plan part, `pts = planPartOutline(fp, part)`,
  `z0`/`z1` from the part; rug parts go to `rugs`.
- Picture (`drawPlanPicture`): the footprint fill and conflict colouring are unchanged; after
  the fill, each plan part's outline is stroked with the existing furniture stroke colour at 40%
  opacity, 1 px at the picture's scale; a round single-part piece (round rug, round table top
  covering the footprint) is filled and stroked as its ellipse instead of its rectangle. Item
  names are drawn as today.

**Behavior**

| Case | Input | Expected |
|---|---|---|
| Fractions | default sofa at typical size | every `rect` within `[0, 1]`, `u0 < u1`, `v0 < v1`; arm parts at `u0 = 0` and `u1 = 1` |
| No detail | default shelf with books; dresser with knobs | no plan part for a book or handle |
| Round | round table top; round rug | `round: true` for the top / rug part |
| Order | default bed | sorted by `z1` ascending |
| Cap | a piece producing more than 40 non-detail parts (a mocked `buildParts` returning 60 box parts) | 40 returned |
| Outline rectangle | `planPartOutline` for a rectangle part, angle 0 and 90 | 4 corners equal to the old `partCorners` result for the same fractions |
| Outline round | round part | 16 points, all on the ellipse within 1e-6, turned with the footprint |
| PlanView parts | furnished plan with a default sofa | sofa element contains one `.plan-part` per plan part with matching percentages |
| PlanView round | round rug | rug element has class `is-round`, no `.plan-part` child |
| PlanView single | box item | no `.plan-part` child |
| Blueprint | `buildPrisms` for bed + round rug | bed prisms = bed plan parts with matching heights; rug prism in `rugs` with 16 points |
| Picture | recorded canvas calls for a plan with a sofa | footprint filled as before, then one stroked path per plan part |
| Picture round | round rug | an ellipse-shaped path (16 points) is filled, not the rectangle |
| No stale imports | `git grep -n "PARTS\b\|LOOKS\b\|PartRect" -- room-planner` | no matches |

**Verify:** `npx vitest run room-planner/domain room-planner/view room-planner/components/Stage` passes; `npm run check` exits 0.

**Commit:** `feat(room-planner): draw plan, blueprint and picture from parts`

---

## Task 7: Store actions; lookup removed

**Files:**
- Modify: `room-planner/state/planStore.ts`
- Modify: `room-planner/state/actions.ts`
- Modify: `room-planner/state/uiStore.ts`
- Modify: `room-planner/state/stores.test.ts`
- Modify: `room-planner/config.ts`
- Modify: `room-planner/domain/types.ts`
- Delete: `room-planner/services/mockProductLookup.ts`
- Delete: `room-planner/services/mockProductLookup.test.ts`
- Modify: `room-planner/App.tsx`
- Modify: `room-planner/App.test.tsx`
- Modify: `room-planner/PlannerRoot.test.tsx`
- Modify: `room-planner/components/Sidebar/Sidebar.tsx`
- Modify: `room-planner/components/Sidebar/Sidebar.test.tsx`
- Modify: `room-planner/components/Sidebar/AddFurnitureSection.tsx`
- Modify: `room-planner/components/Sidebar/addFurniture.css`
- Create: `room-planner/components/Sidebar/DimInput.tsx`
- Modify: `room-planner/hooks/useKeyboardShortcuts.test.tsx`
- Modify: `room-planner/state/history.flow.test.tsx`

**Interfaces**

Consumes (Task 1): `Kind`, `StyleValues`, `ItemColours`, `KIND_LABELS`, `KIND_ORDER`,
`TYPICAL_SIZE`, `defaultStyle`, `defaultColours`, `completeStyle`, `normaliseColour`.

Produces, in `planStore.ts` (replacing `addItem(preview: ProductPreview)`):
```ts
/** Adds a piece of `kind` at its typical size, default style and colours, placed exactly as `addItem` places a product today: centre `interiorPoint(room.outline)` (`domain/polygon.ts`), then `placeItem(item, x, y, roomBounds(room), CONFIG.furnitureSnap)` (`domain/geometry.ts`); both functions are unchanged. Returns the new id, or null when the plan is full. */
addFurniture(kind: Kind): string | null;
/** What an item edit may change. */
export interface ItemPatch { name?: string; kind?: Kind; w?: number; d?: number; h?: number; style?: Readonly<Record<string, string>>; colours?: Partial<ItemColours> }
/** Applies a valid patch to the item; returns false and changes nothing when the item is missing or any given field is invalid. */
updateItem(id: string, patch: ItemPatch): boolean;
```
Produces, in `actions.ts` (replacing `placePreview`):
```ts
/** Adds a piece of `kind`, selects it and returns its id; null when the plan is full, in which case the notice 'This plan is full. Remove a piece to add another.' is shown. */
export function addFurnitureOfKind(kind: Kind): string | null;
```
Produces, in `DimInput.tsx`: `DimInput`, the draft-text length input moved out of
`AddFurnitureSection.tsx` (today's `PreviewDimInput`), with props
`{ label: string; stored: number; min: number; max: number; onValue(inches: number): void }`; it
shows the stored value in the plan's units, keeps what the user typed while it does not parse,
and calls `onValue` only for an in-range length.

Removed: `UiState.lookup`, `setLookup`, `updatePreviewDim`, `ProductPreview`,
`CONFIG.lookupDelayMs`, the `lookup` prop of `Sidebar` and `AddFurnitureSection`, the
`createMockProductLookup` call in `App.tsx`. `services/productLookup.ts` and its test are kept
unchanged (slice H uses `parseProductUrl` and `capProductText`).
`CONFIG.previewDimMax` is renamed `itemDimMax` (240) and `itemDimMin: 0.25` is added.

**Exact values**

- New item: `name: KIND_LABELS[kind]`, `host: ''`, `sourceUrl: null`, `price: null`,
  `model: { tier: 'parametric', label: 'Built by the planner', assetUrl: null }`.
- `updateItem` rules: `name` trimmed, 1 to 200 characters; `w`, `d`, `h` finite and within
  `[CONFIG.itemDimMin, CONFIG.itemDimMax]`; `kind` in `KIND_ORDER`; `style` merged over the
  current style then passed through `completeStyle` for the (possibly new) kind, null → invalid;
  `colours` each through `normaliseColour`, null → invalid. A `kind` change without a `style`
  field sets `defaultStyle(newKind)` and keeps size, colours, name (the name is replaced by the
  new kind's label only when it still equals the old kind's label). The centre and angle never
  change. A patch that changes nothing returns true and does not write to the store.
- Section 02 heading: `Add furniture`. Body: one button per kind in `KIND_ORDER`, text
  `KIND_LABELS[kind]`, in a wrapping grid with the existing `btn btn-secondary` classes, under the
  line `Pick a type. You can change its size, style and colours after it is placed.` The link
  box, Fetch button, samples, loading and preview cards are removed.
- In room-edit mode the type buttons are disabled (furniture cannot be selected there).

**Behavior**

| Case | Input / state | Expected |
|---|---|---|
| Add | `addFurniture('sofa')` in the empty starting room | one item: 84 × 36 × 33, default style and colours, name `Sofa`, inside the room |
| Add full | plan at `CONFIG.maxItems` | `null`, nothing added; `addFurnitureOfKind` shows the notice |
| Add selects | `addFurnitureOfKind('bed')` | the new item is selected |
| Add undo | add then undo | the item is gone; redo brings it back |
| Update size | `{ w: 90 }` | width 90, centre unchanged; `{ w: 0 }`, `{ w: 241 }`, `{ w: NaN }` → false, unchanged |
| Update name | `'  My sofa '` → `My sofa`; `''`, 201 characters → false |
| Update style | sofa `{ style: { arms: 'slim' } }` | arms slim, other options kept; `{ style: { arms: 'huge' } }` → false |
| Update colours | `{ colours: { main: '#112233' } }` | main changed, accent kept; `{ colours: { main: 'red' } }` → false |
| Kind change | sofa named `Sofa` → `bed` | kind bed, `defaultStyle('bed')`, name `Bed`, size and colours kept |
| Kind change, renamed | sofa named `Blue couch` → `bed` | name stays `Blue couch` |
| No-op | patch equal to current values | true; the store object is not replaced (no undo step) |
| Missing item | unknown id | false |
| Buttons | section 02 rendered | 11 buttons in `KIND_ORDER`; clicking `Dresser` adds a dresser and selects it |
| Room mode | room-edit mode | the 11 buttons are disabled |
| No lookup left | `git grep -n -i "lookup" -- room-planner ':!room-planner/services/productLookup*'` | no matches |

Order inside the task: run the `git grep` for `lookup` first to list every reference, remove
them, delete the two mock files last. The spec's "free spot (the same placement rule Add box
uses today)" is this placement rule; there is no separate free-spot search today and none is added.

**Verify:** `npx vitest run room-planner/state room-planner/components/Sidebar room-planner/App.test.tsx room-planner/hooks` passes; `git grep -n -i "lookup" -- room-planner ':!room-planner/services/productLookup*'` prints nothing; `npm run check` exits 0.

**Commit:** `feat(room-planner): add furniture by type; remove the placeholder lookup`

---

## Task 8: Item editor

**Files:**
- Create: `room-planner/components/Sidebar/ItemEditor.tsx`
- Create: `room-planner/components/Sidebar/ItemEditor.test.tsx`
- Modify: `room-planner/components/Sidebar/ItemList.tsx`
- Modify: `room-planner/components/Sidebar/itemList.css`
- Modify: `room-planner/components/Sidebar/Sidebar.test.tsx`
- Modify: `room-planner/hooks/useKeyboardShortcuts.ts`
- Modify: `room-planner/hooks/useKeyboardShortcuts.test.tsx`

**Interfaces**

Consumes: `updateItem`, `ItemPatch` (Task 7); `DimInput` (Task 7); `STYLE_OPTIONS`,
`KIND_LABELS`, `KIND_ORDER`, `SWATCHES`, `normaliseColour` (Task 1); `runKeyed`
(`state/historyStore.ts`); `Segmented` (`components/ui/Segmented.tsx`: a `role="radiogroup"` of native radios with props
`name`, `value`, `options`, `onChange`, `aria-label`), used for every style option group.

Produces: `export function ItemEditor({ item }: { item: Item }): JSX.Element`, rendered by
`ItemList` directly after the selected item's row (a sibling of the row button, inside the list).

**Exact values**

- Editor contents, in order, each control labelled:
  1. `Name`: text input, `maxLength` 200; commits on every change that is a valid name.
  2. `Type`: a `<select>` of `KIND_ORDER` with `KIND_LABELS`.
  3. `Width`, `Depth`, `Height`: three `DimInput`s, limits `CONFIG.itemDimMin`–`itemDimMax`.
  4. One `Segmented` per entry of `STYLE_OPTIONS[item.kind]`: `aria-label` = the option's label
     (also shown as visible text above it), `name` = `style-<item id>-<key>`, one radio per value.
     A kind with no options shows none.
  5. `Main colour` and `Accent colour`: each a `role="group"` of one button per `SWATCHES` entry
     (`aria-label` = the swatch label, `aria-pressed` when it equals the stored colour, its
     background set through the element's `style.backgroundColor` from the `SWATCHES` value)
     followed by `<input type="color">` with `aria-label` `Custom main colour` /
     `Custom accent colour`, whose value is the stored colour.
- Colour input changes go through
  `runKeyed('item-colour:' + item.id + ':' + slot, () => updateItem(...))`, so a drag through the
  picker is one undo step (the existing `CONFIG.historyMergeMs` rule). Every other control is one
  undo step per change; text fields use the existing field grouping.
- Keyboard shortcuts (`useKeyboardShortcuts.ts`): the planner's item shortcuts (arrow keys, `R`,
  `Shift+R`, `Delete`, `Backspace`) must not act when the event target is inside the editor
  (`[data-item-editor]`) and is an `input`, `select` or `textarea`; `Delete`, `Backspace` and
  arrow keys must also not act when the target is a button inside the editor. Undo and redo keep
  working there, except inside a text field (unchanged existing rule).
- The editor root has `data-item-editor`. It is not rendered in room-edit mode or when nothing is
  selected. The selected row keeps `aria-pressed`; it gains `aria-expanded="true"`.
- Layout: the editor and each option group use `flex-wrap: wrap` and `min-width: 0` (class
  `item-editor`, `item-editor-options`); a swatch (class `item-swatch`) is 24 px × 24 px, takes
  the planner's standard focus ring (`:focus-visible`, `industry.css` line 133) and, when
  pressed, `box-shadow: 0 0 0 2px var(--color-accent)`. jsdom cannot measure layout, so the
  320 px fit is checked in the live check ("After the tasks", row 6).

**Behavior**

| Case | Input / state | Expected |
|---|---|---|
| Shown | select a sofa | editor after its row with Name, Type, three sizes, six radiogroups, two colour groups |
| Not shown | nothing selected; room mode | no editor |
| Options per kind | select a box; select a dresser | no radiogroups; four radiogroups (Columns, Rows, Base, Handles) |
| Option click | click the `Slim` radio in the `Arms` radiogroup | `style.arms` is `slim`; `Slim` checked, `Track` not |
| Both views update | click `Slim` with the plan view rendered | the sofa's `.plan-part` elements change to the slim-arm layout, and `modelKey` of the stored item differs from before (the 3D view rebuilds on a changed key, Task 5) |
| Editor classes | a rendered editor | root has `item-editor` and `data-item-editor`; each swatch has `item-swatch` |
| Swatch click | click `Navy` under Main colour | `colours.main` is `#2f4057`; that swatch pressed |
| Custom colour | fire `input` on the custom main colour with `#123456` twice within the merge window | colour stored; one undo returns the original colour |
| Size | units ft/in: type `90` in Width (parsed by `parseFurnInput`, `domain/units.ts`, which reads furniture lengths as inches or, in metric, centimetres) | width 90; typing `abc` keeps the text `abc` and the stored width; in metric `100` stores 100 cm = 39.37 in within 0.01 |
| Name | type a new name | row and plan label show it; clearing the field leaves the stored name unchanged |
| Type | choose `Bed` | piece becomes a bed; the option groups switch to the bed's |
| Undo each | option click, then undo | previous value back; editor reflects it |
| Shortcuts in fields | focus the Name input, press `Delete`, `R`, arrow keys | the item is not removed, turned or moved |
| Shortcuts on buttons | focus a swatch button, press `Delete` and an arrow key; focus an option radio, press an arrow key | the item is not removed or moved |
| Shortcut elsewhere | focus the item row, press `Delete` | the item is removed (unchanged) |
| Accessible names | every control | reachable by role and name (`getByRole`) |
| Deselect | select another item | the editor moves to that item with its values |

**Verify:** `npx vitest run room-planner/components/Sidebar room-planner/hooks` passes; `npm run check` exits 0.

**Commit:** `feat(room-planner): edit a piece's size, style and colours`

---

## Task 9: Docs

**Files:**
- Modify: `docs/room-planner/README.md`
- Modify: `docs/room-planner/mistakes-and-fixes.md`
- Modify: `docs/fixes-log.md`

**Behavior**

| Document | Change |
|---|---|
| `README.md` | A "Furniture generator (slice G)" section: the recipe, the parts kit and its three readers, adding by type, the editor, plan format 4. Remove or reword every sentence describing the placeholder product lookup. Update the checks line to the real file and test counts from the final `npm run check`. Add "Known limits of the generator": plain colours only; a chaise sofa collides as its full rectangle; no product lookup until slice H. |
| `mistakes-and-fixes.md` | A `## 2026-11-20 — Furniture generator` section with one entry per mistake recorded in the lean-sdd ledger for this plan (the controller passes the list); if the list is empty the section is omitted. |
| `docs/fixes-log.md` | One entry dated 2026-11-20 in the existing style: what changed and why (the placeholder lookup returned made-up data; furniture is now generated and editable). |

**Verify:** `git grep -n -i "sample\b.*link\|Paste a product link" -- docs/room-planner/README.md` has no matches; `grep -c "Furniture generator (slice G)\|Known limits of the generator" docs/room-planner/README.md` prints 2 or more; the README's checks line shows the file and test counts printed by this task's own `npm run check`; `grep -c "^## 2026-11-20" docs/fixes-log.md` prints 1; `grep -c "^## 2026-11-20 — Furniture generator" docs/room-planner/mistakes-and-fixes.md` prints 1 when the controller passed at least one mistake and 0 when it passed none; `npm run check` exits 0.

**Commit:** `docs(room-planner): furniture generator`

---

## After the tasks (controller, not a task)

The live check gates the pull request: every row must pass, first on the local dev server and
again on the Vercel preview. The controller runs it in a real browser, records each row as
pass or fail with a screenshot in `docs/room-planner/verification/2026-11-20-generator-live-check.md`,
and a failed row is fixed through the executor's fix loop and the whole check is run again. The
owner decides the merge after seeing the record and the screenshots.

| # | Step | Passes when |
|---|---|---|
| 1 | Add each of the 11 types in an empty room | each appears in the list, on the plan and in 3D; no console error |
| 2 | For each type, pick every value of every option once | after each pick the 3D view shows a model with no part outside the selection outline, the count of `.plan-part` elements equals `planParts(item).length` (or the piece is `is-round`), and there is no console error |
| 3 | Set main and accent colour by swatch and by custom colour on one piece | both views show the new colours; one undo per swatch pick; one undo for a custom-colour drag |
| 4 | Download both pictures with a sofa, a round table and a round rug placed | `room-plan.png` and `room-3d.png` download, are non-empty, and show the pieces; the round pieces are round in the floor-plan picture |
| 5 | Copy a share link on the branch and open it in a clean browser profile | the same pieces, styles and colours appear in the preview |
| 6 | At a 1280 px window (320 px sidebar), select a sofa and open every option group | `document.querySelector('.sidebar').scrollWidth <= clientWidth`; no control is cut off |
| 7 | Open a version 3 share link made on the live site before this change (bed and desk) | it opens; the bed and desk have their default style and their earlier colours; position and size unchanged |
| 8 | Load a browser that holds a version 3 saved plan from the live site's build (set through storage on the preview) | the plan loads with default recipes; after one edit the stored plan is version 4 |
| 9 | Blueprint style on, with one of each type | every piece is drawn; no console error |

## Amendment 1 (2026-11-20, after plan review round 2 passed at 86.4)

Minor review findings folded in before any code was written:

- Task 2, invariants: add the size `{0.25, 0.25, 0.25}` to the size list.
- Task 2, Behavior: add the row "Clamp keeps the choice | `seats: '5'` on a 40-wide sofa, then
  the same style object on a 130-wide sofa | the style object is not mutated by `buildParts`; the
  wide sofa has 5 seat cushions".
- Task 8, Behavior: "Undo each" also covers redo: option click, undo, redo → the new value is
  back and the editor shows it; the same for a swatch pick.
- Task 6, picture: "the existing furniture stroke colour" is the stroke style `drawPlanPicture`
  already uses for furniture outlines in `view/planPicture.ts`; "40% opacity" is
  `globalAlpha = 0.4` around the part strokes, restored afterwards; line width is the same as the
  furniture outline's.
- Every commit in this plan is made only after `git branch --show-current` prints
  `furniture-generator` (another session shares this repository through a separate worktree).

## Amendment 2 (2026-11-20, after Task 6's first commit `a52dd29`)

Task 6's rule for a round piece ("exactly one plan part that fills the footprint and is round")
was wrong: a round rug with a border has two round parts and a round table has a round top over
legs, so both were drawn as square boxes, against the spec ("the plan always matches the 3D
view") and live-check row 4. The rule is replaced:

- **A piece is round when any of its plan parts is round and fills the footprint**
  (`fillsFootprint(part)`), whatever other parts it has.
- `planParts.ts` exports `isRoundPiece(parts: readonly PlanPart[]): boolean` with that rule.
- `PlanView`: a round piece's own box gets class `is-round`. Its plan parts are still drawn as
  `.plan-part` hairlines, except the round part(s) that fill the footprint, which the box itself
  already shows.
- Picture: a round piece is filled and stroked as its ellipse (the 16-point outline of the
  filling round part) instead of its rectangle; the other parts are stroked on top as before.
- Blueprint: unchanged (it already draws each part's own outline).

Behavior rows added to Task 6: round rug with border (two round parts) → box `is-round`, one
`.plan-part` (the inner part), picture fills the ellipse; round table on legs → box `is-round`,
leg hairlines present; rectangle rug with border → not round.
