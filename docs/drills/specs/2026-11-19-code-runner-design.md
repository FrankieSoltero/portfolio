# Drillbox — open-source in-browser exercise runner — design

Date: 2026-11-19
Status: awaiting approval
Working name: `drillbox` (to be checked for availability before the repo is created)

This spec lives in the portfolio repo until the runner's own repo exists, then moves there.
Companion spec: `2026-11-19-react-drills-design.md` (the portfolio section that uses it).

## Goal

A small open-source library that runs a coding exercise safely in the browser: it
compiles the learner's files, shows a live preview, runs hidden behaviour checks, and
reports results. First consumer is the portfolio's `/drills`. It is designed so the same
runner can load inside DoomSkill's React Native WebView for exercise cards.

Decisions already made by the owner:

- Custom runner, not Sandpack.
- Open source: own public GitHub repo, MIT; npm publication later.
- Build order: runner and portfolio first; DoomSkill integration gets its own design.
- Pluggable languages from day one. Target languages: JS/TS, Python, Java, C, C++, C#,
  Rust, Swift and Go.
- **Hybrid execution.** JS/TS/React and Python run in the browser in v1. The other seven
  cannot realistically be compiled in a browser, so they run through a "remote adapter"
  against an execution server. v1 defines that contract; the server is a separate later
  project.
- The execution server, when built, is reachable only by signed-in DoomSkill users. The
  public portfolio offers only the in-browser languages.
- The package contains a headless engine and an optional workspace UI.

## Shape

One package with subpath exports, so each app pulls only what it uses:

| Import | Runs where | What it is |
|---|---|---|
| `drillbox` | host page | Engine: creates the sandbox, sends runs, receives results. No UI, no framework |
| `drillbox/frame` | build time | Builds the self-contained sandbox page for a chosen set of language adapters |
| `drillbox/js` | inside sandbox | JavaScript/TypeScript adapter, with an optional React pack |
| `drillbox/python` | inside sandbox | Python adapter (Pyodide, in a worker) |
| `drillbox/remote` | host page | Remote adapter: sends a run to an execution server the host app configures |
| `drillbox/workspace` | host page | React UI: editor, file tabs, preview, checks panel, console |
| `drillbox/schema` | anywhere | Exercise format: zod schema, TypeScript types, generated JSON Schema |

```
host page (portfolio, or a WebView's page)
  drillbox/workspace  ──uses──▶  drillbox (engine)
                                     │  JSON messages, versioned
                                     ▼
                        sandbox frame (isolated)
                          frame runtime ── language adapter (js) ── learner code + checks
```

## Exercise format

Plain JSON so it can be stored in a database or produced by a backend:

```ts
interface Exercise {
  id: string;
  language: string;                 // "js" | "python" | "java" | "c" | "cpp" | "csharp" | "rust" | "swift" | "go"
  files: Record<string, {
    code: string;
    readOnly?: boolean;             // shown, not editable (e.g. the fake API)
    hidden?: boolean;               // not shown in the editor
  }>;
  entry: string;                    // file the preview renders
  checks: Record<string, string>;   // check files; never shown to the learner
  options?: Record<string, unknown>; // adapter-specific, e.g. { react: true }
}
```

`drillbox/schema` exports the zod schema and a generated JSON Schema file, so DoomSkill's
Python backend can validate the same format with Pydantic later.

## Sandbox and security

The runner executes code the host did not write, so the sandbox is the core of the design.

- **Web:** an `<iframe sandbox="allow-scripts">` with no `allow-same-origin`. The frame
  gets an opaque origin: it cannot read the host's DOM, cookies or `localStorage`.
- **No network from learner code.** The frame page carries a Content-Security-Policy with
  `connect-src 'none'` and no remote script sources. Exercises that need data ship a fake
  API as one of their files. There is no opt-in to real network access in v1.
- **Large runtimes are handed in, not fetched.** A runtime such as Pyodide is downloaded
  by the host from its own origin and transferred into the frame as bytes, so the frame
  keeps `connect-src 'none'`. The CSP allows WebAssembly compilation.
- **Self-contained frame page.** One HTML file with its scripts inlined; nothing loads
  from a CDN at run time. This is also what lets it load as a WebView page offline.
- **No secrets enter the frame.** The engine only sends exercise files and receives
  results.
- **Message validation.** The host accepts messages only from its own frame's window and
  validates every message against the protocol schema. The frame validates what it
  receives. Unknown or malformed messages are dropped.
- **Runaway code.** The JS adapter inserts loop guards at compile time, so an infinite
  loop throws "loop ran too long" instead of freezing the tab. The engine also runs a
  watchdog: if the frame stops answering pings, it is destroyed and the run reports a
  timeout.
- **Threat model stated in the README:** protects the host page and its storage from
  exercise code, and blocks network access. It is not a defence against a browser
  sandbox escape.

Real-browser tests (Playwright) assert the isolation: code in the frame that tries to
read `parent.document`, `localStorage`, or call `fetch` must fail.

## Protocol

Transport-agnostic JSON messages, each carrying a protocol version and a `runId`.

| Direction | Messages |
|---|---|
| host → frame | `init`, `run` (files, entry, mode: `preview` or `checks`), `stop`, `ping` |
| frame → host | `ready` (version, adapters), `compile-error` (file, line, column, message), `runtime-error`, `console`, `check-result` (name, status, message, duration), `run-complete` (summary), `pong` |

- The host ignores any message whose `runId` is not the current run, so a slow earlier
  run can never overwrite a newer one.
- **Transports:** v1 ships the iframe transport. The transport is an interface
  (`send`, `onMessage`, `dispose`), and the frame runtime talks to "the host" through a
  small bridge rather than `parent.postMessage` directly, so a React Native WebView
  transport can be added in the DoomSkill phase without changing the frame.

## Language adapters

An adapter is the only language-specific code. It runs inside the frame:

```ts
interface LanguageAdapter {
  id: string;
  load(): Promise<void>;                              // boot any heavy runtime
  compile(files, options): CompileResult;             // diagnostics with file and line
  preview?(compiled, mountEl): () => void;            // optional; returns a disposer
  runChecks(compiled, checks, report): Promise<void>; // reports each check as it finishes
}
```

- The frame page is built for a chosen adapter set
  (`buildFrame({ adapters: [js(), python()] })`), so a host ships only the languages it
  needs.
- There are two kinds of adapter. **Frame adapters** (above) run inside the sandbox.
  **Remote adapters** run on the host side and forward the run to an execution server.
  Both report through the same result events, so the workspace and any host UI treat
  every language the same way.

| Language | v1 | How |
|---|---|---|
| JS/TS, React | Built | Frame adapter |
| Python | Built | Frame adapter (Pyodide) |
| Java, C, C++, C#, Rust, Swift, Go | Contract only | Remote adapter; needs the execution server (later project) |

### JS/TS adapter

- **Compile:** Sucrase turns TypeScript and JSX into JavaScript. There is no type
  checking in the browser.
- **Modules:** exercise files import each other by relative path. Beyond that, only
  "provided modules" resolve. The React pack provides `react`, `react-dom/client`,
  `react/jsx-runtime` and Testing Library. There is no npm install in v1.
- **Preview:** renders the entry file's default export into the visible frame.
- **Checks:** a small built-in test runner with `describe`, `it`, `expect`,
  `beforeEach`, `afterEach` and async tests, imported from `drillbox:test`. Checks run
  against a fresh copy of the modules, in a container separate from the visible preview.
- **Same checks run in vitest.** A shim maps `drillbox:test` to vitest, so an exercise's
  checks can be verified in CI outside the browser (the drill fairness test).
- **No fake timers or module mocking in v1.** Exercises control time and data through
  their own fake API file.

### Python adapter

- **Runtime:** Pyodide, self-hosted by the host app and loaded on first use (a download
  of several megabytes, cached by the browser afterwards). Standard library only in v1;
  no `pip` packages.
- **Runs in a worker inside the frame,** so a runaway program is stopped by terminating
  the worker; no loop guards are needed.
- **No preview pane.** Python exercises show program output and check results.
- **Checks:** Python files containing `test_*` functions that use plain `assert`. A small
  bootstrap collects and runs them and reports each one. The same files run under pytest
  in CI.

### Remote adapter and the execution server

- `drillbox/remote` takes an **executor** supplied by the host app: a function that sends
  `{ language, files, checks, limits }` to a server and yields the standard result
  events. The library contains no server address and no credentials; the host app
  provides the URL and the signed-in user's token.
- v1 fixes the request and result shapes and tests the adapter against a fake executor.
  It does **not** build a server, so the seven compiled languages do not run until the
  server project exists.
- **The execution server is a separate project with its own security design.** Settled
  now: it is reachable only by signed-in DoomSkill users, never anonymously, and the
  public portfolio does not use it. To be designed then: the isolation engine (an
  existing open-source one such as Piston is the likely base), resource limits, rate
  limits, hosting and cost, and the check format for each language.

## Workspace UI

`<Workspace exercise={...} />` from `drillbox/workspace`:

- CodeMirror 6 editor with file tabs; read-only files are marked.
- Preview pane (the sandbox frame), checks panel, console panel. Languages without a
  preview show the output panel in its place.
- Compile and runtime errors show inline with file and line.
- Themed entirely through CSS custom properties, with all class names prefixed, so a host
  can restyle it and its styles cannot leak.
- It stores nothing. It emits `onChange` (files) and `onResult` (check results); the host
  decides what to persist.

v1 ships the React component. A standalone page build of the workspace, for WebViews, is
part of the DoomSkill phase.

## Repository

- New repo at `~/Desktop/Code/drillbox`, public on GitHub under the owner's account, MIT.
  Creating the public repo and pushing are confirmed with the owner at that step.
- TypeScript strict, vitest for units, Playwright for sandbox tests in a real browser,
  ESLint, Prettier, GitHub Actions CI, gitleaks.
- README with the threat model, `SECURITY.md`, `CONTRIBUTING.md`,
  `Docs/mistakes-and-fixes.md`.
- **Distribution before npm:** CI attaches the packed tarball to each tagged GitHub
  release; the portfolio pins a release URL in `package.json`. npm publication happens
  once the interface has settled.

## Spikes that come first

Three unknowns are settled before the main build:

1. An assertion library that bundles cleanly for the frame with Jest-style matchers and
   DOM matchers (first choice: Jest's standalone `expect` with `jest-dom`; fallback:
   Chai with `chai-dom`).
2. Sandbox isolation and the CSP behave as specified in Chrome, Safari and Firefox.
3. Loop guards plus the watchdog recover from `while (true) {}` without freezing the
   host page.
4. Pyodide boots inside the sandboxed frame, in a worker, from bytes transferred by the
   host, under the frame's CSP.

## Milestones

| # | Milestone | Result |
|---|---|---|
| 0 | Spikes | The three unknowns above answered |
| 1 | Engine | Protocol, iframe transport, frame runtime, adapter interface, isolation tests |
| 2 | JS/TS adapter | Compile, modules, preview, checks, React pack, loop guards |
| 3 | Workspace | Editor, preview, checks and console panels, theming |
| 4 | Portfolio `/drills` | The companion spec, built on a tagged release |
| 5 | Python adapter | Pyodide in a worker, checks, output panel |
| 6 | Remote adapter | Executor contract, result mapping, fake-executor tests |
| 7 | DoomSkill | Separate design: WebView transport, standalone workspace page, card integration |
| 8 | Execution server | Separate project and design: Java, C, C++, C#, Rust, Swift, Go for signed-in DoomSkill users |

Python and the remote adapter come after the portfolio milestone on purpose: the React
drills need neither, so the site and daily practice are not held up by them.

Drill **content** does not wait for the runner: drills are authored in the exercise
format and verified with vitest from the start, so they can be practised locally before
milestone 4.

## Defaults chosen (change any of these on approval)

- Working name `drillbox`; single package with subpath exports rather than several
  packages.
- Sucrase for compilation; CodeMirror 6 for the editor.
- No real network access and no npm dependencies inside exercises in v1.
- React 19 in the React pack.
- Python is standard library only, with no `pip` packages, in v1.
- Python and the remote adapter are built after the portfolio section is live.

## Out of scope for v1

- Running Java, C, C++, C#, Rust, Swift or Go: v1 ships only the remote adapter contract;
  the execution server is a separate project.
- Any anonymous or public endpoint that executes code.
- Type checking in the browser.
- The React Native transport and standalone workspace page (DoomSkill phase).
- npm publication.
- Collaborative editing, accounts, or server-side execution.
