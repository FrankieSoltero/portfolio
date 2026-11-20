// scripts/drills-fairness.mts — `npm run test:drills`
// The fairness gate: every drill's checks must load against both starter/ and
// solution/, fail at least once on the starter, and all pass on the solution. Runs
// vitest.drills.config.mts once per variant with the JSON reporter, prints one line per
// drill, and exits 1 if any drill is unfair. DRILL_SLUG=<slug> limits the run to one drill.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAllDrills, type Drill } from '../lib/drills.ts'
import { lintCheckFile } from '../drills/testing/check-lint.ts'
import {
  evaluateFairness,
  checkFileSlug,
  parseVitestReport,
  withExtraReasons,
  type VariantRun,
} from '../drills/testing/fairness.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DRILLS_DIR = path.join(ROOT, 'content', 'drills')
const CONFIG = path.join(ROOT, 'vitest.drills.config.mts')
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')
const VARIANTS = ['starter', 'solution'] as const

type Variant = (typeof VARIANTS)[number]

interface VariantResult {
  runs: VariantRun[]
  /** Check files that raised an unhandled error; null when vitest could not say which. */
  unhandled: (string | null)[]
}

function main(): number {
  let drills: Drill[]
  try {
    drills = getAllDrills(DRILLS_DIR)
  } catch (e) {
    console.error(`fairness: ${(e as Error).message}`)
    return 1
  }

  // Only a slug that names an existing drill reaches the child processes.
  const requested = process.env.DRILL_SLUG
  if (requested !== undefined && !drills.some((d) => d.meta.slug === requested)) {
    console.error(`Unknown drill: ${requested}`)
    return 1
  }
  if (drills.length === 0) {
    console.log('fairness: no drills yet')
    return 0
  }

  const selected = drills.filter((d) => requested === undefined || d.meta.slug === requested)
  const slugs = selected.map((d) => d.meta.slug)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drills-fairness-'))
  try {
    const results = {} as Record<Variant, VariantResult>
    for (const variant of VARIANTS) {
      const result = runVariant(variant, requested, tmp)
      if (result === null) return 1
      results[variant] = result
    }

    const unhandled = new Set<string>()
    for (const file of results.solution.unhandled) {
      const slug = file === null ? null : checkFileSlug(file, DRILLS_DIR)
      // An error vitest could not tie to a drill counts against every drill in the run.
      for (const s of slug === null ? slugs : [slug]) unhandled.add(s)
    }

    const verdicts = evaluateFairness(results.starter.runs, results.solution.runs, slugs).map((v) => {
      const drill = selected.find((d) => d.meta.slug === v.slug)
      const lintProblems = Object.values(drill?.checks ?? {}).flatMap((source) => lintCheckFile(source))
      const extra = unhandled.has(v.slug) ? ['solution raised an unhandled error'] : []
      return withExtraReasons(v, [...lintProblems, ...extra])
    })

    for (const v of verdicts) console.log(v.line)
    return verdicts.every((v) => v.ok) ? 0 : 1
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Runs every selected drill's checks against one variant; null if vitest gave no report. */
function runVariant(variant: Variant, slug: string | undefined, tmp: string): VariantResult | null {
  const reportFile = path.join(tmp, `${variant}.json`)
  const unhandledLog = path.join(tmp, `${variant}-unhandled.log`)

  const env: NodeJS.ProcessEnv = { ...process.env, DRILL_VARIANT: variant, DRILL_UNHANDLED_LOG: unhandledLog }
  delete env.DRILL_SLUG
  if (slug !== undefined) env.DRILL_SLUG = slug

  // An argument array and no shell: nothing in the environment is ever parsed as a command.
  const child = spawnSync(
    process.execPath,
    [VITEST, 'run', '--config', CONFIG, '--reporter=json', `--outputFile=${reportFile}`],
    { cwd: ROOT, env, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
  )
  // A non-zero exit only means some checks failed; the parsed report decides the verdict.

  let report: unknown
  try {
    report = JSON.parse(fs.readFileSync(reportFile, 'utf-8'))
  } catch {
    console.error(`fairness: vitest produced no report for the ${variant} run`)
    if (child.error) console.error(child.error.message)
    if (child.stderr) console.error(child.stderr)
    return null
  }

  const unhandled = fs.existsSync(unhandledLog)
    ? fs.readFileSync(unhandledLog, 'utf-8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as string | null)
    : []
  return { runs: parseVitestReport(report, DRILLS_DIR), unhandled }
}

process.exitCode = main()
