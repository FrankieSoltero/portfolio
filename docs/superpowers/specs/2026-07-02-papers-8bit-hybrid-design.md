# /papers hybrid 8-bit skin — design spec

**Date:** 2026-07-02 · **Approved by:** Frankie (picked "Option A" from the mockup
artifact) · **Supersedes:** the paper-white "technical publication" look from PLAN.md §4
(structure, components, and restraint rules from PLAN.md still apply).

## Concept

The portfolio reads as **one game**. `/papers` keeps its experiment-log structure and
long-form readability, but its chrome adopts the character sheet's art language:
Sweetie-16 palette on the dark ground, 4-direction `box-shadow` pixel frames, Press
Start 2P for headings/labels/badges, VT323 for metadata. Body prose, equations, and
code stay in readable faces — the reading surface is never pixelated.

## Token mapping (`app/papers/papers.css`)

| Old (paper) | New (Sweetie-16) | Role | Contrast on ground |
|---|---|---|---|
| `--paper #FCFCFA` | `--night #1a1c2c` | page ground | — |
| `--ink #1C1F26` | `--white #f4f4f4` | body text | 15.3:1 ✓ |
| `--ink-soft #565B66` | `--mist #94b0c2` | secondary/meta text | 7.4:1 ✓ |
| `--plot #2450D8` | `--cyan #73eff7` | links, focus, active | 12.3:1 ✓ |
| `--verified #0E7C4A` | `--slime #a7f070` | REPRODUCED badge (night text) | 12.3:1 ✓ |
| `--partial #B4690E` | `--gold #ffcd75` | PARTIAL badge (night text) | 11.4:1 ✓ |
| (new) | `--ember #ef7d57` | DIVERGED badge, callout accent | 6.2:1 ✓ |
| `--rule #E4E4DE` | `--dim #333c57` | hairlines, figure grid | decorative |
| `--code-bg #F6F6F1` | `--panel #0e1530` | cards, code blocks | — |

Badges flip from light-text-on-dark-fill to **night text on bright fill** (like the
site's coin counter) — higher contrast and more 8-bit.

## Type roles

- **Press Start 2P** — h1/h2/h3, nav brand, RUN CARD header, badges, callout label,
  tag chips. Small sizes (9–14px), generous line-height (1.8–2.0). Never body copy.
- **VT323** — meta lines (dates, tags, bylines, reading time), run-card values,
  footer. 18–20px (VT323 is small-rendering; size up).
- **IBM Plex Sans** — body prose (unchanged).
- **IBM Plex Mono** — code blocks (shiki output; readability beats VT323 for code).
- **IBM Plex Serif** — dropped entirely.

## Component treatments

- **Pixel frame recipe** (from STYLE_GUIDE): `box-shadow: 0 -4px #000, 0 4px #000,
  -4px 0 #000, 4px 0 #000` (+ inset bevels `#29366f` / `#070b18` on the Run Card).
  Slim 3px variant for badges/code. **No `border-radius`, no blur.**
- **Run Card** → stat sheet: `--panel` fill, bevel insets, gold PS2P header, VT323
  rows (steel labels / white values), pixel-framed badge.
- **Header/footer** → `--panel` bars with 4px black rule; brand `◀ FRANCISCO SOLTERO`
  in PS2P gold linking home.
- **Tag filter** → pixel chips: mist text + 3px frame; active chip gold fill, night text.
- **Index entries** → PS2P titles (11px), VT323 meta, hairline `--dim` separators.
- **Figure** → panel fill, `--dim` graph grid, VT323 caption.
- **Callout** → dark ember-tinted panel (`#221a24`), 3px frame + 4px inset ember left
  edge, PS2P `▲ DIVERGENCE` label.
- **Code** → shiki theme `tokyo-night` (dark), `keepBackground: false`, `--panel` fill,
  3px frame. Inline code: panel fill, cyan text.
- **Focus** → 3px solid `--cyan` outline, 2px offset (mirrors the 8-bit site's rings).
- **KaTeX** → inherits `--white`; display blocks get horizontal scroll as today.

## Out of scope / unchanged

Routes, content layer, RSS, sitemap, MDX pipeline, component APIs, the 8-bit site
itself. No animations added (restraint rule from PLAN.md stands). Reduced-motion query
stays.

## Risks

- Press Start 2P has no lowercase — headings render all-caps by nature. Accepted.
- Long PS2P titles wrap wide; mitigated with small sizes + `line-height: 2`.
- Dark-theme figures: future chart PNGs should be exported on dark or transparent
  backgrounds; noted in `_template.mdx`.
