
# Portfolio Production-Ready + Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing 8-bit portfolio (`Portfolio.dc.html`) responsive, accessible, and keyboard-navigable without breaking its visual language or build-free design.

**Architecture:** All changes live in `Portfolio.dc.html` — its `<helmet>`, template, and logic class (`class Component extends DCLogic`). Responsiveness uses a `matchMedia` flag read in `renderVals()` that returns different *inline* style values per breakpoint (no flash, no CSS classes). Keyboard nav and the breakpoint listener are wired in `componentDidMount()` / torn down in `componentWillUnmount()`. Reduced-motion is one `@media` rule in `<helmet>`. **`support.js` is never edited.**

**Tech Stack:** HTML + plain JS Design Component runtime (React 18 under the hood, provided by `support.js`). No build, no test framework, no package manager.

**Verification model:** There is no test runner here. Each task ends with a **manual browser check** — open `Portfolio.dc.html` in a browser (the runtime bootstraps from CDN) and confirm the stated observable behavior. This replaces the usual "run the test" step. There is no git repo (deliberately deferred), so there are no commit steps; the artifact is the saved file.

---

## File map

| File | Change |
|---|---|
| `Portfolio.dc.html` | All implementation: `<helmet>` reduced-motion rule; template style-value holes, `style-focus` attrs, contrast bumps, `flex-wrap`; logic class `componentDidMount`/`componentWillUnmount`, `isMobile()`, responsive vars in `renderVals()`, `aria-hidden` in `buildIcon`. |
| `STYLE_GUIDE.md` | §12 updated to reflect what's now done. |
| `Docs/fixes-log.md` | New — corporate-standards fix log for this work. |

---

## Task 1: Logic class — breakpoint flag, lifecycle hooks, keyboard nav

**Files:**
- Modify: `Portfolio.dc.html` (logic class, after `buildIcon`, before `renderVals`, ~line 260)

- [ ] **Step 1: Add `isMobile`, `componentDidMount`, `componentWillUnmount` methods**

Insert these three methods into `class Component` immediately **before** `renderVals() {` (currently line 261):

```js
  isMobile() {
    return typeof window !== 'undefined'
      && window.matchMedia('(max-width:760px)').matches;
  }

  componentDidMount() {
    // Re-render when crossing the mobile breakpoint (flash-free: renderVals
    // already reads the live value, this just refreshes on later changes).
    this._mq = window.matchMedia('(max-width:760px)');
    this._onMq = () => this.forceUpdate();
    this._mq.addEventListener('change', this._onMq);

    // Real arrow-key navigation between sections (makes the footer claim true).
    this._sections = ['top', 'quests', 'skills', 'about', 'contact'];
    this._onKey = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      let dir = 0;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') dir = 1;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') dir = -1;
      else return;
      e.preventDefault();
      const ids = this._sections;
      const mid = window.scrollY + window.innerHeight / 2;
      let cur = 0;
      ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (el && el.offsetTop <= mid) cur = i;
      });
      const next = Math.max(0, Math.min(ids.length - 1, cur + dir));
      const el = document.getElementById(ids[next]);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    };
    document.addEventListener('keydown', this._onKey);
  }

  componentWillUnmount() {
    if (this._mq && this._onMq) this._mq.removeEventListener('change', this._onMq);
    if (this._onKey) document.removeEventListener('keydown', this._onKey);
  }

```

- [ ] **Step 2: Expose responsive style values from `renderVals()`**

Inside `renderVals()`, immediately after the line `const I = (r, m, s) => this.buildIcon(r, m, s);` (line 262), add:

```js
    const mobile = this.isMobile();
    const layout = {
      heroCols: mobile ? '1fr' : '340px 1fr',
      heroGap: mobile ? '32px' : '48px',
      heroTitleSize: mobile ? '30px' : '46px',
      featuredCols: mobile ? '1fr' : '280px 1fr',
      featuredSpriteMinH: mobile ? '150px' : 'auto',
      questCols: mobile ? '1fr' : '1fr 1fr',
      skillCols: mobile ? '1fr' : '1fr 1fr',
      aboutCols: mobile ? '1fr' : '1fr 320px'
    };
```

- [ ] **Step 3: Spread `layout` into the returned object**

Change the return block (lines 316–319) from:

```js
    return {
      ...icons, heroStats, quests, skillGroups, factoids, navItems,
      coins: 9, questCount: 6, clearedCount: 6
    };
```

to:

```js
    return {
      ...icons, ...layout, heroStats, quests, skillGroups, factoids, navItems,
      coins: 9, questCount: 6, clearedCount: 6
    };
```

- [ ] **Step 4: Verify (browser)**

Open `Portfolio.dc.html`. The page must render **exactly as before** (the holes aren't wired into the template yet, so layout is unchanged). Open DevTools console — confirm **no errors** (lifecycle methods registered cleanly). Press the arrow keys: the page should **smooth-scroll between the five sections** (top → quests → skills → about → contact and back). This proves Task 1 works before any template change.

---

## Task 2: Template — wire responsive holes + HUD wrap

**Files:**
- Modify: `Portfolio.dc.html` (template, lines ~33, 61, 80, 115, 116, 143, 175, 196)

- [ ] **Step 1: Hero grid columns + gap (line 61)**

Replace:

```
    <div style="max-width:1160px; margin:0 auto; display:grid; grid-template-columns:340px 1fr; gap:48px; align-items:center;">
```

with:

```
    <div style="max-width:1160px; margin:0 auto; display:grid; grid-template-columns:{{ heroCols }}; gap:{{ heroGap }}; align-items:center;">
```

- [ ] **Step 2: Hero title size (line 80)**

Replace `font-size:46px;` inside the `<h1 ...>` with `font-size:{{ heroTitleSize }};`. The full element becomes:

```
        <h1 style="font-family:'Press Start 2P', monospace; font-size:{{ heroTitleSize }}; line-height:1.32; margin:0 0 18px; color:#f4f4f4; text-shadow:5px 5px #b13e53;">FRANCISCO<br>SOLTERO</h1>
```

- [ ] **Step 3: Featured quest grid columns (line 115)**

Replace:

```
      <div style="display:grid; grid-template-columns:280px 1fr; gap:0;">
```

with:

```
      <div style="display:grid; grid-template-columns:{{ featuredCols }}; gap:0;">
```

- [ ] **Step 4: Featured sprite min-height (line 116)**

Replace:

```
        <div style="background:#0b1024; background-image:repeating-linear-gradient(45deg,#131a3a 0,#131a3a 8px,#0b1024 8px,#0b1024 16px); display:flex; align-items:center; justify-content:center; box-shadow:inset -4px 0 #000;">
```

with (adds `min-height` so the slot doesn't collapse when stacked on mobile):

```
        <div style="background:#0b1024; background-image:repeating-linear-gradient(45deg,#131a3a 0,#131a3a 8px,#0b1024 8px,#0b1024 16px); display:flex; align-items:center; justify-content:center; min-height:{{ featuredSpriteMinH }}; box-shadow:inset -4px 0 #000;">
```

- [ ] **Step 5: Quest grid columns (line 143)**

Replace (use the `<sc-for ... quests>` line as unique context):

```
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:22px;">
      <sc-for list="{{ quests }}" as="q" hint-placeholder-count="5">
```

with:

```
    <div style="display:grid; grid-template-columns:{{ questCols }}; gap:22px;">
      <sc-for list="{{ quests }}" as="q" hint-placeholder-count="5">
```

- [ ] **Step 6: Skills grid columns (line 175)**

Replace (use the `<sc-for ... skillGroups>` line as unique context — its style string is identical to the quest grid, so the next line disambiguates):

```
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:22px;">
      <sc-for list="{{ skillGroups }}" as="g" hint-placeholder-count="4">
```

with:

```
    <div style="display:grid; grid-template-columns:{{ skillCols }}; gap:22px;">
      <sc-for list="{{ skillGroups }}" as="g" hint-placeholder-count="4">
```

- [ ] **Step 7: About grid columns (line 196)**

Replace:

```
    <div style="display:grid; grid-template-columns:1fr 320px; gap:22px; align-items:start;">
```

with:

```
    <div style="display:grid; grid-template-columns:{{ aboutCols }}; gap:22px; align-items:start;">
```

- [ ] **Step 8: HUD wraps on narrow screens (line 33)**

Replace:

```
    <div style="max-width:1160px; margin:0 auto; padding:12px 22px; display:flex; align-items:center; gap:18px;">
```

with (adds `flex-wrap:wrap` — harmless on desktop where it fits on one line, lets nav reflow on mobile):

```
    <div style="max-width:1160px; margin:0 auto; padding:12px 22px; display:flex; align-items:center; flex-wrap:wrap; gap:18px;">
```

- [ ] **Step 9: Verify (browser)**

Open `Portfolio.dc.html` at a **wide** window: layout identical to original (two-col hero, 2-col quest/skills grids, side-by-side about, featured quest with left sprite). Then **narrow the window below 760px** (DevTools device toolbar or just drag): hero stacks to one column with a smaller title, featured quest stacks (sprite on top with visible height), quest grid and skills grid become single-column, about stacks, the HUD nav wraps instead of overflowing, and there is **no horizontal scrollbar**. Widen again — it snaps back. Confirm no console errors.

---

## Task 3: Focus states for keyboard users

**Files:**
- Modify: `Portfolio.dc.html` (interactive elements: lines ~34, 44, 51, 95, 136, 226, 227, 228, 229)

Add a `style-focus` attribute to each interactive element. Use `outline` (not `box-shadow`) so the ring never fights the existing bevel `box-shadow`. **CYAN** ring for links/secondary, **GOLD** ring for primary-action buttons.

- [ ] **Step 1: Logo link (line 34)** — add `style-focus="outline:3px solid #73eff7; outline-offset:3px;"`

Replace:

```
      <a href="#top" style="display:flex; align-items:center; gap:12px; text-decoration:none;">
```

with:

```
      <a href="#top" aria-label="Back to top" style="display:flex; align-items:center; gap:12px; text-decoration:none;" style-focus="outline:3px solid #73eff7; outline-offset:3px;">
```

- [ ] **Step 2: Nav links (line 44)** — append `style-focus`

Replace:

```
          <a href="{{ n.href }}" style="font-family:'Press Start 2P', monospace; font-size:10px; text-decoration:none; color:#94b0c2; padding:10px 12px;" style-hover="color:#ffcd75;">{{ n.label }}</a>
```

with:

```
          <a href="{{ n.href }}" style="font-family:'Press Start 2P', monospace; font-size:10px; text-decoration:none; color:#94b0c2; padding:10px 12px;" style-hover="color:#ffcd75;" style-focus="color:#ffcd75; outline:3px solid #73eff7; outline-offset:2px;">{{ n.label }}</a>
```

- [ ] **Step 3: Resume button (line 51)** — append GOLD `style-focus`

Append `style-focus="outline:3px solid #ffcd75; outline-offset:4px;"` to the `<a href="Francisco_Soltero_Resume.pdf" download ...>` element (the long HUD résumé button). Add it as the final attribute before the closing `>`.

- [ ] **Step 4: Hero CTA (line 95)** — append GOLD `style-focus`

Append `style-focus="outline:3px solid #ffcd75; outline-offset:4px;"` to the `<a href="#quests" ...>▶ VIEW QUEST LOG</a>` element (final attribute before `>`).

- [ ] **Step 5: Featured GitHub link (line 136)** — append CYAN `style-focus`

Replace:

```
            <a href="https://github.com/FrankieSoltero/calendar-assistant" target="_blank" rel="noreferrer" style="font-family:'Press Start 2P', monospace; font-size:10px; text-decoration:none; color:#73eff7; padding:10px 0;" style-hover="color:#ffcd75;">VIEW ON GITHUB →</a>
```

with:

```
            <a href="https://github.com/FrankieSoltero/calendar-assistant" target="_blank" rel="noreferrer" style="font-family:'Press Start 2P', monospace; font-size:10px; text-decoration:none; color:#73eff7; padding:10px 0;" style-hover="color:#ffcd75;" style-focus="color:#ffcd75; outline:3px solid #73eff7; outline-offset:3px;">VIEW ON GITHUB →</a>
```

- [ ] **Step 6: Contact buttons (lines 226–229)** — append `style-focus` to each

For the EMAIL (226) and SAVE FILE (229) buttons (primary actions) append `style-focus="outline:3px solid #ffcd75; outline-offset:4px;"`. For the LINKEDIN (227) and GITHUB (228) buttons (secondary) append `style-focus="outline:3px solid #73eff7; outline-offset:4px;"`. Add each as the final attribute before its closing `>`.

- [ ] **Step 7: Verify (browser)**

Open `Portfolio.dc.html`. Click in the address bar, then press **Tab** repeatedly. Every nav link, button, and contact link must show a **visible colored ring** (cyan on links, gold on primary buttons) as it receives focus. Mouse hover behavior is unchanged. No console errors.

---

## Task 4: Reduced motion + decorative-icon aria-hidden

**Files:**
- Modify: `Portfolio.dc.html` (`<helmet><style>` ~line 25; `buildIcon` svg props ~line 255)

- [ ] **Step 1: Add reduced-motion rule to `<helmet>`**

In the `<helmet><style>` block, immediately after the `@keyframes float-star ...` line (line 25) and before `</style>`, add:

```css
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
```

- [ ] **Step 2: Mark generated icons decorative in `buildIcon`**

Replace the svg-creating return in `buildIcon` (lines 255–258):

```js
    return React.createElement('svg', {
      viewBox: '0 0 ' + w + ' ' + h, width: w * scale, height: h * scale,
      style: { imageRendering: 'pixelated', shapeRendering: 'crispEdges', display: 'block' }
    }, rects);
```

with (adds `aria-hidden` — every icon is paired with a visible text label, so screen readers should skip the decorative SVG):

```js
    return React.createElement('svg', {
      viewBox: '0 0 ' + w + ' ' + h, width: w * scale, height: h * scale,
      'aria-hidden': 'true',
      style: { imageRendering: 'pixelated', shapeRendering: 'crispEdges', display: 'block' }
    }, rects);
```

- [ ] **Step 3: Verify (browser + OS setting)**

Enable "Reduce motion" in macOS (System Settings → Accessibility → Display → Reduce motion), reload `Portfolio.dc.html`: the floating sprite (`bob`), drifting stars (`float-star`), shimmering status dot, "PRESS START" blink, and stat-bar fill animation should **all be static**. Turn the setting off and reload — animations return. In DevTools, inspect any icon `<svg>` and confirm it has `aria-hidden="true"`.

---

## Task 5: Contrast bumps

**Files:**
- Modify: `Portfolio.dc.html` (lines ~88, 109, 154)

Bump borderline STEEL `#566c86` to MIST `#94b0c2` on captions that carry meaning. Leave STEEL on purely decorative flavor (footer line 237, hero "WIP" line 71, sprite-slot labels).

- [ ] **Step 1: Hero stat-bar note (line 88)**

In the stat-bar row, change the note span's `color:#566c86;` to `color:#94b0c2;`. The span becomes:

```
<span style="color:#566c86;">{{ s.note }}</span>
```
→
```
<span style="color:#94b0c2;">{{ s.note }}</span>
```

(There is one `{{ s.note }}` span — match on the full `<span style="color:#566c86;">{{ s.note }}</span>` for uniqueness.)

- [ ] **Step 2: Quest count caption (line 109)**

Replace:

```
      <span style="font-family:'VT323', monospace; font-size:18px; color:#566c86;">{{ questCount }} quests · {{ clearedCount }} cleared</span>
```

with:

```
      <span style="font-family:'VT323', monospace; font-size:18px; color:#94b0c2;">{{ questCount }} quests · {{ clearedCount }} cleared</span>
```

- [ ] **Step 3: Quest difficulty caption (line 154)**

Replace:

```
                <span style="font-family:'VT323', monospace; font-size:16px; color:#566c86;">{{ q.diff }}</span>
```

with:

```
                <span style="font-family:'VT323', monospace; font-size:16px; color:#94b0c2;">{{ q.diff }}</span>
```

- [ ] **Step 4: Verify (browser)**

Open `Portfolio.dc.html`. The hero stat-bar sub-labels ("TS · React · Node" etc.), the "6 quests · 6 cleared" line, and each quest's "DIFFICULTY ●●●○" string should read noticeably brighter (MIST) than before, while the footer and the "▲ self-portrait pixel sprite — WIP" line stay dim (STEEL). No layout change.

---

## Task 6: Docs, STYLE_GUIDE update, footer sanity

**Files:**
- Create: `Docs/fixes-log.md`
- Modify: `STYLE_GUIDE.md` (§12)
- Verify: `Portfolio.dc.html` footer (line 237)

- [ ] **Step 1: Create the corporate-standards fix log**

Create `Docs/fixes-log.md`:

```markdown
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
```

- [ ] **Step 2: Update STYLE_GUIDE.md §12**

Replace the §12 body (the "known TODOs" list under `## 12. Accessibility & responsive — known TODOs`, lines ~310–315) with a done/remaining split:

```markdown
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
```

- [ ] **Step 3: Confirm footer copy is accurate (line 237)**

The footer reads `... ◀ ▼ ▲ ▶ to navigate`. With Task 1 shipped this is now **true** (arrow keys navigate). No edit required — just confirm the text is present and unchanged.

- [ ] **Step 4: Verify**

Confirm `Docs/fixes-log.md` exists and `STYLE_GUIDE.md` §12 reflects the done/remaining split. Open `Portfolio.dc.html` and confirm the footer still shows the navigation hint.

---

## Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Desktop regression**

Open `Portfolio.dc.html` in a wide browser window. Compare against the original intent: HUD, two-column hero with stat bars, featured LEGENDARY quest, 2-col quest grid, 2-col skills inventory, side-by-side about, save-point contact, footer. Nothing should look broken or restyled. Console: no errors.

- [ ] **Step 2: Mobile (≤760px)**

Use DevTools device toolbar (e.g. iPhone SE / 375px). Confirm: everything stacks to single column, hero title shrinks, featured sprite slot keeps height, HUD nav wraps, **no horizontal scroll**, all text legible.

- [ ] **Step 3: Keyboard**

Tab through all interactive elements — visible focus rings everywhere. Arrow keys move between sections smoothly and clamp at the ends.

- [ ] **Step 4: Reduced motion**

With OS reduce-motion on, reload — all animations static. Off — animations return.

- [ ] **Step 5: Sign-off**

All four checks pass → update the checkboxes in this plan and note completion in `Docs/fixes-log.md`.
```
