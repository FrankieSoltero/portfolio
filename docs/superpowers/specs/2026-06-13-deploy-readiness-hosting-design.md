# Deploy-Readiness + Hosting — Design Spec

**Date:** 2026-06-13
**Status:** Approved; executing

## Goal
Publish the static portfolio to the public internet on Vercel, from a public GitHub repo,
with no runtime dependency on the unpkg CDN. No Vite / no build step.

## Key finding
`support.js` only fetches **React + ReactDOM** at runtime (`loadReactUmd()`), and short-
circuits if `window.React`/`window.ReactDOM` already exist. **Babel is never loaded** for
this site — `ensureBabel()` is only called for `x-import`-ed `.jsx` files, which this site
doesn't use. So vendoring is just two files, and needs **no edit to `support.js`**.

## Decisions
- **Host:** Vercel, auto-deploy from a **public** GitHub repo `FrankieSoltero/portfolio`.
- **Dependencies:** vendor React + ReactDOM 18.3.1 UMD production into `vendor/`, preloaded
  via `<script>` tags **before** `support.js`. Removes the CDN dependency.
- **Domain:** free `.vercel.app` subdomain to start; custom domain is a later add-on.
- **Entry point:** rename `Portfolio.dc.html` → `index.html` (served at `/`, zero config).

## Work
1. Vendor `vendor/react.production.min.js` + `vendor/react-dom.production.min.js` (18.3.1).
2. Preload both before `support.js` in `index.html` (and `Style Tile.dc.html` for parity).
3. Rename `Portfolio.dc.html` → `index.html`; update references in `CLAUDE.md` +
   `STYLE_GUIDE.md` (historical spec/plan docs left as-is).
4. `.gitignore` (`uploads/`, `.thumbnail`, `.DS_Store`, `.vercel`) + `README.md`.
5. `git init`, commit, create public GitHub repo, push (via `gh`, authenticated as
   FrankieSoltero).
6. **Manual (user):** import the repo into Vercel (GitHub sign-in + Import), no build
   command, deploy. Then verify the live URL.

## Verification
- Local: load the site and confirm DevTools Network shows **no unpkg requests** and the
  page renders identically.
- Live: URL renders, résumé downloads, links and arrow-key nav work.

## Out of scope
Custom domain, analytics, CI checks beyond Vercel's default build.
