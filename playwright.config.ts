// playwright.config.ts
// Browser tests (`npm run test:e2e`) against a production build of the site, served by
// `next start` on 127.0.0.1:4310 (never port 3000, where an unrelated server may run).
//
// Parallelism: tests in one file run in order in one worker (fullyParallel is off), and
// each browser project is its own unit, so with three workers each browser has one page
// open at a time. In Firefox and WebKit the sandbox frame shares the page's thread, so a
// checks run stalls that page for seconds; several such pages at once on one laptop, next
// to the server, risk timeouts that say nothing about the site.

import { defineConfig } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:4310";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 3,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: { baseURL: BASE_URL },
  webServer: {
    command: "npm run build && npx next start -H 127.0.0.1 -p 4310",
    url: `${BASE_URL}/drills`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
