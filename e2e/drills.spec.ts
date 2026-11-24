// e2e/drills.spec.ts
// Browser tests for the Drillbox workspace on /drills/<slug> and the progress it feeds:
// the workspace and its sandboxed frame, drafts kept across reloads and cleared by a reset,
// automatic completion, the /drills index, corrupt storage, a clean console, the narrow
// layout and the keyboard path to RUN CHECKS. Every test starts with empty storage (a new
// browser context). The ten-drill sweeps run in Chromium only.

import { expect, test, type Page } from "@playwright/test";
import {
  DRILL_SLUGS,
  draftKey,
  editor,
  editorLines,
  openDrill,
  previewFrame,
  readProgress,
  runChecks,
  seedDraft,
  solutionFiles,
  starterCode,
  storedItem,
  todayInPage,
  workspace,
} from "./helpers";

/** Checks summary of each drill's starter (the table at the top of the plan). */
const STARTER_SUMMARIES: Record<string, string> = {
  "card-with-button": "2 OF 5 PASSING",
  "cart-total": "3 OF 7 PASSING",
  "click-counter": "2 OF 5 PASSING",
  "comment-threads": "1 OF 5 PASSING",
  "like-button": "1 OF 4 PASSING",
  "notes-by-id": "1 OF 4 PASSING",
  "posts-feed": "2 OF 9 PASSING",
  "profile-switcher": "2 OF 5 PASSING",
  "removable-list": "1 OF 4 PASSING",
  "search-filters": "1 OF 5 PASSING",
};

const ALL_PASSING = "ALL CHECKS PASSING";
const FRAME_PATH = "/drillbox/frame.html";
const FRAME_CSP = "sandbox allow-scripts; frame-ancestors 'self'";

/** A component that shows `localStorage.length`, or `blocked` when reading it throws. */
const STORAGE_PROBE = `export default function App() {
  return <p>{String((() => { try { return localStorage.length } catch { return "blocked" } })())}</p>;
}
`;

/** Most key presses the keyboard test may take to reach RUN CHECKS. */
const MAX_TABS = 40;

/** The `/drills` index entry whose title link is `title`. */
function indexEntry(page: Page, title: string) {
  return page
    .locator("li.drills-entry")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });
}

/** The DONE / DONE WITH HELP / TODAY status of an index entry. */
function entryStatus(page: Page, title: string) {
  return indexEntry(page, title).locator(".drills-entry-status");
}

/** Seeds the like-button solution as the draft, reloads and runs the checks. */
async function solveLikeButton(page: Page): Promise<void> {
  await seedDraft(page, "like-button", solutionFiles("like-button"));
  await page.reload();
  await expect(workspace(page)).toBeVisible();
  expect(await runChecks(page)).toBe(ALL_PASSING);
}

test("Workspace appears", async ({ page }) => {
  await openDrill(page, "like-button");

  await expect(workspace(page)).toBeVisible();
  await expect(page.getByRole("tab", { name: "App.tsx", exact: true })).toBeVisible();
  await expect(previewFrame(page).getByText("Liked: 0", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("heading", { name: "STARTER CODE" })).toHaveCount(0);
});

test("Frame is sandboxed", async ({ page }) => {
  await openDrill(page, "like-button");
  await expect(previewFrame(page).getByText("Liked: 0", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  const frames = await page.locator(".dbx-workspace iframe").evaluateAll((elements) =>
    elements.map((element) => ({
      sandbox: element.getAttribute("sandbox"),
      src: element.getAttribute("src"),
    })),
  );
  expect(frames.length).toBeGreaterThanOrEqual(1);
  for (const frame of frames) {
    expect(frame.sandbox).toBe("allow-scripts");
    expect(frame.src ?? "").toMatch(/\/drillbox\/frame\.html$/);
  }

  const response = await page.request.get(FRAME_PATH);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toBe(FRAME_CSP);
});

test("Storage is out of reach", async ({ page }) => {
  await openDrill(page, "like-button");
  await seedDraft(page, "like-button", { "App.tsx": STORAGE_PROBE });
  await page.reload();

  await expect(workspace(page)).toBeVisible();
  await expect(previewFrame(page).getByText("blocked", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

test("Starter", async ({ page }) => {
  await openDrill(page, "like-button");

  expect(await runChecks(page)).toBe("1 OF 4 PASSING");
  const progress = await readProgress(page);
  expect(progress?.drills["like-button"]?.completedOn ?? null).toBeNull();
});

test("Solve", async ({ page }) => {
  await openDrill(page, "like-button");
  const badges = page.locator(".drills-drill-header .drills-badges");
  await expect(badges.locator(".drills-badge-done")).toHaveText("0 / 10 DONE");

  await solveLikeButton(page);

  const today = await todayInPage(page);
  await expect.poll(async () => (await readProgress(page))?.drills["like-button"]).toEqual({
    completedOn: today,
    revealed: false,
  });
  await expect(badges.locator(".drills-badge-done")).toHaveText("1 / 10 DONE");
  await expect(badges.locator(".drills-badge-streak")).toHaveText("STREAK: 1 DAY");
});

test("Solve with help", async ({ page }) => {
  await openDrill(page, "like-button");
  await page.getByRole("button", { name: "REVEAL THE FIX", exact: true }).click();
  await expect.poll(async () => (await readProgress(page))?.drills["like-button"]?.revealed).toBe(
    true,
  );

  await solveLikeButton(page);

  await page.goto("/drills");
  await expect(entryStatus(page, "Like button")).toHaveText("DONE WITH HELP");
});

test("Index", async ({ page }) => {
  await openDrill(page, "like-button");
  await solveLikeButton(page);

  await page.goto("/drills");
  await expect(entryStatus(page, "Like button")).toHaveText("DONE");
  await expect(entryStatus(page, "Click counter")).toHaveText("TODAY");
  await expect(page.locator(".drills-index-header .drills-badge-done")).toHaveText("1 / 10 DONE");
});

test("Draft survives a reload", async ({ page }) => {
  await openDrill(page, "like-button");
  await editorLines(page).first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("// draft note");

  await expect
    .poll(async () => (await storedItem(page, draftKey("like-button"))) ?? "", { timeout: 5000 })
    .toContain("// draft note");
  await page.reload();

  await expect(workspace(page)).toBeVisible();
  await expect(editor(page)).toContainText("// draft note");
});

test("Reset clears the draft", async ({ page }) => {
  await openDrill(page, "like-button");
  await editorLines(page).first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("// to be reset");
  await expect
    .poll(async () => (await storedItem(page, draftKey("like-button"))) ?? "", { timeout: 5000 })
    .toContain("// to be reset");

  await page.getByRole("button", { name: "RESET CODE", exact: true }).click();
  await page.getByRole("button", { name: "CLICK AGAIN TO RESET", exact: true }).click();

  await expect(editor(page)).not.toContainText("// to be reset");
  const starterLines = starterCode("like-button", "App.tsx").split("\n").slice(0, 10);
  await expect(editorLines(page).first()).toHaveText(starterLines[0] ?? "");
  expect((await editorLines(page).allTextContents()).slice(0, 10)).toEqual(starterLines);
  await expect.poll(() => storedItem(page, draftKey("like-button"))).toBeNull();
});

test("Corrupt storage", async ({ page }) => {
  await page.addInitScript(
    ({ draft, progress }) => {
      // Also runs in the sandboxed frames, where storage throws: seed the top page only.
      if (window.top !== window) return;
      try {
        window.localStorage.setItem(draft, "{not json");
        window.localStorage.setItem(progress, "[]");
      } catch {
        // Storage blocked: nothing to seed.
      }
    },
    { draft: draftKey("like-button"), progress: "drills:progress:v1" },
  );
  await openDrill(page, "like-button");

  const starterFirstLine = starterCode("like-button", "App.tsx").split("\n")[0] ?? "";
  await expect(editorLines(page).first()).toHaveText(starterFirstLine);
  await expect(previewFrame(page).getByText("Liked: 0", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  expect(await runChecks(page)).toBe("1 OF 4 PASSING");
  await expect(page.locator(".drills-drill-header .drills-badge-done")).toHaveText("0 / 10 DONE");
});

test("Every starter", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the ten-drill sweep runs in Chromium only");
  test.setTimeout(600_000);

  const summaries: Record<string, string> = {};
  for (const slug of DRILL_SLUGS) {
    await openDrill(page, slug);
    summaries[slug] = await runChecks(page);
  }
  expect(summaries).toEqual(STARTER_SUMMARIES);
});

test("Every solution", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the ten-drill sweep runs in Chromium only");
  test.setTimeout(600_000);

  const summaries: Record<string, string> = {};
  for (const slug of DRILL_SLUGS) {
    await openDrill(page, slug);
    await seedDraft(page, slug, solutionFiles(slug));
    await page.reload();
    await expect(workspace(page)).toBeVisible();
    summaries[slug] = await runChecks(page);
  }
  expect(summaries).toEqual(Object.fromEntries(DRILL_SLUGS.map((slug) => [slug, ALL_PASSING])));

  const today = await todayInPage(page);
  const progress = await readProgress(page);
  expect(Object.keys(progress?.drills ?? {}).sort()).toEqual([...DRILL_SLUGS].sort());
  for (const slug of DRILL_SLUGS) {
    expect(progress?.drills[slug]?.completedOn, slug).toBe(today);
  }

  await page.goto("/drills");
  await expect(page.locator(".drills-index-header .drills-badge-done")).toHaveText("10 / 10 DONE");
  await expect(page.locator(".drills-entry-status.drills-status-done")).toHaveCount(10);
  await expect(page.getByText("TODAY", { exact: true })).toHaveCount(0);
});

test("Clean console", async ({ page }) => {
  const problems: string[] = [];
  const messages: string[] = [];
  page.on("console", (message) => {
    messages.push(message.text());
    if (message.type() === "error") problems.push(`console error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));

  await page.goto("/drills");
  await expect(page.locator(".drills-index-header .drills-badge-done")).toHaveText("0 / 10 DONE");
  // Let /drills finish loading, including Next's prefetches of the drill links in view: a
  // navigation that aborts them makes the page being left log "Failed to fetch RSC
  // payload" for each one (seen in WebKit and Firefox), which says nothing about either page.
  await page.waitForLoadState("networkidle");
  await openDrill(page, "like-button");
  expect(await runChecks(page)).toBe("1 OF 4 PASSING");

  expect(problems).toEqual([]);
  expect(messages.filter((text) => /hydrat/i.test(text))).toEqual([]);
});

test("Narrow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDrill(page, "like-button");
  await expect(previewFrame(page).getByText("Liked: 0", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
});

test("Keyboard", async ({ page, browserName }) => {
  test.skip(
    browserName === "webkit",
    "WebKit skips buttons on Tab (Drillbox docs/browser-notes.md)",
  );
  await openDrill(page, "like-button");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });

  const runButton = page.getByRole("button", { name: "RUN CHECKS", exact: true });
  let reached = false;
  for (let presses = 0; presses < MAX_TABS && !reached; presses += 1) {
    await page.keyboard.press("Tab");
    reached = await runButton.evaluate((button) => button === document.activeElement);
  }
  expect(reached, `RUN CHECKS not reached in ${MAX_TABS} Tab presses`).toBe(true);

  expect(await runChecks(page, () => page.keyboard.press("Enter"))).toBe("1 OF 4 PASSING");
});
