// drills/testing/fixtures/loader/drillFixture.ts
// Builds throwaway drill trees for lib/drills.test.ts in a temporary directory.
// The trees are written at test time rather than committed because a committed
// `checks/*.test.tsx` under drills/ would be collected by the unit-test run.

import fs from "fs";
import os from "os";
import path from "path";

export const VALID_META = {
  title: "Fixture drill",
  order: 1,
  summary: "A drill used only by the loader tests.",
  skills: ["state"],
  difficulty: 1,
  minutes: 5,
  hints: ["Look at the click handler."],
};

const DEFAULT_FILES: Record<string, string> = {
  "brief.md": "# Brief\n",
  "explanation.md": "# Explanation\n",
  "starter/App.tsx": "export default function App() { return null; }\n",
  "starter/api.ts": "export const api = {};\n",
  "solution/App.tsx": "export default function App() { return <p>fixed</p>; }\n",
  "checks/App.test.tsx": "// check source\n",
};

export interface FixtureDrill {
  /** Fields merged over VALID_META; a field set to undefined is removed. */
  meta?: Record<string, unknown>;
  /** Extra or replacement files; a path set to null is left out. */
  files?: Record<string, string | null>;
}

/** A fresh, empty temporary drills directory. */
export function makeDrillsDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "drills-loader-"));
}

/** Writes one drill folder named `folder` into `root`. */
export function writeDrill(root: string, folder: string, drill: FixtureDrill = {}): string {
  const dir = path.join(root, folder);
  const meta: Record<string, unknown> = { ...VALID_META, ...drill.meta };
  for (const key of Object.keys(meta)) if (meta[key] === undefined) delete meta[key];

  const files: Record<string, string | null> = {
    "meta.json": JSON.stringify(meta, null, 2),
    ...DEFAULT_FILES,
    ...drill.files,
  };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}
