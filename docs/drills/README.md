# Drills: authoring guide

The `/drills` section holds ten React review drills. Each drill is a short, broken React
program (the starter) with a brief, hints, a solution and an explanation. Nothing here is
released: the section lives on the unmerged local branch `drills-content` until the
Drillbox runner integration plan adds the in-browser workspace.

Specs and plan:

- Drills design: `docs/drills/specs/2026-11-19-react-drills-design.md`
- Code runner design (not built yet): `docs/drills/specs/2026-11-19-code-runner-design.md`
- Plan for this content and the pages: `docs/drills/plans/2026-11-19-drills-content-and-pages.md`

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

## Built-page check

`npm run test:drills-pages` inspects the built HTML of `/drills` and each drill page. It
needs a build first (`npm run build`). `npm run check` runs the build and then this check,
and ends with `drills pages: 11 OK` (the index plus ten drills).

## Styles

All drills CSS is scoped under the `.drills` root class in `app/drills/drills.css`, with no
`border-radius`, no blurred shadows, colours only from the Sweetie-16 tokens, and body
prose and code never in pixel type. `drills/styles/scoping.test.ts` and
`drills/styles/tokens.test.ts` enforce this.

## Not released

No navigation link and no sitemap entry exist for `/drills`. View the pages with
`npm run dev`. The branch is never pushed or merged by this plan; both belong to the
Drillbox runner integration plan.
