import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { drillResolver } from './drills/testing/resolver'

// Runs drill check files (content/drills/<slug>/checks/) against one variant of each
// drill. Used by scripts/drills-fairness.mts, which sets the environment:
//   DRILL_VARIANT        starter | solution (required)
//   DRILL_SLUG           one drill's slug (optional; default: every drill)
//   DRILL_UNHANDLED_LOG  file that receives the test-file path of each unhandled error
//                        in a solution run, one JSON string per line (optional)

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const variant = process.env.DRILL_VARIANT
if (variant !== 'starter' && variant !== 'solution') {
  throw new Error('DRILL_VARIANT must be starter or solution')
}
const slug = process.env.DRILL_SLUG
if (slug !== undefined && !SLUG_RE.test(slug)) throw new Error(`Unknown drill: ${slug}`)

/** Records which check file raised an unhandled error during a solution run. */
function recordUnhandledError(error: { VITEST_TEST_PATH?: string }): void {
  const log = process.env.DRILL_UNHANDLED_LOG
  if (log) appendFileSync(log, `${JSON.stringify(error.VITEST_TEST_PATH ?? null)}\n`)
}

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), drillResolver(variant)],
  resolve: {
    alias: { 'drillbox:test': join(root, 'drills', 'testing', 'drillbox-test.ts') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['drills/testing/setup.ts'],
    css: false,
    include: [`content/drills/${slug ?? '*'}/checks/**/*.test.tsx`],
    testTimeout: 3000,
    // A check file's cached transform keeps the variant its ./App import resolved to,
    // so a transform cached by one variant's run must never serve the other's.
    fsModuleCache: false,
    // A starter is buggy on purpose and may leave a rejected promise behind; a
    // solution may not.
    dangerouslyIgnoreUnhandledErrors: variant === 'starter',
    onUnhandledError: variant === 'solution' ? recordUnhandledError : undefined,
  },
})
