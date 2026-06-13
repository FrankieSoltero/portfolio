# Portfolio — Production-Ready + Polish · Design Spec

**Date:** 2026-06-13
**Author:** Francisco Soltero (w/ Claude Code)
**Status:** Awaiting user review

---

## 1. Goal

Take the existing 8-bit portfolio (`Portfolio.dc.html`) from a polished desktop-only
build to a **production-ready, accessible, responsive** site, and clean up small
consistency/honesty issues. Deployment tooling is explicitly a *later, separate phase*.

## 2. Scope

### In scope
1. **Mobile responsiveness (≤760px)** — collapse the desktop-only layouts.
2. **Keyboard navigation (made real)** — arrow keys jump between sections, so the
   footer's "◀ ▼ ▲ ▶ to navigate" claim becomes true.
3. **Focus states** — visible, on-brand focus rings for keyboard users.
4. **Reduced motion** — respect `prefers-reduced-motion`.
5. **Contrast** — bump borderline STEEL captions to MIST where legibility matters.
6. **Aria / alt** — label icon-only links; hide decorative icons from AT.
7. **Polish pass** — scan for small visual/data/consistency issues and fix the clear ones.
8. **Docs** — create `Docs/` per corporate standards and log fixes there.

### Out of scope (deferred to follow-up phases / not requested)
- **Deploy-readiness** (separate phase, own spec): add an `index.html` entry so the site
  serves at `/`, and vendor React 18 / ReactDOM / Babel-standalone locally to remove the
  unpkg CDN dependency. *No Vite* — the DC architecture is intentionally build-free.
- Git setup / live deployment.
- Real pixel-sprite art (sprite slots stay as honest placeholders by design).
- New sections or projects.

## 3. Architecture / approach

All work stays inside `Portfolio.dc.html` — template + logic class only. **No edits to
`support.js`, no CSS classes, no new fonts or colors.** Two new mechanisms in the
logic class (`class Component extends DCLogic`):

- **`componentDidMount()` / `componentWillUnmount()`** — register and tear down a
  `matchMedia` listener (responsive + reduced-motion) and a `keydown` listener (nav).
  The runtime supports these lifecycle hooks plus `setState`/`this.state`/`forceUpdate`
  (verified in `support.js` lines 650–820).
- **Responsive state in `renderVals()`** — `renderVals()` returns *different inline
  style values* for the layout wrappers depending on breakpoint state. The initial
  value is read **synchronously** from `matchMedia` at first render (window exists),
  so there is **no layout flash**; the listener only triggers a re-render on later
  viewport changes.

This preserves the "inline styles only" rule: responsive values are still literal
inline styles — they're just *selected* in JS rather than hardcoded.

## 4. Detailed work

### 4.1 Responsiveness (≤760px breakpoint)
Branch these wrapper styles in `renderVals()` via an `isMobile` flag:

| Wrapper | Desktop | ≤760px |
|---|---|---|
| Hero grid | `grid-template-columns:340px 1fr` | `1fr` (stack) |
| Featured quest grid | `grid-template-columns:280px 1fr` | `1fr` (stack) |
| Quest grid | `grid-template-columns:1fr 1fr` | `1fr` |
| Skills grid | `grid-template-columns:1fr 1fr` | `1fr` |
| About grid | `grid-template-columns:1fr 320px` | `1fr` |
| Hero `<h1>` | `font-size:46px` | `~30px` |
| HUD nav | inline row | wrap / condense; ensure tap targets ≥ ~40px |

Sprite slot fixed widths (240/280/108px) become fluid or `max-width:100%` on mobile.

### 4.2 Keyboard navigation (real)
- A `keydown` listener on `document` (added in `componentDidMount`).
- Section order: `#top → #quests → #skills → #about → #contact`.
- `ArrowDown` / `ArrowRight` → next section; `ArrowUp` / `ArrowLeft` → previous.
  `scrollIntoView({behavior:'smooth'})`.
- Track the current index in `this.state`; clamp at ends.
- Ignore the handler when focus is in an input/textarea (none today, but future-proof).
- Removed in `componentWillUnmount`.

### 4.3 Focus states
- Add `style-focus="..."` (runtime supports per-line pseudo styles — `support.js:642`)
  to every nav link, button, and contact link.
- Reuse the existing hover bevel / an `inset 0 0 0 3px <accent>` ring so focus is
  visibly on-brand. CYAN ring for links, GOLD for primary actions.

### 4.4 Reduced motion
- One rule in `<helmet><style>`:
  `@media (prefers-reduced-motion: reduce){ *{ animation:none !important } }`.
- This is the single sanctioned use of `!important`; it touches no layout and is the
  standard, well-understood pattern. Disables `bob`, `float-star`, `shimmer`, `blink`,
  `fillbar` for users who ask for it.

### 4.5 Contrast
- Replace STEEL `#566c86` with MIST `#94b0c2` on captions that carry meaning
  (e.g. quest meta rows, stat-bar notes). Keep STEEL only for purely decorative flavor
  text (footer, "WIP" labels) where it reads as intentional dimming.

### 4.6 Aria / alt
- Icon-only links (e.g. the gem logo link) get `aria-label`.
- Decorative generated icons get `aria-hidden="true"` (they're `<svg>` from `buildIcon`).
- Sprite-slot placeholders already carry descriptive text; leave as-is until real art.

### 4.7 Polish pass
- Footer copy: now accurate once arrow-nav ships.
- Audit `coins` / `questCount` / `clearedCount` and per-quest `status`/`statusColor`
  for internal consistency; fix clear mismatches, list anything subjective for the user.
- Scan for stray spacing / alignment / duplicated-value issues; fix the obvious.

## 5. Testing / verification

No test framework (static DC). Verification is manual via the `run`/`verify` flow:
1. Open `Portfolio.dc.html` — desktop layout **unchanged** from current.
2. Narrow viewport ≤760px — every grid stacks, hero title shrinks, nav stays usable,
   no horizontal scroll.
3. Arrow keys move between sections in order; clamps at top/bottom.
4. `Tab` through interactive elements — visible focus ring on each.
5. OS "reduce motion" on — animations stop.
6. Quick check with a screen-reader / a11y devtools that icon links are labeled.

## 6. Risks / notes
- **Flash of wrong layout:** mitigated by synchronous `matchMedia` read at first render.
- **`!important` (reduced motion only):** contained, layout-free, standard pattern.
- **CDN dependency remains** this phase (React/Babel from unpkg) — addressed in the
  deferred deploy-readiness phase, not here.

## 7. Definition of done
- All §4 items implemented in `Portfolio.dc.html` with no `support.js` edits and no CSS
  classes introduced.
- Manual verification (§5) passes on desktop + a ≤760px viewport.
- `Docs/` exists with a fix log entry for this work.
- `STYLE_GUIDE.md` §12 TODO list updated to reflect what's now done.
