# Sharing: design

- **Date:** 2026-11-17
- **Status:** approved by the owner on 2026-11-17
- **Amended during the build:** see the plan's Amendments 1 to 3
  ([`../plans/2026-11-17-sharing.md`](../plans/2026-11-17-sharing.md)).
- **Delivery:** its own pull request (branch `sharing`), slice F.

## The problem

A plan lives in one browser. A visitor cannot send it to a partner, a landlord or a mover,
and cannot save a picture of it.

## Owner's decisions (2026-11-17)

1. The share link carries the whole plan inside the link. No server and no database.
2. Opening a shared link shows a preview. The visitor's own plan is untouched until they
   choose to keep the shared one.
3. Two pictures can be downloaded: the floor plan with sizes, and the 3D view.

## Behaviour

### The Share button

A "Share" button in the header, after Undo and Redo. It opens a small panel with three
actions:

| Action | Result |
|---|---|
| Copy link | The link is copied. The button reads "Copied" for 2 seconds. If the browser refuses the clipboard, the link is shown in a text field, selected, to copy by hand. |
| Download floor plan | Saves `room-plan.png`. |
| Download 3D view | Saves `room-3d.png`. Greyed out, with the reason shown, when the 3D view is not on screen (the "Tabs" layout on its plan tab). Without WebGL the planner already shows the blueprint view there, and that is what is saved. |

If an action fails, the panel shows `This plan is too large to share as a link.` (Copy link) or
`The picture could not be made.` (a download). A key pressed inside the panel does not reach the
planner's shortcuts, except Tab; Escape closes the panel.

The panel closes on Escape, on a click outside it, and returns focus to the Share button.

### The link

`https://frankiesoltero.com/room-planner#plan=1.<data>`

- The plan is after the `#`. Browsers never send that part to a server, so the plan does not
  reach the site's server, its logs or another site's referrer.
- `<data>` is the saved plan (the same six fields the browser saves), compressed and written
  in URL-safe characters. The starting plan makes a link of about 450 characters; a plan with
  40 pieces of furniture, 1,000 to 4,000.
- The link holds everything in the plan: the room, doors, windows, obstacles, furniture,
  their names, prices and product links. It holds nothing about the visitor.
- Units are part of the plan, so the link opens in the sender's units.

### Opening a shared link

| Case | Result |
|---|---|
| Visitor has a saved plan of their own | The shared plan is shown with a banner: "Viewing a shared plan. Your own plan is untouched, and changes here are not saved." Two buttons: "Keep this plan" and "Back to my plan". |
| "Keep this plan" | Asks once ("Replace my plan"), then the shared plan becomes the visitor's saved plan. The banner goes and the `#plan=...` part is removed from the address. |
| "Back to my plan" | The visitor's saved plan is loaded. The banner goes and the address is cleaned the same way. |
| Visitor has no saved plan | The shared plan opens as their plan and is saved, with a notice: "Opened a shared plan." No banner. |
| While previewing | The visitor can move things, undo and redo, and use Share. Nothing is saved until "Keep this plan". A reload shows the shared plan as it was in the link. |
| The link is damaged or cut short | The visitor's own plan loads, with a notice: "This shared link could not be read." The `#plan=` part is removed from the address. If the browser's storage is blocked or the saved plan is from a newer planner, that notice is shown instead. |
| A share link arrives in the address of a planner that is already open (pasted into the same tab) | The page reloads and the link opens as above. (Added with the owner's approval on 2026-11-17.) |
| The link was made by a newer planner | The visitor's own plan loads, with a notice: "This shared link was made with a newer version of the planner." The `#plan=` part is removed from the address. If the browser's storage is blocked or the saved plan is from a newer planner, that notice is shown instead. |
| The visitor's saved plan is from a newer planner, and the link is good | The shared plan is previewed with the usual notice, without "Keep this plan", since nothing can be saved. |
| The visitor's saved plan cannot be read | Treated like no saved plan. |
| "Reset plan" during a preview | The preview ends, `#plan=` is removed from the address, and the starting plan is saved. |
| The browser's storage is blocked | The shared plan is shown with the usual storage notice. "Keep this plan" is not offered, since nothing can be saved. |

The undo history is cleared when a shared plan opens, on "Keep this plan" and on "Back to my
plan", as it is on any load.

### The floor-plan picture

A PNG drawn for the purpose, not a screenshot of the screen:

- White background, 2,000 px on its longer side, the room scaled to fit with a margin.
- Walls, doors (with their swing), windows, obstacles and furniture, top down.
- Each piece of furniture and each labelled obstacle carries its name.
- Every wall carries its length, in the plan's units. The length is drawn level and clear of
  the wall, whatever the wall's direction.
- Pieces in conflict are drawn red, as on screen. Nothing is drawn as selected.
- A small line at the bottom: "Room Planner · frankiesoltero.com/room-planner".

### The 3D picture

A PNG of the 3D view exactly as the camera shows it at that moment, at the size it has on
screen (times the screen's pixel ratio, at most 2), on the page's background colour. In
blueprint mode it is the blueprint drawing.

## What does not change

- The saved-plan format, and what the browser saves.
- "Reset plan", undo and redo, the conflict rules.
- No package is added. No request is made to any server. Nothing about the visitor is stored
  or sent.

## How it works

- **Making the link.** New module `room-planner/services/shareLink.ts`. Encode: the plan
  as JSON, compressed with the browser's built-in `CompressionStream('deflate-raw')`, written
  as base64url, prefixed `1.`. Where the browser lacks `CompressionStream`, the JSON is
  written uncompressed with the prefix `0.`. Decode accepts both.
- **Reading the link.** The fragment is untrusted input. Decoding refuses link data longer than
  699,053 characters, stops decompressing once the plan text passes the planner's existing
  stored-plan limit (524,288, counted in bytes), and hands the result to `parsePlan`, the one gate every
  stored plan already goes through. Nothing from the link is used before it has passed
  `parsePlan`. Decoding never throws.
- **Preview.** A new flag in the UI store, `sharedPreview`. While it is set the autosave
  does not write. `usePlanPersistence` reads the fragment once at load, after it knows
  whether the visitor has a saved plan.
- **Pictures.** New pure function `drawPlanPicture` in `room-planner/view/`, drawing on a 2D
  canvas from the plan, so it can be tested without a browser. The 3D picture renders one
  frame and reads the canvas in the same step (the WebGL canvas is cleared between frames).
  Both are saved through a temporary download link.
- **Sidebar note.** "Saved in this browser only. Nothing is sent anywhere." gains: "A share
  link contains the whole plan."

## Defaults I chose (say if any should differ)

- The Share button is in the header, beside Undo and Redo.
- With no saved plan of their own, a visitor gets the shared plan directly, with no banner.
- A visitor can edit while previewing; nothing is saved until they keep it.
- The floor-plan picture is white and fixed at 2,000 px, whatever the screen shows.
- The floor-plan picture carries a one-line credit with the planner's address.
- Product links and prices travel in the share link.

## Testing

- Unit tests: encode then decode gives the same plan (starting plan, L-shape, angled walls,
  40 pieces, non-Latin names); both prefixes; damaged, cut, oversized and newer-version
  input; a decompression that would exceed the limit.
- Tests of the preview flow in the store and hook: has a plan, has none, keep, back,
  blocked storage, no save while previewing.
- Tests of `drawPlanPicture` against a recording canvas.
- A test of the link decoder's decompression: the inflater is fed in 1 KB slices, each write
  awaited, so a cap bounds what is inflated, not only what is read. Node's stream respects
  backpressure and hides a failure here, so it was also measured in Chromium: a 400 to 510 MB
  bomb stops after 2,048 input bytes in 0.2 ms (before the slice feeding, it took the whole
  input in 28 to 40 ms).
- Component tests for the Share panel and the banner.
- A live browser check: copy a link, open it in a fresh profile and in one with a saved
  plan, keep, back, a damaged link, both downloads opened and looked at.

## Known limits

- A link is a snapshot. Later edits need a new link.
- Anyone who has the link has the plan. There is no way to take a link back.
- Very large plans make links of several thousand characters, which some chat apps cut.
  A cut link shows "This shared link could not be read."
- No short links, no PDF, no phone layout, no system share sheet.
- With storage blocked or a saved plan from a newer planner, an unreadable link shows that
  notice, not "This shared link could not be read." Those notices say work is not being saved.
- Safari and Firefox are not run, as for the rest of the planner. Without
  `CompressionStream` (browsers before 2023) links are longer but still work.
