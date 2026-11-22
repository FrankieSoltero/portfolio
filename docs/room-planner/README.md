# Room Planner docs

Documentation for the `/room-planner` section: a room layout tool (2D plan and 3D check,
React and three.js, client-side only). Source is in `room-planner/`, the route is in
`app/room-planner/`.

Documents dated 2026-11-12 were written in the standalone repository, where the code
lived in `src/`. That folder is `room-planner/` in this repository.

## What the planner does

- **The room is an outline.** It is a closed outline of straight walls, edited in "Edit room"
  mode. Drag a corner to move it. Press Delete to remove the selected corner. Three starting
  shapes (rectangle, L-shape, notched) are one click away. A shape that would be invalid, such as
  one with crossing walls, is refused and the reason is shown in the sidebar.
  - **Walls are edited directly on the plan.** A click on a wall selects it. Pressing a wall and
    moving more than 4 px slides it at right angles to itself, and every angle in the room is
    kept: each end travels along its neighbouring wall. The distance snaps like a corner drag. If
    a neighbour runs the same way as the dragged wall (after a corner was added mid-wall), a short
    connecting wall is made at that end; dragging back in line removes it. A double-click on a wall
    adds a corner there, as does the add button (`+`) in the wall list. The arrow keys slide the
    selected wall by 1 in (Shift: 12 in) in the direction of the arrow on screen; an arrow along
    the wall does nothing. Escape clears the selection. A slide that would break a rule (a wall
    too short, crossing walls, a room or corner count over the limit, a door or window that no
    longer fits) stops at the last accepted position and the reason is shown. Furniture and
    obstacles do not move with a wall; anything left outside the room is flagged as usual.
  - **Each wall shows its length** on the plan, outside the room, in the current units. A click
    on it (or Enter on it, as each is a button in the tab order) opens a field with the length:
    Enter applies it and Escape cancels. A length refused on Enter leaves the field open with the
    reason. Leaving the field also applies it and always closes the field; a refused length then
    changes nothing and the reason is shown.
  - **Which end moves.** A typed length keeps every angle. A choice of three arrows along the wall
    (start, both ends, end; the default is the end) says which end moves. It is beside the
    on-plan field and above the sidebar wall list, is kept for the session only and is not saved
    with the plan. The end or ends that will move are marked on the plan, and focusing a wall's
    length field in the sidebar selects that wall so the mark shows.
  - Wall lengths can also be typed in the sidebar, where each keystroke applies. The two overall
    dimension lines stay and sit further from the room in room mode, clear of the wall labels.
    Door or window tools armed: a click on a wall places the opening and a wall is not dragged,
    and the length labels ignore the pointer.
- **Undo and redo.** Cmd/Ctrl+Z undoes. Shift+Cmd/Ctrl+Z and Ctrl+Y redo. The header has
  an `Undo` and a `Redo` button beside the title, and each undo or redo is announced as
  "Undone" or "Redone". One step is one thing the visitor did:
  - a whole drag, from press to release;
  - a run of arrow-key or R presses on the same thing, until 1 second passes without a key or
    something else is changed;
  - everything typed in one sidebar field, until focus leaves it;
  - one length typed on the plan and applied with Enter;
  - one add or remove of furniture, a corner, a door, a window or an obstacle;
  - one change of starting shape.

  A refused action, or one that changes nothing, adds no step. Undo covers everything saved in
  the plan. It does not cover the units, the selection, the mode, the layout or the camera. A selection that points at something undo removed is cleared. Undo and
  redo work the same in both modes and follow one timeline. The history lasts for the visit and
  holds 100 steps. A reload clears it, and so does `Reset plan`. While the cursor is in a text
  field, the keys leave the browser's own text undo alone.
- **Furniture and obstacles stop at walls.** A piece that is wholly inside the room, moved by
  a drag or by the arrow keys, stops flush against every wall, including an L-shape's cut-out
  and angled walls. It slides along the wall as the drag goes on, and a piece pushed into a
  corner stops flush against both walls, even when the room or the piece is not a whole number of
  inches. An arrow-key nudge moves straight and stops: it goes the part of the step that fits and
  never slides sideways along a wall. A drag past the room's bounding box beyond an angled wall
  still goes towards the pointer. The rule is in `room-planner/domain/wallStop.ts`. Some things are not pushed back:
  turning a piece (R, Shift+R, the Angle field), changing the room (a wall drag, a typed
  length, a starting shape), typed sizes, and a piece that is already partly outside. Such a
  piece is flagged as usual and moves freely until it is wholly inside again. Furniture can
  still overlap other furniture and obstacles, which stays a red conflict.
- **Furniture rotates to any angle.** R turns the selected piece by 90°, Shift+R by 15°, and
  the Angle field takes any value.
- **Doors, windows and obstacles are added in "Edit room" mode.** The Room section of the sidebar
  has `Add door`, `Add window`, `Add box` and `Add column`.
  - A *door* is 32 in wide and 80 in high by default and swings in. `Add door` arms a tool and
    the next click on a wall places it, centred on the click and moved along the wall to fit. While
    the tool is armed each wall row has a button that places it at the wall's midpoint (the
    keyboard path); Escape disarms. A door is a gap in the wall on the plan. Its leaf and swing
    arc are drawn above the furniture, in a layer that ignores the pointer. A door that swings in
    reserves its quarter-circle arc; a door that swings out reserves a strip its own width and 24 in
    deep. Furniture or an obstacle inside the reserved area is a conflict, flagged and counted.
  - A *window* is 36 in wide, with its sill at 36 in and 48 in high. On the plan it is a band in the
    plan's background colour across the wall with three thin lines. Furniture taller than the sill
    and within 6 in of the wall in front of the window gets an amber warning. Warnings are
    listed in the sidebar and are not counted as conflicts.
  - An *obstacle* is a fixed box, a raised box (its `elevation` is above 0, so furniture shorter
    than the underside can sit beneath it) or a round column (a cylinder; `width` is its
    diameter; a new column is as tall as the room). It is drawn hatched with its label (plain text,
    at most 40 characters). Furniture conflicts with an obstacle when the footprints and
    the height ranges both overlap. An obstacle partly outside the room, taller than the room or
    inside a door's reserved area is flagged. Obstacles do not conflict with each other.
  - A door or window slides along its wall by dragging its handle or with the arrow keys, and
    snaps to 1 in. Each arrow moves it the way the arrow points on screen; an arrow across the
    wall does nothing. An obstacle is dragged and rotated like furniture, but only in "Edit room"
    mode. Each has exact-size fields in the sidebar, and Delete removes the selected one. In room
    mode only the primary mouse button selects or drags, and a press on a handle, obstacle or
    corner also focuses it. Openings on one wall are numbered together by offset, in the plan
    handles and in the sidebar rows (`Door on wall 1 (1 of 2)`). Obstacles that share a name are
    numbered by list order in the sidebar rows and the plan buttons' names (`Box (1 of 2)`); the
    label drawn on the plan is not numbered.
  - Openings must fit inside their wall and must not overlap. A corner drag, wall drag or typed
    wall length that would break this stops at the last valid position and the sidebar says why.
    An opening keeps its place in the room when the start of its wall slides along the wall in a
    wall drag, a typed wall length or the rectangle width and length fields, so a door does not
    travel when a neighbouring wall is dragged. A corner drag keeps a door's distance from its
    wall's start corner (as before). An edit that would leave one past its wall's end is refused:
    "That would leave a door or window without room on its wall." Deleting a corner is refused
    while its own wall (the one that starts at it) has a door or window, or while the wall before
    it has one and would change direction; a corner in a straight run can be deleted with a door on
    the wall before it. A corner added to a wall keeps each opening on the part it lies on, and
    cannot be added inside an opening. If an edit reverses the outline, each opening stays on its
    physical wall. A starting shape replaces every wall, so it is refused while the room has a door
    or window.
  - In the Styled 3D view the walls have the door and window holes cut out. Each hole has a thin
    dark frame, and windows have a glass pane. The Blueprint view cuts the same holes, draws
    obstacles, and draws a raised obstacle's underside when the camera is below it.
- **Fit checks use the true footprints.** Rotated pieces are checked against the outline and
  against each other using their real rotated footprints.
- **The plan is saved in the browser.** Changes are saved automatically in `localStorage`
  under the key `room-planner:plan:v1`. The stored data is treated as untrusted and validated
  on load (`room-planner/domain/planSchema.ts`). It is never sent to a server. "Reset plan"
  erases it and puts back the starting plan. The stored document is `schemaVersion` 4: it
  carries `openings` and `obstacles`, and each piece carries its `style` and `colours` (see
  "Furniture generator (slice G)"). A version 2 document loads with both lists empty, and a
  version 1 to 3 document loads with each piece given its type's default recipe. The key is
  unchanged.
- **The starting plan is an empty room.** With nothing saved, and after `Reset plan`, the planner
  shows a 12 × 14 ft room, 8 ft tall, with no furniture, doors, windows or obstacles
  (`createInitialDocument()` in `room-planner/domain/catalog.ts`). It used to hold a bed and a
  desk. A plan already saved in a visitor's browser loads as it was, furniture included.
- **Sharing.** A `Share` button in the header, after Undo and Redo, opens a panel with `Copy link`,
  `Download floor plan` (`room-plan.png`) and `Download 3D view` (`room-3d.png`). The link is
  `/room-planner#plan=1.<data>`: the whole plan, compressed, after the `#`, so it is never sent
  to a server. Opening a link shows the shared plan as a preview, with a banner and the buttons
  `Keep this plan` and `Back to my plan`; the visitor's own plan is not changed until they keep it.
  A visitor with no saved plan gets the shared plan directly. The link is read in
  `room-planner/services/shareLink.ts` and goes through `parsePlan` like any stored plan. The
  spec is [`specs/2026-11-17-sharing-design.md`](specs/2026-11-17-sharing-design.md).

Known limits. The Blueprint approximation and the two-tabs overwrite are decisions 5 and 9 of
the plan [`plans/2026-11-13-room-shape-and-saving.md`](plans/2026-11-13-room-shape-and-saving.md);
the desktop-only layout comes from the original design handoff
([`design_handoff/README.md`](design_handoff/README.md)).

- The layout is designed for desktop widths. It does not reflow on a phone.
- The Blueprint view's hidden-surface order is approximate in very concave rooms.
- Two tabs open at once overwrite each other's saved plan.
- Ctrl+click on macOS arrives as the primary button and still starts a drag.
- Drags are not tracked per pointer. Focus drops to the page when a focused handle is deleted.
- The Blueprint view's painter's sort is cubic in the worst case. 64 columns make that worst case
  about twice as slow.
- A whitespace-only obstacle label is shown as it is, so its accessible name is blank.
- In metric units a size is shown rounded to whole centimetres, and a size near a limit can be
  refused if re-typed as shown: a 12 in door width shows as 30 cm, and 30 cm is 11.81 in, under
  the 12 in minimum.
- The import-boundary test (nothing under `room-planner/view/` or `room-planner/domain/` imports
  three.js) does not catch a bare `'../three'` directory import or `require()`.

Known limits of wall editing (slice D):

- Double-tap to add a corner is not verified on a touch device (it relies on the browser's
  `dblclick`).
- There are no alignment guides and no locked lengths.
- On very short walls neighbouring length labels touch or overlap.
- A wall dragged towards a door or window stops at the last pointer position before it, not
  exactly at its edge.
- In Safari a click on another wall's label discards an open length field's text; in other
  browsers it applies it first.
- A neighbouring wall that is almost, but not quite, in line with the dragged wall (more than
  about 0.3 degrees off) makes its corner travel far for a small drag; the size limits refuse
  the result.
- A typed length still applies on each keystroke in the sidebar (the on-plan field applies on
  Enter).

Known limits of undo and redo (slice E):

- Undo and redo were not run in Safari or Firefox, and no screen reader was run.
- With a length being typed on the plan, the header's Undo button behaves differently by
  browser. Where a clicked button takes focus, the typed length is applied and then taken back.
  In Safari the step before is taken back and the field stays open.
- A drag or typed edit that ends exactly where it started still counts as a step, so undoing it
  shows no change (the design says an edit that changes nothing adds no step; this case is the
  exception).
- After a layout or units option is clicked it keeps keyboard focus. Arrow keys then change that
  option, not the selected furniture, until something else is clicked. This is older than this
  slice.
- A press on a focused field's own label or unit suffix splits one typing run into two undo
  steps.
- If a text field stays focused while the plan is loaded or reset, typing in it afterwards is
  one step per keystroke until the field is focused again. This cannot happen today.
- `Reset plan` cannot be undone, on purpose.
- In development only: a hot reload of `state/historyStore.ts` leaves the old listener attached
  until the page is reloaded.

Known limits of stop at walls:

- Along an angled wall the piece can lag the pointer slightly. The piece never crosses the wall.
  Over 60 probe drags into angled walls (7,200 frames) the lag was 0.05 in or less on 92% of the
  584 frames that lagged at all and more than 0.71 in on one frame only (1.26 in). Before the
  whole-change review's fix it was typically 0.5 to 2 in, worst 5.3 in for two frames.
- A column is checked as a 16-sided outline, so against an angled wall its true circle can reach
  up to about 2% of its radius past the wall (0.23 in for a 24 in column). The conflict check
  uses the same outline.
- Turning a piece near a wall is not pushed back. It can turn red.
- Changing the room never moves furniture. A piece left outside turns red and drags freely
  until it is wholly inside again.
- A fast drag can carry a piece across an L-shape's cut-out to the other arm.
- Furniture still overlaps other furniture and obstacles (red), by the owner's choice.
- Cost grows with the number of angled walls. About 0.1 ms per move in rooms of up to 6
  corners; in a room where every wall is angled about 0.4 ms (box) to 1.1 ms (column) at 16
  corners and 4.3 ms (box) to 12.4 ms (column) at 64 corners, the most the planner allows
  (measured by a reviewer's probe on the development machine; the probe is not kept in the
  repo), and about 0.5 to 1.7 ms and 6 to 17 ms when the pointer is beyond the room's bounding
  box. The live check's longest pointer-move handling was 7.3 ms (mean 1.56 ms) in the L-shape
  room, most of it rendering.
- Safari and Firefox were not run.

Known limits of sharing (slice F). The first five are in the spec; the rest were found while
building and are in the executor's ledger or the live check.

- A link is a snapshot. Later edits need a new link.
- Anyone who has the link has the plan. There is no way to take a link back.
- Very large plans make links of several thousand characters, which some chat apps cut. A cut
  link shows "This shared link could not be read."
- No short links, no PDF, no phone layout, no system share sheet.
- Safari and Firefox were not run. Without `CompressionStream` (browsers before 2023) links are
  longer but still work.
- The 3D picture includes the current selection (an outline in the realistic view, the piece's
  tag in the blueprint view), since it is exactly what the camera shows.
- Switching Realistic/Blueprint closes the Share panel (a click outside it).
- A wall length is always drawn level; on a very short wall next to another its text can touch a
  neighbouring wall or label.
- Name shortening in the picture can cut an emoji made of several code points.
- With storage blocked or a saved plan from a newer planner, an unreadable link shows the
  storage or newer-planner notice, not "This shared link could not be read."
- Turning a piece near a wall can still leave it partly outside (older behaviour, seen again
  while setting up the live check).
- `planPictureSize` divides by zero for a zero-size outline; callers never pass one.
- There is no test for a zero-length wall in the floor-plan picture.
- `SceneRenderer.capture()` has no try/catch of its own; only `captureView()` catches a throw
  from render or `drawImage`.
- In `download.ts`, `link?.remove()` in `finally` is outside the `try`.
- The link decoder accepts base64url with non-canonical trailing bits.
- Edits made while a keep's save is in flight are not scheduled until the next edit (one
  microtask with the browser store).
- No test throws from `window.location` or `history` to prove `shareLocation` never throws.
- `document.fonts.ready` is awaited with no timeout before a picture is drawn.
- The fallback link field is not refocused or reselected on a repeat `Copy link`, and stays after
  a later successful copy.
- Some comment lines in `App.tsx` and `Header.tsx` are over-long.
- `Copy link`'s catch shows the too-large message for any throw (none can happen today).
- `clearStaleSelections` is duplicated in `usePlanPersistence.ts` and `historyStore.ts`.

Changed behaviour (slice D, wall editing). These are on purpose:

- A typed wall length keeps every angle. It used to move only the end corner and tilt the next
  wall.
- Removing a corner that lies in a straight run is allowed with a door on the wall before it,
  because the wall keeps its direction. It used to be refused.
- Doors and windows keep their place in the room when the start of their wall moves along the
  wall in wall drags, typed wall lengths and the rectangle width and length fields. Before, they
  kept their offset from the wall's start and travelled with it. A corner drag keeps a door's
  distance from its wall's start corner (as before). An edit that would leave one past its wall's
  end is refused with "That would leave a door or window without room on its wall."
- A plain click on a wall selects it. It used to add a corner; that is now a double-click (or the
  `+` button in the sidebar).
- In room mode the overall dimension lines sit further from the room.

Changed behaviour (stop at walls). This is on purpose:

- A piece moved from inside the room used to be allowed across a wall, with only its centre
  kept inside, and turned red. It now stops flush against the wall. This reverses a decision of
  the first slice.

The checks on the final code: `npm run check` passes with 76 test files and 2,846 tests, and the build
shows `/room-planner` at 105 kB First Load JS (1.42 kB route size). `npm audit --omit=dev` reports 4 low
severity findings (the KaTeX chain), the same as before the sharing work.

Open questions for the owner (slice C):

- Starting shapes are refused while doors or windows exist. Should they instead keep the openings
  that still fit?
- `Add box` and `Add column` place the obstacle at the room's interior point, which can be on a
  piece of furniture (in the old furnished starting plan it was on the bed). Should they find a free
  spot?
- Door arcs are drawn above furniture. The plan drew them under; this changed after the live check
  (row X1), because the arc could not be seen in the one case where it matters. Is this the
  wanted look?

The limits on a plan (200 items, 64 corners, coordinates within ±120 ft) are enforced both
when editing and when loading, so an edit can never produce a saved plan that fails to load.

## Furniture generator (slice G)

Furniture used to be a handful of plain boxes per type in one fixed colour, added from a
placeholder product lookup that returned made-up data. Pieces are now built in the browser from
a saved recipe. Nothing leaves the browser. The spec is
[`specs/2026-11-20-furniture-generator-design.md`](specs/2026-11-20-furniture-generator-design.md)
and the plan is [`plans/2026-11-20-furniture-generator.md`](plans/2026-11-20-furniture-generator.md)
(Amendments 1 and 2).

- **The recipe.** Every piece has a `style` (options that depend on its type, such as a sofa's
  seats, arms, back, legs and chaise) and `colours` (`main` and `accent`, each `#rrggbb`). Width,
  depth and height stay as before and always win: every part is fitted inside the piece's real
  size, so collision checks and wall clearances did not change. Each type has a default recipe,
  so a piece looks complete before anything is chosen. The recipe is defined in
  `room-planner/domain/furniture/recipe.ts`.
- **The 11 types.** Sofa, chair, bed, desk, table, shelf, rug and box, plus three new ones:
  dresser, nightstand and TV stand.
- **The parts kit and its three readers.** A pure function per type turns (type, size, recipe)
  into a list of parts (`room-planner/domain/furniture/parts/`). It has no 3D library in it. The
  3D view builds meshes from the parts (`room-planner/three/furnitureModels.ts`, using
  three.js's own `RoundedBoxGeometry`; no new dependency). The floor plan, the blueprint and the
  downloaded floor-plan picture read the same parts from above, through `planParts`
  (`room-planner/domain/furniture/planParts.ts`), so the plan matches the 3D view. A piece is
  drawn round when any of its plan parts is round and fills the footprint. An option that does
  not fit a small or large piece is clamped, and the stored choice is kept so it returns when the
  piece is resized. In the downloaded floor-plan picture a round piece is drawn with 48 points,
  where the plan and the blueprint use 16.
- **Adding by type.** Section 02 of the sidebar is a grid of the 11 types. Picking one places a
  piece of a typical size in a free spot, selects it and opens its editor. The link box and its
  sample buttons are gone.
- **The editor.** A selected piece's row in "In this room" opens to show its name, its type, its
  size, the type's style options as button groups, and two colour rows (swatches plus a custom
  colour). Changes show at once in both views. Every change is one undo step, and dragging
  through a custom colour is one step. Changing the type gives the piece the new type's default
  recipe and keeps its size and colours. An edit checks only the sizes it changes, so a piece
  loaded with a size above the editor's limit can still be renamed.
- **Plan format 4.** The plan is saved and shared as `schemaVersion` 4. Plans and links of
  versions 1 to 3 load as before, and each existing piece gets its type's default recipe and
  its type's colours. A saved plan is stored as version 3 until the first edit. The recipe is
  validated by `parsePlan` as strictly as the rest of the plan: only the listed option values,
  colours only as `#rrggbb`, numbers only within their ranges.

Known limits of the generator:

- Colours are plain: no fabric patterns, wood grain or photos.
- A sofa with a chaise collides as its full rectangle.
- There is no product lookup until the next slice.
- Some options do nothing in some combinations: the office chair's Legs, Lower shelf with a pedestal base, and Chaise on a sofa under 60 in wide.
- A plan near the 200-piece limit is slow in the blueprint view.
- When a piece stands on a rug, their names overlap in the downloaded floor-plan picture.
- Size fields apply each keystroke, so a piece resizes while a number is being typed.

The live check is in
[`verification/2026-11-20-generator-live-check.md`](verification/2026-11-20-generator-live-check.md).
The mistakes found while building it are in `mistakes-and-fixes.md` under
"2026-11-20 — Furniture generator".

## Product lookup (slice H)

A visitor can paste a link to an IKEA, Amazon or Wayfair product. The site reads the page and fills
in a furniture recipe, and the generator draws the piece. This is the site's first server route.
The spec is [`specs/2026-11-18-product-lookup-design.md`](specs/2026-11-18-product-lookup-design.md)
and the plan is [`plans/2026-11-20-product-lookup.md`](plans/2026-11-20-product-lookup.md)
(Amendments 1 to 3). The plan stays at `schemaVersion` 4 and `Item` has no new field. The photo
address is never saved, so a share link never makes a viewer's browser contact a shop.

### The request path

1. The visitor pastes a link into the link box (`room-planner/components/Sidebar/ProductLinkBox.tsx`)
   and presses Look up.
2. `room-planner/services/remoteProductLookup.ts` checks the link, upgrades an `http` shop link to
   `https`, and sends `POST /api/room-planner/lookup` with the body `{ "url": "..." }`.
3. The route (`app/api/room-planner/lookup/route.ts`) hands the request to `handleLookup` in
   `room-planner/server/lookupHandler.ts`. It checks, in this order: the `Origin` header, the
   content type and body size, the link, the shop list, the rate limit. Only then does it fetch.
4. `fetchShopPage` (`room-planner/server/safeFetch.ts`) downloads the page under the rules below.
5. The reader for that shop (`room-planner/server/readers/`, chosen by `readers/index.ts`) pulls out
   the product fields. The handler checks them against the contract again and answers with the
   fields only, never the page. A failure is answered `{ error }` with one of `invalid_url`,
   `unsupported_shop`, `blocked`, `not_a_product`, `unavailable` or `rate_limited`.
6. In the browser, `room-planner/domain/furniture/fromProduct.ts` turns the name and description
   into a recipe by word rules. The main colour is a colour word in the name, or else the photo.
   `room-planner/services/photoSampler.ts` draws the photo small on a hidden canvas and
   `room-planner/domain/furniture/photoColours.ts` picks the colours from its pixels. A product on a
   backdrop has the backdrop removed first. A styled room photo (its four corner pixels differ by
   more than 24 in some channel) has no backdrop removed; only the central half of its width and of
   its height is counted, without transparent and near-white pixels. If the photo cannot be read,
   the type's default colours are used.
7. `ProductPreviewCard.tsx` shows the photo, name, price and the piece, with Type and the three
   sizes editable. The photo is requested with `crossOrigin="anonymous"`, as the sampler requests
   it, so no shop cookie is sent with it. Add to room places it like any other piece, selected, with its link and price.
   After that it is an ordinary piece and one undo removes it.

### File map

- `room-planner/lookup/` — code shared by the browser and the server: `shops.ts` (the shop list and
  `shopForHost`) and `contract.ts` (the answer's shape, the limits and the error codes).
- `room-planner/server/` — server-only code, imported only by the route and by server tests:
  `lookupHandler.ts`, `safeFetch.ts`, `rateLimit.ts`, `sizes.ts` and `readers/` (one reader per
  shop, `shared.ts`, and saved real pages in `readers/fixtures/`).
- `app/api/room-planner/lookup/route.ts` — binds the handler to `POST`. Node runtime, never cached,
  `maxDuration = 20` seconds on the platform (the lookup itself gives up after 8 s).
- `room-planner/domain/furniture/fromProduct.ts` and `photoColours.ts` — name to recipe, photo to
  colours.
- `room-planner/services/remoteProductLookup.ts` and `photoSampler.ts` — the browser's call to the
  route and its reading of the photo's pixels.
- `room-planner/components/Sidebar/ProductLinkBox.tsx` and `ProductPreviewCard.tsx` — the link box
  and the preview.

Nothing under `components`, `state`, `services`, `domain`, `hooks`, `three` or `view` may import
from `room-planner/server/` or from `node:` modules.

### Security rules of the route

The danger is server-side request forgery: tricking a server into making requests to machines it
should not reach. The route fetches a link a stranger typed, so every rule below limits where that
fetch can go.

- **Shop list.** Only IKEA (`ikea.com`), Amazon (`amazon.com`, `a.co`) and Wayfair (`wayfair.com`)
  hosts, and their subdomains. The whole string must be a plain host name of at most 253
  characters, so look-alikes such as `ikea.com.evil.example` and `evil.example#.ikea.com` fail.
  Anything else is `unsupported_shop` with no outgoing request.
- **Address check.** The host name is resolved first. If any address is private, loopback,
  link-local or otherwise not public, the fetch is refused (`blocked`).
- **Pinned address.** The connection is made to an address that was checked, so the name cannot
  change its answer between the check and the connection. Every address must pass; of those, the
  first IPv4 address is used when there is one, else the first address.
- **Redirects.** Followed by hand, at most 3. Each hop is checked again against the shop list and
  the address rules.
- **Limits.** `https` only, port 443 only. Request body 4096 bytes. Link 2048 characters. Page 4 MiB,
  counted both before and after decompression. 8000 ms for the whole lookup. Only `text/html`
  is parsed. Name 200 characters and description 600. A size is kept only when finite, above 0 and
  at most 10000 in. A price is kept only in US dollars, above 0 and at most 10,000,000. A photo
  address is returned only when it is `https` on `ikea.com`, `m.media-amazon.com` or
  `assets.wfcdn.com` (or their subdomains).
- **Origin check.** The `Origin` header must be present and its host must equal the request's
  `Host` header. A missing or foreign `Origin` is answered 403.
- **Rate limit.** 20 lookups per 600,000 ms (10 minutes) per address, kept in memory. Over the limit
  is 429 with `Retry-After` (sent only when the wait is a whole number of seconds of at least 1).
  Only a request that reaches the fetch is counted.
- **Reader name.** The request says `RoomPlannerLinkPreview/1.0`, sends no cookie and no referer,
  does not retry, does not rotate addresses and does not solve challenges. A refusal is `blocked`.
- **Logging.** One line per request: `{ "event": "room_planner_lookup", "shop": ..., "outcome": ... }`,
  where `shop` is `ikea`, `amazon`, `wayfair` or `null` and `outcome` is `ok` or an error code.
  Never the link, the address, headers or page content.
- **Page text is untrusted.** It is cut to the limits above and shown as React text only.
- No secrets or environment variables are used.

### Vercel firewall rule (for the owner)

The in-app rate limit is per server instance, so it slows abuse but does not stop a determined
caller. This rule is the hard limit. The owner adds it in the Vercel dashboard after the merge;
nothing in the code adds it.

- Path equals `/api/room-planner/lookup`
- Rate limit: 20 requests per 10 minutes per IP
- Action: deny, with status 429

### How to add a shop

1. Add the shop and its host names to `room-planner/lookup/shops.ts` (subdomains match too) and
   extend `shops.test.ts`, including look-alike hosts. Add the shop's name to the `Shop` type and to
   the reader table (step 4).
2. Add the shop's photo host to `PHOTO_DOMAINS` in the same file (`https` only), with a test that
   a foreign photo host is dropped.
3. Write a reader in `room-planner/server/readers/` (for example `newshop.ts`) that returns
   `ProductFields` or `null`. Use `readers/shared.ts` for the product data block where the shop
   has one. Write down where each field comes from for that shop.
4. Add the reader to the table in `room-planner/server/readers/index.ts`.
5. Save a trimmed real product page and a category page in `readers/fixtures/`, and add tests in
   `readers/readers.test.ts`: a product page, a category page, missing fields, hostile text. If
   the fixture lacks an element a rule reads, build a realistic one first.
6. Update the shop list in the note under the link box (`ProductLinkBox.tsx` and its test).
7. Measure the shop from the deployed route. If it refuses the server, record it as hand entry
   only and correct the note.

### Known limits of the lookup

- Only IKEA, Amazon and Wayfair links are looked up; other shops are added by type.
- Whether Amazon and Wayfair answer the live server is measured after merge. A shop that refuses
  becomes hand entry only.
- The rate limit is in memory, per server instance. It slows abuse and does not stop a determined
  caller. The hard limit is the Vercel firewall rule the owner adds.
- A hostile page just under 4 MiB can still cost up to about 1.8 s of CPU time on the development
  machine (measured 2026-11-22 on 25 shapes through all three readers; the slowest is a flood of
  `<a>`, which is almost all parsing). Every reader step is linear: blocks are found by id in one
  walk, nothing inside them is found with a selector, ancestor walks stop at 16 levels, and text is
  read up to a bound.
- Timing tests measure CPU time (`process.cpuUsage()`) and retry twice. On a machine with
  efficiency cores the heaviest hostile case can still exceed its 2 s bound in the full parallel run
  (CPU time on an efficiency core is several times longer); see entry 14 in
  `mistakes-and-fixes.md`.
- A 422 or other refusal from the route shows as a "Failed to load resource" line in the browser
  console, which the browser writes itself.
- `dns.lookup` cannot be cancelled, and Node adds `Connection: close` to the outgoing request.
- The Origin check compares hosts, not schemes, and does not stop non-browser callers. They are
  bounded by the rate limit and can only make the server read a shop page.
- Word rules read English names and descriptions only. Broad words in a description can set a style
  the product does not have (`office`, `round`, `open`). `no drawer pulls` reads as no drawers.
  Accessories named after furniture (`bed sheet set`, `bedside lamp`) are read as that furniture.
  The preview lets the visitor change type and sizes, and the editor every option.
- Colour from the photo is a guess: shadows and transparent backgrounds can throw it off, and a
  styled room photo is read from its centre, which may not be the product. A colour word in the
  name wins.
- Amazon sizes without labels are filled in as depth, width, height, with a note to check them.
- The product photo is shown only in the preview and is never saved.
- Plain colours only, as in the generator.

The mistakes found while building it are in `mistakes-and-fixes.md` under
"2026-11-20 — Product lookup".

## Folders and files

- `specs/` — design specs for the planner and for its move into the portfolio. The wall editing
  spec is [`specs/2026-11-14-wall-editing-design.md`](specs/2026-11-14-wall-editing-design.md).
  The undo and redo spec is
  [`specs/2026-11-16-undo-redo-design.md`](specs/2026-11-16-undo-redo-design.md). The stop at
  walls spec is
  [`specs/2026-11-16-stop-at-walls-design.md`](specs/2026-11-16-stop-at-walls-design.md). The
  sharing spec is [`specs/2026-11-17-sharing-design.md`](specs/2026-11-17-sharing-design.md). The furniture generator spec is
  [`specs/2026-11-20-furniture-generator-design.md`](specs/2026-11-20-furniture-generator-design.md).
- `plans/` — implementation plans, one per spec. The room shape and saving work is in
  [`plans/2026-11-13-room-shape-and-saving.md`](plans/2026-11-13-room-shape-and-saving.md). The
  doors, windows and obstacles work is in
  [`plans/2026-11-14-openings-and-obstacles.md`](plans/2026-11-14-openings-and-obstacles.md)
  (Amendments 1 to 6, plus the inserted fix tasks 12b and 13b). The wall editing work is in
  [`plans/2026-11-14-wall-editing.md`](plans/2026-11-14-wall-editing.md) (Amendments 1 to 9). The
  undo and redo work is in [`plans/2026-11-16-undo-redo.md`](plans/2026-11-16-undo-redo.md)
  (Amendments 1 to 5). The stop at walls work is in
  [`plans/2026-11-16-stop-at-walls.md`](plans/2026-11-16-stop-at-walls.md) (Amendment 1). The sharing work is in
  [`plans/2026-11-17-sharing.md`](plans/2026-11-17-sharing.md) (Amendments 1 to 3). The furniture generator work is in
  [`plans/2026-11-20-furniture-generator.md`](plans/2026-11-20-furniture-generator.md) (Amendments 1 and 2).
- `plan-reviews/` — plan-review verdicts for those plans. The review of the room shape and
  saving plan is
  [`plan-reviews/2026-11-13-room-shape-and-saving-review.md`](plan-reviews/2026-11-13-room-shape-and-saving-review.md).
  The review of the openings plan is
  [`plan-reviews/2026-11-14-openings-and-obstacles-review.md`](plan-reviews/2026-11-14-openings-and-obstacles-review.md).
  The review of the wall editing plan is
  [`plan-reviews/2026-11-14-wall-editing-review.md`](plan-reviews/2026-11-14-wall-editing-review.md).
  The review of the undo and redo plan is
  [`plan-reviews/2026-11-16-undo-redo-review.md`](plan-reviews/2026-11-16-undo-redo-review.md).
  The review of the stop at walls plan is
  [`plan-reviews/2026-11-16-stop-at-walls-review.md`](plan-reviews/2026-11-16-stop-at-walls-review.md).
  The review of the sharing plan is
  [`plan-reviews/2026-11-17-sharing-review.md`](plan-reviews/2026-11-17-sharing-review.md).
- `verification/` — live-check notes and the captures they cite. The room shape and saving
  check is
  [`verification/2026-11-13-room-shape-live-check.md`](verification/2026-11-13-room-shape-live-check.md).
  The openings check has 24 rows: 22 passed and 2 failed on the first run (C5, X1); both were fixed
  and passed on the re-run
  ([`verification/2026-11-14-openings-live-check.md`](verification/2026-11-14-openings-live-check.md)).
  The wall editing check has 22 rows over three runs: run 1 failed W3, W12 and W13, and run 3, on
  the final commit, passed all 22
  ([`verification/2026-11-14-wall-editing-live-check.md`](verification/2026-11-14-wall-editing-live-check.md)).
  The undo and redo check has 20 rows plus one added after the final review (X1); run 1 failed
  U4 because of the script, and run 3, on the final commit, passed all of them
  ([`verification/2026-11-16-undo-redo-live-check.md`](verification/2026-11-16-undo-redo-live-check.md)).
  The stop at walls check has 14 rows plus a drag-cost row (X1); run 1 failed W6 and W7
  because the rows were written wrongly, and run 2, on the final commit, passed all of them
  ([`verification/2026-11-16-stop-at-walls-live-check.md`](verification/2026-11-16-stop-at-walls-live-check.md)).
  The sharing check has 18 rows (S1 to S18) plus X1 to X4; run 1 failed S11 because the row was
  written wrongly and also showed the wall-length defect, and runs 2 and 3, on the final code,
  passed all of them
  ([`verification/2026-11-17-sharing-live-check.md`](verification/2026-11-17-sharing-live-check.md)).
  The furniture generator check has 9 rows; all passed on the local dev server, and the run on the
  Vercel preview is pending
  ([`verification/2026-11-20-generator-live-check.md`](verification/2026-11-20-generator-live-check.md)).
- `design_handoff/` — the original design reference (prototype, design system, README).
  It is read-only: it is not built or served.
- `mistakes-and-fixes.md` — running log of mistakes and how they were fixed.
