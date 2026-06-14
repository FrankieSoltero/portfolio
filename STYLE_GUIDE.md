# Francisco Soltero — 8-Bit Portfolio · Style Guide

> A complete design + engineering reference for extending this site. Written so a
> coding agent (Claude Code, Codex, etc.) or a human can add features without
> breaking the visual language. Read this top-to-bottom before editing.

---

## 0. TL;DR for the agent

- **Aesthetic:** NES/SNES game UI. Think the menus of *Dave the Diver* / *The Captain* — chunky pixel frames, deep-ocean navy, warm arcade accents. The whole site is framed as a playable character sheet (hero = title screen, projects = quest log, skills = inventory, contact = save point).
- **Hard rules:** no rounded corners, no gradients-as-decoration (only the dotted "starfield" backgrounds and the diagonal sprite-slot hatching), no soft shadows. Everything is built from **stepped `box-shadow` pixel borders**. Spacing, type, and color come from the tokens below — don't invent new ones.
- **Files you'll edit:** `index.html` (the site) and `Style Tile.dc.html` (the living design system). Both are **Design Components** — see §1.
- **To add a project:** edit the `quests` array in the logic class of `index.html`. Nothing else. (§9.1)
- **Imagery:** every picture is a labeled **sprite slot** placeholder. Don't draw art — leave slots for Francisco's own pixel sprites. (§8)

---

## 1. Architecture — how these files work

Both `.dc.html` files are **Design Components (DCs)**. A DC is a single self-contained HTML file with three parts assembled around a small runtime (`support.js`, included automatically — never edit it):

1. **Template** — the markup, written with `{{ value }}` holes and a few custom control-flow tags.
2. **Logic class** — `class Component extends DCLogic { ... }`. Plain classic JS (no TypeScript, no imports). A `renderVals()` method returns the values the template's holes read.
3. **Props metadata** (optional) — not used heavily here.

### Template syntax you'll encounter

| Syntax | Meaning |
|---|---|
| `{{ user.name }}` | Dotted value lookup from `renderVals()`. **Paths only — no expressions.** Compute anything complex in JS and expose it by name. |
| `style="color:{{ q.color }}"` | Interpolated attribute. Fine for data-driven values that exist on first render (everything in `renderVals` is synchronous here). |
| `<sc-for list="{{ quests }}" as="q" hint-placeholder-count="5">…</sc-for>` | Loop. `$index` is in scope. Always keep the `hint-placeholder-count`. |
| `<sc-if value="{{ flag }}" hint-placeholder-val="{{ true }}">…</sc-if>` | Conditional. |
| `onClick="{{ handler }}"` | Event handlers are whole-value holes bound to functions from `renderVals()` (JSX camelCase). |
| `<helmet>…</helmet>` | Top-of-template block for `<link>` fonts, `@font-face`, `@keyframes`, and body resets. **The only place CSS rules and `<script>` are allowed.** |

### Styling rule (important)

**Inline styles only.** No CSS classes, no stylesheets. The only things in `<helmet><style>` are what *can't* be inline: `@keyframes`, font `@import`/`<link>`, and `* { box-sizing }` / `body` resets. This is deliberate — inline styles paint immediately as the file streams. When you add a component, repeat the literal inline styles; don't refactor them into classes.

### Editing workflow

- Edit the **template** and the **logic class** in place. In this environment that's `dc_write` / `dc_html_str_replace` / `dc_js_str_replace`. In a normal editor, just edit the corresponding regions of the file.
- `renderVals()` runs synchronously and returns a flat object. Add data (arrays of project/skill objects), handlers, and precomputed strings here.
- Anything you'd write as a JSX expression (`.map`, ternaries, comparisons) goes in the logic class and is exposed by name — **never** put logic inside `{{ }}`.

---

## 2. Design philosophy

1. **The site is a character sheet.** Every section maps to a game concept. Keep that metaphor consistent when adding content (a new section should have a game name: "bestiary", "shop", "world map", etc.).
2. **Chunky over delicate.** Big type, thick borders, hard edges, 4–6px pixel steps. If something looks subtle or web-default, it's wrong.
3. **Restraint in color.** Deep navy fields, one warm accent per moment. Don't rainbow everything — accents earn attention (rarity, XP, links).
4. **Placeholders are honest.** Art that doesn't exist yet is a labeled slot, not a bad sprite. This is a feature: Francisco fills slots with his own pixel art over time.

---

## 3. Color system — "Sweetie-16"

The entire palette is the 16-color **Sweetie-16** ramp (by GrafxKid). Never introduce colors outside this set. If you need a tint, pick the nearest ramp value.

| Token | Hex | Use |
|---|---|---|
| `VOID` | `#1a1c2c` | Primary panel fill, dark text-on-light, border ink |
| `BLACK` | `#000000` | Outermost frame borders (panels) |
| `SLATE` | `#333c57` | Secondary surfaces |
| `DEEP` | `#29366f` | Inset window fill, dividers (`border-top:3px solid #29366f`) |
| `COBALT` | `#3b5dc9` | Secondary button hover |
| `SKY` | `#41a6f6` | Bar fills, EPIC accent |
| `CYAN` | `#73eff7` | **Links, tech, headings-accent.** The "interactive" color |
| `STEEL` | `#566c86` | Muted captions / metadata |
| `MIST` | `#94b0c2` | Body text on dark |
| `BONE` | `#f4f4f4` | Primary text, highlights |
| `SLIME` | `#a7f070` | **HP / success / "online".** Status dots, RARE accent |
| `MOSS` | `#38b764` | HP bar secondary stripe |
| `TEAL` | `#257179` | Save-point frame |
| `GOLD` | `#ffcd75` | **XP / highlight / LEGENDARY.** Reward text, featured |
| `EMBER` | `#ef7d57` | **Primary action.** Buttons, EPIC accent |
| `BLOOD` | `#b13e53` | Danger / BOSS rarity / hero title shadow |
| `PLUM` | `#5d275d` | Rare deep accent (unused-spare) |

**Deep field colors** used for backgrounds (slightly darker than panels, for contrast):
`#0e1018` (page), `#10142b` (hero/contact field), `#0e1530` (chip/HUD inset), `#0b1024` / `#0b0c12` (sprite-slot + bar track).

### Semantic mapping (memorize)
- **Primary action → EMBER**, hover → GOLD.
- **Links / tech / "click me" → CYAN.**
- **Success / live / HP → SLIME.**
- **XP / reward / featured → GOLD.**
- **Danger / boss → BLOOD.**

---

## 4. Typography

Three families, loaded in `<helmet>` from Google Fonts. Never add a fourth.

| Family | Role | Rules |
|---|---|---|
| **Press Start 2P** | Display — page titles, section tags, level numbers, button labels, rarity badges | **Large only.** Min ~8px (badges) and it gets unreadable fast — never use for sentences. Line-height 1.3–1.5. |
| **Pixelify Sans** | UI + body — headings inside cards, paragraphs, chips, stat values | Weights 400/600/700. This carries all readable prose. |
| **VT323** | Terminal / meta — captions, metadata rows, difficulty strings, system flavor ("NOW PLAYING", "SAVE POINT REACHED") | Monospace. Sizes 14–24px. |

### Type scale (observed in the build)
- Hero `<h1>`: Press Start 2P **46px**, `text-shadow:5px 5px #b13e53`.
- Section `<h2>`: Press Start 2P **24px**, `text-shadow:3px 3px #29366f`.
- Section tag pill: Press Start 2P **12px**.
- Card title `<h3>`: Pixelify Sans 700, **20–24px**.
- Body paragraph: Pixelify Sans **17–21px**, line-height 1.45–1.55, color `#94b0c2` or `#cdd9e5`.
- Meta / captions: VT323 **16–18px**, color `#566c86`.

**Heading shadow recipe:** always a hard offset pixel shadow, no blur — `text-shadow:Npx Npx <DEEP or BLOOD>`.

---

## 5. The pixel-frame system (core visual language)

Every box edge is built from **`box-shadow` offsets in the 4 cardinal directions** — this produces a flat border with *notched (cut) corners*, the signature 8-bit window look. No `border`, no `border-radius`.

### 5.1 Flat panel (the workhorse)
```css
background:#1a1c2c;
box-shadow:0 -5px #000, 0 5px #000, -5px 0 #000, 5px 0 #000;
```
Vary the offset (`3–6px`) for border weight. Use `#000` ink on dark panels.

### 5.2 Inset "dialogue window" (raised, beveled)
```css
background:#29366f;
box-shadow:
  0 -6px #000, 0 6px #000, -6px 0 #000, 6px 0 #000,   /* notched border */
  inset 0 5px #4a5aa8,                                  /* top highlight  */
  inset 0 -5px #1b2247;                                 /* bottom shade   */
```
Add a title bar inside: a `#1a1c2c` strip with `box-shadow:inset 0 -3px #000` and a Press Start 2P label.

### 5.3 Beveled button (primary)
```css
background:#ef7d57; color:#1a1c2c; border:none; cursor:pointer;
font-family:'Press Start 2P'; 
box-shadow:
  0 -4px #1a1c2c, 0 4px #1a1c2c, -4px 0 #1a1c2c, 4px 0 #1a1c2c,
  inset 3px 3px #ffd0b8,    /* light top-left  */
  inset -3px -3px #b8492a;  /* dark bottom-right */
/* hover  */ background:#ffcd75; inset highlights → #fff0c8 / #d99a3c
/* active */ transform:translateY(3px);   /* "press down" */
```
Secondary button = `#29366f` fill, `#73eff7` text, `inset 3px 3px #4a5aa8 / inset -3px -3px #1b2247`, hover → `#3b5dc9` fill + `#fff` text.

> **Bevel direction is fixed: light top-left, dark bottom-right.** Pressed state inverts via `translateY`, not by swapping the bevel.

### 5.4 Tech chip / inventory slot
```css
font-family:'Pixelify Sans'; font-weight:600; color:#73eff7;
background:#0e1530; padding:6px 11px;
box-shadow:0 -3px #000, 0 3px #000, -3px 0 #000, 3px 0 #000;
```
Inventory variant prepends an 8×8 colored square (`<span style="width:8px;height:8px;background:<group color>">`).

### 5.5 Stat bar (HP/MP/XP)
```css
/* track */ height:16px; background:#0b0c12; box-shadow:inset 2px 2px #000; padding:3px;
/* fill  */ height:100%; width:<pct>; animation:fillbar 1.4s ease-out;
           background:repeating-linear-gradient(90deg,#a7f070 0,#a7f070 8px,#38b764 8px,#38b764 12px);
```
The striped `repeating-linear-gradient` gives the segmented retro-bar feel. Colorways: HP green (`#a7f070/#38b764`), MP/cyan (`#73eff7/#41a6f6`), XP gold (`#ffcd75/#ef7d57`).

### 5.6 Section tag pill
```css
display:inline-flex; align-items:center; gap:10px;
background:#ffcd75; color:#1a1c2c; padding:8px 15px;
font-family:'Press Start 2P'; font-size:12px;
box-shadow:0 -4px #1a1c2c, 0 4px #1a1c2c, -4px 0 #1a1c2c, 4px 0 #1a1c2c;
```
The pill's `background` is the section's theme accent (GOLD quests, CYAN inventory, SLIME lore, EMBER/various).

### 5.7 Rarity badge (absolute, corner-pinned)
```css
position:absolute; top:-1px; right:14px;
background:<rarityColor>; color:#1a1c2c;
font-family:'Press Start 2P'; font-size:8–9px; padding:6px 9px;
box-shadow:0 3px #1a1c2c;   /* drop tab under the badge */
```
Parent card gets `position:relative` and an `inset 0 0 0 3px <rarityColor>` ring on hover.

---

## 6. Spacing & layout

- **Container:** `max-width:1160px; margin:0 auto; padding:… 22px`.
- **Section vertical rhythm:** `padding:72px 22px 24px` per section; `scroll-margin-top:84px` so sticky-nav anchors land correctly.
- **Grid gaps:** cards `gap:22px`; chips `gap:7–10px`; inner stacks `gap:9–18px`.
- **Sticky HUD:** `position:sticky; top:0; z-index:50;` with `box-shadow:0 4px #000, 0 8px rgba(0,0,0,.4)`.
- Prefer **flex/grid with `gap`** for any row of siblings (chips, buttons, nav). Never space with bare inline elements or per-item margins.

### Decorative backgrounds (the only "gradients" allowed)
- **Starfield** (hero/contact): layered `radial-gradient(rgba(...) 1px, transparent 1px)` with `background-size:30–48px` and offset positions. Dotted, subtle.
- **Sprite-slot hatching:** `repeating-linear-gradient(45deg,#131a3a 0,#131a3a 8px,#0b1024 8px,#0b1024 16px)` — the diagonal "empty slot" texture.

---

## 7. Animation

All keyframes live in `<helmet><style>`. Motion is **snappy and looping**, never eased-soft for UI.

| Keyframe | Use |
|---|---|
| `blink` (steps(1), 1s) | Cursor blocks, "PRESS START" |
| `bob` (translateY ±8px, ~3s) | Floating player sprite, save-point crystal |
| `fillbar` (width 0→set) | Stat bars filling on load |
| `shimmer` (opacity 0.55↔1) | "online" status dot |
| `float-star` (rise + fade) | Drifting background stars in hero |

Add new motion as named keyframes; reference with inline `animation:` on the element. Don't animate via JS for simple loops.

---

## 8. Sprite-slot system (imagery)

**Do not draw illustrative art.** Every image is a placeholder slot the user fills with their own pixel sprites:
```html
<div style="width:240px; height:240px; background:#0b1024;
  background-image:repeating-linear-gradient(45deg,#131a3a 0,#131a3a 8px,#0b1024 8px,#0b1024 16px);
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 -6px #000,0 6px #000,-6px 0 #000,6px 0 #000, inset 0 0 0 4px #29366f;">
  <span style="font-family:'VT323'; font-size:19px; color:#566c86; text-align:center;">
    [ DROP YOUR PLAYER SPRITE HERE ]
  </span>
</div>
```
When real art exists, swap the inner `<span>` for an `<img style="image-rendering:pixelated; width:100%; height:100%; object-fit:cover">`. Keep the frame `box-shadow`.

Locations: hero player sprite (240×240), featured quest (280px col), grid quest thumbnails (108px col), about/contact crystals.

---

## 9. Pixel-icon system

Icons are generated, not hand-drawn SVG. The logic class has `buildIcon(rows, map, scale)`:

- `rows`: array of equal-length strings — a tiny bitmap. Each character is one pixel.
- `map`: `{ char: hexColor }`. Any char not in the map (`.` by convention) is transparent.
- `scale`: pixel size multiplier (renders an SVG of `width*scale × height*scale`).
- Output: an `<svg>` of 1×1 `<rect>`s with `image-rendering:pixelated; shape-rendering:crispEdges`.

Example (the heart):
```js
buildIcon(
  ['.HH.HH.', 'HHHHHHH', 'HHHHHHH', '.HHHHH.', '..HHH..', '...H...'],
  { H: '#b13e53' }, 4
)
```
Existing icons: `heart, coin, star, gem, bolt, mail, disk` (+ small/big variants). To add one: write a bitmap, add it to the icon map in `renderVals()`, expose it (e.g. `iconKey`), and drop `{{ iconKey }}` in the template. Keep bitmaps ≤ ~10×10 and recolor with the Sweetie-16 ramp.

### 9.1 How to add a project (quest)
Edit the `quests` array in `index.html`'s logic class. Each entry:
```js
{
  title: 'Project Name',
  rarity: 'EPIC',            // LEGENDARY | BOSS | EPIC | RARE  (label text)
  color: '#ef7d57',          // rarity accent (badge bg + hover ring + reward text)
  status: 'SHIPPED',         // SHIPPED | LIVE | DEPLOYED | CLEARED | …
  statusColor: '#a7f070',    // SLIME for good/live, MIST for archived
  diff: 'DIFFICULTY ●●●○',   // 4 dots, fill ● vs ○ for difficulty
  blurb: 'One or two sentences, plain and concrete.',
  tags: ['Tech', 'Tech', 'Tech'],
  reward: '+X% impact metric'   // the headline win
}
```
The first card (Calendar Assistant) is **featured** and lives directly in the template (larger, LEGENDARY, with its own GitHub link). The rest render from the array into the 2-col grid. To feature a different project, move its markup into the featured block.

### 9.2 How to add a skill
Edit `skillGroups` (4 groups: `LANGUAGES / FRAMEWORKS / CLOUD & TOOLS / AI / ML`). Each has `{ name, color, items: [] }`. Add strings to `items` — the inventory grid handles the rest.

### 9.3 How to add a section
1. Add a `<div id="newsection" style="…container…; scroll-margin-top:84px">` following the section rhythm (§6).
2. Lead with a section tag pill (§5.6) + a Press Start 2P `<h2>`.
3. Add a `navItems` entry `{ label:'NAME', href:'#newsection' }` so the HUD links to it.
4. Give it a game name consistent with the metaphor.

---

## 10. Content & voice

- **Game-flavored, not cheesy.** "Quest log", "save point", "loadout", "origin story" — yes. Don't overload every sentence with puns.
- **Concrete > vague.** Every project shows a real metric ("+20% revenue", "$1B+ client", "60-person team"). Keep that bar; no filler stats.
- **Short blurbs.** 1–2 sentences per quest. Let the rarity/reward framing do the rest.
- **First person, confident, fast.** "I scope, build, and deploy production AI systems end-to-end."

---

## 11. Real contact links (wired in)

| Channel | URL |
|---|---|
| Email | `mailto:frankiesoltero@gmail.com` |
| LinkedIn | `https://www.linkedin.com/in/francisco-soltero-4b8014237/` |
| GitHub | `https://github.com/FrankieSoltero` |
| Calendar Assistant repo | `https://github.com/FrankieSoltero/calendar-assistant` |
| Résumé | `Francisco_Soltero_Resume.pdf` (in project root, `download` attribute) |

When adding repo links to other quests, follow the same pattern: `target="_blank" rel="noreferrer"`, CYAN text, hover → GOLD.

---

## 12. Accessibility & responsive

The build was desktop-first; the 2026-06-13 pass addressed most of this.

**Done (2026-06-13):**
- **Mobile breakpoints.** A `matchMedia('(max-width:760px)')` flag in `componentDidMount`
  + `renderVals()` returns per-breakpoint inline style values (`heroCols`, `questCols`,
  `skillCols`, `aboutCols`, `featuredCols`, `heroTitleSize`). The hero, quest grid,
  skills grid, about grid, and featured quest all collapse to one column ≤760px; the HUD
  wraps. Flash-free (first render reads the live value).
- **Focus states.** Every nav link, button, and contact link has a `style-focus` outline
  ring (CYAN links / GOLD primary actions) — `outline`, not `box-shadow`, so it doesn't
  fight the bevels.
- **Reduced motion.** `@media (prefers-reduced-motion: reduce)` in `<helmet>` disables all
  looping animations.
- **Contrast.** Meaningful STEEL `#566c86` captions bumped to MIST `#94b0c2`.
- **Keyboard nav.** Arrow keys jump between sections (`#top`→`#quests`→`#skills`→`#about`
  →`#contact`); current section derived from scroll position.
- **Aria.** Generated icons are `aria-hidden="true"` (always paired with text labels).

**Remaining:**
- **Alt text.** When sprite slots become real `<img>`, add `alt`.
- **Deploy-readiness (separate phase).** Add an `index.html` entry and vendor
  React/ReactDOM/Babel locally to drop the CDN dependency.

---

## 13. File structure

```
/
├── index.html      ← the site (edit quests/skills in its logic class)
├── Style Tile.dc.html     ← living design system / component reference
├── support.js             ← DC runtime — DO NOT EDIT
├── Francisco_Soltero_Resume.pdf
└── STYLE_GUIDE.md         ← this file
```

Open either `.dc.html` directly in a browser to preview. Keep `support.js` next to them.

---

## 14. Quick do / don't

**Do**
- Build edges with 4-direction `box-shadow`; keep corners notched.
- Pull every color from Sweetie-16; every accent from the semantic map.
- Repeat inline styles; keep CSS out of classes.
- Leave sprite slots for real art.
- Add projects by editing the `quests` array.

**Don't**
- Add `border-radius`, blur shadows, or decorative gradients.
- Use a 4th font, or Press Start 2P for body text.
- Put logic inside `{{ }}` holes.
- Hand-draw illustrative SVG sprites.
- Edit `support.js`.
