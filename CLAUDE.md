# CLAUDE.md — agent orientation

This project is **Francisco Soltero's 8-bit portfolio website** — an NES/SNES game-UI
site (palette + components inspired by *Dave the Diver* / *The Captain*). The whole
site is framed as a playable character sheet.

## Read this first
**`STYLE_GUIDE.md` is the source of truth.** It documents the color system, typography,
the pixel-frame `box-shadow` recipes, every component, the icon system, content voice,
and step-by-step "how to add a project/skill/section" recipes. Do not design or edit
without reading it — the visual language is strict and easy to break.

## Three sections (8-bit, papers, room planner)
- **`/` (8-bit character sheet)** — everything below applies to it. Lives in `public/`
  and is served as a static file (a rewrite in `next.config.ts` maps `/` to
  `public/index.html`). Still build-free.
- **`/papers` (experiment log)** — a Next.js App Router section wearing a **hybrid
  8-bit skin**: Sweetie-16 palette, pixel-frame box-shadows, Press Start 2P
  headings/labels/badges, VT323 metadata — but body prose, math, and code stay in
  readable faces (IBM Plex Sans/Mono). **Never set body copy in pixel type.** Spec:
  `docs/superpowers/specs/2026-07-02-papers-8bit-hybrid-design.md` (supersedes
  PLAN.md §4's paper-white direction); tokens live in `app/papers/papers.css`.
- **`/room-planner` (room layout tool)** — React + three.js, client-side only. Source in
  `room-planner/`, route in `app/room-planner/`. It has its **own design language**
  (the Industry design system in `room-planner/styles/industry.css`), **not the 8-bit
  skin**. Its styles must stay scoped to `.room-planner`; this is enforced by
  `room-planner/styles/scoping.test.ts`. No backend: the plan is saved in the browser under
  `room-planner:plan:v1`, validated on load and never sent to a server. The room is an
  outline edited in "Edit room" mode, and furniture rotates to any angle. Every value read
  from storage must pass through `parsePlan`. Views read room and item geometry only through
  `room-planner/domain/shape.ts`. Run `npm run check` before committing. Docs in
  `docs/room-planner/`.

## Files
- `public/index.html` — the 8-bit site. Add/edit projects in the `quests` array and
  skills in `skillGroups`, both inside its logic class (`renderVals()`).
- `public/Style Tile.dc.html` — living design-system reference. Mirror any new 8-bit
  component here.
- `public/support.js` — Design Component runtime. **Never edit.**
- `public/Francisco_Soltero_Resume.pdf` — wired to the RESUME / SAVE FILE buttons.
- `content/papers/*.mdx` — papers posts (copy `_template.mdx`); frontmatter schema is
  zod-enforced in `lib/papers.ts`.
- `app/papers/`, `components/papers/` — papers routes and components.

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
