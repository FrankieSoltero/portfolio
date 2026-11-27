// e2e/helpers.ts
// Playwright helpers for the drill pages: open a drill and wait for its workspace, run the
// checks and read the summary, seed and read localStorage (drafts and progress), and read
// a drill's starter and solution files from content/drills. Shared by the browser specs.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { RUN_TIMEOUT_MS } from "drillbox";
import type { DrillProgress } from "../drills/progress";

/** Where the drills' exercise files live. */
const CONTENT_DIR = join(__dirname, "..", "content", "drills");

/** Starter files the visitor cannot edit; they are never part of a draft. */
const READ_ONLY_FILES = new Set(["api.ts"]);

/** Longest wait for a checks run to end: the engine's own run limit plus a margin. */
const RUN_WAIT_MS = RUN_TIMEOUT_MS + 5000;

/** `data-state` values of the status line once a checks run has ended. */
const SETTLED_STATE = /^(done|compile-error|frozen)$/;

/** Window property the run watcher in {@link runChecks} sets once a run has started. */
const RUN_SEEN = "__drillsE2eRunSeen";

export const PROGRESS_KEY = "drills:progress:v1";

/** Every drill's slug, in alphabetical order. */
export const DRILL_SLUGS: readonly string[] = readdirSync(CONTENT_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .sort();

/** The localStorage key of a drill's draft code. */
export function draftKey(slug: string): string {
  return `drills:code:v1:${slug}`;
}

/** The `WORKSPACE` region. */
export function workspace(page: Page): Locator {
  return page.getByRole("region", { name: "WORKSPACE", exact: true });
}

/** The code editor: the textbox whose accessible name starts `Code editor`. */
export function editor(page: Page): Locator {
  return page.getByRole("textbox", { name: /^Code editor/ });
}

/** The editor's rendered lines, top to bottom. */
export function editorLines(page: Page): Locator {
  return page.locator(".dbx-editor .cm-line");
}

/** The live preview: the iframe titled `Live preview`. */
export function previewFrame(page: Page): FrameLocator {
  return page.getByTitle("Live preview", { exact: true }).contentFrame();
}

/** Opens `/drills/<slug>` and waits for the workspace and its editor. */
export async function openDrill(page: Page, slug: string): Promise<void> {
  await page.goto(`/drills/${slug}`);
  await expect(workspace(page)).toBeVisible();
  await expect(editor(page)).toBeVisible();
}

/**
 * Starts a checks run with `start` (by default a click on `RUN CHECKS`) and resolves with
 * the checks summary text once that run has ended. A watcher installed before the start
 * records the status line entering `running`, so a summary left by an earlier run is never
 * mistaken for this run's.
 */
export async function runChecks(
  page: Page,
  start?: () => Promise<void>,
): Promise<string> {
  const status = page.locator("p.dbx-status[role=status]");
  await status.evaluate((element, flag) => {
    const record = window as unknown as Record<string, unknown>;
    record[flag] = false;
    const observer = new MutationObserver(() => {
      if (element.getAttribute("data-state") === "running") {
        record[flag] = true;
        observer.disconnect();
      }
    });
    observer.observe(element, { attributes: true, attributeFilter: ["data-state"] });
  }, RUN_SEEN);

  if (start) {
    await start();
  } else {
    await page.getByRole("button", { name: "RUN CHECKS", exact: true }).click();
  }

  await expect
    .poll(() => page.evaluate((flag) => (window as unknown as Record<string, unknown>)[flag], RUN_SEEN), {
      timeout: RUN_WAIT_MS,
    })
    .toBe(true);
  await expect(status).toHaveAttribute("data-state", SETTLED_STATE, { timeout: RUN_WAIT_MS });
  return (await page.locator(".dbx-checks-summary").textContent()) ?? "";
}

/**
 * Stores `files` as the draft of `slug` (`{"version":1,"files":{...}}`). The page must
 * already be on the site; the draft is read when the workspace mounts, so reload or
 * navigate afterwards.
 */
export async function seedDraft(
  page: Page,
  slug: string,
  files: Record<string, string>,
): Promise<void> {
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: draftKey(slug), value: JSON.stringify({ version: 1, files }) },
  );
}

/** A localStorage item of the page's origin, or null when absent. */
export function storedItem(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

/** The stored progress as the site wrote it, or null when there is none. */
export async function readProgress(page: Page): Promise<DrillProgress | null> {
  const raw = await storedItem(page, PROGRESS_KEY);
  return raw === null ? null : (JSON.parse(raw) as DrillProgress);
}

/** Today's local date in the browser, `YYYY-MM-DD` (the date the site records). */
export function todayInPage(page: Page): Promise<string> {
  return page.evaluate(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${day}`;
  });
}

/** Reads `content/drills/<slug>/starter/<path>`. */
export function starterCode(slug: string, path: string): string {
  return readFileSync(join(CONTENT_DIR, slug, "starter", path), "utf8");
}

/** The editable files of a drill's starter (every starter file except read-only ones). */
function editablePaths(slug: string): string[] {
  return readdirSync(join(CONTENT_DIR, slug, "starter")).filter(
    (name) => !name.startsWith(".") && !READ_ONLY_FILES.has(name),
  );
}

/**
 * The drill's editable files with the solution laid over the starter: path → code for
 * every editable starter file, taken from `solution/` where it has that file.
 */
export function solutionFiles(slug: string): Record<string, string> {
  const solutionNames = new Set(readdirSync(join(CONTENT_DIR, slug, "solution")));
  const files: Record<string, string> = {};
  for (const path of editablePaths(slug)) {
    const variant = solutionNames.has(path) ? "solution" : "starter";
    files[path] = readFileSync(join(CONTENT_DIR, slug, variant, path), "utf8");
  }
  return files;
}
