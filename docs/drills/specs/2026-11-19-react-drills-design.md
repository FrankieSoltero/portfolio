# React review drills — design

Date: 2026-11-19
Status: awaiting approval

## Goal

A public `/drills` section on the portfolio where a visitor does short "review this
buggy PR" React exercises in the browser: read a brief, fix the component in an editor,
watch a live preview, and see behaviour checks turn green. Built for one drill a day,
with progress and a streak kept in the browser.

Decisions already made by the owner:

- Lives on the Portfolio Website (this repo), public and linked from the navigation.
- Drills are done in the browser: editor, live preview, checks.
- A batch of drills is written up front; all are available; the site tracks progress.

## Routes

| Route | Rendering | Purpose |
|---|---|---|
| `/drills` | static | List of drills, today's suggested drill, streak, progress |
| `/drills/[slug]` | static shell + client workspace | One drill: brief, editor, preview, checks, hints, solution |

Both are added to `app/sitemap.ts`. A `DRILLS` link is added to the home navigation in
`public/index.html` (next to `PLANNER`) and a quest card to the `quests` array.

## Drill page

Top to bottom:

1. **Brief** — the "PR description": what the feature should do, numbered. No list of bugs.
2. **Workspace** — editor (left), live preview (right), checks panel (below).
   - Checks are named by behaviour ("comments match the clicked post"), not by cause, so
     they do not give the bug away.
   - `Run checks` button; checks also run when the drill loads.
   - `Reset code` restores the starter.
3. **Hints** — hidden one at a time behind `Reveal hint` buttons, gentle to strong.
4. **Solution** — hidden behind `Reveal the fix`: the fixed code plus a short written
   explanation of each bug and the rule to remember.

A drill is marked done automatically when every check passes. Revealing the solution
before that is recorded (`revealed: true`) and shown on the index as "done with help".

## How code runs in the browser

The workspace is **Drillbox**, the owner's open-source runner, specified in
`2026-11-19-code-runner-design.md`. Sandpack was considered and rejected by the owner in
favour of a custom runner with no third-party host.

- The portfolio installs a pinned Drillbox release and uses `drillbox/workspace`.
- Loaded with `next/dynamic` and `ssr: false`, only on `/drills/[slug]`, so no other
  page's bundle grows.
- The sandbox frame page is built at build time with the JS/TS adapter and React pack and
  served from the portfolio's own origin as a static asset. Nothing loads from a third
  party at run time.
- Themed to the site's Sweetie-16 palette through Drillbox's CSS custom properties; code
  stays in IBM Plex Mono.
- The frame is sandboxed without `allow-same-origin`, so drill code cannot read the
  portfolio's `localStorage` (including the room planner's saved plan) and cannot make
  network requests.

**Sequencing:** the route, content loader, progress tracking and drill content are built
first and do not depend on the runner. Until a Drillbox release exists, the drill page
shows the brief and starter code read-only with a "run locally" note; the workspace is
switched on when the release is pinned.

## Drill content

One folder per drill under `content/drills/<slug>/`:

| File | Purpose |
|---|---|
| `meta.json` | `title`, `order`, `summary`, `skills[]`, `difficulty` (1-3), `minutes`, `hints[]` |
| `brief.md` | The PR description shown above the workspace |
| `starter/App.tsx` | The buggy component the visitor edits |
| `starter/api.ts` | Fake API with random latency; read-only in the editor |
| `checks/App.test.tsx` | Behaviour checks; hidden from the editor file list |
| `solution/App.tsx` | The fixed component |
| `explanation.md` | Per-bug explanation shown with the solution |

`lib/drills.ts` loads and validates these at build time with zod, the same way
`lib/papers.ts` validates paper frontmatter. A malformed drill fails the build.

**Fake API, not a live one.** Each drill's `api.ts` returns canned data after a random
delay, so drills work offline and never depend on a public API. For checks, the same
module exposes a control that lets a test decide the order in which responses arrive,
which is how race conditions are checked deterministically.

Each drill folder maps directly onto Drillbox's exercise format (`files`, `entry`,
`checks`).

**Checks are restricted to a common subset:** `describe` / `it` / `expect` imported from
`drillbox:test`, Testing Library, and the drill's own API control. No `vi.*` or `jest.*`
calls. In this repo's vitest, `drillbox:test` is aliased to vitest, which is what lets
the same check file run both in the browser and in CI.

## Drill fairness test

A vitest suite walks every drill and asserts:

- the checks **fail** against `starter/` (at least one check red), and
- the checks **all pass** against `solution/`.

This runs in `npm run check`, so a drill that is unsolvable, or already solved, cannot
be published.

## Progress and pacing

Stored in `localStorage` under `drills:progress:v1`, validated with zod on load, never
sent anywhere:

```ts
interface DrillProgress {
  version: 1;
  drills: Record<string, { completedOn: string | null; revealed: boolean }>; // ISO date
}
```

- **Today's drill:** the lowest-`order` drill not yet completed.
- **Streak:** consecutive local calendar days, ending today or yesterday, with at least
  one completion. Pure function, unit tested.
- **Draft code:** the visitor's edits per drill are saved under `drills:code:v1:<slug>`
  so a refresh does not lose work. `Reset code` clears it.
- Corrupt or unreadable storage is discarded and treated as empty; the page still works
  with storage unavailable (private windows).

No accounts and no sync between devices.

## Look and feel

The section wears the **hybrid 8-bit skin used by `/papers`**: Sweetie-16 palette,
pixel-frame box-shadows, Press Start 2P for headings and badges, VT323 for metadata,
readable faces for prose and code. Styles live in `app/drills/drills.css`, scoped to a
`.drills` root so they cannot leak into the room planner or papers. Shared tokens are
reused from the papers stylesheet rather than copied.

## Initial batch (10 drills)

Ordered easy to hard; each targets 10 minutes or less except the last.

| # | Drill | Skill drilled |
|---|---|---|
| 1 | Like button | Add/remove in array state without mutating |
| 2 | Click counter | Functional updates, stale closures |
| 3 | Notes by id | Object state: add/update a key with spread |
| 4 | Card with a button | Event bubbling |
| 5 | Removable list | `key={index}` versus stable keys |
| 6 | Cart total | Derived state stored twice and drifting |
| 7 | Profile switcher | Fetch in an effect: cleanup and race condition |
| 8 | Comment threads | Race condition in a click handler: key data by id |
| 9 | Search filters | Effect dependencies and an infinite loop |
| 10 | Posts feed (capstone) | All of the above in one PR, 20-25 minutes |

The capstone is modelled on the shape of a real interview exercise but is written
fresh, with its own data and no company named.

## Defaults chosen (change any of these on approval)

- Drills are written in **TypeScript (`.tsx`)**. The browser only transpiles; it does
  not type-check.
- Section name and path: **"Drills"** at `/drills`.
- Public copy frames it as "React review drills", not as interview prep.
- Ten drills in the first batch.
- Hints and solutions are available immediately rather than locked behind attempts.
- Desktop-first: on narrow screens the workspace stacks vertically and still works, but
  is not tuned for phone editing.

## Error handling

- **Sandbox fails to load or times out:** show the starter code read-only with a message
  and a retry button; brief, hints and solution remain usable.
- **Code that does not compile or throws:** the error shows in the preview and the
  checks report as failed; the page itself never crashes. An error boundary wraps the
  workspace.
- **Unknown slug:** the existing `not-found` page.

## Testing

- `lib/drills.ts`: loader and schema, including rejection of malformed drills.
- Progress store: streak, today's drill, corrupt-storage recovery.
- Drill fairness suite (above).
- Component tests for the index page states (nothing done, some done, all done).
- `vitest.config.mts` `include` gains the drills paths; `npm run lint` gains the drills
  folders. `npm run check` must pass before commit.

## Out of scope

- Accounts, server-side progress, cross-device sync.
- In-browser type checking.
- Authoring UI; drills are added as files.
- Changes to the local `react-drills` practice project.
