// drills/draft.ts
// The visitor's edited code for one drill, kept in localStorage under
// `drills:code:v1:<slug>` so a refresh does not lose it. Stored as
// `{"version":1,"files":{...}}`; only the drill's editable paths are ever read back.
//
// Stored data is untrusted: parseDraft validates it with zod and discards the whole
// draft when anything does not match. Storage may be blocked or full: every access is
// wrapped, nothing here throws, and nothing touches `window` at import time.

import { z } from "zod";

export const DRAFT_KEY_PREFIX = "drills:code:v1:";
export const MAX_DRAFT_FILE_CHARS = 200_000;
export type DraftFiles = Record<string, string>;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const FileSchema = z.string().max(MAX_DRAFT_FILE_CHARS);

const DraftSchema = z.strictObject({
  version: z.literal(1),
  files: z.record(z.string(), FileSchema),
});

/**
 * zod's record skips a `__proto__` key without checking its value, so every own value
 * of the parsed `files` object is checked again: one bad file discards the draft.
 */
function everyFileValid(json: unknown): boolean {
  const files = (json as { files: object }).files;
  return Object.values(files).every((content) => FileSchema.safeParse(content).success);
}

/** The storage key for a slug, or null when the slug is not a valid drill slug. */
function keyFor(slug: string): string | null {
  return SLUG_PATTERN.test(slug) ? `${DRAFT_KEY_PREFIX}${slug}` : null;
}

/** True when no file is longer than MAX_DRAFT_FILE_CHARS. */
function withinLimit(files: DraftFiles): boolean {
  return Object.values(files).every((content) => content.length <= MAX_DRAFT_FILE_CHARS);
}

/** Stored text → files, keeping only `editablePaths`; null when absent, invalid or empty. */
export function parseDraft(raw: string | null, editablePaths: readonly string[]): DraftFiles | null {
  if (raw === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = DraftSchema.safeParse(json);
  if (!result.success || !everyFileValid(json)) return null;
  const stored = result.data.files;
  // No prototype, so keys such as `constructor` or `__proto__` can only be own files.
  const files: DraftFiles = Object.create(null) as DraftFiles;
  let kept = 0;
  for (const path of editablePaths) {
    if (Object.hasOwn(stored, path)) {
      files[path] = stored[path];
      kept += 1;
    }
  }
  return kept > 0 ? files : null;
}

export function loadDraft(slug: string, editablePaths: readonly string[]): DraftFiles | null {
  const key = keyFor(slug);
  if (key === null) return null;
  try {
    return parseDraft(window.localStorage.getItem(key), editablePaths);
  } catch {
    return null;
  }
}

/** Saves the files, or removes the key when every file equals `starter`. */
export function saveDraft(slug: string, files: DraftFiles, starter: DraftFiles): void {
  const key = keyFor(slug);
  if (key === null || !withinLimit(files)) return;
  const unchanged = Object.keys(files).every(
    (path) => Object.hasOwn(starter, path) && files[path] === starter[path],
  );
  try {
    if (unchanged) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify({ version: 1, files }));
    }
  } catch {
    // Storage is blocked or full: the draft lives only in the editor for this visit.
  }
}

export function clearDraft(slug: string): void {
  const key = keyFor(slug);
  if (key === null) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage is blocked: there is nothing stored to clear.
  }
}
