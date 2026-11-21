# Room Planner: real product lookup (slice H) — design

Date: 2026-11-18, revised 2026-11-20 after the furniture generator (slice G) shipped.
Status: approved by the owner on 2026-11-20 ("yeah that looks fine").

## Why

The planner builds furniture from a recipe: a type, a size, style options and two colours
(`2026-11-20-furniture-generator-design.md`). Today the visitor fills that recipe in by hand.
The owner wants to paste a shop link and get the real product: "pull in the object and allow
people to customize its size". Real 3D files cannot be had from Amazon or Wayfair and are
restricted by IKEA, so the lookup reads the product page and fills in the recipe; the generator
draws the piece.

The earlier fake lookup (`mockProductLookup.ts`) was removed in slice G. Its link checker
(`room-planner/services/productLookup.ts`) and the `ProductPreview` type were kept for this.

## Owner decisions

| Date | Question | Answer |
|---|---|---|
| 2026-11-18 | What replaces the placeholder | A real lookup, with manual entry as the fallback |
| 2026-11-18 | Shops to support | IKEA, Amazon, Wayfair |
| 2026-11-20 | How a looked-up product looks | Built by the generator from a recipe (replaces "photo on the piece") |
| 2026-11-20 | Amazon, given its terms | Looked up; if Amazon refuses, hand entry |
| 2026-11-20 | Rate limit | Ship with the route's own soft limit; the owner adds a Vercel rule later |
| 2026-11-20 | Colour source | A colour word in the product name wins; otherwise the photo |

## What was measured before designing

One product page per shop was read from a home connection on 2026-11-18, with a browser-like
reader name and again with a self-identifying one. All six reads returned the product page.

| Shop | Name | Price | Photo | Sizes | Where the data is |
|---|---|---|---|---|---|
| IKEA | yes | yes | yes | yes, separate width, depth, height | Standard product data block (JSON-LD `Product`) |
| Wayfair | yes | yes | yes | yes, one line: `32.3'' H X 65.8'' W X 32.3'' D` | Page title and photo tags, plus the page's embedded data |
| Amazon | yes | not confirmed | yes | yes, one line: `14.01 x 9.77 x 0.66 inches`, order not labelled | Page markup (`productTitle`, `landingImage`, "Product Dimensions") |

Not measured: the same reads from the site's server (Vercel). Shops often refuse data-centre
addresses, so each shop is re-tested on the deployed route before it is called working (see
"Verification"). All three photo hosts allow another site to read their images
(`access-control-allow-origin` present), which the colour sampling in section 3 relies on.

## Design

### 1. Server step

`POST /api/room-planner/lookup`, body `{ "url": string }`, Node runtime, never cached. This is
the site's first server route; it is kept to this one job.

- **Shops only.** The link's host must be `ikea.com`, `amazon.com`, `a.co` (Amazon's short
  links), `wayfair.com`, or a subdomain of one. Anything else is answered `unsupported_shop`
  with no outgoing request. This is the main protection against the route being used to reach
  other machines (server-side request forgery) or as an open relay.
- **Outgoing request rules.** `https` only, port 443 only. The host name is resolved first and
  the request is refused if any address is private, loopback, link-local or otherwise not
  public; the connection is made to the address that was checked. Redirects are followed by
  hand, at most 3, each re-checked against the shop list and the address rules.
- **Limits.** 8 s total. At most 4 MB of page is read (largest measured: 1.3 MB). Only
  `text/html` is parsed. Request body at most 4 KB.
- **Who may call it.** The `Origin` header must be the site itself. A per-address limit of 20
  lookups per 10 minutes is kept in memory. It is per server instance, so it slows abuse but
  does not stop a determined caller; the hard limit is a Vercel firewall rule the owner adds
  later (exact rule supplied in the pull request).
- **Reader name.** The request identifies itself honestly as a link-preview reader. No rotating
  addresses, no challenge solving, nothing to look like a person. A refusal is answered
  `blocked` and the visitor types the details in.
- **What comes back.** Only extracted fields, never the page:
  `{ name, description, price, imageUrl, w, d, h, sizeNote }` or `{ error }`, where error is
  `invalid_url`, `unsupported_shop`, `blocked`, `not_a_product`, `unavailable` or
  `rate_limited`. `imageUrl` is returned only when it is `https` on a shop photo host
  (`ikea.com`, `m.media-amazon.com`, `assets.wfcdn.com`). `description` is cut to 600
  characters. Nothing is logged except the shop host and the outcome code.

### 2. Reading a page

Pure functions, one per shop, tested against saved copies of real pages.

- **Shared reader:** the JSON-LD `Product` block (name, description, photo, price, width,
  depth, height) and the page's title and photo tags.
- **IKEA:** shared reader only; sizes like `31 1/2 "` parsed as inches, `cm` converted.
- **Wayfair:** name and photo from the page tags; sizes from the "Overall Dimensions" line,
  which labels each number (`H`, `W`, `D`); price from the page's lead price.
- **Amazon:** name, photo and price from the page markup; sizes from "Product Dimensions" or
  "Item Dimensions". Labelled numbers (`35"D x 80"W x 30"H`) use their labels. Unlabelled
  numbers are filled in as depth, width, height and `sizeNote` says "Check these sizes: the
  page did not say which is which."
- **Price:** kept only when in US dollars.
- All text is untrusted: cut to the saved-plan limits and shown as text only.

### 3. From product to recipe

Runs in the browser, on the fields the server returned. Pure functions, except reading the
photo's pixels.

- **Type.** Matched from the name by word list, most specific first: nightstand / bedside
  table, TV stand / media console, dresser / chest of drawers, sofa / couch / loveseat /
  sectional, bed, desk, bookcase / shelf, table, chair / stool, rug. No match: box.
- **Style, by word rules.** Words in the name and description set options; anything not
  mentioned keeps the type's default.

  | Type | Examples of rules |
  |---|---|
  | Sofa | "loveseat" 2 seats; "sectional" or "chaise" adds a chaise, side from "left-facing" / "right-facing" (right if unsaid); "armless" no arms; "tufted" or "tight back" tight cushions; "metal legs", "tapered" / "mid-century" legs |
  | Chair | "dining", "office" / "task" / "swivel", "armchair" / "accent"; "armless" |
  | Bed | "upholstered"; "storage"; "platform"; "tall headboard", "no headboard" / "frame only"; "footboard" |
  | Desk | "trestle"; "N-drawer" / "drawers" |
  | Table | "round"; "pedestal"; "trestle"; "shelf" |
  | Shelf | "N-shelf" / "N-tier" sets the shelf count |
  | Dresser | "N-drawer" sets rows and columns (6 becomes 2 by 3 when wider than tall, else 1 by 6) |
  | Nightstand | "N-drawer"; "open" 0 drawers |
  | TV stand | "doors", "drawers", "open" |
  | Rug | "round" |

  The full table, with every word and the option it sets, is fixed in the plan and tested row
  by row. Every result is a valid recipe value; an out-of-range number is clamped.
- **Colours.**
  - *Main:* a colour word in the name (navy, beige, charcoal, walnut, white and so on, from a
    fixed table of about 40 words) sets it. Otherwise it is sampled from the product photo:
    the photo is loaded with cross-site reading enabled, drawn small on a hidden canvas, pixels
    connected to the border and close to white or the corner colour are dropped as background,
    and the most common remaining colour is used.
  - *Accent:* a material word (oak, walnut, black metal, brass, chrome) sets it; otherwise the
    second most common photo colour if it is clearly different; otherwise the type's default.
  - If the photo cannot be loaded or read, colours fall back to the type's defaults. Nothing
    fails.
- **Size.** Width, depth and height from the page, clamped to the planner's limits
  (0.25 to 240 in). Missing sizes use the type's typical size and are flagged in the preview.

### 4. In the planner

- **Link box.** Section 02 keeps the type grid and gains "Paste a product link" above it, with
  the note "Works with IKEA, Amazon and Wayfair".
- **Preview card.** After a lookup: the product photo, name, price, shop, and the piece as the
  generator will draw it (small 3D preview), with Type and the three sizes editable. "Add to
  room" places it like any other piece. After that it is an ordinary piece: every style option,
  colour and size is editable in the item editor, and all of it is undoable.
- **Failure.** Any error shows one line and leaves the type grid ready below it: "That shop
  isn't supported yet. Pick a type below." / "The shop didn't let us read that page. Pick a
  type below." / "That page isn't a single product." / "Too many lookups. Try again in a few
  minutes." The pasted link is kept on the next piece added, so it still links to the product.
- **What is saved.** The piece's name, shop, link and price (fields that already exist) and its
  recipe. The photo address is not saved, so the plan format stays at version 4 and a share
  link never makes a viewer's browser contact a shop.
- **The privacy note** changes from "nothing is sent anywhere" to what is now true: the plan
  stays in the browser; a pasted product link is sent to this site to read the page; the
  product photo loads from the shop while the preview is open.
- **Security headers.** The site sets no content-security policy today, so the photo loads
  without a change. If one is added later it must allow the three photo hosts for images.

### Defaults chosen (say if any should change)

1. Only the three shops are looked up. Supporting any shop would mean a server route that
   fetches arbitrary addresses, a much larger attack surface.
2. The reader identifies itself honestly and accepts a refusal. Amazon or Wayfair may therefore
   work from home but not from the live site; that is measured and reported, not worked around.
3. The photo appears in the preview card only. It is not drawn on the piece and not saved.
4. Word rules read English product pages only.
5. IKEA's own 3D model files are not used: the model host refused a cross-site request, and
   reuse on a public site is a licensing question.
6. No products database, accounts or lookup history.

## Error handling

| Situation | What the visitor sees |
|---|---|
| Not a link | "That doesn't look like a link. Paste the full product URL." (existing text) |
| Shop not supported, refused, timed out, or not a product page | One-line reason; type grid stays ready; link kept for the next piece |
| Found, but no sizes | Preview with typical sizes for the type, marked "Sizes not found: check these" |
| Found, type not recognised | Preview as a box with the Type picker highlighted |
| Photo fails to load or read | Preview without photo; default colours |
| Too many lookups | "Too many lookups. Try again in a few minutes." |

## Testing

- Page readers: saved real pages per shop (trimmed), plus fractions, centimetres, labelled and
  unlabelled Amazon sizes, missing fields, category pages, hostile text.
- Server step: shop list (including look-alikes such as `ikea.com.evil.example` and
  `evil.example/ikea.com`), private and loopback addresses, redirect to a non-shop host,
  oversize page, slow page, wrong content type, missing or foreign `Origin`, rate limit, photo
  address on a foreign host dropped.
- Recipe rules: every row of the word table; type matching order ("TV stand" is not a table,
  "bedside table" is not a table or a bed); colour words; background removal on fixed test
  images; every output accepted by the plan validator.
- Planner: lookup success to placed piece, each failure message, link kept after a failure,
  undo of a placed lookup piece, plan saved after a lookup still version 4 with no photo address.

## Verification

`npm run check` green. Then, because the preview deployment sits behind Vercel login, the
shop-by-shop test runs on a local production build first and on the live site after the owner's
merge: two real product links per shop, each recorded as works / refused, with the recipe each
produced and a screenshot of the piece beside the product photo. A shop that refuses the live
server is reported as "hand entry only" and the note under the link box is corrected to match.

## Out of scope

Other shops, 3D model files, an AI photo reader, photo-to-3D on the owner's PC, patterns and
textures, non-US prices, non-English pages, a products database, mobile layout.

## Open items for the owner

- Add a Vercel firewall rate-limit rule for `/api/room-planner/lookup` when convenient.
