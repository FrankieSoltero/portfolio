# Portfolio — Fixes & Lessons Log

## 2026-06-13 — Production-ready + polish pass

**Spec:** docs/superpowers/specs/2026-06-13-portfolio-production-ready-polish-design.md
**Plan:** docs/superpowers/plans/2026-06-13-portfolio-production-ready-polish.md

### Changes
- Mobile responsiveness (≤760px) via a `matchMedia` flag read in `renderVals()`,
  returning per-breakpoint inline style values. Flash-free: first render reads the
  live value; a `change` listener (registered in `componentDidMount`) re-renders.
- Real arrow-key section navigation (`keydown` listener; current section derived from
  scroll position so it never goes stale). Footer claim is now accurate.
- Focus rings via `style-focus` using `outline` (avoids clashing with bevel box-shadows).
- `prefers-reduced-motion` honored via one `@media` rule in `<helmet>`.
- Contrast: meaningful STEEL `#566c86` captions bumped to MIST `#94b0c2`.
- Decorative generated icons marked `aria-hidden="true"` in `buildIcon`.

### Lessons / gotchas
- `support.js` auto-loads React/ReactDOM/Babel from the unpkg CDN — the site has a
  runtime CDN dependency. Removing it (vendoring deps) is a deferred follow-up phase.
- Inline-styles-only is preserved: responsive values are *selected* in JS, still emitted
  as literal inline styles. No CSS classes, no `support.js` edits.
- `outline` (not `box-shadow`) is the safe focus-ring tool here because every framed
  element already uses `box-shadow` for its border/bevel.

### Follow-up tweaks (same day)
- **Section tag pills** (`QUEST LOG` / `INVENTORY` / `LORE`): replaced the Unicode
  glyphs `★ ◈ ✦` with generated `buildIcon` pixel icons (`iconTagStar`,
  `iconTagDiamond`, `iconTagSpark`, dark-inked `#1a1c2c`). The glyphs aren't in
  Press Start 2P, so they rendered from a fallback font with mismatched metrics and
  sat off-baseline; an SVG icon has a clean box that the pill's `align-items:center`
  centers exactly. (Also more on-brand per STYLE_GUIDE §9.)
- **IDE "94 problems":** false positives from the editor's CSS validator parsing
  `{{ }}` template holes inside `style="..."` attributes. Silenced via
  `.vscode/settings.json` (`html.validate.styles:false`, `css.validate:false`) — the
  code is valid and runs; only the linter was confused.
- **Quest card layout bug:** shorter cards (Internal Tool, LastCall) showed the card's
  `#1a1c2c` background below the sprite column. Cause: grid stretches cards to equal row
  height, but the inner flex row only filled its content. Fix: card → `display:flex;
  flex-direction:column`, inner row → `flex:1`, so the sprite column stretches to full
  card height.
- **Copy pass (voice: "polished, keep the game theme"):** removed slang across all
  sections (`agent-pilled`, `leveled up`, `grinding a side-quest`, `talk shop`,
  `respond fast`, `WIP`); tightened quest/featured/bio/contact prose. Updated role to
  **Forward Deployed AI Engineer & Founder**; bio now leads with founding LastCall and
  treats Tenex as a previous role (per user's factoid edits).

## 2026-07-02 — /papers section (Next.js hybrid)

**Spec:** PLAN.md (papers-scaffold drop, root copy) · **Branch:** `papers-section`

### Changes
- Wrapped the repo in Next.js **without touching the 8-bit site**: `index.html`,
  `support.js`, `vendor/`, résumé, and Style Tile moved to `public/` and served
  statically; a `beforeFiles` rewrite maps `/` → `/index.html`. Verified `curl /`
  is byte-identical to `public/index.html`.
- Built the papers section per PLAN.md: zod-validated MDX content layer
  (`lib/papers.ts`), SSG post pages, server-filtered tag index, RunCard/RunBadge,
  Figure (graph-grid), Callout, RSS at `/papers/feed.xml`, `app/sitemap.ts`,
  IBM Plex fonts via `next/font`, tokens in `app/papers/papers.css`.
- Added `PAPERS` to the 8-bit nav (`navItems`, one-line, style untouched); DC parse
  check passes.

### Lessons / gotchas
- **MDX display math:** `$$...$$` on a single line is parsed as *inline* math by
  micromark; the `$$` delimiters must sit on their own lines to get a
  `katex-display` block. Fixed in `grokking.mdx` and documented in `_template.mdx`.
- **next-mdx-remote v5 had a high advisory** (GHSA-g4xw-jxrg-5f6m, arbitrary code
  execution on untrusted MDX). Upgraded to v6 — same `/rsc` API, no code changes.
  A moderate `postcss` advisory remains *inside* Next's own dependency tree; not
  actionable from this repo (audit's "fix" downgrades Next to 9.x — never do that).
- **Contrast:** the plan's amber `--partial` (#B4690E) is 4.2:1 against white/paper —
  below AA (4.5:1) for the small mono badge/label text. Added `--partial-strong`
  (#8F5307, ≥5.9:1) for text fills; `--partial` remains for borders and tints.
- **Two design systems in one repo:** `/papers` deliberately does NOT use the
  Sweetie-16/pixel language. Rules for keeping them separate are in CLAUDE.md.
- **Vercel:** the project was imported as framework "Other" (static). It must be
  switched to the **Next.js** preset (build command `npm run build`) for `/papers`
  to deploy.

### Same day — hybrid 8-bit skin on /papers (user picked "Option A")
- Reskinned /papers per docs/superpowers/specs/2026-07-02-papers-8bit-hybrid-design.md:
  Sweetie-16 dark ground, pixel-frame box-shadows, Press Start 2P chrome, VT323
  metadata; body/math/code stay in readable faces. Shiki theme github-light →
  tokyo-night. IBM Plex Serif dropped.
- All contrast pairs recomputed for the dark ground (table in the spec); badges are
  night-text-on-bright-fill (≥6.2:1).
- Gotcha for future figures: charts now sit on a dark graph-grid panel — export PNGs
  with dark/transparent backgrounds (noted in _template.mdx).

### Same day — white background + broken routing
- **White edges/pages:** the App Router had no global reset — default white `<body>`
  with 8px margin showed at page edges, on overscroll, and on all error pages. Fix:
  `app/globals.css` (html/body → margin 0, `#1a1c2c` ground) + a themed
  `app/not-found.tsx` ("404 — AREA NOT FOUND").
- **500s on bad routes / missing images:** caused by running `npm run build` while
  `next dev` was running — **both write `.next/` and corrupt each other**
  (`Cannot find module './873.js'`). Fix: stop dev → `rm -rf .next` → restart.
  **Rule: never build while the dev server is up.**

## 2026-09-02 — Multiplayer AI quest + PillSpark role + first real sprite

### Changes
- New `Multiplayer AI` quest card (first in the grid) with optional per-card fields:
  `href` (renders a `GITHUB →` link beside the reward, mirroring the featured card)
  and `sprite` (fills the 108px thumbnail slot). `noSprite` is computed in
  `renderVals()` so the placeholder branch stays a plain `sc-if` — no logic in holes.
- Role text: Origin Story bio + `GUILD` factoid now name PillSpark AI (Forward
  Deployed Engineer) alongside LastCall. Résumé PDF not yet updated.
- `public/sprites/multiplayer-ai.png` exported from the root `Multiplayer_AI_Sprite.aseprite`
  (64×64, one layer) with a small pure-Python decoder — no Aseprite CLI on the box.

### Lessons / gotchas
- **Data-bound `<img src="{{ … }}">` 404s before hydration.** The DC template is raw
  body markup, so the browser fetched the literal `/{{ q.sprite }}` (console 404)
  before `support.js` compiled it. Fix: `sc-camel-src="{{ q.sprite }}"` — the runtime
  strips the `sc-camel-` prefix into a normal `src` prop; the browser ignores the
  unknown attribute. Anchors never had this problem because `href` isn't prefetched.
- **`object-fit:cover` crops square sprites in tall slots.** The grid thumbnail column
  is 108px wide but card-height tall; `cover` blew the 64×64 up to full height and
  cut the sides. Use `width:100%; height:auto` and let the flex slot center it.
- **Non-integer sprite scale looks wobbly.** 64px → 108px (1.69×) made pixel columns
  alternate 1px/2px wide. Grid column is now 132px (`border-box`: 128px content +
  4px `border-right` divider) so 64×64 sources render at exactly 2×. Also: an `<img>`
  filling a slot paints *over* the slot's inset `box-shadow`, breaking the divider —
  hence a real border for the divider. Column is painted in the quest's `spriteBg`
  so the art reads as a panel, not a tile on stripes.

## 2026-11-13 — Dependency audit before the Room Planner move

### Counts (`npm audit --omit=dev`)
| Severity | Before | After |
|----------|-------:|------:|
| critical | 1 (`next`) | 0 |
| high | 6 (`js-yaml`, `nanoid`, `postcss`, `sharp`, `source-map-js`, `zod`) | 1 (`zod`) |
| moderate | 0 | 0 |
| low | 4 (`katex`, `rehype-katex`, `remark-math`, `micromark-extension-math`) | 4 (same) |

### Packages updated
- `npm audit fix` (no `--force`), lockfile only, all within existing semver ranges:
  `next` 15.5.20 → 15.5.29, `js-yaml` 3.15.0 → 3.15.2, `nanoid` 3.3.15 → 3.3.20,
  `source-map-js` 1.2.1 → 1.2.2, `sharp` 0.34.5 → 0.35.5 (with its `@img/*`
  platform packages; libvips 1.2.4 → 1.3.4), `@emnapi/runtime` 1.11.1 → 1.11.3.
- **Override:** `package.json` gains `"overrides": { "next": { "postcss": "8.5.33" } }`,
  so `postcss` under `next` goes 8.4.31 → 8.5.33 (outside the advisory range `<=8.5.22`).
  Why: `next@15.5.29`, the newest 15.x, pins `postcss` to exactly `8.4.31`, so
  `npm audit fix` cannot move it; npm's only offered fix is Next 16 (a major).
  **Remove this override when Next is upgraded to 16.**
- Left as-is at this step (fixes are semver-major): `zod` 3.x (fix is 4.x; upgraded in the next
  step, see "zod upgrade" below) and `katex` 0.16.x
  (fix is 0.19.x, which also flags `rehype-katex` and `remark-math`).

### Verification
- `npm run build` exit 0; routes `/papers`, `/papers/[slug]`, `/papers/feed.xml`,
  `/sitemap.xml` still present.
- `/papers` and `/papers/grokking` HTML served before and after are identical once
  `/_next/static/…` paths and the build id are normalised away.

### zod upgrade (clears the last high finding)
- `zod` 3.25.76 → 4.6.7 (`package.json` range `^3.25.67` → `^4.6.7`), clearing
  GHSA-mrhx-c7xc-m3w5 (affects `zod` below 4.6.6). Audit now: 0 critical, 0 high,
  0 moderate, 4 low.
- `lib/papers.ts`: no code change needed. Every API it uses (`z.object`, `z.string`,
  `.min`, `.regex(re, message)`, `.optional`, `.url`, `z.enum`, `z.array`, `z.infer`,
  `safeParse`, `error.issues`) still exists in zod 4; `.url()` is only deprecated.
- Checked with a probe of 26 frontmatter cases run on both versions: the same cases
  are accepted and rejected, at the same field paths. Our own messages (`date must be
  YYYY-MM-DD`, `slug must be lowercase kebab-case`) are unchanged; zod's built-in
  messages are worded differently (e.g. `Required` is now `Invalid input: expected
  string, received undefined`). One data difference: zod 4's `.url()` trims
  surrounding spaces from the value it returns (`" https://x "` → `"https://x"`);
  no current paper has a padded URL.
- Build with `date: "2026/01/01"` in `content/papers/grokking.mdx` fails with the same
  text on both versions: `Invalid frontmatter in content/papers/grokking.mdx:` /
  `  - date: date must be YYYY-MM-DD`.

### Remaining low findings (left on purpose)
All four come from one advisory, GHSA-238p-pmpm-9mq7 (KaTeX: existing prototype
pollution can bypass trust restrictions, `katex` >=0.11.0 <0.18.2).

| Package | Installed | Advisory | npm's offered fix |
|---------|-----------|----------|-------------------|
| `katex` | 0.16.47 | GHSA-238p-pmpm-9mq7 | `katex` 0.19.1 |
| `rehype-katex` | 7.0.1 | via `katex` | `rehype-katex` 1.2.0 |
| `remark-math` | 6.0.0 | via `micromark-extension-math` | `remark-math` 3.0.1 |
| `micromark-extension-math` | 3.1.0 | via `katex` | `remark-math` 3.0.1 |

Why they stay: each fix is a breaking change to the papers math rendering — npm flags
all three as semver-major (`katex` 0.16 → 0.19, and the `rehype-katex` / `remark-math`
"fixes" are downgrades to old major versions with different plugin APIs). The advisory
needs prototype pollution that already exists; KaTeX here renders only the repo's own
MDX content, not user input.

## 2026-11-17 — Home page title, tab icon and Room Planner blurb

### Changes
- `public/index.html` had no `<title>`, no description and no `lang`. The browser tab and
  search results showed the bare address. Added all three.
- The site had no icon, so the browser's automatic `/favicon.ico` request returned 404 and
  logged a console error on the home page. Added `public/favicon.svg` (a pixel star in the
  site's colours), linked from `index.html` and from the root layout's metadata.
- The Room Planner page declared an empty icon (`data:,`) to avoid that same 404. That
  workaround is removed; the page now inherits the real icon from the layout.
- The Room Planner project card's blurb described the first version. It now mentions room
  drawing, doors and windows, stopping at walls and undo.

### Lesson
- A workaround for a missing asset (the empty icon) hid the gap on one page and left it on
  the others. Add the asset once at the root when it is missing site-wide.

## 2026-11-17 — Room Planner link in the navigation; card mentions sharing

### Changes
- `public/index.html`: the top navigation gains `PLANNER`, linking to `/room-planner`
  (after `PAPERS`). Until now the planner was reachable only through its project card.
- The Room Planner project card's blurb and reward line mention sharing (a link with no
  server behind it, or a picture), which went live the same day.
- Checked at 1440, 1024 and 390 px wide: no horizontal scroll; at 390 px the navigation
  wraps to two rows, as it did before.

## 2026-11-18 — Starting plan has no furniture

### Changes
- The Room Planner's starting plan (`createInitialDocument()` in
  `room-planner/domain/catalog.ts`) held a queen bed and a desk. At the owner's request it is
  now the same 12 × 14 ft room, 8 ft tall, with no furniture. The room, units, height, doors,
  windows and obstacles are unchanged. The same function feeds the plan store's first state
  and `Reset plan`, so both now give an empty room.
- Saved plans are untouched. There is no migration: a plan already in a visitor's browser
  (`room-planner:plan:v1`) or in a share link loads as it was, furniture included.
- Tests that need furniture now load `furnishedDocument()` from
  `room-planner/test/fixtures.ts`, which is the old furnished plan with the same ids
  (`seed-bed`, `seed-desk`). Tests about the starting plan or Reset keep
  `createInitialDocument()` and now check that the bed and desk are absent. The version 1 and
  version 2 sample documents in `planSchema.test.ts` still migrate to the furnished plan.
- The empty room already reads correctly: the furniture list shows "Nothing placed yet.", the
  total shows $0, and the plan picture, 2D plan and 3D view draw the room with nothing in it.
  No other production change was needed. Comments that called the starting plan "seeded" now
  call it "starting".

### Lesson
- The starting plan was also the shared test setup for about 30 test files. Test data that
  must stay fixed belongs in a test fixture, not in a production default the owner may change.

## 2026-11-20 — Furniture generator

### Changes
- The Room Planner's "Add furniture" section was a placeholder product lookup: pasting a link or
  pressing a sample button returned made-up data. It is removed. Furniture is now generated in the
  browser from a saved recipe (a style and two colours per piece) and added by type: 11 types,
  three of them new (dresser, nightstand, TV stand). A selected piece can be edited (size, style
  options, colours, type), and every change is one undo step.
- The 3D view, the floor plan, the blueprint and the downloaded floor-plan picture are all drawn
  from the same list of parts (`room-planner/domain/furniture/`), so they match. Round pieces
  (a round rug, a round table top) are drawn round in all of them; in the downloaded picture they
  use 48 points so they are smooth at 2000 px.
- The saved plan and the share link are `schemaVersion` 4. Versions 1 to 3 load as before, and
  each existing piece gets its type's default recipe. The spec is
  `docs/room-planner/specs/2026-11-20-furniture-generator-design.md`.
- The root `README.md` no longer says product lookup is a mock.

### Lesson
- A placeholder that returns made-up data looks like a feature. Remove it when the real thing is
  not ready, and say so, rather than leaving it in front of visitors.

## 2026-11-20 — Product lookup

### Changes
- The Room Planner can look up a product from a pasted IKEA, Amazon or Wayfair link. A server route,
  `POST /api/room-planner/lookup` (the site's first), fetches the page and returns only the product
  fields. The browser turns them into a furniture recipe and shows a preview; Add to room places the
  piece. Anything else the visitor pastes is refused, and the type grid stays usable.
- The route fetches only shop hosts, over `https`, at an address it checked to be public, with
  redirects, size, time and rate limits, an `Origin` check and one log line per request. Details,
  how to add a shop and the Vercel firewall rule the owner adds after merge are in
  `docs/room-planner/README.md` under "Product lookup (slice H)".
- The plan format stays at version 4. The photo address is never saved or shared.
- The privacy note under "Plan" no longer says nothing is sent anywhere: a pasted product link is sent
  to this site to read the page, and the product photo loads from the shop. The root `README.md` says
  the same.
- Final fix wave (2026-11-22, `4ae70fd`, `6513398`, `7a9afae`, `b5e7644`): the link box uses the
  planner's own link check, the Wayfair and Amazon readers stay linear on hostile pages, timing tests
  measure CPU time, room photos are coloured from their centre, and the route and fetch were hardened
  (`maxDuration`, IPv4 preference, reset dismisses a running lookup, anonymous photo request,
  `Retry-After` only when valid).

### Lessons
- A size cap is not a time cap: the HTML parser needed its own limit and its own timed tests.
- A security gate validates its own input; two layers that check the same value must agree.
- Fourteen build mistakes are in `docs/room-planner/mistakes-and-fixes.md`.
