# Real Product Lookup (slice H) Implementation Plan

> **For executors:** execute with soltero-skills:lean-sdd. The Task Dependency
> Table below is the scheduling and review-depth contract.

**Goal:** A pasted IKEA, Amazon or Wayfair product link is read by one narrow server route and
turned, in the browser, into a furniture recipe (type, size, style, colours) that the visitor
previews, adjusts and adds to the room.

**Architecture:** A Node route (`app/api/room-planner/lookup/route.ts`) delegates to
`room-planner/server/`: an SSRF-safe page fetch, one pure reader per shop, and an in-memory rate
limit; it returns only extracted fields. In the browser, pure rules in
`room-planner/domain/furniture/` map those fields to a recipe, a small canvas step samples the
photo's colours, and the store adds the piece in one undoable step. The saved-plan format stays
at version 4; the photo address is never stored.

**Spec:** `docs/room-planner/specs/2026-11-18-product-lookup-design.md` (approved 2026-11-20).

**Tech stack / test runner:** Next.js 15 (App Router), React 19, TypeScript, Zustand, zod,
three.js, Vitest + Testing Library. One file: `npx vitest run <file>`. Types:
`npm run typecheck`. Everything: `npm run check` (stops any dev server on port 3478 first; never
run two builds at once, they share `.next`).

## Global Constraints

- Work only on branch `product-lookup` in `/Users/franciscosoltero/Desktop/Code/Portfolio Website`.
  Run `git branch --show-current` before every commit. Stage explicit paths only (never
  `git add -A`, `git add .` or `git commit -a`). Never touch `Multiplayer_AI_Sprite.aseprite` or
  the worktree `/Users/franciscosoltero/Desktop/Code/portfolio-drills`.
- Commit messages end with the two trailer lines:
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_015TSBugnNtqeGNLtF4ZZCt3`.
- TDD: a failing test first for every behaviour row. Tests make no network requests; anything
  that fetches takes its fetch function as a parameter.
- Server-only code lives in `room-planner/server/` and is imported only by the route and by
  server tests. Nothing under `room-planner/components`, `state`, `services`, `domain`, `hooks`,
  `three` or `view` may import from `room-planner/server/` or from `node:` modules.
- Server test files start with the docblock `// @vitest-environment node`.
- Shops, exact: `ikea.com` → `ikea`; `amazon.com` and `a.co` → `amazon`; `wayfair.com` →
  `wayfair`; each also matches its subdomains. Photo hosts, exact: `ikea.com`,
  `m.media-amazon.com`, `assets.wfcdn.com` (each with subdomains), `https` only.
- Limits, exact: request body 4096 bytes; link 2048 characters; page 4 MiB after decompression;
  8000 ms total per lookup; 3 redirects; name 200 characters; description 600 characters; a size
  is kept only when finite, above 0 and at most 10000 in; price only when USD, above 0 and at
  most 10,000,000; rate limit 20 lookups per 600,000 ms per address.
- Error codes, exact: `invalid_url`, `unsupported_shop`, `blocked`, `not_a_product`,
  `unavailable`, `rate_limited`.
- All page text is untrusted: rendered as React text only (never `dangerouslySetInnerHTML`),
  cut to the limits above. No secrets or environment variables are needed; none may be added.
- Logging on the server: exactly one line per request,
  `console.info(JSON.stringify({ event: 'room_planner_lookup', shop, outcome }))`, where `shop`
  is the shop name or `null` and `outcome` is `ok` or an error code. Never the link, the
  address, headers or page content.
- The saved-plan format stays version 4. `Item` gains no field. The photo address is never
  written to the plan, to storage or to a share link.
- The reader identifies itself as `RoomPlannerLinkPreview/1.0`. No retries, no address
  rotation, no challenge solving.
- Desktop only. No new dependency except `node-html-parser` (Task 3); run `npm audit` after
  adding it and report any finding.
- Rollback: the change is additive and the plan format does not move, so reverting the merge
  commit restores the previous site with no effect on saved plans or share links.

## Task Dependency Table

| Task | Files touched | Depends on | Risk tier |
|------|---------------|------------|-----------|
| 1. Contract and shop list | `room-planner/lookup/contract.ts`, `room-planner/lookup/contract.test.ts`, `room-planner/lookup/shops.ts`, `room-planner/lookup/shops.test.ts` | — | standard |
| 2. Size parsing | `room-planner/server/sizes.ts`, `room-planner/server/sizes.test.ts` | — | standard |
| 3. Page readers | `room-planner/server/readers/shared.ts`, `room-planner/server/readers/ikea.ts`, `room-planner/server/readers/wayfair.ts`, `room-planner/server/readers/amazon.ts`, `room-planner/server/readers/index.ts`, `room-planner/server/readers/readers.test.ts`, `room-planner/server/readers/fixtures/ikea-product.html`, `room-planner/server/readers/fixtures/ikea-category.html`, `room-planner/server/readers/fixtures/wayfair-product.html`, `room-planner/server/readers/fixtures/wayfair-category.html`, `room-planner/server/readers/fixtures/amazon-product.html`, `room-planner/server/readers/fixtures/amazon-labelled.html`, `room-planner/server/readers/fixtures/amazon-challenge.html`, `package.json`, `package-lock.json` | 1, 2 | judgment |
| 4. Safe page fetch | `room-planner/server/safeFetch.ts`, `room-planner/server/safeFetch.test.ts` | 1 | judgment |
| 5. Rate limit, handler and route | `room-planner/server/rateLimit.ts`, `room-planner/server/rateLimit.test.ts`, `room-planner/server/lookupHandler.ts`, `room-planner/server/lookupHandler.test.ts`, `app/api/room-planner/lookup/route.ts`, `package.json`, `vitest.config.ts`, `eslint.config.mjs` | 1, 3, 4 | judgment |
| 6. Recipe from product text | `room-planner/domain/furniture/fromProduct.ts`, `room-planner/domain/furniture/fromProduct.test.ts` | — | judgment |
| 7. Photo colours | `room-planner/domain/furniture/photoColours.ts`, `room-planner/domain/furniture/photoColours.test.ts`, `room-planner/services/photoSampler.ts`, `room-planner/services/photoSampler.test.ts` | 1 | standard |
| 8. Store, lookup service and actions | `room-planner/domain/types.ts`, `room-planner/state/planStore.ts`, `room-planner/state/uiStore.ts`, `room-planner/state/actions.ts`, `room-planner/state/stores.test.ts`, `room-planner/state/lookup.test.ts`, `room-planner/services/productLookup.ts`, `room-planner/services/productLookup.test.ts`, `room-planner/services/remoteProductLookup.ts`, `room-planner/services/remoteProductLookup.test.ts`, `room-planner/test/fakePlanStore.ts` | 1, 6, 7 | judgment |
| 9. Link box and preview card | `room-planner/components/Sidebar/ProductLinkBox.tsx`, `room-planner/components/Sidebar/ProductLinkBox.test.tsx`, `room-planner/components/Sidebar/ProductPreviewCard.tsx`, `room-planner/components/Sidebar/ProductPreviewCard.test.tsx`, `room-planner/components/Sidebar/AddFurnitureSection.tsx`, `room-planner/components/Sidebar/AddFurnitureSection.test.tsx`, `room-planner/components/Sidebar/addFurniture.css`, `room-planner/components/Sidebar/PlanSection.tsx`, `room-planner/components/Sidebar/PlanSection.test.tsx`, `room-planner/three/previewSnapshot.ts`, `room-planner/three/previewSnapshot.test.ts` | 8 | judgment |
| 10. Docs | `docs/room-planner/README.md`, `docs/room-planner/mistakes-and-fixes.md`, `docs/fixes-log.md`, `README.md` | 1, 2, 3, 4, 5, 6, 7, 8, 9 | mechanical |

Source files of Tasks 1, 2 and 6 are disjoint. Tasks 3 and 5 both write `package.json`; Task 3
also writes `package-lock.json` and `node_modules`. Any task whose Verify runs `npm run check`
writes `.next`.

---

## Task 1: Contract and shop list

**Files:**
- Create: `room-planner/lookup/contract.ts`
- Test: `room-planner/lookup/contract.test.ts`
- Create: `room-planner/lookup/shops.ts`
- Test: `room-planner/lookup/shops.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (`shops.ts`):
  - `export type Shop = 'ikea' | 'amazon' | 'wayfair';`
  - `export function shopForHost(hostname: string): Shop | null;`
  - `export function isShopPhotoUrl(url: string): boolean;`
- Produces (`contract.ts`):
  - `export const LOOKUP_PATH = '/api/room-planner/lookup';`
  - `export const LOOKUP_ERROR_CODES = ['invalid_url', 'unsupported_shop', 'blocked', 'not_a_product', 'unavailable', 'rate_limited'] as const;`
  - `export type LookupErrorCode = (typeof LOOKUP_ERROR_CODES)[number];`
  - `export function isLookupErrorCode(value: unknown): value is LookupErrorCode;`
  - `export const LOOKUP_LIMITS = { bodyMax: 4096, urlMax: 2048, nameMax: 200, descriptionMax: 600, sizeMax: 10000, priceMax: 10_000_000, pageMax: 4 * 1024 * 1024, timeoutMs: 8000, redirectsMax: 3, rateLimit: 20, rateWindowMs: 600_000 } as const;`
  - `export const SIZE_NOTE_UNLABELLED = 'Check these sizes: the page did not say which is which.';`
  - `export interface ProductFields { name: string; description: string; price: number | null; imageUrl: string | null; w: number | null; d: number | null; h: number | null; sizeNote: string | null }`
  - `export function parseProductFields(value: unknown): ProductFields | null;` (zod, strict: unknown keys refused)

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Shop, bare and subdomain | `ikea.com`, `www.ikea.com`, `WWW.IKEA.COM`, `www.ikea.com.` | `ikea` |
| Amazon forms | `amazon.com`, `www.amazon.com`, `smile.amazon.com`, `a.co` | `amazon` |
| Wayfair | `www.wayfair.com` | `wayfair` |
| Look-alikes | `ikea.com.evil.example`, `evilikea.com`, `ikea.co`, `amazon.co.uk`, `xa.co`, `wayfair.com.au`, `` (empty), `localhost`, `127.0.0.1`, `[::1]` | `null` |
| Photo URL accepted | `https://www.ikea.com/us/en/images/products/x.jpg`, `https://m.media-amazon.com/images/I/a.jpg`, `https://assets.wfcdn.com/im/1/x.jpg` | `true` |
| Photo URL refused | `http://` form of any; `https://media-amazon.com/a.jpg`; `https://assets.wfcdn.com.evil.example/a.jpg`; a URL with `user:pass@`; a URL with a port; `data:`, `javascript:`; not a URL; longer than 2048 | `false` |
| `parseProductFields` valid | all fields in range | the same object |
| `parseProductFields` bounds | name over 200 or empty; description over 600; size 0, negative, over 10000, `NaN`; price 0 or over 10,000,000; `imageUrl` not passing `isShopPhotoUrl`; `sizeNote` over 200; an extra key; a non-object | `null` |
| `isLookupErrorCode` | each of the six codes / any other value | `true` / `false` |

**Verify:** `npx vitest run room-planner/lookup` → all pass; `npm run typecheck` → no errors.
**Commit:** `feat(room-planner): lookup contract and shop list`

---

## Task 2: Size parsing

**Files:**
- Create: `room-planner/server/sizes.ts`
- Test: `room-planner/server/sizes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export function parseLength(text: string): number | null;` (inches, rounded to 2 decimals)
  - `export interface ParsedSizes { w: number | null; d: number | null; h: number | null; labelled: boolean }`
  - `export function parseDimensionLine(text: string, order?: string): ParsedSizes | null;`
    (`order` is a hint such as `LxWxH` taken from a row label)

**Behavior:**

| Case | Input | Expected |
|------|-------|----------|
| Fraction | `31 1/2 "` | 31.5 |
| Fraction, no space | `41 3/4"` | 41.75 |
| Whole | `11 "` | 11 |
| Double apostrophe | `32.3''` | 32.3 |
| Words | `66 in`, `66 inches`, `66 inch` | 66 |
| Bare number | `59` | 59 |
| Centimetres | `80 cm` | 31.5 |
| Millimetres | `800 mm` | 31.5 |
| Feet | `6 ft`, `6 feet` | 72 |
| Left-to-right mark | `‎14.01 inches` | 14.01 |
| Refused | ``, `abc`, `0`, `-3`, `1/0`, `20000` | `null` |
| Wayfair line | `32.3'' H X 65.8'' W X 32.3'' D` | `{ h: 32.3, w: 65.8, d: 32.3, labelled: true }` |
| Amazon labelled | `35"D x 80"W x 30"H` | `{ d: 35, w: 80, h: 30, labelled: true }` |
| Length letter | `80"L x 35"W x 30"H` | `{ w: 80, d: 35, h: 30, labelled: true }` (L is the longer plan side: width; W becomes depth) |
| Unlabelled | `14.01 x 9.77 x 0.66 inches` | `{ d: 14.01, w: 9.77, h: 0.66, labelled: false }` |
| Unlabelled with order hint | `80 x 35 x 30 inches`, order `LxWxH` | `{ w: 80, d: 35, h: 30, labelled: true }` |
| Order hint D W H | `35 x 80 x 30 inches`, order `D x W x H` | `{ d: 35, w: 80, h: 30, labelled: true }` |
| Unit applies to all | `80 x 35 x 30 cm` | `{ d: 31.5, w: 13.78, h: 11.81, labelled: false }` |
| Two numbers | `60 x 96 inches` | `{ d: 60, w: 96, h: null, labelled: false }` |
| One number or none | `48 inches`, `n/a` | `null` |
| Any part refused | `0 x 9 x 3 inches` | that part `null`, the others kept |

**Verify:** `npx vitest run room-planner/server/sizes.test.ts` → all pass.
**Commit:** `feat(room-planner): product size parsing`

---

## Task 3: Page readers

**Files:**
- Create: `room-planner/server/readers/shared.ts`
- Create: `room-planner/server/readers/ikea.ts`
- Create: `room-planner/server/readers/wayfair.ts`
- Create: `room-planner/server/readers/amazon.ts`
- Create: `room-planner/server/readers/index.ts`
- Test: `room-planner/server/readers/readers.test.ts`
- Create: `room-planner/server/readers/fixtures/ikea-product.html`
- Create: `room-planner/server/readers/fixtures/ikea-category.html`
- Create: `room-planner/server/readers/fixtures/wayfair-product.html`
- Create: `room-planner/server/readers/fixtures/wayfair-category.html`
- Create: `room-planner/server/readers/fixtures/amazon-product.html`
- Create: `room-planner/server/readers/fixtures/amazon-labelled.html`
- Create: `room-planner/server/readers/fixtures/amazon-challenge.html`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `Shop`, `isShopPhotoUrl` (Task 1); `ProductFields`, `LOOKUP_LIMITS`,
  `SIZE_NOTE_UNLABELLED`, `parseProductFields` (Task 1); `parseLength`, `parseDimensionLine`
  (Task 2).
- Produces (`index.ts`): `export function readProduct(shop: Shop, html: string): ProductFields | null;`
  Null means "not a single product page". Never throws on any input string. Every non-null
  result passes `parseProductFields`.

**Fixtures.** Saved real pages (read-only source, do not copy whole) are in
`/private/tmp/claude-501/-Users-franciscosoltero-Desktop-Code-Room-Planner-Website/9b1a483d-a2b5-407a-8ced-5e3bf33d5d58/scratchpad/lookup-probe/`:
`ikea-p.html`, `wayfair-p.html`, `amazon-p.html` (product pages) and `ikea.html`,
`wayfair.html` (category pages). Cut each fixture to at most 30 KB: the `<head>` title, meta,
canonical and `application/ld+json` blocks, plus only the body fragments named in "Exact
values". Remove scripts, styles, reviews and tracking. `amazon-labelled.html` is
`amazon-product.html` with the title changed to `Rivet Revolve Modern Upholstered Sofa, Navy`,
the dimensions cell changed to `35"D x 80"W x 30"H`, and a price block
`<div id="corePrice_desktop"><span class="a-price"><span class="a-offscreen">$1,299.00</span></span></div>`.
`amazon-challenge.html` is a 1 KB page with no `productTitle` containing the text
`api-services-support@amazon.com`.

**Behavior:**

| Case | Input | Expected |
|------|-------|----------|
| IKEA product | `ikea-product.html` | name `BILLY Bookcase - black oak effect 31 1/2x11x41 3/4 "`; price 59; w 31.5; d 11; h 41.75; imageUrl `https://www.ikea.com/us/en/images/products/billy-bookcase-black-oak-effect__1097107_pe864733_s5.jpg`; description starts `BILLY Bookcase - black oak effect`, at most 600 characters; sizeNote null |
| IKEA category | `ikea-category.html` | `null` |
| Wayfair product | `wayfair-product.html` | name `Jadier 66" Upholstered Loveseat Square Sofa`; price 319.99 (not the struck-through 412.00); h 32.3; w 65.8; d 32.3; imageUrl is the `og:image` address on `assets.wfcdn.com`; sizeNote null |
| Wayfair category | `wayfair-category.html` | `null` |
| Amazon product | `amazon-product.html` | name is the first 200 characters of the trimmed `#productTitle` text; imageUrl `https://m.media-amazon.com/images/I/61fd2oCrvyL._AC_SL1500_.jpg`; d 14.01; w 9.77; h 0.66; sizeNote `SIZE_NOTE_UNLABELLED`; price null |
| Amazon labelled | `amazon-labelled.html` | name `Rivet Revolve Modern Upholstered Sofa, Navy`; d 35; w 80; h 30; sizeNote null; price 1299 |
| Amazon challenge | `amazon-challenge.html` | `null` |
| JSON-LD shapes | Product directly, inside an array, inside `@graph`; `image` as string, string array, `ImageObject`, `ImageObject` array | all read |
| JSON-LD sizes | `"31 1/2 \""`; `{ "value": 80, "unitCode": "CMT" }`; `{ "value": "31.5", "unitText": "in" }` | 31.5 each |
| Offers | single `Offer`; array of offers (first USD one); `AggregateOffer` with `lowPrice` | price read |
| Price not USD | `priceCurrency: "EUR"` | price null, rest kept |
| Broken JSON-LD | a block that is not JSON, then a valid Product block | the valid block is used |
| Photo on a foreign host | `og:image` or JSON-LD image on `evil.example` | imageUrl null, rest kept |
| Entities | name containing `&quot;`, `&amp;`, `&#x27;` | decoded to `"`, `&`, `'` |
| Hostile text | name `<img src=x onerror=alert(1)>` (as entity-encoded text in the page) | returned as that literal text; nothing is executed or stripped by the reader |
| Missing sizes | product page with no size data | w, d, h null; other fields kept |
| Empty or huge input | `` ; 5 MB of `a` | `null`, returns in well under a second |

**Exact values (where each shop's data is):**
- Shared: `<script type="application/ld+json">` blocks; a Product is an object whose `@type` is
  `Product` (or an array containing it). `og:title`, `og:image`, `og:description`,
  `link[rel=canonical]`.
- IKEA: the JSON-LD Product only. No Product block → `null`.
- Wayfair: product page when the canonical address contains `/pdp/`. Name:
  `h1[data-rtl-id="listingHeaderNameHeading"]`, else `og:title` with a trailing
  ` & Reviews | Wayfair` or ` | Wayfair` removed. Price: the first element with
  `data-test-id="PriceDisplay"` that is not an `<s>` element, text like `$319.99`. Sizes: the
  `<dd>` following the `<dt>` whose text is `Overall Dimensions` (or `Overall`), else the first
  match of `Overall Dimensions\",\"value\":\"…\"` in the embedded data.
- Amazon: product page when `#productTitle` exists. Photo: the first `data-old-hires`
  attribute on `m.media-amazon.com`, else the largest entry of `#landingImage`'s
  `data-a-dynamic-image` JSON. Price: the first `.a-price .a-offscreen` inside
  `#corePrice_desktop` or `#corePriceDisplay_desktop_feature_div` whose text starts with `$`.
  Description: the `#feature-bullets li` texts joined by a space. Sizes: the `<td>` of the row
  whose `<th>` text contains `Product Dimensions` or `Item Dimensions`; letters in that label
  after the word `Dimensions` (for example `LxWxH`, `D x W x H`) are passed as the order hint.
  `sizeNote` is `SIZE_NOTE_UNLABELLED` exactly when the parsed line is not labelled.

**Verify:** `npx vitest run room-planner/server` → all pass; `npm run typecheck`; `npm audit`
output reported; `du -k room-planner/server/readers/fixtures/*` shows no file above 30 KB.
**Commit:** `feat(room-planner): product page readers for IKEA, Wayfair and Amazon`

---

## Task 4: Safe page fetch

**Files:**
- Create: `room-planner/server/safeFetch.ts`
- Test: `room-planner/server/safeFetch.test.ts`

**Interfaces:**
- Consumes: `shopForHost` (Task 1); `LOOKUP_LIMITS` (Task 1).
- Produces:
  - `export type FetchResult = { ok: true; html: string } | { ok: false; reason: 'blocked' | 'unavailable' | 'unsupported_shop' };`
  - `export function isPublicAddress(address: string, family: 4 | 6): boolean;`
  - `export interface FetchDeps { resolve(hostname: string): Promise<{ address: string; family: 4 | 6 }[]>; request(target: { url: URL; address: string; family: 4 | 6; headers: Record<string, string>; signal: AbortSignal }): Promise<{ status: number; headers: Record<string, string | undefined>; body: AsyncIterable<Uint8Array> }>; now(): number }`
  - `export async function fetchShopPage(url: string, deps?: Partial<FetchDeps>): Promise<FetchResult>;`
    Never throws. The default `request` uses `node:https` with a `lookup` option that returns
    only the already-checked address (so the connection goes to the address that was checked),
    `servername` and `Host` set to the hostname, and gunzips a `gzip` body. The default
    `resolve` uses `dns.promises.lookup(hostname, { all: true })`.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Happy path | shop URL, public address, 200 `text/html; charset=utf-8` | `{ ok: true, html }`; `request` called once with the resolved address |
| Not https | `http://www.ikea.com/x` | `unsupported_shop`; no resolve, no request |
| Port given | `https://www.ikea.com:8443/x` | `unsupported_shop`; no request |
| Credentials | `https://u:p@www.ikea.com/x` | `unsupported_shop`; no request |
| Not a shop | `https://example.com/` | `unsupported_shop`; no resolve |
| Private address | resolve gives `10.0.0.5` | `unavailable`; no request |
| Mixed addresses | resolve gives one public and one private | `unavailable`; no request |
| Resolve fails or empty | resolve rejects or returns `[]` | `unavailable` |
| Redirect inside shop | 301 to `https://www.ikea.com/us/en/p/x/`, then 200 | ok; the second hop is resolved and checked again |
| Relative redirect | `Location: /us/en/p/x/` | resolved against the current URL, followed |
| Redirect to another shop's host | 302 to `https://www.wayfair.com/…` | followed (still on the shop list) |
| Redirect off the list | 302 to `https://evil.example/` | `unavailable`; no request to it |
| Redirect to http or a port | 302 to `http://www.ikea.com/x` | `unavailable` |
| Too many redirects | 4 redirects in a row | `unavailable` after the 3rd is followed; the 4th is not |
| Redirect without Location | 302, no header | `unavailable` |
| Refused | status 403, 429 or 503 | `blocked` |
| Challenge page | 200 whose body contains `api-services-support@amazon.com` or `/errors/validateCaptcha` | `blocked` |
| Missing page | 404, 410 | `unavailable` |
| Other status | 500, 204 | `unavailable` |
| Wrong type | 200 `application/json`, or no content type | `unavailable` |
| Too large | body over 4 MiB | `unavailable`; reading stops at the limit and the request is aborted |
| Slow | `now()` passes 8000 ms during the body or across redirects | `unavailable`; the signal is aborted |
| Request throws | network error | `unavailable` |
| Headers sent | any request | exactly `User-Agent: RoomPlannerLinkPreview/1.0`, `Accept: text/html,application/xhtml+xml`, `Accept-Language: en-US,en;q=0.9`, `Accept-Encoding: gzip, identity`; no cookies, no referer |
| `isPublicAddress` false | `0.0.0.0`, `10.1.2.3`, `100.64.0.1`, `127.0.0.1`, `169.254.169.254`, `172.16.0.1`, `172.31.255.255`, `192.0.0.1`, `192.0.2.1`, `192.168.1.1`, `198.18.0.1`, `198.51.100.1`, `203.0.113.1`, `224.0.0.1`, `255.255.255.255`, `::`, `::1`, `::ffff:8.8.8.8`, `64:ff9b::1`, `100::1`, `2001:db8::1`, `fc00::1`, `fd12::1`, `fe80::1`, `ff02::1`, `not-an-address` | `false` |
| `isPublicAddress` true | `8.8.8.8`, `172.32.0.1`, `104.16.0.1`, `2606:4700::1` | `true` |

**Verify:** `npx vitest run room-planner/server/safeFetch.test.ts` → all pass; `npm run typecheck`.
**Commit:** `feat(room-planner): SSRF-safe shop page fetch`

---

## Task 5: Rate limit, handler and route

**Files:**
- Create: `room-planner/server/rateLimit.ts`
- Test: `room-planner/server/rateLimit.test.ts`
- Create: `room-planner/server/lookupHandler.ts`
- Test: `room-planner/server/lookupHandler.test.ts`
- Create: `app/api/room-planner/lookup/route.ts`
- Modify: `package.json`
- Create: `vitest.config.ts`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: `readProduct(shop: Shop, html: string): ProductFields | null` (Task 3);
  `fetchShopPage(url: string, deps?: Partial<FetchDeps>): Promise<FetchResult>` (Task 4);
  `shopForHost`, `LOOKUP_LIMITS`, `LookupErrorCode` (Task 1).
- Produces:
  - `export interface RateLimiter { allow(key: string, now: number): { ok: true } | { ok: false; retryAfterSec: number } }`
  - `export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys: number }): RateLimiter;`
  - `export interface LookupDeps { fetchPage(url: string): Promise<FetchResult>; limiter: RateLimiter; now(): number; log(line: string): void }`
  - `export async function handleLookup(req: Request, deps?: Partial<LookupDeps>): Promise<Response>;`
  - `route.ts`: `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` and
    `export async function POST(req: Request): Promise<Response>` returning `handleLookup(req)`.
    No other method is exported.

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Limiter under the limit | 20 calls, same key, within the window | all `ok` |
| Limiter over | 21st call at time t | `{ ok: false, retryAfterSec }` = whole seconds until the oldest of the 20 leaves the window, at least 1 |
| Limiter window slides | a call 600,001 ms after the first | `ok` |
| Limiter keys independent | key A at the limit | key B `ok` |
| Limiter bounded | more than `maxKeys` distinct keys | the least recently seen key is dropped; the map never holds more than `maxKeys` |
| Success | same-origin POST, JSON `{ "url": "https://www.ikea.com/us/en/p/x/" }`, fetch ok, reader returns fields | 200, body is exactly the `ProductFields` |
| Origin missing | no `Origin` header | 403 `{ "error": "unavailable" }`; no fetch |
| Origin foreign | `Origin: https://evil.example`, `Host: frankiesoltero.com` | 403; no fetch |
| Origin match rule | `Origin` parses and its `host` equals the request's `Host` header | allowed (works on localhost and on previews with no hardcoded name) |
| Content type | not `application/json` | 400 `invalid_url`; no fetch |
| Body too large | more than 4096 bytes (by `Content-Length`, and again by bytes actually read) | 413 `invalid_url`; no fetch |
| Body not JSON, not an object, `url` missing or not a string, extra keys | — | 400 `invalid_url` |
| Link invalid | `url` longer than 2048, not parseable, scheme not `https` | 400 `invalid_url` |
| Not a shop | `https://example.com/x` | 400 `unsupported_shop`; no fetch |
| Rate limited | limiter refuses | 429 `rate_limited`, header `Retry-After: <retryAfterSec>`; no fetch |
| Limiter key | `x-forwarded-for: 203.0.113.9, 10.0.0.1` | key `203.0.113.9`; with no such header `x-real-ip`; with neither `unknown` |
| Limiter order | foreign origin or invalid body | the limiter is not charged (checked after origin and body, before the fetch) |
| Fetch blocked | `{ ok: false, reason: 'blocked' }` | 502 `blocked` |
| Fetch unavailable | `reason: 'unavailable'` | 502 `unavailable` |
| Fetch unsupported | `reason: 'unsupported_shop'` | 400 `unsupported_shop` |
| Not a product | reader returns `null` | 422 `not_a_product` |
| Handler throws inside | `fetchPage` rejects, or the reader throws | 502 `unavailable`; nothing about the error in the body |
| Response headers | every response | `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`; no `Access-Control-*` header |
| Log line | every request | one `log` call with the exact JSON shape from Global Constraints; never contains the link or the address |

The default limiter is one module-level `createRateLimiter({ limit: 20, windowMs: 600_000, maxKeys: 5000 })`.

**Verify:** `npx vitest run room-planner/server` → all pass; stop any dev server, then
`npm run check` → typecheck, lint (now including `app/api/room-planner`), all tests and the
build pass, and the build output lists `/api/room-planner/lookup` as a dynamic route.
**Commit:** `feat(room-planner): product lookup route with origin check and rate limit`

---

## Task 6: Recipe from product text

**Files:**
- Create: `room-planner/domain/furniture/fromProduct.ts`
- Test: `room-planner/domain/furniture/fromProduct.test.ts`

**Interfaces:**
- Consumes (existing, `room-planner/domain/furniture/recipe.ts`): `STYLE_OPTIONS`,
  `defaultStyle(kind: Kind): StyleValues`, `defaultColours(kind: Kind): ItemColours`,
  `completeStyle(kind: Kind, given: Readonly<Record<string, string>>): StyleValues | null`.
- Produces:
  - `export function kindFromName(name: string): Kind | null;` (null when no rule matches)
  - `export function styleFromText(kind: Kind, text: string, size?: { w: number; h: number }): StyleValues;`
    Always a complete style accepted by `completeStyle`; falls back to `defaultStyle(kind)`.
  - `export function mainColourFromName(name: string): string | null;`
  - `export function accentColourFromText(text: string, main: string | null): string | null;`
  - `export function recipeColours(kind: Kind, main: string | null, accent: string | null): ItemColours;`

All matching is on lower-cased text with word boundaries. Rules are data tables; every row of
every table below is one test.

**Behavior — kind (first matching rule wins, in this order):**

| # | Words | Kind |
|---|-------|------|
| 1 | `desk chair`, `office chair`, `task chair`, `gaming chair` | chair |
| 2 | `nightstand`, `night stand`, `bedside table`, `bedside` | nightstand |
| 3 | `tv stand`, `tv unit`, `tv console`, `tv bench`, `media console`, `media stand`, `entertainment center` | tvstand |
| 4 | `dresser`, `chest of drawers`, `drawer chest` | dresser |
| 5 | `sofa table`, `console table`, `coffee table`, `side table`, `end table`, `dining table`, `accent table`, `kitchen table` | table |
| 6 | `rug`, `carpet` | rug |
| 7 | `sofa`, `couch`, `loveseat`, `sectional`, `settee`, `futon` | sofa |
| 8 | `desk` | desk |
| 9 | `bookcase`, `bookshelf`, `shelving unit`, `shelf unit` | shelf |
| 10 | `bed`, `beds`, `bed frame`, `daybed` | bed |
| 11 | `table`, `tables` | table |
| 12 | `chair`, `chairs`, `armchair`, `stool`, `recliner` | chair |
| 13 | `shelf`, `shelves` | shelf |
| — | none | `null` |

Named cases that must hold: `Sofa bed` → sofa; `Bedside table with drawer` → nightstand;
`TV stand with 2 drawers` → tvstand; `Coffee table with shelf` → table; `Office chair` → chair;
`BILLY Bookcase - black oak effect` → shelf; `Jadier 66" Upholstered Loveseat Square Sofa` →
sofa; `Bedding set` → null; `Tablet stand` → null; `MacBook Pro Laptop` → null.

**Behavior — style (rules applied top to bottom; a later row overrides an earlier one):**

| Kind | Words | Sets |
|------|-------|------|
| sofa | `loveseat`, `2-seat`, `2 seater`, `two-seat` | seats 2 |
| sofa | `3-seat`, `3 seater`, `three-seat` | seats 3 |
| sofa | `4-seat`, `4 seater` | seats 4 |
| sofa | `sectional`, `chaise` | chaise right |
| sofa | `left-facing`, `left facing`, `left-hand`, `left arm`, `left chaise`, `laf` | chaise left |
| sofa | `armless` | arms none |
| sofa | `rolled arm`, `round arm`, `rounded arm` | arms rounded |
| sofa | `slim arm`, `narrow arm`, `thin arm` | arms slim |
| sofa | `tufted`, `tight back`, `tight-back` | cushions tight |
| sofa | `high back`, `high-back` | back high |
| sofa | `low back`, `low-back`, `low profile`, `low-profile` | back low |
| sofa, chair | `metal leg`, `steel leg`, `chrome leg`, `iron leg` | legs metal |
| sofa, chair | `tapered`, `mid-century`, `mid century`, `splayed` | legs tapered |
| chair | `dining`, `side chair` | type dining, arms no |
| chair | `office`, `task`, `desk`, `gaming`, `swivel` | type office, legs pedestal |
| chair | `armchair`, `accent`, `lounge`, `club`, `recliner` | type armchair |
| chair | `armless`, `stool` | arms no |
| chair | `with arms`, `armrest`, `armrests` | arms yes |
| bed | `upholstered`, `fabric`, `velvet`, `linen`, `tufted` | finish upholstered |
| bed | `platform` | base platform |
| bed | `storage`, `drawer`, `drawers` | base storage |
| bed | `tall headboard`, `high headboard`, `wingback` | headboard tall |
| bed | `no headboard`, `without headboard`, `frame only` | headboard none |
| bed | `footboard` | footboard yes |
| bed | `no footboard`, `without footboard` | footboard no |
| desk | no drawer word at all | drawers none |
| desk | `drawer`, `drawers`, `1-drawer`, `2-drawer` | drawers right |
| desk | `N-drawer` with N of 3 or more | drawers both |
| desk | `no drawers`, `without drawers` | drawers none |
| desk | `trestle`, `sawhorse` | supports trestle |
| desk | `panel sides`, `panel legs`, `slab legs` | supports panels |
| table | no shelf word | shelf no |
| table | `shelf`, `2-tier`, `two-tier`, `tiered` | shelf yes |
| table | `round`, `circular` | top round |
| table | `pedestal`, `tulip` | base pedestal |
| table | `trestle` | base trestle |
| shelf | `N-shelf`, `N shelves`, `N-tier` (N a digit) | shelves N, clamped to 2..8 |
| shelf | `open back`, `open-back`, `backless`, `ladder`, `etagere` | back no |
| dresser | `N-drawer`, `N drawers`, size wider than tall or unknown | columns: 3 when N is 9 or more, 2 when N is 4 to 8, else 1; rows: `Math.round(N / columns)` clamped to 2..6 |
| dresser | `N-drawer`, `N drawers`, size taller than wide | columns 1; rows N clamped to 2..6 |
| dresser | `bar pull`, `bar handle` | handles bar |
| dresser | `handleless`, `handle-free`, `push to open`, `push-to-open` | handles none |
| dresser | `knob`, `knobs` | handles knob |
| dresser, nightstand, tvstand | `plinth`, `no legs` | base plinth |
| nightstand | `open` | drawers 0 |
| nightstand | `drawer`, `drawers` | drawers 1 |
| nightstand | `N-drawer`, `N drawers` | drawers N, clamped to 0..2 |
| tvstand | `open` | fronts open |
| tvstand | `drawer`, `drawers` | fronts drawers |
| tvstand | `door`, `doors`, `cabinet`, `cabinets` | fronts doors |
| rug | no border word | border no |
| rug | `border`, `bordered` | border yes |
| rug | `round`, `circular` | shape round |
| box | anything | `{}` |

Named cases: dresser `6-drawer`, size 60 × 34 → columns 2, rows 3; dresser `6-drawer`,
size 30 × 50 → columns 1, rows 6; dresser `9-drawer` wide → 3 × 3; dresser `5-drawer` wide →
2 × 3; sofa `left-facing sectional` → chaise left; sofa with no matching word →
`defaultStyle('sofa')` unchanged; text containing `__proto__` or `constructor` → no effect.

**Behavior — colours:**

| Case | Input | Expected |
|------|-------|----------|
| Main from the name | name contains a word from the main table | that word's colour; when several match, the one starting earliest in the name; at the same start, the longest |
| No colour word | `Jadier 66" Upholstered Loveseat Square Sofa` | `null` |
| Not inside another word | `Redwood`, `Tangerine`, `Greyhound` | `null` (word boundaries) |
| Accent from text | text contains a word from the accent table whose colour differs from `main` | the first such word's colour |
| Accent equals main | `Walnut coffee table`, main `#6b4a33` | `null` |
| `recipeColours` main | main given / null | main / `defaultColours(kind).main` |
| `recipeColours` accent given | any kind | the accent |
| `recipeColours` accent null, kind whose default main equals its default accent (table, shelf, box) | main given | accent = main |
| `recipeColours` accent null, other kinds | — | `defaultColours(kind).accent` |

**Exact values — main colour words:**
`white` #f3f1ec; `ivory` #ece6d8; `cream`, `off-white`, `off white` #ddd8ce; `beige` #cdbfa8;
`sand` #c9b8a3; `tan` #b89b78; `taupe` #9a8b7c; `camel` #b58a5a; `brown` #6b4a33;
`chocolate` #4a3428; `espresso` #3b2f27; `black` #232325; `charcoal` #3a3d42;
`dark gray`, `dark grey` #55595f; `light gray`, `light grey` #b9bcc0; `gray`, `grey` #8a8d91;
`slate` #6f7f8c; `silver` #b8bcc2; `navy` #2f4057; `dark blue` #2b3f63; `light blue` #a9c1d6;
`blue` #4a6fa5; `teal` #2f7f7b; `turquoise` #3aa7a3; `dark green`, `forest green` #2f4f3a;
`emerald` #2e7d5b; `olive` #6f7242; `sage` #8a9a8b; `green` #5c7a55; `mustard` #c79a2b;
`yellow` #d9b53f; `gold` #b08d57; `orange` #cf7a35; `rust`, `terracotta` #b5673f;
`burgundy`, `wine`, `maroon` #6b2331; `red` #a8322d; `blush` #e0bdb8; `pink` #d7a1a8;
`lavender` #b3a4cf; `purple` #6a4c8c; `oak` #b98d5e; `walnut` #6b4a33;
`natural`, `birch`, `pine`, `bamboo`, `rattan` #caa877; `mahogany`, `cherry` #7a3b2a.

**Exact values — accent words:**
`black metal`, `black steel`, `black legs`, `matte black` #2b2b2d; `brass`, `gold` #b08d57;
`chrome`, `silver`, `stainless`, `nickel` #b8bcc2;
`oak`, `natural wood`, `light wood`, `birch`, `beech`, `pine`, `ash` #b98d5e;
`walnut`, `dark wood`, `acacia`, `mango wood` #6b4a33; `espresso`, `wenge` #3b2f27.

**Verify:** `npx vitest run room-planner/domain/furniture/fromProduct.test.ts` → all pass,
including a test that for every kind, every style rule's result is accepted by `completeStyle`.
**Commit:** `feat(room-planner): furniture recipe from product name and description`

---

## Task 7: Photo colours

**Files:**
- Create: `room-planner/domain/furniture/photoColours.ts`
- Test: `room-planner/domain/furniture/photoColours.test.ts`
- Create: `room-planner/services/photoSampler.ts`
- Test: `room-planner/services/photoSampler.test.ts`

**Interfaces:**
- Consumes: `isShopPhotoUrl(url: string): boolean` (Task 1).
- Produces (`photoColours.ts`, pure):
  - `export interface PhotoColours { main: string | null; accent: string | null }`
  - `export function dominantColours(pixels: Uint8ClampedArray, width: number, height: number): PhotoColours;`
- Produces (`photoSampler.ts`):
  - `export const PHOTO_SAMPLE_SIZE = 64; export const PHOTO_TIMEOUT_MS = 6000;`
  - `export interface SamplerDeps { loadPixels(url: string, size: number, signal: AbortSignal): Promise<Uint8ClampedArray> }`
  - `export async function samplePhotoColours(url: string, opts?: { signal?: AbortSignal; deps?: Partial<SamplerDeps> }): Promise<PhotoColours>;`
    Never rejects. The default `loadPixels` creates an `Image` with `crossOrigin = 'anonymous'`
    and `referrerPolicy = 'no-referrer'`, draws it at 64 × 64 on a canvas that is never added to
    the document, and returns `getImageData(0, 0, 64, 64).data`.

**Behavior (`dominantColours`; RGBA input, 4 bytes per pixel):**

| Case | Input | Expected |
|------|-------|----------|
| Object on white | 64 × 64 white with a centred 32 × 32 square of `#2f4057` | main `#2f4057`; accent null |
| Two colours | white, a 32 × 24 block of `#2f4057` above a 32 × 8 block of `#b98d5e` | main `#2f4057`; accent `#b98d5e` |
| Coloured backdrop | uniform `#e8e0d0` backdrop, centred `#6b2331` square | main `#6b2331` (the backdrop is removed by the corner colour) |
| White inside the object | white backdrop, a ring of `#3a3d42` enclosing a white centre | main `#3a3d42` or the white centre, whichever has more pixels; the enclosed white is counted (it is not connected to the border) |
| Nothing left | all white; all transparent | `{ main: null, accent: null }` |
| Tiny object | fewer than 2% of pixels remain | `{ main: null, accent: null }` |
| Near-duplicate | `#2f4057` and `#31425a` blocks | accent null (too close to main) |
| Small second colour | second colour under 5% of remaining pixels | accent null |
| Bad input | length not `width * height * 4`; width or height 0 | `{ main: null, accent: null }` |
| Output form | any | `#rrggbb` lower case or null |

**Exact values (algorithm constants):** background-like = alpha below 128, or every channel at
least 240, or the largest channel difference from the corner colour (mean of the four corner
pixels) at most 24. Background = background-like pixels reachable from the border by
4-connected steps. Remaining pixels are bucketed by `(r >> 4, g >> 4, b >> 4)`; a colour is the
mean of its bucket's pixels, rounded. Main = the largest bucket. Accent = the largest other
bucket holding at least 5% of remaining pixels whose colour differs from main by at least 96
(sum of absolute channel differences).

**Behavior (`samplePhotoColours`):**

| Case | Input / state | Expected |
|------|---------------|----------|
| Good photo | shop photo URL; `loadPixels` resolves with pixels | `dominantColours` of them |
| Foreign host | URL not passing `isShopPhotoUrl` | nulls; `loadPixels` not called |
| Load fails | `loadPixels` rejects (load error or a tainted canvas) | nulls |
| Slow | `loadPixels` does not settle within 6000 ms | nulls; its signal is aborted |
| Caller aborts | `opts.signal` aborts | nulls; inner signal aborted |

**Verify:** `npx vitest run room-planner/domain/furniture/photoColours.test.ts room-planner/services/photoSampler.test.ts` → all pass.
**Commit:** `feat(room-planner): main and accent colours from a product photo`

---

## Task 8: Store, lookup service and actions

**Files:**
- Modify: `room-planner/domain/types.ts`
- Modify: `room-planner/state/planStore.ts`
- Modify: `room-planner/state/uiStore.ts`
- Modify: `room-planner/state/actions.ts`
- Test: `room-planner/state/stores.test.ts`
- Test: `room-planner/state/lookup.test.ts`
- Modify: `room-planner/services/productLookup.ts`
- Test: `room-planner/services/productLookup.test.ts`
- Create: `room-planner/services/remoteProductLookup.ts`
- Test: `room-planner/services/remoteProductLookup.test.ts`
- Modify: `room-planner/test/fakePlanStore.ts`

**Interfaces:**
- Consumes: `LOOKUP_PATH`, `LookupErrorCode`, `isLookupErrorCode`, `parseProductFields`,
  `ProductFields` (Task 1); `shopForHost` (Task 1); `kindFromName`, `styleFromText`,
  `mainColourFromName`, `accentColourFromText`, `recipeColours` (Task 6);
  `samplePhotoColours(url, opts?): Promise<PhotoColours>` (Task 7); existing
  `parseProductUrl`, `capProductText`, `LookupError`, `ProductLookup` in
  `services/productLookup.ts`; existing `TYPICAL_SIZE`, `KIND_LABELS`, `defaultStyle`,
  `completeStyle`, `normaliseColour`.
- Produces (`domain/types.ts`), replacing the current `ProductPreview`:
  ```ts
  export interface ProductPreview {
    kind: Kind; name: string; host: string; sourceUrl: string; price: number | null;
    w: number; d: number; h: number;
    kindFound: boolean; sizesFound: boolean; sizeNote: string | null;
    imageUrl: string | null; style: StyleValues; colours: ItemColours;
  }
  ```
- Produces (`services/productLookup.ts`): `LookupErrorCode` is now re-exported from the
  contract (six codes); `LOOKUP_MESSAGES: Record<LookupErrorCode, string>` (texts below);
  `LookupError` unchanged in shape.
- Produces (`services/remoteProductLookup.ts`):
  - `export interface RemoteLookupDeps { fetch: typeof fetch; samplePhoto: typeof samplePhotoColours }`
  - `export function createRemoteProductLookup(deps?: Partial<RemoteLookupDeps>): ProductLookup;`
  - `export const remoteProductLookup: ProductLookup;`
- Produces (`state/planStore.ts`):
  - `export interface NewItemSpec { kind: Kind; name?: string; host?: string; sourceUrl?: string | null; price?: number | null; w?: number; d?: number; h?: number; style?: Readonly<Record<string, string>>; colours?: Partial<ItemColours> }`
  - `addFurnitureFrom(spec: NewItemSpec): string | null;` on `PlanState`. `addFurniture(kind)`
    keeps its signature and becomes `addFurnitureFrom({ kind })`.
- Produces (`state/uiStore.ts`):
  - `export type LookupState = { status: 'idle' } | { status: 'loading' } | { status: 'preview'; preview: ProductPreview } | { status: 'error'; code: LookupErrorCode };`
  - state `lookup: LookupState` (initially idle), `pendingLink: { url: string; host: string } | null`;
    setters `setLookup(next: LookupState): void`, `setPendingLink(next: { url: string; host: string } | null): void`.
- Produces (`state/actions.ts`):
  - `export async function lookupProduct(raw: string, lookup?: ProductLookup): Promise<void>;`
  - `export function updatePreview(patch: { kind?: Kind; w?: number; d?: number; h?: number }): void;`
  - `export function addPreviewToRoom(): string | null;`
  - `export function dismissLookup(): void;`

**Behavior — `addFurnitureFrom`:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Kind only | `{ kind: 'sofa' }` | identical to today's `addFurniture('sofa')` (existing tests still pass) |
| Full spec | kind, name, host, link, price, sizes, style, colours | one item with those values, `model` the planner's default, centred and placed by the same rule as `addFurniture`; returns its id |
| One undo step | add from a spec, then undo | the item is gone in one step; redo brings it back whole |
| Name | trimmed; empty after trimming, or over 200 characters | the kind's label; cut to 200 |
| Host, link | host over 255; link over 2048 or not `http(s)` | host cut to 255; link `null` |
| Price | negative, `NaN`, over 10,000,000 | `null` |
| Sizes | below 0.25 or above 240; not finite; missing | clamped to [0.25, 240]; the kind's typical size |
| Style | partial; has an unknown key or value | merged over `defaultStyle(kind)`; `defaultStyle(kind)` |
| Colours | partial; a value that is not `#rrggbb` | merged over `defaultColours(kind)`; that colour's default |
| Plan full | 200 items | `null`, nothing changes |
| Saved plan stays valid | add from any spec above, save, reload | `parsePlan` accepts it; `schemaVersion` 4; no photo address anywhere in the stored text |

**Behavior — `remoteProductLookup.lookup(url, { signal })`:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Not a link | `parseProductUrl` throws | `LookupError('invalid_url')`; no request |
| Not a shop | parsed host fails `shopForHost` | `LookupError('unsupported_shop')`; no request |
| Request shape | shop link | one `fetch(LOOKUP_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), credentials: 'omit', signal })` |
| Server error body | non-2xx with `{ error: <known code> }` | `LookupError(code)` |
| Unknown error | non-2xx with anything else; network failure; body not JSON | `LookupError('unavailable')` |
| Aborted | signal aborts | the abort error propagates (callers ignore it) |
| Bad success body | 200 whose body fails `parseProductFields` | `LookupError('unavailable')` |
| Kind | name `Jadier 66" Upholstered Loveseat Square Sofa` | kind `sofa`, `kindFound` true; no rule matches → kind `box`, `kindFound` false |
| Sizes found | w, d, h all present | used, each clamped to [0.25, 240]; `sizesFound` true |
| Sizes missing | any of the three null | missing ones from `TYPICAL_SIZE[kind]`; `sizesFound` false |
| Style | — | `styleFromText(kind, name + ' ' + description, { w, h })` |
| Colour from name | name has a colour word | main from the name; `samplePhoto` not called unless an accent is still missing and a photo exists |
| Colour from photo | no colour word, photo present | main and accent from `samplePhoto`; a name-derived accent word still wins over the photo's accent |
| No photo, no word | — | `defaultColours(kind)` through `recipeColours` |
| Text caps | long name, host or link | passed through `capProductText` |
| Result | — | `sourceUrl` the normalised link; `host` the parsed host; `imageUrl` as returned; `sizeNote` as returned |

**Behavior — actions:**

| Case | Input / state | Expected |
|------|---------------|----------|
| `lookupProduct` success | lookup resolves | `lookup` goes loading → preview; `pendingLink` null |
| `lookupProduct` failure | `LookupError(code)` | `lookup` = error with that code; for every code except `invalid_url`, `pendingLink` = the parsed `{ url, host }` |
| Second lookup while loading | a new call | the first is aborted and its late result is ignored |
| Empty input | `` or spaces | `invalid_url` error; no request |
| `updatePreview` sizes | a size outside [0.25, 240] or not finite | ignored; a valid size replaces the preview's; `sizesFound` is unchanged |
| `updatePreview` kind | a different kind | style becomes `defaultStyle(newKind)`; colours, name and sizes kept; `kindFound` true |
| `updatePreview` with no preview | status not preview | no-op |
| `addPreviewToRoom` | status preview | `addFurnitureFrom` with the preview's kind, name, host, link, price, sizes, style, colours; the piece is selected; `lookup` idle; returns the id |
| `addPreviewToRoom`, plan full | 200 items | the existing notice `This plan is full. Remove a piece to add another.`; preview kept; returns `null` |
| `dismissLookup` | any status | aborts a running lookup; `lookup` idle; `pendingLink` null |
| `addFurnitureOfKind` with a pending link | `pendingLink` set | the new piece gets that `sourceUrl` and `host`; `pendingLink` cleared; `lookup` idle |
| `addFurnitureOfKind` without one | — | unchanged from today |

**Exact values — `LOOKUP_MESSAGES`:**
- `invalid_url`: `That doesn't look like a link. Paste the full product URL.`
- `unsupported_shop`: `That shop isn't supported yet. Pick a type below.`
- `blocked`: `The shop didn't let us read that page. Pick a type below.`
- `not_a_product`: `That page isn't a single product. Pick a type below.`
- `unavailable`: `Couldn't read that page. Try again, or pick a type below.`
- `rate_limited`: `Too many lookups. Try again in a few minutes.`

**Verify:** `npx vitest run room-planner/state room-planner/services` → all pass;
`npm run typecheck` → no errors; `grep -rn "from '.*server/" room-planner/state room-planner/services room-planner/domain` → no output.
**Commit:** `feat(room-planner): lookup service, preview state and add-from-product`

---

## Task 9: Link box and preview card

**Files:**
- Create: `room-planner/components/Sidebar/ProductLinkBox.tsx`
- Test: `room-planner/components/Sidebar/ProductLinkBox.test.tsx`
- Create: `room-planner/components/Sidebar/ProductPreviewCard.tsx`
- Test: `room-planner/components/Sidebar/ProductPreviewCard.test.tsx`
- Modify: `room-planner/components/Sidebar/AddFurnitureSection.tsx`
- Test: `room-planner/components/Sidebar/AddFurnitureSection.test.tsx`
- Modify: `room-planner/components/Sidebar/addFurniture.css`
- Modify: `room-planner/components/Sidebar/PlanSection.tsx`
- Test: `room-planner/components/Sidebar/PlanSection.test.tsx`
- Create: `room-planner/three/previewSnapshot.ts`
- Test: `room-planner/three/previewSnapshot.test.ts`

**Interfaces:**
- Consumes: `lookupProduct`, `updatePreview`, `addPreviewToRoom`, `dismissLookup` (Task 8);
  `useUiStore` fields `lookup`, `pendingLink`, `mode` (Task 8); `LOOKUP_MESSAGES` (Task 8);
  `ProductPreview` (Task 8); existing `DimInput`, `KIND_ORDER`, `KIND_LABELS`,
  `buildFurniture(item: FurnitureSpec): THREE.Group`, `CONFIG.hemiIntensity`,
  `CONFIG.sunIntensity`, `CONFIG.itemDimMin`, `CONFIG.itemDimMax`.
- Produces:
  - `export function ProductLinkBox(): JSX.Element;`
  - `export function ProductPreviewCard(props: { preview: ProductPreview }): JSX.Element;`
  - `export function renderPieceSnapshot(spec: FurnitureSpec, sizePx?: number): string | null;`
    (a PNG data URL of a three-quarter view, or null when WebGL is unavailable or anything
    fails; never throws)
  - `export function disposePreviewRenderer(): void;`

**Behavior:**

| Case | Input / state | Expected |
|------|---------------|----------|
| Layout | section 02 | heading, then the link box, then the preview card or error line, then the note and the type grid as today |
| Link box | idle | label `Paste a product link`; a `type="url"` input with `maxLength` 2048 and `autoComplete="off"`; button `Look up`; note `Works with IKEA, Amazon and Wayfair.` |
| Submit | Enter in the input, or the button | `lookupProduct(value)` once; an empty value does nothing |
| Loading | status loading | button disabled and reads `Reading the page…`; the input stays editable; an element with `aria-live="polite"` announces it |
| Error | status error | the code's `LOOKUP_MESSAGES` text in a `role="alert"` element; the input keeps its value; the type grid stays enabled |
| Link kept | `pendingLink` set | a line `The next piece you add will keep this link.` with a `Clear` button calling `dismissLookup` |
| Preview card | status preview | the name as text; the shop host; the price as `$1,299` or `$319.99` (omitted when null); the photo `<img>` with `alt=""`, `referrerPolicy="no-referrer"`, `loading="lazy"`, only when `imageUrl` is set; the snapshot `<img>` with `alt="Preview of the piece"` when a snapshot exists |
| Photo fails | the photo's `error` event | the photo is removed; the rest stays |
| Type picker | a `<select>` labelled `Type` with the 11 kinds | change calls `updatePreview({ kind })` |
| Type not found | `kindFound` false | the line `Type not recognised: pick one.` beside the picker |
| Sizes | three `DimInput`s labelled Width, Depth, Height | a valid edit calls `updatePreview` with that size |
| Sizes not found | `sizesFound` false | the line `Sizes not found: check these.` |
| Size note | `sizeNote` set | shown as text |
| Add | button `Add to room` | `addPreviewToRoom()`; the card closes and the input is cleared |
| Cancel | button `Cancel` | `dismissLookup()` |
| Room-edit mode | `mode === 'room'` | input, `Look up` and `Add to room` disabled, like the type grid |
| Hostile name | name `<img src=x onerror=alert(1)>` | appears as literal text; no `img` element is created from it |
| Snapshot refresh | kind, sizes, style or colours change | re-rendered at most once per 150 ms |
| Snapshot unavailable | `renderPieceSnapshot` returns null (as in jsdom) | no snapshot image; no error |
| One renderer | many snapshots | one lazily created module-level `WebGLRenderer` on a canvas that is never attached, reused; `disposePreviewRenderer` (called when the card unmounts) disposes it; each snapshot disposes its own geometries and materials |
| Snapshot never throws | `THREE.WebGLRenderer` construction throws | `null` |
| Keyboard shortcuts | typing in the link input, including Delete, R and Ctrl/Cmd+Z | planner shortcuts do not fire (the existing text-field guard); covered by a test |
| Privacy note | `PlanSection` | exactly `Saved in this browser only. A share link contains the whole plan. A pasted product link is sent to this site to read the page, and the product photo loads from the shop.` |

Styling follows `addFurniture.css` and `itemList.css` conventions (existing variables, `.btn`,
`.note`); the card fits the sidebar with no horizontal scroll at 1280 px wide.

**Verify:** `npx vitest run room-planner/components/Sidebar room-planner/three/previewSnapshot.test.ts`
→ all pass; then stop any dev server and run `npm run check` → all green.
**Commit:** `feat(room-planner): product link box and preview card`

---

## Task 10: Docs

**Files:**
- Modify: `docs/room-planner/README.md`
- Modify: `docs/room-planner/mistakes-and-fixes.md`
- Modify: `docs/fixes-log.md`
- Modify: `README.md`

**Interfaces:** none.

**Behavior:**

| Case | Expected |
|------|----------|
| `docs/room-planner/README.md` | a section `Product lookup (slice H)`: the request path from link box to placed piece; the file map (`room-planner/lookup`, `room-planner/server`, `domain/furniture/fromProduct.ts`, `photoColours.ts`, `services/remoteProductLookup.ts`, `services/photoSampler.ts`, the route); the security rules of the route (shop list, address check, pinned address, redirects, limits, origin check, rate limit, logging); how to add a shop; a section `Known limits of the lookup` |
| Vercel rule | under `Product lookup (slice H)`, the text of the firewall rule for the owner: path equals `/api/room-planner/lookup`, rate limit 20 requests per 10 minutes per IP, action deny with 429 |
| `docs/room-planner/mistakes-and-fixes.md` | a heading `## 2026-11-20 — Product lookup` with one entry per defect found during this build (what, cause, fix, how to avoid); taken from the ledger and review reports, not invented |
| `docs/fixes-log.md` | one dated entry summarising the slice, in the file's existing format |
| Root `README.md` | the Room Planner line mentions the product lookup and the new route |

**Verify:** `git diff --stat` shows only the four files; every path named in the new sections
exists (`ls` each).
**Commit:** `docs(room-planner): product lookup notes, known limits and firewall rule`

---

## Final verification (controller, after Task 10)

1. `npm run check` green on the final tree.
2. Whole-branch review, including a security pass over `room-planner/server/` and the route.
3. Browser check on a local production build (`npm run build && npx next start -p 3478`). The
   Vercel preview is behind Vercel login and is not opened. Rows, each recorded pass or fail:

| # | Check | Pass when |
|---|-------|-----------|
| 1 | Two real product links per shop | each recorded as works or refused, with the recipe produced; at least IKEA works |
| 2 | Add a looked-up piece | it appears at the page's size in both views, selected, with link and price; one undo removes it |
| 3 | Edit after adding | type, sizes, style and colours all change the piece |
| 4 | Each failure | a non-shop link, a shop category page, and `not a link` each show their message with the type grid usable; a non-shop link is kept on the next piece added |
| 5 | Direct route abuse | `curl` with no `Origin` → 403; with `Origin` of another site → 403; a private-address or non-shop link → 400; 21 lookups in a row → 429 with `Retry-After` |
| 6 | Saved plan and share link | after adding a looked-up piece, stored text is version 4 and contains no photo address; the share link reopens the same room; a plan saved before this change still opens |
| 7 | Network | opening a share link makes no request to any shop host |
| 8 | Console | zero errors across rows 1–7 |
| 9 | Screenshots | each looked-up piece beside its product photo, saved to `docs/room-planner/verification/shots-lookup/` with a record in `docs/room-planner/verification/2026-11-20-lookup-live-check.md` |

4. After the owner's merge: rows 1 and 5 again on the live site. A shop that refuses the live
   server is reported as "hand entry only" and the note under the link box is corrected.
