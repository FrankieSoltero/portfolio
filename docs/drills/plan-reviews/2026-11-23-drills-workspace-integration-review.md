# Plan review: drills workspace integration

Plan: `docs/drills/plans/2026-11-23-drills-workspace-integration.md`
Date: 2026-11-23

## Verdict: PASS (round 2, overall 86.9)

Gate: overall at least 85, every dimension at least 80, no blocking violation, no ungradable dimension. Structural pre-pass (plan-graph): 0 blocking, 0 warnings in both rounds.

| Dimension | Weight | Round 1 | Round 2 | Skeptic misses |
|---|---|---|---|---|
| D1 Task decomposition & ordering | 15 | 86 | 86 (carried) | 0 |
| D2 Verifiability | 20 | 86 | 86 (carried) | 0 |
| D3 Spec fidelity & traceability | 20 | 86 | 86 (carried) | 0 |
| D4 Concreteness | 15 | 87 | 87 (carried) | 1 |
| D5 Risk & reversibility | 15 | 89 | 89 (carried) | 0 |
| D6 Consistency & completeness | 15 | 79 | 88 | 0 |
| **Overall** | 100 | **85.6 (BLOCKED: D6 below 80)** | **86.9 (PASS)** | |

Round 2 re-graded only D6, the one dimension below the floor; the others carry their round 1 scores.

## Round 1 findings (all minor; none blocking)

### D1 Task decomposition & ordering: 86

- (mechanical) "| 7. Workspace on the drill page | `drills/components/WorkspaceHost.tsx`, ... `app/drills/[slug]/page.tsx`, `app/drills/[slug]/page.test.ts`, `scripts/drills-pa": Split Task 7 into (a) WorkspaceHost (draft load/save + auto-complete), (b) DrillWorkspace (dynamic import + error boundary), (c) page wiring with badges, auto-done note and built-page check changes. Each becomes a separately verifiable commit.
- (mechanical) "| 9. Workspace skin | `app/drills/workspace-theme.css`, `app/drills/layout.tsx`, `drills/styles/scoping.test.ts`, `e2e/drills-theme.spec.ts`, `docs/drills/works": Split the CSS theme and its computed-style spec from the visual-review document and screenshots, or at least separate the leak-prevention overrides into their own task.
- (mechanical) "| 10. Navigation, quest card, sitemap | `public/index.html`, `app/sitemap.ts`, `scripts/drills-pages-check.mts` | 7 | standard |": Split home-page nav and quest card from the sitemap and its built-sitemap check, or justify the bundling as one 'discoverability' unit.
- (mechanical) "| 6. Progress display | ... `app/drills/drills.css` | 4 | standard |": Task 6 changes the drill index and styles that Task 7 also edits. The table covers this in the Shared writes note, so it is a minor point. Task 6 does not depend on 5. Task 6 could be moved after Task 4 without any other change.

### D2 Verifiability: 86

- (mechanical) "| Other pages' bundles | `next build` route table | `/drills` and `/papers` first-load sizes do not grow by more than 5 kB from before this task (record both ta": Add to Task 7's Verify line a command that captures the baseline and after route-table sizes, such as `npx next build | grep -E ' /(drills|papers) '`, and an explicit pass condition: size delta <= 5 kB. The 'before' figure should be recorded before the task starts.
- (mechanical) "**Verify:** `npx vitest run drills app/drills` → all pass; `npm run check` → exit 0 with `drills pages: 11 OK`.": Either list the bundle-size check in Verify, or mark the hydration row as 'verified in Task 8' and exclude it from Task 7's done criteria. The hydration row currently has a unit-test proxy, but it is not named in Verify.
- (mechanical) "| Home page in a browser | the controller opens `/` in the built site after this task | the `DRILLS` link is in the navigation and leads to `/drills`; the quest": Add a Playwright check (or a grep on the built `public/index.html` plus a one-line e2e) for the DRILLS nav link and quest card. Alternatively, put the manual step in the Verify line with explicit observable assertions.
- (mechanical) "The controller looks at both screenshots and the review file before telling the owner the page is ready to look at. The verdict on the look is the owner's.": State that Task 9 is done when the Verify commands pass. Make the owner's visual sign-off a separate, non-gating post-plan step. The review file's differences column is subjective, but its row count is checked, which is acceptable.
- (mechanical) "**Verify:** `npx vitest run drills/components drills/styles` → all pass; `npm run check` → exit 0 (the built index page still passes `test:drills-pages`).": The Styles row (exact px, colours, box-shadow) has no test. Task 9's theme spec covers only the workspace. Add a stylesheet assertion in `drills/styles` or a computed-style e2e check for the badge and status values, or drop the exact values as non-verified.
- (mechanical) "**Verify:** `grep -c "^## " docs/drills/README.md` → at least 6 more than before the task (report both numbers); `git log --oneline 0f9f6f7..HEAD --grep '^fix' ": Give the command that counts the rows added in mistakes-and-fixes.md, for example a before and after `grep -c '^|'` difference. Also add a plan-level done criterion.
- (mechanical) "Spec coverage": Add a short 'Plan done when' section: all eleven tasks committed, `npm run check` exit 0, `caffeinate -dimsu npm run test:e2e` 0 failed, and port 4310 free. Currently the plan has per-task checks but no plan-level done statement.

### D3 Spec fidelity & traceability: 86

- (mechanical) "Spec: `docs/drills/specs/2026-11-19-react-drills-design.md` (approved 2026-11-19)": The spec file reads `Status: awaiting approval`. Either update the spec's status line to record the approval, or cite where the approval is recorded. Otherwise drop the claim.
- (owner-decision) "1. **Checks do not run when the drill loads.** The spec says they do.": The spec line `checks also run when the drill loads` is deliberately dropped. The plan discloses this and routes it to the owner, which mitigates it. Get the owner's confirmation before execution, or add an auto-run-on-load task for Chromium. Until then the spec's behaviour has no covering task. The spec-coverage row says only `deviation 1`.
- (mechanical) "| 9. Workspace skin | `app/drills/workspace-theme.css`, `app/drills/layout.tsx`, `drills/styles/scoping.test.ts`, `e2e/drills-theme.spec.ts`, `docs/drills/works": Task 9's pixel-exact computed-style spec, screenshots and an eleven-row visual-review document go beyond the spec's one line on theming. They are not listed under `Added by this plan, not in the spec`. List them there, or trace them to the cited mockup and say where that approval lives.
- (mechanical) "**Added by this plan, not in the spec:** browser tests with Playwright (the spec lists unit tests only); the auto-done sentence under the hints (it is in the ap": The list is incomplete. Add Task 4's shared progress store rewrite, Task 11's README and security docs, the `ProgressBadges` shown in the drill-page header, the 5 kB bundle-growth budget, and Task 9's visual-review doc. For the `approved mockup` claim, name the file that holds it, because the spec does not mention a mockup.
- (mechanical) "| Draft code under `drills:code:v1:<slug>`; `Reset code` clears it | 3, 7, 8 |": The spec-coverage table is requirement-to-task only. Tasks 4, 9 and 11 have no spec citation of their own in their task bodies. Add a one-line `Traces to:` under each task header, as Task 4's `Why` already partly does.

### D4 Concreteness: 87

- (mechanical) "Modify: `package.json`, `package-lock.json`, `.gitignore`, `eslint.config.mjs`": State the exact change to `eslint.config.mjs` (for example the ignore or globals entry for `e2e/` and `playwright.config.ts`). Task 8 only specifies the `lint` script change in `package.json`.
- (mechanical) "carried over with `.theme-8bit` replaced by `.drills` and font names replaced by the variables above; nothing from the `.demo-*` shell": Inline the override rules, or list their selectors and key properties. The executor currently has to read `~/Desktop/Code/drillbox/demo/theme-8bit.css` and decide which rules count as overrides.
- (mechanical) "the stylesheet restores the workspace's own margins, sizes, fonts, colours, list styles and focus outline wherever a `.drills <element>` rule would otherwise wi": List the selectors and properties to reset (for example `.drills .dbx-workspace h2`, `ol`, `li`, `pre`, `:focus-visible`), or say the executor derives them from the computed-style table and may add rules until it passes.
- (mechanical) "type a comment line into the editor, wait for the save, reload": Give the exact text typed (for example `// my note`) and the wait (a poll on `localStorage` for the key, or a fixed ms).
- (mechanical) "the file's header comment names the drills section": Give the exact comment text to add to `app/sitemap.ts`.
- (mechanical) "| Site rules do not leak in | `app/drills/drills.css` styles bare elements under `.drills` (`h2`, `h3`, `p`, `ol`, `li`, `a`, `pre`, `:focus-visible`, `::select": List the reset selectors and their values for workspace-theme.css (for example `.drills .dbx-workspace h2, .drills .dbx-workspace h3 { margin: 0; font: inherit; color: inherit }`, `.drills .dbx-workspace ol { list-style: none; padding-left: 0 }`, and so on for p, li, a, pre, :focus-visible, ::selection), or name the exact Drillbox demo rules to copy for each element.
- (mechanical) "| Header | drill page header | `ProgressBadges` with every drill's slug in order, to the right of the title block (wraps below it on narrow screens) |": In Task 7, name the wrapper element and class for the header row (for example `.drills .drills-page-header` around the title block and `ProgressBadges`), give the layout rule (display flex, flex-wrap wrap, justify-content space-between, align-items, gap value) that goes in app/drills/drills.css, give the breakpoint or wrap condition for 'wraps below it on narrow screens', and say where the slug list comes from (`getAllDrills().map(d => d.slug)` in app/drills/[slug]/page.tsx).

### D5 Risk & reversibility: 89

- (mechanical) "Rollback: each task is one commit; undo with `git revert <sha>`, newest first. A revert of Task 1 also reverts `package-lock.json` (run `npm ci` after). `public": Add a per-task rollback note for the two steps with effects beyond the working tree. Task 2 changes served response headers, so state that reverting it also needs the stale `public/drillbox/frame.html` removed or rebuilt. Task 10 changes the live home page and sitemap, so state that reverting it removes the nav item, quest card and sitemap URLs once deployed.
- (mechanical) "This repository is public, so pushing the branch makes Drillbox's built code public (it is MIT-licensed and meant to be open source). Nothing is pushed by this ": Add a pre-push gate for the owner, either as a Task 11 verify step or as a note to `lean-finishing`. The gate would re-run the `/Users/` and secrets grep on the committed tarball and check that the Drillbox repository's licence and third-party notices are present. Publishing code to a public repository cannot be undone.
- (owner-decision) "Out (not in this plan):** merging `drills-content` into `main`, pushing, deploying": Add one line saying why no feature flag is used. The reason is that the new `/drills` routes and the home-page links go live together at deploy and are reverted by reverting the merge. Alternatively, list the pre-deploy checks the owner should run: the e2e suite on the production build and a response-header check on the deployed `/drillbox/frame.html`.

### D6 Consistency & completeness: 79

- (mechanical) "`git diff --stat public/index.html` shows 2 insertions and 1 deletion at most (the `PLANNER` line gains a trailing comma)": Task 10 adds a nav item line (+1), edits the PLANNER line (+1/-1) and adds a quest line (+1). That is 3 insertions and 1 deletion at minimum, so a correct edit fails this check. Change the bound to '3 insertions and 1 deletion at most' (more if the Room Planner line also needs a comma), or state the expected line shape exactly.
- (mechanical) "`grep -c "^| " docs/drills/workspace-visual-review.md` → 13 (header, separator, eleven rows)": The Markdown separator row starts with `|-`, not `| `, so the grep counts 12 for a correct file. Use `grep -c '^|'` (13) or expect 12. Better, also state that the rows must appear in the listed order.
- (mechanical) "- Mistakes found and fixed during the work get a row in `docs/drills/mistakes-and-fixes.md`": Global Constraints say each fix gets its row in the same commit as the fix. Task 11 instead adds 'one row per `fix` commit made while executing this plan' after the fact, and no task before Task 11 lists `docs/drills/mistakes-and-fixes.md` in Files. Pick one rule. Either add the file to every task's Files and make Task 11 only verify the count, or drop the same-commit rule and say rows are batched in Task 11.
- (mechanical) "## Task Dependency Table": The plan has no plan-level done criteria section. Add one such as 'Done = Tasks 1-11 committed, each Verify line passed, `npm run check` and `caffeinate -dimsu npm run test:e2e` exit 0 on the final commit, and the controller's screenshot review file exists'. Without it two readers could disagree on whether the plan is finished.
- (mechanical) "| Narrow | 390 × 844 | no sideways page scroll; editor, preview and checks stack |": Task 9's Narrow row names no check for 'stack'. Specify one, for example that the bounding-box `y` of editor, preview and checks strictly increases and `scrollWidth <= 390`. The Task 9 review file's 'differences from the approved mockup' column is likewise unfalsifiable beyond its row count. State that it is informational and that only the row count is gated.
- (mechanical) "**Exact values:** the frame page's own policy, for the test above to find, begins `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'`.": No test case above this line looks for that string. The Task 2 'Built file' case only checks that a CSP meta tag exists. Add the `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'` prefix to the Built file expectation, or drop the sentence.

## What was changed after round 1

Mechanical fixes applied to the plan: the home-page diff count (3 insertions, 1 deletion); the table-row grep for the visual review file; one rule for where mistakes are recorded (task reports, written up in Task 11); a "Plan done when" section with the pre-push checks and the reason no feature flag is used; a measurable "stacked" check for the narrow layout; the frame policy prefix tied to a test; the spec's approval recorded accurately; the full list of additions beyond the spec; "Traces to" lines for Tasks 4, 9 and 11; exact typed text and wait in the draft test; the exact sitemap comment; the drill header wrapper and its layout rule; the overrides block boundary and how reset rules are derived; route-table evidence for the bundle limit; style assertions for the badges; greps for the nav item and quest card; rollback notes for Tasks 2 and 10; `eslint.config.mjs` dropped from Task 8 (its one block already covers every TypeScript file).

Not applied: splitting Tasks 7, 9 and 10 further (D1 passed; each is one commit and one reviewable unit).

## Round 2 findings (D6: 88; minor, not applied to the plan, passed to the Task 9 implementer as context)

- The sentence "look as they do on the Drillbox demo page" is explanation only: the computed-style rows are the pass condition for the reset rules.
- Give exact computed values in two rows: check list `padding-left: 0px`; status line `width: 1px; height: 1px; overflow: hidden`.
- The overrides block has two boundary definitions (its opening comment, and "the last 140 lines"). The opening comment wins.

## Owner questions (do not block the gate)

1. Checks do not run when a drill loads (the spec says they do). Confirm, or ask for an auto-run task.
2. The other four deviations listed at the top of the plan: the vendored tarball in a public repository, the retry button's scope, check source in page data, and the quest card copy.
