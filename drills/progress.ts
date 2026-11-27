// drills/progress.ts
// Per-browser progress for the /drills section: which drills were completed (and on
// which local calendar date), which had their solution revealed, the daily streak and
// "today's drill". Pure functions over a plain value; useProgress.ts persists it in
// localStorage under PROGRESS_KEY. Nothing here talks to a server.
//
// Stored data is untrusted: parseProgress validates it and treats anything that does
// not match the schema exactly as empty progress. It never throws.

import { z } from "zod";

export interface DrillRecord { completedOn: string | null; revealed: boolean }
export interface DrillProgress { version: 1; drills: Record<string, DrillRecord> }
export type DrillStatus = "todo" | "done" | "done-with-help";

export const PROGRESS_KEY = "drills:progress:v1";
export const EMPTY_PROGRESS: DrillProgress = Object.freeze({
  version: 1,
  drills: Object.freeze({}),
}) as DrillProgress;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Splits a `YYYY-MM-DD` string into numbers, or null when it is not a real calendar date. */
function dateParts(value: string): [number, number, number] | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return [year, month, day];
}

const LocalDateSchema = z.string().refine((s) => dateParts(s) !== null, "not a YYYY-MM-DD date");

const ProgressSchema = z.object({
  version: z.literal(1),
  drills: z.record(
    z.string(),
    z.object({ completedOn: LocalDateSchema.nullable(), revealed: z.boolean() }),
  ),
});

/** Reads stored progress; null, unparsable or invalid data gives EMPTY_PROGRESS. */
export function parseProgress(raw: string | null): DrillProgress {
  if (raw === null) return EMPTY_PROGRESS;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return EMPTY_PROGRESS;
  }
  const result = ProgressSchema.safeParse(json);
  return result.success ? result.data : EMPTY_PROGRESS;
}

/** The stored record for a slug, ignoring anything inherited from Object.prototype. */
function recordFor(p: DrillProgress, slug: string): DrillRecord | undefined {
  return Object.hasOwn(p.drills, slug) ? p.drills[slug] : undefined;
}

function withRecord(p: DrillProgress, slug: string, record: DrillRecord): DrillProgress {
  return { ...p, drills: { ...p.drills, [slug]: record } };
}

/** Marks a drill completed on `today`. A drill already completed keeps its first date. */
export function markCompleted(p: DrillProgress, slug: string, today: string): DrillProgress {
  const current = recordFor(p, slug);
  if (current?.completedOn) return p;
  return withRecord(p, slug, { completedOn: today, revealed: current?.revealed ?? false });
}

/** Records that the solution was revealed. Revealing after completing changes nothing. */
export function markRevealed(p: DrillProgress, slug: string): DrillProgress {
  const current = recordFor(p, slug);
  if (current?.completedOn || current?.revealed) return p;
  return withRecord(p, slug, { completedOn: null, revealed: true });
}

export function drillStatus(p: DrillProgress, slug: string): DrillStatus {
  const record = recordFor(p, slug);
  if (!record?.completedOn) return "todo";
  return record.revealed ? "done-with-help" : "done";
}

/** The first drill, in the given order, that is not completed; null when all are. */
export function todaysDrill(orderedSlugs: string[], p: DrillProgress): string | null {
  return orderedSlugs.find((slug) => !recordFor(p, slug)?.completedOn) ?? null;
}

/** How many of the listed drills are completed. Records for other slugs are ignored. */
export function completedCount(orderedSlugs: string[], p: DrillProgress): number {
  return orderedSlugs.filter((slug) => Boolean(recordFor(p, slug)?.completedOn)).length;
}

/** The local calendar date one day before `date` (both `YYYY-MM-DD`). */
function dayBefore(date: string): string {
  const parts = dateParts(date);
  if (!parts) return "";
  const [year, month, day] = parts;
  return localDate(new Date(year, month - 1, day - 1));
}

/**
 * Consecutive days, ending today or yesterday, with at least one completion.
 * A streak whose latest day is before yesterday is over, so it counts 0.
 */
export function streak(p: DrillProgress, today: string): number {
  const days = new Set<string>();
  for (const record of Object.values(p.drills)) {
    if (record.completedOn) days.add(record.completedOn);
  }
  let day = days.has(today) ? today : dayBefore(today);
  let count = 0;
  while (days.has(day)) {
    count += 1;
    day = dayBefore(day);
  }
  return count;
}

/** The local calendar date of `d` as `YYYY-MM-DD`. */
export function localDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${String(d.getFullYear()).padStart(4, "0")}-${month}-${day}`;
}
