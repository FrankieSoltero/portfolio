# Francisco Soltero — 8-bit Portfolio + Papers + Room Planner

Three sections, three deliberately different design languages:

- **`/`** — an NES/SNES game-UI portfolio built as a single **Design Component**: one
  HTML template plus a small JS logic class, rendered client-side by `support.js`.
  Still build-free; it lives untouched in `public/` and is served as a static file.
- **`/papers`** — AI research-paper breakdowns with small-scale reproductions, rendered
  by Next.js (App Router) from MDX files in `content/papers/`. Styled as a technical
  experiment log (IBM Plex, Run Cards), not the 8-bit theme.
- **`/room-planner`** — a room layout tool: 2D plan and 3D check, React and three.js,
  client-side except one product lookup route. Source in `room-planner/`, mounted by `app/room-planner/`. Has its
  own design language (Industry), not the 8-bit theme. The room is an outline edited in
  "Edit room" mode, and furniture rotates to any angle. Walls can be dragged on the plan
  and each shows its length, which can be typed there. Undo and redo (Cmd/Ctrl+Z) cover everything
  saved in the plan except the units choice. The plan is saved in the browser
  under `room-planner:plan:v1`, validated on load and never sent to a server. A pasted IKEA, Amazon
  or Wayfair link is looked up through `POST /api/room-planner/lookup`, which sends only that link to
  the site's server. The product photo loads from the shop while the preview is open and is never saved.

## Run locally

```bash
npm install
npm run dev
# then open http://localhost:3000/  (8-bit site), /papers and /room-planner
```

`next.config.ts` rewrites `/` to `public/index.html`, so the character sheet is served
byte-identical with zero build processing.

## Structure

- `public/index.html` — the 8-bit site. Projects live in the `quests` array and skills
  in `skillGroups`, inside the logic class (`renderVals()`).
- `public/support.js` — the Design Component runtime. **Do not edit.**
- `public/vendor/` — React + ReactDOM (18.3.1 UMD), preloaded before `support.js` so
  the 8-bit page has **no runtime CDN dependency** (independent of Next's React).
- `public/Style Tile.dc.html` — living design-system reference for the 8-bit language.
- `STYLE_GUIDE.md` — source of truth for the 8-bit visual language.
- `PLAN.md` — spec for the papers section (design tokens, Run Card, tasks).
- `app/papers/` — routes, layout, and `papers.css` design tokens for `/papers`.
- `components/papers/` — RunCard, PaperIndexEntry, TagFilter, Figure, Callout.
- `content/papers/*.mdx` — one file per paper; copy `_template.mdx` to start a post.
- `lib/papers.ts` — typed content layer (zod-validated frontmatter).
- `public/Francisco_Soltero_Resume.pdf` — wired to the RESUME / SAVE FILE buttons.
- `room-planner/` — the Room Planner source (React + three.js). `PlannerRoot.tsx` renders
  the `.room-planner` wrapper and imports the self-hosted fonts and stylesheets. Styles
  live in `room-planner/styles/` and must stay scoped to `.room-planner` (enforced by
  `room-planner/styles/scoping.test.ts`). No backend except the one lookup route: the plan is saved in the browser
  under `room-planner:plan:v1`, validated on load and never sent to a server; "Reset
  plan" erases it. The room carries doors, windows and fixed obstacles (boxes, raised
  boxes, columns). Undo and redo history is kept for the visit in
  `room-planner/state/historyStore.ts`. Furniture is generated in the browser from a saved recipe (`room-planner/domain/furniture/`); a pasted shop link fills in the recipe through the product lookup (`room-planner/lookup/`, `room-planner/server/`, `app/api/room-planner/lookup/`).
- `app/room-planner/` — the `/room-planner` route: `page.tsx`, `PlannerLoader.tsx`
  (loads the planner client-side only) and `error.tsx` (load-failure screen).
- `docs/room-planner/` — specs, plans, plan reviews, verification notes, the read-only
  `design_handoff/` reference and `mistakes-and-fixes.md`. See its `README.md`.

## Publishing a paper

1. Copy `content/papers/_template.mdx` to `content/papers/<slug>.mdx`.
2. Fill the frontmatter (schema enforced at build time by `lib/papers.ts`).
3. Set `status: "published"` and push — the RSS feed and sitemap update automatically.

## Checks

- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint on `room-planner` and `app/room-planner` only.
- `npm test` — Vitest (config in `vitest.config.mts`): planner and route tests.
- `npm run check` — typecheck, lint, tests, then build. Run it before committing.

`package.json` pins `postcss` under `next` with an `overrides` entry; see
`docs/fixes-log.md` for why.

## Deploy

Vercel, framework preset **Next.js** (`npm run build`). The 8-bit page deploys as a
static asset within the same project.
