# Francisco Soltero — 8-bit Portfolio + Papers

Two sections, two deliberately different design languages:

- **`/`** — an NES/SNES game-UI portfolio built as a single **Design Component**: one
  HTML template plus a small JS logic class, rendered client-side by `support.js`.
  Still build-free; it lives untouched in `public/` and is served as a static file.
- **`/papers`** — AI research-paper breakdowns with small-scale reproductions, rendered
  by Next.js (App Router) from MDX files in `content/papers/`. Styled as a technical
  experiment log (IBM Plex, Run Cards), not the 8-bit theme.

## Run locally

```bash
npm install
npm run dev
# then open http://localhost:3000/  (8-bit site) and /papers
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

## Publishing a paper

1. Copy `content/papers/_template.mdx` to `content/papers/<slug>.mdx`.
2. Fill the frontmatter (schema enforced at build time by `lib/papers.ts`).
3. Set `status: "published"` and push — the RSS feed and sitemap update automatically.

## Deploy

Vercel, framework preset **Next.js** (`npm run build`). The 8-bit page deploys as a
static asset within the same project.
