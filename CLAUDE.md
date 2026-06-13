# CLAUDE.md — agent orientation

This project is **Francisco Soltero's 8-bit portfolio website** — an NES/SNES game-UI
site (palette + components inspired by *Dave the Diver* / *The Captain*). The whole
site is framed as a playable character sheet.

## Read this first
**`STYLE_GUIDE.md` is the source of truth.** It documents the color system, typography,
the pixel-frame `box-shadow` recipes, every component, the icon system, content voice,
and step-by-step "how to add a project/skill/section" recipes. Do not design or edit
without reading it — the visual language is strict and easy to break.

## Files
- `index.html` — the site. Add/edit projects in the `quests` array and skills in
  `skillGroups`, both inside its logic class (`renderVals()`).
- `Style Tile.dc.html` — living design-system reference. Mirror any new component here.
- `support.js` — Design Component runtime. **Never edit.**
- `Francisco_Soltero_Resume.pdf` — wired to the RESUME / SAVE FILE buttons.

## Non-negotiables (full rationale in STYLE_GUIDE.md)
- Both `.dc.html` files are **Design Components**: HTML template + `class Component
  extends DCLogic`. **Inline styles only** — no CSS classes/stylesheets (keeps streaming
  paint instant). Only `@keyframes`/fonts/resets go in `<helmet><style>`.
- **No logic inside `{{ }}` holes** — compute in the logic class, expose by name.
- Colors come only from the **Sweetie-16** ramp; accents follow the semantic map
  (EMBER=action, CYAN=links/tech, SLIME=success/HP, GOLD=XP/featured, BLOOD=danger/boss).
- **No** `border-radius`, blurred shadows, or decorative gradients. Edges are 4-direction
  `box-shadow` with notched corners.
- Imagery is **labeled sprite-slot placeholders** — never hand-draw illustrative art.
