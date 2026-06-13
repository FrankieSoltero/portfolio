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
