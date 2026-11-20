# Room Planner: furniture generator (slice G) — design

Date: 2026-11-20. Status: awaiting the owner's approval.

## Why

Furniture in the planner is a handful of plain boxes per type, stretched to the item's size
(`room-planner/three/furnitureModels.ts`), in one fixed colour per type. The owner wants pieces
that look like the real product. Real 3D files are not obtainable from Amazon or Wayfair and are
restricted by IKEA, and the owner chose not to pay for photo-to-3D. So the planner builds the
piece itself, in the browser, from a description of it.

## Owner decisions

| Date | Decision |
|---|---|
| 2026-11-20 | Build the in-browser furniture generator before the real product lookup |
| 2026-11-20 | Shapes come from a parts kit; each piece stores a "recipe" (its style and colours) |
| 2026-11-20 | Style is set by word rules and by the user's own picks; no AI photo reader for now |

## Order of work

- **Slice G (this document):** the generator, the recipe, and the controls to add and style a
  piece by hand. No server code. Nothing leaves the browser.
- **Slice H (next, separate design):** the real product lookup for IKEA, Amazon and Wayfair. It
  fills in the same recipe from the page (word rules) and the photo (colours). Its draft is
  `2026-11-18-product-lookup-design.md`; "photo on the piece" in that draft is replaced by this
  generator.

## Design

### 1. The recipe

Every item gains two things, saved with the plan and carried in share links:

- `style`: a small set of options that depend on the type (table below).
- `colours`: `main` (fabric or body) and `accent` (legs, frame or trim), each a `#rrggbb` value.

Width, depth and height stay as they are today and always win: the generator fits every part
inside the item's real size, so collision checks and wall clearances do not change.

| Type | Style options |
|---|---|
| Sofa | Seats (auto from width, or 1 to 5); arms: track, rounded, slim, none; back: low, standard, high; back cushions: loose, tight; legs: block, tapered, metal, none; chaise: none, left, right |
| Chair | Kind: armchair, dining, office; arms: yes, no; legs: block, tapered, metal, pedestal |
| Bed | Headboard: none, low, tall; headboard finish: panel, upholstered; footboard: yes, no; base: platform, legs, storage |
| Desk | Supports: four legs, trestle, panel sides; drawers: none, left, right, both |
| Table | Top: rectangle, round; base: four legs, pedestal, trestle; lower shelf: yes, no |
| Shelf | Shelves (auto from height, or 2 to 8); back panel: yes, no; books: yes, no |
| Dresser (new) | Columns 1 to 3; rows 2 to 6; base: legs, plinth; handles: knob, bar, none |
| Nightstand (new) | Drawers 0 to 2; base: legs, plinth |
| TV stand (new) | Bays 2 to 4; fronts: open, doors, drawers; base: legs, plinth |
| Rug | Shape: rectangle, round; border: yes, no |
| Box | None (a plain box, as today) |

Each type has a default recipe, so a piece looks complete before anything is chosen.

### 2. The parts kit

- A pure function per type turns (type, size, recipe) into a list of parts. A part is a simple
  description: shape (box, rounded box, cylinder, tapered leg), size, position, and which colour
  it takes. This layer has no 3D library in it, so it is tested directly.
- One small adapter turns parts into 3D meshes. Rounded cushions and tapered legs come from
  three.js's own geometry; no new dependency.
- The floor plan, the blueprint and the downloaded floor-plan picture draw the same parts from
  above, so the plan always matches the 3D view. This replaces today's separate table of
  plan shapes (`PARTS` in `domain/catalog.ts`).
- Parts are clamped so nothing looks broken at extreme sizes (for example leg thickness and
  cushion count have sensible limits for a very small or very large piece).
- Models are cached by type, size and recipe, as today, so moving a piece rebuilds nothing.

### 3. In the planner

- **Add furniture.** Section 02 becomes a grid of types. Picking one places it at a typical
  size in a free spot (the same placement rule "Add box" uses today), selects it, and opens its
  style controls. The link box and its "Try a sample" buttons are removed in this slice, because
  they are the fake lookup; the link box returns, working, in slice H.
- **Style controls.** When a piece is selected, its row in "In this room" opens to show name,
  size, the type's style options as button groups, and two colour rows: a set of swatches
  (fabrics, woods, metals, white, black) plus a custom colour. Changes show at once in both
  views.
- **Undo.** Every style and colour change is undoable. Dragging through a custom colour counts
  as one step, like dragging a piece.
- **Type change.** A piece's type can be changed from the same controls; it takes the new
  type's default recipe and keeps its size and colours.

### 4. Saved plans and share links

- The plan format moves to version 4. Version 1 to 3 plans and links load as before; each
  existing item gets its type's default recipe and its type's current colours.
- The recipe is validated as strictly as the rest of the plan: only the listed option values,
  colours only as `#rrggbb`, numbers only within their ranges. Anything else is refused, so a
  crafted share link cannot inject text or oversized values.
- The model fields kept for a future 3D file (`model.tier`, `model.assetUrl`) stay as they are.

### Defaults chosen (say if any should change)

1. The fake link box is removed now and comes back as the real lookup in slice H. Until then
   furniture is added by type.
2. Three new types: dresser, nightstand, TV stand.
3. A sofa with a chaise is drawn with its chaise, but its collision outline stays the full
   rectangle of its width and depth.
4. Plain colours only: no fabric patterns, wood grain or photos on surfaces.
5. Existing saved pieces will look different after this change (better shapes, same size and
   position). Nothing moves.

## Error handling

| Situation | Behaviour |
|---|---|
| A saved plan or link has an unknown style value or bad colour | The plan is refused with the existing "could not be read" notice |
| A piece is too small for a chosen option (for example 5 seats on a 30 in sofa) | The option is clamped to what fits; the stored choice is kept so it returns when the piece is widened |
| The 3D build of one piece fails | That piece falls back to a plain box of its size; the rest of the room still renders |

## Testing

- Parts functions: for every type and option value, parts stay inside the item's size, no part
  has a zero or negative dimension, and the result is identical for identical input. Extreme
  sizes at both limits.
- Plan format: version 3 to 4 upgrade, round trip through save and share link, and refusal of
  each kind of bad recipe value.
- Planner: adding each type, changing each option and colour updates both views, undo and redo
  of style changes, colour drag as one undo step, type change.
- Views: the floor plan, blueprint and picture draw the same parts as the 3D view.

## Verification

`npm run check` green, then a browser run on the Vercel preview: add every type, change every
option group once, check the floor plan against the 3D view, download both pictures, open a
share link, and open a link made before this change. Screenshots of every type go to the owner.

## Out of scope

The real product lookup, word rules and colours from a photo (slice H); an AI photo reader;
photo-to-3D on the owner's PC; patterns and textures; curved or modular sofas; mobile layout.
