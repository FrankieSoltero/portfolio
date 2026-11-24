# Drills: authoring guide

The `/drills` section holds ten React review drills. Each drill is a short, broken React
program (the starter) with a brief, hints, a solution and an explanation. Each drill page
has an in-browser workspace: the visitor edits the code, watches a live preview and runs
the drill's checks, and the drill is marked done when every check passes. The workspace is
the Drillbox package (described below). The page also renders the starter code read-only
on the server; that copy is the fallback, shown until the workspace has loaded and read
the visitor's saved code, when JavaScript is off, and next to a `RETRY` button when the
workspace fails to start. Nothing here is released yet: the section lives on the unmerged
branch `drills-content` (see "Not released" at the end).

Specs and plans:

- Drills design: `docs/drills/specs/2026-11-19-react-drills-design.md`
- Code runner (Drillbox) design: `docs/drills/specs/2026-11-19-code-runner-design.md`; the
  runner is now built in its own repository and installed here from `vendor/`
- Plan for this content and the pages: `docs/drills/plans/2026-11-19-drills-content-and-pages.md`
- Plan for the workspace: `docs/drills/plans/2026-11-23-drills-workspace-integration.md`
- How the drill page compares with the approved mockup: `docs/drills/workspace-visual-review.md`

Lessons from building it are in `docs/drills/mistakes-and-fixes.md`. Read them before
authoring a drill.

## Add a drill

1. Pick a slug matching `^[a-z0-9]+(?:-[a-z0-9]+)*$` and an unused `order` number.
2. Create the folder `content/drills/<slug>/`:

```
content/drills/<slug>/
  meta.json            title, order, summary, skills, difficulty (1-3), minutes (1-60), hints (1-5)
  brief.md             what the learner sees: the task and every string the checks rely on
  explanation.md       the lesson, shown after the solution is revealed
  starter/App.tsx      the broken program (plus api.ts where the drill needs a fake API; api.ts is read-only)
  solution/App.tsx     only the files that differ from starter/
  checks/App.test.tsx  one or more *.test.tsx check files
```

`lib/drills.ts` validates the folder (strict `meta.json`, required files) when the site
builds and when the checks run, so a missing or misspelled file fails loudly.

3. Write the checks (see the rules below), then run the fairness gate.
4. Run `npm run check` before committing.

### Rules for check files

- Imports are limited to `drillbox:test` (`describe`, `it`, `expect`, `beforeEach`,
  `afterEach`), `@testing-library/react` (`render`, `screen`, `within`, `fireEvent`, `act`,
  `waitFor`), `./App` and `./api`. No `vi.*`, no `jest.*`, no fake timers, no
  `@testing-library/user-event`.
- A check name describes behaviour, never the cause of the bug. The words `stale`,
  `mutat`, `closure`, `key`, `race`, `cleanup`, `spread` and `derive` may not appear in a
  check name. The lint matches them as substrings, so `monkey` or `embrace` fail too. The
  ban applies to check names only: a proper name the plan mandates that contains one of
  them (for example a person called Grace) is fine in a brief.
- Every check finishes in under 3000 ms, and a starter may not hang or loop without bound.
- Every user-visible string a check relies on is stated in the drill's `brief.md`.

### Planted bugs and the fairness gate

`npm run test:drills` runs every drill's checks twice, once against `starter/` and once
against `solution/`. A drill is fair when at least one check fails on the starter and
every check passes on the solution. Read that carefully:

- The gate does not check WHICH checks fail on the starter. A stub starter that renders
  nothing passes the gate. Authors and reviewers must trace each row of the plan's check
  table against the starter by hand.
- Each planted bug must turn a check red when planted alone. Copy the solution, put back
  one bug, run the drill's checks, and require a red check. A bug no check can catch by
  itself needs another assertion.
- A gate that compares two variants must be proven able to fail: run it once with a
  deliberately broken solution and watch it go red.

Run one drill's checks:

```
DRILL_SLUG=<slug> npm run test:drills
```

Run all of them with `npm run test:drills`; it prints one `fairness: <slug> OK` line per
drill and exits 1 if any drill is unfair.

## How the workspace is wired

Drillbox is a separate package that runs a coding exercise in the browser. It provides a
code editor, a live preview of the code and a checks panel, and it runs the visitor's code
inside a sandboxed iframe. The page loaded into that iframe is the *frame page*: one
self-contained HTML file that Drillbox generates. This site renders Drillbox's `Workspace`
React component (from `drillbox/workspace`) and connects it to the drill page, to the
browser's storage and to the frame page.

In the table, a *client component* is a React component that also runs in the browser. The
drill page itself is a server component, rendered to static HTML when the site is built.

| Piece | Files | What it owns |
|-------|-------|--------------|
| Drill page | `app/drills/[slug]/page.tsx` | Renders the header, the brief, the workspace section, the hints (followed by the note "The drill is marked done on its own when every check passes."), the fix behind a reveal button, and the links to the neighbouring drills. It turns the drill into Drillbox's exercise format with `toExercise` (`lib/drills.ts`, typed with Drillbox's `Exercise` type) and passes the server-rendered `STARTER CODE` section to `DrillWorkspace` as its fallback. |
| Header | `drills/components/ProgressBadges.tsx` | The drill page header holds the title and meta line (`div.drills-drill-heading`) and, to their right, the badges `STREAK: <n> DAYS` and `<done> / 10 DONE`. The `/drills` index shows the same badges, and `DrillEntryStatus` adds `DONE`, `DONE WITH HELP` or `TODAY` to each index entry. Both stay empty until stored progress has been read, so the server HTML and the first browser render match. |
| `DrillWorkspace` | `drills/components/DrillWorkspace.tsx` | Client component that renders `section.drills-section.drills-workspace`. It loads `WorkspaceHost` with `next/dynamic` and `ssr: false`, so the workspace code is fetched only by drill pages and runs only in the browser. While it loads, and in the server HTML, the section shows the fallback. An error boundary catches a failed load or a crash and shows the alert "The workspace could not start. The starter code is below; your saved code is kept.", a `RETRY` button and the fallback. `RETRY` starts a fresh import, because a rejected dynamic import otherwise stays rejected; it also gives the section `tabindex="-1"` and moves the keyboard focus to it, since the button that had the focus is gone. The section has no `tabindex` before a retry, so the server HTML is unchanged. Once loaded, `WorkspaceHost` receives the fallback as a prop, so the section never empties between the import and the draft being read. |
| `WorkspaceHost` | `drills/components/WorkspaceHost.tsx` | Client component that renders Drillbox's `Workspace` and imports `drillbox/workspace.css`. After mount it reads the saved draft (in a promise callback, which the lint rule `react-hooks/set-state-in-effect` accepts); until it has it, it shows the `fallback` prop that `DrillWorkspace` passes (the same STARTER CODE markup), or nothing when rendered without one. The fallback is a prop rather than `DrillWorkspace`'s context so that this lazily loaded module does not import the module that loads it. Then it mounts the workspace, keyed by the drill's id, with the draft as the starting code and `frameUrl` set to `/drillbox/frame.html`. Every edit is saved through the draft store. When a checks run ends with status `completed`, at least one check, and every check passing, it records the drill as completed. |
| Draft store | `drills/draft.ts` | Reads, validates, saves and clears the visitor's code for one drill (see "Storage"). |
| Progress store | `drills/progress.ts`, `drills/useProgress.ts` | `progress.ts` holds pure functions: the stored schema, "completed" and "revealed" records, the streak, today's drill and each drill's status. `useProgress.ts` is one store shared by every component on the page: `WorkspaceHost` records completion, `SolutionReveal` records that the fix was revealed, and the badges read both. Each change is applied to what storage holds at that moment. Changes made in other tabs arrive through the browser's `storage` event for the progress key and replace what this tab shows. When another tab clears all of the site's storage (an event with no key), this tab keeps showing its current progress until its next completion or reveal, which re-reads storage. Once a read or write of storage has failed, the store keeps progress in memory: later changes build on that copy without re-reading storage, so a record another tab saved is not merged in by this tab's writes (a `storage` event for the key still replaces the copy). Storage is read again only when the store is next loaded, for example after a reload. |
| Frame page | `scripts/build-drill-frame.mts`, `drills/frame.ts`, `next.config.ts` | `npm run frame` builds Drillbox's frame page with its JavaScript/TypeScript adapter and React support and writes it to `public/drillbox/frame.html` (about 1.2 MB, git-ignored). It runs automatically before `npm run build` and `npm run dev` (the `prebuild` and `predev` scripts). `next.config.ts` serves the file with a sandboxing header (see "Security"). Everything the frame needs is inside that one file, served from this site; nothing is loaded from another site. |
| Skin | `app/drills/workspace-theme.css`, `app/drills/drills.css` | The hybrid 8-bit look, set through Drillbox's `--dbx-*` custom properties, plus rules that keep `drills.css`'s element styles out of the workspace. Drill pages use a column with 1160 px of content, the mockup's (`max-width: 1208px` including 24 px side padding, because the column is border-box; `.drills:has(.drills-drill)` in `drills.css`), so the editor and the preview sit side by side on a desktop screen and stack on a narrow one. |

The checks do not run when a drill page opens; the visitor presses `RUN CHECKS` (see
"Differences from the spec"). The live preview starts by itself.

## Storage

Both stores use the visitor's browser `localStorage`. Nothing is sent anywhere: the drills
code makes no network request, and the values are only read back by this site's own pages.

| Key | Stored value | Written | Removed |
|-----|--------------|---------|---------|
| `drills:progress:v1` | `{"version":1,"drills":{"<slug>":{"completedOn":"2026-11-23","revealed":false}}}`. `completedOn` is the local calendar date the drill was first completed, or `null`. `revealed` is `true` when the fix was revealed before the drill was completed; such a drill shows `DONE WITH HELP`. | When a drill is completed or its fix is revealed. | Never by the site; only by clearing the browser's site data. |
| `drills:code:v1:<slug>` | `{"version":1,"files":{"App.tsx":"<code>"}}`: only the drill's editable files (a read-only file such as `api.ts` is never stored), each at most 200,000 characters. | Whenever the workspace reports a change to the code. An edit that makes any file longer than 200,000 characters is not saved, and the previously saved draft is left as it is; nothing tells the visitor. | When the code equals the starter again, for example after `RESET CODE` (it asks for a second click). |

- Stored values are untrusted. Every read validates them with zod. Progress that does not
  match the schema is treated as empty progress, and the next completion or reveal replaces
  it. A draft that breaks any rule (not JSON, a wrong `version`, an unknown top-level key,
  a file that is not a string or is too long) is discarded whole, and stored paths that
  are not editable files of that drill are dropped.
- Storage may be blocked or full. Every access is wrapped and nothing throws. The
  workspace keeps the code in the editor, and progress is kept in memory as described for
  the progress store above.
- The stored data is the code the visitor typed and the dates they completed drills.
  Neither is logged. There is no expiry; a visitor can remove both by clearing the site's
  data in their browser.

## Security

The code in the editor is untrusted: the visitor can type or paste anything into it. Three
layers keep it away from the site.

1. **The sandbox attribute.** Drillbox puts the code in
   `<iframe sandbox="allow-scripts" src="/drillbox/frame.html">`, without
   `allow-same-origin`. The browser then gives the frame an opaque origin (`null`): its
   code is treated as if it came from an unknown site.
2. **The response header.** `/drillbox/frame.html` is served with
   `Content-Security-Policy: sandbox allow-scripts; frame-ancestors 'self'` (in
   `next.config.ts`; the same value is `FRAME_CSP_HEADER` in `drills/frame.ts`). With it,
   the browser sandboxes the page however it is opened, even directly or inside an iframe
   without the attribute, and only pages of this site may embed it. The site-wide headers,
   including `X-Frame-Options: SAMEORIGIN`, apply to it as well; browsers that understand
   `frame-ancestors` use that instead.
3. **The frame page's own policy.** The frame page carries
   `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`.
   Inline scripts and `eval` are allowed because the frame compiles and runs the visitor's
   code; no network source is allowed. Drillbox's frame also refuses to start unless its
   own origin is opaque.

What code in the frame cannot reach: this site's `localStorage` (so neither the drafts nor
the progress), its cookies, and the drill page's DOM, because of the opaque origin; and the
network, because of the frame page's policy.

What was tested, and by which test:

| Claim | Test |
|-------|------|
| Every iframe in the workspace has `sandbox="allow-scripts"` exactly and a `src` ending in `/drillbox/frame.html`; the frame page answers 200 with the header above | `e2e/drills.spec.ts`, "Frame is sandboxed" (Chromium, Firefox, WebKit) |
| Frame code cannot read `localStorage`: a draft whose code renders `localStorage.length` shows `blocked` in the preview | `e2e/drills.spec.ts`, "Storage is out of reach" (Chromium, Firefox, WebKit) |
| `next.config.ts` serves exactly that one header on the frame page and keeps the site-wide headers | `drills/frame.test.ts` |
| The built frame page's policy starts with `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'`, and no `src` or `href` points to an `http://` or `https://` address | `drills/frame.test.ts`, "Built file" (it skips when the page has not been built yet) |
| Cookies and the parent page's DOM are out of reach; `fetch`, an image, a WebSocket, a beacon, a stylesheet and a script requested from the frame are all blocked; an unsandboxed embedding does not start | Drillbox's own browser tests (`e2e/isolation.spec.ts` in the Drillbox repository) in Chromium, Firefox and WebKit. They are not re-run in this repository. Other channels, such as WebRTC, were not tested |
| With a corrupt draft (`{not json`) and corrupt progress (`[]`) stored, the drill page falls back to the starter code and to empty progress (`0 / 10 DONE`) | `e2e/drills.spec.ts`, "Corrupt storage" (Chromium, Firefox, WebKit) |
| The parsers return no draft or empty progress for each malformed value the tests list, without throwing, and the stores do not throw when storage itself throws | `drills/draft.test.ts`, `drills/progress.test.ts`, `drills/useProgress.test.tsx` |

What is visible on purpose:

- **The check source.** The workspace needs the check files in the browser, so they are in
  the drill page's serialized props, inside `<script>` elements of the HTML. Anyone can
  read them with "view source". They stay out of the visible markup and the editor's file
  tabs; the built-page check confirms that no check file name or check name appears in the
  visible markup.
- **Results are feedback, not proof.** The checks run in the same frame as the visitor's
  code, so that code can read them and interfere with their results. A drill marked done
  only means the visitor's own browser recorded it.
- **The fix.** The solution and its explanation are in the page HTML from the start,
  hidden until `REVEAL THE FIX` is pressed.

What is not covered (from Drillbox's threat model): a browser bug that lets code escape the
iframe sandbox, and a frame that navigates itself to another address, which the policy does
not block and no test covers. Code only reaches the editor when the visitor types or pastes
it; there is no way to share a draft through a link.

The frame page is generated at build time, not committed. `npm run build` writes it first
(the `prebuild` script), and the built-page check fails with
`drills pages: FAILED /drillbox/frame.html — frame page missing; run npm run frame` when
the file is missing or empty. That check runs in `npm run check`, not on the hosting
service, so after a deploy look for the `drill frame: public/drillbox/frame.html` line in
the build log; a host that runs `next build` directly skips the `prebuild` script.

## Built-page check

`npm run test:drills-pages` inspects the built HTML of `/drills` and each drill page. It
needs a build first (`npm run build`). `npm run check` runs the build and then this check,
and ends with `drills pages: 11 OK` (the index plus ten drills). On drill pages it looks
for check file names and check names only in the visible markup: it removes every
`<script>` element from the raw HTML first and decodes HTML entities after that. It also
fails when `public/drillbox/frame.html` is missing or empty, and when the built sitemap
does not list `/drills` and every `/drills/<slug>` exactly once.

## Styles

All drills CSS is scoped under the `.drills` root class in `app/drills/drills.css`, with no
`border-radius`, no blurred shadows, colours only from the Sweetie-16 tokens, and body
prose and code never in pixel type. `drills/styles/scoping.test.ts` and
`drills/styles/tokens.test.ts` enforce this. The workspace skin,
`app/drills/workspace-theme.css`, follows the same scoping rules (the scoping test reads
both files) and is imported after `drills.css` in `app/drills/layout.tsx`.

## Browser tests

The browser tests use Playwright (`@playwright/test` 1.65.1) in Chromium, Firefox and
WebKit. On a laptop, run them with the lid open, through `caffeinate` so the machine does
not sleep:

```
caffeinate -dimsu npm run test:e2e
```

- The run builds the site (`npm run build`, which also writes the frame page) and serves it
  with `next start` on `127.0.0.1:4310`, then stops the server. Nothing may listen on port
  4310 before the run; afterwards `lsof -nP -iTCP:4310 -sTCP:LISTEN` must print nothing.
  The tests never use port 3000.
- If the browsers are missing, `npx playwright install` downloads them.
- `e2e/drills.spec.ts` covers the behaviour: the workspace, the sandbox, drafts, progress,
  corrupt storage, a clean console, the narrow layout and the keyboard. "Every starter"
  and "Every solution" run all ten drills in Chromium only; "Keyboard" is skipped in
  WebKit (see Drillbox's `docs/browser-notes.md`).
- `e2e/drills-theme.spec.ts` covers the skin and layout: computed styles, fonts, the focus
  ring, the column at 390, 900 and 1280 px wide, and, in Chromium, the screenshots
  `test-results/drill-1280.png`, `test-results/drill-390.png` and
  `test-results/drills-index-1280.png`.
- Each browser opens one page at a time. In Firefox and WebKit the frame shares the page's
  thread, so a checks run stalls that page for seconds, and several at once beside the
  server could time out for reasons unrelated to the site.

## Updating Drillbox

Drillbox is not published to npm. Its packed tarball is kept in this repository as
`vendor/drillbox-<version>-<commit>.tgz` and installed from there; `vendor/README.md`
records the source commit, the branch, the tarball's SHA-256 and the licence, and gives
the full steps. In short:

1. In a clean Drillbox checkout at the wanted commit: `npm ci`, `npm run build`,
   `npm run pack:check` (it must print `pack-check: ok (<n> files)`), `npm pack`.
2. In this repository: move the tarball into `vendor/` as
   `drillbox-0.0.0-<sha>.tgz` and run `npm install file:vendor/drillbox-0.0.0-<sha>.tgz`
   (`<drillbox>` in `vendor/README.md` stands for the path of the Drillbox checkout).
3. Delete the old tarball and update the file name, commit, branch and SHA-256 in
   `vendor/README.md`.
4. Commit the tarball, `vendor/README.md`, `package.json` and `package-lock.json`
   together. The lockfile's `integrity` hash pins the tarball's content, so `npm ci` fails
   if the file is changed without the lockfile.

Then run `npm run check` and `caffeinate -dimsu npm run test:e2e`; the "Every starter"
test must still match the counts in the workspace plan. Also compare the lockfile's `dev`
and `optional` flags with the previous version (see the lessons log).

This repository is public, so before pushing a new tarball:

- `tar -xzOf vendor/drillbox-0.0.0-<sha>.tgz | grep -c "/Users/"` prints `0` (no local
  path leaked into the package);
- `shasum -a 256 vendor/drillbox-0.0.0-<sha>.tgz` equals the SHA-256 in
  `vendor/README.md`;
- a secret scan of the branch finds nothing.

## Differences from the spec

The workspace plan made five choices that differ from the spec. Each is a default that one
commit can reverse. The owner has not answered any of them yet.

1. **Checks do not run when the drill loads.** The spec says they do. The `Workspace`
   component has no way to start a run from outside, and in Firefox and Safari the frame
   shares the page's thread, so an automatic run of a starter that loops (search-filters)
   would stall the page as it opens. Checks run when the visitor presses `RUN CHECKS`; the
   live preview still starts by itself. *Awaiting the owner's confirmation.*
2. **Drillbox is installed from a tarball committed to this repository**
   (`vendor/drillbox-0.0.0-40f9b05.tgz`), not from "a pinned release", because no release
   exists. Pushing the branch makes Drillbox's built code public (it is MIT-licensed and
   meant to be open source). *Awaiting the owner's confirmation.*
3. **The retry button covers load failures only.** The spec asks for a retry button when
   the sandbox "fails to load or times out". The page cannot recover a sandbox that froze;
   for that case the workspace shows its own alert, `The sandbox stopped responding. Close
   this tab and open the page again.` *Awaiting the owner's confirmation.*
4. **Check source is in the drill page's data** (see "Security"). It stays out of the
   visible markup and out of the editor's file tabs. *Awaiting the owner's confirmation.*
5. **The quest card's copy and its place** on the home page are the plan's wording.
   *Awaiting the owner's confirmation.*

### Differences from the approved mockup

The owner approved a mockup of the drill page on 2026-11-22.
`docs/drills/workspace-visual-review.md` compares the page with it region by region. The
known differences that remain, all awaiting the owner's ruling:

- **Header and footer text** follow the `/papers` section's chrome, not the mockup: the
  header links are 9 px (the mockup's are 11 px) with the home and `DRILLS` colours
  swapped, and the footer text is 16.8 px (the mockup's is 20 px).
- **Hints and the fix** are two titled sections stacked one under the other; the mockup has
  their two buttons and the auto-done note on one row under the checks.

## Not released

The drills section lives on the branch `drills-content`, which is not pushed or merged;
the owner decides both. The branch already links the section from the home page (a
`DRILLS` navigation item and a quest card) and lists `/drills` and every drill page in the
sitemap, so all of it goes live together when the branch is merged and deployed, and a
revert of the merge removes it together. View the pages locally with `npm run dev` (add
`-- -p <port>` to use a port other than 3000).
