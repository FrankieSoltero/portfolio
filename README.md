# Francisco Soltero — 8-bit Portfolio

An NES/SNES game-UI portfolio built as a single **Design Component**: one HTML template
plus a small JS logic class, rendered client-side by `support.js`. No build step, no
framework tooling — the whole site is framed as a playable character sheet.

## Run locally

Serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

(Opening `index.html` directly over `file://` also works.)

## Structure

- `index.html` — the site. Projects live in the `quests` array and skills in
  `skillGroups`, inside the logic class (`renderVals()`).
- `support.js` — the Design Component runtime. **Do not edit.**
- `vendor/` — React + ReactDOM (18.3.1 UMD), preloaded before `support.js` so the site
  has **no runtime CDN dependency**.
- `Style Tile.dc.html` — living design-system reference.
- `STYLE_GUIDE.md` — source of truth for the visual language (colors, type, components).
- `Francisco_Soltero_Resume.pdf` — wired to the RESUME / SAVE FILE buttons.

## Deploy

Static hosting (Vercel). No build command; output directory is the repo root; entry is
`index.html`. Any static host works the same way.
