// lib/papers.ts
// Content layer for the /papers section. Reads MDX files from content/papers,
// parses frontmatter, and exposes typed helpers for the routes.

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";
import { z } from "zod";

const PAPERS_DIR = path.join(process.cwd(), "content", "papers");

export type ReproResult = "reproduced" | "partial" | "diverged";

const reproSchema = z.object({
  model: z.string().min(1),    // e.g. "1-layer transformer, 400K params"
  dataset: z.string().min(1),  // e.g. "modular addition, p=113"
  hardware: z.string().min(1), // e.g. "1x RTX 3060, ~3 hrs"
  claim: z.string().min(1),    // the paper's core claim being tested
  result: z.enum(["reproduced", "partial", "diverged"]),
  delta: z.string().min(1),    // how the reproduction compared to the paper
});

const paperMetaSchema = z.object({
  title: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case")
    .optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  status: z.enum(["draft", "published"]),
  arxiv: z.string().url(),
  authors: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  repo: z.string().url(),
  summary: z.string().min(1),
  repro: reproSchema,
});

export type ReproMeta = z.infer<typeof reproSchema>;

export interface PaperMeta extends z.infer<typeof paperMetaSchema> {
  slug: string;
  readingTime: string; // e.g. "6 min read"
}

export interface Paper {
  meta: PaperMeta;
  content: string; // raw MDX body, passed to next-mdx-remote
}

/** All published papers, newest first. Set includeDrafts for local preview. */
export function getAllPapers(includeDrafts = false): Paper[] {
  if (!fs.existsSync(PAPERS_DIR)) return [];
  return fs
    .readdirSync(PAPERS_DIR)
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"))
    .map((f) => parsePaperFile(path.join(PAPERS_DIR, f)))
    .filter((p) => includeDrafts || p.meta.status === "published")
    .sort((a, b) => b.meta.date.localeCompare(a.meta.date));
}

export function getPaperBySlug(slug: string): Paper | null {
  // Slugs come from the URL: validate before touching the filesystem.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const file = path.join(PAPERS_DIR, `${slug}.mdx`);
  if (!fs.existsSync(file)) return null;
  return parsePaperFile(file);
}

export function getAllTags(): string[] {
  const tags = new Set<string>();
  for (const p of getAllPapers()) p.meta.tags.forEach((t) => tags.add(t));
  return [...tags].sort();
}

/** Prev/next published papers relative to `slug` in newest-first order. */
export function getAdjacentPapers(slug: string): {
  prev: PaperMeta | null; // older
  next: PaperMeta | null; // newer
} {
  const all = getAllPapers();
  const i = all.findIndex((p) => p.meta.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return {
    next: i > 0 ? all[i - 1].meta : null,
    prev: i < all.length - 1 ? all[i + 1].meta : null,
  };
}

function parsePaperFile(filePath: string): Paper {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  const parsed = paperMetaSchema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid frontmatter in ${path.relative(process.cwd(), filePath)}:\n${issues}`
    );
  }

  const meta: PaperMeta = {
    ...parsed.data,
    slug: parsed.data.slug ?? path.basename(filePath, ".mdx"),
    readingTime: readingTime(content).text,
  };

  return { meta, content };
}
