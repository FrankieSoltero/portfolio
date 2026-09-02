# Papers Section — Build Plan

> Hand this file to Claude Code along with the scaffold files in this folder.
> Goal: a `/papers` section on my existing Next.js personal site where I break down
> AI research papers in my own words and publish small-scale reproductions of their
> core experiments.

## 1. Context

- **Site stack:** Next.js (App Router), TypeScript, Tailwind, deployed on Vercel.
- **Author:** Frankie — software engineer, applied AI (TypeScript/React/Next.js, Python, Claude API).
- **Audience:** hiring managers and engineers. Each post must prove two things:
  I can read research, and I can ship code.
- **Content unit:** one MDX file per paper. Each post has three parts:
  1. **Breakdown** — the paper's idea in plain English.
  2. **Reproduction** — a scaled-down experiment (tiny model / small dataset / single GPU)
     with results, charts, and what matched or diverged from the paper's claims.
  3. **Repo link** — one GitHub repo per paper.

## 2. Architecture (already scaffolded — extend, don't replace)

- **Content:** `content/papers/*.mdx` with YAML frontmatter (schema in `lib/papers.ts`).
  No CMS, no database. Publishing = git push.
- **Parsing:** `gray-matter` for frontmatter + `next-mdx-remote` (RSC) for rendering.
- **Math:** `remark-math` + `rehype-katex` (papers need LaTeX).
- **Code blocks:** `rehype-pretty-code` (shiki) with line highlighting.
- **Routes:**
  - `app/papers/page.tsx` — index: list of all entries, newest first, filterable by tag.
  - `app/papers/[slug]/page.tsx` — the post. Uses `generateStaticParams` for SSG.
- **Install:**
  ```bash
  npm i next-mdx-remote gray-matter remark-math rehype-katex rehype-pretty-code shiki reading-time
  ```
- Scaffold files provided: `lib/papers.ts`, route stubs, MDX template, one example entry,
  component stubs in `components/papers/`.

## 3. Frontmatter schema (source of truth: `lib/papers.ts`)

```yaml
title: "Grokking: Generalization Beyond Overfitting"
slug: "grokking"
date: "2026-07-10"
status: "published"          # draft | published
arxiv: "https://arxiv.org/abs/2201.02177"
authors: "Power et al., 2022"
tags: ["training-dynamics", "small-models"]
repo: "https://github.com/frankie/repro-grokking"
summary: "One-sentence hook shown on the index page."
repro:                        # powers the Run Card (see design signature)
  model: "1-layer transformer, 400K params"
  dataset: "modular addition, p=113"
  hardware: "1× RTX 3060, ~3 hrs"
  claim: "Val accuracy jumps to ~100% long after train accuracy saturates"
  result: "reproduced"        # reproduced | partial | diverged
  delta: "Grokking appeared at ~8K steps vs paper's ~10K; same qualitative curve"
```

## 4. Design direction

> **Superseded 2026-07-02:** Frankie chose a hybrid 8-bit skin instead —
> see `docs/superpowers/specs/2026-07-02-papers-8bit-hybrid-design.md`. The component
> list, Run Card concept, and restraint rules below still apply; the palette/type
> tokens do not.

Do **not** use the generic AI-site looks (cream background + serif + terracotta accent;
near-black + acid green; broadsheet hairlines). This section should read as a
**technical publication / experiment log** — think research-lab documentation, not a blog.

**Tokens (implement as CSS variables, integrate with the site's existing Tailwind config):**

- `--paper: #FCFCFA` (background), `--ink: #1C1F26` (text)
- `--plot: #2450D8` (accent — links, active states, chart line color)
- `--verified: #0E7C4A` (result: reproduced), `--partial: #B4690E` (partial/diverged),
  `--rule: #E4E4DE` (borders)

**Type:** unified IBM Plex system — `IBM Plex Serif` (500) for display/headings,
`IBM Plex Sans` for body, `IBM Plex Mono` for metadata, labels, and code. Load via
`next/font/google`. Tight, disciplined scale; the mono metadata treatment carries
the personality.

**Signature element — the Run Card:** every post opens with a bordered card set
entirely in Plex Mono, rendered from the `repro` frontmatter block, styled like an
experiment run sheet: model / dataset / hardware / paper's claim / my result / delta.
The `result` field renders as a colored badge (verified green, partial amber).
A compact version of the Run Card badge appears on each index-page entry, so the
index reads as a log of experiments, not a list of blog posts. This is the one
memorable element — keep everything else quiet.

**Restraint:** no scroll animations, no gradients, no decorative numbering. Figure
images sit on a faint graph-grid background (subtle CSS background, `--rule` color).
Responsive to mobile, visible keyboard focus, respects `prefers-reduced-motion`.

## 5. Components to build (stubs provided in `components/papers/`)

1. `RunCard` — the signature element described above. Props typed from `ReproMeta`.
2. `PaperIndexEntry` — index row: title, date, tags, summary, mini result badge.
3. `TagFilter` — client component; filters index entries by tag (URL search param).
4. `Figure` — image/chart wrapper with mono caption and graph-grid background.
5. `Callout` — for "where my repro diverged" notes; uses `--partial` amber accent.
6. MDX component map wiring these into `next-mdx-remote`.

## 6. Tasks for Claude Code (in order)

1. Copy scaffold into the site repo; install deps; wire fonts and CSS variables.
2. Implement `lib/papers.ts` helpers fully (it's ~80% done — see TODOs inline).
3. Build the two routes with SSG + `generateMetadata` (OpenGraph per post,
   OG image can be a later pass).
4. Build components per §5 and the design tokens per §4.
5. Render the included example entry (`content/papers/grokking.mdx`) end to end:
   index → post → Run Card → math → code block all working.
6. Add `/papers` to the site nav and sitemap; add an RSS feed at `/papers/feed.xml`
   (use the `feed` package or hand-roll — small).
7. Verify: `npm run build` passes; check mobile layout; Lighthouse a11y ≥ 95.

## 7. Out of scope (for now)

Comments, search, newsletter signup, view counts, OG image generation. Ship the
reading experience first.
