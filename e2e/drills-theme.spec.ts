// e2e/drills-theme.spec.ts
// Browser tests for the hybrid 8-bit skin of the workspace on /drills/<slug>
// (app/drills/workspace-theme.css): computed colours, fonts and sizes of the workspace's
// parts after a checks run, the site's own element rules kept out of it, the four fonts
// loaded, the focus ring, the stacked narrow layout, and two screenshots for the visual
// review (docs/drills/workspace-visual-review.md).
//
// Fonts come from next/font, whose generated family names differ per build, so a family is
// checked by comparing an element's computed `font-family` with that of a probe element
// styled with the same next/font variable inside the `.drills` root.

import { expect, test, type Locator, type Page } from "@playwright/test";
import { openDrill, previewFrame, runChecks } from "./helpers";

const SLUG = "like-button";
const STARTER_SUMMARY = "1 OF 4 PASSING";

/** The palette values the skin must produce, as browsers report them. */
const CYAN = "rgb(115, 239, 247)";
const SLIME = "rgb(167, 240, 112)";
const NIGHT = "rgb(26, 28, 44)";
const DIM = "rgb(51, 60, 87)";
const DEEP = "rgb(41, 54, 111)";
const MIST = "rgb(148, 176, 194)";
const GOLD = "rgb(255, 205, 117)";
const FAIL_RED = "rgb(177, 62, 83)";

/** The site's font variables (set on `.drills` by app/drills/layout.tsx) and their faces. */
const FONTS = {
  pixel: { variable: "--font-pixel", fallback: "monospace", face: /Press.Start.2P/i },
  label: { variable: "--font-mono", fallback: "monospace", face: /VT323/i },
  body: { variable: "--font-sans", fallback: "system-ui, sans-serif", face: /IBM.Plex.Sans/i },
  code: { variable: "--font-code", fallback: "monospace", face: /IBM.Plex.Mono/i },
} as const;

type FontName = keyof typeof FONTS;

/** Where the screenshots are written (gitignored; Playwright clears it at each run). */
const SCREENSHOT_1280 = "test-results/drill-1280.png";
const SCREENSHOT_390 = "test-results/drill-390.png";

test.use({ viewport: { width: 1280, height: 900 } });

/** The computed values of `properties` for the one element `locator` matches. */
async function computed<K extends keyof CSSStyleDeclaration & string>(
  locator: Locator,
  properties: readonly K[],
): Promise<Record<K, string>> {
  await expect(locator).toHaveCount(1);
  return locator.evaluate((element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, String(style[name])]));
  }, properties) as Promise<Record<K, string>>;
}

/**
 * The computed `font-family` of a probe span inside `.drills` whose family is
 * `var(<variable>), <fallback>`: what an element using that font variable reports.
 */
async function probeFamily(page: Page, font: FontName): Promise<string> {
  const { variable, fallback } = FONTS[font];
  return page.evaluate(
    ({ variable, fallback }) => {
      const root = document.querySelector(".drills");
      if (root === null) throw new Error(".drills root not found");
      const probe = document.createElement("span");
      probe.style.fontFamily = `var(${variable}), ${fallback}`;
      root.append(probe);
      const family = getComputedStyle(probe).fontFamily;
      probe.remove();
      return family;
    },
    { variable, fallback },
  );
}

/** The first family of a computed `font-family`, without quotes. */
function firstFamily(fontFamily: string): string {
  return (fontFamily.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
}

/** Asserts that `locator` is set in `font` at `size`. */
async function expectFont(locator: Locator, font: FontName, size: string): Promise<void> {
  const style = await computed(locator, ["fontFamily", "fontSize"]);
  const expected = await probeFamily(locator.page(), font);
  expect(firstFamily(expected)).toMatch(FONTS[font].face);
  expect(style.fontFamily).toBe(expected);
  expect(style.fontSize).toBe(size);
}

function button(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

function panelBar(page: Page, name: string): Locator {
  return page.locator("h3.dbx-panel-bar").getByText(name, { exact: true });
}

function checkResults(page: Page): Locator {
  return page.getByRole("list", { name: "Check results", exact: true });
}

test("Computed styles after RUN CHECKS", async ({ page }) => {
  await openDrill(page, SLUG);
  expect(await runChecks(page)).toBe(STARTER_SUMMARY);

  const title = page.getByRole("heading", { name: "WORKSPACE", exact: true });
  await expectFont(title, "pixel", "13px");
  expect(await computed(title, ["color", "marginTop", "marginBottom"])).toEqual({
    color: CYAN,
    marginTop: "0px",
    marginBottom: "0px",
  });

  const run = button(page, "RUN CHECKS");
  expect(
    await computed(run, ["backgroundColor", "color", "fontSize", "borderTopLeftRadius"]),
  ).toEqual({
    backgroundColor: SLIME,
    color: NIGHT,
    fontSize: "11px",
    borderTopLeftRadius: "0px",
  });
  expect((await run.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  expect((await computed(button(page, "RESET CODE"), ["backgroundColor"])).backgroundColor).toBe(DIM);

  for (const name of ["LIVE PREVIEW", "CHECKS"]) {
    const bar = panelBar(page, name);
    await expectFont(bar, "label", "20px");
    expect(
      await computed(bar, ["color", "marginTop", "marginBottom", "marginLeft", "height"]),
    ).toEqual({
      color: MIST,
      marginTop: "0px",
      marginBottom: "0px",
      marginLeft: "0px",
      height: "52px",
    });
  }

  const tab = page.getByRole("tab", { selected: true });
  await expectFont(tab, "label", "20px");
  expect((await computed(tab, ["backgroundColor"])).backgroundColor).toBe(DEEP);

  await expectFont(page.locator(".dbx-editor .cm-content"), "code", "14px");

  const results = checkResults(page);
  const pass = results.locator(".dbx-badge").getByText("PASS", { exact: true });
  await expectFont(pass, "pixel", "10px");
  expect((await computed(pass, ["color"])).color).toBe(SLIME);
  const fail = results.locator(".dbx-badge").getByText("FAIL", { exact: true }).first();
  expect((await computed(fail, ["backgroundColor"])).backgroundColor).toBe(FAIL_RED);

  await expectFont(results.locator(".dbx-check-name").first(), "body", "16px");

  // The list itself keeps the demo's 8 px by 16 px padding, not the site's 1.4rem `ul`
  // padding; its rows have no left padding, no bullets and no `li` margin.
  expect(
    await computed(results, ["listStyleType", "paddingLeft", "marginTop", "marginBottom"]),
  ).toEqual({ listStyleType: "none", paddingLeft: "16px", marginTop: "0px", marginBottom: "0px" });
  const rows = results.locator("li.dbx-check");
  expect(await rows.count()).toBe(4);
  for (const row of await rows.all()) {
    expect(await computed(row, ["listStyleType", "paddingLeft", "marginBottom"])).toEqual({
      listStyleType: "none",
      paddingLeft: "0px",
      marginBottom: "0px",
    });
  }

  const summary = page.locator(".dbx-checks-summary");
  expect(await computed(summary, ["color", "marginBottom"])).toEqual({
    color: GOLD,
    marginBottom: "0px",
  });

  const status = page.locator("p.dbx-status[role=status]");
  await expect(status).toHaveAttribute("data-state", "done");
  expect(await computed(status, ["width", "height", "overflow"])).toEqual({
    width: "1px",
    height: "1px",
    overflow: "hidden",
  });
});

test("Fonts loaded", async ({ page }) => {
  await openDrill(page, SLUG);
  // IBM Plex Sans first appears in the check names.
  expect(await runChecks(page)).toBe(STARTER_SUMMARY);
  const sizes: Record<FontName, string> = { pixel: "13px", label: "20px", body: "16px", code: "14px" };
  for (const font of Object.keys(FONTS) as FontName[]) {
    const family = firstFamily(await probeFamily(page, font));
    const result = await page.evaluate(
      async ({ family, size }) => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await document.fonts.ready;
        // check() is also true for a family with no face at all, so the faces are read too.
        const loaded = [...document.fonts].some(
          (face) => face.family.replace(/^["']|["']$/g, "") === family && face.status === "loaded",
        );
        return { check: document.fonts.check(`${size} "${family}"`), loaded };
      },
      { family, size: sizes[font] },
    );
    expect(result, `${font}: ${family}`).toEqual({ check: true, loaded: true });
  }
});

test("Focus ring", async ({ page }) => {
  await openDrill(page, SLUG);
  const run = button(page, "RUN CHECKS");
  // A key press first, so the focus that follows counts as keyboard focus in every browser.
  await page.keyboard.press("Shift");
  await run.focus();
  expect(await run.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  expect(await computed(run, ["outlineStyle", "outlineWidth", "outlineColor"])).toEqual({
    outlineStyle: "solid",
    outlineWidth: "2px",
    outlineColor: GOLD,
  });
});

test("Narrow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDrill(page, SLUG);
  await expect(previewFrame(page).getByText("Liked: 0", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const edges = await page.evaluate(() =>
    [".dbx-editor-panel", ".dbx-preview-panel", ".dbx-checks-panel"].map((selector) => {
      const panel = document.querySelector(selector);
      if (panel === null) throw new Error(`${selector} not found`);
      const { top, left } = panel.getBoundingClientRect();
      return { top, left };
    }),
  );
  const [editorPanel, previewPanel, checksPanel] = edges;
  expect(previewPanel.top).toBeGreaterThan(editorPanel.top);
  expect(checksPanel.top).toBeGreaterThan(previewPanel.top);
  expect(previewPanel.left).toBe(editorPanel.left);
  expect(checksPanel.left).toBe(editorPanel.left);
});

/**
 * A full-page screenshot at the current width. A full-page capture leaves the sandboxed
 * preview frame blank when it is below the fold in Chromium, so the capture is taken with
 * the viewport as tall as the laid-out page (taller than the starting viewport, so the
 * layout does not change).
 */
async function fullPageScreenshot(page: Page, path: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const width = page.viewportSize()?.width ?? 0;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width, height });
  await expect(previewFrame(page).locator("body")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(height);
  // CodeMirror measures its lines only once the editor is in view; until then the line
  // numbers sit at its default 14px line height. Wait for the measured layout.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const number = document.querySelectorAll(".dbx-editor .cm-lineNumbers .cm-gutterElement")[1];
        const line = document.querySelector(".dbx-editor .cm-line");
        if (!number || !line) return false;
        return Math.abs(number.getBoundingClientRect().height - line.getBoundingClientRect().height) < 1;
      }),
    )
    .toBe(true);
  await page.screenshot({ path, fullPage: true });
}

test("Screenshots (chromium only)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "the screenshots are taken once, in Chromium");
  const liked = previewFrame(page).getByText("Liked: 0", { exact: true });

  await openDrill(page, SLUG);
  await expect(liked).toBeVisible({ timeout: 10_000 });
  expect(await runChecks(page)).toBe(STARTER_SUMMARY);
  await fullPageScreenshot(page, SCREENSHOT_1280);

  await page.setViewportSize({ width: 390, height: 844 });
  await openDrill(page, SLUG);
  await expect(liked).toBeVisible({ timeout: 10_000 });
  await fullPageScreenshot(page, SCREENSHOT_390);
});
