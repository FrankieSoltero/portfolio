// scripts/build-drill-frame.mts — `npm run frame` (also runs as prebuild and predev)
// Writes the Drillbox sandbox frame page, the self-contained HTML document visitors'
// exercise code runs in, to public/drillbox/frame.html. next.config.ts serves it with the
// sandboxing Content-Security-Policy header (FRAME_CSP_HEADER in drills/frame.ts). The
// directory is git-ignored and rebuilt every time. Prints
// `drill frame: public/drillbox/frame.html (<n> bytes)` and exits 0, or
// `drill frame: FAILED — <message>` and exits 1.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFrame, jsAdapter } from 'drillbox/frame'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_RELATIVE = 'public/drillbox/frame.html'
const OUT_FILE = path.join(ROOT, ...OUT_RELATIVE.split('/'))

function main(): number {
  try {
    // The preview renders the entry file as a React component, so the frame needs the React pack.
    const html = buildFrame({ adapters: [jsAdapter({ react: true })] })
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
    fs.writeFileSync(OUT_FILE, html, 'utf-8')
    console.log(`drill frame: ${OUT_RELATIVE} (${Buffer.byteLength(html, 'utf-8')} bytes)`)
    return 0
  } catch (e) {
    console.log(`drill frame: FAILED — ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

process.exitCode = main()
