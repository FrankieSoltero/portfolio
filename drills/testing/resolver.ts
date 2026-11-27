// drills/testing/resolver.ts
// Points a drill's relative imports at the variant under test. A check file imports
// `./App` and `./api` as if it sat next to them; this resolver sends those imports to
// `<slug>/starter/` or `<slug>/solution/`. solution/ holds only the files that differ,
// so for the solution variant any file it lacks comes from starter/.

import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { DRILLS_DIR } from "../../lib/drills";

export type DrillVariant = "starter" | "solution";

const SECTIONS = new Set(["checks", "solution", "starter"]);
const EXTENSIONS = [".tsx", ".ts"];

/** Absolute path a relative import inside a drill resolves to, or null to defer. */
export function resolveDrillImport(args: {
  source: string; importer: string; variant: DrillVariant;
  drillsDir: string;
  exists: (absPath: string) => boolean;
}): string | null {
  const { source, variant, drillsDir, exists } = args;
  if (!source.startsWith("./")) return null;

  const importer = args.importer.split("?")[0];
  const fromDrills = path.relative(drillsDir, importer);
  if (fromDrills.startsWith("..") || path.isAbsolute(fromDrills)) return null;
  const [slug, section, ...rest] = fromDrills.split(path.sep);
  if (!slug || !SECTIONS.has(section) || rest.length === 0) return null;

  // Where the import points, relative to the importer's section folder.
  const sectionDir = path.join(drillsDir, slug, section);
  const target = path.relative(sectionDir, path.resolve(path.dirname(importer), source));
  if (target.startsWith("..") || path.isAbsolute(target)) return null;

  const lookIn = variant === "solution" ? ["solution", "starter"] : ["starter"];
  for (const folder of lookIn) {
    for (const ext of EXTENSIONS) {
      const candidate = path.join(drillsDir, slug, folder, target + ext);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/** Vite plugin that resolves drill imports for `variant` against content/drills. */
export function drillResolver(variant: DrillVariant): Plugin {
  return {
    name: "drills:resolver",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      return resolveDrillImport({
        source,
        importer,
        variant,
        drillsDir: DRILLS_DIR,
        exists: (absPath) => fs.existsSync(absPath) && fs.statSync(absPath).isFile(),
      });
    },
  };
}
