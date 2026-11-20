// lib/drills.ts
// Content layer for the /drills section. Reads drill folders from content/drills,
// validates meta.json and the required files, and exposes typed helpers for the
// routes plus the mapping to the Drillbox exercise format.
//
// Drill folder layout:
//   <slug>/meta.json         every DrillMeta field except slug (strict)
//   <slug>/brief.md          raw markdown
//   <slug>/explanation.md    raw markdown
//   <slug>/starter/App.tsx   plus any supporting files (api.ts is read-only)
//   <slug>/solution/App.tsx  only the files that differ from starter/
//   <slug>/checks/*.test.tsx at least one check file

import fs from "fs";
import path from "path";
import { z } from "zod";

export interface DrillMeta {
  slug: string;            // folder name
  title: string;
  order: number;           // integer >= 1, unique across drills
  summary: string;
  skills: string[];        // at least 1
  difficulty: 1 | 2 | 3;
  minutes: number;         // integer 1..60
  hints: string[];         // 1..5
}
export interface DrillFile { path: string; code: string; readOnly: boolean }
export interface Drill {
  meta: DrillMeta;
  brief: string;                 // raw markdown
  explanation: string;           // raw markdown
  files: DrillFile[];            // starter/, sorted: App.tsx first, then by path
  solutionFiles: DrillFile[];    // solution/ only (files that differ from starter)
  checks: Record<string, string>; // checks/ path -> source
}
export interface Exercise {       // Drillbox exercise format, runner spec "Exercise format"
  id: string;
  language: "js";
  files: Record<string, { code: string; readOnly?: boolean }>;
  entry: "App.tsx";
  checks: Record<string, string>;
  options: { react: true };
}

export const DRILLS_DIR: string = path.join(process.cwd(), "content", "drills");

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENTRY = "App.tsx";
/** Starter files the learner sees but may not edit. */
const READ_ONLY_FILES = new Set(["api.ts"]);
const REQUIRED_FILES = ["meta.json", "brief.md", "explanation.md", "starter/App.tsx", "solution/App.tsx"];
const CHECKS_GLOB = "checks/*.test.tsx";

const drillMetaSchema = z.strictObject({
  title: z.string().min(1),
  order: z.number().int().min(1),
  summary: z.string().min(1),
  skills: z.array(z.string().min(1)).min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  minutes: z.number().int().min(1).max(60),
  hints: z.array(z.string().min(1)).min(1).max(5),
});

/** All drills in `dir`, sorted by meta.order. Throws on any invalid drill. */
export function getAllDrills(dir: string = DRILLS_DIR): Drill[] {
  if (!fs.existsSync(dir)) return [];

  const folders = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort(byPath);

  const drills = folders.map((name) => {
    if (!SLUG_RE.test(name)) throw new Error(`Invalid drill folder name: ${name}`);
    return parseDrill(dir, name);
  });

  const seen = new Map<number, string>();
  for (const d of drills) {
    const other = seen.get(d.meta.order);
    if (other !== undefined) {
      throw new Error(`Duplicate drill order ${d.meta.order}: ${other}, ${d.meta.slug}`);
    }
    seen.set(d.meta.order, d.meta.slug);
  }

  return drills.sort((a, b) => a.meta.order - b.meta.order);
}

export function getDrillBySlug(slug: string, dir: string = DRILLS_DIR): Drill | null {
  // Slugs come from the URL: validate before touching the filesystem.
  if (!SLUG_RE.test(slug)) return null;
  const folder = path.join(dir, slug);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return null;
  return parseDrill(dir, slug);
}

/** Drills either side of `slug` in order: prev has the lower order, next the higher. */
export function getAdjacentDrills(
  slug: string,
  dir: string = DRILLS_DIR
): { prev: DrillMeta | null; next: DrillMeta | null } {
  const all = getAllDrills(dir);
  const i = all.findIndex((d) => d.meta.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? all[i - 1].meta : null,
    next: i < all.length - 1 ? all[i + 1].meta : null,
  };
}

export function toExercise(drill: Drill): Exercise {
  const files: Exercise["files"] = {};
  for (const f of drill.files) {
    files[f.path] = f.readOnly ? { code: f.code, readOnly: true } : { code: f.code };
  }
  return {
    id: drill.meta.slug,
    language: "js",
    files,
    entry: ENTRY,
    checks: { ...drill.checks },
    options: { react: true },
  };
}

function parseDrill(dir: string, slug: string): Drill {
  const root = path.join(dir, slug);
  const issues: string[] = [];

  for (const rel of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(root, rel))) issues.push(`  - ${rel}: missing file`);
  }
  const checkPaths = listFiles(path.join(root, "checks")).filter((p) => p.endsWith(".test.tsx"));
  if (checkPaths.length === 0) issues.push(`  - ${CHECKS_GLOB}: missing file`);

  let meta: z.infer<typeof drillMetaSchema> | null = null;
  const metaFile = path.join(root, "meta.json");
  if (fs.existsSync(metaFile)) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
    } catch (e) {
      issues.push(`  - meta.json: ${(e as Error).message}`);
    }
    if (raw !== undefined) {
      const parsed = drillMetaSchema.safeParse(raw);
      if (parsed.success) meta = parsed.data;
      else {
        for (const i of parsed.error.issues) {
          issues.push(`  - ${i.path.join(".") || "(root)"}: ${i.message}`);
        }
      }
    }
  }

  if (issues.length > 0 || meta === null) {
    throw new Error(`Invalid drill ${slug}:\n${issues.join("\n")}`);
  }

  const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf-8");
  const readFiles = (sub: string): DrillFile[] =>
    listFiles(path.join(root, sub))
      .sort((a, b) => (a === ENTRY ? -1 : b === ENTRY ? 1 : byPath(a, b)))
      .map((p) => ({ path: p, code: read(`${sub}/${p}`), readOnly: READ_ONLY_FILES.has(p) }));

  const checks: Record<string, string> = {};
  for (const p of checkPaths) checks[p] = read(`checks/${p}`);

  return {
    meta: { slug, ...meta },
    brief: read("brief.md"),
    explanation: read("explanation.md"),
    files: readFiles("starter"),
    solutionFiles: readFiles("solution"),
    checks,
  };
}

/**
 * Files under `dir` as sorted forward-slash relative paths; [] if `dir` is missing.
 * Entries whose name starts with "." (.DS_Store and the like) are skipped.
 */
function listFiles(dir: string, prefix = ""): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out.sort(byPath);
}

function byPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
