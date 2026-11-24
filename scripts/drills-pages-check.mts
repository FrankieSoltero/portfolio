// scripts/drills-pages-check.mts — `npm run test:drills-pages`
// Checks the HTML that `next build` wrote for the /drills section: the index page and
// one page per drill on disk, nothing more, plus the sandbox frame page the workspace
// loads (public/drillbox/frame.html, written by `npm run frame`). Reads files only. The
// expected strings are compared against the HTML after unescaping entities, so `<`, `>`
// and `&` match literally. Prints `drills pages: <n> OK` (n = drills + 1) and exits 0, or
// one `drills pages: FAILED <page> — <what is missing>` line per problem and exits 1.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAllDrills, type Drill } from '../lib/drills.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRILLS_DIR = path.join(ROOT, 'content', 'drills')
const APP_DIR = path.join(ROOT, '.next', 'server', 'app')
const INDEX_HTML = path.join(APP_DIR, 'drills.html')
const PAGES_DIR = path.join(APP_DIR, 'drills')
const FRAME_FILE = path.join(ROOT, 'public', 'drillbox', 'frame.html')

// Must match DRILLS_INTRO in drills/components/DrillList.tsx (a .tsx module node cannot load).
const INTRO =
  "Each drill is a pull request that runs but isn't ready to merge. Read the brief, find what's wrong, fix it."
// Must match the footer line in drills/components/DrillsShell.tsx.
const FOOTER = 'react review drills · find the bugs, fix the PR'
// Must match AUTO_DONE in app/drills/[slug]/page.tsx.
const AUTO_DONE = 'The drill is marked done on its own when every check passes.'
const TITLE_SUFFIX = ' · Drills · Francisco Soltero'
const PAGE_STRINGS = [
  'THE PULL REQUEST',
  'STARTER CODE',
  'REVEAL HINT 1 OF 3',
  'REVEAL THE FIX',
  'THE FIX',
  'ALL DRILLS',
  '◀ FRANCISCO SOLTERO',
  FOOTER,
  AUTO_DONE,
]

interface Failure {
  page: string
  what: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** HTML with character references decoded, so expected strings compare literally. */
function unescapeHtml(html: string): string {
  return html.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      return Number.isNaN(code) ? whole : String.fromCodePoint(code)
    }
    return ENTITIES[ref.toLowerCase()] ?? whole
  })
}

/** Text content of every `<tag ...>...</tag>` element in `html` (tags stripped). */
function elementTexts(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g')
  return [...html.matchAll(re)].map((m) => m[1].replace(/<[^>]*>/g, '').trim())
}

/**
 * `html` without its `<script …>…</script>` elements. The workspace's exercise (checks
 * included) travels to the browser inside the React Server Components payload, which
 * lives in script elements; only the visible markup must not show the checks.
 */
function withoutScripts(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
}

/** The `it("…")` names in a check file's source. */
function checkNames(source: string): string[] {
  return [...source.matchAll(/\bit\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2])
}

function checkIndex(html: string, drills: Drill[]): string[] {
  const missing: string[] = []
  if (!html.includes('REACT REVIEW DRILLS')) missing.push('heading REACT REVIEW DRILLS')
  for (const d of drills) {
    if (!html.includes(d.meta.title)) missing.push(`title ${d.meta.title}`)
    if (!html.includes(`href="/drills/${d.meta.slug}"`)) missing.push(`link href="/drills/${d.meta.slug}"`)
  }
  if (!html.includes(`<meta name="description" content="${INTRO}"`)) {
    missing.push('meta description with the intro sentence')
  }
  return missing
}

function checkDrillPage(html: string, drill: Drill, drills: Drill[], index: number): string[] {
  const { meta } = drill
  const missing: string[] = []
  const has = (s: string) => html.includes(s)

  if (!elementTexts(html, 'h1').includes(meta.title)) missing.push(`title ${meta.title} in an <h1>`)
  const metaLine = `DRILL ${meta.order} · ${meta.minutes} MIN · ${meta.skills.join(', ')}`
  if (!has(metaLine)) missing.push(`meta line ${metaLine}`)
  for (const s of PAGE_STRINGS) if (!has(s)) missing.push(s)

  const labels = elementTexts(html, 'figcaption')
  for (const f of drill.files) {
    if (!labels.some((l) => l === f.path || l === `${f.path}READ-ONLY`)) missing.push(`file label ${f.path}`)
  }
  const hasReadOnly = drill.files.some((f) => f.readOnly)
  if (hasReadOnly && !has('READ-ONLY')) missing.push('READ-ONLY label')
  if (!hasReadOnly && has('READ-ONLY')) missing.push('no READ-ONLY label (drill has no read-only file)')

  // Neighbour links: exactly the drill before and after this one in order.
  drills.forEach((other, j) => {
    if (j === index) return
    const prevLink = `◀ ${other.meta.title}`
    const nextLink = `${other.meta.title} ▶`
    if (j === index - 1 && !has(prevLink)) missing.push(`previous link ${prevLink}`)
    if (j !== index - 1 && has(prevLink)) missing.push(`no link ${prevLink} (not the previous drill)`)
    if (j === index + 1 && !has(nextLink)) missing.push(`next link ${nextLink}`)
    if (j !== index + 1 && has(nextLink)) missing.push(`no link ${nextLink} (not the next drill)`)
  })

  const visible = withoutScripts(html)
  for (const [file, source] of Object.entries(drill.checks)) {
    if (visible.includes(file)) missing.push(`no check file name ${file}`)
    for (const name of checkNames(source)) {
      if (visible.includes(name)) missing.push(`no check name "${name}"`)
    }
  }
  if (/mark as done/i.test(html)) missing.push('no "mark as done" control')

  const title = `<title>${meta.title}${TITLE_SUFFIX}</title>`
  if (!has(title)) missing.push(title)
  return missing
}

function main(): number {
  if (!fs.existsSync(INDEX_HTML)) {
    console.log('drills pages: run npm run build first')
    return 1
  }

  let drills: Drill[]
  try {
    drills = getAllDrills(DRILLS_DIR)
  } catch (e) {
    console.log(`drills pages: FAILED content/drills — ${(e as Error).message}`)
    return 1
  }

  const failures: Failure[] = []
  const read = (file: string) => unescapeHtml(fs.readFileSync(file, 'utf-8'))

  if (!fs.existsSync(FRAME_FILE) || fs.statSync(FRAME_FILE).size === 0) {
    failures.push({ page: '/drillbox/frame.html', what: 'frame page missing; run npm run frame' })
  }

  for (const what of checkIndex(read(INDEX_HTML), drills)) failures.push({ page: '/drills', what })

  drills.forEach((drill, i) => {
    const page = `/drills/${drill.meta.slug}`
    const file = path.join(PAGES_DIR, `${drill.meta.slug}.html`)
    if (!fs.existsSync(file)) {
      failures.push({ page, what: `page file ${path.relative(ROOT, file)}` })
      return
    }
    for (const what of checkDrillPage(read(file), drill, drills, i)) failures.push({ page, what })
  })

  const slugs = new Set(drills.map((d) => d.meta.slug))
  const built = fs.existsSync(PAGES_DIR)
    ? fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -'.html'.length))
    : []
  for (const name of built) {
    if (!slugs.has(name)) failures.push({ page: `/drills/${name}`, what: 'nothing (page is not a drill on disk)' })
  }

  if (failures.length > 0) {
    for (const f of failures) console.log(`drills pages: FAILED ${f.page} — ${f.what}`)
    return 1
  }
  console.log(`drills pages: ${drills.length + 1} OK`)
  return 0
}

process.exitCode = main()
