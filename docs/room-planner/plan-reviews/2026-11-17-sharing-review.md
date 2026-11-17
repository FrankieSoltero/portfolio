# Plan review: sharing (slice F)

- **Plan:** `docs/room-planner/plans/2026-11-17-sharing.md`
- **Date:** 2026-11-17
- **Verdict:** PASS, round 2 (overall 86.9; gate: overall 85, every dimension 80, no blocking violation)
- **Round 1:** BLOCKED at 83.5 (D3 78, D6 78, two blocking violations). Fixed in the plan; two owner decisions taken on 2026-11-17 (a pasted link reloads the page; a failed live-check row is fixed and rerun before the work is done).
- Round 2 re-graded only the dimensions that failed round 1 (D3, D6); the others carry their round 1 scores.

| Dimension | Weight | Round 1 | Round 2 |
|---|---|---|---|
| D1 Task decomposition & ordering | 15 | 86 | 86 |
| D2 Verifiability | 20 | 86 | 86 |
| D3 Spec fidelity & traceability | 20 | 78 | 88 |
| D4 Concreteness | 15 | 88 | 88 |
| D5 Risk & reversibility | 15 | 86 | 86 |
| D6 Consistency & completeness | 15 | 78 | 87 |

## Round 2 findings (all minor; none blocking)

- **D3 Spec fidelity & traceability** (mechanical): The spec already names `shareLink.ts` and already gives 699,053 and 524,288 (spec lines 90-96). Drop those two clauses from the Spec row, or say they are verified unchanged. Also stop citing "Reading the link", "Making the link" and "Preview" as sections when they are bold bullet labels under "How it works".
  - Quote: `**Spec:** "Known limits", "How it works" (the corrections below), "Testing".  ...  | Spec | "How it works" names 'room-planner/services/shareLink.ts'; "Reading the link" gives the limits as 699,053 ch`
- **D3 Spec fidelity & traceability** (owner-decision): The spec defines canKeep=false only for blocked storage. Mark the own-plan-newer + ok-link row as a plan-added decision and get the owner's approval, as was done for the hashchange row. Do the same for treating an `invalid` saved plan like no saved plan, and for `clearShareFragment()` on an unreadable link, which the spec does not state.
  - Quote: `'sharedPreview = { canKeep: false }'; 'saveBlocked' not set yet; fragment left |`
- **D3 Spec fidelity & traceability** (owner-decision): These user-facing strings and failure paths are not in the spec. Cite them as an explicit plan-added failure path, or add them to the spec through the owner-approved amendment route.
  - Quote: `- Status messages ('role="status"' inside the panel): 'This plan is too large to share as a link.';   'The picture could not be made.'`
- **D3 Spec fidelity & traceability** (mechanical): The spec requires "at the size it has on screen (times the screen's pixel ratio, at most 2)". No task states or tests the pixel-ratio cap. Add a row saying the existing renderer sizing already applies it, or add a test or live-row check.
  - Quote: `copies the WebGL canvas onto a new 2D canvas of the same pixel width and height`
- **D6 Consistency & completeness** (mechanical): State the pass rule for the seen/not-seen lists in S11, S12 and S13, for example 'row passes only if every listed element is recorded as seen'. As written, one reader can mark the row passed with an element 'not seen' and another can mark it failed.
  - Quote: `saved to the shots folder, and the recorder lists each of these as seen or not seen in the image: door swing arc, window line, every item's name, a length on every wall, the credit line`
- **D6 Consistency & completeness** (mechanical): Say what happens to a reported pinned test outside the list: the controller either amends the task's 'Test changes' line before the implementer edits it, or the implementer stops and reports. Without this, executors will differ on whether to edit it.
  - Quote: `Before finishing, each implementer greps the tests for every function, constant and string the task adds or changes and reports any pinned test outside its list.`
- **D6 Consistency & completeness** (mechanical): Reword the Architecture line to 'No new storage key or format is added', because Task 2 and the Rollback note both say opening or keeping a shared plan writes the visitor's saved plan under the existing key.
  - Quote: `Nothing new is stored and no request is made.`

## How the round 2 findings are handled

The plan is not edited after the pass. The executor carries these as notes in the task briefs:

- S11 to S13 pass only if every listed element is recorded as seen.
- An implementer who finds a pinned test outside its task's list stops and reports; the controller amends the plan before the test is edited.
- "Nothing new is stored" in the Architecture paragraph means no new storage key or format.
- The 3D picture's size follows the renderer's existing sizing (pixel ratio capped by `CONFIG.maxPixelRatio`, 2); live row S12 checks the size.
- Task 7 verifies the spec's limits and module path are already correct, and changes them only if they are not.
- Plan-added behavior not in the spec, to be written into the spec in Task 7 and listed for the owner in the pull request: a saved plan from a newer planner plus a good link gives a preview without "Keep this plan"; an unreadable saved plan is treated like no saved plan; the `#plan=` part is removed after an unreadable link; the two status messages `This plan is too large to share as a link.` and `The picture could not be made.`

## Round 1 findings

- **D1 Task decomposition & ordering** (minor, mechanical): Split Task 2 into 2a (shareLocation.ts service plus the uiStore sharedPreview flag), 2b (load path and hashchange handling in usePlanPersistence), 2c (keepSharedPlan and leaveSharedPlan), and 2d (the PlanSection note and Reset-plan change). Each gets its own verify and commit. Task 2 is the largest and highest-risk unit, so splitting also makes review and revert finer-grained.
- **D1 Task decomposition & ordering** (minor, mechanical): Split the generic `download.ts` service (canvasToPng, downloadBlob) into its own task, and split the registry plus ThreeView/SceneRenderer capture from the BlueprintView capture. Alternatively, keep the task but note why it is a single unit.
- **D1 Task decomposition & ordering** (minor, mechanical): Split SharePanel (header wiring, copy and download actions) from SharedBanner (App wiring, keep/leave buttons). They share only the CSS files and can go in sequence. SharedBanner needs only Task 2, so it can be scheduled earlier.
- **D2 Verifiability** (minor, mechanical): Replace 'looked at' and 'readable' with checkable assertions. For example: PNG dimensions, the longer side is exactly 2000 px, the image is not a single colour (sample N pixels and require more than one distinct colour), and the 3D image contains non-background pixels. Or list the specific elements to be ticked off against the screenshot.
- **D2 Verifiability** (minor, mechanical): Add a plan-level done criterion, e.g. 'Done when: S1-S18 all recorded as passed, `npm run check` exits 0 with First Load JS in 104-107 kB, and no failed rows remain'. Also state what happens when a row fails (fix and re-run, not just record).
- **D2 Verifiability** (minor, mechanical): Name the check. Either a unit or CSS assertion, or an explicit pointer to live row S18 with a measurable condition such as document.documentElement.scrollHeight <= window.innerHeight at 1440x900. Task 5's own Verify does not cover this behavior.
- **D3 Spec fidelity & traceability** (minor, owner-decision): The spec says "Every wall carries its length, in the plan's units." Either drop the 12 in threshold or record it as an owner-approved spec amendment, and list it in Task 7's spec edits.
- **D3 Spec fidelity & traceability** (minor, mechanical): The spec greys the button "when the 3D view is not on screen or the browser has no WebGL and the blueprint view is not shown either". The plan greys it only for layout `tabs` and tab `2d`. Add the no-WebGL and no-blueprint case to the disable row with a test, or state why the "picture could not be made" fallback replaces it.
- **D3 Spec fidelity & traceability** (minor, mechanical): The spec says decoding "refuses text longer than ... (524,288 characters)". Add the amended limit (699053 data chars, 524288 bytes of JSON) to Task 7's spec corrections. It currently only lists the services/domain wording.
- **D3 Spec fidelity & traceability** (minor, owner-decision): The spec has no hashchange-reload behavior. Mark it as an addition awaiting owner approval, or add it to the spec amendments in Task 7.
- **D3 Spec fidelity & traceability** (minor, owner-decision): The spec says "Reset plan" is unchanged. Get the owner to approve the change and record it in the spec, or remove it.
- **D3 Spec fidelity & traceability** (minor, owner-decision): The spec says the own plan loads "with a notice" and states no suppression rule. Document the precedence rule as a spec amendment, or show the invalid-link notice always.
- **D3 Spec fidelity & traceability** (minor, mechanical): The spec's Testing section requires round-trips for the starting plan, an L-shape, angled walls and 40 pieces. Task 1's table lists only the non-Latin case, so add these round-trip rows. Task 7 also cites no spec section.
- **D4 Concreteness** (minor, mechanical): List the class names or selectors to add (for example the banner bar, the share panel and the greyed-out button) and their key declarations, or mark the styling as (proposed - confirm). Also state which file receives which rules. Task 5 currently says only that the layout must not gain a page scrollbar.
- **D4 Concreteness** (minor, mechanical): Confirm each Modify test path exists (`ls`) and drop this clause, or list the actual file names. Several Modify test files may not exist, such as `room-planner/components/bars.test.tsx` and `room-planner/components/Stage/BlueprintView.test.tsx`.
- **D4 Concreteness** (minor, mechanical): Give the plan-review file's path. Also say what "anything parked in the ledger" refers to by naming the ledger file, since neither is a named file.
- **D5 Risk & reversibility** (minor, owner-decision): Decide and state what happens to an unreadable own saved plan (`invalid`) when a share link opens. Either keep the raw invalid string recoverable (do not overwrite it, or copy it to a backup key), or state explicitly that an unreadable plan is discarded and why that is acceptable. Add a behavior-table row and a test for it.
- **D5 Risk & reversibility** (minor, mechanical): Correct the rollback note. Task 2 and `keepSharedPlan` do write the saved plan (`store.save(sharedDoc)`, `store.save(currentDocument())`) in the same storage key and format (version 3). State that a revert leaves any plan saved this way in place and still readable by the old code, and that no data migration is needed because the format is unchanged.
- **D6 Consistency & completeness** (blocking, mechanical): Replace the eyeball check with an objective one. For example: decode the PNG and assert the width and height equal the canvas size, and that at least N percent of sampled pixels differ from the `tokens.bg` colour. Or name the exact features (floor, bed, desk) that must be visible and have the recorder list each one as seen or not seen. Apply the same change to S13.
- **D6 Consistency & completeness** (minor, mechanical): State measurable expectations. For example: dimensions equal the blueprint canvas size, the background pixel equals `tokens.bg`, and a named list of elements is present in the image.
- **D6 Consistency & completeness** (minor, mechanical): Define readable objectively. For example: each listed element is present at its expected pixel position, or every text string is legible at 100 percent zoom. List the strings to find.
- **D6 Consistency & completeness** (minor, mechanical): Assert numerically, for example `document.documentElement.scrollHeight <= innerHeight` and that the stage element's bottom edge equals the viewport height. Apply the same assertion to the Task 5 App row.
- **D6 Consistency & completeness** (blocking, owner-decision): Add a plan-level done section: 'Done = Tasks 1 to 7 verifications pass, `npm run check` exits 0, and S1 to S18 all PASS'. State what happens when a live-check row fails (the plan is not done, a fix task is added, and the council re-reviews). Today a failing row is recorded but does not block Task 7, the docs task.
- **D6 Consistency & completeness** (minor, mechanical): Name the ledger by file path, or say it is the lean-sdd ledger and give its location. Say how parked items are identified.
- **D6 Consistency & completeness** (minor, mechanical): Say which amendments are meant, and how the executor finds them: the ledger entries, or the diff between the spec's behavior and the final tests. Make the Spec row's verification checkable.
- **D6 Consistency & completeness** (minor, mechanical): Give the plan review file's path, or say it is not yet created and who writes it. Task 7's verify says 'every link resolves to a file in the repo', which cannot hold for an unnamed file.
