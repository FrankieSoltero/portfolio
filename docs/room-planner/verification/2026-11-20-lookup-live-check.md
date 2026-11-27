# Product lookup (slice H): live check

Checked on 2026-11-21 against a local production build (`npm run build`, then
`npx next start -p 3478`) of branch `product-lookup` at code commit `14a4629`. The Vercel preview
sits behind Vercel login, so it was not opened. Real product pages were read from a home
connection; whether the shops also answer Vercel's servers is checked after merge (see the end).

`npm run check` on the same code: typecheck and lint clean, 92 test files, 4,360 tests passed,
build passed. The build lists `/api/room-planner/lookup` as a dynamic route; `/room-planner` is
105 kB first load, the same as before this change; `node-html-parser` does not appear in
`.next/static`.

## Row 1: two real product links per shop

| Shop | Link | Result | Recipe produced | Screenshot |
|---|---|---|---|---|
| IKEA | `ikea.com/us/en/p/billy-bookcase-black-oak-effect-00477337/` | works | shelf, 31.5 × 11 × 41.75 in, $59, main black (from "black" in the name), accent oak | `shots-lookup/ikea-preview.png` |
| IKEA | `ikea.com/us/en/p/billy-bookcase-brown-walnut-effect-10508625/` | works | shelf, 15.75 × 11 × 41.75 in, $49, main walnut (name), accent from the photo | `shots-lookup/ikea2-preview.png` |
| Wayfair | `wayfair.com/furniture/pdp/corrigan-studio-w009077849.html` | works | sofa, 65.8 × 32.3 × 32.3 in, $269.99, 2 seats ("Loveseat"), tapered legs ("splayed" in the description), colours from a room photo: grey-brown main | `shots-lookup/wayfair-preview.png` |
| Wayfair | `wayfair.com/furniture/pdp/george-oliver-winfree-78-2-person-sofa-w100055074.html` | works | sofa, 78 × 33 × 35 in, $1,035.98, 2 seats ("2-Person"), colours from the photo | `shots-lookup/wayfair2-preview.png` |
| Amazon | `amazon.com/…/dp/B0C53JND1M` | works | dresser, 47.2 × 15.7 × 32 in, $139.99, 2 columns × 3 rows ("6 Drawer"), main oak ("Light Oak") | `shots-lookup/amazon-preview.png` |
| Amazon | `amazon.com/…/dp/B09C5HBG1F` | works | sofa, 84 × 32.5 × 29 in, no price (the page says currently unavailable), 3 seats, dark green. The page lists 84 in as depth; the lookup swapped width and depth and shows "Check these sizes: width and depth looked swapped on the page." | `shots-lookup/amazon2-preview.png` |

All six pieces together in one room: `shots-lookup/room-all-looked-up.png`.

## Rows 2 to 10

| # | Check | Result |
|---|---|---|
| 2 | Add a looked-up piece | Pass. For each of the six, the stored item's width, depth and height equal the preview's, it is the selected piece with its editor open, its link and price are stored, and both views draw it. One Undo removed the last piece (6 → 5); Redo restored it. |
| 3 | Edit after adding | Pass. Changing a style option on a looked-up piece changed the stored piece. |
| 4 | Each failure | Pass. `not a link` → "That doesn't look like a link. Paste the full product URL." A link to another shop → "That shop isn't supported yet. Pick a type below." with "The next piece you add will keep this link."; the next piece added by type carried that link. An IKEA category page → "That page isn't a single product." A link pasted without `https://` was looked up normally. |
| 5 | Direct calls to the route | Pass. No `Origin` → 403. Another site's `Origin` → 403. A non-shop link → 400. An IP-address link → 400. `text/plain` → 400. A 5 KB body → 413. `GET` → 405. `OPTIONS` → 204 with no `Access-Control-*` header. After 20 charged lookups from one address the 21st → 429 with `Retry-After`. Responses carry `Cache-Control: no-store`. |
| 6 | Saved plan and share link | Pass. Stored text is format version 4 and contains no photo address. The share link reopened the same seven pieces. Plans saved before this change still open (covered by the existing tests; the format did not change). |
| 7 | Network on opening a share link | Pass. No request to any IKEA, Amazon or Wayfair host. |
| 8 | Console | One line across the whole run: "Failed to load resource: the server responded with a status of 422", which the browser writes itself when the route refuses the category page in row 4. No error from the planner's own code. |
| 9 | Screenshots | Pass. Seven PNG files in `shots-lookup/`, listed above; each preview shows the product photo beside the piece as drawn. |
| 10 | Sidebar width | Pass. With the preview card open, the sidebar's scroll width equals its client width (339 px) for all six products, including the long Amazon names. |

Also confirmed: focus returns to the link box after Look up, Add to room and Cancel; the server
log holds one line per request with only the shop and the outcome (22 lines, none containing a
link or an address); each real lookup took about 1 to 1.6 s.

## Found by this check and fixed before the record was written

1. `not a link` showed no message and links without `https://` were not looked up: the browser's
   own URL field check blocked the form (`4ae70fd`).
2. A Wayfair room photo gave the wall's cream colour instead of the sofa's (`7a9afae`).
3. A product photo failed to display after `crossOrigin` was added to it (`7e32dc3`).
4. Amazon's current page gave no price (`44cc518`).
5. An Amazon page that lists a sofa's width as its depth gave a piece turned the wrong way
   (`f16c16d`).
6. "2-Person Sofa" did not set the seat count (`f16c16d`).

## Not checked here

- The route on Vercel. After merge: one real link per shop on the live site, recorded as works
  or refused; the note under the link box is corrected if a shop refuses Vercel's servers. Also
  to confirm there: `Host` is the public host, a foreign origin gets 403, and one log line
  appears per request.
- Safari and Firefox.
- New pieces are added at the room's centre, as pieces added by type are, so several looked-up
  pieces overlap until they are moved.
